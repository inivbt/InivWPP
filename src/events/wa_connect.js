/* ./src/events/wa_connect.js 
   Merged from the old connect.js + connection.js 
*/

const { 
    makeWASocket, 
    makeCacheableSignalKeyStore, 
    fetchLatestBaileysVersion, 
    Browsers, 
    DisconnectReason 
  } = require('@whiskeysockets/baileys');
  const { Boom } = require('@hapi/boom');
  const logger = require('../middlewares/logger');
  const NodeCache = require('node-cache');
  const path = require('path');
  const dotenv = require('dotenv');
  const axios = require('axios');
  const { setSock } = require('../middlewares/connection_manager');
  
  // DB usage
  const db = require('../utils/db');
  
  // For MySQL-based auth
  const { useMySQLAuthState } = require('mysql-baileys');
  
  // Our DB-based message store for poll decryption/resends
  const { getMessageFromStore } = require('../utils/message_store');
  
  // For group caching; used in groupMetadata fetch
  const groupCache = new NodeCache({
    stdTTL: 5 * 60, // 5 minutes
    useClones: false
  });
  
  // Load environment variables from ../../data/.env
  dotenv.config({ path: path.join(__dirname, '../../data/.env') });
  
  // We'll import the newly unified group/user logic for ensuring membership
  const { ensureUser, ensureGroup, ensureGroupMember, updateGroupNameIfUnknown } = require('./wa_contacts_groups');
  
  // Generate QR code in terminal
  const generateQRCode = require('../utils/qrcode');
  
  /**
   * Creates a Baileys socket instance for a given session name,
   * using MySQL-based auth state and caching.
   *
   * @param {string} sessionName
   * @returns {Promise<Object>} - The Baileys socket instance
   */
  async function connectToWhatsApp(sessionName) {
    // MySQL-based auth
    const { state, saveCreds } = await useMySQLAuthState({
      session: sessionName,
      host: 'mariadb',
      port: 3306,
      user: 'mariadbuser',
      password: 'mariadbpass',
      database: 'baileys',
      tableName: 'auth',
    });
  
    // Fetch WA version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Using WhatsApp version: ${version.join('.')}, isLatest: ${isLatest}`);
  
    const P = require('pino')({ level: 'silent' });
  
    const sock = makeWASocket({
      logger: P,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, P),
      },
      printQRInTerminal: false,
      version,
      defaultQueryTimeoutMs: undefined,
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: true,
      downloadHistory: true,
      mobile: false,
      shouldSyncHistoryMessage: () => true,
      // group metadata caching
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      // help with poll decrypt or message resend
      getMessage: async (key) => getMessageFromStore(sessionName, key),
    });
  
    // On auth state updates
    sock.ev.on('creds.update', saveCreds);
  
    // On connection update
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        generateQRCode(qr);
      }
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        logger.error(
          `connection closed for session [${sessionName}] => reason: ${reason}, reconnecting? ${shouldReconnect}`
        );
        if (shouldReconnect) {
          connectToWhatsApp(sessionName).then(realSock => { setSock(sessionName, realSock); })
          .catch(err => { logger.error(`[${sessionName}] Reconnect error: ${err.message}`); });
        }
      }
    });
  
    // On group updates
    sock.ev.on('groups.update', async (updates) => {
      for (const event of updates) {
        try {
          // refresh cache
          const metadata = await sock.groupMetadata(event.id);
          groupCache.set(event.id, metadata);
  
          // if we had 'Unknown Group' in DB, update if new name is provided
          if (event.subject) {
            await updateGroupNameIfUnknown(event.id, event.subject);
          }
        } catch (err) {
          logger.warn(`Failed to fetch groupMetadata for ${event.id}: ${err.message}`);
        }
      }
    });
  
    // On participant changes, re-fetch group metadata and ensure membership in DB
    sock.ev.on('group-participants.update', async (event) => {
      try {
        const metadata = await sock.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
  
        // Ensure the group is in DB
        const groupId = await ensureGroup(event.id, metadata.subject || 'Unknown Group');
  
        // For each participant, ensure user + membership
        for (const p of metadata.participants) {
          const userId = await ensureUser(p.id);
          await ensureGroupMember(groupId, userId);
        }
      } catch (err) {
        logger.warn(`Failed group-participants.update for ${event.id}: ${err.message}`);
      }
    });
  
    return sock;
  }
  
  module.exports = {
    connectToWhatsApp,
    groupCache,
  };
  
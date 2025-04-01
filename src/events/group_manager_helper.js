// ./src/events/group_manager_helper.js

const logger = require('../middlewares/logger');
const { setParticipantName } = require('./wa_contacts_groups');
const { getSock } = require('../middlewares/connection_manager');
const {
  extractMessageText,
  updateMessageStats,
  validateMessageLength,
} = require('../middlewares/message_functions');
const {
  isGroupMessage,
  isFromMe,
  isImageMessage,
  isVideoMessage,
  isDocumentMessage,
  isLinkMessage,
} = require('../middlewares/baileys_utils');
const path = require('path');
const { Worker } = require('worker_threads'); // Worker usage

let groupManagerWorker;

function startGroupManagerWorker() {
  if (!groupManagerWorker) {
    const workerPath = path.join(__dirname, '../workers/group_manager_helper_worker.js');
    groupManagerWorker = new Worker(workerPath);

    groupManagerWorker.on('message', (msg) => {
      logger.debug(`[group_manager_helper Worker] Message: ${JSON.stringify(msg)}`);
    });

    groupManagerWorker.on('error', (err) => {
      logger.error(`[group_manager_helper Worker] Error: ${err.message}`);
    });

    groupManagerWorker.on('exit', (code) => {
      logger.warn(`[group_manager_helper Worker] Exited with code ${code}`);
      groupManagerWorker = null;
    });

    logger.info('[group_manager_helper Worker] Spawned successfully.');
  }
}

/**
 * Generic function to handle group messages.
 * @param {Object} sock - The Baileys socket instance.
 * @param {Object} messageUpdate - The Baileys message update event.
 * @param {Function} forwardLogic - A callback that receives (msg, groupName, sender, text)
 */
async function handleGroupMessage(sock, messageUpdate, forwardLogic) {
  // Start our demonstration worker
  startGroupManagerWorker();

  try {
    const { type, messages } = messageUpdate;
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.key || !msg.message) continue;

      const from = msg.key.remoteJid;
      if (!isGroupMessage(msg)) continue; // skip if not group

      let text = extractMessageText(msg).trim();
      let timestamp = msg.messageTimestamp
        ? msg.messageTimestamp * 1000
        : Date.now();

      try {
        text = validateMessageLength(text);
      } catch (error) {
        logger.warn(`Message from ${from} exceeds length limit: ${error.message}`);
        continue;
      }

      if (!text) {
        let mediaTypes = [
          isImageMessage(msg),
          isVideoMessage(msg),
          isDocumentMessage(msg),
          isLinkMessage(msg),
        ];
        if (!mediaTypes.some(Boolean)) {
          logger.debug('No text or recognized media found in this message.');
          continue;
        }
      }

      const participantName = msg.pushName || 'Unknown User';
      await setParticipantName(msg.key.participant || from, participantName);

      let groupName = 'Unknown Group';
      try {
        const metadata = await sock.groupMetadata(from);
        groupName = metadata.subject || 'Unknown Group';
      } catch (err) {
        logger.warn(`Failed to fetch group metadata for ${from}: ${err.message}`);
      }

      let logMsg = `[GROUP]\n[${groupName}]\n[${participantName}](${(msg.key.participant || from).split('@')[0]})\n\n${text}`;

      await updateMessageStats(sock, from, msg.key.participant || from, text, timestamp, groupName);

      if (!isFromMe(msg) && typeof forwardLogic === 'function') {
        await forwardLogic(msg, groupName, (msg.key.participant || from), logMsg);
      }

      logger.debug(logMsg);
    }
  } catch (error) {
    logger.error(`Error processing incoming group message: ${error.message}`);
  }
}

module.exports = { handleGroupMessage };

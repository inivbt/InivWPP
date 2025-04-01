// ./src/utils/message_store.js
/**
 * This module provides a database-based store for Baileys WAMessage objects,
 * but offloads the DB operations to a worker to avoid blocking the main thread.
 *
 * Steps to Use:
 *  1. Call `startDBWorker()` once during startup to initialize the worker thread.
 *  2. Call `ensureMessagesTable()` (it sends the command to the worker).
 *  3. In your "messages.upsert" event, call `storeMessageInDB(sessionName, fullWAMessage)`.
 *  4. Baileys calls `getMessageFromStore(sessionName, key)` automatically for message retries/poll decryption.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const logger = require('../middlewares/logger');

let dbWorker;

/**
 * Starts the worker thread that will handle DB operations for messages.
 */
function startDBWorker() {
  if (!dbWorker) {
    const workerPath = path.join(__dirname, '../..', 'src/workers/db_worker.js');
    dbWorker = new Worker(workerPath);

    dbWorker.on('message', (msg) => {
      if (msg.status === 'error') {
        logger.error(`[message_store Worker] Error in action "${msg.action}": ${msg.error}`);
      } else {
        logger.debug(`[message_store Worker] Action "${msg.action}" completed successfully.`);
      }
    });

    dbWorker.on('error', (err) => {
      logger.error(`[message_store Worker] Worker Error: ${err.message}`);
    });

    dbWorker.on('exit', (code) => {
      logger.error(`[message_store Worker] Exited with code ${code}`);
      dbWorker = null;
    });
  }
}

/**
 * Sends a message to the worker thread and returns a promise with the result.
 */
function postWorkerMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!dbWorker) {
      return reject(new Error('dbWorker is not initialized.'));
    }
    const request = { action, data };

    const onMessage = (msg) => {
      if (msg.action === action) {
        dbWorker.off('message', onMessage);
        if (msg.status === 'ok') {
          resolve(msg.result || null);
        } else {
          reject(new Error(msg.error || 'Unknown worker error'));
        }
      }
    };

    dbWorker.on('message', onMessage);
    dbWorker.postMessage(request);
  });
}

/**
 * Creates the 'baileys_messages' table if not existing.
 */
async function ensureMessagesTable() {
  await postWorkerMessage('ensureMessagesTable');
}

/**
 * Stores a full Baileys WAMessage object in the DB by sending it to the worker.
 */
async function storeMessageInDB(sessionName, waMessage) {
  try {
    if (!waMessage?.key?.id || !waMessage.key.remoteJid) {
      return;
    }

    const remoteJid = waMessage.key.remoteJid;
    const messageId = waMessage.key.id;
    const fromMe = !!waMessage.key.fromMe;
    const messageTimestamp = waMessage.messageTimestamp
      ? waMessage.messageTimestamp * 1000
      : Date.now();
    const messageJson = JSON.stringify(waMessage);

    await postWorkerMessage('storeMessageInDB', {
      sessionName,
      remoteJid,
      messageId,
      fromMe,
      messageTimestamp,
      messageJson
    });
  } catch (error) {
    logger.error(`[storeMessageInDB] Worker call failed: ${error.message}`);
  }
}

/**
 * Retrieves a stored message from DB to help Baileys with poll/event decryption or message retries.
 */
async function getMessageFromStore(sessionName, key) {
  try {
    if (!key?.id || !key.remoteJid) {
      return null;
    }
    const remoteJid = key.remoteJid;
    const messageId = key.id;

    const messageJson = await postWorkerMessage('getMessageFromStore', {
      sessionName,
      remoteJid,
      messageId
    });

    if (messageJson) {
      return JSON.parse(messageJson);
    }
    return null;
  } catch (error) {
    logger.error(`[getMessageFromStore] Worker call failed: ${error.message}`);
    return null;
  }
}

module.exports = {
  startDBWorker,
  ensureMessagesTable,
  storeMessageInDB,
  getMessageFromStore
};

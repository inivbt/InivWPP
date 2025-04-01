// ./src/workers/db_worker.js
/**
 * This worker handles database operations for messages to avoid blocking the main thread with DB I/O.
 *
 * ACTIONS this worker supports:
 *  1) "ensureMessagesTable" -> create the 'baileys_messages' table if not exists.
 *  2) "storeMessageInDB" -> insert/update a message record in DB.
 *  3) "getMessageFromStore" -> retrieve a message record from DB.
 */

const { parentPort } = require('worker_threads');
const logger = require('../middlewares/logger');
const db = require('../utils/db');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS baileys_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_name VARCHAR(255) NOT NULL,
    remote_jid VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) NOT NULL,
    from_me BOOLEAN DEFAULT FALSE,
    timestamp BIGINT,
    message_json LONGTEXT,
    UNIQUE KEY unique_msg (session_name, remote_jid, message_id)
  )
`;

/**
 * Creates the baileys_messages table if it doesn't exist.
 */
async function ensureMessagesTable() {
  await db.execute(CREATE_TABLE_SQL);
  logger.info('[dbWorker] Ensured that "baileys_messages" table exists.');
}

/**
 * Insert or update the message in baileys_messages table.
 */
async function storeMessageInDB(params) {
  const { sessionName, remoteJid, messageId, fromMe, messageTimestamp, messageJson } = params;
  const insertQuery = `
    INSERT INTO baileys_messages
        (session_name, remote_jid, message_id, from_me, timestamp, message_json)
    VALUES
        (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        timestamp = VALUES(timestamp),
        message_json = VALUES(message_json)
  `;
  const sqlParams = [ sessionName, remoteJid, messageId, fromMe, messageTimestamp, messageJson ];
  await db.execute(insertQuery, sqlParams);
}

/**
 * Retrieve a message from DB by sessionName + key.
 */
async function getMessageFromStore(params) {
  const { sessionName, remoteJid, messageId } = params;
  const selectQuery = `
    SELECT message_json
    FROM baileys_messages
    WHERE session_name = ?
      AND remote_jid = ?
      AND message_id = ?
    LIMIT 1
  `;
  const [rows] = await db.execute(selectQuery, [sessionName, remoteJid, messageId]);
  if (rows && rows.length > 0) {
    return rows[0].message_json;
  }
  return null;
}

// Listen for messages from the parent
parentPort.on('message', async (payload) => {
  const { action, data } = payload;

  try {
    switch (action) {
      case 'ensureMessagesTable':
        await ensureMessagesTable();
        parentPort.postMessage({ status: 'ok', action });
        break;
      case 'storeMessageInDB':
        await storeMessageInDB(data);
        parentPort.postMessage({ status: 'ok', action });
        break;
      case 'getMessageFromStore':
        {
          const messageJson = await getMessageFromStore(data);
          parentPort.postMessage({ status: 'ok', action, result: messageJson });
        }
        break;
      default:
        parentPort.postMessage({ status: 'error', action, error: `Unknown action: ${action}` });
        break;
    }
  } catch (err) {
    logger.error(`[dbWorker] Error in action "${action}": ${err.message}`);
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

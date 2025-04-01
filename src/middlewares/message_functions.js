/* ./src/middlewares/message_functions.js */

const db = require('../utils/db');
const logger = require('./logger');

// We replaced group_data + user_data references with wa_contacts_groups
const { ensureGroup, ensureGroupMember, ensureUser } = require('../events/wa_contacts_groups');

const MAX_MESSAGE_LENGTH = 50000;

function extractMessageText(msg) {
  let content = msg.message;

  if (content?.ephemeralMessage) {
    content = content.ephemeralMessage.message;
  }

  if (content?.viewOnceMessage) {
    content = content.viewOnceMessage.message;
  }

  if (content) {
    if (content.conversation) {
      return content.conversation;
    }
    if (content.extendedTextMessage?.text) {
      return content.extendedTextMessage.text;
    }
    if (content.imageMessage?.caption) {
      return content.imageMessage.caption;
    }
    if (content.videoMessage?.caption) {
      return content.videoMessage.caption;
    }
    if (content.documentMessage?.caption) {
      return content.documentMessage.caption;
    }
    if (content.audioMessage?.ptt === false && content.audioMessage?.caption) {
      return content.audioMessage.caption;
    }
    if (content.replyMessage?.extendedTextMessage?.text) {
      return content.replyMessage.extendedTextMessage.text;
    }
  }

  return '';
}

function validateMessageLength(message) {
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `Message exceeds the maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return message;
}

/**
 * Updates message stats, ensures group and user, etc.
 */
async function updateMessageStats(sock, groupJid, userJid, messageText, timestamp, realGroupName) {
  try {
    // ensure group
    const groupId = await ensureGroup(groupJid, realGroupName);
    // ensure user
    const userId = await ensureUser(userJid);
    // ensure membership
    await ensureGroupMember(groupId, userId);

    // Insert or update in 'messages' table
    const sql = `
      INSERT INTO messages (group_id, user_id, message_text, last_timestamp, count, total_interval)
      VALUES (?, ?, ?, ?, 1, 0)
      ON DUPLICATE KEY UPDATE
        count = count + 1,
        total_interval = total_interval + (VALUES(last_timestamp) - last_timestamp),
        last_timestamp = VALUES(last_timestamp)
    `;
    await db.execute(sql, [groupId, userId, messageText, timestamp]);
  } catch (error) {
    logger.error(`updateMessageStats error: ${error.message}`);
  }
}

module.exports = {
  extractMessageText,
  validateMessageLength,
  updateMessageStats
};

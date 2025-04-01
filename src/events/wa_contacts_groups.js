/* ./src/events/wa_contacts_groups.js
   Merged from contacts_update.js, group_data.js, user_data.js, participant_cache.js
*/

const db = require('../utils/db');
const logger = require('../middlewares/logger');

/**
 * PARTICIPANT CACHE (in-memory)
 */
const participantCache = new Map();

/**
 * Set participant name in the local cache and update the DB
 */
async function setParticipantName(participantJid, name) {
  participantCache.set(participantJid, name);

  try {
    // ensure user
    await ensureUser(participantJid, name);
    // update user name
    await updateUserName(participantJid, name);
  } catch (err) {
    logger.error(`setParticipantName: error ensuring/updating user for ${participantJid}: ${err.message}`);
  }
}

/**
 * Baileys "contacts.update" equivalent function
 * Instead of a separate file, we unify it here.
 * 
 * Usage:
 *    sock.ev.on('contacts.update', handleContactsUpdate(sock));
 */
function handleContactsUpdate(sock) {
  return async (update) => {
    for (const contact of update) {
      const { id, notify } = contact;
      if (!id) continue;

      if (notify) {
        await setParticipantName(id, notify);
        logger.debug(`Updated participant cache: [${id}] -> ${notify}`);
      } else {
        // try from store
        try {
          if (sock?.store?.contacts && sock.store.contacts[id]) {
            const contactInfo = sock.store.contacts[id];
            const userName = contactInfo.name || contactInfo.notify || 'Unknown User';
            await setParticipantName(id, userName);
            logger.debug(`Fetched from store: [${id}] -> ${userName}`);
          } else {
            // fallback
            await setParticipantName(id, 'Unknown User');
          }
        } catch (err) {
          logger.error(`handleContactsUpdate: error for ${id}: ${err.message}`);
        }
      }
    }
  };
}

/**
 * GROUPS / USERS DB LOGIC
 */

/**
 * Ensure a group row in DB
 * @param {String} groupJid 
 * @param {String} groupName 
 * @returns groupId (int)
 */
async function ensureGroup(groupJid, groupName = 'Unknown Group') {
  try {
    const sql = 'SELECT id, group_name FROM groups WHERE group_jid = ?';
    const [rows] = await db.execute(sql, [groupJid]);

    if (rows.length > 0) {
      const existingId = rows[0].id;
      const existingName = rows[0].group_name || '';

      // if we have a better name now, update it
      if (existingName === 'Unknown Group' && groupName !== 'Unknown Group') {
        await updateGroupNameById(existingId, groupName);
      }
      return existingId;
    } else {
      // insert
      const insSql = 'INSERT INTO groups (group_jid, group_name) VALUES (?, ?)';
      const [res] = await db.execute(insSql, [groupJid, groupName]);
      return res.insertId;
    }
  } catch (err) {
    logger.error(`ensureGroup error: ${err.message}`);
    throw err;
  }
}

/**
 * If the group name in DB is "Unknown Group" and a newName is provided, update it
 */
async function updateGroupNameIfUnknown(groupJid, newName) {
  try {
    const sql = 'SELECT id, group_name FROM groups WHERE group_jid = ?';
    const [rows] = await db.execute(sql, [groupJid]);
    if (rows.length > 0) {
      const { id, group_name } = rows[0];
      if (group_name === 'Unknown Group' && newName !== 'Unknown Group') {
        await updateGroupNameById(id, newName);
      }
    }
  } catch (err) {
    logger.warn(`updateGroupNameIfUnknown error: ${err.message}`);
  }
}

async function updateGroupNameById(groupId, newName) {
  try {
    const sql = 'UPDATE groups SET group_name = ? WHERE id = ?';
    await db.execute(sql, [newName, groupId]);
    logger.debug(`Group name updated for id ${groupId} => ${newName}`);
  } catch (err) {
    logger.error(`updateGroupNameById error: ${err.message}`);
  }
}

/**
 * Ensure the membership row in group_members
 */
async function ensureGroupMember(groupId, userId) {
  try {
    const sql = 'INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)';
    await db.execute(sql, [groupId, userId]);
  } catch (err) {
    logger.error(`ensureGroupMember error: ${err.message}`);
  }
}

/**
 * Ensure a user row in DB
 * @param {String} userJid 
 * @param {String} userName 
 * @returns userId (int)
 */
async function ensureUser(userJid, userName = 'Unknown User') {
  try {
    const upsertSql = `
      INSERT INTO users (user_jid, user_name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE user_name = VALUES(user_name)
    `;
    await db.execute(upsertSql, [userJid, userName]);

    // fetch ID
    const selSql = 'SELECT id FROM users WHERE user_jid = ?';
    const [rows] = await db.execute(selSql, [userJid]);
    return rows[0]?.id;
  } catch (err) {
    logger.error(`ensureUser error: ${err.message}`);
    throw err;
  }
}

/**
 * Update user name in DB
 */
async function updateUserName(userJid, newName) {
  try {
    const sql = 'UPDATE users SET user_name = ? WHERE user_jid = ?';
    await db.execute(sql, [newName, userJid]);
  } catch (err) {
    logger.error(`updateUserName error: ${err.message}`);
  }
}

// Export all
module.exports = {
  // participant cache logic
  setParticipantName,

  // handleContactsUpdate function
  handleContactsUpdate,

  // group & user logic
  ensureGroup,
  ensureGroupMember,
  ensureUser,
  updateUserName,
  updateGroupNameIfUnknown
};

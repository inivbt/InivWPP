// ./src/utils/leads_data.js

const db = require('./db');
const logger = require('../middlewares/logger');

/**
 * Ensure the leads_responses table exists, if not create it.
 * This table tracks which leads have been responded to.
 */
async function ensureLeadsResponseTable() {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS leads_responses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_jid VARCHAR(100) NOT NULL UNIQUE,
                responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.execute(createTableQuery);
        logger.info('Ensured that leads_responses table exists.');
    } catch (error) {
        logger.error(`Error ensuring leads_responses table exists: ${error.message}`);
        throw error;
    }
}

/**
 * Check if a given user was already responded to.
 * @param {String} userJid - The JID of the user (e.g. "5511987654321@s.whatsapp.net").
 * @returns {Boolean} - True if user was responded to, otherwise false.
 */
async function isUserResponded(userJid) {
    try {
        const query = 'SELECT id FROM leads_responses WHERE user_jid = ?';
        const [rows] = await db.execute(query, [userJid]);
        return rows.length > 0;
    } catch (error) {
        logger.error(`Error checking if user responded: ${error.message}`);
        throw error;
    }
}

/**
 * Mark a user as responded by inserting them into leads_responses.
 * @param {String} userJid - The JID of the user.
 */
async function markUserResponded(userJid) {
    try {
        const query = `
            INSERT INTO leads_responses (user_jid)
            VALUES (?)
            ON DUPLICATE KEY UPDATE responded_at = CURRENT_TIMESTAMP
        `;
        await db.execute(query, [userJid]);
        logger.info(`Marked user ${userJid} as responded in leads_responses table.`);
    } catch (error) {
        logger.error(`Error marking user responded: ${error.message}`);
        throw error;
    }
}

module.exports = {
    ensureLeadsResponseTable,
    isUserResponded,
    markUserResponded
};

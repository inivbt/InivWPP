// src/middlewares/connection_manager.js

// We'll store each socket instance in a map, using the sessionName as a key.
const socksMap = new Map();

/**
 * Set the socket instance for a specific session.
 * @param {string} sessionName - Unique session identifier
 * @param {Object} socket - The Baileys socket instance
 */
function setSock(sessionName, socket) {
  socksMap.set(sessionName, socket);
}

/**
 * Get the socket instance for a specific session.
 * @param {string} sessionName - Unique session identifier
 * @returns {Object|null} - The Baileys socket instance or null if not found
 */
function getSock(sessionName) {
  return socksMap.get(sessionName) || null;
}

/**
 * Get all active sockets (if you need to iterate over all).
 * @returns {Array} - Array of socket instances
 */
function getAllSocks() {
  return Array.from(socksMap.values());
}

module.exports = {
  setSock,
  getSock,
  getAllSocks
};

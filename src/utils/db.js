// src/utils/db.js

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('../middlewares/logger');

// Load environment variables from the .env file inside /data
dotenv.config({ path: path.join(__dirname, '../../data/.env') });

/*
  Database configuration. 
  Adjust these environment variables according to your server's credentials.
*/
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'dbuser',
  password: process.env.DB_PASSWORD || 'dbpass',
  database: process.env.DB_NAME || 'test_db',

  // Pool options:
  waitForConnections: true,   // Allows the pool to queue connection requests if no connections are free
  connectionLimit: 10,        // Maximum number of connections in the pool
  queueLimit: 0               // Maximum request queue size (0 = unlimited)
};

// Create a connection pool for MySQL
const pool = mysql.createPool(dbConfig);

// Optional: track new connections or errors
pool.on('connection', (connection) => {
  logger.debug('New database connection established');
  connection.on('error', (err) => {
    logger.debug(`DB connection error: ${err.message}`);
  });
});

/**
 * Executes a SQL query with parameters, returning the result.
 * This function automatically gets a connection from the pool and releases it when done.
 * @param {String} query - The SQL query string (e.g., "SELECT * FROM table WHERE id = ?")
 * @param {Array} [params] - Parameters to safely insert into the query
 * @returns {Array} - Returns [rows, fields] from the query
 */
async function execute(query, params = []) {
  try {
    const [rows, fields] = await pool.execute(query, params);
    return [rows, fields];
  } catch (error) {
    logger.error(`Database query error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  execute,
  pool
};

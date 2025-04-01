// ./src/middlewares/logger.js
const pino = require('pino');

// Create the base pino logger
const baseLogger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname'
    }
  }
});

/**
 * Helper function to join multiple arguments into one string.
 * - If an argument is an object, JSON-stringify it.
 * - Otherwise, convert it to a string.
 * @param  {...any} args 
 * @returns {String}
 */
function formatArgs(...args) {
  return args
    .map((arg) => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    })
    .join(' '); // separate by space
}

/**
 * Our custom logger object:
 * - Wrap pino's methods so we handle multiple arguments gracefully.
 */
const logger = {
  info: (...args) => {
    baseLogger.info(formatArgs(...args));
  },
  error: (...args) => {
    baseLogger.error(formatArgs(...args));
  },
  warn: (...args) => {
    baseLogger.warn(formatArgs(...args));
  },
  debug: (...args) => {
    baseLogger.debug(formatArgs(...args));
  },
  // If you need more levels, add them here
};

module.exports = logger;

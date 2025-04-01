// ./src/utils/translation_utils.js

/**
 * Example translation utility using google-translate-api-x (não oficial, sem API key).
 * npm install google-translate-api-x
 */
const translate = require('google-translate-api-x');
const logger = require('../middlewares/logger');

/**
 * Translates any text to English using an unofficial Google Translate API
 * @param {String} text - Text to translate
 * @returns {Promise<String>} - The translated text in English
 */
async function translateToEnglish(text) {
  try {
    const res = await translate(text, { to: 'en' });
    return res.text;
  } catch (error) {
    logger.error('Erro ao traduzir texto:', error);
    // Retorna o texto original com um prefixo de falha
    return '[Translation Failed] ' + text;
  }
}

module.exports = {
  translateToEnglish,
};

// ./src/events/big_leo_handler.js
/**
 * This is a personal handler for "Big Leo."
 * Now using the new downloadAudioMessage() from baileys_utils to handle audio more cleanly.
 */

const path = require('path');
const logger = require("../middlewares/logger");
const {
  isFromMe,
  isAudioMessage,
  isGroupMessage,
  mentionAllInGroup,
  isVoiceMessage,
  editMessage,
  downloadAudioMessage,
  sendAudio, // We import the sendAudio function
} = require("../middlewares/baileys_utils");
const { extractMessageText } = require("../middlewares/message_functions");
const { translateToEnglish } = require("../utils/translation_utils");

function bigLeoHandler(sock) {
  return async (messageUpdate) => {
    const { type, messages } = messageUpdate;

    if (type !== "notify" || !messages) return;

    for (const msg of messages) {
      if (!msg.key || !msg.message) continue;
      // Only handle if the message is from me
      if (!isFromMe(msg)) continue;

      // Extract the text
      const originalText = extractMessageText(msg);

      // ==========================
      // NEW CONDITION ADDED HERE!
      // If the user typed "ok vou enviar agora, escuta tudo por favor",
      // then send 'espanhol.mp3' as PTT audio in the same chat.
      // ==========================
      if (
        originalText &&
        originalText.toLowerCase().includes('ouve ai modo hard')
      ) {
        try {
          await sendAudio(
            sock,
            msg.key.remoteJid,
            path.join(__dirname, '../../media/gaudencio-hard.mp3'),
            true // <-- ptt = true
          );
          logger.info("Sent ptt audio: gaudencio-hard.mp3");
        } catch (error) {
          logger.error("Error sending gaudencio-hard.mp3 as ptt:", error.message);
        }
        continue;
      } else if (
        originalText &&
        originalText.toLowerCase().includes('ouve ai suave')
      ) {
        try {
          await sendAudio(
            sock,
            msg.key.remoteJid,
            path.join(__dirname, '../../media/gaudencio-low.mp3'),
            true // <-- ptt = true
          );
          logger.info("Sent ptt audio: gaudencio-low.mp3");
        } catch (error) {
          logger.error("Error sending gaudencio-low.mp3 as ptt:", error.message);
        }
        continue;
      } 
      else if (
        originalText && isGroupMessage(msg) &&
        originalText.toLowerCase().includes('galera, ve ai')
      ) {
        try {
          await mentionAllInGroup(
            sock,
            msg.key.remoteJid,
            ".",
            {
              mentionInText: false}
          );
        } catch (error) {
          logger.error("Error mention all:", error.message);
        }
        continue;
      }
    }
  };
}

module.exports = { bigLeoHandler };

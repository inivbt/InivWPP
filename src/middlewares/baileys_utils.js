/* ./src/middlewares/baileys_utils.js
   Utility functions for interacting with Baileys in a structured way.
   Replaces plain console.log calls with our logger for better logging control.
   Additional English comments have been added to clarify usage.
*/

const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const tmp = require('tmp');
const { startFFmpegWorker, postFFmpegWorkerMessage } = require('../workers/ffmpeg_worker_manager');

// Our custom logger
const logger = require('../middlewares/logger');

// We import groupCache if we want to quickly access cached group metadata
// from the wa_connect module (not always strictly required here, but kept for reference).
const { groupCache } = require('../events/wa_connect');

/**
 * Checks if a given Baileys message is from a group (by analyzing JID).
 * @param {Object} msg - Baileys message object
 * @returns {boolean}
 */
function isGroupMessage(msg) {
  const from = msg?.key?.remoteJid;
  const participant = msg?.key?.participant;
  return from && from.endsWith('@g.us') && !!participant;
}

/**
 * Checks if a given Baileys message is from a private chat (direct user).
 * @param {Object} msg - Baileys message object
 * @returns {boolean}
 */
function isPrivateMessage(msg) {
  return !isGroupMessage(msg);
}

/**
 * Checks if this message was sent by the bot itself.
 * @param {Object} msg - Baileys message object
 * @returns {boolean}
 */
function isFromMe(msg) {
  return !!msg?.key?.fromMe;
}

/**
 * Checks if the message is from a standard user (ends in @s.whatsapp.net).
 * @param {Object} msg
 * @returns {boolean}
 */
function isUserMessage(msg) {
  const from = msg?.key?.remoteJid;
  return from && from.endsWith('@s.whatsapp.net');
}

/**
 * Checks if the message is broadcast.
 * @param {Object} msg
 * @returns {boolean}
 */
function isBroadcastMessage(msg) {
  const from = msg?.key?.remoteJid;
  return from && from.endsWith('@broadcast');
}

/**
 * Checks if the message is from an announcement channel (likely a group announcement).
 * @param {Object} msg
 * @returns {boolean}
 */
function isAnnouncementMessage(msg) {
  const from = msg?.key?.remoteJid;
  return from && from.endsWith('@announcement');
}

/**
 * Checks if the message is a "status" message posted to a status broadcast.
 * @param {Object} msg
 * @returns {boolean}
 */
function isStatusMessage(msg) {
  const from = msg?.key?.remoteJid;
  return from === 'status@broadcast';
}

/**
 * Checks if the message is a voice note (PTT).
 * @param {Object} msg
 * @returns {boolean}
 */
function isVoiceMessage(msg) {
  const audioMessage = msg?.message?.audioMessage;
  return audioMessage?.ptt === true;
}

/**
 * Checks if the message is a "view once" type (photo, video, or audio).
 * @param {Object} msg
 * @returns {boolean}
 */
function isViewOnceMessage(msg) {
  return !!(msg?.message?.viewOnceMessage?.message);
}

/**
 * Checks if the message is a "view once" video.
 * @param {Object} msg
 * @returns {boolean}
 */
function isViewOnceVideo(msg) {
  const viewOnce = msg?.message?.viewOnceMessage?.message?.videoMessage;
  return !!viewOnce;
}

/**
 * Checks if the message is a "view once" photo.
 * @param {Object} msg
 * @returns {boolean}
 */
function isViewOncePhoto(msg) {
  const viewOnce = msg?.message?.viewOnceMessage?.message?.imageMessage;
  return !!viewOnce;
}

/**
 * Checks if the message is a "view once" audio.
 * @param {Object} msg
 * @returns {boolean}
 */
function isViewOnceAudio(msg) {
  const viewOnce = msg?.message?.viewOnceMessage?.message?.audioMessage;
  return !!viewOnce;
}

/**
 * Checks if the message is an audio (but not PTT).
 * @param {Object} msg
 * @returns {boolean}
 */
function isAudioMessage(msg) {
  const audioMessage = msg?.message?.audioMessage;
  // ptt===true is voice note, ptt===false is standard audio
  return !!audioMessage && audioMessage.ptt === false;
}

/**
 * Checks if the message is a document.
 * @param {Object} msg
 * @returns {boolean}
 */
function isDocumentMessage(msg) {
  return !!msg?.message?.documentMessage;
}

/**
 * Checks if the message is a location message.
 * @param {Object} msg
 * @returns {boolean}
 */
function isLocationMessage(msg) {
  return !!msg?.message?.locationMessage;
}

/**
 * Checks if the message is a single contact.
 * @param {Object} msg
 * @returns {boolean}
 */
function isContactMessage(msg) {
  return !!msg?.message?.contactMessage;
}

/**
 * Checks if the message is an animated GIF (videoMessage with gifPlayback).
 * @param {Object} msg
 * @returns {boolean}
 */
function isAnimationMessage(msg) {
  const videoMessage = msg?.message?.videoMessage;
  return videoMessage?.gifPlayback === true;
}

/**
 * Checks if the message text contains a link.
 * @param {Object} msg
 * @returns {boolean}
 */
function isLinkMessage(msg) {
  const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
  if (!text) return false;
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return urlPattern.test(text);
}

/**
 * Checks if the message is a poll creation.
 * @param {Object} msg
 * @returns {boolean}
 */
function isPollMessage(msg) {
  return !!msg?.message?.pollCreationMessage;
}

/**
 * Checks if the message is an invoice.
 * @param {Object} msg
 * @returns {boolean}
 */
function isInvoiceMessage(msg) {
  return !!msg?.message?.invoiceMessage;
}

/**
 * Checks if the message is an image.
 * @param {Object} msg
 * @returns {boolean}
 */
function isImageMessage(msg) {
  return !!msg?.message?.imageMessage;
}

/**
 * Checks if the message is a video (videoMessage).
 * @param {Object} msg
 * @returns {boolean}
 */
function isVideoMessage(msg) {
  return !!msg?.message?.videoMessage;
}

/**
 * Checks if the message is a sticker.
 * @param {Object} msg
 * @returns {boolean}
 */
function isStickerMessage(msg) {
  return !!msg?.message?.stickerMessage;
}

/**
 * Checks if the message is a reaction to another message.
 * @param {Object} msg
 * @returns {boolean}
 */
function isReactionMessage(msg) {
  return !!msg?.message?.reactionMessage;
}

/**
 * Converts an audio buffer into OPUS PTT format via FFmpeg worker.
 * @param {Buffer} inputBuffer - Original audio data
 * @returns {Promise<Buffer>} - Converted audio data in OPUS format
 */
async function toPTT(inputBuffer) {
  const base64Input = inputBuffer.toString('base64');
  const result = await postFFmpegWorkerMessage('convertToPTT', { base64Input });
  return Buffer.from(result, 'base64');
}

/**
 * Sends a reaction (emoji) to a specific message.
 * @param {Object} sock - Baileys socket instance
 * @param {Object} msg - Original message object
 * @param {string} emoji - The reaction emoji
 */
async function sendReaction(sock, msg, emoji = '👍') {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key,
      },
    });
  } catch (error) {
    console.error('Failed to send reaction:', error);
  }
}

/**
 * Sends an audio file (either as a standard audio or as a PTT/voice note).
 * @param {Object} sock - Baileys socket instance
 * @param {String} jid - Destination JID
 * @param {String} audioPath - Local path to the audio file
 * @param {Boolean} ptt - If true, convert and send as voice note
 * @param {String} caption - Optional caption
 * @param {Object} options - Additional sendMessage options
 */
async function sendAudio(sock, jid, audioPath, ptt = false, caption = '', options = {}) {
  try {
    const rawBuffer = await fs.readFile(audioPath);

    let finalBuffer = rawBuffer;
    if (ptt) {
      // Convert to OPUS voice note
      finalBuffer = await toPTT(rawBuffer);
    }

    await sock.sendMessage(jid, {
      audio: finalBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt,
      caption,
      ...options,
    });
    logger.debug(`Sent audio to ${jid} from ${audioPath}`);
  } catch (error) {
    console.error(`Failed to send audio to ${jid} from ${audioPath}:`, error);
  }
}

/**
 * Sends a text with link preview. 
 * Useful for sending clickable links with title, body, and thumbnail.
 * @param {Object} sock
 * @param {String} jid
 * @param {Object} content - Includes text, title, body, thumbnailUrl, etc.
 * @param {Object} options - Additional sendMessage options
 */
async function sendLinkWithPreview(
  sock,
  jid,
  {
    text = '',
    title = '',
    body = '',
    thumbnailUrl = '',
    sourceUrl = '',
    mediaUrl = '',
    mediaType = 2,
    renderLargerThumbnail = true,
  } = {},
  options = {}
) {
  try {
    const messageContent = {
      text,
      contextInfo: {
        externalAdReply: {
          title,
          body,
          thumbnailUrl,
          sourceUrl,
          mediaUrl,
          mediaType,
          renderLargerThumbnail,
        },
      },
    };
    await sock.sendMessage(jid, messageContent, options);
    logger.debug(`Sent link with preview to ${jid}`);
  } catch (error) {
    console.error(`Failed to send link with preview to ${jid}:`, error);
  }
}

/**
 * Sends an image or video (with an optional caption).
 * @param {Object} sock - Baileys socket instance
 * @param {String} jid - Destination JID
 * @param {String} mediaPath - Path to the image/video file
 * @param {String} mediaType - 'image' or 'video'
 * @param {String} caption - Optional caption
 * @param {Object} options - Additional sendMessage options
 */
async function sendMedia(sock, jid, mediaPath, mediaType = 'image', caption = '', options = {}) {
  try {
    if (!existsSync(mediaPath)) {
      console.error(`sendMedia: File not found at path ${mediaPath}`);
      return;
    }
    const mediaBuffer = await fs.readFile(mediaPath);

    const contentKey = mediaType === 'video' ? 'video' : 'image';
    await sock.sendMessage(jid, {
      [contentKey]: mediaBuffer,
      caption,
      ...options,
    });
    logger.debug(`Sent ${mediaType} to ${jid} from ${mediaPath}`);
  } catch (error) {
    console.error(`Failed to send ${mediaType} to ${jid} from ${mediaPath}:`, error);
  }
}

/**
 * Sends a media in "view once" mode (the recipient can only see once).
 * @param {Object} sock
 * @param {String} jid
 * @param {String} mediaPath
 * @param {String} mediaType - 'image', 'video', 'audio'
 * @param {String} caption
 * @param {Object} options
 */
async function sendViewOnceMedia(sock, jid, mediaPath, mediaType = 'image', caption = '', options = {}) {
  try {
    if (!existsSync(mediaPath)) {
      console.error(`sendViewOnceMedia: File not found at path ${mediaPath}`);
      return;
    }
    const mediaBuffer = await fs.readFile(mediaPath);

    let contentKey = 'image';
    if (mediaType === 'video') contentKey = 'video';
    else if (mediaType === 'audio') contentKey = 'audio';

    await sock.sendMessage(jid, {
      [contentKey]: mediaBuffer,
      caption,
      viewOnce: true,
      ...options,
    });
    logger.debug(`Sent view once ${mediaType} to ${jid} from ${mediaPath}`);
  } catch (error) {
    console.error(`Failed to send view once ${mediaType} to ${jid} from ${mediaPath}:`, error);
  }
}

/**
 * Edits a previously sent message (assuming the WA version supports it).
 * Can preserve existing mentions or add new ones.
 * @param {Object} sock
 * @param {Object} originalMsg
 * @param {String} newText
 * @param {Array} newMentions
 * @param {boolean} preserveContext
 */
async function editMessage(sock, originalMsg, newText, newMentions = [], preserveContext = true) {
  if (!originalMsg?.key) {
    logger.debug('Cannot edit: invalid original message key');
    return;
  }

  let contextInfo;
  if (preserveContext) {
    const originalContext =
      originalMsg?.message?.extendedTextMessage?.contextInfo ||
      originalMsg?.message?.conversation?.contextInfo ||
      null;

    if (originalContext) {
      contextInfo = { ...originalContext };
      // Merge in new mentions if provided
      const oldMentions = originalContext?.mentionedJid || [];
      contextInfo.mentionedJid = Array.from(new Set([...oldMentions, ...newMentions]));
    } else if (newMentions.length > 0) {
      // If no existing context, create a new one just for mentions
      contextInfo = { mentionedJid: newMentions };
    }
  } else {
    // If not preserving context but we have new mentions
    if (newMentions.length > 0) {
      contextInfo = { mentionedJid: newMentions };
    }
  }

  try {
    await sock.sendMessage(originalMsg.key.remoteJid, {
      edit: originalMsg.key,
      text: newText,
      contextInfo,
    });
    logger.debug('Message edited successfully.');
  } catch (error) {
    console.error(`Error editing message: ${error.message}`);
  }
}

/**
 * Sends either a text message or an image+caption, with optional mentions.
 * @param {Object} sock
 * @param {String} jid
 * @param {Object} options
 */
async function sendMessage(sock, jid, options = {}) {
  const {
    text,
    mentions = [],
    quoted = null,
    imagePath = null,
    caption = '',
    ...rest
  } = options;

  let messageContent = {};

  if (imagePath) {
    try {
      if (!existsSync(imagePath)) {
        console.error(`sendMessage: imagePath not found => ${imagePath}`);
        return;
      }
      const imageBuffer = await fs.readFile(imagePath);
      messageContent = {
        image: imageBuffer,
        caption,
      };
    } catch (error) {
      console.error(`Failed to send image to ${jid} from ${imagePath}:`, error);
      return;
    }
  } else if (text) {
    messageContent = { text };
  }

  if (mentions.length > 0) {
    messageContent.mentions = mentions;
  }

  const messageOptions = { ...rest };
  if (quoted) {
    messageOptions.quoted = quoted;
  }

  try {
    await sock.sendMessage(jid, messageContent, messageOptions);
    logger.debug(`Sent message to ${jid}`);
  } catch (err) {
    console.error(`Failed to send message to ${jid}:`, err);
  }
}

/**
 * Sends a vCard contact to a chat.
 * @param {Object} sock
 * @param {String} jid
 * @param {String} contactNumber
 * @param {String} displayName
 */
async function sendContact(sock, jid, contactNumber, displayName) {
  const plainNumber = contactNumber.replace(/[^\d]/g, '');
  try {
    await sock.sendMessage(jid, {
      contacts: {
        displayName: displayName,
        contacts: [
          {
            displayName: displayName,
            vcard: `BEGIN:VCARD
VERSION:3.0
FN:${displayName}
TEL;type=CELL;type=VOICE;waid=${plainNumber}:${contactNumber}
END:VCARD`,
          },
        ],
      },
    });
    logger.debug(`Sent contact for ${displayName} to ${jid}`);
  } catch (error) {
    console.error(`Failed to send contact to ${jid}:`, error);
  }
}

/**
 * Marks an array of messages as read.
 * @param {Object} sock
 * @param {Array} keys
 */
async function markMessagesAsRead(sock, keys = []) {
  try {
    await sock.readMessages(keys);
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
  }
}

/**
 * Updates typing/recording presence.
 * @param {Object} sock
 * @param {String} presence - e.g. 'composing', 'recording', 'available'
 * @param {String} jid - optional target chat
 */
async function updatePresence(sock, presence, jid = null) {
  try {
    if (jid) {
      await sock.presenceSubscribe(jid);
    }
    await sock.sendPresenceUpdate(presence, jid);
  } catch (error) {
    console.error('Failed to update presence:', error);
  }
}

/**
 * Generic chat modification (archive, unarchive, etc.)
 * @param {Object} sock
 * @param {Object} modifications
 * @param {String} jid
 */
async function chatModify(sock, modifications, jid) {
  try {
    await sock.chatModify(modifications, jid);
  } catch (error) {
    console.error('Failed to modify chat:', error);
  }
}

async function archiveChat(sock, jid, lastMsg = null) {
  const modifications = { archive: true };
  if (lastMsg) {
    modifications.lastMessages = [lastMsg];
  }
  await chatModify(sock, modifications, jid);
}

async function unarchiveChat(sock, jid, lastMsg = null) {
  const modifications = { archive: false };
  if (lastMsg) {
    modifications.lastMessages = [lastMsg];
  }
  await chatModify(sock, modifications, jid);
}

async function muteChat(sock, jid, durationMs) {
  const modifications = { mute: durationMs };
  await chatModify(sock, modifications, jid);
}

async function unmuteChat(sock, jid) {
  const modifications = { mute: null };
  await chatModify(sock, modifications, jid);
}

async function pinChat(sock, jid) {
  await chatModify(sock, { pin: true }, jid);
}

async function unpinChat(sock, jid) {
  await chatModify(sock, { pin: false }, jid);
}

async function markChatUnread(sock, jid, lastMsg = null) {
  const modifications = { markRead: false };
  if (lastMsg) {
    modifications.lastMessages = [lastMsg];
  }
  await chatModify(sock, modifications, jid);
}

async function deleteChat(sock, jid, lastMsg) {
  const modifications = {
    delete: true,
    lastMessages: [lastMsg],
  };
  await chatModify(sock, modifications, jid);
}

async function starMessages(sock, jid, messages = []) {
  await chatModify(sock, { star: { messages, star: true } }, jid);
}

async function unstarMessages(sock, jid, messages = []) {
  await chatModify(sock, { star: { messages, star: false } }, jid);
}

async function setEphemeralMessagesInChat(sock, jid, seconds) {
  try {
    await sock.sendMessage(jid, { disappearingMessagesInChat: seconds });
  } catch (error) {
    console.error('Failed to set ephemeral messages in chat:', error);
  }
}

/**
 * Mentions all users in a group by fetching group participants.
 * @param {Object} sock
 * @param {String} groupId
 * @param {String} message - The message to send
 * @param {Object} options - Additional config (mentionInText: boolean)
 */
async function mentionAllInGroup(sock, groupId, message, { mentionInText = true } = {}) {
  try {
    // Attempt to retrieve group metadata from the cache first
    let groupMetadata = groupCache.get(groupId);

    // If not found in cache, fetch from Baileys
    if (!groupMetadata) {
      groupMetadata = await sock.groupMetadata(groupId);
      groupCache.set(groupId, groupMetadata);
    }

    const participants = groupMetadata.participants.map((p) => p.id);
    const mentions = participants;

    let finalText = message;
    if (mentionInText) {
      finalText += '\n\n' + participants.map((id) => `@${id.split('@')[0]}`).join(' ');
    }

    await sock.sendMessage(groupId, {
      text: finalText,
      mentions,
    });
    logger.debug('mentionAllInGroup: completed');
  } catch (err) {
    console.error('Error in mentionAllInGroup:', err);
  }
}

/**
 * Joins a group by using the invite link (must be an admin or have a valid link).
 * @param {Object} sock
 * @param {String} inviteLink
 * @returns {Promise<String>} - The newly joined group ID
 */
async function joinGroupByLink(sock, inviteLink) {
  try {
    const code = inviteLink.split('https://chat.whatsapp.com/')[1];
    const result = await sock.groupAcceptInvite(code);
    logger.debug(`Joined group with ID: ${result.gid}`);
    return result.gid;
  } catch (err) {
    console.error('Error in joinGroupByLink:', err);
  }
}

/**
 * Adds participants to a group.
 * @param {Object} sock
 * @param {String} groupId
 * @param {Array} participants
 */
async function addGroupParticipants(sock, groupId, participants) {
  try {
    await sock.groupParticipantsUpdate(groupId, participants, 'add');
    logger.debug('Participants added to group', groupId);
  } catch (err) {
    console.error('Error in addGroupParticipants:', err);
  }
}

/**
 * Removes participants from a group.
 * @param {Object} sock
 * @param {String} groupId
 * @param {Array} participants
 */
async function removeGroupParticipants(sock, groupId, participants) {
  try {
    await sock.groupParticipantsUpdate(groupId, participants, 'remove');
    logger.debug('Participants removed from group', groupId);
  } catch (err) {
    console.error('Error in removeGroupParticipants:', err);
  }
}

/**
 * Updates the group title.
 * @param {Object} sock
 * @param {String} groupId
 * @param {String} newTitle
 */
async function setGroupTitle(sock, groupId, newTitle) {
  try {
    await sock.groupUpdateSubject(groupId, newTitle);
    logger.debug(`Group title updated to: ${newTitle}`);
  } catch (err) {
    console.error('Error in setGroupTitle:', err);
  }
}

/**
 * Updates the group description.
 * @param {Object} sock
 * @param {String} groupId
 * @param {String} newDescription
 */
async function setGroupDescription(sock, groupId, newDescription) {
  try {
    await sock.groupUpdateDescription(groupId, newDescription);
    logger.debug(`Group description updated to: ${newDescription}`);
  } catch (err) {
    console.error('Error in setGroupDescription:', err);
  }
}

/**
 * Promotes or demotes participants (update group admin).
 * @param {Object} sock
 * @param {String} groupId
 * @param {Array} participants
 * @param {String} action - 'promote' or 'demote'
 */
async function updateGroupAdmin(sock, groupId, participants, action = 'promote') {
  try {
    await sock.groupParticipantsUpdate(groupId, participants, action);
    logger.debug(`Group admin action "${action}" done for group ${groupId}`);
  } catch (err) {
    console.error(`Error in updateGroupAdmin (${action}):`, err);
  }
}

async function promoteParticipants(sock, groupId, participants) {
  await updateGroupAdmin(sock, groupId, participants, 'promote');
}

async function demoteParticipants(sock, groupId, participants) {
  await updateGroupAdmin(sock, groupId, participants, 'demote');
}

/**
 * Sends text or image as a WhatsApp status (story).
 * @param {Object} sock
 * @param {String} type - 'text' or 'image'
 * @param {String|Buffer} content - Text or path/buffer for an image
 * @param {String} caption - If sending an image
 */
async function sendStatus(sock, type = 'text', content = '', caption = '') {
  try {
    if (type === 'text') {
      await sock.sendMessage('status@broadcast', { text: content });
    } else if (type === 'image') {
      let buffer;
      if (typeof content === 'string') {
        buffer = await fs.readFile(content);
      } else {
        buffer = content;
      }
      await sock.sendMessage('status@broadcast', { image: buffer, caption });
    } else {
      console.error('sendStatus: unknown type. Use "text" or "image".');
    }
  } catch (err) {
    console.error('Error in sendStatus:', err);
  }
}

/**
 * Sets the "about" message on your WA profile.
 * @param {Object} sock
 * @param {String} newAbout
 */
async function setAbout(sock, newAbout) {
  try {
    await sock.updateProfileStatus(newAbout);
    logger.debug(`Profile about updated to: ${newAbout}`);
  } catch (err) {
    console.error('Error in setAbout:', err);
  }
}

/**
 * Changes the profile picture, given a path or a Buffer to the new image.
 * @param {Object} sock
 * @param {String|Buffer} imagePathOrBuffer
 */
async function setProfilePicture(sock, imagePathOrBuffer) {
  try {
    let buffer;
    if (typeof imagePathOrBuffer === 'string') {
      buffer = await fs.readFile(imagePathOrBuffer);
    } else {
      buffer = imagePathOrBuffer;
    }
    await sock.updateProfilePicture(buffer);
    logger.debug('Profile picture updated.');
  } catch (err) {
    console.error('Error in setProfilePicture:', err);
  }
}

/**
 * Downloads an audio message (PTT or normal) and returns it as a Buffer.
 * @param {Object} sock
 * @param {Object} msg - Baileys message
 * @returns {Promise<Buffer|null>}
 */
async function downloadAudioMessage(sock, msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
    return buffer; // Audio content as Buffer
  } catch (error) {
    console.error('Failed to download audio message:', error);
    return null;
  }
}

/**
 * Forward an existing audio message as PTT to a new destination.
 * 1) Download the original audio
 * 2) Convert to OPUS
 * 3) Send as voice note
 * @param {Object} sock
 * @param {Object} originalMsg
 * @param {String} targetJid
 */
async function forwardAudioAsPTT(sock, originalMsg, targetJid) {
  try {
    const audioBuffer = await downloadAudioMessage(sock, originalMsg);
    if (!audioBuffer) {
      logger.debug('No audio found in the message to forward.');
      return;
    }
    const pttBuffer = await toPTT(audioBuffer);

    await sock.sendMessage(targetJid, {
      audio: pttBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    });
    logger.debug(`Forwarded audio as PTT to ${targetJid}.`);
  } catch (error) {
    console.error('Error forwarding audio as PTT:', error);
  }
}

// Exporting all functions for external usage
module.exports = {
  // Checkers
  isGroupMessage,
  isPrivateMessage,
  isFromMe,
  isUserMessage,
  isBroadcastMessage,
  isAnnouncementMessage,
  isStatusMessage,
  isVoiceMessage,
  isViewOnceMessage,
  isViewOnceVideo,
  isViewOncePhoto,
  isViewOnceAudio,
  isAudioMessage,
  isDocumentMessage,
  isLocationMessage,
  isContactMessage,
  isAnimationMessage,
  isLinkMessage,
  isPollMessage,
  isInvoiceMessage,
  isImageMessage,
  isVideoMessage,
  isStickerMessage,
  isReactionMessage,

  // Sending & Basic
  sendReaction,
  sendAudio,
  sendLinkWithPreview,
  sendMedia,
  sendViewOnceMedia,
  editMessage,
  sendMessage,
  sendContact,

  // Additional
  markMessagesAsRead,
  updatePresence,
  chatModify,
  archiveChat,
  unarchiveChat,
  muteChat,
  unmuteChat,
  pinChat,
  unpinChat,
  markChatUnread,
  deleteChat,
  starMessages,
  unstarMessages,
  setEphemeralMessagesInChat,

  // Group / Profile / Status
  mentionAllInGroup,
  joinGroupByLink,
  addGroupParticipants,
  removeGroupParticipants,
  setGroupTitle,
  setGroupDescription,
  promoteParticipants,
  demoteParticipants,
  sendStatus,
  setAbout,
  setProfilePicture,

  // Audio Download + Forward
  downloadAudioMessage,
  forwardAudioAsPTT,
};

// IMPORTANT: Initialize (start) the FFmpeg worker at the end
startFFmpegWorker();

// ./src/events/scheduled_messager.js

const fs = require('fs');
const path = require('path');
const logger = require('../middlewares/logger');
const { sendMessage } = require('../middlewares/baileys_utils');
const { Worker } = require('worker_threads'); // Worker usage

/**
 * Simple worker initialization for demonstration.
 * We spawn a separate worker that currently does nothing special.
 * You can extend it to handle scheduling tasks.
 */
let scheduleMessagesWorker;

function startScheduleMessagesWorker() {
    if (!scheduleMessagesWorker) {
        const workerPath = path.join(__dirname, '../workers/schedule_messager_worker.js');
        scheduleMessagesWorker = new Worker(workerPath);

        scheduleMessagesWorker.on('message', (msg) => {
            logger.debug(`[schedule_messager Worker] Message: ${JSON.stringify(msg)}`);
            // For example, if worker requests "send" action, we could handle it here
        });

        scheduleMessagesWorker.on('error', (err) => {
            logger.error(`[schedule_messager Worker] Error: ${err.message}`);
        });

        scheduleMessagesWorker.on('exit', (code) => {
            logger.warn(`[schedule_messager Worker] Exited with code ${code}`);
            scheduleMessagesWorker = null;
        });

        logger.info('[schedule_messager Worker] Spawned successfully.');
    }
}

/**
 * Helper function to select a random item from an array
 * @param {Array} arr - The array to select from
 * @returns {*} - A randomly selected item
 */
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * This function adjusts the next scheduled time if:
 * - The group name contains "PXG MARKET" (case-insensitive).
 * - The next time is within 30min after one of the critical hours: 00, 09, 12, 15, 18, or 21.
 * It pushes the schedule to HH:30 in those cases.
 * @param {string} groupName
 * @param {number} nextMs - The next timestamp (in ms) the message is scheduled
 * @returns {number} - Potentially adjusted timestamp (in ms)
 */
function adjustIfPxgMarket(groupName, nextMs) {
    // Check if it's a PXG MARKET group
    if (!groupName.toLowerCase().includes('pxg market')) {
        return nextMs;
    }

    // Convert to local date/time in America/Sao_Paulo
    const dateLocalString = new Date(nextMs).toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo',
    });
    const localDate = new Date(dateLocalString);

    const hour = localDate.getHours();
    const minute = localDate.getMinutes();

    // Critical hours
    const criticalHours = [0, 9, 12, 15, 18, 21];

    // If the scheduled time is inside the first 30 min of a critical hour, push to HH:30
    if (criticalHours.includes(hour) && minute < 30) {
        localDate.setMinutes(30);
        localDate.setSeconds(0);
        localDate.setMilliseconds(0);
        return localDate.getTime();
    }
    return nextMs;
}

/**
 * Function to schedule and send messages to WhatsApp groups
 * @param {Object} sock - The Baileys WhatsApp socket instance
 */
function scheduleMessages(sock) {
    // Start our demonstration worker
    startScheduleMessagesWorker();

    // Import configuration from config.json
    const configPath = path.join(__dirname, '../../config.json');
    if (!fs.existsSync(configPath)) {
        logger.error('config.json not found!');
        return;
    }
    const config = require(configPath);

    const { scheduledMessages } = config;

    const { groups, messages, media } = scheduledMessages;

    // Paths to media directories
    const imagesDir = path.resolve(__dirname, '../../' + media.images);
    const videosDir = path.resolve(__dirname, '../../' + media.videos);

    // Verify media directories exist
    if (!fs.existsSync(imagesDir)) {
        logger.error(`Images directory not found: ${imagesDir}`);
        return;
    }

    if (!fs.existsSync(videosDir)) {
        logger.error(`Videos directory not found: ${videosDir}`);
        return;
    }

    // List image and video files
    const imageFiles = fs.readdirSync(imagesDir).filter(file => /\.(jpe?g|png|gif|bmp)$/i.test(file));
    const videoFiles = fs.readdirSync(videosDir).filter(file => /\.(mp4|mov|avi|mkv)$/i.test(file));

    if (imageFiles.length === 0 && videoFiles.length === 0) {
        logger.error('No image or video files found in the specified media directories.');
        return;
    }

    // Path to the fixed thumbnail image used in quoted messages
    const thumbnailPath = path.join(__dirname, '../../media/kizu.jpg');
    if (!fs.existsSync(thumbnailPath)) {
        logger.error('Thumbnail "kizu.jpg" not found in ./media/');
        return;
    }
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);

    // Path to the bot_last_sent.json
    const lastSentPath = path.join(__dirname, '../../data/bot_last_sent.json');

    // Load last sent timestamps
    let lastSentData = {};
    if (fs.existsSync(lastSentPath)) {
        try {
            lastSentData = JSON.parse(fs.readFileSync(lastSentPath, 'utf-8'));
        } catch (error) {
            logger.error('Error parsing bot_last_sent.json:', error);
            lastSentData = {};
        }
    } else {
        // Initialize the file if it doesn't exist
        fs.writeFileSync(lastSentPath, JSON.stringify({}, null, 2), 'utf-8');
        lastSentData = {};
    }

    /**
     * Function to save the last sent timestamps
     */
    function saveLastSentData() {
        fs.writeFileSync(lastSentPath, JSON.stringify(lastSentData, null, 2), 'utf-8');
    }

    /**
     * Function to get the last timestamp the bot sent a message to a group
     * @param {string} groupId - The ID of the group
     * @returns {number} - The last timestamp in milliseconds
     */
    function getLastTimestamp(groupId) {
        return lastSentData[groupId] || 0;
    }

    /**
     * Function to update the last sent timestamp after sending a message
     * @param {string} groupId - The ID of the group
     */
    function updateLastTimestamp(groupId) {
        lastSentData[groupId] = Date.now();
        saveLastSentData();
        logger.debug(`lastTimestamp updated for group ${groupId}`);
    }

    // Iterate over each scheduled group
    groups.forEach(group => {
        const groupId = group.id;
        const intervalHours = group.intervalHours;
        const name = group.name; // We'll use the group name for the PXG MARKET check
        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Get the last timestamp the bot sent a message to the group
        const lastTimestamp = getLastTimestamp(groupId);
        const now = Date.now();
        const elapsedTime = now - lastTimestamp;
        let initialDelay = intervalMs - elapsedTime;

        // If the interval has already passed since the last message, send immediately
        if (elapsedTime >= intervalMs) {
            initialDelay = 0;
        } else if (initialDelay < 0) {
            initialDelay = 0; // Ensure it's not negative
        }

        // Calculate the raw time for the next message
        const nextScheduledTime = now + initialDelay;

        // Adjust if PXG MARKET group is within the 30-minute window after 00,09,12,15,18,21
        const adjustedTime = adjustIfPxgMarket(name, nextScheduledTime);
        let finalDelay = adjustedTime - now;
        if (finalDelay < 0) {
            finalDelay = 0; // Safety check
        }

        /**
         * Function to send the message
         */
        const sendScheduledMessage = async () => {
            try {
                // Select a random message from the list
                let rndMessage = getRandomItem(messages);
                let selectedMessage = `\n${rndMessage}`;

                // Randomly decide to send an image or a video
                const sendMediaType = Math.random() < 0.5 ? 'image' : 'video';

                let mediaPath = '';
                let mediaMessage = {};

                if (sendMediaType === 'image' && imageFiles.length > 0) {
                    // Select a random image
                    const selectedImage = getRandomItem(imageFiles);
                    mediaPath = path.join(imagesDir, selectedImage);

                    mediaMessage = {
                        image: { url: mediaPath },
                        caption: selectedMessage,
                        linkPreview: true,
                    };
                } else if (sendMediaType === 'video' && videoFiles.length > 0) {
                    // Select a random video
                    const selectedVideo = getRandomItem(videoFiles);
                    mediaPath = path.join(videosDir, selectedVideo);

                    mediaMessage = {
                        video: { url: mediaPath },
                        caption: selectedMessage,
                        linkPreview: true,
                    };
                } else if (imageFiles.length > 0) {
                    // If no videos are available, send an image
                    const selectedImage = getRandomItem(imageFiles);
                    mediaPath = path.join(imagesDir, selectedImage);

                    mediaMessage = {
                        image: { url: mediaPath },
                        caption: selectedMessage,
                        linkPreview: true,
                    };
                } else if (videoFiles.length > 0) {
                    // If no images are available, send a video
                    const selectedVideo = getRandomItem(videoFiles);
                    mediaPath = path.join(videosDir, selectedVideo);

                    mediaMessage = {
                        video: { url: mediaPath },
                        caption: selectedMessage,
                        linkPreview: true,
                    };
                } else {
                    // No media available to send
                    logger.warn(`No media available to send in group: ${groupId}`);
                    return;
                }

                await sock.sendMessage(groupId, mediaMessage, {
                    quoted: {
                        key: { fromMe: false, participant: "0@s.whatsapp.net" },
                        message: {
                            extendedTextMessage: {
                                text: `whatsapp-bot™️`,
                                title: `TM`,
                                jpegThumbnail: thumbnailBuffer,
                            },
                        },
                    },
                });

                logger.debug(`Message sent to group ${groupId}: "${selectedMessage}" (${sendMediaType})`);

                // Update the last sent timestamp after successful sending
                updateLastTimestamp(groupId);
            } catch (error) {
                logger.error(`Error sending message to group ${groupId}:`, error);
            }
        };

        // Schedule the first message with setTimeout (using finalDelay)
        setTimeout(() => {
            sendScheduledMessage(); // Send the first message

            // Schedule subsequent messages with setInterval
            setInterval(sendScheduledMessage, intervalMs);
        }, finalDelay);

        logger.info(`Scheduled messages for group ${groupId} every ${intervalHours} hours. Initial delay: ${finalDelay / 1000} seconds.`);
    });
}

module.exports = scheduleMessages;

// ./src/workers/ffmpeg_worker_manager.js
/**
 * This module starts a worker for FFmpeg tasks and provides a function to post messages to it.
 * Reuses the same pattern we used for the DB worker.
 */

const { Worker } = require('worker_threads');
const path = require('path');

let ffmpegWorker;

/**
 * Start the FFmpeg worker if not started yet.
 */
function startFFmpegWorker() {
  if (!ffmpegWorker) {
    const workerPath = path.join(__dirname, 'ffmpeg_worker.js');
    ffmpegWorker = new Worker(workerPath);

    ffmpegWorker.on('error', (err) => {
      console.error('[FFmpegWorker] Worker Error:', err);
    });

    ffmpegWorker.on('exit', (code) => {
      console.error(`[FFmpegWorker] Exited with code ${code}`);
      ffmpegWorker = null;
    });
  }
}

/**
 * Post a message to the FFmpeg worker and wait for response.
 * @param {String} action - The action to perform (e.g. "convertToPTT")
 * @param {Object} data - Data object for that action
 * @returns {Promise<any>} - The result from the worker
 */
function postFFmpegWorkerMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!ffmpegWorker) {
      return reject(new Error('FFmpeg worker is not initialized.'));
    }

    const request = { action, data };

    const onMessage = (msg) => {
      if (msg.action === action) {
        ffmpegWorker.off('message', onMessage);
        if (msg.status === 'ok') {
          resolve(msg.result);
        } else {
          reject(new Error(msg.error || 'Unknown FFmpeg worker error'));
        }
      }
    };

    ffmpegWorker.on('message', onMessage);
    ffmpegWorker.postMessage(request);
  });
}

module.exports = {
  startFFmpegWorker,
  postFFmpegWorkerMessage
};

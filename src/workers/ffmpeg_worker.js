// ./src/workers/ffmpeg_worker.js
/**
 * This worker handles FFmpeg operations (e.g., converting audio to OPUS PTT).
 * It receives messages with actions like "convertToPTT" and returns base64-encoded data.
 */

const { parentPort } = require('worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const tmp = require('tmp');
const fs = require('fs').promises;
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Convert input base64 audio to PTT (OPUS).
 * 1) Write input to a temp file
 * 2) Convert using FFmpeg
 * 3) Return base64 of the result
 */
async function convertToPTT(base64Input) {
  const inputBuffer = Buffer.from(base64Input, 'base64');
  const tempInputPath = tmp.tmpNameSync({ prefix: 'ffmpeg_input_', postfix: '.tmp' });
  const tempOutputPath = tmp.tmpNameSync({ prefix: 'ffmpeg_output_', postfix: '.opus' });

  await fs.writeFile(tempInputPath, inputBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(tempInputPath)
      .toFormat('opus')
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioBitrate('128k')
      .outputOptions(['-application voip'])
      .on('end', async () => {
        try {
          const converted = await fs.readFile(tempOutputPath);
          // Cleanup
          await fs.unlink(tempInputPath).catch(() => {});
          await fs.unlink(tempOutputPath).catch(() => {});
          resolve(converted.toString('base64'));
        } catch (readErr) {
          reject(new Error(`Failed to read output file: ${readErr.message}`));
        }
      })
      .on('error', async (err, stdout, stderr) => {
        // Cleanup
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});
        reject(new Error(`FFmpeg error: ${err.message}\n${stderr}`));
      })
      .save(tempOutputPath);
  });
}

// Listen for messages from the parent
parentPort.on('message', async (payload) => {
  const { action, data } = payload;
  try {
    if (action === 'convertToPTT') {
      const resultBase64 = await convertToPTT(data.base64Input);
      parentPort.postMessage({ status: 'ok', action, result: resultBase64 });
    } else {
      parentPort.postMessage({ status: 'error', action, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

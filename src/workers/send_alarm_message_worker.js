// ./src/workers/sendAlarmMessage_worker.js
/**
 * This worker is referenced in sendAlarmMessage.js.
 * It listens for messages from the parent, logs them,
 * and responds with a success message.
 */

const { parentPort } = require('worker_threads');

// Listen for messages from the parent
parentPort.on('message', async (payload) => {
  const { action, data } = payload;

  try {
    switch (action) {
      case 'processSend':

        // Then reply back
        parentPort.postMessage({ status: 'ok', action, result: 'Message processed in worker.' });
        break;

      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Unknown action: ${action} (sendAlarmMessage_worker)`,
        });
        break;
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

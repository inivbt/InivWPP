// ./src/workers/kizu_alarm_handler_worker.js
/**
 * Worker referenced in kizu_alarm_handler.js.
 * Intended for extended Kizu Alarm logic on a separate thread.
 * Currently, it just logs the data it receives and responds.
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', async (payload) => {
  const { action, userJid } = payload;

  try {
    switch (action) {
      case 'startLeadSequence':
        parentPort.postMessage({
          status: 'ok',
          action,
          result: `Started lead sequence for ${userJid} in worker.`,
        });
        break;

      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Unknown action: ${action} (kizu_alarm_handler_worker)`,
        });
        break;
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

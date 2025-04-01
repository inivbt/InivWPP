// ./src/workers/schedule_messager_worker.js
/**
 * Worker referenced in scheduled_messager.js.
 * This worker can handle scheduling logic off the main thread if needed.
 * Currently, it just listens for messages and logs them.
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', async (payload) => {
  const { action, data } = payload;
  try {
    switch (action) {
      case 'scheduleTask':
        // Perform scheduling logic here if needed
        parentPort.postMessage({ status: 'ok', action, result: 'Task scheduled in worker.' });
        break;

      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Unknown action: ${action} (schedule_messager_worker)`,
        });
        break;
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

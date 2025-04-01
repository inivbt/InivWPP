// ./src/workers/group_manager_helper_worker.js
/**
 * Worker referenced in group_manager_helper.js.
 * Intended to handle heavy-lifting for group message processing off the main thread.
 * Currently, it just listens for messages, logs them, and replies.
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', async (payload) => {
  const { action, data } = payload;

  try {
    switch (action) {
      case 'processGroupMessage':
        parentPort.postMessage({
          status: 'ok',
          action,
          result: 'Group message processed in worker.',
        });
        break;

      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Unknown action: ${action} (group_manager_helper_worker)`,
        });
        break;
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

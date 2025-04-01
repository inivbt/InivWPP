// ./src/workers/group_forward_manager_worker.js
/**
 * Worker referenced in group_forward_manager.js.
 * Currently just logs and responds to messages from the parent.
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', async (payload) => {
  const { action, data } = payload;

  try {
    switch (action) {
      case 'forwardLogic':
        parentPort.postMessage({
          status: 'ok',
          action,
          result: 'Forward logic executed in worker.',
        });
        break;

      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Unknown action: ${action} (group_forward_manager_worker)`,
        });
        break;
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

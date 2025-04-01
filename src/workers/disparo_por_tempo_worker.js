// ./src/workers/disparo_por_tempo_worker.js
const { parentPort } = require('worker_threads');
const logger = require('../middlewares/logger');

parentPort.on('message', async (payload) => {
  const { action, sock, config } = payload;
  try {
    switch (action) {
      case 'startDisparo':
        // Aqui você poderia chamar a função que envia a sequência para os destinatários
        // Exemplo: await sendDisparoSequence(sock, config);
        parentPort.postMessage({ status: 'ok', action, result: 'Disparo iniciado.' });
        break;
      default:
        parentPort.postMessage({
          status: 'error',
          action,
          error: `Ação desconhecida: ${action} (disparo_por_tempo_worker)`,
        });
    }
  } catch (err) {
    parentPort.postMessage({ status: 'error', action, error: err.message });
  }
});

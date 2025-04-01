const logger = require('./src/middlewares/logger');
const { connectToWhatsApp } = require('./src/events/wa_connect');
const { setSock } = require('./src/middlewares/connection_manager');
const { handleContactsUpdate } = require('./src/events/wa_contacts_groups');
const { kizuAlarmHandler, resumeAllLeadSequences } = require('./src/events/kizu_alarm_handler');
const { bigLeoHandler } = require('./src/events/big_leo_handler');
const groupForwardManager = require('./src/events/group_forward_manager');
const server = require('./src/server/server'); // Servidor Express

// DB-based message store with worker
const {
  startDBWorker,
  ensureMessagesTable,
  storeMessageInDB
} = require('./src/utils/message_store');
const { ensureLeadsResponseTable } = require('./src/utils/leads_data');

// Carrega JSON com as sessões
const configBot = require('./configsbot.json');

startDBWorker();
ensureMessagesTable();
ensureLeadsResponseTable();

// Objeto para armazenar QR Codes por sessão
let qrCodes = {};

/**
 * Inicia uma sessão do bot
 */
async function startBot(sessionConfig) {
  const { name, active, features } = sessionConfig;

  if (!active) {
    logger.info(`[${name}] Sessão marcada como inativa, não iniciando...`);
    return;
  }

  try {
    const sock = await connectToWhatsApp(name);
    setSock(name, sock);

    if (!sock || !sock.ev) {
      throw new Error(`Socket inválido para a sessão ${name}`);
    }

    // Capturar QR Code e armazená-lo na memória com a sessão correspondente
    sock.ev.on('connection.update', (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        logger.info(`[${name}] QR Code atualizado!`);
        qrCodes[name] = qr; // Armazena o QR Code associado ao nome da sessão
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
        logger.error(`[${name}] Conexão fechada, motivo: ${lastDisconnect?.error}. Reconnect? ${shouldReconnect}`);
        if (shouldReconnect) {
          startBot(sessionConfig); // Reinicia a sessão
        }
      }
    });

    // ---- Padrão para toda sessão ----
    sock.ev.on('messages.upsert', async (messageUpdate) => {
      for (const m of messageUpdate.messages) {
        storeMessageInDB(name, m);
      }
    });
    sock.ev.on('contacts.update', handleContactsUpdate(sock));
    logger.info(`[${name}] Handlers attached.`);

    // ---- Opções / features ----
    if (features.scheduleMessages) {
      sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
          logger.info(`[${name}] scheduleMessages ativo`);
          const scheduleMessages = require('./src/events/scheduled_messager');
          scheduleMessages(sock);

          if (features.resumeAllLeadSequences) {
            resumeAllLeadSequences(sock);
          }
        }
      });
    }

    if (features.kizuAlarmHandler) {
      sock.ev.on('messages.upsert', kizuAlarmHandler(sock));
    }

    if (features.bigLeoHandler) {
      sock.ev.on('messages.upsert', bigLeoHandler(sock));
    }

    // Nova feature: disparoPorTempo
    if (features.disparoPorTempo) {
      sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
          logger.info(`[${name}] disparoPorTempo ativo`);
          const { startDisparoPorTempo } = require('./src/events/disparo_por_tempo_handler');
          startDisparoPorTempo(sock);
        }
      });
    }

    logger.info(`[${name}] Bot started successfully!`);
  } catch (error) {
    logger.error(`[${name}] Failed to start bot: ${error.message}`);
  }
}

/**
 * Inicia todas as sessões definidas no configsbot.json
 */
function startAllBots() {
  const { sessions } = configBot;
  sessions.forEach((sess) => {
    startBot(sess);
  });
}

startAllBots();

/**
 * API para obter **todos os QR Codes** via HTTP, identificando a sessão correspondente
 */
const app = require('./src/server/server'); // Importa o app já existente do server.js


// Apenas adiciona a rota no servidor já existente
app.get('/getQRCodes', (req, res) => {
  if (Object.keys(qrCodes).length === 0) {
    return res.status(404).json({ error: 'Nenhum QR Code disponível no momento.' });
  }

  res.json({ qrCodes });
});



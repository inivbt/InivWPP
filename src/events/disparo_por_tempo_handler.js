// ./src/events/disparo_por_tempo_handler.js
const path = require('path');
const fs = require('fs').promises;
const logger = require('../middlewares/logger');
const { updatePresence, sendMedia, sendAudio, sendContact, sendLinkWithPreview } = require('../middlewares/baileys_utils');

const CONFIG_PATH = path.join(__dirname, '../../configsdisparo.json');

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    logger.error(`[disparo_por_tempo] Erro ao ler configsdisparo.json: ${err.message}`);
    // Retorna um default mínimo (modo destinatarios)
    return { globalIntervalSeconds: 3600, mode: "destinatarios", recipients: [], sequences: [] };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendSequenceToRecipient(sock, recipientJid, sequence) {
  logger.info(`[disparo_por_tempo] Enviando sequência para ${recipientJid}...`);
  // 'sequence' é um array de passos
  for (const step of sequence) {
    await updatePresence(sock, getPresenceForStep(step));
    await delay(2000);
    switch (step.type) {
      case 'text':
        await sock.sendMessage(recipientJid, { text: step.content || '' });
        break;
      case 'media':
        await sendMedia(sock, recipientJid, step.path, step.mediaType, step.description);
        break;
      case 'audio':
        await sendAudio(sock, recipientJid, step.path, true, step.caption);
        break;
      case 'contact':
        await sendContact(sock, recipientJid, step.phoneNumber, step.name);
        break;
      case 'link':
        await sendLinkWithPreview(sock, recipientJid, step.content);
        break;
      default:
        logger.warn(`[disparo_por_tempo] Tipo de mensagem desconhecido: ${step.type}`);
    }
    logger.info(`[disparo_por_tempo] Mensagem '${step.type}' enviada para ${recipientJid}.`);
    await updatePresence(sock, 'available');
    if (step.delay && step.delay > 0) {
      await delay(step.delay * 1000);
    }
  }
  logger.info(`[disparo_por_tempo] Sequência finalizada para ${recipientJid}.`);
}

function getPresenceForStep(step) {
  switch (step.type) {
    case 'audio':
      return step.ptt ? 'recording' : 'available';
    case 'text':
    case 'media':
    case 'link':
    case 'contact':
      return 'composing';
    default:
      return 'available';
  }
}

/** 
 * Modo Destinatários com Números: 
 * Para cada destinatário em config.recipients, seleciona aleatoriamente uma sequência de config.sequences
 * e envia essa sequência. Aguarda globalIntervalSeconds antes de passar para o próximo.
 */
async function scheduledSend(sock, config) {
  const recipients = config.recipients || [];
  const sequences = config.sequences || [];
  if (recipients.length === 0) {
    logger.warn('[disparo_por_tempo] Nenhum destinatário configurado para envio agendado.');
    return;
  }
  if (sequences.length === 0) {
    logger.warn('[disparo_por_tempo] Nenhuma sequência configurada para envio agendado.');
    return;
  }
  logger.info('[disparo_por_tempo] Iniciando envio agendado para destinatários...');
  for (const jid of recipients) {
    const selectedSequence = sequences[Math.floor(Math.random() * sequences.length)];
    logger.info(`[disparo_por_tempo] Selecionada sequência para ${jid}`);
    await sendSequenceToRecipient(sock, jid, selectedSequence.messages);
    // Espera globalIntervalSeconds antes de enviar para o próximo
    await delay(config.globalIntervalSeconds * 1000);
  }
  logger.info('[disparo_por_tempo] Ciclo de envio agendado concluído.');
}

/** 
 * Modo Palavra‑chave: 
 * Escuta as mensagens recebidas e, se alguma contiver uma palavra‑chave configurada,
 * seleciona aleatoriamente uma sequência associada àquela palavra e responde ao remetente.
 */
function keywordListener(sock, config) {
  const sequences = config.sequences || [];

  // Constrói um mapa: chave (keyword em minúsculo) -> array de sequências
  const keywordMap = {};
  sequences.forEach(seq => {
    if (seq.keyword && seq.keyword.trim() !== "") {
      const key = seq.keyword.trim().toLowerCase();
      if (!keywordMap[key]) {
        keywordMap[key] = [];
      }
      keywordMap[key].push(seq);
    }
  });

  if (Object.keys(keywordMap).length === 0) {
    logger.info('[disparo_por_tempo] Nenhuma sequência com palavra‑chave configurada.');
    return;
  }

  sock.ev.on('messages.upsert', async (update) => {
    // Se quiser processar apenas updates do tipo "notify" (mensagens reais), faça:
    if (update.type !== 'notify') return;

    const messages = update.messages || [];
    for (const msg of messages) {
      // Se a mensagem não tiver conteúdo, pule
      if (!msg.message) continue;
      if (isGroupMessage(msg)) continue;     // skip groups   

      // Se a mensagem foi enviada pelo próprio bot, pule (para evitar loop)
      //if (msg.key.fromMe) continue;

      // Extrai o texto da mensagem
      let text = '';
      if (msg.message.conversation) {
        text = msg.message.conversation;
      } else if (msg.message.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
      }
      text = text.toLowerCase();

      // Variável para indicar se já acionamos alguma sequência
      let triggered = false;

      // Verifica cada palavra‑chave
      for (const key in keywordMap) {
        if (text.includes(key)) {
          logger.info(`[disparo_por_tempo] Palavra‑chave "${key}" detectada em mensagem de ${msg.key.remoteJid}.`);

          // Seleciona aleatoriamente uma das sequências que possuem essa keyword
          const seqArr = keywordMap[key];
          const selectedSequence = seqArr[Math.floor(Math.random() * seqArr.length)];

          // Envia a sequência completa (respeitando a ordem e delays)
          await sendSequenceToRecipient(sock, msg.key.remoteJid, selectedSequence.messages);

          // Marca que já disparamos para esta mensagem
          triggered = true;

          // Se quiser parar após encontrar a primeira palavra‑chave, saia do loop
          break;
        }
      }

      // Se você quiser responder apenas uma vez por mensagem (mesmo que contenha várias keywords),
      // pode colocar outro "if (triggered) break;" aqui para sair do loop "for (const msg of messages)"
      // MAS geralmente não é necessário se 'text.includes(key)' só casa com uma ou se você fez break acima.
    }
  });

  logger.info(`[disparo_por_tempo] Listener de palavra‑chave ativado para ${Object.keys(keywordMap).length} palavra(s).`);
}


/**
 * Função principal para iniciar o disparo.
 * Verifica o modo (config.mode) e inicia a lógica apropriada.
 */
async function startDisparoPorTempo(sock) {
  const config = await loadConfig();
  if (config.mode === "destinatarios") {
    // Inicia o envio agendado para os destinatários
    scheduledSend(sock, config);
  } else if (config.mode === "palavrachave") {
    // Ativa o listener de palavra‑chave
    keywordListener(sock, config);
  } else {
    logger.warn(`[disparo_por_tempo] Modo desconhecido: ${config.mode}`);
  }
}

module.exports = {
  startDisparoPorTempo
};

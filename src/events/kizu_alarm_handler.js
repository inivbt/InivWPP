// ./src/events/kizu_alarm_handler.js

const path = require('path');
const fs = require('fs').promises;
const { isPrivateMessage, isFromMe, isGroupMessage, isUserMessage, updatePresence } = require('../middlewares/baileys_utils');
const logger = require('../middlewares/logger');
const db = require('../utils/db');
const { isUserResponded, markUserResponded } = require('../utils/leads_data');
const { ensureUser } = require('./wa_contacts_groups');
const { Worker } = require('worker_threads');
const { extractMessageText } = require('../middlewares/message_functions');

// Path to the leads processing JSON file
const leadsProcessingPath = path.join(__dirname, '../../data/leads_processing.json');

// In-memory cache for leads processing
let leadsProcessing = {};

/**
 * Start a kizuAlarmHandler worker for demonstration.
 */
let kizuAlarmWorker;

function startKizuAlarmWorker() {
    if (!kizuAlarmWorker) {
        const workerPath = path.join(__dirname, '../workers/kizu_alarm_handler_worker.js');
        kizuAlarmWorker = new Worker(workerPath);

        kizuAlarmWorker.on('message', (msg) => {
            logger.debug(`[kizu_alarm_handler Worker] Message: ${JSON.stringify(msg)}`);
        });

        kizuAlarmWorker.on('error', (err) => {
            logger.error(`[kizu_alarm_handler Worker] Error: ${err.message}`);
        });

        kizuAlarmWorker.on('exit', (code) => {
            logger.warn(`[kizu_alarm_handler Worker] Exited with code ${code}`);
            kizuAlarmWorker = null;
        });

        logger.info('[kizu_alarm_handler Worker] Spawned successfully.');
    }
}

// Pre-load descriptions from text files for demonstration
const descriptions = {
    video_shiny: '',
    pescador: ''
};

const descriptionsPaths = {
    video_shiny: path.join(__dirname, '../../media/leads_responses/video_shiny.txt'),
    pescador: path.join(__dirname, '../../media/leads_responses/pescador.txt')
};

// Load leads_processing.json into memory
async function loadLeadsProcessing() {
    try {
        const data = await fs.readFile(leadsProcessingPath, 'utf-8');
        leadsProcessing = JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            leadsProcessing = {};
            await saveLeadsProcessing();
        } else {
            logger.error(`Failed to load leads_processing.json: ${error.message}`);
        }
    }
}

// Save leadsProcessing object to leads_processing.json
async function saveLeadsProcessing() {
    try {
        await fs.writeFile(leadsProcessingPath, JSON.stringify(leadsProcessing, null, 2));
    } catch (error) {
        logger.error(`Failed to save leads_processing.json: ${error.message}`);
    }
}

// Kick off the data load at startup
loadLeadsProcessing();

// Load descriptions into memory
async function loadDescriptions() {
    try {
        const videoShinyExists = await fs.access(descriptionsPaths.video_shiny).then(() => true).catch(() => false);
        if (videoShinyExists) {
            descriptions.video_shiny = await fs.readFile(descriptionsPaths.video_shiny, 'utf-8');
        }

        const pescadorExists = await fs.access(descriptionsPaths.pescador).then(() => true).catch(() => false);
        if (pescadorExists) {
            descriptions.pescador = await fs.readFile(descriptionsPaths.pescador, 'utf-8');
        }
    } catch (error) {
        logger.error(`Error loading descriptions: ${error.message}`);
    }
}
loadDescriptions();

/**
 * Checks if a user is in 'servers' table
 */
async function isUserInServers(userJid) {
    try {
        const query = 'SELECT id FROM servers WHERE owner_jid = ? AND is_active = TRUE';
        const [rows] = await db.execute(query, [userJid]);
        return rows.length > 0;
    } catch (error) {
        logger.error(`Error checking servers: ${error.message}`);
        return false;
    }
}

/**
 * Checks if user is in trade groups
 */
async function isInTradeGroups(userId) {
    try {
        const query = `
      SELECT 1
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      WHERE gm.user_id = ?
      AND (
          LOWER(g.group_name) LIKE '%🔥 mg 🔥%' 
          OR LOWER(g.group_name) LIKE '%mercad%'
          OR (g.group_name LIKE '%PXG MARKET%')
          OR (LOWER(g.group_name) LIKE '%center%')
          OR (LOWER(g.group_name) LIKE '%contrato%')
      )
      LIMIT 1
    `;
        const [rows] = await db.execute(query, [userId]);
        return rows.length > 0;
    } catch (error) {
        logger.error(`Error checking groups for user ${userId}: ${error.message}`);
        return false;
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPresenceForMessage(step) {
    switch (step.type) {
        case 'audio':
            return step.ptt ? 'recording' : 'available';
        case 'text':
        case 'link':
        case 'media':
        case 'contact':
            return 'composing';
        default:
            return 'available';
    }
}

/**
 * The lead sequence
 */
async function sendLeadSequence(sock, userJid) {
    // Worker usage is purely demonstrative, not deeply integrated
    if (kizuAlarmWorker) {
        kizuAlarmWorker.postMessage({ action: 'startLeadSequence', userJid });
    }

    try {
        if (!(userJid in leadsProcessing)) {
            leadsProcessing[userJid] = 0;
            await saveLeadsProcessing();
        }

        const sequence = [
            // ... same steps as before
            {
                type: 'audio',
                path: path.join(__dirname, '../../media/leads_responses/introaudio.mp3'),
                ptt: true,
                caption: null,
                delay: 60000,
                log: 'Sent intro audio'
            },
            {
                type: 'link',
                content: {
                    text: 'o bot faz: Outland, orre e coleta de recursos - mega boss e shiny com perfeição\nhttps://www.youtube.com/watch?v=wo4SpRMQ2B8',
                    title: 'Outland, orre e coleta de recursos - mega boss e shiny com perfeição',
                    body: 'Fishing Automático, Healing Preciso, Alarmes via WhatsApp, Party Hunt e Farming Avançados',
                    mediaUrl: 'https://youtu.be/wo4SpRMQ2B8',
                    sourceUrl: 'https://youtu.be/wo4SpRMQ2B8',
                    thumbnailUrl: 'https://i.ytimg.com/vi/wo4SpRMQ2B8/hqdefault.jpg'
                },
                delay: 60000,
                log: 'Sent link with preview'
            },
            {
                type: 'media',
                mediaType: 'video',
                path: path.join(__dirname, '../../media/leads_responses/video_shiny.mp4'),
                description: descriptions.video_shiny,
                delay: 60000,
                log: 'Sent local video + caption'
            },
            {
                type: 'media',
                mediaType: 'image',
                path: path.join(__dirname, '../../media/leads_responses/pescador.jpg'),
                description: descriptions.pescador,
                delay: 60000,
                log: 'Sent image'
            },
            {
                type: 'text',
                content: `Não tem vitalício, nós temos custos mensais pra: 
- nos manter como o melhor bot do mercado
- manter o melhor ping na sua máquina
- updates e novidades constantes
- alarmes no whatsapp
- bot privado apenas para os melhores
- custos de IA terceirizada
- manter toda a segurança que proporcionamos
- poder usar o bot com seu Pc desligado
- poder acessar o bot pelo celular
- o bot responder GM e pisar na seta`,
                delay: 60000,
                log: 'Sent text message (custos mensais)'
            },
            {
                type: 'text',
                content:
                    'o preço é 250 reais mensal porque o bot não é pra usuário casual, só pra quem Farma de verdade, da pra fazer tranquilo 1200 por mês com o bot quem sabe usar\n*atualmente o bot não faz NW, estamos trabalhando nisso para esse ano ainda!*',
                delay: 60000,
                log: 'Sent text message (preço)'
            },
            {
                type: 'audio',
                path: path.join(__dirname, '../../media/leads_responses/farm_char_250.mp3'),
                ptt: true,
                caption: 'como o pessoal faz grana',
                delay: 60000,
                log: 'Sent farm audio'
            },
            {
                type: 'audio',
                path: path.join(__dirname, '../../media/leads_responses/whoIam.mp3'),
                ptt: true,
                caption: 'quem sou eu',
                delay: 60000,
                log: 'Sent whoIam audio'
            },
            {
                type: 'audio',
                path: path.join(__dirname, '../../media/leads_responses/bansResume.mp3'),
                ptt: true,
                caption: 'resumo sobre bans',
                delay: 60000,
                log: 'Sent bansResume audio'
            },
            {
                type: 'audio',
                path: path.join(__dirname, '../../media/leads_responses/finalAudio.mp3'),
                ptt: true,
                caption: 'como funciona o acesso',
                delay: 60000,
                log: 'Sent final audio'
            },
            {
                type: 'text',
                content: `Se você quer prosseguir com a compra ou tirar mais duvidas comigo, vou te passar meu contato.
Pois aqui encerra nossa conversa porque esse whatsapp aqui é de pré vendas tudo bem?

Lá eu vou te enviar o acesso ao grupo de whatsapp onde você vai conseguir falar com todos usuarios e também vou te passar todos links de acesso e tutorial.`,
                delay: 60000,
                log: 'Sent last message'
            },
            {
                type: 'contact',
                phoneNumber: '+555183259850',
                name: 'Big Léo',
                delay: 0,
                log: 'Sent Big Léo contact'
            }
        ];

        let currentIndex = leadsProcessing[userJid];

        while (currentIndex < sequence.length) {
            const step = sequence[currentIndex];

            const presence = getPresenceForMessage(step);
            await updatePresence(sock, presence);
            logger.info(`Presence set to '${presence}' for ${userJid}`);

            if (presence === 'composing' || presence === 'recording') {
                await delay(2000);
            }

            switch (step.type) {
                case 'audio':
                    {
                        const { sendAudio } = require('../middlewares/baileys_utils');
                        await sendAudio(sock, userJid, step.path, step.ptt, step.caption);
                    }
                    break;
                case 'link':
                    {
                        const { sendLinkWithPreview } = require('../middlewares/baileys_utils');
                        await sendLinkWithPreview(sock, userJid, step.content);
                    }
                    break;
                case 'media':
                    {
                        const { sendMedia } = require('../middlewares/baileys_utils');
                        await sendMedia(sock, userJid, step.path, step.mediaType, step.description);
                    }
                    break;
                case 'text':
                    await sock.sendMessage(userJid, { text: step.content });
                    break;
                case 'contact':
                    {
                        const { sendContact } = require('../middlewares/baileys_utils');
                        await sendContact(sock, userJid, step.phoneNumber, step.name);
                    }
                    break;
                default:
                    logger.warn(`Unknown step type: ${step.type}`);
            }

            logger.info(`${step.log} to ${userJid}`);

            currentIndex += 1;
            leadsProcessing[userJid] = currentIndex;
            await saveLeadsProcessing();

            await updatePresence(sock, 'available');
            if (step.delay > 0) {
                await delay(step.delay);
            }
        }

        delete leadsProcessing[userJid];
        await saveLeadsProcessing();
        logger.info(`Lead sequence completed for ${userJid}, removed from leads_processing.json.`);
    } catch (error) {
        logger.error(`Error in sendLeadSequence for ${userJid}: ${error.message}`);
    }
}

function kizuAlarmHandler(sock) {
    // Start worker
    startKizuAlarmWorker();

    return async (messageUpdate) => {
        try {
            const { type, messages } = messageUpdate;
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (!msg.key || !msg.message) continue;
                if (isGroupMessage(msg)) continue;     // skip groups                
                if (isFromMe(msg)) {
                    const textSentByBot = extractMessageText(msg).toLowerCase();
                    
                    if (textSentByBot === 'opa, vou te explicar melhor') {
                        const from = msg.key.remoteJid; 
                        sendLeadSequence(sock, from);
                        logger.info(`LeadSequence disparado após enviar "opa, vou te explicar melhor" para ${from}`);
                    }
                    continue;
                }
                if (!isPrivateMessage(msg)) continue;  // skip if not private
                if (!isUserMessage(msg)) continue;     // skip weird cases

                const from = msg.key.remoteJid;

                if (from in leadsProcessing) {
                    logger.debug(`User ${from} is already in progress.`);
                    continue;
                }

                if (await isUserInServers(from)) {
                    logger.debug(`User ${from} is in servers, skipping lead sequence.`);
                    continue;
                }

                const userId = await ensureUser(from);
                //if (!await isInTradeGroups(userId)) {
                 //   logger.debug(`User ${from} not in trade groups, skipping.`);
                //    continue;
                //}

                if (await isUserResponded(from)) {
                    logger.debug(`User ${from} already responded, skipping lead sequence.`);
                    continue;
                }

                await markUserResponded(from);
                logger.info(`Marked user ${from} as responded.`);

                sendLeadSequence(sock, from);
            }
        } catch (error) {
            logger.error(`Error in kizuAlarmHandler: ${error.message}`);
        }
    };
}

async function resumeAllLeadSequences(sock) {
    startKizuAlarmWorker();
    for (const userJid in leadsProcessing) {
        const currentIndex = leadsProcessing[userJid];
        if (typeof currentIndex === 'number') {
            logger.info(`Resuming lead sequence for ${userJid} at index ${currentIndex}`);
            sendLeadSequence(sock, userJid);
        }
    }
}

module.exports = {
    kizuAlarmHandler,
    resumeAllLeadSequences
};

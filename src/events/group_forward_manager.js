// ./src/events/group_forward_manager.js

const logger = require('../middlewares/logger');
const { handleGroupMessage } = require('./group_manager_helper');
const { getSock } = require('../middlewares/connection_manager');
const config = require('../../config.json');
const { Worker } = require('worker_threads'); // Worker usage

// We'll keep a single counter for round-robin
let turn = 0;

/**
 * Start a demonstration worker for group_forward_manager
 */
let groupForwardWorker;

function startGroupForwardWorker() {
  if (!groupForwardWorker) {
    const workerPath = require('path').join(__dirname, '../workers/group_forward_manager_worker.js');
    groupForwardWorker = new Worker(workerPath);

    groupForwardWorker.on('message', (msg) => {
      logger.debug(`[group_forward_manager Worker] Message: ${JSON.stringify(msg)}`);
    });

    groupForwardWorker.on('error', (err) => {
      logger.error(`[group_forward_manager Worker] Error: ${err.message}`);
    });

    groupForwardWorker.on('exit', (code) => {
      logger.warn(`[group_forward_manager Worker] Exited with code ${code}`);
      groupForwardWorker = null;
    });

    logger.info('[group_forward_manager Worker] Spawned successfully.');
  }
}

const forwardConfigs = [
  {
    name: 'MichelForward',
    condition: (groupNameLower, sender, msg) =>
      groupNameLower.includes('🔥 mg 🔥') || groupNameLower.includes('mercad'),
    targetGroup: '120363358539799508@g.us'
  },
  {
    name: 'PedroForward',
    condition: (groupNameLower, sender, msg) =>
      groupNameLower.includes('pxg market') && !groupNameLower.includes('chat'),
    targetGroup: '120363384114593366@g.us'
  },
  {
    name: 'NewTaoForward',
    condition: (groupNameLower, sender, msg) =>
      groupNameLower.includes('center') && !groupNameLower.includes('chat'),
    targetGroup: '120363374624542091@g.us'
  },
];

function groupForwardManager(sock) {
  // Start our demonstration worker
  startGroupForwardWorker();

  return async (messageUpdate) => {
    const forwardLogic = async (msg, groupName, sender, logMsg) => {
      if (msg.key?.fromMe) return;
      if (config.ignoredUsers.includes(sender)) return;

      const alexSock = getSock('Kizu_Assistant_ONE');
      const kizuAssistSock = getSock('Kizu_Assistant_TWO');
      const availableSocks = [alexSock, kizuAssistSock].filter(Boolean);

      const groupNameLower = groupName.toLowerCase();

      for (const fwd of forwardConfigs) {
        if (fwd.condition(groupNameLower, sender, msg)) {
          if (availableSocks.length === 0) {
            logger.warn(`No available sock to forward message from ${sender}.`);
            continue;
          }
          const selectedSock = availableSocks[turn % availableSocks.length];

          try {
            await selectedSock.sendMessage(
              fwd.targetGroup,
              { text: logMsg },
              { quoted: msg, contextInfo: { mentionedJid: [sender] } }
            );
            turn++;
            logger.debug(
              `Forwarded from ${sender} in [${groupName}] to ${fwd.targetGroup} [Config: ${fwd.name}]`
            );
          } catch (err) {
            logger.error(
              `Failed to forward from ${sender} to ${fwd.targetGroup} [Config: ${fwd.name}] => ${err.message}`
            );
          }
        }
      }
    };

    await handleGroupMessage(sock, messageUpdate, forwardLogic);
  };
}

module.exports = groupForwardManager;

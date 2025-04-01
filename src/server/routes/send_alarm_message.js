// ./src/server/routes/sendMessage.js

const express = require('express');
const router = express.Router();
const { getSock } = require('../../middlewares/connection_manager');
const logger = require('../../middlewares/logger');
const { Worker } = require('worker_threads'); // Worker usage
const { exec } = require('child_process')
const fs = require('fs');
const path = require('path');

// Caminhos para os arquivos JSON (ajuste conforme necessário)
const configsPath = path.join(__dirname, '../../../configs.json');
const configsBotPath = path.join(__dirname, '../../../configsbot.json');
const configsDisparoPath = path.join(__dirname, '../../../configsdisparo.json');

// Here we define a fixed session name.
const FIXED_SESSION_NAME = 'BIG';

/**
 * Start a worker for demonstration
 */
let sendAlarmWorker;

function startSendAlarmWorker() {
    if (!sendAlarmWorker) {
        const path = require('path');
        const workerPath = path.join(__dirname, '../../workers/send_alarm_message_worker.js');
        sendAlarmWorker = new Worker(workerPath);

        sendAlarmWorker.on('message', (msg) => {
            logger.debug(`[sendAlarmMessage Worker] Message: ${JSON.stringify(msg)}`);
        });

        sendAlarmWorker.on('error', (err) => {
            logger.error(`[sendAlarmMessage Worker] Error: ${err.message}`);
        });

        sendAlarmWorker.on('exit', (code) => {
            logger.warn(`[sendAlarmMessage Worker] Exited with code ${code}`);
            sendAlarmWorker = null;
        });

        logger.info('[sendAlarmMessage Worker] Spawned successfully.');
    }
}

// Initialize the worker once at module load
startSendAlarmWorker();

/**
 * POST /post/send
 * Body params: { char, msg, number }
 */

// Função para carregar qualquer arquivo JSON
function loadConfig(filePath, res) {
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo de configuração não encontrado' });
        }

        const data = fs.readFileSync(filePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error("Erro ao carregar configuração:", error);
        res.status(500).json({ error: 'Erro ao carregar configuração', details: error.message });
    }
}



// Rota para obter configs.json
router.get('/getConfig', (req, res) => {
    loadConfig(configsPath, res);
});

// Rota para obter configsbot.json
router.get('/getConfigBot', (req, res) => {
    loadConfig(configsBotPath, res);
});

// Rota para obter configsdisparo.json
router.get('/getConfigDisparo', (req, res) => {
    loadConfig(configsDisparoPath, res);
});


// Rota para salvar configurações recebidas pelo site
router.post('/saveConfig', (req, res) => {
    try {
        const { fileName, data } = req.body;

        if (!fileName || !data) {
            return res.status(400).json({ error: 'Parâmetros inválidos. Envie fileName e data.' });
        }

        let filePath;
        if (fileName === "configs.json") {
            filePath = configsPath;
        } else if (fileName === "configsbot.json") {
            filePath = configsBotPath;
        } else if (fileName === "configsdisparo.json") {
            filePath = configsDisparoPath;
        } else {
            return res.status(400).json({ error: 'Arquivo inválido.' });
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.json({ message: `Configuração salva com sucesso em ${fileName}.` });
    } catch (error) {
        console.error("Erro ao salvar configuração:", error);
        res.status(500).json({ error: 'Erro ao salvar configuração.', details: error.message });
    }
});

// GET /post/send?char=Fulano&msg=Algum+texto&number=5599999999999
router.get('/send', async (req, res) => {
    try {
        // Em GET, os parâmetros vêm de req.query
        const { char, msg, number } = req.query;

        if (!char || !msg || !number) {
            return res.status(400).json({
                error: 'Parameters missing. Provide char, msg, and number.'
            });
        }

        const sock = getSock(FIXED_SESSION_NAME);
        if (!sock) {
            return res.status(404).json({
                error: `No active session found for '${FIXED_SESSION_NAME}'.`
            });
        }

        const textToSend = `${char} - ${msg}`;

        if (sendAlarmWorker) {
            sendAlarmWorker.postMessage({
                action: 'processSend',
                data: { char, msg, number }
            });
        }

        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: textToSend });

        res.json({
            message: `Message sent to ${number} via session '${FIXED_SESSION_NAME}' successfully (via GET).`,
            dataSent: { char, msg, number }
        });
    } catch (err) {
        logger.error('Error sending message (GET):', err);
        res.status(500).json({
            error: 'Error sending message',
            details: err.message
        });
    }
});

// Rota para reiniciar o Docker do bot

router.post('/restart', (req, res) => {
    logger.info("Reiniciando o bot...");

    setTimeout(() => {
        logger.info("Saindo do processo para reiniciar...");
        process.exit(1); // O Docker automaticamente reiniciará o container
    }, 2000);

    res.json({ message: "Reiniciando o bot..." });
});


router.post('/send', async (req, res) => {
    try {
        const { char, msg, number } = req.body;

        if (!char || !msg || !number) {
            return res.status(400).json({
                error: 'Parameters missing. Provide char, msg, and number.'
            });
        }

        const sock = getSock(FIXED_SESSION_NAME);
        if (!sock) {
            return res.status(404).json({
                error: `No active session found for '${FIXED_SESSION_NAME}'.`
            });
        }

        const textToSend = `${char} - ${msg}`;

        // If we wanted to hand off to the worker for more logic, we could:
        if (sendAlarmWorker) {
            sendAlarmWorker.postMessage({
                action: 'processSend',
                data: { char, msg, number }
            });
        }

        await sock.sendMessage(`${number}@s.whatsapp.net`, { text: textToSend });

        res.json({
            message: `Message sent to ${number} via session '${FIXED_SESSION_NAME}' successfully.`,
            dataSent: { char, msg, number }
        });
    } catch (err) {
        logger.error('Error sending message:', err);
        res.status(500).json({
            error: 'Error sending message',
            details: err.message
        });
    }
});

module.exports = router;

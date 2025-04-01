// ./src/server/server.js

const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const logger = require('../middlewares/logger');
const sendMessageRoute = require('./routes/send_alarm_message');

// Load environment variables from ../data/.env
dotenv.config({ path: path.join(__dirname, '../../data/.env') });

const app = express();

// We parse JSON bodies
app.use(express.json());

// Here we mount the route
app.use('/post', sendMessageRoute);

// If you want to configure the port from .env or fallback
const port = process.env.ROUTES_API_SERVER_PORT || 9999;

/**
 * Note: Here we start the server on the configured port.
 *   This server is used to handle REST endpoints such as "/post/send"
 */

const { exec } = require("child_process");


///
app.listen(port, '0.0.0.0', () => {
    logger.info(`Server listening on port ${port}`);
});



// **Exporta o app para ser usado no bot.js**
module.exports = app;


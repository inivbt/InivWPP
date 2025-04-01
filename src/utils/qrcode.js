const qrcode = require('qrcode-terminal');

function generateQRCode(qr) {
    qrcode.generate(qr, { small: true });
}

module.exports = generateQRCode;

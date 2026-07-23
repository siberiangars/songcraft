const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) { console.error('Set BOT_TOKEN env var'); process.exit(1); }
const CHAT_ID = 'Artem_lidorub'; // username or chat id

function sendMessage() {
  const postData = JSON.stringify({
    chat_id: CHAT_ID,
    text: 'Привет! Бот работает!'
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Response:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e.message);
  });

  req.write(postData);
  req.end();
}

sendMessage();

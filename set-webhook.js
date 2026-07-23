const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) { console.error('Set BOT_TOKEN env var'); process.exit(1); }
const WEBHOOK_URL = 'https://genetics-positioning-calls-far.trycloudflare.com/api/telegram/webhook';

function setWebhook() {
  const url = `/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`;
  
  https.get(`https://api.telegram.org${url}`, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Response:', data);
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
}

setWebhook();

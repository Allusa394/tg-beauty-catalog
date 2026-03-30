// Telegram Bot Webhook — обработчик входящих сообщений
// Деплоится как Vercel Serverless Function
// URL: https://tg-beauty-catalog-ebon.vercel.app/api/webhook

const https = require('https');

const TOKEN = process.env.BOT_TOKEN;

const WELCOME_TEXT =
  'Привет! Я бот мастера маникюра Анны Козловой 🎉\n' +
  'Здесь ты можешь посмотреть услуги, выбрать удобное время и записаться онлайн — без звонков и ожидания.\n' +
  'Нажми кнопку «Записаться» чтобы открыть каталог услуг 👇';

function sendMessage(chatId, text) {
  const data = JSON.stringify({ chat_id: chatId, text });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const update = req.body;
  const msg = update?.message;
  if (!msg) return res.status(200).send('OK');

  const chatId = msg.chat.id;
  const text = msg.text || '';

  // Отвечаем на /start и любое другое сообщение
  await sendMessage(chatId, WELCOME_TEXT);

  res.status(200).send('OK');
};

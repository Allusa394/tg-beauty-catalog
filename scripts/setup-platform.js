// ============================================================
// scripts/setup-platform.js
//
// Запускать один раз на VPS после деплоя:
//   node scripts/setup-platform.js
//
// Что делает:
// 1. Регистрирует webhook платформенного бота → /api/webhook/platform
// 2. Устанавливает описание и команды платформенного бота
// ============================================================

require('dotenv').config();
const https = require('https');

const TOKEN    = process.env.PLATFORM_BOT_TOKEN;
const VPS_URL  = process.env.VPS_URL;

if (!TOKEN || !VPS_URL) {
  console.error('❌ Не заданы PLATFORM_BOT_TOKEN или VPS_URL в .env');
  process.exit(1);
}

// Вызов Telegram Bot API
function tgApi(method, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${TOKEN}/${method}`,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          const parsed = JSON.parse(raw);
          if (parsed.ok) {
            console.log(`✓ ${method}`);
            resolve(parsed.result);
          } else {
            console.error(`✗ ${method}: ${parsed.description}`);
            reject(new Error(parsed.description));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Настройка платформенного бота...\n');

  // 1. Webhook → /api/webhook/platform
  await tgApi('setWebhook', {
    url:             `${VPS_URL}/api/webhook/platform`,
    allowed_updates: ['message', 'callback_query'],
  });

  // 2. Описание бота для новых мастеров
  await tgApi('setMyDescription', {
    description: (
      '👋 Добро пожаловать на платформу BeautyApp!\n\n' +
      'Здесь ты можешь создать своё мини-приложение для записи клиентов всего за несколько минут.\n\n' +
      'Нажми /start чтобы начать регистрацию 👇'
    ),
    language_code: 'ru',
  });

  // 3. Короткое описание
  await tgApi('setMyShortDescription', {
    short_description: 'Создай своё приложение для записи клиентов за 5 минут 💅',
    language_code: 'ru',
  });

  // 4. Команды
  await tgApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Зарегистрироваться / войти' },
    ],
    language_code: 'ru',
  });

  console.log('\n✅ Готово! Платформенный бот настроен.');
  console.log(`   Webhook: ${VPS_URL}/api/webhook/platform`);
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});

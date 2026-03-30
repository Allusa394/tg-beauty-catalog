// ============================================================
// routes/platformWebhook.js — бот платформы
//
// POST /api/webhook/platform
//
// Две роли:
// 1. Онбординг новых мастеров (пошаговая регистрация)
// 2. Команды владельца платформы (/stats, /masters, /block и др.)
// ============================================================

const express = require('express');
const router = express.Router();
const https = require('https');
const supabase = require('../lib/supabase');
const { encrypt } = require('../lib/encrypt');
const TelegramBot = require('node-telegram-bot-api');

const platformBot = new TelegramBot(process.env.PLATFORM_BOT_TOKEN);
const OWNER_ID = Number(process.env.OWNER_TELEGRAM_ID);

// ── POST /api/webhook/platform ─────────────────────────────
router.post('/webhook/platform', async (req, res) => {
  res.sendStatus(200); // Telegram ждёт ответ сразу

  const update = req.body;
  const msg = update?.message;
  const telegramId = msg?.from?.id;

  if (!msg || !telegramId) return;

  try {
    // Владелец платформы — специальные команды
    if (telegramId === OWNER_ID && msg.text?.startsWith('/')) {
      await handleOwnerCommand(msg);
      return;
    }

    // Обычный мастер — онбординг
    await handleOnboarding(msg, telegramId);

  } catch (err) {
    console.error('platformWebhook error:', err.message);
  }
});

// ============================================================
// ОНБОРДИНГ МАСТЕРА
// ============================================================

async function handleOnboarding(msg, telegramId) {
  const text = msg.text || '';

  // Найти существующего мастера
  const { data: master } = await supabase
    .from('masters')
    .select('id, name, onboarding_step')
    .eq('telegram_id', telegramId)
    .single();

  // Новый пользователь — создаём запись и начинаем онбординг
  if (!master) {
    if (text === '/start') {
      await supabase.from('masters').insert({
        telegram_id: telegramId,
        onboarding_step: 'name',
        // Временные обязательные поля — заполнятся в процессе онбординга
        bot_token: `pending_${telegramId}`,
        bot_username: `pending_${telegramId}`,
        name: 'pending'
      });
      await send(telegramId,
        '👋 Привет! Я помогу тебе создать своё мини-приложение для записи клиентов.\n\n' +
        'Это займёт всего пару минут.\n\n' +
        '📝 Как тебя зовут? (Например: Анна Козлова)'
      );
    } else {
      await send(telegramId, 'Напиши /start чтобы начать регистрацию 👇');
    }
    return;
  }

  // Уже зарегистрирован
  if (master.onboarding_step === 'done') {
    await send(telegramId,
      `👋 Привет, ${master.name}!\n\nТвоё приложение уже работает. Открой его через кнопку меню.`
    );
    return;
  }

  // Продолжаем онбординг
  await processOnboardingStep(master, text, telegramId);
}

async function processOnboardingStep(master, text, telegramId) {
  const step = master.onboarding_step;

  if (step === 'name') {
    if (!text || text.startsWith('/')) {
      await send(telegramId, '📝 Введи своё имя (например: Анна Козлова)');
      return;
    }
    await supabase.from('masters').update({ name: text, onboarding_step: 'title' }).eq('id', master.id);
    await send(telegramId,
      `Отлично, ${text}! 🎉\n\n` +
      '💼 Укажи свою специализацию (например: Мастер маникюра и педикюра)'
    );
    return;
  }

  if (step === 'title') {
    if (!text || text.startsWith('/')) {
      await send(telegramId, '💼 Введи специализацию (например: Мастер маникюра)');
      return;
    }
    await supabase.from('masters').update({ title: text, onboarding_step: 'phone' }).eq('id', master.id);
    await send(telegramId,
      '📱 Укажи номер телефона для связи (например: +7 900 123-45-67)\n\n' +
      'Клиенты увидят его в твоём профиле.'
    );
    return;
  }

  if (step === 'phone') {
    if (!text || text.startsWith('/')) {
      await send(telegramId, '📱 Введи номер телефона');
      return;
    }
    await supabase.from('masters').update({ phone: text, onboarding_step: 'token' }).eq('id', master.id);
    await send(telegramId,
      '🤖 Последний шаг — создай своего бота в Telegram!\n\n' +
      '1. Открой @BotFather\n' +
      '2. Напиши /newbot\n' +
      '3. Придумай название и @username для бота\n' +
      '4. Скопируй токен (выглядит так: 1234567890:AAExxxxxx)\n\n' +
      'Отправь мне этот токен 👇'
    );
    return;
  }

  if (step === 'token') {
    await processBotToken(master, text, telegramId);
    return;
  }
}

async function processBotToken(master, token, telegramId) {
  // Проверить формат токена
  if (!token || !/^\d+:[\w-]{35,}$/.test(token)) {
    await send(telegramId,
      '❌ Это не похоже на токен бота.\n\n' +
      'Токен выглядит так: 1234567890:AAExxxxxx\n\n' +
      'Скопируй его из @BotFather и отправь мне.'
    );
    return;
  }

  // Проверить токен через Telegram API (getMe)
  await send(telegramId, '⏳ Проверяю токен...');

  let botInfo;
  try {
    botInfo = await telegramGetMe(token);
  } catch {
    await send(telegramId,
      '❌ Не удалось проверить токен. Убедись что:\n' +
      '• Токен скопирован полностью\n' +
      '• Бот не удалён в @BotFather\n\n' +
      'Попробуй ещё раз 👇'
    );
    return;
  }

  // Проверить что токен не используется другим мастером
  const { data: existing } = await supabase
    .from('masters')
    .select('id')
    .eq('bot_username', botInfo.username)
    .neq('id', master.id)
    .single();

  if (existing) {
    await send(telegramId,
      '❌ Этот бот уже используется другим мастером.\n\n' +
      'Создай нового бота в @BotFather и отправь его токен.'
    );
    return;
  }

  // Зашифровать токен и сохранить
  const encryptedToken = encrypt(token);

  await supabase.from('masters').update({
    bot_token: encryptedToken,
    bot_username: botInfo.username,
    onboarding_step: 'done'
  }).eq('id', master.id);

  // Настроить webhook для нового бота
  const webhookUrl = `${process.env.VPS_URL}/api/webhook/${master.id}`;
  await setupBotWebhook(token, webhookUrl, botInfo.username);

  // Поздравить мастера
  const appUrl = `https://t.me/${botInfo.username}/app`;
  await send(telegramId,
    `🎉 Готово! Твоё приложение создано!\n\n` +
    `🤖 Твой бот: @${botInfo.username}\n` +
    `🔗 Ссылка на приложение:\n${appUrl}\n\n` +
    `Поделись этой ссылкой с клиентами — они смогут записаться к тебе онлайн.`
  );
}

// Установить webhook для бота мастера
async function setupBotWebhook(token, webhookUrl, botUsername) {
  try {
    const bot = new TelegramBot(token);

    // Установить webhook
    await bot.setWebHook(webhookUrl);

    // Настроить кнопку меню (открывает мини-апп)
    await bot.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Открыть приложение',
        web_app: { url: `${process.env.FRONTEND_URL}/?bot=${botUsername}` }
      }
    });

    // Установить команды бота
    await bot.setMyCommands([
      { command: 'start', description: 'Открыть каталог услуг' }
    ]);

    console.log(`[onboarding] Webhook и меню настроены для @${botUsername}`);
  } catch (err) {
    console.error('setupBotWebhook error:', err.message);
  }
}

// ============================================================
// КОМАНДЫ ВЛАДЕЛЬЦА ПЛАТФОРМЫ
// ============================================================

async function handleOwnerCommand(msg) {
  const text = msg.text;
  const chatId = msg.chat.id;
  const parts = text.split(' ');
  const command = parts[0];
  const arg = parts[1];

  if (command === '/stats') {
    const [mastersRes, proRes, bookingsRes] = await Promise.all([
      supabase.from('masters').select('id', { count: 'exact', head: true }).eq('onboarding_step', 'done'),
      supabase.from('masters').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0])
    ]);

    await send(chatId,
      `📊 Статистика платформы\n\n` +
      `👥 Мастеров всего: ${mastersRes.count || 0}\n` +
      `⭐ Pro: ${proRes.count || 0}\n` +
      `🆓 Free: ${(mastersRes.count || 0) - (proRes.count || 0)}\n` +
      `📅 Записей сегодня: ${bookingsRes.count || 0}`
    );
    return;
  }

  if (command === '/masters') {
    const { data: masters } = await supabase
      .from('masters')
      .select('id, name, bot_username, plan, plan_expires_at, created_at')
      .eq('onboarding_step', 'done')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!masters || masters.length === 0) {
      await send(chatId, 'Мастеров пока нет');
      return;
    }

    const list = masters.map((m, i) =>
      `${i + 1}. ${m.name} @${m.bot_username}\n   ${m.plan.toUpperCase()}${m.plan_expires_at ? ` до ${m.plan_expires_at.split('T')[0]}` : ''}`
    ).join('\n\n');

    await send(chatId, `📋 Мастера (последние 20):\n\n${list}`);
    return;
  }

  if (command === '/master' && arg) {
    const { data: master } = await supabase
      .from('masters')
      .select('id, name, title, phone, bot_username, plan, plan_expires_at, created_at')
      .eq('id', arg)
      .single();

    if (!master) {
      await send(chatId, 'Мастер не найден');
      return;
    }

    await send(chatId,
      `👤 ${master.name}\n` +
      `💼 ${master.title || '—'}\n` +
      `📱 ${master.phone || '—'}\n` +
      `🤖 @${master.bot_username}\n` +
      `📦 Тариф: ${master.plan.toUpperCase()}\n` +
      `📅 Зарегистрирован: ${master.created_at.split('T')[0]}\n\n` +
      `ID: ${master.id}`
    );
    return;
  }

  if (command === '/block' && arg) {
    await supabase.from('masters').update({ plan: 'blocked' }).eq('id', arg);
    await send(chatId, `✅ Мастер ${arg} заблокирован`);
    return;
  }

  if (command === '/unblock' && arg) {
    await supabase.from('masters').update({ plan: 'free' }).eq('id', arg);
    await send(chatId, `✅ Мастер ${arg} разблокирован`);
    return;
  }

  await send(chatId,
    'Команды владельца:\n\n' +
    '/stats — статистика\n' +
    '/masters — список мастеров\n' +
    '/master [id] — детали мастера\n' +
    '/block [id] — заблокировать\n' +
    '/unblock [id] — разблокировать'
  );
}

// ── Вспомогательные функции ─────────────────────────────────

// Отправить сообщение через бот платформы
function send(chatId, text) {
  return platformBot.sendMessage(chatId, text);
}

// Проверить токен через Telegram API (getMe)
function telegramGetMe(token) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.telegram.org/bot${token}/getMe`,
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.ok) resolve(data.result);
            else reject(new Error(data.description));
          } catch {
            reject(new Error('Ошибка парсинга ответа Telegram'));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

module.exports = router;

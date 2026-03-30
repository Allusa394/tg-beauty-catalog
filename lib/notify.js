// ============================================================
// lib/notify.js — отправка сообщений через ботов
//
// Используется для уведомлений:
// - мастеру: новая запись (с кнопками Принять/Отклонить)
// - клиенту: подтверждение / отклонение / напоминание
// - мастеру: клиент отменил запись
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const supabase = require('./supabase');
const { decrypt } = require('./encrypt');

// Получить бота мастера по master_id
// Токен хранится зашифрованным AES-256-GCM — расшифровываем перед использованием
async function getMasterBot(masterId) {
  const { data: master } = await supabase
    .from('masters')
    .select('telegram_id, bot_token')
    .eq('id', masterId)
    .single();

  if (!master) return null;

  // Расшифровываем токен (формат: iv:authTag:encrypted)
  const token = master.bot_token.includes(':')
    ? decrypt(master.bot_token)
    : master.bot_token; // совместимость с незашифрованными токенами в разработке

  const bot = new TelegramBot(token);
  return { bot, masterTelegramId: master.telegram_id };
}

// ── Уведомление мастеру: новая запись ──────────────────────
async function notifyMaster(masterId, booking, client) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot, masterTelegramId } = result;

    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ')
      || client.username && `@${client.username}`
      || 'Клиент';

    const text =
      `📅 Новая запись!\n\n` +
      `👤 ${clientName}\n` +
      `💅 ${booking.service_name} — ${booking.price} ₽\n` +
      `🕐 ${booking.date} в ${booking.time_slot}\n\n` +
      `Подтверди или отклони запись:`;

    await bot.sendMessage(masterTelegramId, text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Принять', callback_data: `confirm_${booking.id}` },
          { text: '❌ Отклонить', callback_data: `decline_${booking.id}` }
        ]]
      }
    });
  } catch (err) {
    // Не падаем если бот недоступен — запись всё равно создаётся
    console.error('notifyMaster error:', err.message);
  }
}

// ── Уведомление клиенту: запись подтверждена ───────────────
async function notifyClientConfirmed(masterId, booking, clientTelegramId) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot } = result;

    const text =
      `✅ Запись подтверждена!\n\n` +
      `💅 ${booking.service_name}\n` +
      `📅 ${booking.date} в ${booking.time_slot}\n\n` +
      `Ждём тебя! 💫`;

    await bot.sendMessage(clientTelegramId, text);
  } catch (err) {
    console.error('notifyClientConfirmed error:', err.message);
  }
}

// ── Уведомление клиенту: запись отклонена ──────────────────
async function notifyClientDeclined(masterId, booking, clientTelegramId) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot } = result;

    const text =
      `❌ К сожалению, мастер не может принять тебя\n\n` +
      `💅 ${booking.service_name}\n` +
      `📅 ${booking.date} в ${booking.time_slot}\n\n` +
      `Попробуй выбрать другое время.`;

    await bot.sendMessage(clientTelegramId, text);
  } catch (err) {
    console.error('notifyClientDeclined error:', err.message);
  }
}

// ── Уведомление клиенту: запись просрочена (мастер не ответил) ──
async function notifyClientExpired(masterId, booking, clientTelegramId) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot } = result;

    const text =
      `⏰ Мастер не успел подтвердить твою запись\n\n` +
      `💅 ${booking.service_name}\n` +
      `📅 ${booking.date} в ${booking.time_slot}\n\n` +
      `Попробуй записаться снова.`;

    await bot.sendMessage(clientTelegramId, text);
  } catch (err) {
    console.error('notifyClientExpired error:', err.message);
  }
}

// ── Уведомление мастеру: клиент отменил запись ─────────────
async function notifyMasterCancelled(masterId, booking) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot, masterTelegramId } = result;

    const text =
      `❌ Клиент отменил запись\n\n` +
      `💅 ${booking.service_name}\n` +
      `📅 ${booking.date} в ${booking.time_slot}`;

    await bot.sendMessage(masterTelegramId, text);
  } catch (err) {
    console.error('notifyMasterCancelled error:', err.message);
  }
}

// ── Напоминание клиенту ─────────────────────────────────────
async function remindClient(masterId, booking, clientTelegramId, hoursLeft) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot } = result;

    const text =
      `⏰ Напоминание!\n\n` +
      `Через ${hoursLeft} ${hoursLeft === 1 ? 'час' : 'часа'} у тебя запись:\n` +
      `💅 ${booking.service_name}\n` +
      `📅 ${booking.date} в ${booking.time_slot}`;

    await bot.sendMessage(clientTelegramId, text);
  } catch (err) {
    console.error('remindClient error:', err.message);
  }
}

// ── Уведомление мастеру: Pro активирован ───────────────────
async function notifyMasterProActivated(masterId, months, expiresAt) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot, masterTelegramId } = result;
    const expiryDate = expiresAt instanceof Date
      ? expiresAt.toISOString().split('T')[0]
      : String(expiresAt).split('T')[0];

    const label = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '12 месяцев';

    const text =
      `🎉 Pro подписка активирована!\n\n` +
      `📦 Тариф: Pro (${label})\n` +
      `📅 Активен до: ${expiryDate}\n\n` +
      `Теперь тебе доступны:\n` +
      `✅ Неограниченное количество услуг\n` +
      `✅ Все темы оформления\n` +
      `✅ Свой логотип\n` +
      `✅ Без плашки "Powered by"\n\n` +
      `Спасибо за доверие! 💫`;

    await bot.sendMessage(masterTelegramId, text);
  } catch (err) {
    console.error('notifyMasterProActivated error:', err.message);
  }
}

// ── Уведомление мастеру: подписка истекает через 3 дня ─────
async function notifyMasterProExpiringSoon(masterId, expiresAt) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot, masterTelegramId } = result;
    const expiryDate = String(expiresAt).split('T')[0];

    const text =
      `⚠️ Подписка Pro истекает через 3 дня\n\n` +
      `📅 Дата окончания: ${expiryDate}\n\n` +
      `Продли подписку, чтобы не потерять доступ к услугам выше лимита.\n` +
      `Открой приложение и нажми "Продлить Pro" 👇`;

    await bot.sendMessage(masterTelegramId, text);
  } catch (err) {
    console.error('notifyMasterProExpiringSoon error:', err.message);
  }
}

// ── Напоминание мастеру: подписка истекла, пора продлить ───
async function notifyMasterProExpired(masterId) {
  try {
    const result = await getMasterBot(masterId);
    if (!result) return;

    const { bot, masterTelegramId } = result;

    const text =
      `❌ Подписка Pro истекла\n\n` +
      `Твои услуги сверх лимита заблокированы для клиентов.\n\n` +
      `Продли подписку, чтобы восстановить полный доступ:\n` +
      `• 1 месяц — 299 ₽\n` +
      `• 3 месяца — 799 ₽\n` +
      `• 12 месяцев — 2499 ₽\n\n` +
      `Открой приложение → раздел "Тариф" 👇`;

    await bot.sendMessage(masterTelegramId, text);
  } catch (err) {
    console.error('notifyMasterProExpired error:', err.message);
  }
}

module.exports = {
  notifyMaster,
  notifyClientConfirmed,
  notifyClientDeclined,
  notifyClientExpired,
  notifyMasterCancelled,
  remindClient,
  notifyMasterProActivated,
  notifyMasterProExpiringSoon,
  notifyMasterProExpired
};

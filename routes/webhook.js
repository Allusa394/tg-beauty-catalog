// ============================================================
// routes/webhook.js — входящие сообщения от Telegram
//
// POST /api/webhook/:masterId — личный бот мастера
//   Обрабатывает нажатия кнопок Принять / Отклонить
//   и фото от мастера (для портфолио — Этап 3)
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const {
  notifyClientConfirmed,
  notifyClientDeclined
} = require('../lib/notify');

// ── POST /api/webhook/:masterId ─────────────────────────────
router.post('/webhook/:masterId', async (req, res) => {
  // Telegram ждёт ответ 200 как можно быстрее
  res.sendStatus(200);

  const { masterId } = req.params;
  const update = req.body;

  try {
    // Обработка нажатия inline-кнопки (Принять / Отклонить)
    if (update.callback_query) {
      await handleCallbackQuery(masterId, update.callback_query);
      return;
    }

    // Обработка фото (портфолио) — будет реализовано в Этапе 3
    if (update.message?.photo) {
      // TODO: Этап 3 — загрузка фото в Cloudinary
      return;
    }

  } catch (err) {
    console.error(`webhook/${masterId} error:`, err.message);
  }
});

// ── Обработка нажатия кнопки ───────────────────────────────
async function handleCallbackQuery(masterId, callbackQuery) {
  const data = callbackQuery.data; // "confirm_<bookingId>" или "decline_<bookingId>"
  const masterTelegramId = callbackQuery.from.id;

  // Парсим действие и ID записи
  const [action, bookingId] = data.split('_');
  if (!['confirm', 'decline'].includes(action) || !bookingId) return;

  // Получить запись
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, client_id, service_name, date, time_slot, master_id')
    .eq('id', bookingId)
    .eq('master_id', masterId)
    .single();

  if (error || !booking) return;

  // Защита: нельзя подтвердить уже обработанную запись
  if (booking.status !== 'pending') {
    await answerCallback(masterId, masterTelegramId, callbackQuery.message?.message_id,
      '⚠️ Эта запись уже обработана');
    return;
  }

  if (action === 'confirm') {
    // Подтвердить запись
    await supabase
      .from('bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    // Узнать telegram_id клиента
    const clientTelegramId = await getClientTelegramId(booking.client_id);

    // Уведомить клиента
    if (clientTelegramId) {
      await notifyClientConfirmed(masterId, booking, clientTelegramId);
    }

    // Обновить сообщение мастеру (убрать кнопки, показать статус)
    await answerCallback(masterId, masterTelegramId, callbackQuery.message?.message_id,
      `✅ Принято!\n\n💅 ${booking.service_name}\n📅 ${booking.date} в ${booking.time_slot}`);

  } else if (action === 'decline') {
    // Отклонить запись
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    const clientTelegramId = await getClientTelegramId(booking.client_id);

    if (clientTelegramId) {
      await notifyClientDeclined(masterId, booking, clientTelegramId);
    }

    await answerCallback(masterId, masterTelegramId, callbackQuery.message?.message_id,
      `❌ Отклонено\n\n💅 ${booking.service_name}\n📅 ${booking.date} в ${booking.time_slot}`);
  }
}

// ── Получить telegram_id клиента по client_id ──────────────
async function getClientTelegramId(clientId) {
  const { data } = await supabase
    .from('clients')
    .select('telegram_id')
    .eq('id', clientId)
    .single();
  return data?.telegram_id || null;
}

// ── Обновить сообщение мастеру (убрать кнопки) ─────────────
async function answerCallback(masterId, masterTelegramId, messageId, newText) {
  try {
    const { data: master } = await supabase
      .from('masters')
      .select('bot_token')
      .eq('id', masterId)
      .single();

    if (!master) return;

    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(master.bot_token);

    // Редактируем исходное сообщение — убираем кнопки, показываем результат
    await bot.editMessageText(newText, {
      chat_id: masterTelegramId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
  } catch (err) {
    console.error('answerCallback error:', err.message);
  }
}

module.exports = router;

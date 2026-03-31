// ============================================================
// routes/bookings.js — создание записи клиентом
//
// POST /api/bookings — создать новую запись
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { notifyMaster } = require('../lib/notify');
const logger = require('../lib/logger');

// ── POST /api/bookings ──────────────────────────────────────
// Клиент выбирает услугу и слот — создаём запись.
// Статус: pending. Мастер получает уведомление с кнопками.
router.post('/bookings', async (req, res) => {
  const { master_id, service_id, date, time_slot, client } = req.body;

  // Проверка обязательных полей
  if (!master_id || !service_id || !date || !time_slot || !client?.telegram_id) {
    return res.status(400).json({ error: 'Не хватает данных для записи' });
  }

  // Валидация формата даты
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Неверный формат даты. Используй YYYY-MM-DD' });
  }

  try {
    // 1. Проверить — не занят ли слот (защита от двойной записи)
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('master_id', master_id)
      .eq('date', date)
      .eq('time_slot', time_slot)
      .in('status', ['pending', 'confirmed'])
      .single();

    if (existingBooking) {
      logger.warn('booking_slot_taken', { master_id, date, time_slot });
      return res.status(409).json({ error: 'Этот слот уже занят. Выбери другое время.' });
    }

    // 2. Получить данные услуги (кешируем name и price в запись)
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('name, price')
      .eq('id', service_id)
      .eq('master_id', master_id)
      .eq('is_active', true)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    // 3. Найти или создать клиента
    let clientRecord;

    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('telegram_id', client.telegram_id)
      .single();

    if (existingClient) {
      clientRecord = existingClient;
      // Обновляем имя/username на случай если изменились
      await supabase
        .from('clients')
        .update({
          first_name: client.first_name || null,
          last_name: client.last_name || null,
          username: client.username || null
        })
        .eq('telegram_id', client.telegram_id);
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          telegram_id: client.telegram_id,
          first_name: client.first_name || null,
          last_name: client.last_name || null,
          username: client.username || null
        })
        .select('id')
        .single();

      if (clientError) throw clientError;
      clientRecord = newClient;
    }

    // 4. Лимит записей — не более 5 в день от одного клиента к одному мастеру
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('master_id', master_id)
      .eq('client_id', clientRecord.id)
      .gte('created_at', `${today}T00:00:00`);

    if (count >= 5) {
      logger.security('booking_daily_limit', { master_id, client_telegram_id: client.telegram_id });
      return res.status(429).json({ error: 'Слишком много записей за сегодня' });
    }

    // 5. Создать запись
    // expires_at = текущее время + 2 часа (таймаут подтверждения мастером)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        master_id,
        client_id: clientRecord.id,
        service_id,
        date,
        time_slot,
        status: 'pending',
        service_name: service.name,
        price: service.price,
        expires_at: expiresAt
      })
      .select('id, date, time_slot, service_name, price, status')
      .single();

    if (bookingError) throw bookingError;

    // 6. Уведомить мастера через его бота (кнопки Принять / Отклонить)
    await notifyMaster(master_id, booking, client);

    logger.info('booking_created', { booking_id: booking.id, master_id, date, time_slot, service: service.name });
    res.status(201).json({ success: true, booking });

  } catch (err) {
    logger.error('booking_create_failed', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

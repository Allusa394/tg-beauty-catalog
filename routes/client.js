// ============================================================
// routes/client.js — эндпоинты для клиента
//
// GET    /api/client/bookings      — свои записи
// DELETE /api/client/bookings/:id  — отменить запись
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { notifyMasterCancelled, notifyClientCancelled } = require('../lib/notify');

// ── GET /api/client/bookings?telegram_id= ──────────────────
// Возвращает все записи клиента (активные и история)
router.get('/client/bookings', async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ error: 'Укажи telegram_id' });
  }

  try {
    // Найти клиента по telegram_id
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('telegram_id', telegram_id)
      .single();

    if (!client) {
      return res.json({ bookings: [] });
    }

    // Получить все записи клиента с данными о мастере
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, date, time_slot, status, service_name, price, created_at,
        masters (name, phone)
      `)
      .eq('client_id', client.id)
      .order('date', { ascending: false })
      .order('time_slot', { ascending: false });

    if (error) throw error;

    res.json({ bookings: bookings || [] });

  } catch (err) {
    console.error('GET /client/bookings error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── DELETE /api/client/bookings/:id ────────────────────────
// Клиент отменяет свою запись.
// Отменить можно только pending или confirmed запись.
router.delete('/client/bookings/:id', async (req, res) => {
  const { id } = req.params;
  const { telegram_id } = req.body;

  if (!telegram_id) {
    return res.status(400).json({ error: 'Укажи telegram_id' });
  }

  try {
    // Найти клиента
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('telegram_id', telegram_id)
      .single();

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    // Найти запись и убедиться что она принадлежит этому клиенту
    const { data: booking, error: findError } = await supabase
      .from('bookings')
      .select('id, status, master_id, date, time_slot, service_name')
      .eq('id', id)
      .eq('client_id', client.id)
      .single();

    if (findError || !booking) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ error: 'Эту запись нельзя отменить' });
    }

    // Отменить запись
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    // Уведомить мастера об отмене
    await notifyMasterCancelled(booking.master_id, booking);

    res.json({ success: true });

  } catch (err) {
    console.error('DELETE /client/bookings/:id error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

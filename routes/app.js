// ============================================================
// routes/app.js — публичные эндпоинты мини-аппа
//
// GET /api/app/:botUsername       — данные мастера, услуги, расписание
// GET /api/app/:botUsername/slots — свободные слоты на дату
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ── GET /api/app/:botUsername ───────────────────────────────
// Отдаёт фронтенду всё что нужно для отображения:
// профиль мастера, активные услуги, расписание
router.get('/app/:botUsername', async (req, res) => {
  const { botUsername } = req.params;

  try {
    // 1. Найти мастера по bot_username
    const { data: master, error: masterError } = await supabase
      .from('masters')
      .select('id, name, title, about, phone, address, address_link, theme, logo_url, show_branding, plan, plan_expires_at, telegram_id')
      .eq('bot_username', botUsername)
      .single();

    if (masterError || !master) {
      return res.status(404).json({ error: 'Мастер не найден' });
    }

    // 2. Получить активные услуги (не скрытые и не заблокированные)
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, category, name, short_desc, description, price, duration, emoji, order_index')
      .eq('master_id', master.id)
      .eq('is_active', true)
      .eq('is_locked', false)
      .order('order_index', { ascending: true });

    if (servicesError) throw servicesError;

    // 3. Получить расписание мастера
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedule')
      .select('work_hours, days_off, manual_busy')
      .eq('master_id', master.id)
      .single();

    if (scheduleError && scheduleError.code !== 'PGRST116') throw scheduleError;

    res.json({
      master,
      services: services || [],
      schedule: schedule || {
        work_hours: ['9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'],
        days_off: [0],
        manual_busy: {}
      }
    });

  } catch (err) {
    console.error('GET /app/:botUsername error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── GET /api/app/:botUsername/slots?date=YYYY-MM-DD ─────────
// Возвращает свободные временные слоты на конкретную дату.
// Вычитает из расписания уже занятые записи и manual_busy.
router.get('/app/:botUsername/slots', async (req, res) => {
  const { botUsername } = req.params;
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Укажи дату в формате YYYY-MM-DD' });
  }

  try {
    // Найти мастера
    const { data: master, error: masterError } = await supabase
      .from('masters')
      .select('id')
      .eq('bot_username', botUsername)
      .single();

    if (masterError || !master) {
      return res.status(404).json({ error: 'Мастер не найден' });
    }

    // Получить расписание
    const { data: schedule } = await supabase
      .from('schedule')
      .select('work_hours, days_off, manual_busy')
      .eq('master_id', master.id)
      .single();

    const workHours = schedule?.work_hours || ['9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
    const daysOff = schedule?.days_off || [0];
    const manualBusy = schedule?.manual_busy || {};

    // Проверить — выходной ли день
    const dayOfWeek = new Date(date).getDay();
    if (daysOff.includes(dayOfWeek)) {
      return res.json({ slots: [], reason: 'выходной' });
    }

    // Получить уже занятые слоты из записей (только подтверждённые и ожидающие)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('master_id', master.id)
      .eq('date', date)
      .in('status', ['pending', 'confirmed']);

    const bookedSlots = new Set((bookings || []).map(b => b.time_slot));

    // Manual busy для этой даты
    const manualBusySlots = new Set(manualBusy[date] || []);

    // Свободные слоты = рабочие часы минус занятые
    const freeSlots = workHours.filter(slot =>
      !bookedSlots.has(slot) && !manualBusySlots.has(slot)
    );

    res.json({ slots: freeSlots });

  } catch (err) {
    console.error('GET /app/:botUsername/slots error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

// ============================================================
// routes/master.js — панель управления мастера
//
// GET/PUT  /api/master/me              — профиль
// GET/POST /api/master/services        — услуги
// PUT/DEL  /api/master/services/:id    — редактировать/удалить
// GET/PUT  /api/master/schedule        — расписание
// GET/PUT  /api/master/bookings        — записи
// GET/DEL  /api/master/portfolio       — портфолио
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ── Middleware: определить мастера по telegram_id ───────────
// Все запросы мастера передают telegram_id в заголовке
async function requireMaster(req, res, next) {
  const telegramId = req.headers['x-telegram-id'];
  if (!telegramId) {
    return res.status(401).json({ error: 'Не указан x-telegram-id' });
  }

  const { data: master } = await supabase
    .from('masters')
    .select('id, name, plan, plan_expires_at')
    .eq('telegram_id', telegramId)
    .single();

  if (!master) {
    return res.status(403).json({ error: 'Мастер не найден' });
  }

  req.master = master;
  next();
}

// ── Профиль ─────────────────────────────────────────────────

router.get('/master/me', requireMaster, async (req, res) => {
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, title, about, phone, address, address_link, theme, logo_url, show_branding, plan, plan_expires_at, bot_username')
    .eq('id', req.master.id)
    .single();

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json(data);
});

router.put('/master/me', requireMaster, async (req, res) => {
  const allowed = ['name', 'title', 'about', 'phone', 'address', 'address_link', 'theme', 'show_branding'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('masters')
    .update(updates)
    .eq('id', req.master.id);

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json({ success: true });
});

// ── Услуги ──────────────────────────────────────────────────

router.get('/master/services', requireMaster, async (req, res) => {
  const { data, error } = await supabase
    .from('services')
    .select('id, category, name, short_desc, description, price, duration, emoji, is_active, is_locked, order_index')
    .eq('master_id', req.master.id)
    .order('order_index', { ascending: true });

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json(data || []);
});

router.post('/master/services', requireMaster, async (req, res) => {
  // Проверить лимит Free тарифа
  if (req.master.plan === 'free') {
    const { count } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('master_id', req.master.id)
      .eq('is_active', true)
      .eq('is_locked', false);

    if (count >= 5) {
      return res.status(403).json({
        error: 'Достигнут лимит 5 услуг на Free тарифе',
        upgrade_required: true
      });
    }
  }

  const { category, name, short_desc, description, price, duration, emoji } = req.body;
  if (!category || !name || !price) {
    return res.status(400).json({ error: 'Укажи category, name и price' });
  }

  // order_index — в конец списка
  const { count: total } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('master_id', req.master.id);

  const { data, error } = await supabase
    .from('services')
    .insert({
      master_id: req.master.id,
      category, name, short_desc, description,
      price: Number(price),
      duration, emoji,
      order_index: total || 0
    })
    .select('id')
    .single();

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.status(201).json({ success: true, id: data.id });
});

router.put('/master/services/:id', requireMaster, async (req, res) => {
  const allowed = ['category', 'name', 'short_desc', 'description', 'price', 'duration', 'emoji', 'is_active', 'order_index'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', req.params.id)
    .eq('master_id', req.master.id);

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json({ success: true });
});

router.delete('/master/services/:id', requireMaster, async (req, res) => {
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', req.params.id)
    .eq('master_id', req.master.id);

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json({ success: true });
});

// ── Расписание ──────────────────────────────────────────────

router.get('/master/schedule', requireMaster, async (req, res) => {
  const { data, error } = await supabase
    .from('schedule')
    .select('work_hours, days_off, manual_busy')
    .eq('master_id', req.master.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Ошибка сервера' });
  }

  res.json(data || {
    work_hours: ['9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'],
    days_off: [0],
    manual_busy: {}
  });
});

router.put('/master/schedule', requireMaster, async (req, res) => {
  const { work_hours, days_off, manual_busy } = req.body;

  // upsert — создаём если нет, обновляем если есть
  const { error } = await supabase
    .from('schedule')
    .upsert({
      master_id: req.master.id,
      ...(work_hours !== undefined && { work_hours }),
      ...(days_off !== undefined && { days_off }),
      ...(manual_busy !== undefined && { manual_busy })
    }, { onConflict: 'master_id' });

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json({ success: true });
});

// ── Записи ──────────────────────────────────────────────────

router.get('/master/bookings', requireMaster, async (req, res) => {
  const { status, date } = req.query;

  let query = supabase
    .from('bookings')
    .select(`
      id, date, time_slot, status, service_name, price, created_at,
      clients (first_name, last_name, username, phone)
    `)
    .eq('master_id', req.master.id)
    .order('date', { ascending: true })
    .order('time_slot', { ascending: true });

  if (status) query = query.eq('status', status);
  if (date) query = query.eq('date', date);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json(data || []);
});

// ── Портфолио ───────────────────────────────────────────────

router.get('/master/portfolio', requireMaster, async (req, res) => {
  const { data, error } = await supabase
    .from('portfolio')
    .select('id, cloudinary_url, caption, created_at')
    .eq('master_id', req.master.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json(data || []);
});

router.delete('/master/portfolio/:id', requireMaster, async (req, res) => {
  const { error } = await supabase
    .from('portfolio')
    .delete()
    .eq('id', req.params.id)
    .eq('master_id', req.master.id);

  if (error) return res.status(500).json({ error: 'Ошибка сервера' });
  res.json({ success: true });
});

module.exports = router;

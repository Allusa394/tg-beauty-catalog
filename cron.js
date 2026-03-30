// ============================================================
// cron.js — автоматические задачи по расписанию
//
// Подключается в server.js один раз при старте.
//
// Задачи:
// - Каждые 15 минут: закрыть просроченные записи (expired)
// - Каждый час: отправить напоминания за 24ч и 2ч
// - Каждую ночь 00:00: заблокировать услуги у истёкших подписок
// ============================================================

const cron = require('node-cron');
const supabase = require('./lib/supabase');
const {
  notifyClientExpired,
  remindClient,
  notifyMasterProExpiringSoon,
  notifyMasterProExpired
} = require('./lib/notify');

// ── Каждые 15 минут: закрыть просроченные записи ───────────
cron.schedule('*/15 * * * *', async () => {
  console.log('[cron] Проверка просроченных записей...');
  try {
    const now = new Date().toISOString();

    // Найти все pending записи у которых истёк expires_at
    const { data: expired } = await supabase
      .from('bookings')
      .select('id, master_id, client_id, service_name, date, time_slot')
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (!expired || expired.length === 0) return;

    // Пометить как expired
    const expiredIds = expired.map(b => b.id);
    await supabase
      .from('bookings')
      .update({ status: 'expired', updated_at: now })
      .in('id', expiredIds);

    // Уведомить каждого клиента
    for (const booking of expired) {
      const clientTelegramId = await getClientTelegramId(booking.client_id);
      if (clientTelegramId) {
        await notifyClientExpired(booking.master_id, booking, clientTelegramId);
      }
    }

    console.log(`[cron] Закрыто просроченных записей: ${expired.length}`);
  } catch (err) {
    console.error('[cron] expired error:', err.message);
  }
});

// ── Каждый час: напоминания клиентам ───────────────────────
cron.schedule('0 * * * *', async () => {
  console.log('[cron] Проверка напоминаний...');
  try {
    const now = new Date();

    // Напоминание за 24 часа
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const date24 = in24h.toISOString().split('T')[0];
    const time24 = in24h.toTimeString().slice(0, 5); // "14:00"

    const { data: bookings24 } = await supabase
      .from('bookings')
      .select('id, master_id, client_id, service_name, date, time_slot')
      .eq('status', 'confirmed')
      .eq('reminded_24h', false)
      .eq('date', date24)
      .eq('time_slot', time24);

    for (const booking of bookings24 || []) {
      const clientTelegramId = await getClientTelegramId(booking.client_id);
      if (clientTelegramId) {
        await remindClient(booking.master_id, booking, clientTelegramId, 24);
        await supabase
          .from('bookings')
          .update({ reminded_24h: true })
          .eq('id', booking.id);
      }
    }

    // Напоминание за 2 часа
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const date2 = in2h.toISOString().split('T')[0];
    const time2 = in2h.toTimeString().slice(0, 5);

    const { data: bookings2 } = await supabase
      .from('bookings')
      .select('id, master_id, client_id, service_name, date, time_slot')
      .eq('status', 'confirmed')
      .eq('reminded_2h', false)
      .eq('date', date2)
      .eq('time_slot', time2);

    for (const booking of bookings2 || []) {
      const clientTelegramId = await getClientTelegramId(booking.client_id);
      if (clientTelegramId) {
        await remindClient(booking.master_id, booking, clientTelegramId, 2);
        await supabase
          .from('bookings')
          .update({ reminded_2h: true })
          .eq('id', booking.id);
      }
    }

    const total = (bookings24?.length || 0) + (bookings2?.length || 0);
    if (total > 0) console.log(`[cron] Напоминаний отправлено: ${total}`);

  } catch (err) {
    console.error('[cron] reminders error:', err.message);
  }
});

// ── Каждую ночь 00:00: блокировка услуг истёкших подписок ──
cron.schedule('0 0 * * *', async () => {
  console.log('[cron] Проверка истёкших подписок...');
  try {
    const now = new Date().toISOString();

    // Найти Pro мастеров у которых подписка истекла и услуги ещё не заблокированы
    const { data: expiredMasters } = await supabase
      .from('masters')
      .select('id')
      .eq('plan', 'pro')
      .lt('plan_expires_at', now)
      .eq('services_locked', false);

    if (!expiredMasters || expiredMasters.length === 0) return;

    for (const master of expiredMasters) {
      // Получить все активные услуги мастера по порядку
      const { data: services } = await supabase
        .from('services')
        .select('id')
        .eq('master_id', master.id)
        .eq('is_active', true)
        .eq('is_locked', false)
        .order('order_index', { ascending: true });

      if (!services || services.length <= 5) continue;

      // Заблокировать все услуги начиная с 6-й
      const tolock = services.slice(5).map(s => s.id);
      await supabase
        .from('services')
        .update({ is_locked: true })
        .in('id', tolock);

      // Пометить мастера как заблокированного (чтобы не обрабатывать повторно)
      await supabase
        .from('masters')
        .update({ plan: 'free', services_locked: true })
        .eq('id', master.id);
    }

    console.log(`[cron] Обработано истёкших подписок: ${expiredMasters.length}`);
  } catch (err) {
    console.error('[cron] subscription lock error:', err.message);
  }
});

// ── Каждый день в 10:00: уведомления о подписке ────────────
cron.schedule('0 10 * * *', async () => {
  console.log('[cron] Проверка подписок...');
  try {
    const now = new Date();

    // Найти Pro мастеров чья подписка истекает ровно через 3 дня
    const in3days = new Date(now);
    in3days.setDate(in3days.getDate() + 3);
    const in3daysStr = in3days.toISOString().split('T')[0];

    const { data: expiringSoon } = await supabase
      .from('masters')
      .select('id, plan_expires_at')
      .eq('plan', 'pro')
      .gte('plan_expires_at', in3daysStr + 'T00:00:00.000Z')
      .lt('plan_expires_at', in3daysStr + 'T23:59:59.999Z');

    for (const master of expiringSoon || []) {
      await notifyMasterProExpiringSoon(master.id, master.plan_expires_at);
    }

    if (expiringSoon?.length > 0) {
      console.log(`[cron] Предупреждений об истечении подписки: ${expiringSoon.length}`);
    }

    // Напомнить мастерам с истёкшей подпиской раз в 3 дня
    // Выбираем Free мастеров у которых plan_expires_at есть (значит были Pro)
    // и дней с истечения кратно 3
    const { data: expiredMasters } = await supabase
      .from('masters')
      .select('id, plan_expires_at')
      .eq('plan', 'free')
      .not('plan_expires_at', 'is', null)
      .lt('plan_expires_at', now.toISOString());

    let reminders = 0;
    for (const master of expiredMasters || []) {
      const daysSinceExpiry = Math.floor(
        (now - new Date(master.plan_expires_at)) / (24 * 60 * 60 * 1000)
      );
      // Напоминаем в день истечения (0) и каждые 3 дня после
      if (daysSinceExpiry >= 0 && daysSinceExpiry % 3 === 0) {
        await notifyMasterProExpired(master.id);
        reminders++;
      }
    }

    if (reminders > 0) console.log(`[cron] Напоминаний о продлении подписки: ${reminders}`);

  } catch (err) {
    console.error('[cron] subscription notify error:', err.message);
  }
});

// ── Вспомогательная функция ─────────────────────────────────
async function getClientTelegramId(clientId) {
  const { data } = await supabase
    .from('clients')
    .select('telegram_id')
    .eq('id', clientId)
    .single();
  return data?.telegram_id || null;
}

console.log('[cron] Задачи запущены');

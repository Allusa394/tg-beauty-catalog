// ============================================================
// routes/payment.js — монетизация через ЮKassa
//
// POST /api/payment/invoice — создать счёт на оплату Pro
// POST /api/payment/webhook — подтверждение оплаты от ЮKassa
//
// Цены:
//   1 месяц  — 299 ₽
//   3 месяца — 799 ₽
//  12 месяцев — 2499 ₽
// ============================================================

const express = require('express');
const router  = express.Router();
const https   = require('https');
const crypto  = require('crypto');
const supabase = require('../lib/supabase');

const SHOP_ID      = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY   = process.env.YUKASSA_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Тарифные планы
const PLANS = {
  1:  { price: '299.00',  label: 'Pro — 1 месяц' },
  3:  { price: '799.00',  label: 'Pro — 3 месяца' },
  12: { price: '2499.00', label: 'Pro — 12 месяцев' }
};

// ── POST /api/payment/invoice ───────────────────────────────
// Body: { master_id, months }
// Возвращает: { payment_id, confirmation_url }
router.post('/payment/invoice', async (req, res) => {
  const { master_id, months } = req.body;

  if (!master_id || !months) {
    return res.status(400).json({ error: 'master_id и months обязательны' });
  }

  const plan = PLANS[Number(months)];
  if (!plan) {
    return res.status(400).json({ error: 'months должен быть 1, 3 или 12' });
  }

  // Проверить что мастер существует
  const { data: master } = await supabase
    .from('masters')
    .select('id, bot_username')
    .eq('id', master_id)
    .single();

  if (!master) {
    return res.status(404).json({ error: 'Мастер не найден' });
  }

  // После оплаты ЮKassa вернёт пользователя на страницу мастера
  const returnUrl = `${FRONTEND_URL}/?bot=${master.bot_username}&payment=success`;

  try {
    const payment = await createYukassaPayment({
      amount: plan.price,
      description: plan.label,
      returnUrl,
      metadata: { master_id, months: String(months) }
    });

    res.json({
      payment_id: payment.id,
      confirmation_url: payment.confirmation.confirmation_url
    });
  } catch (err) {
    console.error('[payment] createPayment error:', err.message);
    res.status(500).json({ error: 'Ошибка создания платежа' });
  }
});

// ── POST /api/payment/webhook ───────────────────────────────
// ЮKassa вызывает этот эндпоинт при изменении статуса платежа.
// Отвечаем 200 сразу — обрабатываем асинхронно.
router.post('/payment/webhook', async (req, res) => {
  res.sendStatus(200);

  const { event, object } = req.body;

  // Нас интересует только успешная оплата
  if (event !== 'payment.succeeded') return;
  if (!object?.id) return;

  try {
    // Верификация: перезапрашиваем платёж из ЮKassa напрямую
    // Это защита от поддельных webhook-запросов
    const payment = await getYukassaPayment(object.id);

    if (payment.status !== 'succeeded') return;

    const { master_id, months } = payment.metadata || {};
    if (!master_id || !months) return;

    const monthsNum = parseInt(months, 10);

    // Получить текущий план мастера
    const { data: master } = await supabase
      .from('masters')
      .select('plan, plan_expires_at')
      .eq('id', master_id)
      .single();

    if (!master) return;

    // Если Pro уже активен — продлеваем от текущей даты истечения
    // Если Free — активируем с сегодня
    const baseDate = (
      master.plan === 'pro' &&
      master.plan_expires_at &&
      new Date(master.plan_expires_at) > new Date()
    )
      ? new Date(master.plan_expires_at)
      : new Date();

    const expiresAt = new Date(baseDate);
    expiresAt.setMonth(expiresAt.getMonth() + monthsNum);

    // Активировать Pro
    await supabase.from('masters').update({
      plan: 'pro',
      plan_expires_at: expiresAt.toISOString(),
      services_locked: false
    }).eq('id', master_id);

    // Разблокировать все услуги мастера
    await supabase.from('services')
      .update({ is_locked: false })
      .eq('master_id', master_id);

    // Уведомить мастера через его бот
    const { notifyMasterProActivated } = require('../lib/notify');
    await notifyMasterProActivated(master_id, monthsNum, expiresAt);

    console.log(`[payment] Pro активирован: master=${master_id}, до ${expiresAt.toISOString().split('T')[0]}`);
  } catch (err) {
    console.error('[payment] webhook error:', err.message);
  }
});

// ── ЮKassa API helpers ──────────────────────────────────────

// Заголовок авторизации Basic (shopId:secretKey в base64)
function yukassaAuth() {
  return 'Basic ' + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
}

// Создать платёж в ЮKassa
function createYukassaPayment({ amount, description, returnUrl, metadata }) {
  const body = JSON.stringify({
    amount:       { value: amount, currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: returnUrl },
    capture:      true,
    description,
    metadata
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.yookassa.ru',
        path:     '/v3/payments',
        method:   'POST',
        headers:  {
          'Content-Type':    'application/json',
          'Content-Length':  Buffer.byteLength(body),
          'Authorization':   yukassaAuth(),
          // Уникальный ключ идемпотентности — защита от дублирования при ретраях
          'Idempotence-Key': crypto.randomUUID()
        }
      },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'error') reject(new Error(parsed.description));
            else resolve(parsed);
          } catch {
            reject(new Error('Ошибка парсинга ответа ЮKassa'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Получить платёж по ID (для верификации webhook)
function getYukassaPayment(paymentId) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: 'api.yookassa.ru',
        path:     `/v3/payments/${paymentId}`,
        headers:  { 'Authorization': yukassaAuth() }
      },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'error') reject(new Error(parsed.description));
            else resolve(parsed);
          } catch {
            reject(new Error('Ошибка парсинга ответа ЮKassa'));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

module.exports = router;

// ============================================================
// server.js — главный файл Express-сервера
// Запуск: npm start (продакшн) или npm run dev (разработка)
// ============================================================

require('dotenv').config();
const express = require('express');
const app = express();
const logger = require('./lib/log');

// ── Middleware ──────────────────────────────────────────────

// Парсим JSON в теле запроса
app.use(express.json());

// CORS — разрешаем запросы с фронтенда
app.use((req, res, next) => {
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rate limiting — максимум 10 запросов в секунду с одного IP
const requestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 1000;
  const maxRequests = 10;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, start: now });
    return next();
  }

  const data = requestCounts.get(ip);
  if (now - data.start > windowMs) {
    requestCounts.set(ip, { count: 1, start: now });
    return next();
  }

  data.count++;
  if (data.count > maxRequests) {
    logger.security('rate_limit_exceeded', { ip, path: req.path });
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
});

// ── Роуты ──────────────────────────────────────────────────

const appRoutes             = require('./routes/app');
const bookingRoutes         = require('./routes/bookings');
const clientRoutes          = require('./routes/client');
const masterRoutes          = require('./routes/master');
const webhookRoutes         = require('./routes/webhook');
const platformWebhookRoutes = require('./routes/platformWebhook');
const paymentRoutes         = require('./routes/payment');

app.use('/api', appRoutes);
app.use('/api', bookingRoutes);
app.use('/api', clientRoutes);
app.use('/api', masterRoutes);
app.use('/api', webhookRoutes);
app.use('/api', platformWebhookRoutes);
app.use('/api', paymentRoutes);

// Cron-задачи (запускаются только на VPS, не в разработке)
if (process.env.NODE_ENV === 'production') {
  require('./cron');
}

// ── Проверка работоспособности ─────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'tg-beauty-catalog API работает' });
});

// ── Обработка ошибок ───────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('server_error', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ── Запуск ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info('server_started', { port: PORT, supabase: process.env.SUPABASE_URL ? 'ok' : 'NOT SET' });
});

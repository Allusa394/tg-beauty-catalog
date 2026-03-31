// ============================================================
// lib/logger.js — структурированное логирование
//
// Уровни:
//   logger.info(event, data)     — обычные события
//   logger.warn(event, data)     — предупреждения
//   logger.error(event, err)     — ошибки
//   logger.security(event, data) — подозрительные действия
//
// Логи пишутся в:
//   - консоль (всегда)
//   - logs/app.log (все уровни)
//   - logs/error.log (только warn + error + security)
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── Папка для логов ─────────────────────────────────────────
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const APP_LOG   = path.join(LOGS_DIR, 'app.log');
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');

// ── Цвета для консоли ────────────────────────────────────────
const COLORS = {
  INFO:     '\x1b[36m',  // cyan
  WARN:     '\x1b[33m',  // yellow
  ERROR:    '\x1b[31m',  // red
  SECURITY: '\x1b[35m',  // magenta
  RESET:    '\x1b[0m',
};

// ── Ротация логов (удалять файлы старше 14 дней) ────────────
function rotateLogs() {
  const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 дней
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(LOGS_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (_) {}
}

// Ротация раз в день
setInterval(rotateLogs, 24 * 60 * 60 * 1000);

// ── Форматирование ───────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function formatData(data) {
  if (!data) return '';
  if (data instanceof Error) return ` | ${data.message}`;
  if (typeof data === 'string') return ` | ${data}`;
  try {
    return ` | ${JSON.stringify(data)}`;
  } catch (_) {
    return ` | [unparseable]`;
  }
}

// ── Запись в файл ────────────────────────────────────────────
function writeToFile(filePath, line) {
  try {
    fs.appendFileSync(filePath, line + '\n');
  } catch (_) {}
}

// ── Основная функция логирования ─────────────────────────────
function log(level, event, data) {
  const ts   = timestamp();
  const line = `[${ts}] [${level}] ${event}${formatData(data)}`;

  // Консоль с цветом
  const color = COLORS[level] || COLORS.RESET;
  console.log(`${color}${line}${COLORS.RESET}`);

  // Файл app.log — всё
  writeToFile(APP_LOG, line);

  // Файл error.log — только проблемы
  if (level !== 'INFO') {
    writeToFile(ERROR_LOG, line);
  }
}

// ── Публичный API ─────────────────────────────────────────────
const logger = {
  // Обычные события: запись создана, платёж прошёл, мастер зарегистрирован
  info(event, data) {
    log('INFO', event, data);
  },

  // Предупреждения: Telegram не ответил, слот занят, лимит Free
  warn(event, data) {
    log('WARN', event, data);
  },

  // Ошибки: упал запрос, БД недоступна, JSON не распарсился
  error(event, data) {
    log('ERROR', event, data);
  },

  // Безопасность: rate limit, попытка доступа без авторизации, спам
  security(event, data) {
    log('SECURITY', event, data);
  },

  // Путь к файлу логов (для справки)
  paths: { app: APP_LOG, error: ERROR_LOG },
};

module.exports = logger;

# BACKEND-PLAN.md — Архитектура бэкенда платформы

**Концепция:** White-Label SaaS платформа для бьюти-мастеров.
Каждый мастер получает своё приложение и своего бота, платформа управляет всем из одного бэкенда.

---

## Ответы, на которых строится план

| Вопрос | Ответ |
|---|---|
| Регистрация мастера | Через Telegram-бот платформы |
| Панель управления | Мини-апп в режиме владельца |
| Уведомления клиентам | Личный бот каждого мастера |
| Загрузка фото | Отправляет фото боту в Telegram |
| Оплата подписки | TBD — нужно решить отдельно (см. plan.md) |
| Подтверждение записи | Мастер вручную (Принять / Отклонить) |
| Технология бэкенда | Supabase (БД) + VPS на Beget (сервер ботов) |

---

## Стек технологий — ОКОНЧАТЕЛЬНЫЙ

> ⚠️ Исправлено: убрано противоречие между Vercel Functions и Beget VPS.
> Vercel — ТОЛЬКО статический фронтенд. Весь бэкенд — на Beget VPS.

| Компонент | Технология | Где живёт |
|---|---|---|
| Фронтенд (мини-апп) | HTML/CSS/JS (уже готов) | Vercel — автодеплой из GitHub |
| Сервер API + боты | Node.js (Express) | Beget VPS |
| База данных | Supabase (PostgreSQL) | Supabase cloud |
| Хранение фото | Cloudinary | Cloudinary cloud |
| Планировщик напоминаний | node-cron на том же VPS | Beget VPS |

### Как фронтенд общается с бэкендом
```
Vercel (tg-app/) → HTTPS запросы → Beget VPS (api.yourdomain.ru)
                                          ↓
                                    Supabase PostgreSQL
```

---

## База данных — таблицы

> ⚠️ Исправлено: убран `services_count` (денормализация = рассинхронизация).
> Количество услуг считается через COUNT запрос.
> Добавлен ON DELETE CASCADE на все foreign keys.

### `masters` — мастера платформы
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
telegram_id     BIGINT UNIQUE NOT NULL   -- Telegram user ID мастера
bot_token       TEXT UNIQUE NOT NULL     -- Токен личного бота (зашифрован AES-256)
bot_username    TEXT UNIQUE NOT NULL     -- @username бота

-- Профиль
name            TEXT NOT NULL
title           TEXT
about           TEXT
phone           TEXT
address         TEXT
address_link    TEXT

-- Подписка
plan            TEXT DEFAULT 'free'      -- 'free' | 'pro'
plan_expires_at TIMESTAMPTZ              -- NULL = free навсегда

-- White-Label (только plan=pro)
theme           TEXT DEFAULT 'rose'      -- 'rose'|'lavender'|'gold'|'dark'
logo_url        TEXT
show_branding   BOOLEAN DEFAULT true     -- плашка "Powered by платформой"

-- Состояние онбординга (для бота платформы)
onboarding_step TEXT DEFAULT 'start'     -- 'start'|'name'|'title'|'phone'|'token'|'done'

created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### `services` — услуги каждого мастера
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
master_id   UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE
category    TEXT NOT NULL              -- 'mani'|'pedi'|'brows'|'lashes'
name        TEXT NOT NULL
short_desc  TEXT
description TEXT
price       INTEGER NOT NULL
duration    TEXT
emoji       TEXT DEFAULT '💅'
is_active   BOOLEAN DEFAULT true
order_index INTEGER DEFAULT 0
created_at  TIMESTAMPTZ DEFAULT NOW()
```

> Лимит 5 услуг для free тарифа — проверяется через:
> ```sql
> SELECT COUNT(*) FROM services WHERE master_id = $1 AND is_active = true
> ```
> Не полагаемся на денормализованный счётчик.

### `portfolio` — фото работ мастера
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
master_id        UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE
cloudinary_url   TEXT NOT NULL
telegram_file_id TEXT
caption          TEXT
created_at       TIMESTAMPTZ DEFAULT NOW()
```

### `clients` — клиенты (общая таблица)
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
telegram_id BIGINT UNIQUE NOT NULL
first_name  TEXT
username    TEXT
phone       TEXT
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `bookings` — записи клиентов
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
master_id   UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE
client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE
service_id  UUID REFERENCES services(id) ON DELETE SET NULL

date        DATE NOT NULL
time_slot   TEXT NOT NULL              -- "14:00"
status      TEXT DEFAULT 'pending'     -- 'pending'|'confirmed'|'cancelled'|'expired'

-- Кеш (на случай удаления услуги)
service_name TEXT NOT NULL
price        INTEGER NOT NULL

-- Напоминания
reminded_24h BOOLEAN DEFAULT false
reminded_2h  BOOLEAN DEFAULT false

-- Таймаут: если мастер не ответил за 2 часа → статус expired
expires_at   TIMESTAMPTZ NOT NULL      -- created_at + 2 часа

created_at   TIMESTAMPTZ DEFAULT NOW()
updated_at   TIMESTAMPTZ DEFAULT NOW()
```

> ⚠️ Исправлено: добавлен `expires_at` и статус `expired`.
> Cron каждые 15 минут проверяет pending записи у которых expires_at < NOW()
> и переводит их в `expired`. Слот освобождается для других клиентов.

### `schedule` — рабочее расписание мастера
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
master_id    UUID UNIQUE NOT NULL REFERENCES masters(id) ON DELETE CASCADE
work_hours   JSONB DEFAULT '["9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"]'
days_off     JSONB DEFAULT '[0]'       -- [0] = воскресенье
manual_busy  JSONB DEFAULT '{}'        -- {"2026-04-05": ["14:00","15:00"]}
```

> UNIQUE на master_id — у одного мастера ровно одна запись расписания.

---

## Безопасность

> ⚠️ Исправлено: добавлен раздел RLS и уточнено хранение ключей.

### Проверка initData (каждый запрос от мини-аппа)
```js
// Telegram подписывает initData через HMAC-SHA256
// Бэкенд проверяет подпись перед любым действием
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
if (checkHash !== hash) return res.status(401).json({ error: 'Invalid initData' });
```

### Шифрование токенов ботов
- Токены мастеров шифруются AES-256-GCM перед записью в БД
- Ключ шифрования хранится в **env-переменной на VPS** (`ENCRYPTION_KEY`)
- Ключ никогда не попадает в код, в GitHub, в Supabase

### Row Level Security (RLS) в Supabase
```sql
-- Мастер видит только свои данные
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_own_services" ON services
  USING (master_id = (SELECT id FROM masters WHERE telegram_id = current_user_telegram_id()));

-- Аналогично для portfolio, bookings, schedule
```
> RLS включить на таблицы: services, portfolio, bookings, schedule.
> Таблица clients — только через серверный код, не через прямой доступ клиента.

### Rate Limiting на VPS
- Максимум 10 запросов в секунду с одного IP (express-rate-limit)
- Максимум 5 записей в день от одного клиента к одному мастеру

---

## API — все эндпоинты на Beget VPS

> ⚠️ Исправлено: убраны "Vercel Functions". Все API на VPS.
> Базовый URL: `https://api.yourdomain.ru`

### Публичные (для мини-аппа клиента)
```
GET  /api/app/:botUsername              → данные мастера + услуги + расписание
GET  /api/app/:botUsername/slots?date=  → свободные слоты на конкретную дату
POST /api/bookings                      → создать запись (initData обязателен)
```

### Клиент (авторизован через initData)
```
GET    /api/client/bookings             → свои записи (активные + история)
DELETE /api/client/bookings/:id         → отменить свою запись
```

### Мастер (initData.user.id === master.telegram_id)
```
GET    /api/master/me                   → профиль
PUT    /api/master/me                   → обновить профиль

GET    /api/master/services             → список услуг
POST   /api/master/services             → добавить (проверка лимита 5 для free)
PUT    /api/master/services/:id         → редактировать
DELETE /api/master/services/:id         → удалить

GET    /api/master/portfolio            → список фото
DELETE /api/master/portfolio/:id        → удалить фото

GET    /api/master/bookings             → все записи (фильтр: status, date)
PUT    /api/master/bookings/:id         → подтвердить или отменить запись

GET    /api/master/schedule             → расписание
PUT    /api/master/schedule             → обновить расписание
```

### Вебхуки (Telegram → VPS)
```
POST /api/webhook/platform              → бот платформы (онбординг мастеров)
POST /api/webhook/:masterId             → личный бот мастера (фото, команды)
```

### Оплата (TBD)
```
POST /api/payment/invoice               → создать инвойс (провайдер TBD)
POST /api/payment/success               → подтверждение оплаты → upgrade plan
```

---

## Два режима мини-аппа

### Режим клиента (по умолчанию)
- Видит: каталог, профиль мастера, выбор времени, свои записи
- Не видит: кнопки редактирования

### Режим владельца (мастер открывает свой апп)
- Бэкенд проверяет: `initData.user.id === master.telegram_id`
- Дополнительно видит: кнопки редактирования, входящие записи, статусы
- Может: добавлять/удалять услуги, фото, менять расписание, принимать/отклонять записи

---

## Флоу регистрации мастера

```
Мастер пишет /start в бот платформы
    ↓
Бот проверяет: есть ли этот telegram_id в таблице masters?
  Если да → "Добро пожаловать назад! Ваш бот: @username"
  Если нет → начать онбординг
    ↓
Онбординг по шагам (onboarding_step в БД — сохраняем прогресс):
  1. Имя мастера
  2. Специализация
  3. Телефон
  4. "Создайте бота через @BotFather и пришлите токен"
    ↓
Получен токен → платформа проверяет через getMe API:
  Ошибка → "Токен неверный, попробуйте ещё раз"
  Успех → сохранить мастера в БД (токен зашифровать AES-256)
    ↓
Платформа автоматически:
  - Устанавливает webhook: POST setWebhook → https://api.yourdomain.ru/api/webhook/:masterId
  - Настраивает кнопку меню: setChatMenuButton → "Записаться 💅"
  - Настраивает команды бота: /help, /contact
    ↓
Мастер получает сообщение:
  "Готово! Ваше приложение: https://t.me/your_bot?start=from_app
   Откройте бота — он уже настроен и готов принимать клиентов."
```

---

## Флоу записи клиента

```
Клиент открывает мини-апп → выбирает услугу → выбирает слот
    ↓
POST /api/bookings
  → запись создаётся: status='pending', expires_at = NOW() + 2 hours
    ↓
Личный бот мастера отправляет уведомление мастеру:
  "📩 Новая запись!
   👤 [Имя клиента]
   💅 [Услуга] — [цена] ₽
   📅 [Дата], [время]
   ⏳ Ответьте в течение 2 часов"
   [✅ Принять] [❌ Отклонить]
    ↓
Мастер нажимает кнопку:
  ✅ Принять → status='confirmed' → клиент получает: "Запись подтверждена! 📅 [детали]"
  ❌ Отклонить → status='cancelled' → клиент получает: "Мастер не может принять в это время. Выберите другой слот."
    ↓
Если мастер НЕ ответил за 2 часа:
  Cron находит запись где expires_at < NOW() AND status='pending'
  → status='expired'
  → клиент получает: "К сожалению, мастер не подтвердил запись. Попробуйте выбрать другое время."
```

---

## Напоминания (node-cron на VPS)

> ⚠️ Исправлено: убран Vercel Cron Job. Всё на VPS через node-cron.

```js
// Каждые 15 минут — проверка expired записей
cron.schedule('*/15 * * * *', checkExpiredBookings);

// Каждый час — отправка напоминаний
cron.schedule('0 * * * *', sendReminders);
```

### Логика напоминаний
```
Каждый час:
  SELECT bookings WHERE status='confirmed'
    AND reminded_24h = false
    AND date = tomorrow
  → отправить клиенту через бот мастера:
    "Напоминание! Завтра в [время] — [услуга] у [мастер].
     Адрес: [адрес]"
  → reminded_24h = true

  SELECT bookings WHERE status='confirmed'
    AND reminded_2h = false
    AND date = today
    AND time_slot::time - NOW()::time BETWEEN '1:45' AND '2:15'
  → отправить клиенту:
    "Через 2 часа ваша запись — [услуга] в [время]!"
  → reminded_2h = true
```

---

## Загрузка фото (через Telegram)

```
Мастер отправляет фото своему боту
    ↓
Webhook /api/webhook/:masterId получает message.photo
    ↓
Берём наибольшее фото (последний элемент массива photo[])
    ↓
getFile API → получаем путь файла на серверах Telegram
    ↓
Скачиваем файл через https://api.telegram.org/file/bot{TOKEN}/{file_path}
    ↓
Загружаем в Cloudinary → получаем cloudinary_url
    ↓
INSERT INTO portfolio (master_id, cloudinary_url, telegram_file_id)
    ↓
Бот отвечает: "Фото добавлено в портфолио ✅ (всего: N фото)"
```

---

## Тарифы и White-Label

### Free (бесплатно, навсегда)
- До 5 активных услуг
- Неограниченные записи и клиенты
- Базовая тема (роза)
- Плашка "Powered by [платформа]" в приложении

### Pro (подписка, ежемесячно)
- Неограниченное количество услуг
- Выбор темы: Роза / Лаванда / Золото / Тёмная
- Загрузка своего логотипа
- Убирается плашка "Powered by"
- Кастомный текст на кнопках и экране welcome

### Логика проверки лимита
```js
// При добавлении услуги через API:
const { count } = await supabase
  .from('services')
  .select('*', { count: 'exact', head: true })
  .eq('master_id', master.id)
  .eq('is_active', true);

if (master.plan === 'free' && count >= 5) {
  // Отправить сообщение в бот мастера о необходимости подписки
  return res.status(403).json({ error: 'service_limit_reached' });
}
```

---

## Порядок разработки (этапы)

> ⚠️ Исправлено: напоминания перенесены в Этап 2 — они критичны для первых мастеров.

### Этап 1 — Фундамент
1. Арендовать VPS на Beget, установить Node.js
2. Создать БД в Supabase (все таблицы по схеме выше)
3. Включить RLS на все таблицы
4. Написать Express-сервер с базовой структурой роутов
5. Эндпоинт `GET /api/app/:botUsername` → отдаёт данные мастера
6. Перенести Анну Козлову из `data.js` в БД как первого мастера
7. Подключить фронтенд к API (убрать `data.js`, тянуть данные с VPS)

### Этап 2 — Записи + Напоминания
8. `POST /api/bookings` — создать запись, уведомить мастера
9. Кнопки "Принять / Отклонить" в боте мастера
10. `DELETE /api/client/bookings/:id` — клиент отменяет запись
11. Cron: автоматический `expired` для неотвеченных записей (expires_at)
12. Cron: напоминания за 24ч и 2ч клиентам

### Этап 3 — Панель мастера
13. Режим владельца в мини-аппе (определение по telegram_id)
14. CRUD услуг через апп (с проверкой лимита 5)
15. Загрузка фото: бот → Cloudinary → портфолио
16. Редактирование расписания через апп

### Этап 4 — Регистрация новых мастеров
17. Бот платформы: пошаговый онбординг с сохранением прогресса
18. Проверка токена бота через Telegram API
19. Автоматическая настройка webhook + кнопки меню нового мастера

### Этап 5 — Монетизация
20. Проверка лимита 5 услуг → сообщение с предложением Pro
21. Оплата подписки (провайдер TBD — см. plan.md)
22. White-Label: темы, логотип, убрать брендинг после оплаты

---

## ENV-переменные на VPS (никогда не в GitHub)

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=xxxx   # service role key — только на сервере!

# Шифрование токенов ботов мастеров
ENCRYPTION_KEY=случайная_строка_32_символа

# Бот платформы
PLATFORM_BOT_TOKEN=xxxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxxx
CLOUDINARY_API_KEY=xxxx
CLOUDINARY_API_SECRET=xxxx

# Сервер
PORT=3000
ALLOWED_ORIGIN=https://tg-beauty-catalog-ebon.vercel.app
```

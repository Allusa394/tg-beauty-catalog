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
| Оплата подписки | TBD — нужно решить отдельно |
| Подтверждение записи | Мастер вручную (Принять / Отклонить) |
| Технология бэкенда | Supabase (БД) + VPS на Beget (сервер ботов) |

---

## Стек технологий (бесплатный старт)

| Компонент | Технология | Почему |
|---|---|---|
| Сервер ботов | Node.js на VPS Beget | Полный контроль, держит webhook всех ботов мастеров |
| База данных | Supabase (PostgreSQL) | Бесплатный тир, простое подключение, удобная панель |
| Хранение фото | Cloudinary | Бесплатный тир, Telegram file → URL |
| Фронтенд | Vercel (уже готов) | Статика, автодеплой из GitHub |
| Планировщик | Node.js cron на VPS | Напоминания за 24ч и 2ч до визита |

---

## База данных — таблицы

### `masters` — мастера платформы
```sql
id              UUID PRIMARY KEY
telegram_id     BIGINT UNIQUE        -- Telegram user ID мастера
bot_token       TEXT UNIQUE          -- Токен личного бота мастера
bot_username    TEXT UNIQUE          -- @username бота

-- Профиль
name            TEXT                 -- "Анна Козлова"
title           TEXT                 -- "Мастер маникюра"
about           TEXT
phone           TEXT
address         TEXT
address_link    TEXT

-- Подписка
plan            TEXT DEFAULT 'free'  -- 'free' | 'pro'
plan_expires_at TIMESTAMPTZ
services_count  INT DEFAULT 0        -- сколько услуг создано

-- White-Label (только plan=pro)
theme           TEXT DEFAULT 'rose'  -- 'rose'|'lavender'|'gold'|'dark'
logo_url        TEXT
show_branding   BOOLEAN DEFAULT true -- плашка "Powered by платформой"

created_at      TIMESTAMPTZ DEFAULT NOW()
```

### `services` — услуги каждого мастера
```sql
id          UUID PRIMARY KEY
master_id   UUID REFERENCES masters(id)
category    TEXT                     -- 'mani'|'pedi'|'brows'|'lashes'
name        TEXT
short_desc  TEXT
description TEXT
price       INTEGER
duration    TEXT
emoji       TEXT
is_active   BOOLEAN DEFAULT true
order_index INTEGER DEFAULT 0        -- порядок в каталоге
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `portfolio` — фото работ мастера
```sql
id              UUID PRIMARY KEY
master_id       UUID REFERENCES masters(id)
cloudinary_url  TEXT                 -- URL фото после загрузки
telegram_file_id TEXT               -- оригинальный file_id из Telegram
caption         TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### `clients` — клиенты (общая таблица)
```sql
id          UUID PRIMARY KEY
telegram_id BIGINT UNIQUE
first_name  TEXT
username    TEXT
phone       TEXT
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `bookings` — записи клиентов
```sql
id          UUID PRIMARY KEY
master_id   UUID REFERENCES masters(id)
client_id   UUID REFERENCES clients(id)
service_id  UUID REFERENCES services(id)

date        DATE
time_slot   TEXT                     -- "14:00"
status      TEXT DEFAULT 'pending'   -- 'pending'|'confirmed'|'cancelled'

-- Кеш для уведомлений (чтобы не делать JOIN каждый раз)
service_name TEXT
price       INTEGER

reminded_24h BOOLEAN DEFAULT false   -- напоминание за 24ч отправлено?
reminded_2h  BOOLEAN DEFAULT false   -- напоминание за 2ч отправлено?

created_at  TIMESTAMPTZ DEFAULT NOW()
updated_at  TIMESTAMPTZ DEFAULT NOW()
```

### `schedule` — рабочие часы и выходные мастера
```sql
id              UUID PRIMARY KEY
master_id       UUID REFERENCES masters(id)
work_hours      JSONB    -- ["9:00","10:00",...,"18:00"]
days_off        JSONB    -- [0] — воскресенье
manual_busy     JSONB    -- {"2026-04-05": ["14:00","15:00"]}
```

---

## API — эндпоинты (Vercel Functions)

### Публичные (для мини-аппа клиента)
```
GET  /api/app/:botUsername          → данные мастера + услуги + расписание
GET  /api/app/:botUsername/slots    → свободные слоты на дату
POST /api/bookings                  → создать запись (initData обязателен)
```

### Мастер (только если initData.user.id === master.telegram_id)
```
GET    /api/master/me               → профиль мастера
PUT    /api/master/me               → обновить профиль

GET    /api/master/services         → список услуг
POST   /api/master/services         → добавить услугу (проверка лимита 5)
PUT    /api/master/services/:id     → редактировать услугу
DELETE /api/master/services/:id     → удалить услугу

GET    /api/master/portfolio        → список фото
DELETE /api/master/portfolio/:id    → удалить фото

GET    /api/master/bookings         → все записи (фильтр по статусу/дате)
PUT    /api/master/bookings/:id     → изменить статус (confirmed/cancelled)

PUT    /api/master/schedule         → обновить расписание
```

### Вебхуки (Telegram → бэкенд)
```
POST /api/webhook/platform          → бот платформы (регистрация мастеров)
POST /api/webhook/:masterId         → личный бот мастера (уведомления клиентам)
```

### Оплата
```
POST /api/payment/invoice           → создать инвойс Telegram Stars
POST /api/payment/success           → Telegram pre_checkout_query + successful_payment
```

---

## Два режима мини-аппа

### Режим клиента (по умолчанию)
- Открывает ссылку `https://t.me/anna_beauty_nail_bot?start=from_app`
- Видит: каталог услуг, профиль мастера, выбор времени, свои записи
- Не видит: кнопки редактирования

### Режим владельца (мастер открывает свой же апп)
- Бэкенд проверяет: `initData.user.id === master.telegram_id`
- Видит: всё что видит клиент + кнопка "Редактировать" на каждом блоке
- Может: добавлять/удалять услуги, фото, менять расписание
- Видит: входящие записи, статусы, кнопки "Принять / Отклонить"

---

## Флоу регистрации мастера

```
Мастер пишет /start в бот платформы
    ↓
Бот спрашивает: имя, специализацию, телефон (по шагам)
    ↓
Бот просит создать своего бота через @BotFather и прислать токен
    ↓
Платформа проверяет токен → сохраняет мастера в БД
    ↓
Платформа автоматически:
  - Устанавливает webhook на /api/webhook/:masterId
  - Настраивает кнопку меню "Записаться 💅" с ссылкой на апп
    ↓
Мастер получает ссылку на своё приложение и инструкцию
```

---

## Флоу записи клиента

```
Клиент открывает мини-апп → выбирает услугу → выбирает слот
    ↓
POST /api/bookings → запись создаётся со статусом 'pending'
    ↓
Личный бот мастера отправляет мастеру уведомление:
  "Новая запись! [Имя клиента] — [Услуга] — [Дата, время]
   [✅ Принять] [❌ Отклонить]"
    ↓
Мастер нажимает кнопку в боте
    ↓
Статус записи → 'confirmed' или 'cancelled'
    ↓
Клиент получает уведомление о статусе через тот же бот мастера
```

---

## Напоминания (Vercel Cron Job)

```
Каждый час запускается /api/cron/reminders
    ↓
SELECT bookings WHERE status='confirmed'
  AND reminded_24h=false AND date = tomorrow
  → отправить сообщение клиенту через бот мастера
  → reminded_24h = true
    ↓
SELECT bookings WHERE status='confirmed'
  AND reminded_2h=false AND date = today AND time_slot - 2ч
  → отправить сообщение клиенту
  → reminded_2h = true
```

---

## Загрузка фото (через Telegram)

```
Мастер отправляет фото своему боту
    ↓
Webhook получает message.photo
    ↓
Бэкенд скачивает файл через getFile API
    ↓
Загружает в Cloudinary → получает URL
    ↓
Сохраняет в таблицу portfolio (master_id, cloudinary_url, telegram_file_id)
    ↓
Бот отвечает: "Фото добавлено в портфолио ✅"
```

---

## Тарифы и White-Label

### Free (бесплатно)
- До 5 активных услуг
- Неограниченное количество записей и клиентов
- Базовая тема (роза)
- Плашка "Powered by [платформа]" в приложении
- Всё остальное работает полностью

### Pro (подписка, Telegram Stars)
- Неограниченное количество услуг
- Выбор темы: Роза / Лаванда / Золото / Тёмная
- Загрузка своего логотипа
- Убирается плашка "Powered by"
- Кастомный текст на кнопках и экране welcome

### Логика лимита услуг
```js
// При добавлении услуги:
if (master.plan === 'free' && master.services_count >= 5) {
  // Бот отправляет: "Вы достигли лимита 5 услуг.
  //   Для добавления новых — подключите Pro подписку.
  //   [Подключить Pro]"
  // Кнопка → триггерит Telegram Payments инвойс
}
```

---

## Безопасность

- Каждый запрос от мини-аппа содержит `initData` (строка от Telegram)
- Бэкенд проверяет подпись `initData` через HMAC-SHA256 с `BOT_TOKEN`
- Только после проверки подписи доверяем `user.id` из initData
- Токены ботов мастеров хранятся в БД зашифрованными (AES-256)
- Мастер может видеть/редактировать только свои данные

---

## Порядок разработки (этапы)

### Этап 1 — Фундамент
1. Создать БД в Supabase (все таблицы выше)
2. Адаптировать `data.js` → данные тянуть из БД через API
3. Эндпоинт `GET /api/app/:botUsername` — отдаёт данные мастера
4. Перенести Анну Козлову в БД как первого мастера

### Этап 2 — Записи
5. `POST /api/bookings` — создать запись, уведомить мастера
6. Кнопки "Принять / Отклонить" в боте мастера
7. Уведомление клиенту о статусе

### Этап 3 — Панель мастера
8. Режим владельца в мини-аппе (определение по telegram_id)
9. Добавление/удаление услуг через апп
10. Загрузка фото через бот → Cloudinary

### Этап 4 — Регистрация новых мастеров
11. Бот платформы с онбордингом мастера
12. Автоматическая настройка webhook и кнопки меню

### Этап 5 — Монетизация
13. Проверка лимита 5 услуг на free тарифе
14. Telegram Payments инвойс для Pro
15. White-Label: темы, логотип, убрать брендинг

### Этап 6 — Напоминания
16. Vercel Cron Job для напоминаний за 24ч и 2ч

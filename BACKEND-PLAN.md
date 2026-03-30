# BACKEND-PLAN — tg-beauty-catalog

White-Label SaaS платформа для бьюти-мастеров.
Каждый мастер получает своё мини-приложение и своего бота. Платформа управляет всем из одного бэкенда.

---

## Стек

| Компонент | Что используем | Где живёт |
|-----------|---------------|-----------|
| Фронтенд | HTML / CSS / JS | Vercel |
| Сервер + боты | Node.js + Express | Beget VPS |
| База данных | Supabase (PostgreSQL) | Supabase |
| Хранение фото | Cloudinary | Cloudinary |
| Напоминания | node-cron | VPS |
| Оплата | ЮKassa | — |

Схема: Фронтенд → VPS API → Supabase

---

## Тарифы

| | Free | Pro |
|--|------|-----|
| Цена | Бесплатно | Подписка (месяц / год) |
| Активных услуг | До 5 | Неограниченно |
| Темы | Только Роза | Роза, Лаванда, Золото, Тёмная |
| Свой логотип | — | Да |
| Плашка "Powered by" | Показывается | Скрыта |
| Записи и клиенты | Неограниченно | Неограниченно |

---

## База данных

### Таблицы

| Таблица | Что хранит |
|---------|-----------|
| masters | Мастера платформы — профиль, бот, тариф |
| services | Услуги каждого мастера |
| portfolio | Фото работ мастера |
| clients | Клиенты платформы (общая книга) |
| bookings | Записи клиентов к мастерам |
| schedule | Расписание мастера |

### Ключевые поля

**masters:** id, telegram_id, bot_token (AES-256), bot_username, name, title, about, phone, address, plan, plan_expires_at, services_locked, theme, logo_url, show_branding, onboarding_step

**services:** id, master_id, category, name, price, duration, emoji, is_active, is_locked, order_index

**bookings:** id, master_id, client_id, service_id, date, time_slot, status (pending/confirmed/cancelled/expired), service_name, price, reminded_24h, reminded_2h, expires_at

**schedule:** id, master_id, work_hours (JSONB), days_off (JSONB), manual_busy (JSONB)

---

## Безопасность

| Что защищаем | Как |
|-------------|-----|
| Запросы от мини-аппа | HMAC-SHA256 проверка initData от Telegram |
| Токены ботов | AES-256-GCM шифрование, ключ только в .env на VPS |
| База данных | RLS включён, anon ключ запрещён, всё через service_role |
| Webhook ЮKassa | Проверка HMAC-SHA256 подписи каждого запроса |
| Supabase → VPS | Подпись через VPS_NOTIFY_SECRET |
| Rate Limiting | 10 запросов/сек с IP, 5 записей/день к одному мастеру |

---

## API-эндпоинты

```
GET    /api/app/:botUsername           — Данные мастера, услуги, расписание
GET    /api/app/:botUsername/slots     — Свободные слоты (?date=)
POST   /api/bookings                   — Создать запись

GET    /api/client/bookings            — Записи клиента
DELETE /api/client/bookings/:id        — Отменить запись

GET    /api/master/me                  — Профиль мастера
PUT    /api/master/me                  — Обновить профиль
GET    /api/master/services            — Список услуг
POST   /api/master/services            — Добавить услугу
PUT    /api/master/services/:id        — Обновить услугу
DELETE /api/master/services/:id        — Удалить услугу
GET    /api/master/portfolio           — Фото портфолио
DELETE /api/master/portfolio/:id       — Удалить фото
GET    /api/master/bookings            — Записи мастера
PUT    /api/master/bookings/:id        — Подтвердить / отклонить
GET    /api/master/schedule            — Расписание
PUT    /api/master/schedule            — Обновить расписание

POST   /api/webhook/platform           — Бот платформы (онбординг, команды владельца)
POST   /api/webhook/:masterId          — Личный бот мастера

POST   /api/payment/invoice            — Создать инвойс ЮKassa
POST   /api/payment/webhook            — Подтверждение оплаты от ЮKassa
```

---

## Панель владельца

Работает только для OWNER_TELEGRAM_ID, через команды в боте платформы.

| Команда | Что делает |
|---------|-----------|
| /stats | Мастеров всего, Pro/Free, записей сегодня, доход за месяц |
| /masters | Список мастеров с тарифом и датой истечения |
| /master [id] | Детали конкретного мастера |
| /block [id] | Заблокировать мастера |
| /unblock [id] | Разблокировать мастера |

---

## Порядок разработки

---

### Этап 0: Локальная разработка — настройка окружения

- [x] Установить Node.js
- [x] Инициализировать `npm init`, установить зависимости
- [x] Создать `.env` с ключами Supabase
- [x] Запустить сервер на localhost:3000

---

### Этап 1: Фундамент — API + фронтенд

- [x] Express-сервер с роутами
- [x] `GET /api/app/:botUsername` — данные мастера, услуги, расписание
- [x] Фронтенд подключён к API
- [x] Бот мастера принимает сообщения

---

### Этап 2: Записи и напоминания

- [x] `POST /api/bookings` — создать запись, уведомить мастера
- [x] Кнопки **Принять** / **Отклонить** в боте мастера
- [x] `DELETE /api/client/bookings/:id` — отмена записи
- [x] Cron каждые 15 минут: просроченные записи → expired
- [x] Cron каждый час: напоминания за 24ч и 2ч до записи

---

### Этап 3: Панель мастера

- [x] Определение владельца в мини-аппе по telegram_id
- [x] CRUD услуг с проверкой лимита 5 (Free тариф)
- [x] `GET/PUT /api/master/me` — редактирование профиля

---

### Этап 4: Регистрация новых мастеров

- [x] Бот платформы (@beautyspaceplatform_bot): /start → онбординг
- [x] Сбор данных: имя → специализация → телефон → токен бота
- [x] Проверка токена через Telegram API (getMe)
- [x] Шифрование токена AES-256-GCM, сохранение в БД
- [x] Автоматическая установка webhook для бота мастера
- [x] Мастер получает ссылку на готовое приложение

---

### Этап 5: Монетизация

*Платная подписка Pro через ЮKassa, лимиты для Free, White-Label возможности.*

- [x] Лимит 5 услуг для Free → кнопка "Купить подписку" при попытке добавить больше
- [x] Создать инвойс ЮKassa: `POST /api/payment/invoice` (месяц и год)
- [x] Webhook ЮKassa: `POST /api/payment/webhook` с верификацией через GET /payments/:id → активация Pro
- [x] При активации Pro: is_locked = false у всех услуг автоматически
- [x] White-Label: выбор темы (Роза / Лаванда / Золото / Тёмная)
- [x] White-Label: загрузка своего логотипа (через API logo_url)
- [x] White-Label: скрытие плашки "Powered by" (поле show_branding)
- [x] Cron каждую ночь 00:00: блокировка услуг сверх 5 у истёкших подписок
- [x] Уведомление за 3 дня до истечения подписки
- [x] Напоминание раз в 3 дня после истечения

**Результат:** Платная подписка работает. Free мастера видят лимиты, Pro — полный функционал. Подписка продаётся и продлевается через бота.

---

### Этап 6: Деплой на VPS

- [ ] Арендовать VPS на Beget, установить Node.js + PM2
- [ ] Купить домен, привязать к VPS
- [ ] Загрузить код на VPS (`git clone`)
- [ ] Создать `.env` на VPS с реальными ключами
- [ ] Настроить nginx (`nginx.conf` → заменить домен)
- [ ] Получить SSL через Certbot
- [ ] Запустить сервер: `pm2 start ecosystem.config.js --env production`
- [ ] Зарегистрировать webhook платформенного бота: `npm run setup`
- [ ] Указать webhook ЮKassa в личном кабинете
- [ ] Задеплоить фронтенд на Vercel, указать реальный `API_URL`
- [ ] Добавить первого мастера (Анна Козлова) в таблицу masters через SQL

**Результат:** Платформа живёт на реальном домене. Боты работают. Клиенты могут записываться.

---

## Напоминания (cron)

| Расписание | Задача |
|-----------|--------|
| Каждые 15 минут | Просроченные записи → status=expired, уведомить клиента |
| Каждый час | Проверка напоминаний за 24ч и 2ч до записи |
| Каждую ночь 00:00 | Блокировка услуг сверх 5 у истёкших подписок |

---

## ENV-переменные (никогда не в GitHub)

| Переменная | Назначение |
|-----------|-----------|
| SUPABASE_URL | URL базы данных |
| SUPABASE_SERVICE_KEY | Секретный ключ для VPS |
| ENCRYPTION_KEY | Ключ шифрования токенов (32 символа) |
| PLATFORM_BOT_TOKEN | Токен бота платформы |
| OWNER_TELEGRAM_ID | Telegram ID владельца |
| CLOUDINARY_CLOUD_NAME | Имя аккаунта Cloudinary |
| CLOUDINARY_API_KEY | API ключ Cloudinary |
| CLOUDINARY_API_SECRET | Секрет Cloudinary |
| YUKASSA_SHOP_ID | ID магазина ЮKassa |
| YUKASSA_SECRET_KEY | Секретный ключ ЮKassa |
| VPS_NOTIFY_URL | URL уведомлений Supabase → VPS |
| VPS_NOTIFY_SECRET | Секрет для подписи уведомлений |
| PORT | Порт сервера (3000) |
| ALLOWED_ORIGIN | Домен фронтенда |

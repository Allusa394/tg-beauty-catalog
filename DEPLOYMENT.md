# Деплой tg-beauty-catalog на VPS

Пошаговая инструкция для новичка. Делай по порядку, не пропускай шаги.

---

## Что нам нужно

| Сервис | Зачем | Цена |
|--------|-------|------|
| VPS на Beget | Запускает сервер и ботов 24/7 | от 7 ₽/день |
| Домен | Адрес сервера (например beauty.ru) | от 100 ₽/год |
| Supabase | База данных | Бесплатно |
| Vercel | Хостинг фронтенда | Бесплатно |

---

## Шаг 1 — Арендуй VPS на Beget

1. Зайди на **cp.beget.com** → Облако → Виртуальные серверы → **Создать**
2. Выбери:
   - **ОС:** Ubuntu 22.04
   - **Конфигурация:** минимальная (1 CPU, 1 GB RAM)
3. Нажми **Создать сервер**
4. Запиши **IP адрес** сервера — он понадобится дальше

---

## Шаг 2 — Купи домен и привяжи к VPS

1. На Beget → **Домены** → найди и купи домен (например `beautyapp.ru`)
2. Зайди в **DNS** настройки домена
3. Добавь A-запись:
   - Имя: `@`
   - Значение: IP адрес VPS из шага 1
4. Добавь ещё одну A-запись:
   - Имя: `www`
   - Значение: тот же IP
5. Подожди 10-30 минут пока DNS обновится

---

## Шаг 3 — Подключись к серверу

Открой терминал (на Windows — PowerShell или Windows Terminal):

```bash
ssh root@ВАШ_IP
```

Введи пароль который пришёл на почту от Beget.

---

## Шаг 4 — Установи всё необходимое на сервере

Выполни команды по порядку:

```bash
# Обновить систему
apt update && apt upgrade -y

# Установить Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Установить PM2 (держит сервер запущенным 24/7)
npm install -g pm2

# Установить nginx (принимает запросы и перенаправляет на сервер)
apt install -y nginx

# Установить Certbot (SSL сертификат, чтобы был https://)
apt install -y certbot python3-certbot-nginx

# Установить git
apt install -y git
```

Проверь что всё установилось:

```bash
node --version    # должно показать v20.x.x
npm --version
pm2 --version
nginx -v
```

---

## Шаг 5 — Загрузи код проекта

```bash
# Перейди в папку для сайтов
cd /var/www

# Скачай проект с GitHub
git clone https://github.com/Allusa394/tg-beauty-catalog.git

# Перейди в папку проекта
cd tg-beauty-catalog

# Установи зависимости
npm install
```

---

## Шаг 6 — Создай файл с секретными ключами

```bash
# Скопируй шаблон
cp .env.example .env

# Открой файл для редактирования
nano .env
```

Заполни все значения (замени на свои):

```
PLATFORM_BOT_TOKEN=токен_платформенного_бота
MASTER_BOT_TOKEN=токен_бота_мастера

SUPABASE_URL=https://ХХХ.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_ХХХ
ENCRYPTION_KEY=32_случайных_символа

OWNER_TELEGRAM_ID=твой_telegram_id

VPS_URL=https://ВАШ_ДОМЕН.ru
ALLOWED_ORIGIN=https://tg-beauty-catalog-ebon.vercel.app
FRONTEND_URL=https://tg-beauty-catalog-ebon.vercel.app

YUKASSA_SHOP_ID=
YUKASSA_SECRET_KEY=

PORT=3000
```

> Реальные ключи хранятся в `.env` файле на твоём компьютере — скопируй значения оттуда.

Сохрани файл: **Ctrl+X** → **Y** → **Enter**

---

## Шаг 7 — Настрой nginx

```bash
# Скопируй наш конфиг
cp /var/www/tg-beauty-catalog/nginx.conf /etc/nginx/sites-available/tg-beauty-catalog

# Открой и замени example.ru на свой домен
nano /etc/nginx/sites-available/tg-beauty-catalog
```

Замени все `example.ru` на свой домен (например `beautyapp.ru`).

```bash
# Подключи конфиг
ln -s /etc/nginx/sites-available/tg-beauty-catalog /etc/nginx/sites-enabled/

# Удали дефолтный конфиг
rm /etc/nginx/sites-enabled/default

# Проверь что конфиг без ошибок
nginx -t

# Перезапусти nginx
systemctl restart nginx
```

---

## Шаг 8 — Получи SSL сертификат (https)

```bash
certbot --nginx -d beautyapp.ru -d www.beautyapp.ru
```

Замени `beautyapp.ru` на свой домен. Введи email когда спросит, согласись с условиями.

---

## Шаг 9 — Запусти сервер

```bash
cd /var/www/tg-beauty-catalog

# Запустить сервер через PM2
pm2 start ecosystem.config.js --env production

# Проверь что работает
pm2 status

# Сделай автозапуск при перезагрузке VPS
pm2 save
pm2 startup
```

Скопируй команду которую выдаст `pm2 startup` и выполни её.

Проверь что сервер работает — открой в браузере `https://твойдомен.ru` — должно написать `{"status":"ok"}`.

---

## Шаг 10 — Зарегистрируй боты

```bash
cd /var/www/tg-beauty-catalog
npm run setup
```

Эта команда зарегистрирует платформенного бота (@beautyspaceplatform_bot) и скажет Telegram куда отправлять сообщения.

---

## Шаг 11 — Обнови фронтенд

В файле `tg-app/app.js` найди строку с `API_URL` и замени на реальный домен.

Напиши мне домен — я заменю сам, ты только запушишь на GitHub.

---

## Полезные команды после деплоя

```bash
# Посмотреть логи (что происходит на сервере)
pm2 logs tg-beauty-catalog

# Перезапустить сервер после изменений в коде
cd /var/www/tg-beauty-catalog && git pull && pm2 restart tg-beauty-catalog

# Статус сервера
pm2 status
```

---

## Порядок когда будешь готова платить за VPS

1. Шаг 1 — аренда VPS на Beget
2. Шаг 2 — домен
3. Шаги 3-10 — займёт ~30 минут
4. Напиши мне домен → я обновлю код → ты пушишь → всё работает

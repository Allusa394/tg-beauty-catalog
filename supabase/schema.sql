-- ============================================================
-- schema.sql — схема базы данных tg-beauty-catalog
--
-- Запускать в Supabase → SQL Editor
-- Порядок важен: сначала masters и clients, потом зависящие от них
-- ============================================================

-- ── 1. МАСТЕРА ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS masters (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id      BIGINT      UNIQUE NOT NULL,
  name             TEXT        NOT NULL DEFAULT 'pending',
  title            TEXT,
  about            TEXT,
  phone            TEXT,
  address          TEXT,
  address_link     TEXT,

  -- Telegram бот мастера
  bot_token        TEXT        NOT NULL,              -- зашифрован AES-256-GCM
  bot_username     TEXT        UNIQUE NOT NULL,

  -- Онбординг: name → title → phone → token → done
  onboarding_step  TEXT        NOT NULL DEFAULT 'name',

  -- Тариф
  plan             TEXT        NOT NULL DEFAULT 'free',   -- free | pro | blocked
  plan_expires_at  TIMESTAMPTZ,
  services_locked  BOOLEAN     NOT NULL DEFAULT FALSE,    -- услуги заблокированы после истечения

  -- White-Label
  theme            TEXT        NOT NULL DEFAULT 'blue',   -- blue | rose | lavender | gold | dark
  logo_url         TEXT,
  show_branding    BOOLEAN     NOT NULL DEFAULT TRUE,     -- false = скрыть "Powered by"

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. УСЛУГИ ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS services (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id    UUID    NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  category     TEXT,                                       -- mani | pedi | brows | lashes | ...
  name         TEXT    NOT NULL,
  short_desc   TEXT,
  description  TEXT,
  price        INTEGER NOT NULL DEFAULT 0,                 -- в рублях
  duration     TEXT,
  emoji        TEXT    NOT NULL DEFAULT '💅',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked    BOOLEAN NOT NULL DEFAULT FALSE,             -- заблокирована лимитом Free
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS services_master_id_idx ON services(master_id);

-- ── 3. ПОРТФОЛИО ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolio (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id  UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,                               -- Cloudinary URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolio_master_id_idx ON portfolio(master_id);

-- ── 4. КЛИЕНТЫ ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id           UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id  BIGINT UNIQUE NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  username     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. ЗАПИСИ ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id    UUID NOT NULL REFERENCES masters(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  service_id   UUID REFERENCES services(id),

  -- Снимок на момент записи (услуга может измениться позже)
  service_name TEXT    NOT NULL,
  price        INTEGER NOT NULL,

  date         DATE    NOT NULL,
  time_slot    TEXT    NOT NULL,                          -- "14:00"

  -- Статус: pending → confirmed/declined → cancelled/expired
  status       TEXT    NOT NULL DEFAULT 'pending',

  -- Время жизни ожидающей записи (2 часа после создания)
  expires_at   TIMESTAMPTZ,

  -- Флаги напоминаний (чтобы не отправлять дважды)
  reminded_24h BOOLEAN NOT NULL DEFAULT FALSE,
  reminded_2h  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_master_id_idx ON bookings(master_id);
CREATE INDEX IF NOT EXISTS bookings_client_id_idx ON bookings(client_id);
CREATE INDEX IF NOT EXISTS bookings_date_idx       ON bookings(date);
CREATE INDEX IF NOT EXISTS bookings_status_idx     ON bookings(status);

-- ── 6. РАСПИСАНИЕ ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   UUID  UNIQUE NOT NULL REFERENCES masters(id) ON DELETE CASCADE,

  -- Рабочие часы: массив строк ["9:00","10:00",...,"18:00"]
  work_hours  TEXT[] NOT NULL DEFAULT ARRAY[
    '9:00','10:00','11:00','12:00','13:00',
    '14:00','15:00','16:00','17:00','18:00'
  ],

  -- Выходные дни недели: 0=Вс, 1=Пн, ..., 6=Сб
  days_off    INTEGER[] NOT NULL DEFAULT ARRAY[0],

  -- Ручная блокировка слотов: { "2026-04-01": ["14:00","15:00"] }
  manual_busy JSONB NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RLS (Row Level Security)
-- Все запросы идут через service_role ключ на VPS.
-- service_role полностью обходит RLS — это правильно и безопасно.
-- Включаем RLS + запрещаем анонимный доступ на случай утечки URL.
-- ============================================================

ALTER TABLE masters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule  ENABLE ROW LEVEL SECURITY;

-- Явно запрещаем anon — только service_role (VPS) имеет доступ
CREATE POLICY "deny anon" ON masters   FOR ALL TO anon USING (false);
CREATE POLICY "deny anon" ON services  FOR ALL TO anon USING (false);
CREATE POLICY "deny anon" ON portfolio FOR ALL TO anon USING (false);
CREATE POLICY "deny anon" ON clients   FOR ALL TO anon USING (false);
CREATE POLICY "deny anon" ON bookings  FOR ALL TO anon USING (false);
CREATE POLICY "deny anon" ON schedule  FOR ALL TO anon USING (false);

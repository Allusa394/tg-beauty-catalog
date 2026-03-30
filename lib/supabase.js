// ============================================================
// lib/supabase.js — клиент Supabase
// Используется во всех роутах для работы с базой данных.
// service_role ключ даёт полный доступ в обход RLS.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;

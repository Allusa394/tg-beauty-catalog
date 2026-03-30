// @ts-nocheck
/* global MASTER, SERVICES, SCHEDULE, CATEGORIES, POPULAR_SERVICE_IDS, REVIEWS */
// ============================================================
// app.js — логика приложения
// Разделы:
// 1. Инициализация Telegram WebApp SDK
// 2. Состояние приложения
// 3. Навигация (табы, push-экраны)
// 4. Рендер экранов
// 5. Обработчики событий
// ============================================================

/* ── 1. Telegram WebApp SDK ── */
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand(); // на весь экран
  // tg.enableClosingConfirmation(); // отключено — мешает закрытию
}

// Тактильный отклик
function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred(type);
}

function hapticNotify(type = 'success') {
  tg?.HapticFeedback?.notificationOccurred(type);
}

// Применить тему Telegram
function applyTheme() {
  const scheme = tg?.colorScheme || 'light';
  document.body.classList.toggle('dark', scheme === 'dark');
}
applyTheme();
tg?.onEvent?.('themeChanged', applyTheme);

// Применить тему оформления мастера (White-Label)
// Меняет CSS-переменные через класс на <body>
function applyMasterTheme(theme) {
  document.body.classList.remove('theme-rose', 'theme-lavender', 'theme-gold', 'theme-dark-force');
  if (theme === 'dark') {
    document.body.classList.add('dark', 'theme-dark-force');
  } else if (theme && theme !== 'blue') {
    document.body.classList.add(`theme-${theme}`);
  }
}

/* ── 2. API ── */

// URL сервера: локально — localhost, на проде — домен VPS
// ⚠️ ПЕРЕД ДЕПЛОЕМ: замени строку ниже на реальный домен VPS
// Пример: 'https://beauty.example.ru'
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://ВАШ_ДОМЕН'; // ← заменить здесь

// Определяем username бота — по нему находим мастера.
// Клиент открывает приложение по ссылке вида: https://t.me/ИМЯ_БОТА
// Telegram передаёт это имя в start_param или в URL-параметре ?bot=
function getBotUsername() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('bot')) return params.get('bot');
  if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;
  return MASTER.botUsername || null; // запасной вариант — данные из data.js
}

// Проверяет — является ли текущий пользователь мастером этого приложения.
// Используется для показа кнопки настроек.
function isMaster() {
  if (!MASTER.masterTelegramId) return false;
  const userId = tg?.initDataUnsafe?.user?.id;
  return !!userId && String(userId) === String(MASTER.masterTelegramId);
}

// Плашка "Powered by BeautyApp" для Free тарифа.
// Скрывается у Pro мастеров когда show_branding = false.
function poweredByBadge() {
  if (!MASTER.showBranding) return '';
  return `<div class="powered-by">Сделано на <strong>BeautyApp</strong> 💅</div>`;
}

// Загрузка данных мастера из API.
// Перезаписывает MASTER, SERVICES, SCHEDULE реальными данными из Supabase.
// Если API недоступен — работает с data.js (полезно при локальной разработке).
async function loadFromAPI() {
  const botUser = getBotUsername();
  if (!botUser) return;

  try {
    const res = await fetch(`${API_URL}/api/app/${botUser}`);
    if (!res.ok) return;

    const data = await res.json();

    // Обновляем данные мастера
    Object.assign(MASTER, {
      name:             data.master.name             || MASTER.name,
      title:            data.master.title            || MASTER.title,
      about:            data.master.about            || MASTER.about,
      phone:            data.master.phone            || MASTER.phone,
      address:          data.master.address          || MASTER.address,
      addressLink:      data.master.address_link     || MASTER.addressLink,
      botUsername:      botUser,
      telegram:         `https://t.me/${botUser}`,
      _id:              data.master.id,
      // White-Label
      theme:            data.master.theme            || 'blue',
      logoUrl:          data.master.logo_url         || null,
      showBranding:     data.master.show_branding    !== false,
      masterTelegramId: data.master.telegram_id      || null,
      plan:             data.master.plan             || 'free',
      planExpiresAt:    data.master.plan_expires_at  || null,
    });

    // Применяем тему мастера
    applyMasterTheme(MASTER.theme);

    // Заменяем услуги если API вернул хотя бы одну
    if (data.services?.length > 0) {
      SERVICES.length = 0;
      data.services.forEach(s => {
        SERVICES.push({
          id:        s.id,
          category:  s.category,
          emoji:     s.emoji     || '💅',
          name:      s.name,
          shortDesc: s.short_desc || '',
          desc:      s.description || s.short_desc || '',
          price:     s.price,
          duration:  s.duration  || '',
          rating:    4.9,
          works:     [],
        });
      });
      // Популярные — первые 4 из каталога
      POPULAR_SERVICE_IDS.length = 0;
      SERVICES.slice(0, 4).forEach(s => POPULAR_SERVICE_IDS.push(s.id));
    }

    // Обновляем расписание
    if (data.schedule) {
      SCHEDULE.workHours = data.schedule.work_hours || SCHEDULE.workHours;
      SCHEDULE.daysOff   = data.schedule.days_off   || SCHEDULE.daysOff;
    }

    state.apiLoaded = true;
    console.log(`[API] Загружен каталог мастера @${botUser}`);
  } catch (e) {
    console.log('[API] Недоступен, используем data.js');
  }
}

/* ── 3. Состояние приложения ── */
const state = {
  currentTab: 'home',       // активный таб
  screenStack: [],           // стек push-экранов
  selectedService: null,     // выбранная услуга (объект из SERVICES)
  selectedDateIndex: 0,      // индекс выбранной даты (0 = сегодня)
  selectedSlot: null,        // строка вида "14:00"
  bookings: [],              // активные записи
  historyBookings: [],       // история
  activeCategory: 'all',     // активная категория в каталоге
  slotsCache: {},            // кеш слотов { "2026-03-31": ["9:00","10:00",...] }
  apiLoaded: false,          // true если данные загружены из API
  masterServices: [],        // кеш услуг для панели мастера
};

// Загрузка записей из localStorage
function loadBookings() {
  try {
    const raw = localStorage.getItem('bookings');
    if (raw) state.bookings = JSON.parse(raw);
    const rawH = localStorage.getItem('historyBookings');
    if (rawH) state.historyBookings = JSON.parse(rawH);
  } catch (e) {}
}

// Сохранение записей в localStorage
function saveBookings() {
  localStorage.setItem('bookings', JSON.stringify(state.bookings));
  localStorage.setItem('historyBookings', JSON.stringify(state.historyBookings));
}

/* ── 3. Навигация ── */

// Переключение таба
function switchTab(tabId) {
  if (state.currentTab === tabId && state.screenStack.length === 0) return;

  haptic('light');

  // Убрать все push-экраны если есть
  clearScreenStack();

  // Скрыть текущий таб
  document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('active'));

  // Показать нужный таб
  const screen = document.getElementById('tab-' + tabId);
  if (screen) {
    screen.classList.add('active');
    // Рендер содержимого при переключении
    renderTab(tabId);
  }

  // Обновить кнопки таб-бара
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  state.currentTab = tabId;
  state.screenStack = [];

  // BackButton Telegram — скрыть
  tg?.BackButton?.hide();
}

// Рендер содержимого таба (вызывается при переключении)
function renderTab(tabId) {
  switch (tabId) {
    case 'home':     renderHome(); break;
    case 'catalog':  renderCatalog(state.activeCategory); break;
    case 'bookings': renderBookings(); break;
    case 'about':    renderAbout(); break;
  }
}

// Очистить стек push-экранов (анимированно)
function clearScreenStack() {
  const screens = document.querySelectorAll('.push-screen.active');
  screens.forEach(s => {
    s.classList.remove('active');
    s.classList.remove('slide-left');
  });
  state.screenStack = [];
}

// Открыть push-экран
function pushScreen(screenId) {
  haptic('light');

  const screen = document.getElementById(screenId);
  if (!screen) return;

  // Текущий верхний экран уходит влево
  const current = getTopScreen();
  if (current) current.classList.add('slide-left');

  // Новый экран появляется справа
  screen.classList.remove('slide-left');
  screen.classList.add('active');

  state.screenStack.push(screenId);

  // BackButton Telegram
  tg?.BackButton?.show();
  tg?.BackButton?.onClick(goBack);

  // Скролл наверх
  screen.scrollTop = 0;
}

// Вернуться назад
function goBack() {
  haptic('light');

  if (state.screenStack.length === 0) return;

  // Убрать текущий экран
  const topId = state.screenStack.pop();
  const top = document.getElementById(topId);
  if (top) {
    top.classList.remove('active');
    top.classList.remove('slide-left');
  }

  // Восстановить предыдущий
  const prev = getTopScreen();
  if (prev) {
    prev.classList.remove('slide-left');
  }

  if (state.screenStack.length === 0) {
    tg?.BackButton?.hide();
  }
}

// Получить верхний экран в стеке
function getTopScreen() {
  if (state.screenStack.length === 0) {
    return document.getElementById('tab-' + state.currentTab);
  }
  const topId = state.screenStack[state.screenStack.length - 1];
  return document.getElementById(topId);
}

/* ── 4. Рендер экранов ── */

// ─── ГЛАВНАЯ ───
function renderHome() {
  const el = document.getElementById('tab-home');

  // Популярные услуги
  const popularServices = POPULAR_SERVICE_IDS.map(id => SERVICES.find(s => s.id === id)).filter(Boolean);

  el.innerHTML = `
    <!-- Hero мастера -->
    <div class="hero" style="position:relative">
      ${isMaster() ? '<button class="master-gear-btn" onclick="openMasterSettings()">⚙️</button>' : ''}
      <div class="hero__avatar">
        ${MASTER.logoUrl
          ? `<img class="hero__logo-img" src="${MASTER.logoUrl}" alt="${MASTER.name}">`
          : MASTER.emoji}
      </div>
      <div class="hero__name">${MASTER.name}</div>
      <div class="hero__title">${MASTER.title}</div>
      <div class="hero__stats">
        <div class="hero__stat">⭐ <strong>${MASTER.rating}</strong></div>
        <div class="hero__stat">💅 <strong>${MASTER.worksCount}</strong> работ</div>
        <div class="hero__stat">📅 <strong>${MASTER.experience}</strong></div>
      </div>
    </div>

    <!-- Кнопка поделиться -->
    <div style="padding: 0 16px 4px;">
      <button class="share-btn" onclick="shareBot()">
        🔗 Поделиться с другом
      </button>
    </div>

    <!-- Популярные услуги -->
    <div class="section">
      <div class="section-title">Популярные услуги</div>
    </div>
    <div class="popular-scroll">
      ${popularServices.map(s => `
        <div class="popular-card" data-id="${s.id}" onclick="openService(${s.id})">
          <div class="popular-card__emoji">${s.emoji}</div>
          <div class="popular-card__name">${s.name}</div>
          <div class="popular-card__price">от ${s.price.toLocaleString('ru')} ₽</div>
        </div>
      `).join('')}
    </div>

    <!-- Мои работы -->
    <div class="section">
      <div class="section-title">Мои работы</div>
    </div>
    <div class="portfolio-scroll">
      ${MASTER.portfolio.map(emoji => `
        <div class="portfolio-item">${emoji}</div>
      `).join('')}
    </div>

    <!-- Кнопка записаться -->
    <div class="main-btn-wrap pb-tab">
      <button class="main-btn" onclick="switchTab('catalog')">
        💅 Записаться
      </button>
    </div>

    ${poweredByBadge()}
  `;
}

// ─── КАТАЛОГ ───
function renderCatalog(categoryId = 'all') {
  state.activeCategory = categoryId;
  const el = document.getElementById('tab-catalog');

  const filtered = categoryId === 'all'
    ? SERVICES
    : SERVICES.filter(s => s.category === categoryId);

  el.innerHTML = `
    <!-- Чипы-категории -->
    <div class="chips-scroll">
      ${CATEGORIES.map(c => `
        <button class="chip ${c.id === categoryId ? 'active' : ''}"
          onclick="renderCatalog('${c.id}')">
          ${c.label}
        </button>
      `).join('')}
    </div>

    <!-- Список услуг -->
    <div class="catalog-list">
      ${filtered.map(s => `
        <div class="service-card" onclick="openService(${s.id})">
          <div class="service-card__emoji">${s.emoji}</div>
          <div class="service-card__info">
            <div class="service-card__name">${s.name}</div>
            <div class="service-card__desc">${s.shortDesc}</div>
            <div class="service-card__meta">
              <span class="service-card__price">${s.price.toLocaleString('ru')} ₽</span>
              <span class="service-card__duration">· ${s.duration}</span>
            </div>
          </div>
          <span style="font-size:20px;color:var(--text-tertiary)">›</span>
        </div>
      `).join('')}
    </div>
    <div class="spacer-bottom"></div>
  `;
}

// ─── МОИ ЗАПИСИ ───
function renderBookings() {
  const el = document.getElementById('tab-bookings');

  if (state.bookings.length === 0 && state.historyBookings.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__emoji">📅</div>
        <div class="empty-state__title">Нет записей</div>
        <div class="empty-state__desc">Выберите услугу и запишитесь<br>к мастеру всего за пару тапов</div>
        <div style="margin-top:24px;width:100%">
          <button class="main-btn" onclick="switchTab('catalog')">
            💅 Выбрать услугу
          </button>
        </div>
      </div>
    `;
    return;
  }

  let html = '';

  // Активные записи
  if (state.bookings.length > 0) {
    html += `<div class="section"><div class="section-title">Ближайшая запись</div></div>`;
    state.bookings.forEach((b, idx) => {
      html += `
        <div class="booking-card">
          <div class="booking-card__header">
            <div class="booking-card__emoji">${b.emoji}</div>
            <div>
              <div class="booking-card__service">${b.service}</div>
              <div class="booking-card__date">📅 ${b.date} · ⏰ ${b.slot}</div>
            </div>
          </div>
          <div class="booking-card__actions">
            <button class="btn-outline" onclick="rescheduleBooking(${idx})">Перенести</button>
            <button class="btn-outline danger" id="cancel-btn-${idx}" onclick="cancelBooking(${idx})">Отменить</button>
          </div>
        </div>
      `;
    });
  }

  // История
  if (state.historyBookings.length > 0) {
    html += `<div class="section" style="margin-top:8px"><div class="section-title">История</div></div>`;
    state.historyBookings.forEach((b, idx) => {
      html += `
        <div class="booking-card">
          <div class="booking-card__header">
            <div class="booking-card__emoji">${b.emoji}</div>
            <div>
              <div class="booking-card__service">${b.service}</div>
              <div class="booking-card__date" style="color:var(--text-tertiary)">${b.date} · ${b.slot}</div>
            </div>
          </div>
          <button class="btn-repeat" onclick="repeatBooking(${idx})">
            🔄 Записаться снова
          </button>
        </div>
      `;
    });
  }

  html += '<div class="spacer-bottom"></div>';
  el.innerHTML = html;
}

// ─── О МАСТЕРЕ ───
function renderAbout() {
  const el = document.getElementById('tab-about');
  const previewReviews = REVIEWS.slice(0, 2);

  el.innerHTML = `
    <div class="master-hero">
      <div class="master-avatar">
        ${MASTER.logoUrl
          ? `<img class="master-logo-img" src="${MASTER.logoUrl}" alt="${MASTER.name}">`
          : MASTER.emoji}
      </div>
      <div class="master-name">${MASTER.name}</div>
      <div class="master-title">${MASTER.title}</div>
      <div class="master-stats">
        <div class="master-stat">
          <div class="master-stat__value">⭐ ${MASTER.rating}</div>
          <div class="master-stat__label">рейтинг</div>
        </div>
        <div class="master-stat">
          <div class="master-stat__value">${MASTER.worksCount}</div>
          <div class="master-stat__label">работ</div>
        </div>
        <div class="master-stat">
          <div class="master-stat__value">${MASTER.experience}</div>
          <div class="master-stat__label">стаж</div>
        </div>
      </div>
    </div>

    <!-- Кнопки связи -->
    <div class="contact-btns">
      <button class="contact-btn contact-btn-tg" onclick="openTelegram()">
        <span class="contact-btn__icon">✈️</span>
        <span>Написать</span>
      </button>
      <button class="contact-btn contact-btn-call" onclick="callMaster()">
        <span class="contact-btn__icon">📞</span>
        <span>Позвонить</span>
      </button>
    </div>

    <!-- О себе -->
    <div class="master-about">${MASTER.about}</div>

    <!-- Портфолио -->
    <div class="section" style="margin-top:20px">
      <div class="section-title">Мои работы</div>
    </div>
    <div class="portfolio-grid" style="margin-bottom:20px">
      ${MASTER.portfolio.slice(0, 9).map(e => `
        <div class="portfolio-grid-item">${e}</div>
      `).join('')}
    </div>

    <!-- Отзывы -->
    <div class="section">
      <div class="section-title">Отзывы клиентов</div>
    </div>
    <div style="margin-top:4px">
      ${previewReviews.map(r => renderReviewCard(r)).join('')}
    </div>

    <!-- Все отзывы -->
    <div class="reviews-link" onclick="openReviews()">
      Все отзывы · ${REVIEWS.length}
      <span>›</span>
    </div>

    <!-- Кнопка -->
    <div class="main-btn-wrap pb-tab">
      <button class="main-btn" onclick="switchTab('catalog')">
        💅 Записаться
      </button>
    </div>

    <!-- Кнопка настроек (только для мастера) -->
    ${isMaster() ? `
    <button class="settings-btn" onclick="openMasterSettings()">
      <span class="settings-btn__icon">⚙️</span>
      <span>Настройки мастера</span>
      <span class="settings-btn__arrow">›</span>
    </button>
    ` : ''}

    ${poweredByBadge()}

    <!-- Версия (секретный сброс для админа) -->
    <div style="text-align:center;padding:8px 0 24px;color:var(--text-tertiary);font-size:11px" onclick="adminReset()">v1.0</div>
  `;
}

// ─── КАРТОЧКА УСЛУГИ (push) ───
function openService(serviceId) {
  const service = SERVICES.find(s => s.id === serviceId);
  if (!service) return;
  state.selectedService = service;

  const el = document.getElementById('screen-service');
  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">${service.name}</div>
    </div>

    <!-- Hero -->
    <div class="service-hero">${service.emoji}</div>

    <!-- Инфо -->
    <div class="service-detail-info">
      <div class="service-detail-name">${service.name}</div>
      <div class="service-detail-meta">
        <span class="badge badge-price">от ${service.price.toLocaleString('ru')} ₽</span>
        <span class="badge badge-duration">⏱ ${service.duration}</span>
        <span class="badge badge-rating">⭐ ${service.rating}</span>
      </div>
      <div class="service-detail-desc">${service.desc}</div>
    </div>

    <!-- Примеры работ -->
    <div class="section">
      <div class="section-title">Примеры работ</div>
    </div>
    <div class="works-scroll" style="margin-bottom:8px">
      ${service.works.map(e => `<div class="work-item">${e}</div>`).join('')}
    </div>

    <!-- Кнопка -->
    <div class="main-btn-wrap inside-push">
      <button class="main-btn" onclick="openDatetime()">
        📅 Выбрать дату и время
      </button>
    </div>
  `;

  pushScreen('screen-service');
}

// ─── ВЫБОР ДАТЫ И ВРЕМЕНИ (push) ───
function openDatetime() {
  state.selectedSlot = null;
  state.selectedDateIndex = 0;

  renderDatetimeScreen();
  pushScreen('screen-datetime');
}

function renderDatetimeScreen() {
  if (!state.selectedService) return;
  const el = document.getElementById('screen-datetime');

  const dates = getNext14Days();
  const freeCount = countFreeSlots(state.selectedDateIndex);

  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Выбор времени</div>
    </div>

    <!-- Напоминание об услуге -->
    <div class="booking-remind">
      <div class="booking-remind__emoji">${state.selectedService.emoji}</div>
      <div class="booking-remind__text">
        <div class="booking-remind__service">${state.selectedService.name}</div>
        <div class="booking-remind__meta">${state.selectedService.duration} · ${state.selectedService.price.toLocaleString('ru')} ₽</div>
      </div>
    </div>

    <!-- Лента дат -->
    <div class="date-strip">
      ${dates.map((d, i) => `
        <div class="date-chip ${i === state.selectedDateIndex ? 'active' : ''} ${d.disabled ? 'disabled' : ''}"
          onclick="${d.disabled ? '' : `selectDate(${i})`}">
          <div class="date-chip__day">${d.dayShort}</div>
          <div class="date-chip__num">${d.dayNum}</div>
        </div>
      `).join('')}
    </div>

    <!-- Счётчик слотов -->
    ${freeCount > 0 && freeCount <= 4 ? `
      <div class="slots-counter">⚡ Осталось ${freeCount} свободных окна</div>
    ` : ''}

    <!-- Слоты -->
    <div class="section" style="margin-top:12px">
      <div class="section-title">Доступное время</div>
    </div>
    <div class="slots-grid" id="slots-grid">
      ${renderSlots(state.selectedDateIndex)}
    </div>

    <!-- Кнопка (появится после выбора слота) -->
    <div class="main-btn-wrap inside-push" id="datetime-btn-wrap" style="${state.selectedSlot ? '' : 'display:none'}">
      <button class="main-btn" onclick="openConfirm()">
        Продолжить →
      </button>
    </div>

    <div class="spacer-bottom"></div>
  `;
}

// Получить 14 дней вперёд
function getNext14Days() {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const result = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayOfWeek = d.getDay();
    result.push({
      date: d,
      dayShort: days[dayOfWeek],
      dayNum: d.getDate(),
      disabled: SCHEDULE.daysOff.includes(dayOfWeek),
    });
  }
  return result;
}

// Рендер слотов для выбранного дня.
// Если данные загружены из API — используем кеш slotsCache.
// Иначе — статические данные из data.js.
function renderSlots(dayIndex) {
  const dates = getNext14Days();
  const dayDisabled = dates[dayIndex]?.disabled;

  if (dayDisabled) {
    return '<div style="grid-column:1/-1;text-align:center;color:var(--text-tertiary);padding:16px">Выходной день</div>';
  }

  // Если есть кеш из API — показываем только свободные слоты
  const dateKey = toDateKey(dates[dayIndex].date);
  if (state.slotsCache[dateKey]) {
    const freeSlots = state.slotsCache[dateKey];
    if (freeSlots.length === 0) {
      return '<div style="grid-column:1/-1;text-align:center;color:var(--text-tertiary);padding:16px">Нет свободных слотов</div>';
    }
    return freeSlots.map(hour => {
      const isSelected = state.selectedSlot === hour;
      return `<div class="slot ${isSelected ? 'selected' : ''}" onclick="selectSlot('${hour}')">${hour}</div>`;
    }).join('');
  }

  // Запасной вариант — data.js (пока API не загружен)
  const busyForDay = SCHEDULE.busySlots[dayIndex % 7] || [];
  return SCHEDULE.workHours.map(hour => {
    const isBusy = busyForDay.includes(hour);
    const isSelected = state.selectedSlot === hour;
    let cls = 'slot';
    if (isBusy) cls += ' busy';
    else if (isSelected) cls += ' selected';
    return `<div class="${cls}" onclick="${isBusy ? '' : `selectSlot('${hour}')`}">${hour}</div>`;
  }).join('');
}

// Количество свободных слотов (для счётчика "Осталось X окна")
function countFreeSlots(dayIndex) {
  const dates = getNext14Days();
  const dateKey = toDateKey(dates[dayIndex].date);
  if (state.slotsCache[dateKey]) return state.slotsCache[dateKey].length;
  const busy = SCHEDULE.busySlots[dayIndex % 7] || [];
  return SCHEDULE.workHours.length - busy.length;
}

// Преобразовать Date в строку YYYY-MM-DD для API
function toDateKey(date) {
  return date.toISOString().split('T')[0];
}

// Загрузить слоты для даты из API и обновить сетку
async function fetchAndRenderSlots(dayIndex) {
  const dates = getNext14Days();
  const dateKey = toDateKey(dates[dayIndex].date);
  const botUser = getBotUsername();

  if (!botUser || state.slotsCache[dateKey] !== undefined) return;

  try {
    const res = await fetch(`${API_URL}/api/app/${botUser}/slots?date=${dateKey}`);
    if (!res.ok) return;
    const data = await res.json();
    state.slotsCache[dateKey] = data.slots || [];

    // Обновляем только сетку слотов если экран всё ещё открыт
    const grid = document.getElementById('slots-grid');
    if (grid) grid.innerHTML = renderSlots(dayIndex);
  } catch (e) {
    console.log('[API] Не удалось загрузить слоты');
  }
}

// Выбрать дату
function selectDate(index) {
  haptic('light');
  state.selectedDateIndex = index;
  state.selectedSlot = null;
  renderDatetimeScreen();
  document.getElementById('screen-datetime').scrollTop = 0;
  // Загружаем слоты из API для выбранной даты
  fetchAndRenderSlots(index);
}

// Выбрать слот
function selectSlot(hour) {
  haptic('medium');
  state.selectedSlot = hour;

  // Обновить только сетку слотов и кнопку (без полного ре-рендера)
  const grid = document.getElementById('slots-grid');
  if (grid) grid.innerHTML = renderSlots(state.selectedDateIndex);

  const btnWrap = document.getElementById('datetime-btn-wrap');
  if (btnWrap) btnWrap.style.display = '';
}

// ─── ПОДТВЕРЖДЕНИЕ (push) ───
function openConfirm() {
  if (!state.selectedService || !state.selectedSlot) return;

  const dates = getNext14Days();
  const dateObj = dates[state.selectedDateIndex];
  const dateStr = formatDate(dateObj.date);

  const el = document.getElementById('screen-confirm');
  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Подтверждение</div>
    </div>

    <!-- Карточка-резюме -->
    <div class="confirm-card">
      <div class="confirm-row">
        <div class="confirm-row__icon">${state.selectedService.emoji}</div>
        <div>
          <div class="confirm-row__label">Услуга</div>
          <div class="confirm-row__value">${state.selectedService.name}</div>
        </div>
      </div>
      <div class="confirm-row">
        <div class="confirm-row__icon">📅</div>
        <div>
          <div class="confirm-row__label">Дата и время</div>
          <div class="confirm-row__value">${dateStr}, ${state.selectedSlot}</div>
        </div>
      </div>
      <div class="confirm-row">
        <div class="confirm-row__icon">${MASTER.emoji}</div>
        <div>
          <div class="confirm-row__label">Мастер</div>
          <div class="confirm-row__value">${MASTER.name}</div>
        </div>
      </div>
      <div class="confirm-row">
        <div class="confirm-row__icon">⏱</div>
        <div>
          <div class="confirm-row__label">Длительность</div>
          <div class="confirm-row__value">${state.selectedService.duration}</div>
        </div>
      </div>
      <div class="confirm-row">
        <div class="confirm-row__icon">💰</div>
        <div>
          <div class="confirm-row__label">Стоимость</div>
          <div class="confirm-row__value confirm-price">${state.selectedService.price.toLocaleString('ru')} ₽</div>
        </div>
      </div>
    </div>

    <!-- Адрес -->
    <a class="map-link" href="${MASTER.addressLink}" target="_blank" onclick="tg?.openLink?.('${MASTER.addressLink}'); return false;">
      📍 ${MASTER.address}
      <span style="font-size:18px">›</span>
    </a>

    <!-- Кнопка -->
    <div style="padding:0 16px 32px">
      <button class="main-btn" id="confirm-btn" onclick="confirmBooking()">
        ✅ Подтвердить запись
      </button>
    </div>
  `;

  pushScreen('screen-confirm');
}

// Форматирование даты
function formatDate(date) {
  const months = ['января','февраля','марта','апреля','мая','июня',
                  'июля','августа','сентября','октября','ноября','декабря'];
  const days = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

// ─── ПОДТВЕРЖДЕНИЕ ЗАПИСИ ───
// Если API подключён — отправляем запись на сервер.
// Сервер сохранит в Supabase и уведомит мастера через бота.
async function confirmBooking() {
  const btn = document.getElementById('confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Отправляем...'; }

  const dates = getNext14Days();
  const dateObj = dates[state.selectedDateIndex];
  const dateStr = formatDate(dateObj.date);
  const dateKey = toDateKey(dateObj.date);

  const booking = {
    service: state.selectedService.name,
    emoji:   state.selectedService.emoji,
    date:    dateStr,
    slot:    state.selectedSlot,
    price:   state.selectedService.price,
  };

  // Если API загружен — создаём запись через сервер
  if (state.apiLoaded && MASTER._id) {
    try {
      const clientUser = tg?.initDataUnsafe?.user;
      const res = await fetch(`${API_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_id:  MASTER._id,
          service_id: state.selectedService.id,
          date:       dateKey,
          time_slot:  state.selectedSlot,
          client: {
            telegram_id: clientUser?.id       || 0,
            first_name:  clientUser?.first_name|| '',
            last_name:   clientUser?.last_name || '',
            username:    clientUser?.username  || '',
          }
        })
      });

      if (!res.ok) {
        const err = await res.json();
        if (btn) { btn.disabled = false; btn.textContent = '✅ Подтвердить запись'; }
        tg?.showAlert?.(err.error || 'Не удалось создать запись. Попробуй ещё раз.');
        return;
      }

      // Сохраняем ID записи с сервера — нужен для отмены через API
      const serverData = await res.json();
      if (serverData.booking?.id) booking._apiId = serverData.booking.id;

      // Убрать занятый слот из кеша
      if (state.slotsCache[dateKey]) {
        state.slotsCache[dateKey] = state.slotsCache[dateKey].filter(s => s !== state.selectedSlot);
      }

    } catch (e) {
      // Если сервер недоступен — продолжаем локально
      console.log('[API] Запись сохранена локально');
    }
  }

  // Сохраняем в localStorage (для экрана "Мои записи")
  state.bookings.unshift(booking);
  saveBookings();
  hapticNotify('success');

  setTimeout(() => {
    renderSuccessScreen(booking);
    clearScreenStack();
    pushScreen('screen-success');
  }, 400);
}

// ─── УСПЕХ (push) ───
function renderSuccessScreen(booking) {
  const el = document.getElementById('screen-success');
  el.innerHTML = `
    <div class="success-screen">
      <div class="success-emoji">✅</div>
      <div class="success-title">Запись подтверждена!</div>
      <div class="success-detail">
        ${booking.service}<br>
        ${booking.date} · ${booking.slot}
      </div>
      <div class="success-remind">
        🔔 Напоминание придёт в Telegram<br>за 24 часа и за 2 часа до визита
      </div>
      <div style="margin-top:32px;width:100%">
        <button class="main-btn" onclick="gotoBookings()">
          📅 Мои записи
        </button>
      </div>
    </div>
  `;
}

// Написать мастеру в Telegram
function openTelegram() {
  haptic('light');
  if (tg) {
    tg.openLink(MASTER.telegram);
  } else {
    window.open(MASTER.telegram, '_blank');
  }
}

// Позвонить мастеру
function callMaster() {
  haptic('light');
  // tel: ссылка — открывает звонок на телефоне
  window.location.href = 'tel:' + MASTER.phone.replace(/\D/g, '');
}

function gotoBookings() {
  haptic('light');
  clearScreenStack();
  switchTab('bookings');
}

// ─── ОТЗЫВЫ (push) ───
function openReviews() {
  const el = document.getElementById('screen-reviews');
  const starsHtml = (n) => '⭐'.repeat(n) + (n < 5 ? '☆'.repeat(5 - n) : '');

  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Отзывы</div>
    </div>

    <!-- Средняя оценка -->
    <div class="reviews-avg">
      <div class="reviews-avg__num">${MASTER.rating}</div>
      <div>
        <div class="reviews-avg__stars">${starsHtml(Math.round(MASTER.rating))}</div>
        <div class="reviews-avg__count">${REVIEWS.length} отзывов</div>
      </div>
    </div>

    <!-- Все отзывы -->
    ${REVIEWS.map(r => renderReviewCard(r)).join('')}
    <div class="spacer-bottom"></div>
  `;

  pushScreen('screen-reviews');
}

// Рендер одной карточки отзыва
function renderReviewCard(r) {
  const stars = '⭐'.repeat(r.stars) + (r.stars < 5 ? '☆'.repeat(5 - r.stars) : '');
  return `
    <div class="review-card">
      <div class="review-card__header">
        <div class="review-card__avatar">${r.avatar}</div>
        <div>
          <div class="review-card__name">${r.name}</div>
          <div class="review-card__date">${r.date}</div>
        </div>
        <div class="review-card__stars" style="margin-left:auto">${stars}</div>
      </div>
      <div class="review-card__service">${r.service}</div>
      <div class="review-card__text">${r.text}</div>
    </div>
  `;
}

// ─── ДЕЙСТВИЯ С ЗАПИСЯМИ ───
function cancelBooking(idx) {
  haptic('medium');
  doCancel(idx);
}

function doCancel(idx) {
  const removed = state.bookings.splice(idx, 1)[0];
  if (removed) {
    state.historyBookings.unshift(removed);
    // Уведомить сервер об отмене (уведомит мастера через бот)
    if (removed._apiId && state.apiLoaded) {
      const userId = tg?.initDataUnsafe?.user?.id;
      if (userId) {
        fetch(`${API_URL}/api/client/bookings/${removed._apiId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_id: userId })
        }).catch(() => {});
      }
    }
  }
  saveBookings();
  hapticNotify('warning');
  renderBookings();
}

function rescheduleBooking(idx) {
  haptic('light');
  const booking = state.bookings[idx];
  const service = SERVICES.find(s => s.name === booking.service);
  if (service) {
    state.selectedService = service;
    // Убрать старую запись
    state.bookings.splice(idx, 1);
    saveBookings();
    openDatetime();
  }
}

function repeatBooking(idx) {
  haptic('light');
  const booking = state.historyBookings[idx];
  const service = SERVICES.find(s => s.name === booking.service);
  if (service) {
    state.selectedService = service;
    openDatetime();
  }
}

/* ── Панель настроек мастера ── */

function openMasterSettings() {
  renderMasterSettings();
  pushScreen('screen-settings');
}

function renderMasterSettings() {
  const themes = [
    { id: 'blue',     label: 'Синяя',    color: '#2AABEE' },
    { id: 'rose',     label: 'Роза',     color: '#FF4F9A' },
    { id: 'lavender', label: 'Лаванда',  color: '#9B72CF' },
    { id: 'gold',     label: 'Золото',   color: '#C8963E' },
    { id: 'dark',     label: 'Тёмная',   color: '#3A3A3C' },
  ];

  const isPro = MASTER.plan === 'pro';
  const expiryDate = MASTER.planExpiresAt ? MASTER.planExpiresAt.split('T')[0] : null;

  const el = document.getElementById('screen-settings');
  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Настройки мастера</div>
    </div>

    <!-- Тариф -->
    <div class="section"><div class="section-title">Тариф</div></div>
    <div class="plan-card ${isPro ? 'plan-card--pro' : ''}">
      <div class="plan-card__icon">${isPro ? '⭐' : '🆓'}</div>
      <div class="plan-card__info">
        <div class="plan-card__name">${isPro ? 'Pro' : 'Free'}</div>
        ${isPro && expiryDate
          ? `<div class="plan-card__expires">Действует до ${expiryDate}</div>`
          : '<div class="plan-card__limit">До 5 активных услуг</div>'}
      </div>
      <span class="plan-card__badge ${isPro ? 'plan-card__badge--pro' : ''}">${isPro ? 'Pro' : 'Free'}</span>
    </div>

    ${!isPro ? `
    <!-- Кнопки перехода на Pro -->
    <div class="upgrade-row">
      <button class="upgrade-btn" onclick="startUpgrade(1)">
        <div class="upgrade-btn__months">1 месяц</div>
        <div class="upgrade-btn__price">299 ₽</div>
      </button>
      <button class="upgrade-btn" onclick="startUpgrade(3)">
        <div class="upgrade-btn__months">3 месяца</div>
        <div class="upgrade-btn__price">799 ₽</div>
      </button>
      <button class="upgrade-btn upgrade-btn--best" onclick="startUpgrade(12)">
        <div class="upgrade-btn__best">Выгоднее</div>
        <div class="upgrade-btn__months">12 мес.</div>
        <div class="upgrade-btn__price">2499 ₽</div>
      </button>
    </div>
    ` : ''}

    <!-- Тема оформления -->
    <div class="section"><div class="section-title">Тема оформления</div></div>
    <div class="theme-picker">
      ${themes.map(t => `
        <button class="theme-option ${MASTER.theme === t.id ? 'active' : ''}"
          onclick="selectTheme('${t.id}')">
          <div class="theme-option__dot" style="background:${t.color}"></div>
          <div class="theme-option__label">${t.label}</div>
          ${!isPro && t.id !== 'blue' ? '<div class="theme-option__lock">Pro</div>' : ''}
        </button>
      `).join('')}
    </div>

    <!-- Управление -->
    <div class="section"><div class="section-title">Управление</div></div>
    <div style="margin:0 16px 24px;background:var(--bg-card);border-radius:var(--radius-card);box-shadow:var(--shadow-card);overflow:hidden">
      <button class="settings-btn" style="border-bottom:1px solid var(--border)" onclick="openMasterProfile()">
        <span class="settings-btn__icon">👤</span>
        <span>Профиль мастера</span>
        <span class="settings-btn__arrow">›</span>
      </button>
      <button class="settings-btn" onclick="openMasterServices()">
        <span class="settings-btn__icon">💅</span>
        <span>Услуги</span>
        <span class="settings-btn__arrow">›</span>
      </button>
    </div>

    <div class="spacer-bottom"></div>
  `;
  el.scrollTop = 0;
}

// Выбрать тему — Pro-темы заблокированы для Free
function selectTheme(themeId) {
  if (themeId !== 'blue' && MASTER.plan !== 'pro') {
    hapticNotify('error');
    tg?.showAlert?.('Выбор темы доступен только на тарифе Pro 💜');
    return;
  }
  haptic('medium');
  MASTER.theme = themeId;
  applyMasterTheme(themeId);
  saveThemeToAPI(themeId);
  renderMasterSettings(); // обновить выделение активной темы
}

// Сохранить тему на сервере
async function saveThemeToAPI(theme) {
  if (!MASTER._id) return;
  const userId = tg?.initDataUnsafe?.user?.id;
  if (!userId) return;
  try {
    await fetch(`${API_URL}/api/master/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': String(userId)
      },
      body: JSON.stringify({ theme })
    });
  } catch (e) {
    console.log('[API] Тема не сохранена');
  }
}

// Начать оплату Pro подписки
async function startUpgrade(months) {
  haptic('medium');
  if (!MASTER._id) return;

  try {
    const res = await fetch(`${API_URL}/api/payment/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_id: MASTER._id, months })
    });

    if (!res.ok) throw new Error('error');
    const data = await res.json();

    // Открываем страницу оплаты ЮKassa
    if (tg) {
      tg.openLink(data.confirmation_url);
    } else {
      window.open(data.confirmation_url, '_blank');
    }
  } catch (e) {
    tg?.showAlert?.('Не удалось создать счёт. Попробуйте позже.');
  }
}

/* ── Редактирование профиля мастера ── */

function openMasterProfile() {
  renderMasterProfile();
  pushScreen('screen-master-profile');
}

function renderMasterProfile() {
  const el = document.getElementById('screen-master-profile');
  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Профиль мастера</div>
    </div>

    <div class="form-section" style="padding-top:20px">

      <div class="form-group">
        <label class="form-label">Имя</label>
        <input class="form-input" id="profile-name" type="text"
          value="${MASTER.name}" placeholder="Анна Козлова">
      </div>

      <div class="form-group">
        <label class="form-label">Специализация</label>
        <input class="form-input" id="profile-title" type="text"
          value="${MASTER.title || ''}" placeholder="Мастер маникюра и педикюра">
      </div>

      <div class="form-group">
        <label class="form-label">О себе</label>
        <textarea class="form-textarea" id="profile-about"
          placeholder="Расскажи о себе, опыте и подходе к работе...">${MASTER.about || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Телефон</label>
        <input class="form-input" id="profile-phone" type="tel"
          value="${MASTER.phone || ''}" placeholder="+7 900 123-45-67">
      </div>

      <div class="form-group">
        <label class="form-label">Адрес студии</label>
        <input class="form-input" id="profile-address" type="text"
          value="${MASTER.address || ''}" placeholder="г. Москва, ул. Садовая, 12">
      </div>

      <div class="form-group">
        <label class="form-label">Логотип (URL изображения)</label>
        <input class="form-input" id="profile-logo" type="url"
          value="${MASTER.logoUrl || ''}" placeholder="https://...">
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">
          Загрузи фото в imgbb.com или другой хостинг и вставь ссылку
        </div>
      </div>

    </div>

    <div style="padding:0 16px 32px">
      <button class="main-btn" id="save-profile-btn" onclick="saveMasterProfile()">
        Сохранить
      </button>
    </div>
  `;
  el.scrollTop = 0;
}

async function saveMasterProfile() {
  const userId = tg?.initDataUnsafe?.user?.id;
  if (!userId) return;

  const updates = {
    name:         document.getElementById('profile-name')?.value.trim(),
    title:        document.getElementById('profile-title')?.value.trim(),
    about:        document.getElementById('profile-about')?.value.trim(),
    phone:        document.getElementById('profile-phone')?.value.trim(),
    address:      document.getElementById('profile-address')?.value.trim(),
    logo_url:     document.getElementById('profile-logo')?.value.trim() || null,
  };

  const btn = document.getElementById('save-profile-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }

  try {
    const res = await fetch(`${API_URL}/api/master/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': String(userId)
      },
      body: JSON.stringify(updates)
    });

    if (!res.ok) throw new Error();

    // Обновить локальные данные
    if (updates.name)     MASTER.name     = updates.name;
    if (updates.title)    MASTER.title    = updates.title;
    if (updates.about)    MASTER.about    = updates.about;
    if (updates.phone)    MASTER.phone    = updates.phone;
    if (updates.address)  MASTER.address  = updates.address;
    MASTER.logoUrl = updates.logo_url;

    hapticNotify('success');
    goBack();
  } catch {
    hapticNotify('error');
    tg?.showAlert?.('Не удалось сохранить. Попробуйте ещё раз.');
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить'; }
  }
}

/* ── Управление услугами мастера ── */

async function openMasterServices() {
  const el = document.getElementById('screen-master-services');
  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Услуги</div>
    </div>
    <div style="padding:32px;text-align:center;color:var(--text-tertiary)">Загружаем...</div>
  `;
  pushScreen('screen-master-services');

  const services = await fetchMasterServices();
  renderMasterServicesList(services);
}

async function fetchMasterServices() {
  const userId = tg?.initDataUnsafe?.user?.id;
  if (!userId) return [];
  try {
    const res = await fetch(`${API_URL}/api/master/services`, {
      headers: { 'x-telegram-id': String(userId) }
    });
    if (!res.ok) return [];
    const data = await res.json();
    state.masterServices = data;
    return data;
  } catch { return []; }
}

function renderMasterServicesList(services) {
  const el = document.getElementById('screen-master-services');
  const isPro  = MASTER.plan === 'pro';
  const active = services.filter(s => s.is_active && !s.is_locked).length;
  const atLimit = !isPro && active >= 5;

  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">Услуги</div>
    </div>

    ${!isPro ? `
    <div style="margin:12px 16px 0;padding:10px 14px;background:var(--accent-soft);border-radius:10px;font-size:13px;color:var(--accent);font-weight:600">
      ${active} из 5 активных услуг ${atLimit ? '— лимит достигнут' : ''}
    </div>
    ` : ''}

    <div class="section"><div class="section-title">Все услуги</div></div>

    <div class="master-services-list">
      ${services.length === 0
        ? '<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Услуг пока нет</div>'
        : services.map(s => `
          <div class="master-service-row" onclick="openEditService(${JSON.stringify(s).replace(/"/g, '&quot;')})">
            <div class="master-service-row__emoji">${s.emoji || '💅'}</div>
            <div class="master-service-row__info">
              <div class="master-service-row__name">${s.name}</div>
              <div class="master-service-row__meta">${s.price.toLocaleString('ru')} ₽ · ${s.duration || '—'}</div>
            </div>
            <div class="svc-status ${s.is_locked ? 'svc-status--locked' : s.is_active ? 'svc-status--active' : 'svc-status--inactive'}"></div>
            <span style="font-size:20px;color:var(--text-tertiary)">›</span>
          </div>
        `).join('')}
      <button class="add-service-btn" onclick="openNewService()" ${atLimit ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>
        ＋ Добавить услугу ${atLimit ? '(лимит Free)' : ''}
      </button>
    </div>

    <div class="spacer-bottom"></div>
  `;
}

function openNewService() {
  renderServiceEditForm(null);
  pushScreen('screen-master-service-edit');
}

function openEditService(service) {
  renderServiceEditForm(service);
  pushScreen('screen-master-service-edit');
}

function renderServiceEditForm(service) {
  const isNew = !service;
  const el = document.getElementById('screen-master-service-edit');

  el.innerHTML = `
    <div class="screen-header">
      <button class="screen-header__back" onclick="goBack()">‹</button>
      <div class="screen-header__title">${isNew ? 'Новая услуга' : 'Редактировать'}</div>
    </div>

    <div class="form-section" style="padding-top:20px">

      <div style="display:flex;gap:12px">
        <div class="form-group" style="width:72px;flex-shrink:0">
          <label class="form-label">Эмодзи</label>
          <input class="form-input" id="svc-emoji" type="text" maxlength="2"
            value="${service?.emoji || '💅'}" style="text-align:center;font-size:22px;padding:10px 8px">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Название *</label>
          <input class="form-input" id="svc-name" type="text"
            value="${service?.name || ''}" placeholder="Маникюр гель-лак">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Категория</label>
        <select class="form-select" id="svc-category">
          ${[
            ['mani',   'Маникюр'],
            ['pedi',   'Педикюр'],
            ['brows',  'Брови'],
            ['lashes', 'Ресницы'],
            ['other',  'Другое'],
          ].map(([val, label]) =>
            `<option value="${val}" ${service?.category === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Краткое описание</label>
        <input class="form-input" id="svc-short-desc" type="text"
          value="${service?.short_desc || ''}" placeholder="Одна строка для каталога">
      </div>

      <div class="form-group">
        <label class="form-label">Полное описание</label>
        <textarea class="form-textarea" id="svc-description"
          placeholder="Подробно об услуге...">${service?.description || ''}</textarea>
      </div>

      <div style="display:flex;gap:12px">
        <div class="form-group" style="flex:1">
          <label class="form-label">Цена, ₽</label>
          <input class="form-input" id="svc-price" type="number" min="0"
            value="${service?.price || ''}" placeholder="2500">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Длительность</label>
          <input class="form-input" id="svc-duration" type="text"
            value="${service?.duration || ''}" placeholder="1 ч 30 мин">
        </div>
      </div>

    </div>

    <div class="form-card">
      <div class="form-toggle-row">
        <div>
          <div class="form-toggle-label">Активна</div>
          <div class="form-toggle-sub">Видна клиентам в каталоге</div>
        </div>
        <button class="toggle ${service?.is_active !== false ? 'on' : ''}" id="svc-active"
          onclick="this.classList.toggle('on')"></button>
      </div>
    </div>

    <div style="padding:8px 16px 12px">
      <button class="main-btn" id="save-service-btn" onclick="saveService('${service?.id || ''}')">
        ${isNew ? 'Создать услугу' : 'Сохранить'}
      </button>
    </div>

    ${!isNew ? `
    <div style="padding:0 16px 32px">
      <button class="danger-btn" onclick="deleteService('${service.id}')">
        Удалить услугу
      </button>
    </div>
    ` : '<div style="height:24px"></div>'}
  `;
  el.scrollTop = 0;
}

async function saveService(serviceId) {
  const userId = tg?.initDataUnsafe?.user?.id;
  if (!userId) return;

  const name = document.getElementById('svc-name')?.value.trim();
  if (!name) {
    tg?.showAlert?.('Укажи название услуги');
    return;
  }

  const data = {
    emoji:       document.getElementById('svc-emoji')?.value.trim()   || '💅',
    name,
    category:    document.getElementById('svc-category')?.value       || 'other',
    short_desc:  document.getElementById('svc-short-desc')?.value.trim(),
    description: document.getElementById('svc-description')?.value.trim(),
    price:       parseInt(document.getElementById('svc-price')?.value) || 0,
    duration:    document.getElementById('svc-duration')?.value.trim(),
    is_active:   document.getElementById('svc-active')?.classList.contains('on'),
  };

  const btn = document.getElementById('save-service-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем...'; }

  const isNew = !serviceId;
  const url = isNew
    ? `${API_URL}/api/master/services`
    : `${API_URL}/api/master/services/${serviceId}`;

  try {
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-id': String(userId)
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка');
    }

    hapticNotify('success');
    goBack();
    // Обновить список после возврата
    const updated = await fetchMasterServices();
    renderMasterServicesList(updated);
  } catch (e) {
    hapticNotify('error');
    tg?.showAlert?.(e.message || 'Не удалось сохранить. Попробуйте ещё раз.');
    if (btn) { btn.disabled = false; btn.textContent = isNew ? 'Создать услугу' : 'Сохранить'; }
  }
}

function deleteService(serviceId) {
  haptic('medium');
  tg?.showPopup?.({
    title: 'Удалить услугу?',
    message: 'Клиенты больше не смогут на неё записаться. Отменить нельзя.',
    buttons: [
      { id: 'yes', type: 'destructive', text: 'Удалить' },
      { type: 'cancel', text: 'Отмена' }
    ]
  }, async (btnId) => {
    if (btnId !== 'yes') return;
    const userId = tg?.initDataUnsafe?.user?.id;
    if (!userId) return;
    try {
      await fetch(`${API_URL}/api/master/services/${serviceId}`, {
        method: 'DELETE',
        headers: { 'x-telegram-id': String(userId) }
      });
      hapticNotify('success');
      goBack();
      const updated = await fetchMasterServices();
      renderMasterServicesList(updated);
    } catch {
      tg?.showAlert?.('Не удалось удалить. Попробуйте ещё раз.');
    }
  });
}

/* ── 5. Инициализация ── */
async function init() {
  loadBookings();

  // Настройка таб-бара
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // BackButton Telegram
  if (tg?.BackButton) {
    tg.BackButton.onClick(() => {
      if (state.screenStack.length > 0) goBack();
    });
  }

  // Загружаем данные мастера из API ДО рендера
  // Так фронтенд сразу покажет реальные данные, а не data.js
  await loadFromAPI();

  // Обновляем сплэш с реальным именем мастера
  const splashName = document.getElementById('splash-name');
  const splashSub  = document.getElementById('splash-sub');
  if (splashName) splashName.textContent = MASTER.name;
  if (splashSub)  splashSub.textContent  = MASTER.title;

  // Обновляем текст онбординга под конкретного мастера
  const onboardingSub = document.getElementById('onboarding-subtitle');
  if (onboardingSub) {
    onboardingSub.textContent = `Рада видеть тебя у ${MASTER.name} — ${MASTER.title.toLowerCase()}`;
  }

  // Если пришли со страницы оплаты — показываем подтверждение
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment') === 'success') {
    setTimeout(() => {
      hapticNotify('success');
      tg?.showAlert?.('🎉 Оплата прошла! Pro подписка активирована. Спасибо!');
    }, 1500);
  }

  // Начальный рендер (уже с данными из API если они загружены)
  renderTab('home');
  // Сразу загружаем слоты на сегодня
  fetchAndRenderSlots(0);

  // Показать приложение, скрыть splash
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('tab-bar').classList.remove('hidden');
      // Показать онбординг (или оффер) при первом визите
      showOnboardingIfNeeded();
    }, 300);
  }, 1200);
}

/* ── Онбординг ── */
function showOnboardingIfNeeded() {
  if (localStorage.getItem('onboarding_done')) {
    showOfferIfNeeded();
    return;
  }
  // Обращение по имени из Telegram
  const firstName = tg?.initDataUnsafe?.user?.first_name;
  if (firstName) {
    document.getElementById('onboarding-title').textContent = `Привет, ${firstName}! 👋`;
  }
  setTimeout(() => {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
  }, 400);
}

function closeOnboarding() {
  localStorage.setItem('onboarding_done', '1');
  haptic('medium');
  const overlay = document.getElementById('onboarding-overlay');
  overlay.classList.add('hiding');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('hiding');
    showOfferIfNeeded();
  }, 320);
}

/* ── Поделиться ── */
function shareBot() {
  haptic('light');
  const url = `https://t.me/${MASTER.botUsername}?start=from_share`;
  const text = `Записывайся к мастеру маникюра онлайн — удобно и быстро 💅`;
  if (tg) {
    tg.showPopup({
      title: 'Поделиться с другом',
      message: 'Отправь другу ссылку на запись к мастеру 💅',
      buttons: [
        { id: 'share', type: 'default', text: 'Отправить в Telegram' },
        { id: 'copy', type: 'default', text: 'Скопировать ссылку' },
        { type: 'cancel', text: 'Закрыть' }
      ]
    }, (btnId) => {
      if (btnId === 'share') {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      } else if (btnId === 'copy') {
        navigator.clipboard?.writeText(url).then(() => {
          hapticNotify('success');
          tg.showAlert('Ссылка скопирована!');
        });
      }
    });
  } else {
    navigator.clipboard?.writeText(url);
    alert('Ссылка скопирована: ' + url);
  }
}

/* ── Оффер-модалка ── */
function showOfferIfNeeded() {
  if (localStorage.getItem('offer_shown')) return;
  setTimeout(() => {
    const overlay = document.getElementById('offer-overlay');
    overlay.classList.remove('hidden');
  }, 600);
}

function closeOffer(goToBot) {
  localStorage.setItem('offer_shown', '1');
  const overlay = document.getElementById('offer-overlay');
  overlay.classList.add('hiding');
  haptic('medium');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('hiding');
  }, 320);
  if (goToBot) {
    hapticNotify('success');
    const url = `https://t.me/${MASTER.botUsername}?start=from_app`;
    if (tg) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }
}

/* ── Секретный сброс для админа (кнопка v1.0 в О мастере) ── */
function adminReset() {
  if (tg) {
    tg.showPopup({
      title: 'Сброс для теста',
      message: 'Сбросить онбординг и показать модалку заново?',
      buttons: [
        { id: 'yes', type: 'default', text: 'Да, сбросить' },
        { type: 'cancel', text: 'Отмена' }
      ]
    }, (btnId) => {
      if (btnId === 'yes') {
        localStorage.removeItem('onboarding_done');
        localStorage.removeItem('offer_shown');
        hapticNotify('success');
        switchTab('home');
        setTimeout(() => showOnboardingIfNeeded(), 400);
      }
    });
  }
}

// Запуск после загрузки DOM
document.addEventListener('DOMContentLoaded', init);

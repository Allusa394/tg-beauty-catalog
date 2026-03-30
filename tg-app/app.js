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
  tg.enableClosingConfirmation(); // защита от случайного закрытия
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

/* ── 2. Состояние приложения ── */
const state = {
  currentTab: 'home',       // активный таб
  screenStack: [],           // стек push-экранов
  selectedService: null,     // выбранная услуга (объект из SERVICES)
  selectedDateIndex: 0,      // индекс выбранной даты (0 = сегодня)
  selectedSlot: null,        // строка вида "14:00"
  bookings: [],              // активные записи
  historyBookings: [],       // история
  activeCategory: 'all',     // активная категория в каталоге
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
    <div class="hero">
      <div class="hero__avatar" onclick="adminTap()" id="admin-avatar">${MASTER.emoji}</div>
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
      <div class="master-avatar">${MASTER.emoji}</div>
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

// Рендер слотов для выбранного дня
function renderSlots(dayIndex) {
  const busyForDay = SCHEDULE.busySlots[dayIndex % 7] || [];
  const dates = getNext14Days();
  const dayDisabled = dates[dayIndex]?.disabled;

  return SCHEDULE.workHours.map(hour => {
    const isBusy = dayDisabled || busyForDay.includes(hour);
    const isSelected = state.selectedSlot === hour;
    let cls = 'slot';
    if (isBusy) cls += ' busy';
    else if (isSelected) cls += ' selected';

    return `<div class="${cls}" onclick="${isBusy ? '' : `selectSlot('${hour}')`}">${hour}</div>`;
  }).join('');
}

// Количество свободных слотов
function countFreeSlots(dayIndex) {
  const busy = SCHEDULE.busySlots[dayIndex % 7] || [];
  return SCHEDULE.workHours.length - busy.length;
}

// Выбрать дату
function selectDate(index) {
  haptic('light');
  state.selectedDateIndex = index;
  state.selectedSlot = null;
  renderDatetimeScreen();
  // Восстановить скролл
  document.getElementById('screen-datetime').scrollTop = 0;
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
function confirmBooking() {
  const btn = document.getElementById('confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Сохраняем...';
  }

  const dates = getNext14Days();
  const dateObj = dates[state.selectedDateIndex];
  const dateStr = formatDate(dateObj.date);

  // Сохранить запись
  const booking = {
    service: state.selectedService.name,
    emoji: state.selectedService.emoji,
    date: dateStr,
    slot: state.selectedSlot,
    price: state.selectedService.price,
  };
  state.bookings.unshift(booking);
  saveBookings();

  hapticNotify('success');

  // Показать экран успеха
  setTimeout(() => {
    renderSuccessScreen(booking);
    // Закрыть все предыдущие push-экраны и показать success
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
  if (removed) state.historyBookings.unshift(removed);
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

/* ── 5. Инициализация ── */
function init() {
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

  // Начальный рендер
  renderTab('home');

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

/* ── Секретный сброс для админа (5 тапов по аватару) ── */
let adminTapCount = 0;
let adminTapTimer = null;
function adminTap() {
  adminTapCount++;
  clearTimeout(adminTapTimer);
  adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000);
  if (adminTapCount >= 5) {
    adminTapCount = 0;
    localStorage.removeItem('onboarding_done');
    localStorage.removeItem('offer_shown');
    hapticNotify('success');
    if (tg) tg.showAlert('✅ Сброс выполнен — перезапусти приложение');
    else alert('✅ Сброс выполнен — перезапусти приложение');
  }
}

// Запуск после загрузки DOM
document.addEventListener('DOMContentLoaded', init);

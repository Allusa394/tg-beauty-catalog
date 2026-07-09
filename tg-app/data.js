// ============================================================
// data.js — все данные приложения
// Меняй здесь: информацию о мастере, услуги, отзывы, расписание
// ============================================================

/* ---------- МАСТЕР ---------- */
const MASTER = {
  name: 'Виктория Соколова',
  title: 'Мастер красоты • Маникюр & Брови',
  emoji: '💅',
  rating: 5.0,
  worksCount: 248,
  experience: '6 лет',
  address: 'г. Москва, ул. Арбат, 18, студия Bloom',
  addressLink: 'https://yandex.ru/maps/?text=Москва+Арбат+18',
  phone: '+7 (900) 555-77-88',
  telegram: 'https://t.me/beauty_vika_master',
  botUsername: 'anna_beauty_nail_bot', // username бота (без @)
  about: 'Привет! Меня зовут Виктория, я сертифицированный мастер с 6-летним опытом. Создаю идеальный маникюр, педикюр и брови — от классики до сложного дизайна. Работаю с премиальными материалами, соблюдаю стерильность. Каждый клиент уходит довольным 🌸',
  // Демо-фото с Unsplash (свободная лицензия). Перед продажей клиенту —
  // заменить на реальные фото её работ, формат ссылки такой же.
  portfolio: [
    'https://images.unsplash.com/photo-1727199433231-346fd8101839?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1707725238063-0c54fb6963d1?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1637851497145-0faa2e456081?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1639629509821-c54cdd984227?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1604902396830-aca29e19b067?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1664643411326-6c589531be3c?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1754799670312-8e7da8e40ad7?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1567629307995-b9f33097bd30?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1754799670410-b282791342c3?w=400&q=70&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1690749138086-7422f71dc159?w=400&q=70&auto=format&fit=crop',
    'https://plus.unsplash.com/premium_photo-1661963453197-9a8ddee245d7?w=400&q=70&auto=format&fit=crop',
  ],

  // White-Label настройки (перезаписываются из API)
  theme:            'blue',  // blue | rose | lavender | gold | dark
  logoUrl:          null,    // URL логотипа или null
  showBranding:     true,    // false = скрыть "Powered by" (только Pro)
  masterTelegramId: null,    // telegram_id мастера (для определения владельца)
  plan:             'free',  // free | pro
  planExpiresAt:    null,    // ISO дата истечения подписки
};

/* ---------- КАТЕГОРИИ ---------- */
const CATEGORIES = [
  { id: 'all',      label: 'Все' },
  { id: 'mani',     label: 'Маникюр' },
  { id: 'pedi',     label: 'Педикюр' },
  { id: 'brows',    label: 'Брови' },
  { id: 'lashes',   label: 'Ресницы' },
];

/* ---------- УСЛУГИ ---------- */
const SERVICES = [
  {
    id: 1,
    category: 'mani',
    emoji: '💅',
    name: 'Маникюр гель-лак',
    shortDesc: 'Покрытие цветным или камуфляжным гель-лаком',
    desc: 'Маникюр с покрытием цветным или камуфляжным гель-лаком. Обработка кутикулы, придание формы, нанесение покрытия. Держится 2–3 недели.',
    price: 2500,
    duration: '1 ч 30 мин',
    rating: 4.9,
    works: [
      'https://images.unsplash.com/photo-1727199433231-346fd8101839?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1604902396830-aca29e19b067?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1754799670410-b282791342c3?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1688583417757-9060cba25399?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1645566372784-7d017ad7643b?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1690749138086-7422f71dc159?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 2,
    category: 'mani',
    emoji: '✨',
    name: 'Маникюр без покрытия',
    shortDesc: 'Классический уход без покрытия',
    desc: 'Классический маникюр без покрытия. Обработка кутикулы, придание формы, полировка пластины. Идеально для ухода за натуральными ногтями.',
    price: 1200,
    duration: '1 час',
    rating: 4.8,
    works: [
      'https://images.unsplash.com/photo-1597999709389-e29dc41e218a?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1684609365994-a144ee021c88?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1688583417757-9060cba25399?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1645566372784-7d017ad7643b?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1727199433231-346fd8101839?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 3,
    category: 'mani',
    emoji: '💎',
    name: 'Наращивание ногтей',
    shortDesc: 'Акрил или гель, любая форма',
    desc: 'Наращивание акрилом или гелем. Любая форма и длина. Коррекция каждые 3–4 недели. Выглядит натурально, держится до месяца.',
    price: 4500,
    duration: '3 часа',
    rating: 4.9,
    works: [
      'https://images.unsplash.com/photo-1754799670312-8e7da8e40ad7?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1783365870332-fee857385ac5?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1754799670410-b282791342c3?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1688583417757-9060cba25399?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1645566372784-7d017ad7643b?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 4,
    category: 'pedi',
    emoji: '🦶',
    name: 'Педикюр гель-лак',
    shortDesc: 'Аппаратная обработка + покрытие',
    desc: 'Педикюр с покрытием гель-лаком. Аппаратная обработка кожи стоп, обработка кутикулы, нанесение покрытия. Кожа мягкая, ногти блестят.',
    price: 3200,
    duration: '1 ч 30 мин',
    rating: 4.9,
    works: [
      'https://images.unsplash.com/photo-1707725238063-0c54fb6963d1?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1664643411326-6c589531be3c?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661499249417-c20d6b668469?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661963453197-9a8ddee245d7?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1762114468806-6eefd10ae3aa?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661964142016-67af80c1aa92?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 5,
    category: 'pedi',
    emoji: '🧴',
    name: 'Педикюр без покрытия',
    shortDesc: 'Уход за стопами, без лака',
    desc: 'Аппаратный педикюр без покрытия. Обработка кожи стоп, удаление огрубелостей, обработка кутикулы, полировка.',
    price: 2200,
    duration: '1 час',
    rating: 4.8,
    works: [
      'https://images.unsplash.com/photo-1664643411326-6c589531be3c?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1707725238063-0c54fb6963d1?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661963453197-9a8ddee245d7?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1762114468806-6eefd10ae3aa?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661499249417-c20d6b668469?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661964142016-67af80c1aa92?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 6,
    category: 'brows',
    emoji: '🪮',
    name: 'Коррекция бровей',
    shortDesc: 'Форма воском или нитью',
    desc: 'Коррекция формы бровей воском или нитью. Придание красивого изгиба, удаление лишних волосков. Быстро и безболезненно.',
    price: 800,
    duration: '30 минут',
    rating: 4.7,
    works: [
      'https://images.unsplash.com/photo-1637851497145-0faa2e456081?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1683147720304-bc9a8a6f361b?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1671717724080-b31452cad3fa?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595550912256-b24059bb08e8?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1534143826428-81fc61582afd?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 7,
    category: 'brows',
    emoji: '🎨',
    name: 'Окрашивание бровей',
    shortDesc: 'Хна или краска + коррекция',
    desc: 'Окрашивание бровей хной или краской с коррекцией формы. Брови выглядят насыщенно и аккуратно. Результат держится 3–4 недели.',
    price: 1400,
    duration: '45 минут',
    rating: 4.8,
    works: [
      'https://plus.unsplash.com/premium_photo-1683147720304-bc9a8a6f361b?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595550912256-b24059bb08e8?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1637851497145-0faa2e456081?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1534143826428-81fc61582afd?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1671717724080-b31452cad3fa?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?w=400&q=70&auto=format&fit=crop',
    ],
  },
  {
    id: 8,
    category: 'lashes',
    emoji: '👁️',
    name: 'Ресницы классика',
    shortDesc: 'Классическое наращивание',
    desc: 'Классическое наращивание ресниц — одна искусственная ресница на натуральную. Взгляд становится выразительнее, без эффекта «театральности».',
    price: 2000,
    duration: '2 часа',
    rating: 4.9,
    works: [
      'https://images.unsplash.com/photo-1639629509821-c54cdd984227?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1567629307995-b9f33097bd30?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1735151226446-1d364b4adc2f?w=400&q=70&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1548902378-2ec44c906391?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1670006625877-c44709fb95c9?w=400&q=70&auto=format&fit=crop',
      'https://plus.unsplash.com/premium_photo-1661393486358-58da5572e516?w=400&q=70&auto=format&fit=crop',
    ],
  },
];

/* ---------- ОТЗЫВЫ ---------- */
const REVIEWS = [
  {
    id: 1,
    name: 'Мария П.',
    avatar: '👩',
    stars: 5,
    text: 'Виктория — волшебница! Маникюр держится уже четвёртую неделю, выглядит как в первый день. В студии уютно и приятно. Теперь только к ней!',
    date: '1 неделю назад',
    service: 'Маникюр гель-лак',
  },
  {
    id: 2,
    name: 'Екатерина С.',
    avatar: '👩‍🦱',
    stars: 5,
    text: 'Брови сделаны идеально — форма подобрана под лицо, выглядит очень естественно. Давно искала своего мастера, нашла! Рекомендую всем девочкам.',
    date: '2 недели назад',
    service: 'Окрашивание бровей',
  },
  {
    id: 3,
    name: 'Ольга Р.',
    avatar: '👩‍🦰',
    stars: 5,
    text: 'Пришла на педикюр и осталась в восторге. Кожа стоп мягкая, покрытие ровное. Вика очень аккуратная и внимательная. Буду приходить регулярно!',
    date: '3 недели назад',
    service: 'Педикюр гель-лак',
  },
  {
    id: 4,
    name: 'Наталья В.',
    avatar: '👱‍♀️',
    stars: 5,
    text: 'Наращивание выглядит супер натурально, коллеги думают это мои ногти 😍 Мастер предложила форму которая идеально подошла. Спасибо огромное!',
    date: '1 месяц назад',
    service: 'Наращивание ногтей',
  },
  {
    id: 5,
    name: 'Светлана М.',
    avatar: '🧑‍🦳',
    stars: 5,
    text: 'Записалась через это приложение — очень удобно! Виктория встретила приветливо, всё объяснила. Результат превзошёл ожидания. Уже записалась снова.',
    date: '1 месяц назад',
    service: 'Маникюр гель-лак',
  },
];

/* ---------- РАСПИСАНИЕ (слоты) ----------
   Генерируется динамически в app.js.
   Здесь задаём доступные часы и занятые слоты.
   Ключ — строка в формате YYYY-MM-DD.
*/
const SCHEDULE = {
  // Рабочие часы
  workHours: ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
  // Занятые слоты (пример): ключ = смещение дня от сегодня, значение = массив занятых часов
  busySlots: {
    0: ['9:00', '11:00', '14:00'],
    1: ['10:00', '13:00', '16:00'],
    2: ['9:00', '10:00', '15:00', '17:00'],
    3: ['12:00', '18:00'],
    4: ['9:00', '11:00', '13:00', '14:00'],
    5: [],  // воскресенье — выходной будет показан как недоступный
    6: ['10:00', '15:00'],
  },
  // Выходные дни недели (0=воскресенье, 6=суббота)
  daysOff: [0], // воскресенье
};

/* ---------- ПОПУЛЯРНЫЕ УСЛУГИ (для главной) ---------- */
const POPULAR_SERVICE_IDS = [1, 4, 3, 7];

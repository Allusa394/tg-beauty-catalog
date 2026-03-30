// ============================================================
// ecosystem.config.js — конфиг PM2 для запуска на VPS
//
// Использование:
//   pm2 start ecosystem.config.js       — запуск
//   pm2 restart tg-beauty-catalog       — перезапуск
//   pm2 logs tg-beauty-catalog          — логи
//   pm2 save && pm2 startup             — автозапуск при reboot
// ============================================================

module.exports = {
  apps: [
    {
      name:         'tg-beauty-catalog',
      script:       './server.js',
      instances:    1,
      autorestart:  true,
      watch:        false,

      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
    },
  ],
};

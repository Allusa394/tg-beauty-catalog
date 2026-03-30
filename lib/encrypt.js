// ============================================================
// lib/encrypt.js — шифрование/расшифровка токенов ботов
//
// Алгоритм: AES-256-GCM
// Ключ: 32-символьная строка из ENCRYPTION_KEY в .env
// Токен шифруется перед записью в БД, расшифровывается при использовании.
// Ключ никогда не попадает в код, GitHub или Supabase.
// ============================================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // байт

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY должен быть минимум 32 символа');
  }
  // Берём первые 32 байта (на случай если ключ длиннее)
  return Buffer.from(key.slice(0, KEY_LENGTH), 'utf8');
}

// Зашифровать токен
// Возвращает строку: iv:authTag:encrypted (всё в hex)
function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV для GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Расшифровать токен
function decrypt(encryptedText) {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };

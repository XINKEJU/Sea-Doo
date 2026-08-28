'use strict';
// ------------------------------------------------------------------
// Sea-Doo Inventory CMS API
// Публичные:  GET  /api/health, /api/products, /api/products/:slug
//             GET  /api/settings, POST /api/leads
// Админ:      POST /api/admin/login (set httpOnly cookie), POST /api/admin/logout
//             GET /api/admin/me (check session)
//             GET/POST/PUT/DELETE /api/admin/products[/:slug]
//             GET /api/admin/leads, PUT/DELETE /api/admin/leads/:id
//             GET/PUT /api/admin/settings
//             POST /api/admin/upload (multipart, поле "images")
// Статика:    /uploads/*
// Сессия:     httpOnly cookie (seadoo_token), 12h, SameSite=Lax, Secure
// ------------------------------------------------------------------
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const store = require('./store');
const { seedIfEmpty } = require('./seed');

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_IMAGES = 12;
const MAX_FILE_MB = 15;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 3600 * 1000;
const COOKIE_NAME = 'seadoo_token';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
seedIfEmpty();

// ---------- Пароль: SHA-256 + timingSafeEqual (защита от timing-атак) ----------
const ADMIN_HASH = crypto.createHash('sha256').update(String(ADMIN_PASSWORD), 'utf8').digest();

function verifyPassword(pw) {
  if (typeof pw !== 'string' || pw.length === 0) return false;
  const h = crypto.createHash('sha256').update(pw, 'utf8').digest();
  return crypto.timingSafeEqual(h, ADMIN_HASH);
}

// ---------- Auth (in-memory tokens + httpOnly cookie + rate limit) ----------
const tokens = new Map(); // token -> expiresAt
const loginAttempts = new Map(); // ip -> { fails, lockedUntil }

function issueToken() {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, Date.now() + TOKEN_TTL_MS);
  return t;
}

function revokeToken(token) {
  tokens.delete(token);
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) {
    for (const part of h.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) {
        try {
          out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
        } catch { /* ignore malformed cookie */ }
      }
    }
  }
  return out;
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: true,
  path: '/',
  maxAge: TOKEN_TTL_MS,
};

function requireAuth(req, res, next) {
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const t = headerToken || parseCookies(req)[COOKIE_NAME] || '';
  const exp = tokens.get(t);
  if (!exp) return res.status(401).json({ error: 'Неверный или истёкший токен' });
  if (exp < Date.now()) {
    tokens.delete(t);
    return res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
  req.token = t;
  next();
}

function ipOf(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function loginAllowed(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && rec.lockedUntil && rec.lockedUntil > now) {
    return Math.ceil((rec.lockedUntil - now) / 1000);
  }
  return 0;
}

function recordLoginFail(ip) {
  const rec = loginAttempts.get(ip) || { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= LOGIN_MAX_FAILS) {
    rec.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    rec.fails = 0;
  }
  loginAttempts.set(ip, rec);
}

function recordLoginOk(ip) {
  loginAttempts.delete(ip);
}

// ---------- CSRF: проверка Origin для записей ----------
const ALLOWED_ORIGINS = new Set([
  'https://seadoo.aaatslydaaa.ru',
  'http://seadoo.aaatslydaaa.ru',
]);

// ---------- Upload ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // Без расширения от клиента — реальный тип определим по magic bytes
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_IMAGES },
  fileFilter: (_req, file, cb) => {
    const ok =
      /^image\//.test(file.mimetype) ||
      /^video\/(mp4|webm|quicktime)$/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Разрешены только изображения и видео (mp4/webm)'));
  },
});

// Определение реального типа по содержимому (magic bytes)
function detectType(filePath) {
  let head;
  try {
    head = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (head.length < 12) return null;
  const match = (sig) => sig.every((b, i) => head[i] === b);
  if (match([0xff, 0xd8, 0xff])) return 'jpg';
  if (match([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (match([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (match([0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (match([0x52, 0x49, 0x46, 0x46]) &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
    return 'webp';
  }
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return 'mp4';
  }
  return null;
}

// ---------- App ----------
const app = express();
app.set('trust proxy', true); // nginx proxy -> req.ip = X-Forwarded-For
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// CSRF: отклонять записи с чужого Origin (браузеры всегда шлют Origin на POST)
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin forbidden' });
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ---------- Public: products ----------
app.get('/api/products', (_req, res) => res.json(store.getProducts()));

app.get('/api/products/:slug', (req, res) => {
  const p = store.findProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Модель не найдена' });
  res.json(p);
});

// ---------- Public: settings ----------
app.get('/api/settings', (_req, res) => res.json(store.getSettings()));

// ---------- Public: leads ----------
const leadSubmits = new Map(); // ip -> last submit ts
app.post('/api/leads', (req, res) => {
  const ip = ipOf(req);
  const now = Date.now();
  const last = leadSubmits.get(ip) || 0;
  if (now - last < 15000) {
    return res.status(429).json({ error: 'Слишком часто. Подождите 15 секунд' });
  }
  const lead = store.addLead(req.body);
  if (!lead) return res.status(400).json({ error: 'Укажите имя или телефон' });
  leadSubmits.set(ip, now);
  res.status(201).json({ ok: true, id: lead.id });
});

// ---------- Admin: auth ----------
app.post('/api/admin/login', (req, res) => {
  const ip = ipOf(req);
  const locked = loginAllowed(ip);
  if (locked > 0) {
    return res.status(429).json({ error: `Слишком много попыток. Подождите ${locked} сек.` });
  }
  const { password } = req.body || {};
  if (verifyPassword(password)) {
    recordLoginOk(ip);
    const token = issueToken();
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ ok: true });
  } else {
    recordLoginFail(ip);
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.use('/api/admin', requireAuth);

app.get('/api/admin/me', (req, res) => res.json({ ok: true }));

app.post('/api/admin/logout', (req, res) => {
  if (req.token) revokeToken(req.token);
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: true });
  res.json({ ok: true });
});

// ---------- Admin: products ----------
app.post('/api/admin/products', (req, res) => {
  try {
    const p = store.createProduct(req.body);
    res.status(201).json(p);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/products/:slug', (req, res) => {
  try {
    const p = store.updateProduct(req.params.slug, req.body);
    if (!p) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/products/:slug', (req, res) => {
  const ok = store.deleteProduct(req.params.slug);
  if (!ok) return res.status(404).json({ error: 'Модель не найдена' });
  res.json({ ok: true });
});

// ---------- Admin: leads ----------
app.get('/api/admin/leads', (_req, res) => res.json(store.getLeads()));

app.put('/api/admin/leads/:id', (req, res) => {
  const l = store.updateLead(req.params.id, req.body);
  if (!l) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json(l);
});

app.delete('/api/admin/leads/:id', (req, res) => {
  const ok = store.deleteLead(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json({ ok: true });
});

// ---------- Admin: settings ----------
app.get('/api/admin/settings', (_req, res) => res.json(store.getSettings()));

app.put('/api/admin/settings', (req, res) => res.json(store.updateSettings(req.body)));

// ---------- Admin: upload ----------
app.post('/api/admin/upload', upload.array('images', MAX_IMAGES), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Файлы не получены' });
  }
  const urls = [];
  let rejected = 0;
  for (const f of req.files) {
    const type = detectType(f.path);
    if (type) {
      const finalName = `${path.basename(f.filename)}.${type}`;
      try {
        fs.renameSync(f.path, path.join(UPLOAD_DIR, finalName));
        urls.push(`/uploads/${finalName}`);
      } catch {
        try { fs.unlinkSync(f.path); } catch { /* ignore */ }
        rejected += 1;
      }
    } else {
      try { fs.unlinkSync(f.path); } catch { /* ignore */ }
      rejected += 1;
    }
  }
  if (urls.length === 0) {
    return res.status(400).json({ error: 'Файл не является изображением или видео (jpg/png/gif/webp/mp4/webm)' });
  }
  res.json({ urls, rejected });
});

// ---------- Errors ----------
app.use((err, _req, res, _next) => {
  const msg = err && err.message ? err.message : 'Ошибка сервера';
  res.status(err && err.status ? err.status : 400).json({ error: msg });
});

app.listen(PORT, () => {
  console.log(`seadoo-api listening on :${PORT}`);
  console.log(`uploads dir: ${UPLOAD_DIR}`);
});

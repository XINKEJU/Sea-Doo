'use strict';
// ------------------------------------------------------------------
// Sea-Doo Inventory CMS API
// Публичные:  GET  /api/health, /api/products, /api/products/:slug
//             GET  /api/settings, POST /api/leads
// Админ:      POST /api/admin/login, POST /api/admin/logout
//             GET/POST/PUT/DELETE /api/admin/products[/:slug]
//             GET /api/admin/leads, PUT/DELETE /api/admin/leads/:id
//             GET/PUT /api/admin/settings
//             POST /api/admin/upload (multipart, поле "images")
// Статика:    /uploads/*
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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
seedIfEmpty();

// ---------- Auth (in-memory tokens + login rate limit) ----------
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

function requireAuth(req, res, next) {
  const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = tokens.get(h);
  if (!exp) return res.status(401).json({ error: 'Неверный или истёкший токен' });
  if (exp < Date.now()) {
    tokens.delete(h);
    return res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
  req.token = h;
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

// ---------- Upload ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
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

// Магические сигнатуры файлов (проверка реального содержимого)
const MAGIC_BYTES = [
  { name: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { name: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
  { name: 'webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function looksLikeMedia(filePath) {
  let head;
  try {
    head = fs.readFileSync(filePath);
  } catch {
    return false;
  }
  if (head.length < 12) return false;
  for (const m of MAGIC_BYTES) {
    if (m.bytes.every((b, i) => head[i] === b)) return true;
  }
  // WebP: RIFF size WEBP (байты 8..11 = WEBP)
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
    return true;
  }
  // MP4/MOV: байты 4..7 = 'ftyp'
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return true;
  }
  return false;
}

// ---------- App ----------
const app = express();
app.set('trust proxy', true); // nginx proxy -> req.ip = X-Forwarded-For
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

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

// ---------- Public: leads (заявки) ----------
const leadSubmits = new Map(); // ip -> last submit ts (простая защита от спама)
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
  if (password && password === ADMIN_PASSWORD) {
    recordLoginOk(ip);
    res.json({ token: issueToken() });
  } else {
    recordLoginFail(ip);
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.use('/api/admin', requireAuth);

app.post('/api/admin/logout', (req, res) => {
  if (req.token) revokeToken(req.token);
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
    if (looksLikeMedia(f.path)) {
      urls.push(`/uploads/${f.filename}`);
    } else {
      try {
        fs.unlinkSync(f.path);
      } catch { /* ignore */ }
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

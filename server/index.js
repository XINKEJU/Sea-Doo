'use strict';
// ------------------------------------------------------------------
// Sea-Doo Inventory CMS API
// Публичные:   GET  /api/health, /api/products, /api/products/:slug
// Админ (JWT):  POST /api/admin/login
//               POST/PUT/DELETE /api/admin/products[/:slug]
//               POST /api/admin/upload  (multipart, поле "images")
// Статика:      /uploads/*  (загруженные изображения)
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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
seedIfEmpty();

// ---------- Auth (in-memory tokens, 12h) ----------
const tokens = new Map(); // token -> expiresAt
function issueToken() {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, Date.now() + 12 * 3600 * 1000);
  return t;
}
function requireAuth(req, res, next) {
  const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = tokens.get(h);
  if (!exp) return res.status(401).json({ error: 'Неверный или истёкший токен' });
  if (exp < Date.now()) {
    tokens.delete(h);
    return res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
  next();
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
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Разрешены только изображения'));
  },
});

// ---------- App ----------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

app.get('/api/products', (_req, res) => res.json(store.getProducts()));

app.get('/api/products/:slug', (req, res) => {
  const p = store.findProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Модель не найдена' });
  res.json(p);
});

// ---------- Admin ----------
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === ADMIN_PASSWORD) {
    res.json({ token: issueToken() });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.use('/api/admin', requireAuth);

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

app.post('/api/admin/upload', upload.array('images', MAX_IMAGES), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Файлы не получены' });
  }
  res.json({ urls: req.files.map((f) => `/uploads/${f.filename}`) });
});

// ---------- Errors ----------
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`seadoo-api listening on :${PORT}`);
  console.log(`uploads dir: ${UPLOAD_DIR}`);
});

'use strict';
// ------------------------------------------------------------------
// Простое JSON-хранилище с атомарной записью.
// Файл данных: DATA_DIR/db.json  (по умолчанию ./data/db.json)
// Подходит для каталога на десятки товаров, легко бэкапится.
// ------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    cache = { products: [] };
  }
  if (!Array.isArray(cache.products)) cache.products = [];
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ---------- API ----------
function getProducts() {
  return load().products;
}

function findProduct(slug) {
  return load().products.find((p) => p.slug === slug) || null;
}

function upsertProduct(product) {
  const db = load();
  const i = db.products.findIndex((p) => p.slug === product.slug);
  if (i >= 0) db.products[i] = product;
  else db.products.push(product);
  save();
  return product;
}

function deleteProduct(slug) {
  const db = load();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.slug !== slug);
  if (db.products.length === before) return false;
  save();
  return true;
}

// ---------- Валидация / нормализация ----------
const FIELDS = [
  'model', 'year', 'hours', 'hp', 'engine', 'seats', 'system',
  'trailer', 'documents', 'price', 'status', 'description',
  'heroImage', 'images',
];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueSlug(base) {
  let s = slugify(base) || 'model';
  if (findProduct(s)) s = `${s}-${Date.now().toString(36)}`;
  return s;
}

function sanitize(data, { partial = false } = {}) {
  const src = data && typeof data === 'object' ? data : {};
  const out = {};
  for (const k of FIELDS) {
    if (src[k] !== undefined && src[k] !== null && src[k] !== '') out[k] = src[k];
  }
  if (out.year !== undefined) out.year = Number(out.year) || 0;
  if (out.hours !== undefined) out.hours = Number(out.hours) || 0;
  if (out.hp !== undefined) out.hp = Number(out.hp) || 0;
  if (out.seats !== undefined) out.seats = Number(out.seats) || 1;
  if (out.status !== 'sold') out.status = 'available';
  if (!Array.isArray(out.images)) out.images = [];
  if (!partial) {
    if (!out.model) throw new Error('Поле "Модель" обязательно');
    if (!out.heroImage && out.images.length > 0) out.heroImage = out.images[0];
    if (!out.heroImage) out.heroImage = '';
  }
  return out;
}

function createProduct(data) {
  const p = sanitize(data);
  p.slug = uniqueSlug(p.model);
  return upsertProduct(p);
}

function updateProduct(slug, data) {
  const existing = findProduct(slug);
  if (!existing) return null;
  const patch = sanitize(data, { partial: true });
  const merged = { ...existing, ...patch };
  if (!merged.heroImage && merged.images.length > 0) merged.heroImage = merged.images[0];
  return upsertProduct(merged);
}

module.exports = {
  getProducts,
  findProduct,
  upsertProduct,
  deleteProduct,
  createProduct,
  updateProduct,
  uniqueSlug,
};

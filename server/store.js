'use strict';
// ------------------------------------------------------------------
// Простое JSON-хранилище с атомарной записью.
// Файл данных: DATA_DIR/db.json  (по умолчанию ./data/db.json)
// Структура: { products: [], leads: [], settings: {} }
// ------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MAX_TEXT = 2000; // максимальная длина текстовых полей
const MAX_LIST = 500; // максимум записей в коллекции

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    cache = {};
  }
  if (!Array.isArray(cache.products)) cache.products = [];
  if (!Array.isArray(cache.leads)) cache.leads = [];
  if (!cache.settings || typeof cache.settings !== 'object') cache.settings = {};
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function clip(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

// ================================================================
// Products (каталог)
// ================================================================
function getProducts() {
  // 向后兼容：老数据缺 priceValue 时从展示价格动态解析（不落库，编辑后持久化）
  return load().products.map((p) => {
    if (p.priceValue === undefined && p.price !== undefined) {
      return { ...p, priceValue: Number(String(p.price).replace(/[^\d]/g, '')) || 0 };
    }
    return p;
  });
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

const FIELDS = [
  'model', 'year', 'hours', 'hp', 'engine', 'seats', 'system',
  'trailer', 'documents', 'price', 'priceValue', 'status', 'description',
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
  if (out.images.length > 20) out.images = out.images.slice(0, 20);
  // priceValue：数字价格（用于排序/统计）；缺失时从展示价格自动解析
  if (out.priceValue !== undefined) out.priceValue = Number(out.priceValue) || 0;
  if (out.price !== undefined && out.priceValue === undefined) {
    out.priceValue = Number(String(out.price).replace(/[^\d]/g, '')) || 0;
  }
  // текстовые поля — обрезаем
  for (const k of ['model', 'engine', 'system', 'trailer', 'documents', 'price', 'description', 'heroImage']) {
    if (typeof out[k] === 'string') out[k] = out[k].slice(0, MAX_TEXT);
  }
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

// ================================================================
// Leads (заявки с сайта)
// ================================================================
function getLeads() {
  return [...load().leads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function findLead(id) {
  return load().leads.find((l) => l.id === id) || null;
}

function addLead(data) {
  const db = load();
  const lead = {
    id: crypto.randomUUID(),
    name: clip(data.name, 100),
    phone: clip(data.phone, 60),
    subject: clip(data.subject, 240),
    message: clip(data.message, MAX_TEXT),
    status: 'new',
    createdAt: Date.now(),
  };
  if (!lead.name && !lead.phone) return null;
  db.leads.push(lead);
  if (db.leads.length > MAX_LIST) db.leads = db.leads.slice(-MAX_LIST);
  save();
  return lead;
}

function updateLead(id, patch) {
  const db = load();
  const l = db.leads.find((x) => x.id === id);
  if (!l) return null;
  if (patch && (patch.status === 'read' || patch.status === 'new')) l.status = patch.status;
  save();
  return l;
}

function deleteLead(id) {
  const db = load();
  const before = db.leads.length;
  db.leads = db.leads.filter((x) => x.id !== id);
  if (db.leads.length === before) return false;
  save();
  return true;
}

// ================================================================
// Settings (настройки сайта)
// ================================================================
const DEFAULT_SETTINGS = {
  brandName: 'SEA-DOO',
  brandSub: 'PREMIUM USED',
  footerBrand: 'SEA-DOO PREMIUM USED',
  footerSlogan: 'Премиальный шоурум б/у гидроциклов',
  cityText: 'Гидроциклы · Москва и регионы',
  copyrightText: '© 2025 SEA-DOO PREMIUM USED. Все права защищены.',
  contactLabel: 'СВЯЗАТЬСЯ',
  phone: '',
  email: '',
  address: '',
  heroVideo: '/uploads/e40bf07571c426c3e2f297fc00cea830.mp4',
  heroImage:
    'https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=2400&h=1400&fit=crop&auto=format',
  heroOpacity: '0.55',
  sectionLabel: 'ТЕКУЩИЙ СКЛАД',
  sectionTitle: 'В НАЛИЧИИ И НЕДАВНО ПРОДАННОЕ',
  availableLabel: 'доступно',
  soldLabel: 'ПРОДАНО',
  inStockLabel: 'В НАЛИЧИИ',
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load().settings };
}

function sanitizeSettings(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (src[k] !== undefined && src[k] !== null) out[k] = String(src[k]).slice(0, 500);
  }
  return out;
}

function updateSettings(patch) {
  const db = load();
  db.settings = { ...DEFAULT_SETTINGS, ...db.settings, ...sanitizeSettings(patch) };
  save();
  return getSettings();
}

module.exports = {
  // products
  getProducts, findProduct, upsertProduct, deleteProduct, createProduct, updateProduct, uniqueSlug,
  // leads
  getLeads, findLead, addLead, updateLead, deleteLead,
  // settings
  getSettings, updateSettings,
};

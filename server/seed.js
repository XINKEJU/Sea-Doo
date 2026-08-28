'use strict';
// ------------------------------------------------------------------
// Начальные данные каталога — 1:1 из src/data/inventory.ts.
// Загружаются только один раз, когда хранилище пустое.
// ------------------------------------------------------------------
const store = require('./store');

const SEED = [
  {
    slug: 'rxt-x-rs-300-2023',
    model: 'SEA-DOO RXT-X RS 300',
    year: 2023,
    hours: 42,
    hp: 300,
    engine: 'Rotax 1630 ACE — 300 Triple',
    seats: 2,
    system: 'iBR + iDF + T3-R Hull',
    trailer: 'В комплекте',
    documents: 'ПТС, СТС, ГИМС',
    price: '1 850 000 ₽',
    priceValue: 1850000,
    status: 'available',
    description:
      'Флагманский спортивный гидроцикл в идеальном состоянии. Один владелец, эксплуатировался исключительно в пресноводных водоёмах. Полный сервис пройден у официального дилера в 2024 году. Корпус без трещин и сколов, пластик оригинальный без потёртостей. Двигатель работает безупречно на всём диапазоне оборотов. Система iBR (интеллектуальная тормозная и реверсивная система) в отличном состоянии. Укомплектован прицепом с документами.',
    heroImage:
      'https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1505867798796-639ec7e8cdf5?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1606871386240-f329223889d0?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1564633351631-e85bd59a91af?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1687964964949-e528183141d3?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1680238577907-6e4549d95b44?w=1200&h=800&fit=crop&auto=format',
    ],
  },
  {
    slug: 'gtx-limited-300-2022',
    model: 'SEA-DOO GTX LIMITED 300',
    year: 2022,
    hours: 78,
    hp: 300,
    engine: 'Rotax 1630 ACE — 300',
    seats: 3,
    system: 'iBR + LinQ + AUDIO',
    trailer: 'Без прицепа',
    documents: 'ПТС, СТС, ГИМС',
    price: '1 490 000 ₽',
    priceValue: 1490000,
    status: 'available',
    description:
      'Люксовый туристический гидроцикл с аудиосистемой JBL и подогревом сидений. Состояние отличное для своего пробега. Два владельца. Эксплуатировался на море. Сервис пройден своевременно. Всё оборудование в рабочем состоянии.',
    heroImage:
      'https://images.unsplash.com/photo-1554132267-d06483b00adc?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1554132267-d06483b00adc?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1552656967-7a0991a13906?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1680238577907-6e4549d95b44?w=1200&h=800&fit=crop&auto=format',
    ],
  },
  {
    slug: 'spark-trixx-90-2023',
    model: 'SEA-DOO SPARK TRIXX 90',
    year: 2023,
    hours: 15,
    hp: 90,
    engine: 'Rotax 900 ACE',
    seats: 1,
    system: 'VTS + TRIXX Mode',
    trailer: 'В комплекте',
    documents: 'ПТС, СТС, ГИМС',
    price: '590 000 ₽',
    priceValue: 590000,
    status: 'sold',
    description:
      'Компактный и лёгкий гидроцикл для трюков и активного отдыха. Состояние как новый, минимальный пробег. Продаётся с прицепом.',
    heroImage:
      'https://images.unsplash.com/photo-1564633351631-e85bd59a91af?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1564633351631-e85bd59a91af?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1505867798796-639ec7e8cdf5?w=1200&h=800&fit=crop&auto=format',
    ],
  },
  {
    slug: 'rxp-x-325-2024',
    model: 'SEA-DOO RXP-X 325',
    year: 2024,
    hours: 8,
    hp: 325,
    engine: 'Rotax 1630 ACE — 325 Triple',
    seats: 2,
    system: 'iBR + iDF + Ergo Lock Seat',
    trailer: 'В комплекте',
    documents: 'ПТС, СТС, ГИМС',
    price: '2 150 000 ₽',
    priceValue: 2150000,
    status: 'available',
    description:
      'Самый мощный серийный гидроцикл в мире в состоянии нового. Практически не эксплуатировался, 8 моточасов. Полная заводская гарантия действует до 2026 года. Эксклюзивная расцветка Firestorm. Покупка у официального дилера в 2024 году, все документы в наличии.',
    heroImage:
      'https://images.unsplash.com/photo-1583008585590-c4ed0010bed6?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1583008585590-c4ed0010bed6?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1687964964949-e528183141d3?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1606871386240-f329223889d0?w=1200&h=800&fit=crop&auto=format',
    ],
  },
  {
    slug: 'gti-se-170-2022',
    model: 'SEA-DOO GTI SE 170',
    year: 2022,
    hours: 120,
    hp: 170,
    engine: 'Rotax 1503 NA',
    seats: 3,
    system: 'iBR + LinQ',
    trailer: 'Без прицепа',
    documents: 'ПТС, ГИМС',
    price: '780 000 ₽',
    priceValue: 780000,
    status: 'sold',
    description:
      'Надёжный семейный гидроцикл с большим запасом ресурса двигателя. Регулярное техническое обслуживание. Продавался в связи с покупкой новой модели.',
    heroImage:
      'https://images.unsplash.com/photo-1680238577907-6e4549d95b44?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1680238577907-6e4549d95b44?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1554132267-d06483b00adc?w=1200&h=800&fit=crop&auto=format',
    ],
  },
  {
    slug: 'wake-pro-230-2023',
    model: 'SEA-DOO WAKE PRO 230',
    year: 2023,
    hours: 63,
    hp: 230,
    engine: 'Rotax 1630 ACE — 230',
    seats: 3,
    system: 'iBR + WAKE Mode + LinQ',
    trailer: 'В комплекте',
    documents: 'ПТС, СТС, ГИМС',
    price: '1 190 000 ₽',
    priceValue: 1190000,
    status: 'available',
    description:
      'Специализированный гидроцикл для вейкбординга и вейксёрфинга. Оснащён системой WAKE Mode для идеальной волны. Состояние очень хорошее. Трос для вейка, жилеты и доска в комплекте.',
    heroImage:
      'https://images.unsplash.com/photo-1596302653226-ba0fd4a518a7?w=1600&h=900&fit=crop&auto=format',
    images: [
      'https://images.unsplash.com/photo-1596302653226-ba0fd4a518a7?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1505867798796-639ec7e8cdf5?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1657485535125-e14936b54afb?w=1200&h=800&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1680238577907-6e4549d95b44?w=1200&h=800&fit=crop&auto=format',
    ],
  },
];

function seedIfEmpty() {
  if (store.getProducts().length === 0) {
    for (const p of SEED) store.upsertProduct(p);
    console.log(`[seed] loaded ${SEED.length} products`);
  }
}

module.exports = { seedIfEmpty, SEED };

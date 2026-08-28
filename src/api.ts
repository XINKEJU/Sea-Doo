import type { JetSki } from "./data/inventory";

const BASE = "/api";

/** 站点设置（与后端 store.DEFAULT_SETTINGS 对齐） */
export interface SiteSettings {
  brandName: string;
  brandSub: string;
  footerBrand: string;
  footerSlogan: string;
  cityText: string;
  copyrightText: string;
  contactLabel: string;
  phone: string;
  email: string;
  address: string;
  heroVideo: string;
  heroImage: string;
  heroOpacity: string;
  sectionLabel: string;
  sectionTitle: string;
  availableLabel: string;
  soldLabel: string;
  inStockLabel: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  subject: string;
  message: string;
  status: "new" | "read";
  createdAt: number;
}

/** 前端兜底设置（与后端 store.DEFAULT_SETTINGS 保持一致，视觉不变） */
export const DEFAULT_SETTINGS: SiteSettings = {
  brandName: "SEA-DOO",
  brandSub: "PREMIUM USED",
  footerBrand: "SEA-DOO PREMIUM USED",
  footerSlogan: "Премиальный шоурум б/у гидроциклов",
  cityText: "Гидроциклы · Москва и регионы",
  copyrightText: "© 2025 SEA-DOO PREMIUM USED. Все права защищены.",
  contactLabel: "СВЯЗАТЬСЯ",
  phone: "",
  email: "",
  address: "",
  heroVideo: "/uploads/e40bf07571c426c3e2f297fc00cea830.mp4",
  heroImage:
    "https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=2400&h=1400&fit=crop&auto=format",
  heroOpacity: "0.55",
  sectionLabel: "ТЕКУЩИЙ СКЛАД",
  sectionTitle: "В НАЛИЧИИ И НЕДАВНО ПРОДАННОЕ",
  availableLabel: "доступно",
  soldLabel: "ПРОДАНО",
  inStockLabel: "В НАЛИЧИИ",
};

// 后端俄文业务错误 -> 中文（管理端用户是中文）
const CN_MESSAGES: Record<string, string> = {
  "Неверный пароль": "密码错误",
  "Слишком много попыток": "尝试次数过多，请稍后再试",
  "Слишком часто": "提交过于频繁，请 15 秒后再试",
  "Модель не найдена": "该商品不存在",
  "Заявка не найдена": "该询盘不存在",
  'Поле "Модель" обязательно': "请填写型号",
  "Сессия истекла, войдите снова": "会话已过期，请重新登录",
  "Неверный или истёкший токен": "未登录或会话已过期",
  "Файл не является изображением или видео": "文件不是有效的图片/视频",
  "Файлы не получены": "未收到文件",
  "Разрешены только изображения и видео": "仅支持图片和视频（mp4/webm）",
  "Укажите имя или телефон": "请填写姓名或电话",
  "Origin forbidden": "请求来源不合法",
};

function translateError(msg: string): string {
  for (const [ru, zh] of Object.entries(CN_MESSAGES)) {
    if (msg.includes(ru)) return zh;
  }
  return msg;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const msg = (body as { error?: string }).error || `HTTP ${r.status}`;
    if (r.status === 401) throw new Error("未登录或会话已过期，请重新登录");
    if (r.status === 403) throw new Error("请求被拒绝（来源不合法）");
    if (r.status === 404) throw new Error("内容不存在");
    if (r.status === 429) throw new Error("操作过于频繁，请稍后再试");
    throw new Error(translateError(msg));
  }
  return r.json() as Promise<T>;
}

// 会话走 httpOnly cookie（同源自动携带），不存 localStorage
async function req(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

// 商品列表 60s 内存缓存（Home/详情页共用，减少重复请求）
let productsCache: { data: JetSki[]; ts: number } | null = null;
const PRODUCTS_CACHE_TTL = 60_000;

function invalidateProductsCache(): void {
  productsCache = null;
}

async function getProductsCached(): Promise<JetSki[]> {
  const now = Date.now();
  if (productsCache && now - productsCache.ts < PRODUCTS_CACHE_TTL) {
    return productsCache.data;
  }
  const data = await j<JetSki[]>(await req(`${BASE}/products`));
  productsCache = { data, ts: now };
  return data;
}

export const api = {
  // ---- public ----
  async listProducts(): Promise<JetSki[]> {
    return getProductsCached();
  },
  async getProduct(slug: string): Promise<JetSki> {
    return j<JetSki>(await req(`${BASE}/products/${encodeURIComponent(slug)}`));
  },
  async getSettings(): Promise<SiteSettings> {
    return j<SiteSettings>(await req(`${BASE}/settings`));
  },
  async submitLead(data: { name: string; phone: string; message: string; subject: string }): Promise<void> {
    await j<{ ok: boolean }>(
      await req(`${BASE}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  // ---- admin auth (httpOnly cookie) ----
  async login(password: string): Promise<void> {
    await j<{ ok: boolean }>(
      await req(`${BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
    );
  },
  async me(): Promise<boolean> {
    try {
      await j<{ ok: boolean }>(await req(`${BASE}/admin/me`));
      return true;
    } catch {
      return false;
    }
  },
  async logout(): Promise<void> {
    await req(`${BASE}/admin/logout`, { method: "POST" }).catch(() => {});
  },
  // ---- admin products ----
  async createProduct(p: Partial<JetSki>): Promise<JetSki> {
    const created = await j<JetSki>(
      await req(`${BASE}/admin/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
    );
    invalidateProductsCache();
    return created;
  },
  async updateProduct(slug: string, p: Partial<JetSki>): Promise<JetSki> {
    const updated = await j<JetSki>(
      await req(`${BASE}/admin/products/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
    );
    invalidateProductsCache();
    return updated;
  },
  async deleteProduct(slug: string): Promise<void> {
    await j<{ ok: boolean }>(
      await req(`${BASE}/admin/products/${encodeURIComponent(slug)}`, { method: "DELETE" })
    );
    invalidateProductsCache();
  },
  async upload(files: File[]): Promise<string[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    const data = await j<{ urls: string[] }>(
      await req(`${BASE}/admin/upload`, { method: "POST", body: fd })
    );
    return data.urls;
  },
  // ---- admin leads ----
  async getLeads(): Promise<Lead[]> {
    return j<Lead[]>(await req(`${BASE}/admin/leads`));
  },
  async updateLead(id: string, patch: { status: "new" | "read" }): Promise<Lead> {
    return j<Lead>(
      await req(`${BASE}/admin/leads/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    );
  },
  async deleteLead(id: string): Promise<void> {
    await j<{ ok: boolean }>(
      await req(`${BASE}/admin/leads/${encodeURIComponent(id)}`, { method: "DELETE" })
    );
  },
  // ---- admin settings ----
  async getAdminSettings(): Promise<SiteSettings> {
    return j<SiteSettings>(await req(`${BASE}/admin/settings`));
  },
  async updateSettings(s: Partial<SiteSettings>): Promise<SiteSettings> {
    return j<SiteSettings>(
      await req(`${BASE}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      })
    );
  },
};

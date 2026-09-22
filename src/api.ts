import type { JetSki } from "./types";

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

/**
 * 后台设置表单的占位值（**仅作字段形状参考，绝不可用于渲染**）。
 *
 * 为什么品牌相关字段一律留空而不是写死一个品牌名：
 * 这些值会作为 SettingsTab 表单的初始状态。一旦接口取失败，表单里就是这份占位值，
 * 管理员若随手保存，就会把占位值写进线上站点 —— 历史版本这里写死的是
 * 「SEA-DOO / PREMIUM USED / © 2025」，正是线上首屏闪现错误品牌的根源。
 * 留空 + 后台禁止在未加载成功时保存，两者共同杜绝这类事故。
 *
 * 站点设置的首屏渲染走 src/store.ts（数据未就绪时渲染骨架屏）。
 */
export const DEFAULT_SETTINGS: SiteSettings = {
  brandName: "",
  brandSub: "",
  footerBrand: "",
  footerSlogan: "",
  cityText: "",
  copyrightText: "",
  contactLabel: "СВЯЗАТЬСЯ",
  phone: "",
  email: "",
  address: "",
  heroVideo: "",
  heroImage: "",
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

/**
 * 带 HTTP 状态码的接口错误。
 * 用于区分「资源确实不存在（404）」与「网络/服务不可用」——两者在 UI 上必须给不同反馈：
 * 前者显示「Модель не найдена」，后者应提供重试入口，否则会误导用户以为商品被下架。
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const msg = (body as { error?: string }).error || `HTTP ${r.status}`;
    if (r.status === 401) throw new ApiError("未登录或会话已过期，请重新登录", r.status);
    if (r.status === 403) throw new ApiError("请求被拒绝（来源不合法）", r.status);
    if (r.status === 404) throw new ApiError("内容不存在", r.status);
    if (r.status === 429) throw new ApiError("操作过于频繁，请稍后再试", r.status);
    throw new ApiError(translateError(msg), r.status);
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
  /**
   * 后台专用商品列表：直连 /api/admin/products，不走 60s 缓存。
   * 读取结果同步写入前台缓存，保证前后台数据一致。
   */
  async listAdminProducts(): Promise<JetSki[]> {
    const data = await j<JetSki[]>(await req(`${BASE}/admin/products`));
    productsCache = { data, ts: Date.now() };
    return data;
  },
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

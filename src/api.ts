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

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// 会话走 httpOnly cookie（同源自动携带），不存 localStorage
async function req(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

export const api = {
  // ---- public ----
  async listProducts(): Promise<JetSki[]> {
    return j<JetSki[]>(await req(`${BASE}/products`));
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
    return j<JetSki>(
      await req(`${BASE}/admin/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
    );
  },
  async updateProduct(slug: string, p: Partial<JetSki>): Promise<JetSki> {
    return j<JetSki>(
      await req(`${BASE}/admin/products/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
    );
  },
  async deleteProduct(slug: string): Promise<void> {
    await j<{ ok: boolean }>(
      await req(`${BASE}/admin/products/${encodeURIComponent(slug)}`, { method: "DELETE" })
    );
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

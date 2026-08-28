import type { JetSki } from "./data/inventory";

const BASE = "/api";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("seadoo_admin_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const api = {
  async listProducts(): Promise<JetSki[]> {
    return j<JetSki[]>(await fetch(`${BASE}/products`));
  },
  async getProduct(slug: string): Promise<JetSki> {
    return j<JetSki>(await fetch(`${BASE}/products/${encodeURIComponent(slug)}`));
  },
  async login(password: string): Promise<string> {
    const data = await j<{ token: string }>(
      await fetch(`${BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
    );
    return data.token;
  },
  async createProduct(p: Partial<JetSki>): Promise<JetSki> {
    return j<JetSki>(
      await fetch(`${BASE}/admin/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(p),
      })
    );
  },
  async updateProduct(slug: string, p: Partial<JetSki>): Promise<JetSki> {
    return j<JetSki>(
      await fetch(`${BASE}/admin/products/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(p),
      })
    );
  },
  async deleteProduct(slug: string): Promise<void> {
    await j<{ ok: boolean }>(
      await fetch(`${BASE}/admin/products/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
    );
  },
  async upload(files: File[]): Promise<string[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    const data = await j<{ urls: string[] }>(
      await fetch(`${BASE}/admin/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      })
    );
    return data.urls;
  },
};

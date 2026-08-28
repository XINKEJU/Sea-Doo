import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { JetSki } from "../data/inventory";
import { api, DEFAULT_SETTINGS, type Lead, type SiteSettings } from "../api";

type Tab = "products" | "leads" | "settings";

type FormState = {
  model: string;
  year: string;
  hours: string;
  hp: string;
  seats: string;
  engine: string;
  system: string;
  trailer: string;
  documents: string;
  price: string;
  priceValue: string;
  status: "available" | "sold";
  description: string;
  heroImage: string;
  images: string[];
};

const emptyForm: FormState = {
  model: "",
  year: "",
  hours: "",
  hp: "",
  seats: "2",
  engine: "",
  system: "",
  trailer: "",
  documents: "",
  price: "",
  priceValue: "",
  status: "available",
  description: "",
  heroImage: "",
  images: [],
};

function toForm(p: JetSki): FormState {
  return {
    model: p.model || "",
    year: String(p.year ?? ""),
    hours: String(p.hours ?? ""),
    hp: String(p.hp ?? ""),
    seats: String(p.seats ?? ""),
    engine: p.engine || "",
    system: p.system || "",
    trailer: p.trailer || "",
    documents: p.documents || "",
    price: p.price || "",
    priceValue: String(p.priceValue ?? ""),
    status: p.status === "sold" ? "sold" : "available",
    description: p.description || "",
    heroImage: p.heroImage || "",
    images: Array.isArray(p.images) ? p.images : [],
  };
}

function fromForm(f: FormState): Partial<JetSki> {
  return {
    model: f.model.trim(),
    year: Number(f.year),
    hours: Number(f.hours),
    hp: Number(f.hp),
    seats: Number(f.seats),
    engine: f.engine.trim(),
    system: f.system.trim(),
    trailer: f.trailer.trim(),
    documents: f.documents.trim(),
    price: f.price.trim(),
    priceValue: Number(f.priceValue),
    status: f.status,
    description: f.description.trim(),
    heroImage: f.heroImage,
    images: f.images,
  };
}

/* ================================================================
 * Page root
 * ================================================================ */
export default function Admin() {
  const navigate = useNavigate();
  // null = 校验会话中；会话存 httpOnly cookie，前端无法读取，统一由 /me 判定
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [editing, setEditing] = useState<JetSki | null>(null);

  useEffect(() => {
    api.me().then(setAuthed);
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div style={{ minHeight: "100vh", background: "#F4F2EE", display: "flex", alignItems: "center", justifyContent: "center", color: "#666666", fontSize: "13px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Проверка сессии...
      </div>
    );
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  if (editing) {
    return (
      <Editor
        product={editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EE" }}>
      <header style={{ background: "#111111", padding: "28px 40px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>
              SEA-DOO · АДМИН
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#FFFFFF", margin: 0, letterSpacing: "-0.01em" }}>
              管理后台
            </h1>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/")} style={btnGhostLight}>← 网站</button>
            <button onClick={logout} style={btnGhostLight}>退出</button>
          </div>
        </div>
      </header>

      <TabBar tab={tab} onChange={setTab} />

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 40px 64px" }}>
        {tab === "products" && <ProductsTab onEdit={(p) => setEditing(p)} onNew={() => setEditing(null)} />}
        {tab === "leads" && <LeadsTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "products", label: "商品" },
    { key: "leads", label: "询盘" },
    { key: "settings", label: "站点设置" },
  ];
  return (
    <div style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 40px", display: "flex", gap: "4px" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "3px solid #111111" : "3px solid transparent",
              padding: "16px 22px",
              fontFamily: "inherit",
              fontSize: "12px",
              fontWeight: tab === t.key ? 700 : 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: tab === t.key ? "#111111" : "#999999",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
 * Login
 * ================================================================ */
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message || "Ошибка входа");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form
        onSubmit={submit}
        style={{ background: "#FFFFFF", width: "360px", padding: "48px 40px", boxShadow: "0 12px 48px rgba(0,0,0,0.08)" }}
      >
        <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#999999", marginBottom: "8px" }}>
          SEA-DOO · АДМИН
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#111111", margin: "0 0 28px", letterSpacing: "-0.01em" }}>
          管理后台
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理员密码"
          autoFocus
          style={inputStyle}
        />
        {error && <div style={{ color: "#B00020", fontSize: "12px", marginTop: "10px" }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{ ...btnDark, width: "100%", marginTop: "20px", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "ВХОД..." : "ВОЙТИ"}
        </button>
      </form>
    </div>
  );
}

/* ================================================================
 * Products tab
 * ================================================================ */
function ProductsTab({ onNew, onEdit }: { onNew: () => void; onEdit: (p: JetSki) => void }) {
  const [products, setProducts] = useState<JetSki[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    api.listProducts().then(setProducts).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const remove = async (p: JetSki) => {
    if (!window.confirm(`Удалить «${p.model}»?`)) return;
    try {
      await api.deleteProduct(p.slug);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "13px", color: "#666666" }}>{products.length} 件商品</div>
        <button onClick={onNew} style={btnDark}>+ 新建商品</button>
      </div>

      {loading && <div style={{ color: "#666666", fontSize: "13px" }}>Загрузка...</div>}
      {error && <div style={{ color: "#B00020", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {!loading && products.length === 0 && (
        <div style={{ background: "#FFFFFF", padding: "64px 40px", textAlign: "center", color: "#666666", fontSize: "13px" }}>
          目录为空。点击「+ 新建商品」添加第一件商品。
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {products.map((p) => (
          <div
            key={p.slug}
            style={{ background: "#FFFFFF", display: "flex", alignItems: "center", gap: "20px", padding: "14px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
          >
            <img
              src={p.heroImage}
              alt={p.model}
              style={{ width: "88px", height: "60px", objectFit: "cover", background: "#E8E6E2", flex: "0 0 auto" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#111111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.model}</div>
              <div style={{ fontSize: "11px", color: "#666666", marginTop: "4px" }}>
                {p.year} · {p.hours} моточ. · {p.hp} л.с. · {p.images.length} фото
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: p.status === "sold" ? "#999999" : "#111111" }}>{p.price}</div>
              <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: p.status === "sold" ? "#999999" : "#0A7A33" }}>
                {p.status === "sold" ? "ПРОДАНО" : "В НАЛИЧИИ"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", flex: "0 0 auto" }}>
              <button onClick={() => onEdit(p)} style={btnDark}>编辑</button>
              <button onClick={() => remove(p)} style={btnDanger}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ================================================================
 * Leads tab
 * ================================================================ */
function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    api.getLeads().then(setLeads).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const markRead = async (l: Lead) => {
    if (l.status === "read") return;
    try {
      await api.updateLead(l.id, { status: "read" });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const remove = async (l: Lead) => {
    if (!window.confirm(`Удалить заявку от ${l.name || l.phone}?`)) return;
    try {
      await api.deleteLead(l.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "13px", color: "#666666" }}>
          共 {leads.length} 条询盘{newCount > 0 ? ` · ${newCount} 条未读` : ""}
        </div>
      </div>

      {loading && <div style={{ color: "#666666", fontSize: "13px" }}>Загрузка...</div>}
      {error && <div style={{ color: "#B00020", fontSize: "13px", marginBottom: "16px" }}>{error}</div>}

      {!loading && leads.length === 0 && (
        <div style={{ background: "#FFFFFF", padding: "64px 40px", textAlign: "center", color: "#666666", fontSize: "13px" }}>
          暂无询盘。访客提交联系表单后会显示在这里。
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {leads.map((l) => (
          <div
            key={l.id}
            style={{
              background: "#FFFFFF",
              padding: "20px 24px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              borderLeft: l.status === "new" ? "3px solid #111111" : "3px solid transparent",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#111111" }}>{l.name || "—"}</span>
                  {l.status === "new" && (
                    <span style={{ background: "#111111", color: "#FFFFFF", fontSize: "9px", letterSpacing: "0.1em", padding: "3px 8px", textTransform: "uppercase" }}>NEW</span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#666666", marginTop: "6px", lineHeight: 1.6 }}>
                  {l.phone && <div>📞 {l.phone}</div>}
                  {l.subject && <div style={{ color: "#111111", marginTop: "2px" }}>{l.subject}</div>}
                </div>
                {l.message && (
                  <div style={{ marginTop: "10px", fontSize: "13px", color: "#333333", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{l.message}</div>
                )}
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#999999" }}>
                  {new Date(l.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flex: "0 0 auto" }}>
                {l.status === "new" && (
                  <button onClick={() => markRead(l)} style={btnDark}>标记已读</button>
                )}
                <button onClick={() => remove(l)} style={btnDanger}>删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ================================================================
 * Settings tab
 * ================================================================ */
function SettingsTab() {
  const [form, setForm] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.getAdminSettings()
      .then((s) => setForm({ ...DEFAULT_SETTINGS, ...s }))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api.updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const urls = await api.upload(Array.from(files));
      if (urls.length > 0) set("heroVideo", urls[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (videoRef.current) videoRef.current.value = "";
    }
  };

  if (loading) return <div style={{ color: "#666666", fontSize: "13px" }}>Загрузка...</div>;

  return (
    <>
      {error && <div style={{ background: "#FDEBEC", color: "#B00020", padding: "12px 16px", marginBottom: "20px", fontSize: "13px" }}>{error}</div>}
      {saved && (
        <div style={{ background: "#E8F5EC", color: "#0A7A33", padding: "12px 16px", marginBottom: "20px", fontSize: "13px" }}>
          已保存，网站已生效 ✓
        </div>
      )}

      <Section title="品牌">
        <Grid>
          <Field label="Header 品牌名">
            <input value={form.brandName} onChange={(e) => set("brandName", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Header 副标题">
            <input value={form.brandSub} onChange={(e) => set("brandSub", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="页脚品牌名">
            <input value={form.footerBrand} onChange={(e) => set("footerBrand", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="页脚标语">
            <input value={form.footerSlogan} onChange={(e) => set("footerSlogan", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="联系按钮文案">
            <input value={form.contactLabel} onChange={(e) => set("contactLabel", e.target.value)} style={inputStyle} />
          </Field>
        </Grid>
      </Section>

      <Section title="联系信息（页脚显示）">
        <Grid>
          <Field label="电话">
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+7 (900) 000-00-00" style={inputStyle} />
          </Field>
          <Field label="邮箱">
            <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="sales@example.ru" style={inputStyle} />
          </Field>
          <Field label="地址">
            <input value={form.address} onChange={(e) => set("address", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="城市/区域文字">
            <input value={form.cityText} onChange={(e) => set("cityText", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="版权文字">
            <input value={form.copyrightText} onChange={(e) => set("copyrightText", e.target.value)} style={inputStyle} />
          </Field>
        </Grid>
      </Section>

      <Section title="首页 Hero">
        <Field label="背景视频 URL（或上传 mp4/webm）">
          <div style={{ display: "flex", gap: "10px" }}>
            <input value={form.heroVideo} onChange={(e) => set("heroVideo", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <label style={{ ...btnDark, display: "flex", alignItems: "center", cursor: "pointer" }}>
              {uploading ? "上传中..." : "上传视频"}
              <input ref={videoRef} type="file" accept="video/mp4,video/webm" onChange={(e) => uploadVideo(e.target.files)} style={{ display: "none" }} />
            </label>
          </div>
        </Field>
        <Field label="封面图 URL（视频加载/暂停时显示）">
          <input value={form.heroImage} onChange={(e) => set("heroImage", e.target.value)} style={inputStyle} />
        </Field>
        <Grid>
          <Field label="视频透明度（0.3–0.8）">
            <input type="number" step="0.05" min="0.2" max="0.9" value={form.heroOpacity} onChange={(e) => set("heroOpacity", e.target.value)} style={inputStyle} />
          </Field>
        </Grid>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px" }}>
          <div style={{ width: "240px", aspectRatio: "16/7", background: "#111111", overflow: "hidden" }}>
            {form.heroImage ? (
              <img src={form.heroImage} alt="hero preview" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: Number(form.heroOpacity) || 0.55 }} />
            ) : null}
          </div>
          <div style={{ fontSize: "12px", color: "#999999", lineHeight: 1.6 }}>
            视频/封面图预览。上传的视频会存到 /uploads/ 并自动填入 URL。
          </div>
        </div>
      </Section>

      <Section title="库存区文案">
        <Grid>
          <Field label="区块小标题">
            <input value={form.sectionLabel} onChange={(e) => set("sectionLabel", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="区块大标题">
            <input value={form.sectionTitle} onChange={(e) => set("sectionTitle", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="在售计数文字">
            <input value={form.availableLabel} onChange={(e) => set("availableLabel", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="已售徽章">
            <input value={form.soldLabel} onChange={(e) => set("soldLabel", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="在售徽章">
            <input value={form.inStockLabel} onChange={(e) => set("inStockLabel", e.target.value)} style={inputStyle} />
          </Field>
        </Grid>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <button onClick={save} disabled={busy} style={{ ...btnDark, padding: "14px 40px", opacity: busy ? 0.6 : 1 }}>
          {busy ? "СОХРАНЕНИЕ..." : "保存设置"}
        </button>
        <span style={{ fontSize: "12px", color: "#999999" }}>保存后前台立即生效（首次进入网站时自动刷新）。</span>
      </div>
    </>
  );
}

/* ================================================================
 * Editor (product)
 * ================================================================ */
function Editor({
  product, onSaved, onCancel,
}: { product: JetSki | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !product;
  const [form, setForm] = useState<FormState>(() => (product ? toForm(product) : emptyForm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.model.trim()) {
      setError("型号（Модель）为必填项");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = fromForm(form);
      if (isNew) await api.createProduct(payload);
      else await api.updateProduct(product.slug, payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const urls = await api.upload(Array.from(files));
      const next = [...form.images, ...urls];
      setForm((f) => ({
        ...f,
        images: next,
        heroImage: f.heroImage || next[0] || "",
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    const next = form.images.filter((_, i) => i !== idx);
    setForm((f) => ({
      ...f,
      images: next,
      heroImage: f.heroImage === f.images[idx] ? (next[0] || "") : f.heroImage,
    }));
  };

  const setHero = (img: string) => setForm((f) => ({ ...f, heroImage: img }));

  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EE" }}>
      <header style={{ background: "#111111", padding: "28px 40px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#FFFFFF", margin: 0 }}>
            {isNew ? "新建商品" : "编辑商品"}
          </h1>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onCancel} style={btnGhostLight}>取消</button>
            <button onClick={save} disabled={busy} style={{ ...btnLight, opacity: busy ? 0.6 : 1 }}>
              {busy ? "СОХРАНЕНИЕ..." : "保存"}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px" }}>
        {error && <div style={{ background: "#FDEBEC", color: "#B00020", padding: "12px 16px", marginBottom: "20px", fontSize: "13px" }}>{error}</div>}

        <Section title="基本信息">
          <Field label="型号 Model *">
            <input value={form.model} onChange={(e) => set("model", e.target.value)} style={inputStyle} />
          </Field>
          <Grid>
            <Field label="年份 Year">
              <input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="小时数 Hours">
              <input type="number" value={form.hours} onChange={(e) => set("hours", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="马力 HP">
              <input type="number" value={form.hp} onChange={(e) => set("hp", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="座位 Seats">
              <input type="number" value={form.seats} onChange={(e) => set("seats", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="价格 Price">
              <input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="1 850 000 ₽" style={inputStyle} />
            </Field>
            <Field label="价格数字（排序/统计）">
              <input type="number" value={form.priceValue} onChange={(e) => set("priceValue", e.target.value)} placeholder="1850000" style={inputStyle} />
            </Field>
            <Field label="状态 Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} style={inputStyle}>
                <option value="available">В наличии（在售）</option>
                <option value="sold">Продано（已售）</option>
              </select>
            </Field>
          </Grid>
        </Section>

        <Section title="技术参数">
          <Field label="发动机 Engine">
            <input value={form.engine} onChange={(e) => set("engine", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="系统 System">
            <input value={form.system} onChange={(e) => set("system", e.target.value)} style={inputStyle} />
          </Field>
          <Grid>
            <Field label="拖车 Trailer">
              <input value={form.trailer} onChange={(e) => set("trailer", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="文件 Documents">
              <input value={form.documents} onChange={(e) => set("documents", e.target.value)} style={inputStyle} />
            </Field>
          </Grid>
        </Section>

        <Section title="描述">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
        </Section>

        <Section title={`图片（${form.images.length}）`}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {form.images.map((img, idx) => (
              <div key={img + idx} style={{ position: "relative", width: "150px" }}>
                <img src={img} alt={`фото ${idx + 1}`} style={{ width: "150px", height: "110px", objectFit: "cover", display: "block", border: form.heroImage === img ? "2px solid #111111" : "2px solid #E0DED9" }} />
                <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "6px" }}>
                  {form.heroImage !== img && (
                    <button
                      onClick={() => setHero(img)}
                      style={{ ...miniBtn, background: "#FFFFFF", color: "#111111" }}
                      title="设为主图"
                    >
                      ★
                    </button>
                  )}
                  <button
                    onClick={() => removeImage(idx)}
                    style={{ ...miniBtn, background: "#B00020", color: "#FFFFFF" }}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
                {form.heroImage === img && (
                  <div style={{ position: "absolute", bottom: "6px", left: "6px", background: "#111111", color: "#FFFFFF", fontSize: "9px", letterSpacing: "0.1em", padding: "2px 6px", textTransform: "uppercase" }}>
                    Главная
                  </div>
                )}
              </div>
            ))}

            <label
              style={{
                width: "150px", height: "110px", border: "1px dashed #999999", display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
                color: "#666666", fontSize: "12px", gap: "6px", background: "#FFFFFF",
              }}
            >
              {uploading ? "上传中..." : "+ 上传图片"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div style={{ fontSize: "11px", color: "#999999", marginTop: "10px" }}>
            支持多选上传（jpg/png/webp，单张 ≤ 15MB）。第一张自动成为主图，可点击 ★ 更换主图。
          </div>
        </Section>
      </main>
    </div>
  );
}

/* ================================================================
 * Shared bits
 * ================================================================ */
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#FFFFFF",
  padding: "11px 14px",
  fontSize: "14px",
  color: "#111111",
  fontFamily: "inherit",
  outline: "none",
};

const btnDark: React.CSSProperties = {
  background: "#111111",
  color: "#FFFFFF",
  border: "none",
  padding: "10px 22px",
  fontFamily: "inherit",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const btnLight: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#111111",
  border: "none",
  padding: "10px 22px",
  fontFamily: "inherit",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const btnGhostLight: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.3)",
  color: "rgba(255,255,255,0.85)",
  padding: "10px 22px",
  fontFamily: "inherit",
  fontSize: "11px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#B00020",
  border: "1px solid rgba(176,0,32,0.35)",
  padding: "10px 16px",
  fontFamily: "inherit",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  border: "none",
  width: "26px",
  height: "26px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "13px",
  cursor: "pointer",
  fontFamily: "inherit",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "36px" }}>
      <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#666666", marginBottom: "16px", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.12)" }}>
        {title}
      </div>
      <div style={{ background: "#FFFFFF", padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "#666666", marginBottom: "6px", letterSpacing: "0.04em" }}>{label}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0 20px" }}>{children}</div>
  );
}

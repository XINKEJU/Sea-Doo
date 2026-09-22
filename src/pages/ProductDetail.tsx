import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import Header from "../components/Header";
import ContactModal from "../components/ContactModal";
import LoadError from "../components/LoadError";
import { ApiError } from "../api";
import {
  reloadProduct,
  reloadSettings,
  useProduct,
  useSettings,
} from "../store";
import { useSeo } from "../seo";

const SPEC_LABELS: Record<string, string> = {
  year: "ГОД",
  hours: "МОТОЧАСЫ",
  hp: "МОЩНОСТЬ",
  engine: "ДВИГАТЕЛЬ",
  seats: "МЕСТ",
  system: "СИСТЕМА",
  trailer: "ПРИЦЕП",
  documents: "ДОКУМЕНТЫ",
};

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [contactOpen, setContactOpen] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  // 全局数据层：settings 与 Home 共用同一份缓存，SPA 内切换不再重复请求。
  const settingsRes = useSettings();
  // 单条商品按 slug 独立缓存（1.76KB），不为此拉取 28.7KB 的全量目录。
  const productRes = useProduct(slug);

  const settings = settingsRes.data;
  const item = productRes.data ?? undefined;

  // 逐页 SEO（必须在任何提前 return 之前调用）：商品页标题带型号/年份/价格，
  // 让搜索结果里每辆车的条目可区分，而不是全站共用一个标题。
  //
  // 注意 model 里常常已经含年份（线上数据形如 "Sea-Doo GTR 230 2023"），
  // 若再拼一次 year 会得到 "… 2023 2023 …"。这里做一次幂等判断。
  const modelLabel = /\b(19|20)\d{2}\b/.test(item?.model ?? "")
    ? (item?.model ?? "")
    : `${item?.model ?? ""} ${item?.year ?? ""}`.trim();

  useSeo({
    path: `/inventory/${slug ?? ""}`,
    title: item ? `${modelLabel} — ${item.price}` : undefined,
    description: item
      ? `${modelLabel}: ${item.hours} моточасов, ${item.hp} л.с. ${item.price}. ${item.status === "sold" ? "Продано" : "В наличии"}. Челябинск и регионы.`
      : undefined,
    image: item?.heroImage || undefined,
  });

  // 站点设置未就绪：骨架屏（失败则给重试），不渲染硬编码兜底品牌
  if (!settings) {
    return settingsRes.error ? <LoadError onRetry={() => void reloadSettings()} /> : <DetailSkeleton />;
  }

  // 商品未就绪：同样先骨架屏。**不再回退到内置演示商品** ——
  // 此前按 slug 命中本地演示数据时会直接渲染一辆并不存在的车。
  if (!item) {
    if (productRes.error) {
      // 区分「确实没有这个车型」与「接口不可用」，避免误导用户以为商品已下架
      const notFound = productRes.error instanceof ApiError && productRes.error.status === 404;
      if (!notFound) {
        return <LoadError onRetry={() => slug && void reloadProduct(slug)} />;
      }
      return (
        <div
          className="vh-full"
          style={{
            background: "#F4F2EE",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
            padding: "0 var(--page-x)",
          }}
        >
          <Header onContact={() => setContactOpen(true)} forceLight />
          <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
          <div style={{ fontSize: "14px", color: "#666666", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Модель не найдена
          </div>
          <button
            onClick={() => navigate("/")}
            className="btn-touch"
            style={{
              background: "#111111",
              color: "#FFFFFF",
              border: "none",
              padding: "14px 32px",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: "var(--fs-meta)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            В КАТАЛОГ
          </button>
        </div>
      );
    }
    return <DetailSkeleton />;
  }

  const sold = item.status === "sold";

  const specs = [
    { key: "year", value: String(item.year) },
    { key: "hours", value: `${item.hours} ч.` },
    { key: "hp", value: `${item.hp} л.с.` },
    { key: "engine", value: item.engine },
    { key: "seats", value: String(item.seats) },
    { key: "system", value: item.system },
    { key: "trailer", value: item.trailer },
    { key: "documents", value: item.documents },
  ];

  return (
    <div className="vh-full" style={{ background: "#F4F2EE" }}>
      <Header
        onContact={() => setContactOpen(true)}
        forceLight
        brandName={settings.brandName}
        brandSub={settings.brandSub}
        contactLabel={settings.contactLabel}
      />
      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        subject={`Интересует: ${item.model} ${item.year} · ${item.hours} моточасов`}
      />

      {/* Back nav —— 顶部留白 = 头部高度 + 刘海安全区，避免深色区块被固定头部遮挡 */}
      <div
        style={{
          paddingTop: "calc(var(--header-h) + env(safe-area-inset-top, 0px))",
          background: "#111111",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "24px var(--page-x) 0",
          }}
        >
          <button
            onClick={() => navigate("/")}
            className="btn-touch"
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.45)",
              fontFamily: "inherit",
              fontSize: "var(--fs-meta)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: "0 8px 0 0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)")}
          >
            ← ВСЕ МОДЕЛИ
          </button>
        </div>

        {/* HERO GALLERY */}
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "24px var(--page-x) 0",
          }}
        >
          {/* Main image —— 宽高比由断点令牌控制（桌面 16:7，手机 4:3） */}
          <div
            style={{
              position: "relative",
              background: "#0A0A0A",
              overflow: "hidden",
              aspectRatio: "var(--detail-hero-aspect)",
            }}
          >
            <img
              src={item.images[activeImg]}
              alt={`${item.model} — фото ${activeImg + 1}`}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                transition: "opacity 0.3s",
              }}
            />
            {sold && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(17,17,17,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "clamp(24px, 6vw, 64px)",
                    fontWeight: 800,
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.18)",
                    textTransform: "uppercase",
                    border: "3px solid rgba(255,255,255,0.12)",
                    padding: "12px 32px",
                  }}
                >
                  ПРОДАНО
                </span>
              </div>
            )}
          </div>

          {/* Thumbnails —— 横向滚动，尺寸与可点区域随断点收缩 */}
          <div
            className="thumbs-scroll"
            style={{
              display: "flex",
              gap: "4px",
              marginTop: "4px",
              overflowX: "auto",
              paddingBottom: "4px",
            }}
          >
            {item.images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImg(idx)}
                aria-label={`Фото ${idx + 1}`}
                style={{
                  flex: "0 0 auto",
                  width: "var(--thumbs-w)",
                  height: "var(--thumbs-h)",
                  overflow: "hidden",
                  background: "#0A0A0A",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  outline: activeImg === idx ? "2px solid #FFFFFF" : "2px solid transparent",
                  outlineOffset: "-2px",
                  transition: "outline-color 0.15s",
                }}
              >
                <img
                  src={img}
                  alt={`Миниатюра ${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: activeImg === idx ? 1 : 0.55,
                    transition: "opacity 0.2s",
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PRIMARY SPECS BANNER */}
      <div style={{ background: "#111111", padding: "var(--banner-y) var(--page-x)" }}>
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* row-split：桌面型号与价格横向两端对齐，窄屏纵向堆叠 */}
          <div className="row-split">
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: "clamp(26px, 5vw, 52px)",
                  fontWeight: 800,
                  color: "#FFFFFF",
                  margin: 0,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                  textTransform: "uppercase",
                  overflowWrap: "break-word",
                }}
              >
                {item.model}
              </h1>
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {item.year} · {item.hours} МОТОЧАСОВ · {item.hp} Л.С.
              </div>
            </div>

            {/* detail-price：桌面右对齐，窄屏堆叠后左对齐 */}
            <div className="detail-price">
              <div
                style={{
                  fontSize: "clamp(24px, 3.5vw, 38px)",
                  fontWeight: 800,
                  color: sold ? "rgba(255,255,255,0.4)" : "#FFFFFF",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {item.price}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "var(--fs-caps)",
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: sold ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.55)",
                }}
              >
                {sold ? "ПРОДАНО" : "В НАЛИЧИИ"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT —— detail-split：桌面 1fr + 规格栏双列，<=1024px 自动单列 */}
      <div style={{ background: "#F4F2EE", padding: "var(--block-y) var(--page-x) var(--block-y-bottom)" }}>
        <div className="detail-split" style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
          {/* Left: Description + Gallery */}
          <div style={{ minWidth: 0 }}>
            {/* ОПИСАНИЕ */}
            <section style={{ marginBottom: "var(--block-y)" }}>
              <SectionLabel>ОПИСАНИЕ</SectionLabel>
              <p
                style={{
                  fontSize: "16px",
                  lineHeight: 1.8,
                  color: "#333333",
                  margin: 0,
                  maxWidth: "640px",
                }}
              >
                {item.description}
              </p>
            </section>

            {/* ФОТОГАЛЕРЕЯ */}
            <section>
              <SectionLabel>ФОТОГАЛЕРЕЯ</SectionLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "var(--gallery-gap)",
                }}
              >
                {item.images.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      overflow: "hidden",
                      background: "#E0DED9",
                      aspectRatio: idx === 0 ? "16/9" : "4/3",
                      gridColumn: idx === 0 ? "1 / -1" : "auto",
                    }}
                  >
                    <img
                      src={img}
                      alt={`${item.model} — детальное фото ${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        transition: "transform 0.5s ease",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLImageElement).style.transform = "scale(1.03)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLImageElement).style.transform = "scale(1)")
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right: Specs + CTA（detail-aside：仅在双列布局下吸顶） */}
          <div className="detail-aside" style={{ minWidth: 0 }}>
            {/* ХАРАКТЕРИСТИКИ */}
            <section style={{ marginBottom: "48px" }}>
              <SectionLabel>ХАРАКТЕРИСТИКИ</SectionLabel>
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                {specs.map((spec, idx) => (
                  <div
                    key={spec.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "12px",
                      padding: "var(--spec-pad)",
                      borderBottom:
                        idx < specs.length - 1
                          ? "1px solid rgba(0,0,0,0.07)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--fs-caps)",
                        fontWeight: 600,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "#999999",
                        flex: "0 0 auto",
                      }}
                    >
                      {SPEC_LABELS[spec.key]}
                    </span>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#111111",
                        textAlign: "right",
                        maxWidth: "60%",
                        overflowWrap: "break-word",
                      }}
                    >
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* CONTACT CTA */}
            <div
              style={{
                background: "#111111",
                padding: "32px var(--page-x)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--fs-caps)",
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "12px",
                }}
              >
                ПОНРАВИЛСЯ ЭТОТ ГИДРОЦИКЛ?
              </div>
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  margin: "0 0 10px",
                  lineHeight: 1.3,
                }}
              >
                Свяжитесь с нами для получения дополнительной информации
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "28px",
                  lineHeight: 1.6,
                }}
              >
                Ответим на все вопросы, организуем осмотр и тест-драйв.
              </p>
              <button
                onClick={() => setContactOpen(true)}
                className="btn-touch btn-touch--block"
                style={{
                  width: "100%",
                  background: "#FFFFFF",
                  color: "#111111",
                  border: "none",
                  padding: "18px 32px",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  fontSize: "var(--fs-meta)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#F4F2EE";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF";
                }}
              >
                СВЯЗАТЬСЯ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer minimal */}
      <footer
        className="safe-bottom"
        style={{
          background: "#111111",
          paddingTop: "32px",
          paddingLeft: "var(--page-x)",
          paddingRight: "var(--page-x)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          className="row-split row-split--center"
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
          }}
        >
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
            {settings.copyrightText}
          </span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
            {settings.cityText}
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * 详情页骨架屏：站点设置或商品返回前渲染。
 * 复用与真实页面相同的语义类（.detail-split / .detail-aside / .detail-price 等），
 * 因此在各断点下尺寸与真实页面一致，数据到达后不会发生布局跳动。
 */
function DetailSkeleton() {
  return (
    <div className="vh-full" style={{ background: "#F4F2EE" }}>
      <div className="site-header" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <div
          className="site-header__inner"
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            height: "var(--header-h)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ height: 12, width: 96, background: "rgba(255,255,255,0.18)" }} />
          <div style={{ height: 36, width: 128, background: "rgba(255,255,255,0.10)" }} />
        </div>
      </div>

      <main
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "calc(var(--header-h) + 40px) var(--page-x) 0",
        }}
      >
        <div className="detail-split">
          <div style={{ paddingTop: "75%", background: "#E8E6E2" }} />
          <div className="detail-aside">
            <div style={{ height: 30, width: "80%", background: "#E8E6E2", marginBottom: 16 }} />
            <div style={{ height: 14, width: "55%", background: "#E8E6E2", marginBottom: 32 }} />
            <div style={{ height: 44, width: "40%", background: "#E8E6E2" }} />
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--fs-caps)",
        fontWeight: 600,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "#666666",
        marginBottom: "24px",
        paddingBottom: "12px",
        borderBottom: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );
}

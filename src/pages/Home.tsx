import { useState } from "react";
import { useNavigate } from "react-router";
import Header from "../components/Header";
import ContactModal from "../components/ContactModal";
import LoadError from "../components/LoadError";
import type { JetSki } from "../types";
import { reloadSettings, useProducts, useSettings } from "../store";
import { useSeo } from "../seo";

const HERO_SMALL = "/hero-poster-828.jpg";
const HERO_LARGE = "/hero-poster.jpg";

/**
 * 是否处于弱网/省流环境。
 * 用于两处降级：不加载 Hero 视频；海报只取小图。两个判定共用同一套信号，
 * 避免出现「不加载视频但拉 254KB 大图」这类自相矛盾的结果。
 */
function isWeakNetwork(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && ["slow-2g", "2g", "3g"].includes(conn.effectiveType)) return true;
  return false;
}

/**
 * 选择海报图地址。
 * 弱网下直接锁定小图（81KB）并让调用方**不下发 srcset**：
 * srcset 的选片由「视口宽 × DPR」决定，与网速无关——375px 的 DPR3 手机会算出
 * 需要 1125px，从而挑中 1600px(254KB) 的大图，在 3G 下等于为一张首屏底图
 * 多付约 3 倍流量。宽屏（>768px）本来就用大图，无需约束。
 */
function heroPoster(): string {
  if (typeof window === "undefined") return HERO_LARGE;
  if (isWeakNetwork()) return HERO_SMALL;
  return window.matchMedia("(max-width: 768px)").matches ? HERO_SMALL : HERO_LARGE;
}

/**
 * 是否加载 Hero 背景视频。
 * 视频是 11.7MB 的资源，自动播放对俄罗斯移动用户的数据量与首屏耗时都是明显负担，
 * 因此以下情况一律改用静态海报（完全不发起视频请求）：
 * - 用户开启省流模式（Save-Data）或系统偏好减少动效；
 * - 连接类型为 2G/3G（含 slow-2g）。
 * 4G/Wi-Fi 下保持原有电影感自动播放。
 */
function shouldUseHeroVideo(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return !isWeakNetwork();
}

export default function Home() {
  const [contactOpen, setContactOpen] = useState(false);
  const [videoOk, setVideoOk] = useState(true);
  // 惰性初始化即可：本项目为纯客户端渲染（无 SSR），无需在 effect 里二次 setState
  // （在 effect 内同步 setState 会触发级联渲染，且被 react-hooks 规则拦下）
  const [allowVideo] = useState(() => shouldUseHeroVideo());
  const navigate = useNavigate();

  // 全局数据层：模块级缓存 + 并发去重，切换路由不再重复请求 /api/settings。
  const settingsRes = useSettings();
  const productsRes = useProducts();

  // 逐页 SEO：首页用站点默认标题，并写入正确的 canonical / og:url
  useSeo({ path: "/" });

  // 数据未就绪时渲染骨架屏，**不渲染任何硬编码兜底数据**。
  // 此前以 DEFAULT_SETTINGS 同步初始化，会在接口返回前显示
  // 「SEA-DOO PREMIUM USED / © 2025 / 不存在的库存」，与线上品牌（DY_RIDE）不符。
  if (!settingsRes.data) {
    // 已确认失败（而非仍在加载）：给出重试入口，避免无限骨架屏
    return settingsRes.error ? <LoadError onRetry={() => void reloadSettings()} /> : <HomeSkeleton />;
  }

  const settings = settingsRes.data;
  const products = productsRes.data;
  const items: JetSki[] = products ?? [];

  return (
    /* vh-full：dvh 优先，避免移动端地址栏折叠造成底部留白 */
    <div className="vh-full" style={{ background: "#F4F2EE" }}>
      <Header
        onContact={() => setContactOpen(true)}
        brandName={settings.brandName}
        brandSub={settings.brandSub}
        contactLabel={settings.contactLabel}
      />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />

      {/* HERO */}
      <section
        className="hero-vh"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#111111",
        }}
      >
        {/* Hero 背景：视频优先，弱网/省流下用静态海报；视频出错也回退为海报。
            poster 必须有值 —— 线上 heroImage 为空字符串，此前 poster 为空，
            视频首帧到达前 Hero 是一片纯黑。 */}
        {allowVideo && videoOk ? (
          <video
            key={settings.heroVideo}
            src={settings.heroVideo}
            poster={settings.heroImage || heroPoster()}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoOk(false)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 40%",
              opacity: Number(settings.heroOpacity) || 0.55,
            }}
          />
        ) : (
          <img
            /* 响应式海报：宽屏取 1600px（254KB），窄屏取 828px（81KB）。
               弱网下 heroPoster() 已锁定小图，此时**不下发 srcset**，
               否则浏览器会按「视口宽 × DPR」重新挑回 1600px 大图。 */
            src={settings.heroImage || heroPoster()}
            srcSet={
              settings.heroImage || isWeakNetwork()
                ? undefined
                : `${HERO_SMALL} 828w, ${HERO_LARGE} 1600w`
            }
            sizes="100vw"
            alt={`${settings.brandName} — ${settings.brandSub}`}
            fetchPriority="high"
            decoding="async"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 40%",
              opacity: Number(settings.heroOpacity) || 0.55,
            }}
          />
        )}
        {/* Cinematic vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(17,17,17,0.7) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            /* 移动端 Hero 收矮后 220px 渐变会吃掉大半画面，按比例限高 */
            height: "min(220px, 40%)",
            background: "linear-gradient(to bottom, transparent, #111111)",
          }}
        />
      </section>

      {/* INVENTORY */}
      <section
        style={{
          background: "#F4F2EE",
          padding: "var(--section-y-top) 0 var(--section-y-bottom)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "0 var(--page-x)",
          }}
        >
          <div
            className="row-split"
            style={{
              marginBottom: "var(--section-y-top)",
              borderBottom: "1px solid rgba(0,0,0,0.12)",
              paddingBottom: "24px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--fs-caps)",
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#666666",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                {settings.sectionLabel}
              </span>
              <h2
                style={{
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 800,
                  color: "#111111",
                  margin: 0,
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                }}
              >
                {settings.sectionTitle}
              </h2>
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#666666",
                letterSpacing: "0.04em",
              }}
            >
              {products
                ? `${items.filter((i) => i.status === "available").length} ${settings.availableLabel}`
                : ""}
            </div>
          </div>

          {/* Grid（商品未就绪时显示骨架屏，不渲染内置演示商品）
              card-grid 使用 min(var(--card-min), 100%) 作为轨道下界，
              窄屏单列时不会超出容器，从根本上消除横向溢出 */}
          {products === null ? (
            <SkeletonGrid />
          ) : (
            <div className="card-grid">
              {items.map((item) => (
                <InventoryCard
                  key={item.slug}
                  item={item}
                  onClick={() => navigate(`/inventory/${item.slug}`)}
                  labels={{ soldLabel: settings.soldLabel, inStockLabel: settings.inStockLabel }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="safe-bottom"
        style={{
          background: "#111111",
          color: "#FFFFFF",
          paddingTop: "var(--footer-y)",
          paddingLeft: "var(--page-x)",
          paddingRight: "var(--page-x)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "32px",
          }}
        >
          <div className="row-split">
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                {settings.footerBrand}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.7,
                }}
              >
                {settings.footerSlogan}
              </div>
              {(settings.phone || settings.email || settings.address) && (
                <div
                  style={{
                    marginTop: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    fontSize: "var(--fs-meta)",
                    color: "rgba(255,255,255,0.65)",
                    lineHeight: 1.6,
                  }}
                >
                  {settings.phone && <span>{settings.phone}</span>}
                  {settings.email && <span>{settings.email}</span>}
                  {settings.address && <span>{settings.address}</span>}
                </div>
              )}
            </div>

            {/* footer-actions：桌面右对齐，移动端堆叠后改左对齐 */}
            <div className="footer-actions">
              <button
                onClick={() => setContactOpen(true)}
                className="btn-touch"
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "rgba(255,255,255,0.75)",
                  fontFamily: "inherit",
                  fontSize: "var(--fs-meta)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "10px 24px",
                  cursor: "pointer",
                  transition: "border-color 0.2s, color 0.2s",
                }}
              >
                {settings.contactLabel}
              </button>
            </div>
          </div>

          <div
            className="row-split row-split--center"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "24px",
            }}
          >
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
              {settings.copyrightText}
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
              {settings.cityText}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * 首屏骨架屏：在站点设置/商品返回前渲染。
 *
 * 结构与真实页面一一对应（头部条、Hero、区块标题、卡片网格、页脚），并使用同一批
 * 语义类与令牌，因此在任何断点下与真实页面尺寸一致，数据到达后不会发生布局跳动（CLS）。
 * 相比此前的做法（直接渲染 DEFAULT_SETTINGS + 内置演示商品），骨架屏不会向用户
 * 展示错误品牌、错误年份或并不存在的库存。
 */
function HomeSkeleton() {
  return (
    <div className="vh-full" style={{ background: "#F4F2EE" }}>
      {/* 头部占位：与 .site-header 同高，避免内容下移 */}
      <div
        className="site-header"
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}
      >
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

      {/* Hero 占位 */}
      <section className="hero-vh" style={{ position: "relative", background: "#111111" }} />

      {/* 库存区块占位 */}
      <section style={{ padding: "var(--section-y-top) 0 var(--section-y-bottom)" }}>
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "0 var(--page-x)",
          }}
        >
          <div
            className="row-split"
            style={{
              marginBottom: "var(--section-y-top)",
              borderBottom: "1px solid rgba(0,0,0,0.12)",
              paddingBottom: "24px",
            }}
          >
            <div>
              <div
                style={{
                  height: 12,
                  width: 140,
                  background: "#E8E6E2",
                  marginBottom: 14,
                }}
              />
              <div style={{ height: 34, width: "min(420px, 80%)", background: "#E8E6E2" }} />
            </div>
          </div>
          <SkeletonGrid />
        </div>
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="card-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{ background: "#FFFFFF", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
        >
          <div style={{ paddingTop: "75%", background: "#E8E6E2" }} />
          <div style={{ padding: "var(--card-pad-top) var(--card-pad-x) var(--card-pad-x)" }}>
            <div style={{ height: 14, background: "#E8E6E2", marginBottom: 10, width: "62%" }} />
            <div style={{ height: 10, background: "#E8E6E2", marginBottom: 18, width: "42%" }} />
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
              <div style={{ height: 14, background: "#E8E6E2", width: "32%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InventoryCard({
  item,
  onClick,
  labels,
}: {
  item: JetSki;
  onClick: () => void;
  labels: { soldLabel: string; inStockLabel: string };
}) {
  const [hovered, setHovered] = useState(false);
  const sold = item.status === "sold";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: "#FFFFFF",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "box-shadow 0.3s",
        boxShadow: hovered
          ? "0 12px 48px rgba(0,0,0,0.12)"
          : "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Image 4:3 —— 容器用 padding-top 撑出比例，图片绝对定位铺满，任意宽度下自适应 */}
      <div
        className="card-media"
        style={{
          position: "relative",
          paddingTop: "75%",
          overflow: "hidden",
          background: "#E8E6E2",
        }}
      >
        <img
          src={item.heroImage}
          alt={item.model}
          loading="lazy"
          decoding="async"
          /* transform / transition 交由 .card-media img 控制：
             仅精确指针设备启用 hover 缩放，触屏不再出现「点完卡在放大态」 */
          className={hovered ? "is-active" : undefined}
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: sold ? "grayscale(30%)" : "none",
          }}
        />

        {/* Status badge */}
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
          }}
        >
          {sold ? (
            <span
              style={{
                background: "rgba(17,17,17,0.72)",
                backdropFilter: "blur(6px)",
                color: "rgba(255,255,255,0.65)",
                fontSize: "var(--fs-micro)",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                padding: "5px 10px",
              }}
            >
              {labels.soldLabel}
            </span>
          ) : (
            <span
              style={{
                background: "rgba(17,17,17,0.72)",
                backdropFilter: "blur(6px)",
                color: "rgba(255,255,255,0.9)",
                fontSize: "var(--fs-micro)",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                padding: "5px 10px",
              }}
            >
              {labels.inStockLabel}
            </span>
          )}
        </div>

        {/* CTA —— 触屏常显（原先仅 hover 显示，触屏设备完全看不到入口） */}
        <div className={"card-cta" + (hovered ? " is-active" : "")} style={{ position: "absolute", bottom: "16px", right: "16px" }}>
          <span
            style={{
              background: "#111111",
              color: "#FFFFFF",
              fontSize: "var(--fs-caps)",
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            СМОТРЕТЬ <span style={{ fontSize: "13px" }}>→</span>
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "var(--card-pad-top) var(--card-pad-x) var(--card-pad-x)" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#111111",
            lineHeight: 1.2,
            marginBottom: "6px",
          }}
        >
          {item.model}
        </div>
        <div
          style={{
            fontSize: "var(--fs-meta)",
            color: "#666666",
            letterSpacing: "0.08em",
            marginBottom: "16px",
          }}
        >
          {item.year} · {item.hours} МОТОЧАСОВ
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "12px",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            paddingTop: "14px",
          }}
        >
          <span
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: sold ? "#999999" : "#111111",
              letterSpacing: "-0.01em",
            }}
          >
            {item.price}
          </span>
          <span
            style={{
              fontSize: "var(--fs-caps)",
              color: "#666666",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              flex: "0 0 auto",
            }}
          >
            {item.hp} Л.С.
          </span>
        </div>
      </div>
    </div>
  );
}

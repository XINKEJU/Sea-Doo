import { useEffect, useState } from "react";
import { Link } from "react-router";

interface HeaderProps {
  onContact: () => void;
  forceLight?: boolean;
  brandName?: string;
  brandSub?: string;
  contactLabel?: string;
}

export default function Header({
  onContact,
  forceLight = false,
  /* 品牌默认留空而不是写死默认品牌：页头由数据层驱动，一旦漏传参数应当显示为空，
     而不是显示一个与服务端不一致的品牌名（此前默认值是硬编码的 "SEA-DOO"）。 */
  brandName = "",
  brandSub = "",
  contactLabel = "СВЯЗАТЬСЯ",
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dark = scrolled || forceLight;

  return (
    <header
      /* site-header: 刘海屏顶部安全区（需配合 viewport-fit=cover） */
      className="site-header"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: "background 0.35s ease, backdrop-filter 0.35s ease",
        background: dark
          ? "rgba(17, 17, 17, 0.82)"
          : "transparent",
        backdropFilter: dark ? "blur(14px)" : "none",
        WebkitBackdropFilter: dark ? "blur(14px)" : "none",
        borderBottom: dark ? "1px solid rgba(255,255,255,0.07)" : "none",
      }}
    >
      <div
        /* 水平内距兼顾安全区，高度由断点令牌控制 */
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
        <Link
          to="/"
          className="brand-link"
          style={{
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: "13px",
              letterSpacing: "0.18em",
              lineHeight: 1,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {brandName}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontWeight: 400,
              fontSize: "var(--fs-caps)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {brandSub}
          </span>
        </Link>

        {/* 触控目标在窄屏/触屏设备上补足至 48px 高，避免误触 */}
        <button
          onClick={onContact}
          className="btn-touch"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.55)",
            color: "#FFFFFF",
            fontFamily: "inherit",
            fontWeight: 500,
            fontSize: "var(--fs-meta)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "10px 20px",
            cursor: "pointer",
            flex: "0 0 auto",
            transition: "background 0.2s, border-color 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.9)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.55)";
          }}
        >
          {contactLabel}
        </button>
      </div>
    </header>
  );
}

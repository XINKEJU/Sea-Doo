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
  brandName = "SEA-DOO",
  brandSub = "PREMIUM USED",
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
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "0 32px",
          height: "72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
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
            }}
          >
            {brandName}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.55)",
              fontWeight: 400,
              fontSize: "10px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {brandSub}
          </span>
        </Link>

        <button
          onClick={onContact}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.55)",
            color: "#FFFFFF",
            fontFamily: "inherit",
            fontWeight: 500,
            fontSize: "11px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "10px 24px",
            cursor: "pointer",
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

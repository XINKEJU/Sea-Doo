import { useState } from "react";
import { useNavigate } from "react-router";
import Header from "../components/Header";
import ContactModal from "../components/ContactModal";
import { inventory } from "../data/inventory";

const HERO_IMG =
  "https://images.unsplash.com/photo-1649291390039-3d5640328a5a?w=2400&h=1400&fit=crop&auto=format";

export default function Home() {
  const [contactOpen, setContactOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EE" }}>
      <Header onContact={() => setContactOpen(true)} />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />

      {/* HERO */}
      <section
        style={{
          height: "100vh",
          position: "relative",
          overflow: "hidden",
          background: "#111111",
        }}
      >
        <img
          src={HERO_IMG}
          alt="SEA-DOO гидроцикл в движении"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 40%",
            opacity: 0.55,
          }}
        />
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
            height: "220px",
            background: "linear-gradient(to bottom, transparent, #111111)",
          }}
        />
      </section>

      {/* INVENTORY */}
      <section style={{ background: "#F4F2EE", padding: "96px 0 120px" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 40px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "64px",
              borderBottom: "1px solid rgba(0,0,0,0.12)",
              paddingBottom: "24px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#666666",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                ТЕКУЩИЙ СКЛАД
              </span>
              <h2
                style={{
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 800,
                  color: "#111111",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                В НАЛИЧИИ И НЕДАВНО ПРОДАННОЕ
              </h2>
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#666666",
                letterSpacing: "0.04em",
              }}
            >
              {inventory.filter((i) => i.status === "available").length} доступно
            </div>
          </div>

          {/* Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
              gap: "2px",
            }}
          >
            {inventory.map((item) => (
              <InventoryCard
                key={item.slug}
                item={item}
                onClick={() => navigate(`/inventory/${item.slug}`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          background: "#111111",
          color: "#FFFFFF",
          padding: "48px 40px",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "32px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "24px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                SEA-DOO PREMIUM USED
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.7,
                }}
              >
                Премиальный шоурум б/у гидроциклов
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              <button
                onClick={() => {}}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "rgba(255,255,255,0.75)",
                  fontFamily: "inherit",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "10px 24px",
                  cursor: "pointer",
                  transition: "border-color 0.2s, color 0.2s",
                }}
              >
                СВЯЗАТЬСЯ
              </button>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
              © 2025 SEA-DOO PREMIUM USED. Все права защищены.
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
              Гидроциклы · Москва и регионы
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InventoryCard({
  item,
  onClick,
}: {
  item: (typeof inventory)[0];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const sold = item.status === "sold";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      {/* Image 4:3 */}
      <div
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
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            transform: hovered ? "scale(1.04)" : "scale(1)",
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
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                padding: "5px 10px",
              }}
            >
              ПРОДАНО
            </span>
          ) : (
            <span
              style={{
                background: "rgba(17,17,17,0.72)",
                backdropFilter: "blur(6px)",
                color: "rgba(255,255,255,0.9)",
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                padding: "5px 10px",
              }}
            >
              В НАЛИЧИИ
            </span>
          )}
        </div>

        {/* Hover CTA */}
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.25s, transform 0.25s",
            transform: hovered ? "translateX(0)" : "translateX(8px)",
          }}
        >
          <span
            style={{
              background: "#111111",
              color: "#FFFFFF",
              fontSize: "10px",
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
      <div style={{ padding: "20px 24px 24px" }}>
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
            fontSize: "11px",
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
              fontSize: "10px",
              color: "#666666",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {item.hp} Л.С.
          </span>
        </div>
      </div>
    </div>
  );
}

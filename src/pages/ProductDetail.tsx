import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import Header from "../components/Header";
import ContactModal from "../components/ContactModal";
import { inventory, type JetSki } from "../data/inventory";
import { api, DEFAULT_SETTINGS, type SiteSettings } from "../api";

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
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [item, setItem] = useState<JetSki | undefined>(() =>
    inventory.find((i) => i.slug === slug)
  );

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    // slug 变化时立即重置，避免显示上一辆车的旧数据
    setItem(inventory.find((i) => i.slug === slug));
    api
      .listProducts()
      .then((list) => {
        const found = list.find((i) => i.slug === slug);
        if (alive && found) setItem(found);
      })
      .catch(() => {
        /* fallback to built-in data */
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!item) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F4F2EE",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
        }}
      >
        <Header onContact={() => setContactOpen(true)} forceLight />
        <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
        <div style={{ fontSize: "14px", color: "#666666", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Модель не найдена
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "#111111",
            color: "#FFFFFF",
            border: "none",
            padding: "14px 32px",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: "11px",
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
    <div style={{ minHeight: "100vh", background: "#F4F2EE" }}>
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

      {/* Back nav */}
      <div style={{ paddingTop: "72px", background: "#111111" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 40px 0" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.45)",
              fontFamily: "inherit",
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
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
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 40px 0" }}>
          {/* Main image */}
          <div
            style={{
              position: "relative",
              background: "#0A0A0A",
              overflow: "hidden",
              aspectRatio: "16/7",
            }}
          >
            <img
              src={item.images[activeImg]}
              alt={`${item.model} — фото ${activeImg + 1}`}
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
                    fontSize: "clamp(32px, 6vw, 64px)",
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

          {/* Thumbnails */}
          <div
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
                style={{
                  flex: "0 0 auto",
                  width: "120px",
                  height: "80px",
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
      <div style={{ background: "#111111", padding: "48px 40px 56px" }}>
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "24px",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "clamp(28px, 5vw, 52px)",
                  fontWeight: 800,
                  color: "#FFFFFF",
                  margin: 0,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  textTransform: "uppercase",
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

            <div style={{ textAlign: "right" }}>
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
                  fontSize: "10px",
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

      {/* CONTENT */}
      <div style={{ background: "#F4F2EE", padding: "80px 40px 120px" }}>
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 420px",
            gap: "80px",
            alignItems: "start",
          }}
        >
          {/* Left: Description + Gallery */}
          <div>
            {/* ОПИСАНИЕ */}
            <section style={{ marginBottom: "80px" }}>
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
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "4px",
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

          {/* Right: Specs + CTA */}
          <div style={{ position: "sticky", top: "96px" }}>
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
                      padding: "16px 24px",
                      borderBottom:
                        idx < specs.length - 1
                          ? "1px solid rgba(0,0,0,0.07)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "#999999",
                      }}
                    >
                      {SPEC_LABELS[spec.key]}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#111111",
                        textAlign: "right",
                        maxWidth: "60%",
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
                padding: "40px 32px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
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
                style={{
                  width: "100%",
                  background: "#FFFFFF",
                  color: "#111111",
                  border: "none",
                  padding: "18px 32px",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  fontSize: "11px",
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
        style={{
          background: "#111111",
          padding: "32px 40px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "10px",
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

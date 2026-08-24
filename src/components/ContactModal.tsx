import { useEffect, useRef, useState } from "react";

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  subject?: string;
}

export default function ContactModal({ open, onClose, subject }: ContactModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(subject || "");
  const [sent, setSent] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (subject) setMessage(subject);
  }, [subject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setName("");
      setPhone("");
      setMessage("");
      onClose();
    }, 2400);
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(0,0,0,0.2)",
    padding: "12px 0",
    fontFamily: "inherit",
    fontSize: "15px",
    color: "#111111",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#666666",
    display: "block",
    marginBottom: "4px",
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(17,17,17,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          width: "100%",
          maxWidth: "560px",
          padding: "48px 48px 56px",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#666666",
            fontSize: "20px",
            lineHeight: 1,
            padding: "4px",
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>

        {sent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#666666", marginBottom: "12px" }}>
              ОТПРАВЛЕНО
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#111111" }}>
              Мы свяжемся с вами в ближайшее время
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "32px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#666666", marginBottom: "8px" }}>
                СВЯЗАТЬСЯ
              </div>
              <h2 style={{ fontSize: "26px", fontWeight: 700, color: "#111111", margin: 0, lineHeight: 1.2 }}>
                Оставьте заявку
              </h2>
              <p style={{ marginTop: "8px", color: "#666666", fontSize: "14px", lineHeight: 1.6 }}>
                Ответим в течение часа в рабочее время
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              <div>
                <label style={labelStyle}>Ваше имя</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Петров"
                  required
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>
              <div>
                <label style={labelStyle}>Телефон</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  required
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>
              <div>
                <label style={labelStyle}>Сообщение</label>
                <textarea
                  style={{ ...inputStyle, resize: "none", minHeight: "72px" }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Интересует модель, вопросы, удобное время..."
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: "#111111",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "18px 40px",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  alignSelf: "flex-start",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#333333")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#111111")}
              >
                ОТПРАВИТЬ
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

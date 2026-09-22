import { useEffect, useRef, useState } from "react";
import { api } from "../api";

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  subject?: string;
}

type SubmitState = "idle" | "sending" | "sent" | "error";

export default function ContactModal({ open, onClose, subject }: ContactModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(subject || "");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorText, setErrorText] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // 渲染期状态调整（React 官方推荐，替代 effect 内 setState）：
  // subject prop 变化时同步 message；modal 重新打开时重置提交状态
  const [prevSubject, setPrevSubject] = useState(subject);
  if (subject !== prevSubject) {
    setPrevSubject(subject);
    if (subject) setMessage(subject);
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setState("idle");
      setErrorText("");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /**
   * 锁定背景滚动。
   * iOS Safari 不支持通过 body { overflow: hidden } 阻止背景滚动，必须把 body
   * 改为固定定位并负向偏移当前滚动量；否则弹窗打开后手指仍会滚动背后页面，
   * 观感上就是「布局错乱」。桌面端保持原有 overflow 方案，避免整页跳动。
   */
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const root = document.documentElement;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    const needsFixedLock = window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches;

    if (needsFixedLock) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
    }
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      if (needsFixedLock) {
        // scroll-behavior: smooth 会把恢复位置变成可见动画，需临时关闭
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, scrollY);
        root.style.scrollBehavior = prevBehavior;
      }
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setErrorText("");
    try {
      await api.submitLead({ name, phone, message, subject: subject || "" });
      setState("sent");
      setTimeout(() => {
        setState("idle");
        setName("");
        setPhone("");
        setMessage("");
        onClose();
      }, 2400);
    } catch (err) {
      setErrorText((err as Error).message || "Ошибка отправки");
      setState("error");
    }
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(0,0,0,0.2)",
    padding: "12px 0",
    fontFamily: "inherit",
    /* >=16px 抑制 iOS Safari 聚焦时自动放大整页（--fs-input 在窄屏提升到 16px） */
    fontSize: "var(--fs-input)",
    color: "#111111",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--fs-caps)",
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
      className="modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(17,17,17,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* modal-sheet：桌面居中弹窗，移动端底部抽屉；限高 + 内部滚动，软键盘弹出后依然可达提交按钮 */}
      <div
        className="modal-sheet"
        style={{
          background: "#FFFFFF",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          className="modal-close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#666666",
            fontSize: "20px",
            lineHeight: 1,
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>

        {state === "sent" ? (
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
            <div style={{ marginBottom: "32px", paddingRight: "32px" }}>
              <div style={{ fontSize: "var(--fs-caps)", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#666666", marginBottom: "8px" }}>
                СВЯЗАТЬСЯ
              </div>
              <h2 style={{ fontSize: "clamp(22px, 5vw, 26px)", fontWeight: 700, color: "#111111", margin: 0, lineHeight: 1.2 }}>
                Оставьте заявку
              </h2>
              <p style={{ marginTop: "8px", color: "#666666", fontSize: "14px", lineHeight: 1.6 }}>
                Ответим в течение часа в рабочее время
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              <div>
                <label style={labelStyle} htmlFor="lead-name">Ваше имя</label>
                <input
                  id="lead-name"
                  style={inputStyle}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Петров"
                  autoComplete="name"
                  enterKeyHint="next"
                  required
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="lead-phone">Телефон</label>
                <input
                  id="lead-phone"
                  style={inputStyle}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  required
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="lead-message">Сообщение</label>
                <textarea
                  id="lead-message"
                  style={{ ...inputStyle, resize: "none", minHeight: "72px" }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Интересует модель, вопросы, удобное время..."
                  enterKeyHint="send"
                  onFocus={(e) => (e.target.style.borderBottomColor = "#111111")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.2)")}
                />
              </div>

              {errorText && (
                <div style={{ color: "#B00020", fontSize: "13px", lineHeight: 1.5 }}>{errorText}</div>
              )}

              {/* btn-touch--block：触屏下撑满宽度并保证 48px 高度 */}
              <button
                type="submit"
                disabled={state === "sending"}
                className="btn-touch btn-touch--block"
                style={{
                  background: "#111111",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "18px 40px",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: "var(--fs-meta)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: state === "sending" ? "wait" : "pointer",
                  transition: "background 0.2s, opacity 0.2s",
                  alignSelf: "flex-start",
                  opacity: state === "sending" ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (state !== "sending") (e.currentTarget as HTMLButtonElement).style.background = "#333333";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#111111";
                }}
              >
                {state === "sending" ? "ОТПРАВКА..." : "ОТПРАВИТЬ"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

import { useNavigate } from "react-router";

/** 兜底 404（未知路径不再白屏） */
export default function NotFound() {
  const navigate = useNavigate();
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
      <div style={{ fontSize: "14px", color: "#666666", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        404 · Страница не найдена
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

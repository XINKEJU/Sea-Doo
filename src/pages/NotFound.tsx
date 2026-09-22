import { useLocation, useNavigate } from "react-router";
import { useSeo } from "../seo";

/** 兜底 404（未知路径不再白屏） */
export default function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // 404 页不应被索引，同时保证标题与 canonical 不残留在上一页的取值
  useSeo({ title: "Страница не найдена", path: pathname, noindex: true });

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
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "14px", color: "#666666", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        404 · Страница не найдена
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

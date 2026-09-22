/**
 * 数据加载失败时的整页提示。
 *
 * 为什么不退回「内置兜底数据」：兜底数据是与服务端无关的硬编码内容，
 * 一旦接口不可用就会向用户展示错误的品牌、年份与并不存在的库存。
 * 明确的失败提示 + 重试入口，比展示一份「看起来正常但是错的」内容更负责。
 */
export default function LoadError({ onRetry }: { onRetry: () => void }) {
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
      <div
        style={{
          fontSize: "var(--fs-body)",
          color: "#666666",
          textAlign: "center",
          lineHeight: 1.7,
          maxWidth: "32em",
        }}
      >
        Не удалось загрузить данные.
        <br />
        Проверьте соединение и попробуйте ещё раз.
      </div>
      <button
        onClick={onRetry}
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
        ОБНОВИТЬ
      </button>
    </div>
  );
}

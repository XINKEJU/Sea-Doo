import { lazy, Suspense } from "react";

// 后台管理页单独打包（code-split），访客不加载后台代码
const Admin = lazy(() => import("./Admin"));

export default function AdminRoute() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#F4F2EE",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
            fontSize: "13px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Загрузка...
        </div>
      }
    >
      <Admin />
    </Suspense>
  );
}

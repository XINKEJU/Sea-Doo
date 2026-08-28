import { createBrowserRouter } from "react-router";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import AdminRoute from "./pages/AdminRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/inventory/:slug",
    Component: ProductDetail,
  },
  {
    path: "/admin",
    Component: AdminRoute,
  },
]);

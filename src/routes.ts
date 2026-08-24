import { createBrowserRouter } from "react-router";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/inventory/:slug",
    Component: ProductDetail,
  },
]);

import LegacyHomePage from "./components/landing/LegacyHomePage";
import ProductsPage from "./components/products/ProductsPage";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const currentView = params.get("view");

  if (currentView === "products") {
    return <ProductsPage />;
  }

  return <LegacyHomePage />;
}

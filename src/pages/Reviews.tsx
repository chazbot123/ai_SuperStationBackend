import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { usePageMeta } from "@/hooks/usePageMeta";

export function resolveReviewTabFromPath(pathname: string) {
  if (pathname.startsWith("/reviews/products")) {
    return "products";
  }

  return "materials";
}

export default function Reviews() {
  usePageMeta("审核中心");
  const location = useLocation();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>审核中心</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300">
          第一版统一审核中心只收口两类能力：素材审核和商品审核。
        </CardContent>
      </Card>

      {location.pathname === "/reviews" ? <Navigate to="/reviews/materials" replace /> : <Outlet />}
    </div>
  );
}

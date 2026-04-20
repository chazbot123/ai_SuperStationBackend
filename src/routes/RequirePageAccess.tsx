import { Navigate, useLocation } from "react-router-dom";
import type { PageKey, PermissionMatrix, RoleKey } from "@/types/demo";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import { hasPageAccess } from "@/store/permissions";

const pageToPath: Record<PageKey, string> = {
  dashboard: "/",
  studio: "/studio",
  publishing: "/publishing",
  products: "/products",
  assets: "/assets",
  videos: "/videos",
  support: "/support",
  personalization: "/personalization",
  agents: "/agents",
  rules: "/rules",
  reviews: "/reviews",
  rbac: "/rbac",
};

function pickFirstAllowedPath(matrix: PermissionMatrix, roleKey: RoleKey) {
  const order: PageKey[] = ["studio", "videos", "products", "dashboard", "assets", "publishing", "support", "agents", "reviews", "rules", "personalization", "rbac"];
  const first = order.find((k) => hasPageAccess(matrix, roleKey, k));
  return first ? pageToPath[first] : "/";
}

export default function RequirePageAccess(props: { pageKey: PageKey; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (hasPageAccess(matrix, user.roleKey, props.pageKey)) return <>{props.children}</>;

  const to = pickFirstAllowedPath(matrix, user.roleKey);
  return <Navigate to={to} replace />;
}

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
  customerManagement: "/customer-management",
  videos: "/videos",
  support: "/support",
  personalization: "/personalization",
  agents: "/agents",
  rules: "/rules",
  reviews: "/reviews",
  rbac: "/rbac",
};

function pickFirstAllowedPath(matrix: PermissionMatrix, roleKey: RoleKey) {
  const order: PageKey[] = [
    "studio",
    "videos",
    "products",
    "customerManagement",
    "dashboard",
    "assets",
    "publishing",
    "support",
    "agents",
    "reviews",
    "rules",
    "personalization",
    "rbac",
  ];
  const first = order.find((k) => hasPageAccess(matrix, roleKey, k));
  return first ? pageToPath[first] : "/";
}

export default function RequirePageAccess(props: { pageKey: PageKey; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const initialized = useRbacStore((s) => s.initialized);
  const loading = useRbacStore((s) => s.loading);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!initialized || loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
        正在加载页面权限...
      </div>
    );
  }
  if (!matrix[user.roleKey]) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        正在同步当前账号的页面权限，请稍后...
      </div>
    );
  }
  if (hasPageAccess(matrix, user.roleKey, props.pageKey)) return <>{props.children}</>;

  const to = pickFirstAllowedPath(matrix, user.roleKey);
  return <Navigate to={to} replace />;
}

import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { FolderOpen, Headset, LayoutDashboard, Palette, PenTool, Send, Shield, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import type { PageKey } from "@/types/demo";
import { useT } from "@/i18n/useT";

const navItems: { key: PageKey; label: string; to: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "仪表盘", to: "/", icon: LayoutDashboard },
  { key: "studio", label: "图片/文案生成", to: "/studio", icon: PenTool },
  { key: "publishing", label: "获客", to: "/publishing", icon: Send },
  { key: "support", label: "AI客服（后台）", to: "/support", icon: Headset },
  { key: "videos", label: "视频", to: "/videos", icon: Video },
  { key: "assets", label: "数字仓库", to: "/assets", icon: FolderOpen },
  { key: "rbac", label: "用户管理", to: "/rbac", icon: Shield },
  { key: "personalization", label: "界面设置", to: "/personalization", icon: Palette },
];

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const roleKey = user?.roleKey ?? "viewer";
  const t = useT();

  return (
    <aside className="hidden h-full w-[260px] shrink-0 border-r border-white/10 bg-black/20 backdrop-blur md:block">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 shadow-[0_10px_30px_rgba(245,158,11,0.22)]" />
        <div className="text-sm font-semibold text-zinc-100">{t("app.name")}</div>
      </div>

      <nav className="px-2 py-3">
        {navItems
          .filter((i) => matrix[roleKey]?.[i.key])
          .map((i) => {
            const Icon = i.icon;
            const label =
              i.key === "dashboard"
                ? t("page.dashboard")
                : i.key === "studio"
                ? t("page.studio")
                : i.key === "publishing"
                ? t("page.publishing")
                : i.key === "support"
                ? t("page.support")
                : i.key === "videos"
                ? t("page.videos")
                : i.key === "assets"
                ? t("page.assets")
                : i.key === "rbac"
                ? t("page.users")
                : i.key === "personalization"
                ? t("page.personalization")
                : i.label;
            return (
              <NavLink
                key={i.key}
                to={i.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-amber-500/10 text-amber-200"
                      : "text-zinc-200 hover:bg-white/10"
                  )
                }
                end={i.to === "/"}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            );
          })}
      </nav>
    </aside>
  );
}

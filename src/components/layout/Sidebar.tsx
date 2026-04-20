import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import {
  Bot,
  Boxes,
  Headset,
  LayoutDashboard,
  Package,
  Palette,
  PenTool,
  Send,
  Shield,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import type { PageKey } from "@/types/demo";

const navItems: { key: PageKey; label: string; to: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "仪表盘", to: "/", icon: LayoutDashboard },
  { key: "studio", label: "图片/文案生成", to: "/studio", icon: PenTool },
  { key: "videos", label: "视频生成", to: "/videos", icon: Video },
  { key: "products", label: "产品管理", to: "/products", icon: Package },
  { key: "reviews", label: "审核中心", to: "/reviews", icon: Shield },
  { key: "publishing", label: "获客内容池", to: "/publishing", icon: Send },
  { key: "personalization", label: "前台配置中心", to: "/personalization", icon: Palette },
  { key: "rules", label: "模型配置", to: "/rules", icon: SlidersHorizontal },
  { key: "assets", label: "知识库管理", to: "/assets", icon: Boxes },
  { key: "support", label: "AI客服/工单", to: "/support", icon: Headset },
  { key: "rbac", label: "用户/角色/权限", to: "/rbac", icon: Bot },
];

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const roleKey = user?.roleKey ?? "level1_agent";

  return (
    <aside className="hidden h-full w-[260px] shrink-0 border-r border-white/10 bg-[#020617] md:block">
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">AI 超级站后台</div>
          <div className="text-xs text-zinc-400">{roleKey === "main_company" ? "主公司" : "1级代理"}</div>
        </div>
      </div>

      <nav className="px-2 py-3">
        {navItems
          .filter((item) => matrix[roleKey]?.[item.key])
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-amber-500/10 text-amber-200" : "text-zinc-200 hover:bg-white/10"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
    </aside>
  );
}

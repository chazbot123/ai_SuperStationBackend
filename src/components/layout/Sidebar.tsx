import { useEffect, useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bot,
  Boxes,
  Building2,
  ChevronDown,
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
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useRbacStore } from "@/store/rbacStore";
import { useVideoDraftStore } from "@/store/videoDraftStore";
import type { PageKey } from "@/types/demo";

const navItems: {
  key: PageKey;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "dashboard", label: "仪表盘", to: "/", icon: LayoutDashboard },
  { key: "studio", label: "图片/文案生成", to: "/studio", icon: PenTool },
  { key: "videos", label: "视频生成", to: "/videos", icon: Video },
  { key: "products", label: "产品管理", to: "/products", icon: Package },
  { key: "agents", label: "代理管理", to: "/agents", icon: Building2 },
  { key: "reviews", label: "审核中心", to: "/reviews", icon: Shield },
  { key: "publishing", label: "获客内容池", to: "/publishing", icon: Send },
  { key: "personalization", label: "前台配置中心", to: "/personalization", icon: Palette },
  { key: "rules", label: "模型配置", to: "/rules", icon: SlidersHorizontal },
  { key: "assets", label: "知识库管理", to: "/assets", icon: Boxes },
  { key: "support", label: "AI客服/工单", to: "/support", icon: Headset },
  { key: "rbac", label: "用户/角色/权限", to: "/rbac", icon: Bot },
];

export default function Sidebar() {
  const location = useLocation();
  const [studioExpanded, setStudioExpanded] = useState(location.pathname.startsWith("/studio"));
  const [videosExpanded, setVideosExpanded] = useState(location.pathname.startsWith("/videos"));
  const [flyingDraft, setFlyingDraft] = useState<{
    id: string;
    emoji: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    active: boolean;
  } | null>(null);
  const user = useAuthStore((s) => s.user);
  const draftUnreadCount = useStudioDraftInboxStore((s) => s.unreadKeys.length);
  const videoDraftCount = useVideoDraftStore((s) => s.items.length);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const initialized = useRbacStore((s) => s.initialized);
  const loading = useRbacStore((s) => s.loading);
  const error = useRbacStore((s) => s.error);
  const roles = useRbacStore((s) => s.roles);
  const roleKey = user?.roleKey ?? "level1_agent";
  const roleName = roles.find((role) => role.key === roleKey)?.name ?? roleKey;
  const visibleItems = navItems.filter((item) => matrix[roleKey]?.[item.key]);
  const studioActive = location.pathname.startsWith("/studio");
  const videosActive = location.pathname.startsWith("/videos");

  useEffect(() => {
    if (studioActive) {
      setStudioExpanded(true);
    }
  }, [studioActive]);

  useEffect(() => {
    if (videosActive) {
      setVideosExpanded(true);
    }
  }, [videosActive]);

  useEffect(() => {
    function handleDraftFly(event: Event) {
      const detail = (event as CustomEvent<{ emoji: string; fromX: number; fromY: number }>).detail;
      if (!detail) {
        return;
      }
      setStudioExpanded(true);

      window.setTimeout(() => {
        const target = document.querySelector('[data-draft-inbox-target="studio-drafts"]');
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const rect = target.getBoundingClientRect();
        const nextId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setFlyingDraft({
          id: nextId,
          emoji: detail.emoji,
          fromX: detail.fromX,
          fromY: detail.fromY,
          toX: rect.left + rect.width / 2,
          toY: rect.top + rect.height / 2,
          active: false,
        });

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setFlyingDraft((prev) => (prev?.id === nextId ? { ...prev, active: true } : prev));
          });
        });

        window.setTimeout(() => {
          setFlyingDraft((prev) => (prev?.id === nextId ? null : prev));
        }, 1100);
      }, 220);
    }

    window.addEventListener("studio:draft-fly", handleDraftFly as EventListener);
    return () => {
      window.removeEventListener("studio:draft-fly", handleDraftFly as EventListener);
    };
  }, []);

  return (
    <aside className="hidden h-full w-[260px] shrink-0 border-r border-white/10 bg-[#020617] md:block">
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">AI 超级站后台</div>
          <div className="text-xs text-zinc-400">{roleName}</div>
        </div>
      </div>

      <nav className="px-2 py-3">
        {!initialized ? (
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
            正在加载功能菜单...
          </div>
        ) : null}
        {initialized && !loading && !matrix[roleKey] ? (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            正在同步账号权限...
          </div>
        ) : null}
        {initialized && !loading && !!error ? (
          <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            权限菜单加载失败，正在自动重试
          </div>
        ) : null}
        {initialized && !loading && visibleItems.length === 0 && !!matrix[roleKey] ? (
          <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
            当前账号暂无可访问菜单
          </div>
        ) : null}
        {visibleItems.map((item) => {
            const Icon = item.icon;
            const isStudioParent = item.key === "studio";
            const isVideosParent = item.key === "videos";
            return (
              <div key={item.key}>
                {isStudioParent || isVideosParent ? (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "mb-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        (isStudioParent ? studioActive : videosActive)
                          ? "bg-amber-500/10 text-amber-200"
                          : "text-zinc-200 hover:bg-white/10"
                      )}
                      onClick={() => {
                        if (isStudioParent) {
                          setStudioExpanded((prev) => !prev);
                          return;
                        }
                        setVideosExpanded((prev) => !prev);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (isStudioParent) {
                            setStudioExpanded((prev) => !prev);
                            return;
                          }
                          setVideosExpanded((prev) => !prev);
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </div>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200 ease-out",
                          (isStudioParent ? studioExpanded : videosExpanded) ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </div>

                    <div
                      className={cn(
                        "grid transition-all duration-200 ease-out",
                        (isStudioParent ? studioExpanded : videosExpanded)
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="mb-2 ml-6 space-y-1 border-l border-white/10 pl-3">
                          {isStudioParent ? (
                            <>
                              <SubNavItem
                                to="/studio/drafts"
                                label="草稿箱"
                                targetKey="studio-drafts"
                                badgeCount={draftUnreadCount}
                              />
                              <SubNavItem to="/studio/social" label="社媒图文生成" />
                              <SubNavItem to="/studio/product-images" label="商品图与详情图生成" />
                            </>
                          ) : (
                            <>
                              <SubNavItem to="/videos/drafts" label="草稿箱" badgeCount={videoDraftCount} />
                              <SubNavItem to="/videos/product-build" label="产品视频生成" />
                              <SubNavItem to="/videos/avatar-ads" label="真人口播视频生成" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <NavLink
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
                    <span className="flex-1 truncate">{item.label}</span>
                  </NavLink>
                )}
              </div>
            );
          })}
      </nav>

      {flyingDraft ? (
        <div
          className="pointer-events-none fixed z-[80] text-3xl drop-shadow-[0_0_12px_rgba(251,191,36,0.5)] transition-all duration-1000 ease-out"
          style={{
            left: flyingDraft.active ? flyingDraft.toX : flyingDraft.fromX,
            top: flyingDraft.active ? flyingDraft.toY : flyingDraft.fromY,
            transform: `translate(-50%, -50%) scale(${flyingDraft.active ? 0.55 : 1.35}) rotate(${flyingDraft.active ? "10deg" : "-8deg"})`,
            opacity: flyingDraft.active ? 0.08 : 1,
          }}
        >
          {flyingDraft.emoji}
        </div>
      ) : null}
    </aside>
  );
}

function SubNavItem(props: { to: string; label: string; targetKey?: string; badgeCount?: number }) {
  return (
    <NavLink
      to={props.to}
      data-draft-inbox-target={props.targetKey}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
          isActive ? "bg-amber-500/10 text-amber-200" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        )
      }
    >
      <span className="truncate">{props.label}</span>
      {props.badgeCount ? (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-5 text-white">
          {props.badgeCount > 99 ? "99+" : props.badgeCount}
        </span>
      ) : null}
    </NavLink>
  );
}

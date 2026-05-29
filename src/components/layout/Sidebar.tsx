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
import { navLabels } from "@/components/layout/navigationLabels";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useVideoDraftStore } from "@/store/videoDraftStore";
import type { PageKey } from "@/types/demo";

type NavItem = {
  key: PageKey;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  children?: Array<{
    label: string;
    to: string;
    end?: boolean;
    targetKey?: string;
    badgeCount?: number;
  }>;
};

export default function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const draftUnreadCount = useStudioDraftInboxStore((s) => s.unreadKeys.length);
  const videoDraftCount = useVideoDraftStore((s) => s.items.length);
  const matrix = useRbacStore((s) => s.permissionMatrix ?? {});
  const initialized = useRbacStore((s) => s.initialized);
  const loading = useRbacStore((s) => s.loading);
  const error = useRbacStore((s) => s.error);
  const roles = useRbacStore((s) => s.roles ?? []);
  const roleKey = user?.roleKey ?? "level1_agent";
  const roleName = roles.find((role) => role.key === roleKey)?.name ?? roleKey;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    studio: location.pathname.startsWith("/studio"),
    videos: location.pathname.startsWith("/videos"),
    publishing: location.pathname.startsWith("/publishing"),
    personalization: location.pathname.startsWith("/personalization"),
    reviews: location.pathname.startsWith("/reviews"),
    rbac: location.pathname.startsWith("/rbac"),
  });
  const [flyingDraft, setFlyingDraft] = useState<{
    id: string;
    emoji: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    active: boolean;
  } | null>(null);

  const navItems: NavItem[] = [
    { key: "dashboard", label: navLabels.dashboard, to: "/", icon: LayoutDashboard },
    {
      key: "studio",
      label: navLabels.studio,
      to: "/studio",
      icon: PenTool,
      children: [
        { to: "/studio/drafts", label: navLabels.studioDrafts, targetKey: "studio-drafts", badgeCount: draftUnreadCount },
        { to: "/studio/social", label: navLabels.studioSocial },
        { to: "/studio/product-images", label: navLabels.studioProductImages },
      ],
    },
    {
      key: "videos",
      label: navLabels.videos,
      to: "/videos",
      icon: Video,
      children: [
        { to: "/videos/drafts", label: navLabels.videosDrafts, badgeCount: videoDraftCount },
        { to: "/videos/product-build", label: navLabels.videosProductBuild },
        { to: "/videos/avatar-ads", label: navLabels.videosAvatarAds },
      ],
    },
    { key: "products", label: navLabels.products, to: "/products", icon: Package },
    {
      key: "reviews",
      label: navLabels.reviews,
      to: "/reviews",
      icon: Shield,
      children: [
        { to: "/reviews/materials", label: navLabels.reviewsMaterials },
        { to: "/reviews/products", label: navLabels.reviewsProducts },
      ],
    },
    {
      key: "publishing",
      label: navLabels.publishing,
      to: "/publishing",
      icon: Send,
      children: [
        { to: "/publishing/store-search", label: navLabels.publishingStoreSearch },
        { to: "/publishing/platform-login", label: navLabels.publishingPlatformLogin },
        { to: "/publishing", label: navLabels.publishingJobs, end: true },
      ],
    },
    {
      key: "personalization",
      label: navLabels.personalization,
      to: "/personalization",
      icon: Palette,
      children: [
        { to: "/personalization/layout", label: navLabels.personalizationLayout },
        { to: "/personalization/metrics", label: navLabels.personalizationMetrics },
        { to: "/personalization/industry", label: navLabels.personalizationIndustry },
      ],
    },
    { key: "rules", label: navLabels.rules, to: "/rules", icon: SlidersHorizontal },
    { key: "assets", label: navLabels.assets, to: "/assets", icon: Boxes },
    { key: "customerManagement", label: navLabels.customerManagement, to: "/customer-management", icon: Building2 },
    { key: "support", label: navLabels.support, to: "/support", icon: Headset },
    {
      key: "rbac",
      label: "账号管理",
      to: "/rbac",
      icon: Bot,
      children: [
        { to: "/rbac/users", label: navLabels.rbacUsers },
        { to: "/rbac/roles", label: navLabels.rbacRoles },
        { to: "/rbac/permissions", label: navLabels.rbacPermissions },
      ],
    },
  ];

  const visibleItems = navItems.filter((item) => matrix[roleKey]?.[item.key]);

  useEffect(() => {
    const keys = Object.keys(expandedGroups);
    const activeEntry = keys.find((key) => location.pathname.startsWith(`/${key}`));
    if (!activeEntry) {
      return;
    }

    setExpandedGroups((prev) => ({ ...prev, [activeEntry]: true }));
  }, [location.pathname]);

  useEffect(() => {
    function handleDraftFly(event: Event) {
      const detail = (event as CustomEvent<{ emoji: string; fromX: number; fromY: number }>).detail;
      if (!detail) {
        return;
      }

      setExpandedGroups((prev) => ({ ...prev, studio: true }));

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
    <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-[var(--shell-border)] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] transition-colors md:flex">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--shell-border)] px-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-300 to-amber-600" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--shell-fg)]">{navLabels.appTitle}</div>
          <div className="text-xs text-[var(--shell-muted)]">{roleName}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 custom-scrollbar">
        {!initialized ? <NoticeBox>{navLabels.loadingMenu}</NoticeBox> : null}
        {initialized && !loading && !matrix[roleKey] ? (
          <NoticeBox tone="amber">{navLabels.syncingPermissions}</NoticeBox>
        ) : null}
        {initialized && !loading && !!error ? (
          <NoticeBox tone="red">{navLabels.menuLoadFailed}</NoticeBox>
        ) : null}
        {initialized && !loading && visibleItems.length === 0 && !!matrix[roleKey] ? (
          <NoticeBox>{navLabels.noVisibleMenu}</NoticeBox>
        ) : null}

        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isGroup = Boolean(item.children?.length);
          const isActive = item.key === "dashboard" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          const isExpanded = expandedGroups[item.key] ?? false;

          if (!isGroup) {
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive: current }) =>
                  cn(
                    "mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    current ? "bg-amber-500/10 text-amber-200" : "text-zinc-200 hover:bg-white/10",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          }

          return (
            <div key={item.key}>
              <div
                className={cn(
                  "mb-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-amber-500/10 text-amber-200" : "text-zinc-200 hover:bg-white/10",
                )}
                onClick={() => setExpandedGroups((prev) => ({ ...prev, [item.key]: !isExpanded }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedGroups((prev) => ({ ...prev, [item.key]: !isExpanded }));
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200 ease-out",
                    isExpanded ? "rotate-180" : "rotate-0",
                  )}
                />
              </div>

              <div
                className={cn(
                  "grid transition-all duration-200 ease-out",
                  isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="mb-2 ml-6 space-y-1 border-l border-[var(--shell-border)] pl-3">
                    {item.children?.map((child) => (
                      <SubNavItem
                        key={child.to}
                        to={child.to}
                        label={child.label}
                        end={child.end}
                        targetKey={child.targetKey}
                        badgeCount={child.badgeCount}
                      />
                    ))}
                  </div>
                </div>
              </div>
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

function NoticeBox(props: { children: string; tone?: "default" | "amber" | "red" }) {
  const toneClass =
    props.tone === "amber"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
      : props.tone === "red"
        ? "border-red-500/20 bg-red-500/10 text-red-200"
        : "border-[var(--shell-border)] bg-[var(--panel-muted-bg)] text-[var(--shell-muted)]";

  return <div className={cn("mt-2 rounded-md border px-3 py-2 text-xs", toneClass)}>{props.children}</div>;
}

function SubNavItem(props: { to: string; label: string; end?: boolean; targetKey?: string; badgeCount?: number }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      data-draft-inbox-target={props.targetKey}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
          isActive ? "bg-amber-500/10 text-amber-200" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
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

import { LogOut, MoonStar, SunMedium } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveTopbarTitle, navLabels } from "@/components/layout/navigationLabels";
import Button from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";

export default function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const roles = useRbacStore((s) => s.roles);
  const resetRbac = useRbacStore((s) => s.reset);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const roleName = roles.find((r) => r.key === user?.roleKey)?.name ?? "";
  const title = resolveTopbarTitle(location.pathname);

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--shell-border)] bg-[var(--topbar-bg)] px-4 py-2 text-[var(--shell-fg)] shadow-[var(--topbar-shadow)] backdrop-blur transition-colors">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-[var(--shell-fg)]">{title}</div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-[var(--shell-fg)]">{user?.displayName ?? ""}</div>
          <div className="text-xs text-[var(--shell-muted)]">{roleName}</div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={toggleTheme}
          aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
          title={isDark ? "切换到浅色主题" : "切换到深色主题"}
          className="px-0"
        >
          {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await logout();
            resetRbac();
            navigate("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          {navLabels.logout}
        </Button>
      </div>
    </header>
  );
}

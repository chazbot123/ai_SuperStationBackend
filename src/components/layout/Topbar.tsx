import { LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import { useI18nStore } from "@/store/i18nStore";
import { useT } from "@/i18n/useT";

export default function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const roles = useRbacStore((s) => s.roles);
  const lang = useI18nStore((s) => s.lang);
  const toggleLang = useI18nStore((s) => s.toggle);
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const roleName = roles.find((r) => r.key === user?.roleKey)?.name ?? "";

  const title =
    location.pathname === "/"
      ? t("page.dashboard")
      : location.pathname.startsWith("/studio")
      ? t("page.studio")
      : location.pathname.startsWith("/publishing")
      ? t("page.publishing")
      : location.pathname.startsWith("/assets")
      ? t("page.assets")
      : location.pathname.startsWith("/videos")
      ? t("page.videos")
      : location.pathname.startsWith("/support")
      ? t("page.support")
      : location.pathname.startsWith("/personalization")
      ? t("page.personalization")
      : location.pathname.startsWith("/agents")
      ? t("page.agents")
      : location.pathname.startsWith("/rules") || location.pathname.startsWith("/keyword-rules")
      ? t("page.rules")
      : location.pathname.startsWith("/reviews") || location.pathname.startsWith("/keyword-reviews")
      ? t("page.reviews")
      : location.pathname.startsWith("/rbac")
      ? t("page.users")
      : t("app.name");

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/10 bg-black/20 px-4 backdrop-blur">
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleLang}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
          aria-label="language"
        >
          {lang === "zh-CN" ? t("topbar.lang.zh") : t("topbar.lang.en")}
        </button>
        <div className="text-right">
          <div className="text-sm font-medium text-zinc-100">{user?.displayName ?? ""}</div>
          <div className="text-xs text-zinc-400">{roleName}</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          {t("topbar.logout")}
        </Button>
      </div>
    </header>
  );
}

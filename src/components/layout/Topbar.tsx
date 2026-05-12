import { LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveTopbarTitle, navLabels } from "@/components/layout/navigationLabels";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";

export default function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const roles = useRbacStore((s) => s.roles);
  const resetRbac = useRbacStore((s) => s.reset);
  const navigate = useNavigate();
  const location = useLocation();

  const roleName = roles.find((r) => r.key === user?.roleKey)?.name ?? "";
  const title = resolveTopbarTitle(location.pathname);

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#020617]/95 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-zinc-100">{user?.displayName ?? ""}</div>
          <div className="text-xs text-zinc-400">{roleName}</div>
        </div>
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

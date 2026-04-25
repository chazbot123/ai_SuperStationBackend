import { LogOut } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChangePasswordModal from "@/components/account/ChangePasswordModal";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { useI18nStore } from "@/store/i18nStore";
import { useRbacStore } from "@/store/rbacStore";

function resolveTitle(pathname: string) {
  if (pathname === "/") return "仪表盘";
  if (pathname.startsWith("/studio/drafts")) return "草稿箱";
  if (pathname.startsWith("/studio/product-images")) return "商品图与详情图生成";
  if (pathname.startsWith("/studio/social")) return "社媒图文生成";
  if (pathname.startsWith("/studio")) return "图片/文案生成";
  if (pathname.startsWith("/publishing")) return "获客内容池";
  if (pathname.startsWith("/products") || pathname.startsWith("/special-offers")) return "产品管理";
  if (pathname.startsWith("/assets")) return "知识库管理";
  if (pathname.startsWith("/videos/product-build")) return "产品视频生成";
  if (pathname.startsWith("/videos/avatar-ads")) return "真人口播视频生成";
  if (pathname.startsWith("/videos")) return "视频生成";
  if (pathname.startsWith("/support")) return "AI客服 / 工单中心";
  if (pathname.startsWith("/personalization")) return "前台配置中心";
  if (pathname.startsWith("/rules")) return "模型配置";
  if (pathname.startsWith("/reviews")) return "审核中心";
  if (pathname.startsWith("/rbac")) return "用户 / 角色 / 权限";
  if (pathname.startsWith("/agents")) return "代理管理";
  return "AI 超级站后台";
}

export default function Topbar() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const roles = useRbacStore((s) => s.roles);
  const resetRbac = useRbacStore((s) => s.reset);
  const lang = useI18nStore((s) => s.lang);
  const toggleLang = useI18nStore((s) => s.toggle);
  const navigate = useNavigate();
  const location = useLocation();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const roleName = roles.find((r) => r.key === user?.roleKey)?.name ?? "";
  const title = resolveTitle(location.pathname);
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#020617]/95 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={toggleLang}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
          aria-label="language"
        >
          {lang === "zh-CN" ? "中 / EN" : "EN / 中"}
        </button>
        <div className="text-right">
          <div className="text-sm font-medium text-zinc-100">{user?.displayName ?? ""}</div>
          <div className="text-xs text-zinc-400">{roleName}</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPasswordModalOpen(true)}
          disabled={!user || !accessToken}
        >
          修改密码
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
          退出
        </Button>
      </div>
      <ChangePasswordModal
        open={passwordModalOpen}
        mode="self"
        accessToken={accessToken}
        targetLabel={user?.displayName ?? user?.username ?? "当前账号"}
        onClose={() => setPasswordModalOpen(false)}
        onSuccess={async () => {
          useAuthStore.setState({ user: null, accessToken: null });
          resetRbac();
          navigate("/login", { replace: true });
        }}
      />
    </header>
  );
}

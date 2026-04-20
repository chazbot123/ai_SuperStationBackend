import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import type { RoleKey } from "@/types/demo";

export default function Login() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const loginWithPreset = useAuthStore((s) => s.loginWithPreset);
  const roles = useRbacStore((s) => s.roles);
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("main@demo.local");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);

  const presetRoles = useMemo(
    () =>
      (["main_company", "level1_agent"] as RoleKey[]).map((key) => ({
        key,
        name: roles.find((r) => r.key === key)?.name ?? key,
      })),
    [roles]
  );

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [from, navigate, user]);

  if (user) return null;

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600" />
          <div>
            <div className="text-lg font-semibold text-zinc-100">AI 超级站后台</div>
            <div className="text-xs text-zinc-400">模板化后台 Demo · 主公司 / 1级代理</div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>登录后台</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const res = login(email, password);
                if (!res.ok) {
                  setError(res.message ?? "登录失败");
                  return;
                }
                setError(null);
                navigate(from, { replace: true });
              }}
            >
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">账号邮箱</div>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="main@demo.local" />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">密码</div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="任意非空即可" />
              </div>

              {error ? (
                <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
              ) : null}

              <Button type="submit" className="w-full">
                登录
              </Button>

              <div className="pt-3">
                <div className="mb-2 text-xs font-medium text-zinc-300">快速进入预设角色</div>
                <div className="grid grid-cols-2 gap-2">
                  {presetRoles.map((role) => (
                    <Button
                      key={role.key}
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        loginWithPreset(role.key);
                        navigate(from, { replace: true });
                      }}
                    >
                      {role.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="pt-2 text-xs text-zinc-400">
                预置账号：`main@demo.local`（主公司） / `a001@demo.local`（1级代理）
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import type { RoleKey } from "@/types/demo";
import { useI18nStore } from "@/store/i18nStore";
import { useT } from "@/i18n/useT";

export default function Login() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const toggleLang = useI18nStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const loginWithPreset = useAuthStore((s) => s.loginWithPreset);
  const roles = useRbacStore((s) => s.roles);
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);

  const presetRoles = useMemo(() => {
    const order: RoleKey[] = [
      "super_admin",
      "tenant_admin",
      "operator",
      "creator",
      "support",
      "agent_l1",
      "agent_l2",
      "viewer",
    ];
    return order
      .map((k) => ({
        key: k,
        name: roles.find((r) => r.key === k)?.name ?? k,
      }))
      .filter((r) => !!r.name);
  }, [roles]);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [from, navigate, user]);

  if (user) return null;

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 shadow-[0_12px_40px_rgba(245,158,11,0.25)]" />
          <div>
            <div className="text-lg font-semibold text-zinc-100">{t("app.name")}</div>
            <div className="text-xs text-zinc-400">{t("login.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={toggleLang}
            className="ml-auto rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
            aria-label="language"
          >
            {lang === "zh-CN" ? t("topbar.lang.zh") : t("topbar.lang.en")}
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.cardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const res = login(email, password);
                if (!res.ok) {
                  setError(res.message ?? t("login.error"));
                  return;
                }
                setError(null);
                navigate(from, { replace: true });
              }}
            >
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">{t("login.email")}</div>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@demo.local" />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">{t("login.password")}</div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="任意非空" />
              </div>

              {error ? (
                <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full">
                {t("login.submit")}
              </Button>

              <div className="pt-2">
                <div className="mb-2 text-xs font-medium text-zinc-300">{t("login.quick")}</div>
                <div className="grid grid-cols-2 gap-2">
                  {presetRoles.map((r) => (
                    <Button
                      key={r.key}
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        loginWithPreset(r.key);
                        navigate(from, { replace: true });
                      }}
                    >
                      {r.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="pt-2 text-xs text-zinc-400">
                {t("login.presetHint", {
                  list: "admin@demo.local / tenant@demo.local / ops@demo.local / creator@demo.local / support@demo.local / a001@demo.local / a2@demo.local / viewer@demo.local",
                })}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

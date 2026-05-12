import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";

export default function Login() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("demo_admin");
  const [password, setPassword] = useState("");
  const [agreedToUserAgreement, setAgreedToUserAgreement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [from, navigate, user]);

  if (user) return null;

  const handleLogin = async () => {
    if (!agreedToUserAgreement) {
      setError("请先勾选同意并阅读《用户协议》后再登录");
      return;
    }

    setSubmitting(true);
    const result = await login(username, password);
    setSubmitting(false);

    if (result.ok) {
      setError(null);
      navigate(from, { replace: true });
      return;
    }

    setError(result.message);
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600" />
          <div>
            <div className="text-lg font-semibold text-zinc-100">AI 超级站后台</div>
            <div className="text-xs text-zinc-400">真实后端认证 · 主公司 / 1级代理</div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>登录后台</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                await handleLogin();
              }}
            >
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">用户名</div>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入用户名"
                  disabled={submitting}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">密码</div>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  disabled={submitting}
                />
              </div>

              <label className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-orange-500"
                  checked={agreedToUserAgreement}
                  onChange={(event) => setAgreedToUserAgreement(event.target.checked)}
                  disabled={submitting}
                />
                <span>
                  我已阅读并同意
                  {" "}
                  <Link to="/user-agreement" className="text-orange-400 hover:text-orange-300 hover:underline">
                    《用户协议》
                  </Link>
                </span>
              </label>

              {error ? (
                <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
              ) : null}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "登录中..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

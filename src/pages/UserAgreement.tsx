import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import userAgreementMarkdown from "../../docs/user-agreement.md?raw";

export default function UserAgreement() {
  return (
    <div className="min-h-full bg-[#070f24] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-100">用户协议</div>
            <div className="text-xs text-zinc-400">登录前请完整阅读并确认同意</div>
          </div>
          <Link
            to="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-[6px] border border-zinc-500/70 px-4 text-sm text-zinc-100 transition-colors hover:border-orange-500/60 hover:bg-orange-500/15"
          >
            返回登录
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>AI超级站平台用户协议</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-zinc-200">
              {userAgreementMarkdown}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

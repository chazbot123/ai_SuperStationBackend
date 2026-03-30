import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useAuditStore } from "@/store/auditStore";

type TicketStatus = "open" | "in_progress" | "resolved";
type Ticket = {
  id: string;
  subject: string;
  userLabel: string;
  status: TicketStatus;
  contactMasked: string;
  updatedAt: string;
};

type MsgRole = "user" | "ai" | "agent";
type Msg = {
  id: string;
  role: MsgRole;
  text: string;
  time: string;
  confidence?: number;
};

const seed: Ticket[] = [
  {
    id: "t_3001",
    subject: "发布失败：提示参数不合法",
    userLabel: "u_1024",
    status: "open",
    contactMasked: "138****1234",
    updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "t_3000",
    subject: "如何绑定小红书账号？",
    userLabel: "u_1000",
    status: "in_progress",
    contactMasked: "a***@demo.local",
    updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
];

const seedThreads: Record<string, Msg[]> = {
  t_3001: [
    { id: "m1", role: "user", text: "我发布到抖音失败了，提示参数不合法，怎么处理？", time: new Date(Date.now() - 40 * 60 * 1000).toISOString() },
    { id: "m2", role: "ai", text: "建议检查标题/标签长度与敏感词；重新授权平台后重试。", time: new Date(Date.now() - 38 * 60 * 1000).toISOString(), confidence: 0.72 },
  ],
  t_3000: [
    { id: "m1", role: "user", text: "我想绑定小红书账号，要怎么做？", time: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
    { id: "m2", role: "ai", text: "在后台“获客”模块里点击平台绑定，按提示授权即可。", time: new Date(Date.now() - 6 * 60 * 60 * 1000 + 3 * 60 * 1000).toISOString(), confidence: 0.9 },
  ],
};

function badge(s: TicketStatus) {
  if (s === "open") return <Badge variant="amber">待处理</Badge>;
  if (s === "in_progress") return <Badge variant="blue">处理中</Badge>;
  return <Badge variant="green">已解决</Badge>;
}

export default function Support() {
  usePageMeta("AI客服（后台）");
  const user = useAuthStore((s) => s.user);
  const canReveal = user?.roleKey === "super_admin" || user?.roleKey === "tenant_admin";
  const record = useAuditStore((s) => s.record);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TicketStatus>("all");
  const [selectedId, setSelectedId] = useState(seed[0]?.id ?? "");
  const [reveal, setReveal] = useState(false);
  const [revealUntil, setRevealUntil] = useState<number | null>(null);
  const [threads, setThreads] = useState<Record<string, Msg[]>>(seedThreads);
  const [reply, setReply] = useState("");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return seed
      .filter((t) => (status === "all" ? true : t.status === status))
      .filter((t) => (s ? t.subject.toLowerCase().includes(s) || t.userLabel.toLowerCase().includes(s) : true));
  }, [q, status]);

  const selected = seed.find((t) => t.id === selectedId) ?? null;
  const thread = selected ? threads[selected.id] ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <Card className="md:col-span-4">
        <CardHeader>
          <CardTitle>工单列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索主题/用户" />
            <Select
              value={status}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all" || v === "open" || v === "in_progress" || v === "resolved") setStatus(v);
              }}
            >
              <option value="all">全部状态</option>
              <option value="open">待处理</option>
              <option value="in_progress">处理中</option>
              <option value="resolved">已解决</option>
            </Select>

            <div className="space-y-2">
              {list.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-zinc-400">
                  暂无工单
                </div>
              ) : (
                list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(t.id);
                      setReveal(false);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedId === t.id
                        ? "border-amber-400/30 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-zinc-100">{t.subject}</div>
                      <div className="shrink-0">{badge(t.status)}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">{t.userLabel} · 更新：{new Date(t.updatedAt).toLocaleString()}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>工单详情</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                转派（占位）
              </Button>
              <Button size="sm">标记解决（占位）</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="text-sm text-zinc-300">请选择左侧工单。</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">主题</div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.subject}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                  <div className="flex h-10 items-center">{badge(selected.status)}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">用户标识</div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.userLabel}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">联系方式</div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 flex-1 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-200">
                      {reveal ? "Demo：解密展示占位" : selected.contactMasked}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canReveal}
                      onClick={() => {
                        const next = !reveal;
                        setReveal(next);
                        if (next) {
                          record({
                            user,
                            action: "contact_reveal",
                            resourceType: "ticket",
                            resourceId: selected.id,
                            detail: "临时解密查看联系方式（Demo，占位10分钟时效）",
                          });
                          fetch("/api/support/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "contact_reveal", id: selected.id }) }).catch(() => {});
                          const until = Date.now() + 10 * 60 * 1000;
                          setRevealUntil(until);
                          setTimeout(() => {
                            setReveal(false);
                            setRevealUntil(null);
                          }, 10 * 1000);
                        } else {
                          setRevealUntil(null);
                        }
                      }}
                    >
                      {reveal ? "恢复脱敏" : "解密查看"}
                    </Button>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    仅授权角色可解密查看；已写入审计日志。{reveal && revealUntil ? "展示时限：Demo为10秒（实际可设10分钟）" : ""}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">对话记录</div>
                <div className="h-56 space-y-2 overflow-auto rounded-md border border-white/10 bg-white/5 p-3">
                  {thread.length === 0 ? (
                    <div className="py-10 text-center text-sm text-zinc-400">暂无对话</div>
                  ) : (
                    thread.map((m) => (
                      <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
                          m.role === "user"
                            ? "bg-white/10 text-zinc-100"
                            : m.role === "ai"
                            ? "bg-blue-500/10 text-blue-100"
                            : "bg-emerald-500/10 text-emerald-100"
                        }`}>
                          <div>{m.text}</div>
                          <div className="mt-1 text-xs opacity-70">
                            {new Date(m.time).toLocaleString()}
                            {m.role === "ai" && typeof m.confidence === "number" ? ` · 置信度 ${(m.confidence * 100).toFixed(0)}%` : ""}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-12">
                  <div className="md:col-span-9">
                    <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入人工回复…" />
                  </div>
                  <div className="md:col-span-3 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!selected) return;
                        const conf = 0.6 + Math.random() * 0.35;
                        const msg: Msg = {
                          id: `ai_${Date.now()}`,
                          role: "ai",
                          text: conf < 0.8 ? "我不太确定，建议转人工处理（Demo）。" : "建议：检查平台绑定、内容格式与敏感词后重试（Demo）。",
                          time: new Date().toISOString(),
                          confidence: conf,
                        };
                        setThreads((p) => ({ ...p, [selected.id]: [...(p[selected.id] ?? []), msg] }));
                      }}
                    >
                      AI回复
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selected) return;
                        const text = reply.trim();
                        if (!text) return;
                        const msg: Msg = { id: `a_${Date.now()}`, role: "agent", text, time: new Date().toISOString() };
                        setThreads((p) => ({ ...p, [selected.id]: [...(p[selected.id] ?? []), msg] }));
                        setReply("");
                      }}
                    >
                      发送
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuditStore } from "@/store/auditStore";
import { useAuthStore } from "@/store/authStore";

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
    {
      id: "m1",
      role: "user",
      text: "我发布到抖音失败了，提示参数不合法，怎么处理？",
      time: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    },
    {
      id: "m2",
      role: "ai",
      text: "建议先检查标题、标签和敏感词命中情况，再重新授权平台后重试。",
      time: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
      confidence: 0.72,
    },
  ],
  t_3000: [
    {
      id: "m1",
      role: "user",
      text: "我想绑定小红书账号，要怎么做？",
      time: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "m2",
      role: "ai",
      text: "可先进入获客内容池，点击发布平台绑定入口，再按浏览器授权流程完成登录。",
      time: new Date(Date.now() - 6 * 60 * 60 * 1000 + 3 * 60 * 1000).toISOString(),
      confidence: 0.9,
    },
  ],
};

function statusBadge(status: TicketStatus) {
  if (status === "open") return <Badge variant="amber">待处理</Badge>;
  if (status === "in_progress") return <Badge variant="blue">处理中</Badge>;
  return <Badge variant="green">已解决</Badge>;
}

export default function Support() {
  usePageMeta("AI客服 / 工单中心");

  const user = useAuthStore((s) => s.user);
  const canReveal = user?.roleKey === "main_company";
  const record = useAuditStore((s) => s.record);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TicketStatus>("all");
  const [selectedId, setSelectedId] = useState(seed[0]?.id ?? "");
  const [reveal, setReveal] = useState(false);
  const [revealUntil, setRevealUntil] = useState<number | null>(null);
  const [threads, setThreads] = useState<Record<string, Msg[]>>(seedThreads);
  const [reply, setReply] = useState("");

  const list = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return seed
      .filter((item) => (status === "all" ? true : item.status === status))
      .filter((item) => (keyword ? item.subject.toLowerCase().includes(keyword) || item.userLabel.toLowerCase().includes(keyword) : true));
  }, [q, status]);

  const selected = seed.find((item) => item.id === selectedId) ?? null;
  const thread = selected ? threads[selected.id] ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <Card className="md:col-span-4">
        <CardHeader>
          <CardTitle>工单列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索工单主题或用户" />
          <Select
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "all" || next === "open" || next === "in_progress" || next === "resolved") {
                setStatus(next);
              }
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
                当前筛选条件下暂无工单
              </div>
            ) : (
              list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setReveal(false);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === item.id ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-zinc-100">{item.subject}</div>
                    <div className="shrink-0">{statusBadge(item.status)}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {item.userLabel} · 更新于 {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>工单详情</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                转人工（占位）
              </Button>
              <Button size="sm">标记已解决（占位）</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="text-sm text-zinc-300">请选择左侧工单查看详情。</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="工单主题" value={selected.subject} />
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                  <div className="flex h-10 items-center">{statusBadge(selected.status)}</div>
                </div>
                <Field label="用户标识" value={selected.userLabel} />
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">联系方式</div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 flex-1 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-200">
                      {reveal ? "Demo：显示完整联系方式" : selected.contactMasked}
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
                            detail: "主公司在工单中心解密查看联系方式（Demo）。",
                          });
                          const until = Date.now() + 10 * 60 * 1000;
                          setRevealUntil(until);
                          window.setTimeout(() => {
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
                    仅主公司可解密查看，且操作会写入审计日志。
                    {reveal && revealUntil ? " 当前仅做 Demo 10 秒展示。" : ""}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">对话记录</div>
                <div className="h-56 space-y-2 overflow-auto rounded-md border border-white/10 bg-white/5 p-3">
                  {thread.length === 0 ? (
                    <div className="py-10 text-center text-sm text-zinc-400">暂无对话记录</div>
                  ) : (
                    thread.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === "user"
                              ? "bg-white/10 text-zinc-100"
                              : msg.role === "ai"
                              ? "bg-blue-500/10 text-blue-100"
                              : "bg-emerald-500/10 text-emerald-100"
                          }`}
                        >
                          <div>{msg.text}</div>
                          <div className="mt-1 text-xs opacity-70">
                            {new Date(msg.time).toLocaleString()}
                            {msg.role === "ai" && typeof msg.confidence === "number"
                              ? ` · 置信度 ${(msg.confidence * 100).toFixed(0)}%`
                              : ""}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                <div className="md:col-span-9">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入人工回复内容" />
                </div>
                <div className="md:col-span-3 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!selected) return;
                      const confidence = 0.6 + Math.random() * 0.35;
                      const msg: Msg = {
                        id: `ai_${Date.now()}`,
                        role: "ai",
                        text:
                          confidence < 0.8
                            ? "当前建议转人工继续跟进，避免给出不确定答复。"
                            : "建议先检查平台绑定、审核状态和发布参数，再尝试重新发布。",
                        time: new Date().toISOString(),
                        confidence,
                      };
                      setThreads((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), msg] }));
                    }}
                  >
                    AI建议
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selected) return;
                      const text = reply.trim();
                      if (!text) return;
                      const msg: Msg = { id: `a_${Date.now()}`, role: "agent", text, time: new Date().toISOString() };
                      setThreads((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), msg] }));
                      setReply("");
                    }}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-300">{props.label}</div>
      <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{props.value}</div>
    </div>
  );
}

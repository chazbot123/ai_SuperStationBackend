import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import {
  createOrResumeSupportSession,
  getPublicSupportQueueStatus,
  getPublicSupportSession,
  requestPublicSupportHandoff,
  sendPublicSupportMessage,
  type SupportConversationItem,
} from "@/lib/support";
import {
  getSupportMessageAlign,
  getSupportMessageBubbleClass,
  getSupportMessageRoleLabel,
  getSupportStatusLabel,
  getSupportStatusVariant,
} from "./supportViewModels";

function createDefaultVisitorSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `visitor_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SupportWorkbenchPanel() {
  const [visitorSessionId, setVisitorSessionId] = useState(createDefaultVisitorSessionId);
  const [visitorName, setVisitorName] = useState("开发测试访客");
  const [visitorContact, setVisitorContact] = useState("");
  const [sourcePage, setSourcePage] = useState("/demo/customer-service");
  const [conversation, setConversation] = useState<SupportConversationItem | null>(null);
  const [message, setMessage] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [queueNumber, setQueueNumber] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");

  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    if (!conversationId) return;
    if (conversation?.status !== "queueing" && conversation?.status !== "human_chat") return;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const [session, queue] = await Promise.all([
            getPublicSupportSession(conversationId),
            getPublicSupportQueueStatus(conversationId),
          ]);
          setConversation(session);
          setQueueNumber(queue.queueNumber);
        } catch (error) {
          setPageError(error instanceof Error ? error.message : "轮询测试台会话失败");
        }
      })();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [conversation?.status, conversationId]);

  const assignedAgentName = useMemo(
    () => conversation?.assignedAgent?.displayName || "暂无人工接线",
    [conversation?.assignedAgent?.displayName],
  );

  async function handleCreateOrResume() {
    try {
      setLoading(true);
      setPageError("");
      const result = await createOrResumeSupportSession({
        visitorSessionId,
        visitorName,
        visitorContact,
        sourcePage,
      });
      setConversation(result);
      setQueueNumber(0);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "创建测试会话失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!conversationId) return;
    const text = message.trim();
    if (!text) return;

    try {
      setSubmitting(true);
      setPageError("");
      const result = await sendPublicSupportMessage({
        conversationId,
        message: text,
      });
      setConversation(result);
      setMessage("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "发送测试消息失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestHandoff() {
    if (!conversationId) return;

    try {
      setSubmitting(true);
      setPageError("");
      const result = await requestPublicSupportHandoff({
        conversationId,
        note: handoffNote,
      });
      setConversation(result);
      setQueueNumber(result.queueNumber ?? 0);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "申请转人工失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetWorkbench() {
    setConversation(null);
    setMessage("");
    setHandoffNote("");
    setQueueNumber(0);
    setPageError("");
    setVisitorSessionId(createDefaultVisitorSessionId());
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-4">
        <CardHeader>
          <CardTitle>开发测试台</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="访客会话ID">
            <Input value={visitorSessionId} onChange={(e) => setVisitorSessionId(e.target.value)} />
          </Field>
          <Field label="访客昵称">
            <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} />
          </Field>
          <Field label="联系方式">
            <Input value={visitorContact} onChange={(e) => setVisitorContact(e.target.value)} placeholder="可选" />
          </Field>
          <Field label="来源页面">
            <Input value={sourcePage} onChange={(e) => setSourcePage(e.target.value)} />
          </Field>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleCreateOrResume} disabled={loading}>
              {loading ? "处理中..." : "创建/恢复会话"}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={handleResetWorkbench}>
              清空测试台
            </Button>
          </div>

          {conversation ? (
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
              <div className="flex items-center justify-between gap-2">
                <span>当前会话</span>
                <Badge variant={getSupportStatusVariant(conversation.status)}>
                  {getSupportStatusLabel(conversation.status)}
                </Badge>
              </div>
              <div className="mt-2 break-all text-xs text-zinc-400">{conversation.id}</div>
              <div className="mt-2 text-xs text-zinc-400">
                当前接线：{assignedAgentName}
                {queueNumber > 0 ? ` · 前方 ${queueNumber} 人` : ""}
              </div>
            </div>
          ) : null}

          {pageError ? <div className="text-sm text-red-300">{pageError}</div> : null}
        </CardContent>
      </Card>

      <Card className="xl:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>前台客服模拟</CardTitle>
            <Button
              size="sm"
              variant="secondary"
              disabled={!conversationId}
              onClick={async () => {
                if (!conversationId) return;
                try {
                  setPageError("");
                  const [session, queue] = await Promise.all([
                    getPublicSupportSession(conversationId),
                    getPublicSupportQueueStatus(conversationId),
                  ]);
                  setConversation(session);
                  setQueueNumber(queue.queueNumber);
                } catch (error) {
                  setPageError(error instanceof Error ? error.message : "刷新测试会话失败");
                }
              }}
            >
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[420px] space-y-3 overflow-auto rounded-md border border-white/10 bg-white/5 p-3">
            {!conversation ? (
              <div className="py-10 text-center text-sm text-zinc-400">请先创建测试会话。</div>
            ) : conversation.messages.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-400">当前暂无消息。</div>
            ) : (
              conversation.messages.map((item) => (
                <div key={item.id} className={`flex ${getSupportMessageAlign(item.role)}`}>
                  <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm ${getSupportMessageBubbleClass(item.role)}`}>
                    <div className="mb-1 text-xs font-medium opacity-75">{getSupportMessageRoleLabel(item.role)}</div>
                    <div className="whitespace-pre-wrap">{item.content}</div>
                    <div className="mt-2 text-xs opacity-70">
                      {new Date(item.createdAt).toLocaleString()}
                      {item.role === "ai" && typeof item.confidence === "number"
                        ? ` · 置信度 ${(item.confidence * 100).toFixed(0)}%`
                        : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="md:col-span-9">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="模拟前台访客发送消息"
                disabled={!conversationId || conversation?.status === "ended"}
              />
            </div>
            <div className="md:col-span-3">
              <Button
                className="w-full"
                onClick={handleSendMessage}
                disabled={!conversationId || !message.trim() || submitting || conversation?.status === "ended"}
              >
                发送消息
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="md:col-span-9">
              <Input
                value={handoffNote}
                onChange={(e) => setHandoffNote(e.target.value)}
                placeholder="转人工备注，可选"
                disabled={!conversationId || conversation?.status === "ended"}
              />
            </div>
            <div className="md:col-span-3">
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleRequestHandoff}
                disabled={!conversationId || submitting || conversation?.status === "queueing" || conversation?.status === "ended"}
              >
                申请转人工
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-300">{props.label}</div>
      {props.children}
    </div>
  );
}

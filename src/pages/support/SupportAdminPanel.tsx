import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  getSupportConversation,
  listSupportConversations,
  replySupportConversation,
  takeSupportConversation,
  closeSupportConversation,
  type SupportConversationItem,
  type SupportConversationStatus,
} from "@/lib/support";
import { useAuthStore } from "@/store/authStore";
import {
  getSupportMessageAlign,
  getSupportMessageBubbleClass,
  getSupportMessageRoleLabel,
  getSupportStatusLabel,
  getSupportStatusVariant,
} from "./supportViewModels";

type SupportStatusFilter = "all" | "pending_handoff" | SupportConversationStatus;

const STATUS_OPTIONS: Array<{ value: SupportStatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending_handoff", label: "人工待处理" },
  { value: "ai_chat", label: "AI托管中" },
  { value: "queueing", label: "排队中" },
  { value: "human_chat", label: "人工处理中" },
  { value: "ended", label: "已结束" },
];

export default function SupportAdminPanel() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportStatusFilter>("all");
  const [conversations, setConversations] = useState<SupportConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportConversationItem | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const pendingConversationIdsRef = useRef<string[]>([]);

  const loadList = useCallback(async (options?: { silent?: boolean }) => {
    if (!accessToken) {
      setConversations([]);
      return;
    }

    const silent = options?.silent ?? false;
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setPageError("");
      const result = await listSupportConversations({
        accessToken,
        q: search,
        status: status === "pending_handoff" ? "all" : status,
        onlyWaitingHandoff: status === "pending_handoff",
        page: 1,
        limit: 50,
      });
      setConversations(sortSupportConversations(result.items));
      setSelectedId((current) => {
        if (current && result.items.some((item) => item.id === current)) {
          return current;
        }
        return sortSupportConversations(result.items)[0]?.id ?? null;
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载 AI 客服会话失败");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [accessToken, search, status]);

  const loadDetail = useCallback(
    async (conversationId: string, options?: { silent?: boolean }) => {
      if (!accessToken) return;

      const silent = options?.silent ?? false;
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setDetailLoading(true);
        }
        setPageError("");
        const result = await getSupportConversation(accessToken, conversationId);
        setSelected(result);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "加载会话详情失败");
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setDetailLoading(false);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setInterval(() => {
      void loadList({ silent: true });
      if (selectedId) {
        void loadDetail(selectedId, { silent: true });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [accessToken, loadDetail, loadList, selectedId]);

  useEffect(() => {
    const waitingIds = conversations
      .filter((item) => item.status === "queueing" || item.status === "handoff_requested")
      .map((item) => item.id);
    const previousIds = pendingConversationIdsRef.current;
    const hasNewPending = previousIds.length > 0 && waitingIds.some((id) => !previousIds.includes(id));
    pendingConversationIdsRef.current = waitingIds;

    if (!hasNewPending) {
      return;
    }

    playPendingSupportTone();
  }, [conversations]);

  const selectedSummary = useMemo(() => {
    if (!selected) return null;
    return {
      visitorName: selected.visitorName?.trim() || "匿名访客",
      visitorContact: selected.visitorContact?.trim() || "未填写",
    };
  }, [selected]);

  async function handleTakeConversation() {
    if (!accessToken || !selected) return;
    try {
      setSubmitting(true);
      setPageError("");
      const result = await takeSupportConversation({
        accessToken,
        conversationId: selected.id,
      });
      setSelected(result);
      await loadList();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "人工接线失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReplyConversation() {
    if (!accessToken || !selected) return;
    const message = reply.trim();
    if (!message) return;

    try {
      setSubmitting(true);
      setPageError("");
      const result = await replySupportConversation({
        accessToken,
        conversationId: selected.id,
        message,
      });
      setSelected(result);
      setReply("");
      await loadList();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "发送人工回复失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseConversation() {
    if (!accessToken || !selected) return;
    try {
      setSubmitting(true);
      setPageError("");
      const result = await closeSupportConversation({
        accessToken,
        conversationId: selected.id,
      });
      setSelected(result);
      await loadList();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "结束会话失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>会话列表</CardTitle>
            <div className="flex items-center gap-2">
              {refreshing ? <span className="text-xs text-zinc-400">同步中...</span> : null}
              <Button size="sm" variant="secondary" onClick={() => void loadList()} disabled={loading}>
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索访客、联系方式或消息内容"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value as SupportStatusFilter)}>
            {STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          {pageError ? <div className="text-sm text-red-300">{pageError}</div> : null}
          <div className="space-y-2">
            {loading ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-zinc-400">
                正在加载会话...
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-zinc-400">
                当前暂无 AI 客服会话
              </div>
            ) : (
              conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selectedId === item.id ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">
                        {item.visitorName?.trim() || item.visitorSessionId}
                      </div>
                    </div>
                    <Badge variant={getSupportStatusVariant(item.status)}>{getSupportStatusLabel(item.status)}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-zinc-400">
                    最后消息 {new Date(item.lastMessageAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>客服后台</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleTakeConversation}
                disabled={!selected || submitting || selected.status === "human_chat" || selected.status === "ended"}
              >
                接线
              </Button>
              <Button
                size="sm"
                onClick={handleCloseConversation}
                disabled={!selected || submitting || selected.status === "ended"}
              >
                结束会话
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="text-sm text-zinc-300">请选择左侧会话查看详情。</div>
          ) : detailLoading ? (
            <div className="text-sm text-zinc-300">正在加载会话详情...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InfoField label="访客标识" value={selected.visitorSessionId} />
                <InfoField label="状态" value={getSupportStatusLabel(selected.status)} />
                <InfoField label="访客昵称" value={selectedSummary?.visitorName || "匿名访客"} />
                <InfoField label="联系方式" value={selectedSummary?.visitorContact || "未填写"} />
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-300">聊天记录</div>
                <div className="h-[420px] space-y-3 overflow-auto rounded-md border border-white/10 bg-white/5 p-3">
                  {selected.messages.length === 0 ? (
                    <div className="py-10 text-center text-sm text-zinc-400">暂无聊天记录</div>
                  ) : (
                    selected.messages.map((message) => (
                      <div key={message.id} className={`flex ${getSupportMessageAlign(message.role)}`}>
                        <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm ${getSupportMessageBubbleClass(message.role)}`}>
                          <div className="mb-1 text-xs font-medium opacity-75">
                            {getSupportMessageRoleLabel(message.role)}
                          </div>
                          <div className="whitespace-pre-wrap">{message.content}</div>
                          <div className="mt-2 text-xs opacity-70">
                            {new Date(message.createdAt).toLocaleString()}
                            {message.role === "ai" && typeof message.confidence === "number"
                              ? ` · 置信度 ${(message.confidence * 100).toFixed(0)}%`
                              : ""}
                          </div>
                          {message.role === "ai" && (message.sources?.length ?? 0) > 0 ? (
                            <div className="mt-2 space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <div className="text-xs font-medium text-zinc-300">AI 命中来源</div>
                              {message.sources?.map((source) => (
                                <div key={source.chunkId} className="text-xs text-zinc-300">
                                  <div className="font-medium text-zinc-200">
                                    {source.documentTitle} · {Math.max(0, Math.round(source.score * 100))}%
                                  </div>
                                  <div className="mt-1 text-zinc-400">{source.snippet}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                <div className="md:col-span-9">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="输入人工回复内容"
                    disabled={selected.status === "ended"}
                  />
                </div>
                <div className="md:col-span-3">
                  <Button
                    className="w-full"
                    onClick={handleReplyConversation}
                    disabled={!reply.trim() || submitting || selected.status === "ended"}
                  >
                    发送回复
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

function sortSupportConversations(items: SupportConversationItem[]) {
  return [...items].sort((a, b) => {
    const aWaiting = a.status === "queueing" || a.status === "handoff_requested";
    const bWaiting = b.status === "queueing" || b.status === "handoff_requested";
    if (aWaiting !== bWaiting) {
      return aWaiting ? -1 : 1;
    }

    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

function playPendingSupportTone() {
  if (typeof window === "undefined") return;

  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gainNode.gain.setValueAtTime(0.001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.onended = () => {
      void context.close().catch(() => undefined);
    };
  } catch {
    return;
  }
}

function InfoField(props: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-300">{props.label}</div>
      <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
        {props.value}
      </div>
    </div>
  );
}

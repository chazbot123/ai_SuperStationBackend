import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Mic } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import { toVideoDraftItem } from "@/lib/videoDraftMapper";
import {
  getAvatarVideoTaskStatus,
  getVideoTaskStatus,
  listVideoDrafts,
  markVideoDraftSynced,
  removeVideoDraft,
  retryAvatarVideoTask,
  submitVideoDraft,
  updateVideoDraft,
  type AvatarVideoTaskStatusResponse,
} from "@/lib/ai";
import { estimateAvatarEta, estimateProductEta, formatClock, formatMmSs } from "@/lib/videoEta";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useVideoDraftStore, type VideoDraftItem } from "@/store/videoDraftStore";

type SourceFilter = "all" | "product_video" | "avatar_video";

type ProgressInfo =
  | { kind: "determinate"; percent: number; label: string }
  | { kind: "indeterminate"; label: string };

const SCRIPT_PLACEHOLDER = [
  "镜头 1：开场抛出核心问题，快速建立传播钩子。",
  "镜头 2：解释产品卖点或内容重点，突出适用场景。",
  "镜头 3：补充细节或对比信息，强化可信感。",
  "镜头 4：结尾行动引导，鼓励咨询、了解或转化。",
].join("\n");

function platformLabel(value?: VideoDraftItem["platformStyle"]) {
  if (value === "xiaohongshu") return "小红书";
  if (value === "wechat_mp") return "视频号";
  if (value === "douyin") return "抖音";
  if (!value) return "";
  return value;
}

function sourceMeta(source: VideoDraftItem["source"]) {
  if (source === "product_video") {
    return {
      label: "产品视频生成",
      icon: <Clapperboard className="h-3.5 w-3.5" />,
    };
  }

  return {
    label: "真人口播视频生成",
    icon: <Mic className="h-3.5 w-3.5" />,
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function avatarProgressInfo(detail: AvatarVideoTaskStatusResponse): ProgressInfo {
  const total = Math.max(0, Number(detail.segmentCount) || 0);
  const done = Math.max(0, Number(detail.finishedCount) || 0);
  const percent = total > 0 ? clampPercent((done / total) * 100) : 0;
  return { kind: "determinate", percent, label: `分片 ${done}/${total}` };
}

function buildEtaSuffix(input: { elapsedMs: number; remainingMs: number | null; etaAtMs: number | null }) {
  const elapsed = `已用时 ${formatMmSs(input.elapsedMs)}`;
  if (!input.remainingMs || !input.etaAtMs) return elapsed;
  const remaining = `预计剩余 ~ ${formatMmSs(input.remainingMs)}`;
  const eta = `预计 ${formatClock(input.etaAtMs)}`;
  return `${elapsed} · ${remaining} · ${eta}`;
}

function normalizeAvatarErrorMessage(message: string) {
  return message
    .replace(/\s*\(trace_id:[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeAvatarFailures(detail: AvatarVideoTaskStatusResponse | null) {
  if (!detail) return [];
  const groups = new Map<string, { message: string; count: number; sequenceOrders: number[] }>();
  detail.segments
    .filter((segment) => segment.status === "failure")
    .forEach((segment) => {
      const message = normalizeAvatarErrorMessage(segment.errorMessage?.trim() || "未知错误");
      const current = groups.get(message) ?? { message, count: 0, sequenceOrders: [] };
      current.count += 1;
      current.sequenceOrders.push(segment.sequenceOrder + 1);
      groups.set(message, current);
    });

  return Array.from(groups.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.sequenceOrders[0] - b.sequenceOrders[0];
  });
}

export default function VideoDrafts() {
  usePageMeta("视频草稿箱");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const items = useVideoDraftStore((s) => s.items);
  const replaceItems = useVideoDraftStore((s) => s.replaceItems);
  const updateItem = useVideoDraftStore((s) => s.updateItem);
  const removeItem = useVideoDraftStore((s) => s.removeItem);
  const isAgent = user?.roleKey === "level1_agent";

  const [keyword, setKeyword] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [previewItem, setPreviewItem] = useState<VideoDraftItem | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [avatarDetail, setAvatarDetail] = useState<AvatarVideoTaskStatusResponse | null>(null);
  const [progressInfoById, setProgressInfoById] = useState<Record<string, ProgressInfo>>({});
  const [editTitle, setEditTitle] = useState("");
  const [editTag1, setEditTag1] = useState("");
  const [editTag2, setEditTag2] = useState("");
  const [editScript, setEditScript] = useState("");
  const avatarFailureSummary = useMemo(() => summarizeAvatarFailures(avatarDetail), [avatarDetail]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function hydrateDrafts() {
      try {
        const records = await listVideoDrafts(accessToken);
        if (cancelled) return;
        replaceItems(records.map(toVideoDraftItem));
      } catch {
        // Keep the local snapshot when the refresh fails.
      }
    }

    void hydrateDrafts();
    return () => {
      cancelled = true;
    };
  }, [accessToken, replaceItems]);

  async function persistItemPatch(id: string, patch: Partial<VideoDraftItem>) {
    updateItem(id, patch);
    if (!accessToken) {
      return;
    }
    const saved = await updateVideoDraft({
      accessToken,
      id,
      title: patch.title,
      platformStyle: patch.platformStyle,
      publishTitle: patch.publishTitle,
      publishTags: patch.publishTags,
      durationText: patch.durationText,
      generatedScript: patch.generatedScript,
      videoUrl: patch.videoUrl,
      taskId: patch.taskId,
      provider: patch.provider,
      model: patch.model,
      errorMessage: patch.errorMessage,
      status: patch.status,
      syncedToLeads: patch.syncedToLeads,
      completedAt: patch.completedAt,
    });
    updateItem(id, toVideoDraftItem(saved));
  }

  useEffect(() => {
    if (!previewItem) {
      setEditTitle("");
      setEditTag1("");
      setEditTag2("");
      setEditScript("");
      return;
    }
    const tags = (previewItem.publishTags ?? []).map((tag) => tag.trim()).filter(Boolean);
    setEditTitle(previewItem.publishTitle ?? previewItem.title);
    setEditTag1(tags[0] ?? "");
    setEditTag2(tags[1] ?? "");
    setEditScript(previewItem.generatedScript ?? "");
  }, [previewItem]);

  useEffect(() => {
    if (!accessToken) return;
    if (!previewItem) return;
    if (previewItem.source !== "avatar_video") {
      setAvatarDetail(null);
      return;
    }
    if (!previewItem.taskId) {
      setAvatarDetail(null);
      return;
    }

    let stopped = false;
    const taskId = previewItem.taskId;

    async function refreshOnce() {
      try {
        const result = await getAvatarVideoTaskStatus(accessToken, taskId);
        if (stopped) return;
        setAvatarDetail(result);
      } catch {
        if (stopped) return;
        setAvatarDetail(null);
      }
    }

    void refreshOnce();
    const timer = window.setInterval(() => {
      void refreshOnce();
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accessToken, previewItem]);

  useEffect(() => {
    if (!accessToken) return;
    const pending = items.filter((item) => item.status === "processing" && item.taskId);
    if (pending.length === 0) return;

    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      const nextPending = items.filter((item) => item.status === "processing" && item.taskId);
      if (nextPending.length === 0) return;

      const progressPatch: Record<string, ProgressInfo | null> = {};
      await Promise.all(
        nextPending.map(async (item) => {
          const taskId = item.taskId;
          if (!taskId) return;
          try {
            if (item.source === "avatar_video") {
              const result = await getAvatarVideoTaskStatus(accessToken, taskId);
              if (result.status === "completed" && result.finalVideoUrl) {
                progressPatch[item.id] = null;
                await persistItemPatch(item.id, {
                  status: "ready",
                  videoUrl: result.finalVideoUrl,
                  completedAt: new Date().toISOString(),
                });
                return;
              }
              if (result.status === "failed") {
                progressPatch[item.id] = null;
                await persistItemPatch(item.id, {
                  status: "failed",
                  errorMessage: result.errorMessage || "视频生成失败",
                  completedAt: new Date().toISOString(),
                });
                return;
              }
              const info = avatarProgressInfo(result);
              const eta = estimateAvatarEta({
                createdAt: item.createdAt,
                segmentCount: Number(result.segmentCount) || 0,
                finishedCount: Number(result.finishedCount) || 0,
              });
              progressPatch[item.id] = {
                ...info,
                label: `${info.label} · ${buildEtaSuffix(eta)}`,
              };
              return;
            }

            const result = await getVideoTaskStatus(accessToken, taskId);
            if (result.status === "success" && result.videoUrl) {
              progressPatch[item.id] = null;
              await persistItemPatch(item.id, {
                status: "ready",
                videoUrl: result.videoUrl,
                completedAt: new Date().toISOString(),
              });
              return;
            }
            if (result.status === "failed") {
              progressPatch[item.id] = null;
              await persistItemPatch(item.id, {
                status: "failed",
                errorMessage: result.errorMessage || "视频生成失败",
                completedAt: new Date().toISOString(),
              });
              return;
            }
            const eta = estimateProductEta({ items, item });
            progressPatch[item.id] = { kind: "indeterminate", label: `生成中... · ${buildEtaSuffix(eta)}` };
          } catch (error) {
            progressPatch[item.id] = null;
            await persistItemPatch(item.id, {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "视频任务查询失败",
              completedAt: new Date().toISOString(),
            });
          }
        })
      );

      setProgressInfoById((prev) => {
        const next = { ...prev };
        for (const [id, info] of Object.entries(progressPatch)) {
          if (!info) delete next[id];
          else next[id] = info;
        }
        return next;
      });
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accessToken, items, updateItem]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.title.toLowerCase().includes(normalizedKeyword) ||
        item.generatedScript.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [items, keyword, sourceFilter]);

  async function handleSubmitReview(item: VideoDraftItem) {
    if (!accessToken) {
      setHint("请先登录");
      return;
    }
    try {
      const updated = await submitVideoDraft(accessToken, item.id);
      updateItem(item.id, toVideoDraftItem(updated));
      setHint("已提交审核，等待主公司处理。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "提交审核失败");
    }
  }

  async function handleSyncToLeads(item: VideoDraftItem) {
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到获客。");
      return;
    }
    if (!accessToken) {
      setHint("请先登录");
      return;
    }

    try {
      const updated = await markVideoDraftSynced(accessToken, item.id);
      const content = addContent({
        type: "video",
        title: item.publishTitle || item.title,
        body: item.generatedScript,
        platformStyle: item.platformStyle || "douyin",
        images: [],
        videoUrl: item.videoUrl,
        syncedToLeads: true,
        reviewStatus: "approved",
      });
      markContentSynced(content.id);
      updateItem(item.id, toVideoDraftItem(updated));
      setHint("已同步到获客内容池。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "同步到获客失败");
    }
  }

  async function handleRemoveDraft(item: VideoDraftItem) {
    if (!accessToken) {
      setHint("请先登录");
      return;
    }
    const confirmed = window.confirm("确定要删除这条视频草稿吗？删除后无法恢复。");
    if (!confirmed) {
      return;
    }

    try {
      await removeVideoDraft(accessToken, item.id);
      removeItem(item.id);
      if (previewItem?.id === item.id) {
        setPreviewItem(null);
      }
      setHint("已删除草稿。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "删除失败");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">视频草稿箱</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                统一聚合 `产品视频生成` 和 `真人口播视频生成` 的结果。
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题或脚本"
              />
              <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                <option value="all">全部草稿</option>
                <option value="product_video">产品视频生成</option>
                <option value="avatar_video">真人口播视频生成</option>
              </Select>
            </div>
          </div>
          {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-zinc-500">
                暂无视频草稿结果
              </div>
            ) : (
              filteredItems.map((item) => {
                const meta = sourceMeta(item.source);
                const progress = progressInfoById[item.id];
                return (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:max-w-[520px]">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          {meta.icon}
                          <span>{meta.label}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-zinc-100">{item.publishTitle || item.title}</div>
                        {item.platformStyle || item.publishTags ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {item.platformStyle ? <Badge variant="blue">{platformLabel(item.platformStyle)}</Badge> : null}
                            {item.publishTags ? item.publishTags.filter(Boolean).map((tag) => (
                              <Badge key={tag} variant="gray">#{tag}</Badge>
                            )) : null}
                          </div>
                        ) : null}
                        <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{item.generatedScript}</div>
                        {item.status === "processing" ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[11px] text-zinc-500">
                              <span>{progress?.label || "生成中..."}</span>
                              {progress?.kind === "determinate" ? (
                                <span>{progress.percent}%</span>
                              ) : null}
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                              {progress?.kind === "determinate" ? (
                                <div
                                  className="h-full bg-orange-500 transition-[width] duration-300"
                                  style={{ width: `${progress.percent}%` }}
                                />
                              ) : (
                                <div className="h-full w-full animate-pulse bg-gradient-to-r from-orange-500/20 via-orange-500/70 to-orange-500/20" />
                              )}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleString()} · 时长 {item.durationText}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewItem(item)}>
                          编辑
                        </Button>
                        {isAgent && item.reviewStage === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleSubmitReview(item)}>
                            提交审核
                          </Button>
                        ) : null}
                        {item.reviewStage === "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSyncToLeads(item)}
                            disabled={item.syncedToLeads}
                            className={item.syncedToLeads ? "hidden" : undefined}
                          >
                            {item.syncedToLeads ? "已同步获客" : "同步到获客"}
                          </Button>
                        ) : null}
                        {item.reviewStage === "submitted" ? <Badge variant="amber">待审核</Badge> : null}
                        {item.reviewStage === "approved" ? <Badge variant="green">审核通过</Badge> : null}
                        {item.syncedToLeads ? <Badge variant="blue">已同步获客</Badge> : null}
                        <Badge
                          variant={
                            item.status === "ready" ? "green" : item.status === "failed" ? "red" : "amber"
                          }
                        >
                          {item.status === "ready" ? "可用" : item.status === "failed" ? "失败" : "处理中"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Modal
        open={!!previewItem}
        title="草稿编辑"
        onClose={() => setPreviewItem(null)}
        footer={
          previewItem ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (previewItem) {
                    void handleRemoveDraft(previewItem);
                  }
                }}
              >
                删除
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const title = editTitle.trim();
                  const tags = [editTag1.trim(), editTag2.trim()].filter(Boolean);
                  const patch: Partial<VideoDraftItem> = {
                    publishTitle: title ? title : undefined,
                    publishTags: tags.length > 0 ? tags : undefined,
                    generatedScript: editScript,
                  };
                  if (!accessToken) {
                    setHint("请先登录");
                    return;
                  }
                  void updateVideoDraft({
                    accessToken,
                    id: previewItem.id,
                    publishTitle: patch.publishTitle,
                    publishTags: patch.publishTags,
                    generatedScript: patch.generatedScript,
                  })
                    .then((saved) => {
                      const mapped = toVideoDraftItem(saved);
                      updateItem(previewItem.id, mapped);
                      setPreviewItem(mapped);
                      setHint("已保存编辑内容。");
                    })
                    .catch((error) => {
                      setHint(error instanceof Error ? error.message : "保存失败");
                    });
                }}
              >
                保存
              </Button>
            </div>
          ) : null
        }
      >
        {previewItem ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {previewItem.platformStyle ? <Badge variant="blue">{platformLabel(previewItem.platformStyle)}</Badge> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">标签</span>
                {[editTag1, editTag2].map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <Badge key={tag} variant="gray">#{tag}</Badge>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Input value={editTag1} onChange={(e) => setEditTag1(e.target.value)} placeholder="标签 1" />
                <Input value={editTag2} onChange={(e) => setEditTag2(e.target.value)} placeholder="标签 2" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-zinc-400">标题</div>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="请输入标题" />
              <div className="text-xs text-zinc-500">
                {new Date(previewItem.createdAt).toLocaleString()} · 时长 {previewItem.durationText}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-zinc-400">视频</div>
              {previewItem.status === "ready" && previewItem.videoUrl ? (
                <video controls src={previewItem.videoUrl} className="h-72 w-full rounded-xl bg-black object-contain" />
              ) : previewItem.status === "failed" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                    {previewItem.errorMessage || "视频生成失败"}
                  </div>
                  {previewItem.source === "avatar_video" && avatarDetail ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                      <div className="text-xs text-zinc-400">失败片段</div>
                      {avatarFailureSummary.length > 0 ? (
                        <div className="mt-2 rounded-lg border border-red-400/20 bg-red-500/5 p-3">
                          <div className="text-xs font-medium text-red-200">
                            失败原因汇总 · 共 {avatarDetail.failedCount} 段失败
                          </div>
                          <div className="mt-2 space-y-2">
                            {avatarFailureSummary.map((item) => (
                              <div key={`${item.message}-${item.sequenceOrders[0] ?? 0}`} className="text-xs text-zinc-300">
                                <div>{item.count} 段：{item.message}</div>
                                <div className="mt-1 text-zinc-500">分片：第 {item.sequenceOrders.join("、")} 段</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 space-y-2">
                        {avatarDetail.segments
                          .filter((segment) => segment.status === "failure")
                          .map((segment) => (
                            <div key={segment.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                              <div className="text-zinc-200">
                                第 {segment.sequenceOrder + 1} 段 · 尝试 {segment.attempts}/{segment.maxAttempts}
                                {segment.attempts >= segment.maxAttempts ? "（已达最大重试次数）" : ""}
                              </div>
                              {segment.errorMessage ? (
                                <div className="mt-1 text-zinc-400">{segment.errorMessage}</div>
                              ) : null}
                            </div>
                          ))}
                        {avatarDetail.segments.filter((segment) => segment.status === "failure").length === 0 ? (
                          <div className="text-xs text-zinc-500">暂无失败片段详情</div>
                        ) : null}
                        {avatarDetail.segments.filter((segment) => segment.status === "failure").length > 0 ? (
                          <div className="text-xs text-zinc-500">
                            可重试{" "}
                            {
                              avatarDetail.segments.filter(
                                (segment) => segment.status === "failure" && segment.attempts < segment.maxAttempts
                              ).length
                            }{" "}
                            段 · 已达上限{" "}
                            {
                              avatarDetail.segments.filter(
                                (segment) => segment.status === "failure" && segment.attempts >= segment.maxAttempts
                              ).length
                            }{" "}
                            段
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {previewItem.source === "avatar_video" && previewItem.taskId && accessToken ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!!avatarDetail && avatarDetail.segments.filter((segment) => segment.status === "failure").length === 0}
                        onClick={async () => {
                          try {
                            const result = await retryAvatarVideoTask(accessToken, previewItem.taskId as string);
                            if (!result.resetCount) {
                              setHint("没有失败片段可重试。");
                              return;
                            }
                            await persistItemPatch(previewItem.id, { status: "processing", errorMessage: undefined });
                            setPreviewItem({ ...previewItem, status: "processing", errorMessage: undefined });
                            setHint("已触发失败分片重试，任务继续推进中。");
                          } catch (error) {
                            setHint(error instanceof Error ? error.message : "重试失败");
                          }
                        }}
                      >
                        仅重试失败分片
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div>视频生成中…</div>
                      {previewItem.taskId ? <div className="mt-1 text-xs text-zinc-500">taskId：{previewItem.taskId}</div> : null}
                      {previewItem.provider || previewItem.model ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          {previewItem.provider ? <span>{previewItem.provider}</span> : null}
                          {previewItem.model ? <span>{previewItem.provider ? " · " : ""}{previewItem.model}</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="amber">处理中</Badge>
                  </div>
                  {previewItem.source === "avatar_video" && avatarDetail ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                        <span>
                          分片进度 {avatarDetail.finishedCount}/{avatarDetail.segmentCount} · 失败 {avatarDetail.failedCount}
                        </span>
                      </div>
                      {avatarFailureSummary.length > 0 ? (
                        <div className="rounded-lg border border-red-400/20 bg-red-500/5 p-3">
                          <div className="text-xs font-medium text-red-200">
                            失败原因汇总 · 共 {avatarDetail.failedCount} 段失败
                          </div>
                          <div className="mt-2 space-y-2">
                            {avatarFailureSummary.map((item) => (
                              <div key={`${item.message}-${item.sequenceOrders[0] ?? 0}`} className="text-xs text-zinc-300">
                                <div>{item.count} 段：{item.message}</div>
                                <div className="mt-1 text-zinc-500">分片：第 {item.sequenceOrders.join("、")} 段</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        {avatarDetail.segments
                          .filter((segment) => segment.status !== "success")
                          .slice(0, 8)
                          .map((segment) => (
                            <div key={segment.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-zinc-200">
                                  第 {segment.sequenceOrder + 1} 段 · 尝试 {segment.attempts}/{segment.maxAttempts}
                                </div>
                                <Badge
                                  variant={
                                    segment.status === "failure" ? "red" : segment.status === "pending" ? "gray" : "amber"
                                  }
                                >
                                  {segment.status === "pending"
                                    ? "待提交"
                                    : segment.status === "submitted"
                                      ? "已提交"
                                      : segment.status === "processing"
                                        ? "生成中"
                                        : segment.status === "failure"
                                          ? "失败"
                                          : segment.status}
                                </Badge>
                              </div>
                              {segment.retryAt ? (
                                <div className="mt-1 text-zinc-400">下次重试：{new Date(segment.retryAt).toLocaleString()}</div>
                              ) : null}
                              {segment.errorMessage ? (
                                <div className="mt-1 text-zinc-400">{segment.errorMessage}</div>
                              ) : null}
                            </div>
                          ))}
                        {avatarDetail.segments.filter((segment) => segment.status !== "success").length === 0 ? (
                          <div className="text-xs text-zinc-500">正在合成最终视频…</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-zinc-400">文案内容</div>
              <textarea
                className="min-h-[180px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                value={editScript}
                onChange={(e) => setEditScript(e.target.value)}
                placeholder={SCRIPT_PLACEHOLDER}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { FileImage, LayoutTemplate, Layers3 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  listSocialPosts,
  markSocialPostSynced,
  submitSocialPost,
  type SocialPostItem,
} from "@/lib/ai";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useStudioDraftTaskStore } from "@/store/studioDraftTaskStore";
import { useStudioProductDraftStore } from "@/store/studioProductDraftStore";

type DraftItem = {
  id: string;
  rawId: string;
  source: "social" | "product";
  title: string;
  body: string;
  createdAt: string;
  images: string[];
  style?: "xiaohongshu" | "douyin" | "wechat";
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  reviewStage: "draft" | "submitted" | "approved";
  syncedToLeads: boolean;
  syncedToProducts: boolean;
  route: string;
};

type SourceFilter = "all" | "social" | "product";

function sourceMeta(source: DraftItem["source"]) {
  if (source === "social") {
    return {
      icon: <LayoutTemplate className="h-4 w-4 text-amber-300" />,
      label: "社媒图文生成",
      routeLabel: "进入社媒图文生成",
    };
  }

  return {
    icon: <FileImage className="h-4 w-4 text-amber-300" />,
    label: "商品图与详情图生成",
    routeLabel: "进入商品图与详情图生成",
  };
}

export default function StudioDrafts() {
  usePageMeta("草稿箱");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const productDrafts = useStudioProductDraftStore((s) => s.items);
  const updateProductDraft = useStudioProductDraftStore((s) => s.updateItem);
  const markDraftViewed = useStudioDraftInboxStore((s) => s.markViewed);
  const runningTasks = useStudioDraftTaskStore((s) => s.tasks);
  const [socialDrafts, setSocialDrafts] = useState<SocialPostItem[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hint, setHint] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<DraftItem | null>(null);
  const isAgent = user?.roleKey === "level1_agent";

  useEffect(() => {
    if (!accessToken) {
      setSocialDrafts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const items = await listSocialPosts(accessToken);
        if (!cancelled) {
          setSocialDrafts(items);
        }
      } catch (error) {
        if (!cancelled) {
          setHint(error instanceof Error ? error.message : "加载草稿箱失败");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const draftItems = useMemo(() => {
    const socialItems: DraftItem[] = socialDrafts.map((item) => ({
      id: `social_${item.id}`,
      rawId: item.id,
      source: "social",
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      images: item.images,
      style: item.style,
      sizePreset: item.sizePreset,
      reviewStage: item.reviewStage,
      syncedToLeads: item.synced,
      syncedToProducts: false,
      route: "/studio/social",
    }));

    const productItems: DraftItem[] = productDrafts.map((item) => ({
      id: `product_${item.id}`,
      rawId: item.id,
      source: "product",
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      images: item.images,
      sizePreset: item.sizePreset,
      reviewStage: item.reviewStage,
      syncedToLeads: item.syncedToLeads,
      syncedToProducts: item.syncedToProducts,
      route: "/studio/product-images",
    }));

    return [...socialItems, ...productItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [productDrafts, socialDrafts]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return draftItems.filter((item) => {
      const sourceMatched = sourceFilter === "all" || item.source === sourceFilter;
      if (!sourceMatched) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return item.title.toLowerCase().includes(normalized) || item.body.toLowerCase().includes(normalized);
    });
  }, [draftItems, query, sourceFilter]);

  const filteredRunningTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return runningTasks.filter((task) => {
      if (task.stage === "failed") {
        return false;
      }
      const sourceMatched = sourceFilter === "all" || task.source === sourceFilter;
      if (!sourceMatched) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        task.title.toLowerCase().includes(normalized) ||
        task.label.toLowerCase().includes(normalized) ||
        (task.errorMessage?.toLowerCase().includes(normalized) ?? false)
      );
    });
  }, [query, runningTasks, sourceFilter]);

  function openPreview(item: DraftItem) {
    markDraftViewed(item.source, item.rawId);
    setPreviewItem(item);
  }

  async function handleSubmitReview(item: DraftItem) {
    if (item.source === "social") {
      if (!accessToken) return;
      try {
        const next = await submitSocialPost(accessToken, item.rawId);
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setPreviewItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: next.reviewStage } : prev));
        setHint("已提交审核，等待主公司处理。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "提交审核失败");
      }
      return;
    }

    updateProductDraft(item.rawId, { reviewStage: "submitted" });
    setPreviewItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: "submitted" } : prev));
    setHint("已提交审核，等待主公司处理。");
  }

  async function handleSyncToLeads(item: DraftItem) {
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到获客。");
      return;
    }

    if (item.source === "social") {
      if (!accessToken) return;
      try {
        const next = await markSocialPostSynced(accessToken, item.rawId);
        const content = addContent({
          type: "copy",
          title: item.title,
          body: item.body,
          platformStyle: item.style === "douyin" ? "douyin" : item.style === "wechat" ? "wechat_mp" : "xiaohongshu",
          images: item.images,
          syncedToLeads: true,
          reviewStatus: "approved",
        });
        markContentSynced(content.id);
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setPreviewItem((prev) => (prev?.id === item.id ? { ...prev, syncedToLeads: true } : prev));
        setHint("已同步到获客内容池。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "同步获客失败");
      }
      return;
    }

    const content = addContent({
      type: "copy",
      title: item.title,
      body: item.body,
      platformStyle: "super_site",
      images: item.images,
      syncedToLeads: true,
      reviewStatus: "approved",
    });
    markContentSynced(content.id);
    updateProductDraft(item.rawId, { syncedToLeads: true });
    setPreviewItem((prev) => (prev?.id === item.id ? { ...prev, syncedToLeads: true } : prev));
    setHint("已同步到获客内容池。");
  }

  function handleSyncToProducts(item: DraftItem) {
    if (item.source !== "product") return;
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到产品管理。");
      return;
    }

    addContent({
      type: "product",
      title: item.title,
      body: item.body,
      platformStyle: "super_site",
      images: item.images,
      reviewStatus: "approved",
    });
    updateProductDraft(item.rawId, { syncedToProducts: true });
    setPreviewItem((prev) => (prev?.id === item.id ? { ...prev, syncedToProducts: true } : prev));
    setHint("已同步到产品管理。");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="h-4 w-4 text-amber-300" />
                草稿箱
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                汇总社媒图文生成与商品图与详情图生成的结果，方便统一查看当前草稿。
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-col gap-2 md:w-80">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或正文" />
            </div>
            <div className="w-full md:w-56">
              <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                <option value="all">全部草稿</option>
                <option value="social">社媒图文生成</option>
                <option value="product">商品图与详情图生成</option>
              </Select>
            </div>
          </div>

          {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}

          <div className="space-y-2">
            <div className="text-sm font-medium text-zinc-100">正在执行的任务</div>
            {filteredRunningTasks.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-zinc-500">
                当前没有执行中的任务
              </div>
            ) : (
              filteredRunningTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-3"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        {task.source === "social" ? "社媒图文生成" : "商品图与详情图生成"}
                        {task.stage === "failed" ? <Badge variant="red">失败</Badge> : <Badge variant="amber">执行中</Badge>}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-zinc-100">{task.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">{task.label}</div>
                    </div>
                    <div className="w-full max-w-xs">
                      <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                        <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                        <span>{task.progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={task.stage === "failed" ? "h-full rounded-full bg-rose-400" : "h-full rounded-full bg-amber-400 transition-all duration-500"}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-zinc-500">
                暂无草稿结果
              </div>
            ) : (
              filteredItems.map((item) => {
                const meta = sourceMeta(item.source);
                return (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:max-w-[460px] xl:max-w-[520px]">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          {meta.icon}
                          <span>{meta.label}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-zinc-100">{item.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{item.body}</div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleString()} · 图片 {item.images.length} 张
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => openPreview(item)}>
                          预览
                        </Button>
                        {isAgent && item.reviewStage === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => void handleSubmitReview(item)}>
                            提交审核
                          </Button>
                        ) : null}
                        {item.reviewStage === "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSyncToLeads(item)}
                            disabled={item.syncedToLeads}
                          >
                            {item.syncedToLeads ? "已同步获客" : "同步到获客"}
                          </Button>
                        ) : null}
                        {item.source === "product" && item.reviewStage === "approved" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSyncToProducts(item)}
                            disabled={item.syncedToProducts}
                          >
                            {item.syncedToProducts ? "已同步产品" : "同步到产品管理"}
                          </Button>
                        ) : null}
                        {item.reviewStage === "submitted" ? <Badge variant="amber">待审核</Badge> : null}
                        {item.reviewStage === "approved" ? <Badge variant="green">审核通过</Badge> : null}
                        {item.syncedToLeads ? <Badge variant="blue">已同步获客</Badge> : null}
                        {item.syncedToProducts ? <Badge variant="blue">已同步产品</Badge> : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Modal open={!!previewItem} title="草稿预览" onClose={() => setPreviewItem(null)}>
        {previewItem ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-zinc-100">{previewItem.title}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {new Date(previewItem.createdAt).toLocaleString()} · 图片 {previewItem.images.length} 张
              </div>
            </div>
            <div className="whitespace-pre-line text-sm text-zinc-300">{previewItem.body}</div>
            <div className="grid grid-cols-2 gap-3">
              {previewItem.images.map((image, index) => (
                <div key={`${previewItem.id}_${index}`} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <img src={image} alt={`${previewItem.title}_${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

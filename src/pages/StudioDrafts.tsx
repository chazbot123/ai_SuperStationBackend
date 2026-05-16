import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileImage, LayoutTemplate, Layers3, Upload } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  createProductImageDraft,
  listSocialPosts,
  listProductImageDrafts,
  markSocialPostSynced,
  markProductImageDraftProductSynced,
  markProductImageDraftSynced,
  removeSocialPost,
  removeProductImageDraft,
  submitSocialPost,
  submitProductImageDraft,
  withdrawSocialPostReview,
  withdrawProductImageDraftReview,
  type SocialPostItem,
  type ProductImageDraftItem,
  updateSocialPost,
  updateProductImageDraft,
  uploadDraftImage,
} from "@/lib/ai";
import { syncPublishingContent, type LeadPlatformStyle } from "@/lib/publishing";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useProductsStore } from "@/store/productsStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useStudioDraftTaskStore } from "@/store/studioDraftTaskStore";

type DraftItem = {
  id: string;
  rawId: string;
  source: "social" | "product";
  prompt: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  images: string[];
  downloadableImages: boolean[];
  style?: "xiaohongshu" | "douyin" | "wechat";
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  reviewStage: "draft" | "submitted" | "approved";
  syncedToLeads: boolean;
  syncedToProducts: boolean;
  route: string;
};

type SourceFilter = "all" | "social" | "product";

function reviewStageMeta(stage: DraftItem["reviewStage"]) {
  if (stage === "submitted") return { label: "当前状态：待审核", variant: "amber" as const };
  if (stage === "approved") return { label: "当前状态：审核通过", variant: "green" as const };
  return { label: "当前状态：草稿", variant: "gray" as const };
}

function formatTagInput(tags?: string[]) {
  return (tags ?? [])
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((item) => `#${item}`)
    .join(" ");
}

function normalizeDraftImageUrl(image: string) {
  const next = image.trim();
  if (!next || next.startsWith("blob:")) {
    return "";
  }
  if (
    next.startsWith("http://") ||
    next.startsWith("https://") ||
    next.startsWith("data:image/") ||
    next.startsWith("/")
  ) {
    return next;
  }
  if (next.startsWith("//")) {
    return window.location.protocol + next;
  }
  if (/^[a-z0-9.-]+(?::\d+)?\/.+/i.test(next)) {
    return `${window.location.protocol}//${next}`;
  }
  return `/${next.replace(/^\.?\//, "")}`;
}

function getVisibleImages(images: string[]) {
  return images.flatMap((image, index) => {
    if (typeof image !== "string") return [];
    const normalized = normalizeDraftImageUrl(image);
    if (!normalized) return [];
    return [{ index, image: normalized }];
  });
}

function buildProductPayloadFromDraft(item: DraftItem) {
  const title = item.title.trim();
  const body = item.body.trim();
  const summarySource = body || title;

  return {
    name: (title || "未命名商品").slice(0, 120),
    englishName: "",
    summary: summarySource.slice(0, 255) || "请补充商品卖点",
    description: body.slice(0, 2000),
    priceText: "0",
    images: item.images,
    specialOfferEnabled: false,
    originalPriceText: "",
    specialPriceText: "",
    specialTag: "",
  };
}

function downloadFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

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
  usePageMeta("图文草稿箱");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const createProduct = useProductsStore((s) => s.createProduct);
  const markDraftViewed = useStudioDraftInboxStore((s) => s.markViewed);
  const runningTasks = useStudioDraftTaskStore((s) => s.tasks);
  const [socialDrafts, setSocialDrafts] = useState<SocialPostItem[]>([]);
  const [productDrafts, setProductDrafts] = useState<ProductImageDraftItem[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hint, setHint] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<DraftItem | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [syncingProductDraftId, setSyncingProductDraftId] = useState<string | null>(null);
  const isAgent = user?.roleKey === "level1_agent";
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setSocialDrafts([]);
      setProductDrafts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [socialItems, productItems] = await Promise.all([
          listSocialPosts(accessToken),
          listProductImageDrafts(accessToken),
        ]);
        if (!cancelled) {
          setSocialDrafts(socialItems);
          setProductDrafts(productItems);
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
      prompt: item.prompt,
      title: item.title,
      body: item.body,
      tags: item.tags,
      createdAt: item.createdAt,
      images: item.images,
      downloadableImages: item.downloadableImages ?? item.images.map(() => false),
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
      prompt: item.prompt,
      title: item.title,
      body: item.body,
      tags: item.tags,
      createdAt: item.createdAt,
      images: item.images,
      downloadableImages: item.downloadableImages ?? item.images.map(() => false),
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
      return (
        item.title.toLowerCase().includes(normalized) ||
        item.body.toLowerCase().includes(normalized) ||
        item.prompt.toLowerCase().includes(normalized)
      );
    });
  }, [draftItems, query, sourceFilter]);

  function openEditor(item: DraftItem) {
    markDraftViewed(item.source, item.rawId);
    setEditingItem(item);
    setEditPrompt(item.prompt);
    setEditTitle(item.title);
    setEditBody(item.body);
    setEditTags(formatTagInput(item.tags));
    setEditImages(item.images);
    setPreviewImage(null);
  }

  function handleDownloadImage(item: DraftItem, image: string, index: number) {
    downloadFile(image, `${item.source}-${item.rawId}-${index + 1}.jpg`);
  }

  async function handleSubmitReview(item: DraftItem) {
    if (item.source === "social") {
      if (!accessToken) return;
      try {
        const next = await submitSocialPost(accessToken, item.rawId);
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setEditingItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: next.reviewStage } : prev));
        setHint("已提交审核，等待主公司处理。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "提交审核失败");
      }
      return;
    }

    if (!accessToken) return;
    try {
      const next = await submitProductImageDraft(accessToken, item.rawId);
      setProductDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
      setEditingItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: next.reviewStage } : prev));
      setHint("已提交审核，等待主公司处理。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "提交审核失败");
    }
  }

  async function handleWithdrawReview(item: DraftItem) {
    if (!accessToken) return;

    if (item.source === "social") {
      try {
        const next = await withdrawSocialPostReview(accessToken, item.rawId);
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setEditingItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: next.reviewStage } : prev));
        setHint("已撤销审核，草稿已退回。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "撤销审核失败");
      }
      return;
    }

    try {
      const next = await withdrawProductImageDraftReview(accessToken, item.rawId);
      setProductDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
      setEditingItem((prev) => (prev?.id === item.id ? { ...prev, reviewStage: next.reviewStage } : prev));
      setHint("已撤销审核，草稿已退回。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "撤销审核失败");
    }
  }

  async function handleSyncToLeads(item: DraftItem) {
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到获客。");
      return;
    }

    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    if (item.source === "social") {
      try {
        const platformStyle: LeadPlatformStyle =
          item.style === "douyin" ? "douyin" : item.style === "wechat" ? "wechat_mp" : "xiaohongshu";
        await syncPublishingContent({
          accessToken,
          sourceType: "social",
          sourceId: item.rawId,
          title: item.title,
          body: item.body,
          tags: item.tags,
          contentType: "image_text",
          platformStyle,
          coverImage: item.images[0],
          images: item.images,
        });
        const next = await markSocialPostSynced(accessToken, item.rawId);
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setEditingItem((prev) => (prev?.id === item.id ? { ...prev, syncedToLeads: true } : prev));
        setHint("已同步到获客内容池。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "同步获客失败");
      }
      return;
    }

    try {
      const platformStyle: LeadPlatformStyle =
        item.sizePreset === "9_16"
          ? "douyin"
          : item.sizePreset === "16_9"
            ? "wechat_mp"
            : "xiaohongshu";
      await syncPublishingContent({
        accessToken,
        sourceType: "product",
        sourceId: item.rawId,
        title: item.title,
        body: item.body,
        tags: item.tags,
        contentType: "product_asset",
        platformStyle,
        coverImage: item.images[0],
        images: item.images,
      });
      const next = await markProductImageDraftSynced(accessToken, item.rawId);
      setProductDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
      setEditingItem((prev) => (prev?.id === item.id ? { ...prev, syncedToLeads: next.syncedToLeads } : prev));
      setHint("已同步到获客内容池。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "同步获客失败");
    }
  }

  function handleSyncToProducts(item: DraftItem) {
    if (item.source !== "product") return;
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到产品管理。");
      return;
    }
    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    void (async () => {
      try {
        setSyncingProductDraftId(item.id);
        setHint("正在同步到产品管理...");
        await createProduct(buildProductPayloadFromDraft(item));
        const next = await markProductImageDraftProductSynced(accessToken, item.rawId);
        setProductDrafts((prev) => prev.map((entry) => (entry.id === item.rawId ? next : entry)));
        setEditingItem((prev) =>
          prev?.id === item.id ? { ...prev, syncedToProducts: next.syncedToProducts } : prev
        );
        setHint("已同步到产品管理。");
      } catch (error) {
        setHint(error instanceof Error ? error.message : "同步到产品管理失败");
      } finally {
        setSyncingProductDraftId((current) => (current === item.id ? null : current));
      }
    })();
  }

  function handleRemoveImage(index: number) {
    setEditImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleUploadImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(files.map((file) => uploadDraftImage(accessToken, file)));
      setEditImages((current) => [...current, ...uploadedUrls].slice(0, 12));
      setHint("图片已上传。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "上传图片失败");
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingItem) return;
    const prompt = editPrompt.trim();
    const title = editTitle.trim();
    const body = editBody.trim();
    const tags = Array.from(
      new Set(
        editTags
          .split(/\s+/)
          .map((item) => item.trim().replace(/^#+/, ""))
          .filter(Boolean)
      )
    ).slice(0, 20);

    if (!title) {
      setHint("标题不能为空。");
      return;
    }

    if (!body) {
      setHint("文案不能为空。");
      return;
    }

    if (uploadingImages) {
      setHint("图片还在上传中，请稍后再保存。");
      return;
    }

    try {
      setSaving(true);
      const nextImages = editImages.filter((item) => item.trim());
      if (editingItem.source === "social") {
        if (!accessToken) {
          setHint("登录已失效，请重新登录。");
          return;
        }
        const next = await updateSocialPost({
          accessToken,
          id: editingItem.rawId,
          prompt,
          title,
          body,
          tags,
          images: nextImages,
        });
        setSocialDrafts((prev) => prev.map((entry) => (entry.id === editingItem.rawId ? next : entry)));
        const nextItem: DraftItem = {
          ...editingItem,
          prompt: next.prompt,
          title: next.title,
          body: next.body,
          tags: next.tags,
          images: next.images,
          reviewStage: next.reviewStage,
          syncedToLeads: next.synced,
        };
        setEditingItem(nextItem);
        setEditPrompt(next.prompt);
        setEditTitle(next.title);
        setEditBody(next.body);
        setEditTags(formatTagInput(next.tags));
        setEditImages(next.images);
        setHint("草稿已保存。");
        setDeleteConfirmOpen(false);
        setEditingItem(null);
        return;
      }

      if (!accessToken) {
        setHint("登录已失效，请重新登录。");
        return;
      }
      const next = await updateProductImageDraft({
        accessToken,
        id: editingItem.rawId,
        prompt,
        title,
        body,
        tags,
        images: nextImages,
      });
      setProductDrafts((prev) => prev.map((entry) => (entry.id === editingItem.rawId ? next : entry)));
      const nextItem: DraftItem = {
        ...editingItem,
        prompt: next.prompt,
        title: next.title,
        body: next.body,
        tags: next.tags,
        images: next.images,
        reviewStage: next.reviewStage,
        syncedToLeads: next.syncedToLeads,
        syncedToProducts: next.syncedToProducts,
      };
      setEditingItem(nextItem);
      setEditPrompt(next.prompt);
      setEditTitle(next.title);
      setEditBody(next.body);
      setEditTags(formatTagInput(next.tags));
      setEditImages(next.images);
      setHint("草稿已保存。");
      setDeleteConfirmOpen(false);
      setEditingItem(null);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "保存草稿失败");
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteDraft() {
    if (!editingItem) return;
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteDraft() {
    if (!editingItem) return;

    try {
      setDeleting(true);
      if (editingItem.source === "social") {
        if (!accessToken) {
          setHint("登录已失效，请重新登录。");
          return;
        }
        await removeSocialPost(accessToken, editingItem.rawId);
        setSocialDrafts((prev) => prev.filter((entry) => entry.id !== editingItem.rawId));
      } else {
        if (!accessToken) {
          setHint("登录已失效，请重新登录。");
          return;
        }
        await removeProductImageDraft(accessToken, editingItem.rawId);
        setProductDrafts((prev) => prev.filter((entry) => entry.id !== editingItem.rawId));
      }
      setDeleteConfirmOpen(false);
      setEditingItem(null);
      setHint("草稿已删除。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "删除草稿失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="h-4 w-4 text-amber-300" />
                图文草稿箱
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                统一聚合 `社媒图文生成` 和 `商品图与详情图生成` 的结果。
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或正文" />
              <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                <option value="all">全部草稿</option>
                <option value="social">社媒图文生成</option>
                <option value="product">商品图与详情图生成</option>
              </Select>
            </div>
          </div>
          {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            {runningTasks.length === 0 ? null : (
              runningTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl bg-amber-500/10 px-3 py-3 ring-1 ring-amber-400/20"
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

          <div>
            {filteredItems.length === 0 ? (
              <div className="rounded-xl bg-white/[0.04] px-3 py-10 text-center text-sm text-zinc-500 ring-1 ring-white/6">
                暂无草稿结果
              </div>
            ) : (
              filteredItems.map((item) => {
                const meta = sourceMeta(item.source);
                const visibleImages = getVisibleImages(item.images);
                const stageVariant =
                  item.reviewStage === "approved" ? "green" : item.reviewStage === "submitted" ? "amber" : "gray";
                const stageLabel =
                  item.reviewStage === "approved"
                    ? "审核通过"
                    : item.reviewStage === "submitted"
                      ? "待审核"
                      : "草稿";
                return (
                  <div key={item.id} className="rounded-xl bg-white/[0.04] px-3 py-3 ring-1 ring-white/6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:max-w-[520px]">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          {meta.icon}
                          <span>{meta.label}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-zinc-100">{item.title}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {item.style ? (
                            <Badge variant="blue">
                              {item.style === "xiaohongshu"
                                ? "小红书"
                                : item.style === "douyin"
                                  ? "抖音"
                                  : "视频号"}
                            </Badge>
                          ) : null}
                          <Badge variant="gray">{item.sizePreset}</Badge>
                          {item.tags.filter(Boolean).map((tag) => (
                            <Badge key={`${item.id}-${tag}`} variant="gray">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{item.body}</div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleString()} · 图片 {visibleImages.length} 张
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEditor(item)}>
                          编辑
                        </Button>
                        {isAgent && item.reviewStage === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => void handleSubmitReview(item)}>
                            提交审核
                          </Button>
                        ) : null}
                        {isAgent && item.reviewStage === "submitted" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => void handleWithdrawReview(item)}>
                            撤销审核
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
                            disabled={item.syncedToProducts || syncingProductDraftId === item.id}
                          >
                            {item.syncedToProducts
                              ? "已同步产品"
                              : syncingProductDraftId === item.id
                                ? "同步中..."
                                : "同步到产品管理"}
                          </Button>
                        ) : null}
                        <Badge variant={stageVariant}>{stageLabel}</Badge>
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

      <Modal
        open={!!editingItem}
        title="草稿编辑"
        onClose={() => {
          setPreviewImage(null);
          setEditingItem(null);
        }}
        panelClassName="max-w-[96vw] sm:max-w-3xl xl:max-w-5xl"
        bodyClassName="max-h-[calc(100vh-11rem)]"
        footerClassName="shrink-0"
        footer={
          editingItem ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="danger" onClick={requestDeleteDraft}>
                删除记录
              </Button>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setEditingItem(null);
                  }}
                  disabled={saving || uploadingImages}
                >
                  取消
                </Button>
                <Button type="button" onClick={() => void handleSaveEdit()} disabled={saving || uploadingImages}>
                  {saving ? "保存中..." : uploadingImages ? "等待上传..." : "保存"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {editingItem ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={reviewStageMeta(editingItem.reviewStage).variant}>
                {reviewStageMeta(editingItem.reviewStage).label}
              </Badge>
              <Badge variant="blue">{sourceMeta(editingItem.source).label}</Badge>
              {editingItem.syncedToLeads ? <Badge variant="blue">已同步获客</Badge> : null}
              {editingItem.syncedToProducts ? <Badge variant="blue">已同步产品</Badge> : null}
            </div>

            <div className="rounded-2xl bg-black/20 px-3 py-2.5 ring-1 ring-white/10">
              <div className="text-xs text-zinc-400">
                {new Date(editingItem.createdAt).toLocaleString()} · 来源 {sourceMeta(editingItem.source).label}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <div className="space-y-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">提示词</div>
                  <textarea
                    value={editPrompt}
                    onChange={(event) => setEditPrompt(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400/30"
                    placeholder="请输入用户原始提示词"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">标题</div>
                  <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="请输入标题" />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">文案内容</div>
                  <textarea
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    rows={9}
                    className="min-h-[200px] w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400/30"
                    placeholder="请输入文案"
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="text-sm font-medium text-zinc-100">标签</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editTags
                      .split(/\s+/)
                      .map((item) => item.trim().replace(/^#+/, ""))
                      .filter(Boolean)
                      .map((tag) => (
                        <Badge key={tag} variant="gray">
                          #{tag}
                        </Badge>
                      ))}
                  </div>
                  <textarea
                    value={editTags}
                    onChange={(event) => setEditTags(event.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400/30"
                    placeholder="请输入标签，使用空格分隔，例如：#智能好物 #高效工具 #种草推荐"
                  />
                  <div className="text-xs text-zinc-500">支持直接输入 #标签，保存时会自动去重。</div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-zinc-100">结果预览</div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleUploadImages}
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={() => uploadInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      {uploadingImages ? "上传中..." : "上传图片"}
                    </Button>
                  </div>
                </div>
                <div>
                  {getVisibleImages(editImages).length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {getVisibleImages(editImages).map(({ index: originalIndex, image }, index) => (
                        <div key={`${editingItem.id}_${originalIndex}`} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500"
                            onClick={() => handleRemoveImage(originalIndex)}
                            aria-label="删除图片"
                          >
                            ×
                          </button>
                          <button
                            type="button"
                            className="absolute bottom-2 right-2 z-10 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-black/70 px-2 text-white transition hover:bg-amber-500"
                            onClick={() => handleDownloadImage(editingItem, image, originalIndex)}
                            aria-label="下载图片到本地"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="block w-full"
                            onClick={() => setPreviewImage(image)}
                            aria-label="放大预览图片"
                          >
                            <img
                              src={image}
                              alt={`${editingItem.title}_${index + 1}`}
                              className="aspect-[4/3] w-full object-cover transition hover:scale-[1.01]"
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                      当前草稿还没有图片，你可以自己上传。
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isAgent && editingItem.reviewStage === "draft" ? (
              <div className="flex justify-end">
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleSubmitReview(editingItem)}>
                  提交审核
                </Button>
              </div>
            ) : null}
            {isAgent && editingItem.reviewStage === "submitted" ? (
              <div className="flex justify-end">
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleWithdrawReview(editingItem)}>
                  撤销审核
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={!!previewImage} title="图片预览" onClose={() => setPreviewImage(null)}>
        {previewImage ? <img src={previewImage} alt="preview" className="max-h-[70vh] rounded-md object-contain" /> : null}
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        title="确认删除"
        onClose={() => {
          if (!deleting) {
            setDeleteConfirmOpen(false);
          }
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button type="button" variant="danger" onClick={() => void handleDeleteDraft()} disabled={deleting}>
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </div>
        }
      >
        {editingItem ? (
          <div className="space-y-2 text-sm text-zinc-300">
            <div>删除后不可恢复，请确认是否删除这条草稿。</div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-zinc-100">
              {editingItem.title}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

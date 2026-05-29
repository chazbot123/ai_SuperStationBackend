import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Plus, RefreshCw, Sparkles, X, WandSparkles, ChevronUp, Layers, Link2, LayoutTemplate, Copy, Box, Maximize, Smartphone, Columns, PanelTop, Scaling, FileImage, SlidersHorizontal } from "lucide-react";
import GenerationPageFrame from "@/components/studio/GenerationPageFrame";
import AutosizeTextarea from "@/components/ui/AutosizeTextarea";
import Badge from "@/components/ui/Badge";
import UpSelect from "@/components/ui/UpSelect";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  createProductImageDraft,
  generateAiCopy,
  generateAiImages,
  listProductImageDrafts,
  polishPrompt,
  type ProductImageDraftItem,
} from "@/lib/ai";
import { emitDraftInboxFly } from "@/lib/studioDraftInbox";
import { cn } from "@/lib/utils";
import {
  filterSupportedReferenceImages,
  MAX_REFERENCE_IMAGE_COUNT,
  REFERENCE_IMAGE_REQUEST_LIMIT_MB,
  requestPromptPolish,
} from "@/pages/generationWorkbench";
import { useAuthStore } from "@/store/authStore";
import { useModelConfigStore } from "@/store/modelConfigStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useStudioDraftTaskStore } from "@/store/studioDraftTaskStore";

type SizePreset = "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
type ResolutionPreset = "1k" | "2k" | "4k";

function formatTags(tags: string[]) {
  return tags.join(" ");
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

type AssetItem = {
  id: string;
  name: string;
  kind: "image";
  previewUrl?: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function taskStageMeta(stage: "queued" | "copy" | "images" | "saving" | "failed") {
  if (stage === "copy") return { progress: 35, label: "正在生成商品文案..." };
  if (stage === "images") return { progress: 70, label: "正在生成商品图片..." };
  if (stage === "saving") return { progress: 92, label: "正在写入草稿..." };
  if (stage === "failed") return { progress: 100, label: "生成失败" };
  return { progress: 8, label: "任务已创建，准备开始..." };
}

function reviewStageMeta(stage: ProductImageDraftItem["reviewStage"]) {
  if (stage === "submitted") return { label: "待审核", variant: "amber" as const };
  if (stage === "approved") return { label: "已通过", variant: "green" as const };
  return { label: "草稿", variant: "gray" as const };
}

function GeneratingPreviewState() {
  return (
    <div className="flex min-h-[720px] items-center justify-center rounded-2xl border border-dashed border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-transparent px-8">
      <div className="w-full max-w-xl space-y-5">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-cyan-400/20" />
            <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/40" />
            <Sparkles className="relative z-10 h-6 w-6 animate-pulse text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">正在生成当前结果</div>
            <div className="mt-1 text-xs text-zinc-400">商品文案和图片生成中，完成后会自动刷新到这里</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/90 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/80" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="h-11 w-full animate-pulse rounded-2xl bg-white/10" />
          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="h-4 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="h-4 w-full animate-pulse rounded-full bg-white/10" />
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-white/10" />
            <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="aspect-[4/5] animate-pulse rounded-2xl bg-white/10" />
            <div className="aspect-[4/5] animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioImages() {
  usePageMeta("商品图与详情图生成");

  const accessToken = useAuthStore((s) => s.accessToken);
  const markDraftUnread = useStudioDraftInboxStore((s) => s.markUnread);
  const upsertDraftTask = useStudioDraftTaskStore((s) => s.upsertTask);
  const removeDraftTask = useStudioDraftTaskStore((s) => s.removeTask);
  const textModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "text"));
  const imageModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "image"));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generateActionRef = useRef<HTMLDivElement | null>(null);

  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [sizePreset, setSizePreset] = useState<SizePreset>("3_4");
  const [resolution, setResolution] = useState<ResolutionPreset>("1k");
  const [imageCount, setImageCount] = useState("1");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<ProductImageDraftItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [hasTriedGenerate, setHasTriedGenerate] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const modelConfigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelConfigRef.current && !modelConfigRef.current.contains(event.target as Node)) {
        setIsModelConfigOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const imageAssets = useMemo(() => assets.filter((asset) => asset.previewUrl), [assets]);
  const isProductNameMissing = productName.trim().length === 0;
  const showProductNameError = hasTriedGenerate && isProductNameMissing;

  function hydrateCurrentResult(item: ProductImageDraftItem | null) {
    setCurrentResult(item);
    setEditTitle(item?.title ?? "");
    setEditBody(item?.body ?? "");
    setEditTags(formatTags(item?.tags ?? []));
    setEditImages(item?.images ?? []);
  }

  async function loadCurrentResult() {
    if (!accessToken) {
      hydrateCurrentResult(null);
      return;
    }
    setIsLoadingCurrent(true);
    try {
      const items = await listProductImageDrafts(accessToken);
      hydrateCurrentResult(items[0] ?? null);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "加载当前结果失败");
    } finally {
      setIsLoadingCurrent(false);
    }
  }

  useEffect(() => {
    void loadCurrentResult();
  }, [accessToken]);

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function appendFiles(files: File[]) {
    const supported = filterSupportedReferenceImages(files);
    if (supported.length === 0) {
      setHint("仅支持上传图片文件，可直接拖拽 PNG、JPG、WEBP、GIF 等图片类型");
      return;
    }
    const next = await Promise.all(
      supported.map(async (file) => ({
        id: makeId("asset"),
        name: file.name,
        kind: "image" as const,
        previewUrl: await readFileAsDataUrl(file),
      })),
    );
    setAssets((prev) => [...prev, ...next]);
    setHint(`已导入 ${next.length} 张参考图片`);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    await appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((item) => item.id !== id));
  }

  function clearAssets() {
    setAssets([]);
    setHint("已清空当前参考图片");
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsDragActive(false);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    await appendFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function handlePolishPrompt() {
    if (!accessToken) {
      setHint("登录状态异常，暂时无法润色");
      return;
    }

    setIsPolishingPrompt(true);
    try {
      const result = await requestPromptPolish({
        prompt: userPrompt,
        scene: "product_image",
        hasTextModel: Boolean(textModelConfig),
        invoke: ({ prompt, scene }) =>
          polishPrompt({
            prompt,
            scene,
            accessToken,
            modelConfig: textModelConfig!,
          }),
      });

      if (result.kind === "validation_error") {
        setHint(result.message);
        return;
      }

      setUserPrompt(result.prompt);
      setHint("提示词已润色，可直接继续生成");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "提示词润色失败");
    } finally {
      setIsPolishingPrompt(false);
    }
  }

  async function generateImages() {
    if (isGenerating) return;
    setHasTriedGenerate(true);
    if (!accessToken || !textModelConfig || !imageModelConfig) {
      setHint("模型配置或登录状态异常，暂时无法生成");
      return;
    }
    if (isProductNameMissing) {
      setHint("请先填写产品名称");
      return;
    }

    setIsGenerating(true);
    setHint("正在调用模型生成商品文案和图片...");
    const taskId = makeId("product_task");
    const stagePlan = ["queued", "copy", "images", "saving"] as const;
    let stageIndex = 0;
    let timer: number | null = null;
    const taskTitle = productName.trim() || userPrompt.trim() || imagePrompt.trim() || "商品图与详情图生成任务";
    const queuedMeta = taskStageMeta("queued");
    upsertDraftTask({
      id: taskId,
      source: "product",
      title: taskTitle.slice(0, 24),
      createdAt: new Date().toISOString(),
      progress: queuedMeta.progress,
      label: queuedMeta.label,
      stage: "queued",
    });

    timer = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, stagePlan.length - 1);
      const stage = stagePlan[stageIndex];
      const meta = taskStageMeta(stage);
      upsertDraftTask({
        id: taskId,
        source: "product",
        title: taskTitle.slice(0, 24),
        createdAt: new Date().toISOString(),
        progress: meta.progress,
        label: meta.label,
        stage,
      });
    }, 1400);

    try {
      const titleSeed = productName.trim() || userPrompt.trim() || imagePrompt.trim() || "商品图片";
      const prompt = [
        productName ? `产品名称：${productName}` : "",
        sellingPoints ? `核心卖点：${sellingPoints}` : "",
        audience ? `目标人群：${audience}` : "",
        userPrompt ? `文案要求：${userPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const referenceImages = imageAssets.map((item) => item.previewUrl!).slice(0, MAX_REFERENCE_IMAGE_COUNT);

      const [copyResult, imageResult] = await Promise.all([
        generateAiCopy({
          accessToken,
          prompt,
          productName: productName || titleSeed,
          sellingPoints,
          audience,
          style: "xhs",
          format: "text",
          modelConfig: textModelConfig,
        }),
        generateAiImages({
          accessToken,
          prompt: imagePrompt.trim() || titleSeed,
          sizePreset,
          resolution,
          referenceImages,
          modelConfig: imageModelConfig,
        }),
      ]);

      const next = await createProductImageDraft({
        accessToken,
        prompt: userPrompt.trim(),
        title: copyResult.title.trim() || `${titleSeed.slice(0, 18)} · 商品图草稿`,
        body: copyResult.body.trim() || copyResult.text,
        tags: copyResult.tags,
        images: imageResult.urls,
        sizePreset,
        resolution,
      });

      if (timer !== null) window.clearInterval(timer);
      removeDraftTask(taskId);
      hydrateCurrentResult(next);
      markDraftUnread("product", next.id);
      emitDraftInboxFly(generateActionRef.current, "✨");
      setHint("已生成商品图结果，右侧可继续编辑");
    } catch (error) {
      if (timer !== null) window.clearInterval(timer);
      const failedMeta = taskStageMeta("failed");
      upsertDraftTask({
        id: taskId,
        source: "product",
        title: taskTitle.slice(0, 24),
        createdAt: new Date().toISOString(),
        progress: failedMeta.progress,
        label: error instanceof Error ? error.message : failedMeta.label,
        stage: "failed",
        errorMessage: error instanceof Error ? error.message : "生成失败",
      });
      setHint(error instanceof Error ? error.message : "生成失败，请检查模型配置");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRemoveCurrentImage(index: number) {
    setEditImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <>
      <GenerationPageFrame
        title="商品图与详情图生成"
        description="编辑区统一放在上方，生成完成后的标题、文案、标签和图片都放到下方结果区处理。"
        badgeLabel="商品图工作台"
        editorContent={
          <div className="rounded-2xl border border-white/10 bg-[#08111f] shadow-sm focus-within:border-cyan-500/50 transition-colors">
            {/* Header Area */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-zinc-100">商品图与详情图生成</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-400">
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors" onClick={() => setUserPrompt("")} title="清空内容">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors" onClick={() => void handlePolishPrompt()} title="润色提示词" disabled={isPolishingPrompt}>
                  <WandSparkles className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Structured Input Fields */}
            <div className="grid gap-3 px-4 pb-3 lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                  <span>产品名称</span>
                  <span className="text-rose-400">*</span>
                </div>
                <input
                  type="text"
                  className={cn("w-full rounded-lg border bg-black/20 px-3 py-1.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600", showProductNameError ? "border-rose-400/70 focus:border-rose-400" : "border-white/5 focus:border-cyan-500/50")}
                  value={productName}
                  onChange={(event) => {
                    setProductName(event.target.value);
                    if (event.target.value.trim()) setHasTriedGenerate(false);
                  }}
                  placeholder="如：轻奢香薰蜡烛礼盒"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-zinc-400">核心卖点</div>
                <input
                  type="text"
                  className="w-full rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500/50"
                  value={sellingPoints}
                  onChange={(event) => setSellingPoints(event.target.value)}
                  placeholder="如：高级香调、居家氛围感"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-zinc-400">目标人群</div>
                <input
                  type="text"
                  className="w-full rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500/50"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="如：送礼人群、小红书种草用户"
                />
              </div>
            </div>

            {/* Image Prompt & Reference Images */}
            <div
              className={cn("flex flex-row-reverse gap-4 px-4 pt-2 pb-4 transition-colors min-h-[160px]", isDragActive ? "bg-cyan-500/5" : "")}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                className="flex-1 resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="请输入画面要求、风格、主体等图片生成提示词。"
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
              />

              <div className="relative flex items-center py-2 w-[72px] h-[92px]">
                {imageAssets.length === 0 ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="relative w-[52px] h-[72px] group">
                    <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-lg transform -rotate-6 transition-transform group-hover:-rotate-12"></div>
                    <div className="absolute inset-0 bg-[#121826] border border-white/10 rounded-lg flex items-center justify-center transition-transform group-hover:-translate-y-1">
                      <Plus className="h-5 w-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                    </div>
                  </button>
                ) : (
                  <div className="relative w-[52px] h-[72px]">
                    {imageAssets.map((img, idx) => {
                      const isLast = idx === imageAssets.length - 1;
                      const offset = idx * 2;
                      const rotate = (idx % 3 === 0 ? -6 : idx % 3 === 1 ? 4 : -2);
                      return (
                        <div 
                          key={img.id} 
                          className="absolute inset-0 rounded-lg overflow-hidden border border-white/10 shadow-sm transition-all duration-300 group"
                          style={{
                            transform: `translate(${offset}px, ${offset}px) rotate(${rotate}deg)`,
                            zIndex: idx
                          }}
                        >
                          <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img.previewUrl ?? null)} />
                          {isLast && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeAsset(img.id); }} className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all z-10">
                              <X className="h-2.5 w-2.5 text-white" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {imageAssets.length < MAX_REFERENCE_IMAGE_COUNT && (
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()} 
                        className="absolute -bottom-3 -right-3 w-7 h-7 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50 text-white"
                        style={{ zIndex: imageAssets.length + 1 }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Parameters Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <UpSelect
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors w-24"
                value={sizePreset}
                onChange={(v) => setSizePreset(v as SizePreset)}
                icon={<LayoutTemplate className="h-3.5 w-3.5" />}
                layout="horizontal"
                title="比例"
                options={[
                  { value: "1_1", label: "1:1", icon: <Box className="h-5 w-5 stroke-[1.5px]" /> },
                  { value: "3_4", label: "3:4", icon: <Smartphone className="h-5 w-5 stroke-[1.5px]" /> },
                  { value: "4_5", label: "4:5", icon: <PanelTop className="h-5 w-5 stroke-[1.5px]" /> },
                  { value: "9_16", label: "9:16", icon: <Columns className="h-5 w-5 stroke-[1.5px]" /> },
                  { value: "16_9", label: "16:9", icon: <Maximize className="h-5 w-5 stroke-[1.5px]" /> },
                ]}
              />

              <UpSelect
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors w-20"
                value={resolution}
                onChange={(v) => setResolution(v as ResolutionPreset)}
                icon={<Link2 className="h-3.5 w-3.5" />}
                options={[
                  { value: "1k", label: "1k" },
                  { value: "2k", label: "2k" },
                  { value: "4k", label: "4k" },
                ]}
              />

              <UpSelect
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors w-[88px]"
                value={imageCount}
                onChange={setImageCount}
                icon={<FileImage className="h-3.5 w-3.5" />}
                options={[
                  { value: "1", label: "x1" },
                  { value: "2", label: "x2" },
                  { value: "4", label: "x4" },
                ]}
              />

              <div className="relative" ref={modelConfigRef}>
                <button
                  type="button"
                  onClick={() => setIsModelConfigOpen(!isModelConfigOpen)}
                  className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>模型配置</span>
                  <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", isModelConfigOpen ? "rotate-180" : "")} />
                </button>
                {isModelConfigOpen && (
                  <div className="absolute bottom-full left-0 mb-1 z-50 w-64 rounded-xl border border-white/10 bg-[#1a2235] p-3 shadow-xl backdrop-blur-xl space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-400">文字模型</div>
                        <Badge variant={textModelConfig?.enabled ? "green" : "gray"}>{textModelConfig?.enabled ? "已启用" : "未启用"}</Badge>
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100 truncate">
                        {textModelConfig?.modelName?.trim() || textModelConfig?.providerName?.trim() || "未配置"}
                      </div>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-400">图片模型</div>
                        <Badge variant={imageModelConfig?.enabled ? "green" : "gray"}>{imageModelConfig?.enabled ? "已启用" : "未启用"}</Badge>
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100 truncate">
                        {imageModelConfig?.modelName?.trim() || imageModelConfig?.providerName?.trim() || "未配置"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsPromptOpen(!isPromptOpen)}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors", isPromptOpen ? "bg-purple-500/20 text-purple-300" : "bg-white/5 text-zinc-300 hover:bg-white/10")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>文案要求</span>
              </button>

              <div className="ml-auto flex items-center gap-2" ref={generateActionRef}>
                <span className="text-xs text-zinc-500">{userPrompt.trim().length}/4000</span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-white hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => void generateImages()}
                  disabled={isGenerating}
                  title="开始生成"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
              </div>
            </div>

            {/* Prompt Input */}
            {isPromptOpen && (
              <div className="px-4 pb-3">
                <textarea
                  className="w-full min-h-[100px] resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="补充标题、描述、话题的更高优先级要求，会覆盖下方默认提示词。"
                  value={userPrompt}
                  onChange={(event) => setUserPrompt(event.target.value)}
                />
              </div>
            )}

            {/* Footer Hint */}
            <div className="border-t border-white/5 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">默认提示词</span>
              <span className="text-xs text-zinc-500">重要：上方设定的模型和参数会一并生效，图片风格会受到参考图影响。</span>
              {hint && <span className="text-xs text-cyan-400 ml-auto">{hint}</span>}
            </div>
          </div>
        }
        resultDescription={undefined}
        resultContent={
          <div className="relative">
            {currentResult ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm text-zinc-200">标题</div>
                  <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="输入标题" />
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-zinc-200">详情文案</div>
                  <AutosizeTextarea
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    rows={4}
                    className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-300/20"
                    placeholder="输入详情文案"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-zinc-200">标签</div>
                  <AutosizeTextarea
                    value={editTags}
                    onChange={(event) => setEditTags(event.target.value)}
                    rows={2}
                    className="min-h-[60px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-300/20"
                    placeholder="多个标签用空格分隔，例如：#智能好物 #种草推荐"
                  />
                  <div className="text-xs text-zinc-500">支持直接输入 #标签，保存时会自动去重。</div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm text-zinc-200">结果图片</div>

                  {editImages.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                      {editImages.map((image, index) => (
                        <div
                          key={`${currentResult.id}_${index}`}
                          className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                        >
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500"
                            onClick={() => handleRemoveCurrentImage(index)}
                            aria-label="删除图片"
                          >
                            ×
                          </button>
                          <button type="button" className="block w-full" onClick={() => setPreviewImage(image)}>
                            <img
                              src={image}
                              alt={`${editTitle || currentResult.title}_${index + 1}`}
                              className="aspect-[4/5] w-full object-cover"
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm text-zinc-500">
                      当前结果还没有图片，可以在这里继续补传。
                    </div>
                  )}
                </div>

              </div>
            ) : isGenerating ? (
              <GeneratingPreviewState />
            ) : (
              <div className="flex min-h-[720px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-8 text-center text-sm text-zinc-500">
                {isLoadingCurrent
                  ? "正在加载当前结果..."
                  : "这里会展示最新一条商品图与详情图结果。先在上方完成配置，然后点击开始生成。"}
              </div>
            )}
            {currentResult && isGenerating ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-cyan-400/20 bg-[#091224]/78 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-cyan-400/20" />
                    <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/40" />
                    <Sparkles className="relative z-10 h-5 w-5 animate-pulse text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-100">正在生成新结果</div>
                    <div className="mt-1 text-xs text-zinc-400">下方结果区会在完成后自动切换到最新内容</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/90 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/80" />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        }
        footerContent={
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        }
      />
      <Modal open={!!previewImage} title="图片预览" onClose={() => setPreviewImage(null)}>
        {previewImage ? <img src={previewImage} alt="preview" className="max-h-[70vh] rounded-md object-contain" /> : null}
      </Modal>
    </>
  );
}

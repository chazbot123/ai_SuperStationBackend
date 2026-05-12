import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, RefreshCw, Sparkles, UploadCloud, WandSparkles } from "lucide-react";
import AssetPreviewStrip from "@/components/ui/AssetPreviewStrip";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  createProductImageDraft,
  generateAiCopy,
  generateAiImages,
  listProductImageDrafts,
  polishPrompt,
  type ProductImageDraftItem,
  updateProductImageDraft,
  uploadDraftImage,
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

function SectionBlock({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1327]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ModelStatusCard({
  label,
  providerName,
  modelName,
  enabled,
}: {
  label: string;
  providerName?: string;
  modelName?: string;
  enabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-400">{label}</div>
          <div className="mt-0.5 text-sm font-medium text-zinc-100">
            {modelName?.trim() || providerName?.trim() || "未配置"}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {providerName?.trim() || "请先到模型配置中启用"}
          </div>
        </div>
        <Badge variant={enabled ? "green" : "gray"}>{enabled ? "已启用" : "未启用"}</Badge>
      </div>
    </div>
  );
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
  const currentImageInputRef = useRef<HTMLInputElement | null>(null);

  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [sizePreset, setSizePreset] = useState<SizePreset>("3_4");
  const [resolution, setResolution] = useState<ResolutionPreset>("1k");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<ProductImageDraftItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);
  const [isUploadingCurrentImages, setIsUploadingCurrentImages] = useState(false);

  const imageAssets = useMemo(() => assets.filter((asset) => asset.previewUrl), [assets]);

  function hydrateCurrentResult(item: ProductImageDraftItem | null) {
    setCurrentResult(item);
    setEditTitle(item?.title ?? "");
    setEditBody(item?.body ?? "");
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
    if (!accessToken || !textModelConfig || !imageModelConfig) {
      setHint("模型配置或登录状态异常，暂时无法生成");
      return;
    }

    setIsGenerating(true);
    setHint("正在调用模型生成商品文案和图片...");
    const taskId = makeId("product_task");
    const stagePlan = ["queued", "copy", "images", "saving"] as const;
    let stageIndex = 0;
    let timer: number | null = null;
    const taskTitle = productName.trim() || userPrompt.trim() || "商品图与详情图生成任务";
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
      const titleSeed = productName.trim() || userPrompt.trim() || "商品图片";
      const prompt = [
        productName ? `产品名称：${productName}` : "",
        sellingPoints ? `核心卖点：${sellingPoints}` : "",
        audience ? `目标人群：${audience}` : "",
        userPrompt ? `补充提示：${userPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const referenceImages = imageAssets.map((item) => item.previewUrl!).slice(0, MAX_REFERENCE_IMAGE_COUNT);

      const [copyResult, imageResult] = await Promise.all([
        generateAiCopy({
          accessToken,
          prompt,
          scene: "product_image",
          productName: productName || titleSeed,
          sellingPoints,
          audience,
          style: "xhs",
          format: "text",
          modelConfig: textModelConfig,
        }),
        generateAiImages({
          accessToken,
          prompt: prompt || titleSeed,
          scene: "product_image",
          sizePreset,
          resolution,
          referenceImages,
          modelConfig: imageModelConfig,
        }),
      ]);

      const next = await createProductImageDraft({
        accessToken,
        title: `${titleSeed.slice(0, 18)} · 商品图草稿`,
        body: copyResult.text,
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

  async function handleUploadCurrentImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    if (!accessToken) {
      setHint("登录已失效，请重新登录");
      return;
    }
    setIsUploadingCurrentImages(true);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadDraftImage(accessToken, file)));
      setEditImages((prev) => [...prev, ...uploaded].slice(0, 12));
      setHint(`已补充 ${uploaded.length} 张图片`);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setIsUploadingCurrentImages(false);
    }
  }

  function handleRemoveCurrentImage(index: number) {
    setEditImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function saveCurrentResult() {
    if (!currentResult || !accessToken) return;
    const title = editTitle.trim();
    const body = editBody.trim();
    if (!title) {
      setHint("标题不能为空");
      return;
    }
    if (!body) {
      setHint("正文不能为空");
      return;
    }
    setIsSavingCurrent(true);
    try {
      const next = await updateProductImageDraft({
        accessToken,
        id: currentResult.id,
        title,
        body,
        images: editImages,
      });
      hydrateCurrentResult(next);
      setHint("当前结果已保存");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSavingCurrent(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-white/10 bg-[#091224] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
        <CardHeader className="border-white/10 bg-[#111d31]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                商品图与详情图生成
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                左侧填写模型、参考图、提示词和商品参数，右侧放大展示当前生成结果。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="blue">商品图工作台</Badge>
              <Link to="/studio/drafts">
                <Button variant="secondary" size="sm">打开草稿箱</Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="bg-[#091224] p-4 xl:p-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1.12fr)]">
            <div className="space-y-4">
              <SectionBlock title="当前模型">
                <div className="space-y-2.5">
                  <ModelStatusCard
                    label="文字模型"
                    providerName={textModelConfig?.providerName}
                    modelName={textModelConfig?.modelName}
                    enabled={Boolean(textModelConfig?.enabled)}
                  />
                  <ModelStatusCard
                    label="图片模型"
                    providerName={imageModelConfig?.providerName}
                    modelName={imageModelConfig?.modelName}
                    enabled={Boolean(imageModelConfig?.enabled)}
                  />
                </div>
              </SectionBlock>

              <SectionBlock
                title="上传参考图"
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                      上传图片
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearAssets} disabled={assets.length === 0}>
                      清空
                    </Button>
                  </div>
                }
              >
                <div
                  className={cn(
                    "rounded-2xl border border-dashed p-4 transition-colors",
                    isDragActive ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/15 bg-black/20",
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center gap-2 text-sm text-zinc-200">
                    <UploadCloud className="h-4 w-4 text-cyan-300" />
                    支持拖拽上传各种图片类型，或通过按钮上传
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    参考图会直接参与商品图生成，建议优先上传主图、细节图和风格参考图。
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    当前最多使用前 {MAX_REFERENCE_IMAGE_COUNT} 张参考图；未单独限制单张大小，实际受接口请求体总大小约 {REFERENCE_IMAGE_REQUEST_LIMIT_MB}MB 限制。
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium text-zinc-400">图片参考</div>
                    <AssetPreviewStrip
                      items={imageAssets}
                      emptyText="暂未上传参考图片"
                      onPreview={(asset) => setPreviewImage(asset.previewUrl ?? null)}
                      onRemove={removeAsset}
                    />
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock
                title="提示词"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handlePolishPrompt()}
                    disabled={isPolishingPrompt}
                  >
                    <WandSparkles className="h-4 w-4" />
                    {isPolishingPrompt ? "润色中..." : "润色"}
                  </Button>
                }
              >
                <textarea
                  className="min-h-[180px] w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-300/20"
                  value={userPrompt}
                  onChange={(event) => setUserPrompt(event.target.value)}
                  placeholder="输入商品图生成提示词。比如：围绕新款轻奢香薰蜡烛生成主图与详情图，强调玻璃质感、香型氛围、暖调布光和电商详情页卖点展示。"
                />
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <span>润色会把你的描述优化成更适合商品图生成模型理解的提示词。</span>
                  <span>{userPrompt.trim().length}/4000</span>
                </div>
                {hint ? <div className="mt-3 text-xs text-zinc-400">{hint}</div> : null}
              </SectionBlock>

              <SectionBlock title="参数">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-400">产品名称</div>
                    <Input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="如：轻奢香薰蜡烛礼盒" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-400">核心卖点</div>
                    <Input value={sellingPoints} onChange={(event) => setSellingPoints(event.target.value)} placeholder="如：高级香调、礼盒包装、居家氛围感" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-400">目标人群</div>
                    <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="如：送礼人群、家居审美用户、小红书种草用户" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-400">图片尺寸</div>
                      <Select value={sizePreset} onChange={(event) => setSizePreset(event.target.value as SizePreset)}>
                        <option value="1_1">1:1 正方形</option>
                        <option value="3_4">3:4 竖版封面</option>
                        <option value="4_5">4:5 竖版</option>
                        <option value="9_16">9:16 竖版</option>
                        <option value="16_9">16:9 横版</option>
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-400">分辨率</div>
                      <Select value={resolution} onChange={(event) => setResolution(event.target.value as ResolutionPreset)}>
                        <option value="1k">1k</option>
                        <option value="2k">2k</option>
                        <option value="4k">4k</option>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-zinc-500">
                    商品名称、卖点和目标人群会一起参与文案与图片生成，尺寸和分辨率会影响最终画面结构。
                  </div>
                </div>

                <div ref={generateActionRef} className="mt-4 flex justify-end">
                  <Button onClick={() => void generateImages()} disabled={isGenerating}>
                    <Sparkles className="h-4 w-4" />
                    {isGenerating ? "生成中..." : "开始生成"}
                  </Button>
                </div>
              </SectionBlock>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1628]">
              <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-base font-semibold text-zinc-100">当前生成结果</div>
                  <div className="mt-1 text-sm text-zinc-400">主结果区已放大，方便你集中处理图片与详情文案。</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadCurrentResult()}
                  disabled={isLoadingCurrent}
                >
                  <RefreshCw className={cn("h-4 w-4", isLoadingCurrent && "animate-spin")} />
                  {isLoadingCurrent ? "刷新中..." : "刷新结果"}
                </Button>
              </div>

              <div className="relative p-4">
                {currentResult ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>{new Date(currentResult.createdAt).toLocaleString()}</span>
                      <Badge variant={reviewStageMeta(currentResult.reviewStage).variant}>
                        {reviewStageMeta(currentResult.reviewStage).label}
                      </Badge>
                      <Badge variant="gray">{currentResult.sizePreset}</Badge>
                      <Badge variant="gray">{currentResult.resolution}</Badge>
                      {currentResult.syncedToLeads ? <Badge variant="blue">已同步获客池</Badge> : null}
                      {currentResult.syncedToProducts ? <Badge variant="blue">已同步产品管理</Badge> : null}
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-zinc-200">标题</div>
                      <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="输入标题" />
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-zinc-200">详情文案</div>
                      <textarea
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        rows={12}
                        className="min-h-[300px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-300/20"
                        placeholder="输入详情文案"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-zinc-200">结果图片</div>
                        <input
                          ref={currentImageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleUploadCurrentImages}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => currentImageInputRef.current?.click()}
                          disabled={isUploadingCurrentImages}
                        >
                          <ImagePlus className="h-4 w-4" />
                          {isUploadingCurrentImages ? "上传中..." : "补充图片"}
                        </Button>
                      </div>

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

                    <div className="flex justify-end">
                      <Button type="button" onClick={() => void saveCurrentResult()} disabled={isSavingCurrent || isUploadingCurrentImages}>
                        {isSavingCurrent ? "保存中..." : "保存当前结果"}
                      </Button>
                    </div>
                  </div>
                ) : isGenerating ? (
                  <GeneratingPreviewState />
                ) : (
                  <div className="flex min-h-[720px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-8 text-center text-sm text-zinc-500">
                    {isLoadingCurrent
                      ? "正在加载当前结果..."
                      : "这里会展示最新一条商品图与详情图结果。先在左侧完成配置，然后点击开始生成。"}
                  </div>
                )}
                {currentResult && isGenerating ? (
                  <div className="absolute inset-4 z-10 flex items-center justify-center rounded-2xl border border-cyan-400/20 bg-[#091224]/78 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="relative flex h-12 w-12 items-center justify-center">
                        <span className="absolute inset-0 rounded-full border border-cyan-400/20" />
                        <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/40" />
                        <Sparkles className="relative z-10 h-5 w-5 animate-pulse text-cyan-300" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-100">正在生成新结果</div>
                        <div className="mt-1 text-xs text-zinc-400">当前预览区会在完成后自动切换到最新内容</div>
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
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </CardContent>
      </Card>

      <Modal open={!!previewImage} title="图片预览" onClose={() => setPreviewImage(null)}>
        {previewImage ? <img src={previewImage} alt="preview" className="max-h-[70vh] rounded-md object-contain" /> : null}
      </Modal>
    </div>
  );
}

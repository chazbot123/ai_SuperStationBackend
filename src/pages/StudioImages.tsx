import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Sparkles, UploadCloud } from "lucide-react";
import AssetPreviewStrip from "@/components/ui/AssetPreviewStrip";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { generateAiCopy, generateAiImages } from "@/lib/ai";
import { emitDraftInboxFly } from "@/lib/studioDraftInbox";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useStudioDraftTaskStore } from "@/store/studioDraftTaskStore";
import { useModelConfigStore } from "@/store/modelConfigStore";
import { useStudioProductDraftStore } from "@/store/studioProductDraftStore";

type SizePreset = "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
type ResolutionPreset = "1k" | "2k" | "4k";
type ReviewStage = "draft" | "submitted" | "approved";

type AssetItem = {
  id: string;
  name: string;
  kind: "image" | "file";
  previewUrl?: string;
};

type GeneratedResult = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  images: string[];
  sizePreset: SizePreset;
  resolution: ResolutionPreset;
  reviewStage: ReviewStage;
  syncedToLeads: boolean;
  syncedToProducts: boolean;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function taskStageMeta(stage: "queued" | "copy" | "images" | "saving" | "failed") {
  if (stage === "copy") return { progress: 35, label: "正在生成商品文案..." };
  if (stage === "images") return { progress: 70, label: "正在生成商品图片..." };
  if (stage === "saving") return { progress: 92, label: "正在写入草稿箱..." };
  if (stage === "failed") return { progress: 100, label: "生成失败" };
  return { progress: 8, label: "任务已创建，准备开始..." };
}

export default function StudioImages() {
  usePageMeta("商品图与详情图生成");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const prependProductDraft = useStudioProductDraftStore((s) => s.prependItem);
  const markDraftUnread = useStudioDraftInboxStore((s) => s.markUnread);
  const upsertDraftTask = useStudioDraftTaskStore((s) => s.upsertTask);
  const removeDraftTask = useStudioDraftTaskStore((s) => s.removeTask);
  const textModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "text"));
  const imageModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "image"));

  const isAgent = user?.roleKey === "level1_agent";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const generateActionRef = useRef<HTMLDivElement | null>(null);

  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [sizePreset, setSizePreset] = useState<SizePreset>("3_4");
  const [resolution, setResolution] = useState<ResolutionPreset>("1k");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function appendFiles(files: File[]) {
    const supported = files.filter((file) => file.type.startsWith("image/") || /\.(docx?|pptx?|pdf)$/i.test(file.name));
    if (supported.length === 0) {
      setHint("支持图片、Word、PPT、PDF 和文件夹上传。");
      return;
    }
    const next = await Promise.all(
      supported.map(async (file) => ({
        id: makeId("asset"),
        name: file.name,
        kind: (file.type.startsWith("image/") ? "image" : "file") as AssetItem["kind"],
        previewUrl: file.type.startsWith("image/") ? await readFileAsDataUrl(file) : undefined,
      }))
    );
    setAssets((prev) => [...prev, ...next]);
    setHint(`已导入 ${next.length} 个素材，其中图片 ${next.filter((item) => item.kind === "image").length} 个。`);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    await appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    setShowAssetMenu(false);
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((item) => item.id !== id));
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

  async function generateImages() {
    if (isGenerating) return;
    if (!accessToken || !textModelConfig || !imageModelConfig) {
      setHint("模型配置或登录状态异常，暂时无法生成。");
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

      const referenceImages = assets
        .filter((item) => item.kind === "image" && item.previewUrl)
        .map((item) => item.previewUrl!)
        .slice(0, 3);

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
          prompt: prompt || titleSeed,
          sizePreset,
          resolution,
          referenceImages,
          modelConfig: imageModelConfig,
        }),
      ]);

      const next: GeneratedResult = {
        id: makeId("product_images"),
        title: `${titleSeed.slice(0, 18)}｜商品图素材`,
        body: copyResult.text,
        createdAt: new Date().toISOString(),
        images: imageResult.urls,
        sizePreset,
        resolution,
        reviewStage: isAgent ? "draft" : "approved",
        syncedToLeads: false,
        syncedToProducts: false,
      };

      if (timer !== null) {
        window.clearInterval(timer);
      }
      removeDraftTask(taskId);
      prependProductDraft(next);
      markDraftUnread("product", next.id);
      emitDraftInboxFly(generateActionRef.current, "🖼️");
      setHint("已生成并收纳到草稿箱，可在草稿箱统一预览和处理。");
    } catch (error) {
      if (timer !== null) {
        window.clearInterval(timer);
      }
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">商品图与详情图生成</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                面向电商平台和前台商品展示的图片素材生成。主公司可直接同步；一级代理需先提交审核。
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品名称</div>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="如：家用电热采暖系统" />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">核心卖点</div>
              <Input value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} placeholder="如：节能、安装便捷、适配多场景" />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">目标人群</div>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="如：家庭用户、招商代理、经销商" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">图片尺寸</div>
                <Select value={sizePreset} onChange={(e) => setSizePreset(e.target.value as SizePreset)}>
                  <option value="1_1">1:1 正方形</option>
                  <option value="3_4">小红书封面 3:4</option>
                  <option value="4_5">4:5 竖版</option>
                  <option value="9_16">抖音竖版 9:16</option>
                  <option value="16_9">16:9 横版</option>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">输出分辨率</div>
                <Select value={resolution} onChange={(e) => setResolution(e.target.value as ResolutionPreset)}>
                  <option value="1k">1k</option>
                  <option value="2k">2k</option>
                  <option value="4k">4k</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-100">用户提示词</div>
              <Badge variant="gray">{assets.length}</Badge>
            </div>
            <div
              className={cn(
                "rounded-3xl border border-dashed p-4 transition-colors",
                isDragActive ? "border-amber-400/50 bg-amber-500/10" : "border-white/15 bg-white/5"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                className="h-16 w-full resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="请输入用户提示词，可补充商品信息、场景说明或投放需求；也可直接拖入图片、Word、PPT、PDF 或整个文件夹。仅图片参与配图生成参考。"
              />
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/90">
                用户提示词支持补充商品信息，也支持植入图片、Word、PPT、PDF 和文件夹。仅图片参与配图生成参考，文档类素材作为补充信息保留。
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Button variant="secondary" size="sm" onClick={() => setShowAssetMenu((prev) => !prev)}>
                    <UploadCloud className="h-4 w-4" />
                    素材
                  </Button>
                  {showAssetMenu ? (
                    <div className="absolute left-0 top-11 z-10 min-w-36 rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-2xl">
                      <button type="button" className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-100 transition-colors hover:bg-white/5" onClick={() => fileInputRef.current?.click()}>
                        上传文件
                      </button>
                      <button type="button" className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-100 transition-colors hover:bg-white/5" onClick={() => folderInputRef.current?.click()}>
                        上传文件夹
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-zinc-400">支持图片、Word、PPT、PDF 和文件夹。仅图片参与图生图参考。</div>
              </div>
              {hint ? <div className="mt-3 text-xs text-zinc-400">{hint}</div> : null}
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-400">
                    图片素材（{assets.filter((asset) => asset.kind === "image" && asset.previewUrl).length}）
                  </div>
                  <AssetPreviewStrip
                    items={assets.filter((asset) => asset.kind === "image" && asset.previewUrl)}
                    emptyText="暂无图片素材"
                    onPreview={(asset) => setPreviewImage(asset.previewUrl ?? null)}
                    onRemove={removeAsset}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-400">
                    文档素材（{assets.filter((asset) => asset.kind === "file").length}）
                  </div>
                  <AssetPreviewStrip
                    items={assets.filter((asset) => asset.kind === "file")}
                    emptyText="暂无文档素材"
                    onRemove={removeAsset}
                  />
                </div>
              </div>
            </div>
            <div ref={generateActionRef} className="mt-4 flex justify-end">
              <Button onClick={generateImages} disabled={isGenerating}>
                <Sparkles className="h-4 w-4" />
                {isGenerating ? "生成中..." : "开始生成"}
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.doc,.docx,.ppt,.pptx,.pdf" multiple className="hidden" onChange={handleUpload} />
            <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleUpload} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </div>
        </CardContent>
      </Card>

      <Modal open={!!previewImage} title="图片预览" onClose={() => setPreviewImage(null)}>
        {previewImage ? <img src={previewImage} alt="preview" className="max-h-[70vh] rounded-md object-contain" /> : null}
      </Modal>
    </div>
  );
}

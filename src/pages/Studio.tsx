import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Sparkles, UploadCloud } from "lucide-react";
import AssetPreviewStrip from "@/components/ui/AssetPreviewStrip";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { generateSocialPost } from "@/lib/ai";
import { emitDraftInboxFly } from "@/lib/studioDraftInbox";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useStudioDraftInboxStore } from "@/store/studioDraftInboxStore";
import { useStudioDraftTaskStore } from "@/store/studioDraftTaskStore";
import { useModelConfigStore } from "@/store/modelConfigStore";

type GenStyle = "xiaohongshu" | "douyin" | "wechat";
type SizePreset = "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
type ResolutionPreset = "1k" | "2k" | "4k";

type AssetItem = {
  id: string;
  name: string;
  kind: "image" | "file";
  previewUrl?: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function styleLabel(style: GenStyle) {
  if (style === "xiaohongshu") return "小红书风";
  if (style === "douyin") return "抖音风";
  return "视频号风";
}

function taskStageMeta(stage: "queued" | "copy" | "images" | "saving" | "failed") {
  if (stage === "copy") return { progress: 35, label: "正在生成文案..." };
  if (stage === "images") return { progress: 70, label: "正在生成配图..." };
  if (stage === "saving") return { progress: 92, label: "正在写入草稿箱..." };
  if (stage === "failed") return { progress: 100, label: "生成失败" };
  return { progress: 8, label: "任务已创建，准备开始..." };
}

export default function Studio() {
  usePageMeta("社媒图文生成");

  const accessToken = useAuthStore((s) => s.accessToken);
  const markDraftUnread = useStudioDraftInboxStore((s) => s.markUnread);
  const upsertDraftTask = useStudioDraftTaskStore((s) => s.upsertTask);
  const removeDraftTask = useStudioDraftTaskStore((s) => s.removeTask);
  const textModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "text"));
  const imageModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "image"));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const generateActionRef = useRef<HTMLDivElement | null>(null);

  const [userPrompt, setUserPrompt] = useState("");
  const [genStyle, setGenStyle] = useState<GenStyle>("xiaohongshu");
  const [sizePreset, setSizePreset] = useState<SizePreset>("3_4");
  const [resolution, setResolution] = useState<ResolutionPreset>("1k");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (genStyle === "xiaohongshu") {
      setSizePreset("3_4");
      return;
    }
    if (genStyle === "douyin") {
      setSizePreset("9_16");
    }
  }, [genStyle]);

  const imageAssets = useMemo(
    () => assets.filter((item) => item.kind === "image" && item.previewUrl),
    [assets]
  );
  const documentAssets = useMemo(
    () => assets.filter((item) => item.kind === "file"),
    [assets]
  );

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
    const imageCount = next.filter((item) => item.kind === "image").length;
    const fileCount = next.length - imageCount;
    setHint(`已导入 ${next.length} 个素材，其中图片 ${imageCount} 个，文档 ${fileCount} 个。`);
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

  async function generate() {
    if (isGenerating) return;
    if (!accessToken || !textModelConfig || !imageModelConfig) {
      setHint("模型配置或登录状态异常，暂时无法生成。");
      return;
    }

    const prompt = userPrompt.trim() || "请生成一版适合当前平台风格的社媒图文。";
    const taskId = makeId("social_task");
    setIsGenerating(true);
    setHint("正在生成社媒图文，完成后会自动收纳到草稿箱...");
    const stagePlan = ["queued", "copy", "images", "saving"] as const;
    let stageIndex = 0;
    let timer: number | null = null;

    const queuedMeta = taskStageMeta("queued");
    upsertDraftTask({
      id: taskId,
      source: "social",
      title: prompt.slice(0, 24) || "社媒图文生成任务",
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
        source: "social",
        title: prompt.slice(0, 24) || "社媒图文生成任务",
        createdAt: new Date().toISOString(),
        progress: meta.progress,
        label: meta.label,
        stage,
      });
    }, 1400);

    try {
      const referenceImages = imageAssets
        .map((item) => item.previewUrl!)
        .slice(0, 3);

      const next = await generateSocialPost({
        accessToken,
        prompt,
        style: genStyle,
        sizePreset,
        resolution,
        referenceImages,
        textModelConfig,
        imageModelConfig,
      });
      if (timer !== null) {
        window.clearInterval(timer);
      }
      removeDraftTask(taskId);
      markDraftUnread("social", next.id);
      emitDraftInboxFly(generateActionRef.current, "🖼️");
      setHint(`已生成 1 条${styleLabel(next.style)}结果，并已收纳到草稿箱。`);
    } catch (error) {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      const failedMeta = taskStageMeta("failed");
      upsertDraftTask({
        id: taskId,
        source: "social",
        title: prompt.slice(0, 24) || "社媒图文生成任务",
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
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-300" />
                社媒图文生成
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                面向小红书、抖音、视频号风格的社媒图文生成。主输入区统一使用“用户提示词”，并支持拖拽图片和文档素材。
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">文案风格</div>
              <Select value={genStyle} onChange={(e) => setGenStyle(e.target.value as GenStyle)}>
                <option value="xiaohongshu">小红书风</option>
                <option value="douyin">抖音风</option>
                <option value="wechat">视频号风</option>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">图文尺寸</div>
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
                className="h-24 w-full resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="请输入用户提示词，也可直接把参考图拖到这个输入区域。例如：请结合参考图生成一版适合小红书投放的种草图文和 3 张配图。"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
              />
              <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/90">
                支持图片、Word、PPT、PDF 和文件夹。图片作为配图参考，文档作为补充信息保留。
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                <div className="text-xs text-zinc-400">小红书风自动切到 3:4，抖音风自动切到 9:16。</div>
              </div>
              {hint ? <div className="mt-3 text-xs text-zinc-400">{hint}</div> : null}

              <div className="mt-3 space-y-3">
                {imageAssets.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-400">图片素材（{imageAssets.length}）</div>
                    <AssetPreviewStrip
                      items={imageAssets}
                      emptyText="暂无图片素材"
                      onPreview={(asset) => setPreviewImage(asset.previewUrl ?? null)}
                      onRemove={removeAsset}
                    />
                  </div>
                ) : null}
                {documentAssets.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-400">文档素材（{documentAssets.length}）</div>
                    <AssetPreviewStrip
                      items={documentAssets}
                      emptyText="暂无文档素材"
                      onRemove={removeAsset}
                    />
                  </div>
                ) : null}
                {assets.length === 0 ? (
                  <AssetPreviewStrip items={[]} emptyText="暂无已导入素材" />
                ) : null}
              </div>
            </div>
            <div ref={generateActionRef} className="mt-4 flex justify-end">
              <Button onClick={generate} disabled={isGenerating}>
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

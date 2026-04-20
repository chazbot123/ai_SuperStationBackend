import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { FileText, MessageSquareText, Sparkles, UploadCloud, Video as VideoIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";

type ReviewStage = "draft" | "submitted" | "approved";
type VideoStatus = "ready" | "processing";

type VideoItem = {
  id: string;
  title: string;
  durationText: string;
  status: VideoStatus;
  createdAt: string;
  generatedScript: string;
  videoUrl: string;
  reviewStage: ReviewStage;
  synced: boolean;
};

type UploadAsset = {
  id: string;
  name: string;
  kind: "image" | "video" | "file";
  previewUrl?: string;
};

type WorkspaceProps = {
  pageTitle: string;
  cardTitle: string;
  subtitle: string;
  badgeText: string;
  questionPlaceholder: string;
  defaultPrompt: string;
  scriptTitle: string;
  backToVideosLabel?: string;
  controlMode?: "style" | "scene" | "duration";
  defaultScene?: string;
  sceneOptions?: string[];
  defaultDurationSec?: number;
  enableVoiceSelection?: boolean;
  defaultVoice?: string;
  voiceOptions?: string[];
  historyTitle?: string;
};

const DEMO_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDurationText(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

export default function VideoGenerationWorkspace(props: WorkspaceProps) {
  usePageMeta(props.pageTitle);

  const user = useAuthStore((s) => s.user);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const isAgent = user?.roleKey === "level1_agent";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [question, setQuestion] = useState("");
  const [style, setStyle] = useState("专业风");
  const [scene, setScene] = useState(props.defaultScene ?? "产品讲解");
  const [durationSec, setDurationSec] = useState(props.defaultDurationSec ?? 30);
  const [voice, setVoice] = useState(props.defaultVoice ?? "女声·亲和");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [assets, setAssets] = useState<UploadAsset[]>([]);
  const [generatedHistory, setGeneratedHistory] = useState<VideoItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assetHint, setAssetHint] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<UploadAsset | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState<VideoItem | null>(null);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return generatedHistory.filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [generatedHistory, historyQuery]);

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function appendFiles(files: File[]) {
    const supported = files.filter((file) => isImageFile(file) || isVideoFile(file) || /\.(docx?|pptx?|pdf)$/i.test(file.name));
    if (supported.length === 0) {
      setAssetHint("支持图片、视频、Word、PPT、PDF 和文件夹上传。");
      return;
    }
    const next = await Promise.all(
      supported.map(async (file) => ({
        id: makeId("video_asset"),
        name: file.name,
        kind: (isImageFile(file) ? "image" : isVideoFile(file) ? "video" : "file") as UploadAsset["kind"],
        previewUrl: isImageFile(file) || isVideoFile(file) ? await readFileAsDataUrl(file) : undefined,
      }))
    );
    setAssets((prev) => [...prev, ...next]);
    setAssetHint(`已导入 ${next.length} 个素材，其中图片 ${next.filter((item) => item.kind === "image").length} 个、视频 ${next.filter((item) => item.kind === "video").length} 个。`);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    await appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    setShowAssetMenu(false);
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

  async function generateVideoDemo() {
    if (isGenerating) return;
    setIsGenerating(true);
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    const prompt = question.trim() || props.defaultPrompt;
    const firstVideo = assets.find((item) => item.kind === "video" && item.previewUrl)?.previewUrl || DEMO_VIDEO_URL;
    const nextScript = [
      props.scriptTitle,
      `用户提示词：${prompt}`,
      `内容控制：${props.controlMode === "scene" ? scene : props.controlMode === "duration" ? `${durationSec}s` : style}`,
      props.enableVoiceSelection ? `音色：${voice}` : "",
      `比例：${ratio}`,
      `分辨率：${resolution}`,
      "",
      "镜头 1：开场抛出核心问题，快速建立传播钩子。",
      "镜头 2：解释产品卖点或内容重点，突出适用场景。",
      "镜头 3：补充细节或对比信息，强化可信感。",
      "镜头 4：结尾行动引导，鼓励咨询、了解或转化。",
    ]
      .filter(Boolean)
      .join("\n");

    const next: VideoItem = {
      id: makeId("video"),
      title: `${props.cardTitle}｜${prompt.slice(0, 16) || "新视频任务"}`,
      durationText: formatDurationText(durationSec),
      status: "ready",
      createdAt: new Date().toISOString(),
      generatedScript: nextScript,
      videoUrl: firstVideo,
      reviewStage: isAgent ? "draft" : "approved",
      synced: false,
    };

    setGeneratedHistory((prev) => [next, ...prev]);
    setAssetHint("已生成到结果列表，可逐条预览、提交审核或同步获客。");
    setIsGenerating(false);
  }

  function submitReview(id: string) {
    setGeneratedHistory((prev) => prev.map((item) => (item.id === id ? { ...item, reviewStage: "submitted" } : item)));
    setAssetHint("已提交审核，等待主公司处理。");
  }

  function syncToLeads(id: string) {
    const item = generatedHistory.find((entry) => entry.id === id);
    if (!item) return;
    if (item.reviewStage !== "approved") {
      setAssetHint("只有审核通过后才能同步到获客。");
      return;
    }

    const content = addContent({
      type: "video",
      title: item.title,
      body: item.generatedScript,
      platformStyle: "douyin",
      images: [],
      videoUrl: item.videoUrl,
      syncedToLeads: true,
      reviewStatus: "approved",
    });
    markContentSynced(content.id);

    setGeneratedHistory((prev) => prev.map((entry) => (entry.id === id ? { ...entry, synced: true } : entry)));
    setAssetHint("已同步到获客内容池。");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareText className="h-4 w-4 text-amber-300" />
                {props.cardTitle}
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">{props.subtitle}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="amber">{props.badgeText}</Badge>
              <Link to="/videos">
                <Button variant="secondary" size="sm">{props.backToVideosLabel ?? "返回视频生成"}</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">
                {props.controlMode === "scene" ? "内容场景" : props.controlMode === "duration" ? "视频时长" : "视频风格"}
              </div>
              {props.controlMode === "scene" ? (
                <Select value={scene} onChange={(e) => setScene(e.target.value)}>
                  {(props.sceneOptions ?? ["产品讲解", "招商咨询", "直播转化"]).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              ) : props.controlMode === "duration" ? (
                <Input type="number" min={5} max={300} step={5} value={String(durationSec)} onChange={(e) => setDurationSec(Number(e.target.value) || 30)} />
              ) : (
                <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="专业风">专业风</option>
                  <option value="社媒风">社媒风</option>
                  <option value="广告风">广告风</option>
                </Select>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">视频比例</div>
              <Select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                <option value="9:16">竖版 9:16</option>
                <option value="16:9">横版 16:9</option>
                <option value="1:1">正方形 1:1</option>
                <option value="3:4">竖版 3:4</option>
                <option value="4:5">竖版 4:5</option>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">输出分辨率</div>
              <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="1080p">1080p</option>
                <option value="2k">2k</option>
                <option value="4k">4k</option>
              </Select>
            </div>
            {props.enableVoiceSelection ? (
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">音色</div>
                <Select value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {(props.voiceOptions ?? ["女声·亲和", "男声·稳重", "中性·专业"]).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </div>
            ) : null}
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
                placeholder={props.questionPlaceholder}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/90">
                支持图片、视频、Word、PPT、PDF 和文件夹。视频作为预览素材，图片和文档作为补充信息。
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
                <div className="text-xs text-zinc-400">每条结果单独提交审核，审核通过后才显示同步按钮。</div>
              </div>
              {assetHint ? <div className="mt-3 text-xs text-zinc-400">{assetHint}</div> : null}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {assets.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-zinc-500">暂无已导入素材</div>
                ) : null}
                {assets.map((asset) => {
                  if ((asset.kind === "image" || asset.kind === "video") && asset.previewUrl) {
                    return (
                      <button key={asset.id} type="button" className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition hover:border-amber-400/30" onClick={() => setPreviewAsset(asset)}>
                        {asset.kind === "image" ? (
                          <img src={asset.previewUrl} alt={asset.name} className="h-32 w-full object-cover" />
                        ) : (
                          <div className="flex h-32 items-center justify-center bg-white/5">
                            <VideoIcon className="h-8 w-8 text-amber-300" />
                          </div>
                        )}
                        <div className="truncate px-3 py-2 text-xs text-zinc-300">{asset.name}</div>
                      </button>
                    );
                  }
                  return (
                    <div key={asset.id} className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-zinc-300">
                      <FileText className="h-4 w-4 shrink-0 text-amber-300" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-100">{asset.name}</div>
                        <div className="truncate text-zinc-500">文档附件</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={generateVideoDemo} disabled={isGenerating}>
                <Sparkles className="h-4 w-4" />
                {isGenerating ? "生成中..." : "发送并生成"}
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,.doc,.docx,.ppt,.pptx,.pdf" multiple className="hidden" onChange={handleUpload} />
            <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleUpload} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{props.historyTitle ?? "生成结果"}</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="搜索标题" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-8 text-center text-sm text-zinc-400">暂无生成结果，请先点击“发送并生成”</div>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-100">{item.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {item.durationText} · {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewGenerated(item)}>预览</Button>
                      {isAgent && item.reviewStage === "draft" ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => submitReview(item.id)}>提交审核</Button>
                      ) : null}
                      {item.reviewStage === "approved" ? (
                        <Button type="button" size="sm" onClick={() => syncToLeads(item.id)} disabled={item.synced}>
                          {item.synced ? "已同步获客" : "同步到获客"}
                        </Button>
                      ) : null}
                      {item.reviewStage === "submitted" ? <Badge variant="amber">待审核</Badge> : null}
                      {item.reviewStage === "approved" ? <Badge variant="green">审核通过</Badge> : null}
                      <Badge variant={item.status === "ready" ? "green" : "amber"}>{item.status === "ready" ? "可用" : "处理中"}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Modal open={!!previewAsset} title="素材预览" onClose={() => setPreviewAsset(null)}>
        {previewAsset?.kind === "image" && previewAsset.previewUrl ? <img src={previewAsset.previewUrl} alt={previewAsset.name} className="max-h-[70vh] rounded-md object-contain" /> : null}
        {previewAsset?.kind === "video" && previewAsset.previewUrl ? <video controls src={previewAsset.previewUrl} className="max-h-[70vh] w-full rounded-md bg-black" /> : null}
        {previewAsset?.kind === "file" ? <div className="text-sm text-zinc-300">{previewAsset.name}</div> : null}
      </Modal>

      <Modal open={!!previewGenerated} title="生成结果预览" onClose={() => setPreviewGenerated(null)}>
        {previewGenerated ? (
          <div className="space-y-4">
            <video controls src={previewGenerated.videoUrl} className="h-72 w-full rounded-xl bg-black object-cover" />
            <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">{previewGenerated.generatedScript}</pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

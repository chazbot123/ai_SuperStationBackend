import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { FileText, Sparkles, UploadCloud } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";

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

function placeholderImage(title: string, index: number) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#14532d"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <rect x="30" y="30" width="1140" height="840" rx="32" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
      <text x="60" y="90" fill="#d1fae5" font-size="26" font-family="Arial">商品图与详情图生成</text>
      <text x="60" y="150" fill="#ffffff" font-size="42" font-family="Arial">${title.slice(0, 20) || "商品展示图"}</text>
      <text x="60" y="820" fill="rgba(255,255,255,0.72)" font-size="22" font-family="Arial">场景图 ${index + 1}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function StudioImages() {
  usePageMeta("商品图与详情图生成");

  const user = useAuthStore((s) => s.user);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);

  const isAgent = user?.roleKey === "level1_agent";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [sizePreset, setSizePreset] = useState<SizePreset>("3_4");
  const [resolution, setResolution] = useState<ResolutionPreset>("1k");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<GeneratedResult | null>(null);

  const filteredResults = useMemo(() => {
    const q = resultsQuery.trim().toLowerCase();
    return generatedResults.filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [generatedResults, resultsQuery]);

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
    setIsGenerating(true);
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    const titleSeed = productName.trim() || userPrompt.trim() || "商品图片";
    const body = [
      `产品名称：${productName || "未填写"}`,
      `核心卖点：${sellingPoints || "未填写"}`,
      `目标人群：${audience || "未填写"}`,
      `用户提示词：${userPrompt || "未填写"}`,
    ].join("\n");

    const next: GeneratedResult = {
      id: makeId("product_images"),
      title: `${titleSeed.slice(0, 18)}｜商品图素材`,
      body,
      createdAt: new Date().toISOString(),
      images: Array.from({ length: 4 }, (_, index) => placeholderImage(titleSeed, index)),
      sizePreset,
      resolution,
      reviewStage: isAgent ? "draft" : "approved",
      syncedToLeads: false,
      syncedToProducts: false,
    };

    setGeneratedResults((prev) => [next, ...prev]);
    setHint("已生成到结果列表，可逐条预览、提交审核或同步下游模块。");
    setIsGenerating(false);
  }

  function submitReview(id: string) {
    setGeneratedResults((prev) => prev.map((item) => (item.id === id ? { ...item, reviewStage: "submitted" } : item)));
    setHint("已提交审核，等待主公司处理。");
  }

  function syncToLeads(id: string) {
    const result = generatedResults.find((item) => item.id === id);
    if (!result) return;
    if (result.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到获客。");
      return;
    }

    const content = addContent({
      type: "copy",
      title: result.title,
      body: result.body,
      platformStyle: "super_site",
      images: result.images,
      syncedToLeads: true,
      reviewStatus: "approved",
    });
    markContentSynced(content.id);

    setGeneratedResults((prev) => prev.map((item) => (item.id === id ? { ...item, syncedToLeads: true } : item)));
    setHint("已同步到获客内容池。");
  }

  function syncToProducts(id: string) {
    const result = generatedResults.find((item) => item.id === id);
    if (!result) return;
    if (result.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到产品管理。");
      return;
    }

    addContent({
      type: "product",
      title: result.title,
      body: result.body,
      platformStyle: "super_site",
      images: result.images,
      reviewStatus: "approved",
    });

    setGeneratedResults((prev) => prev.map((item) => (item.id === id ? { ...item, syncedToProducts: true } : item)));
    setHint("已同步到产品管理。");
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
            <div className="flex items-center gap-2">
              <Badge variant="amber">图文子模块</Badge>
              <Link to="/studio">
                <Button variant="secondary" size="sm">返回图片/文案生成</Button>
              </Link>
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
              <div className="mt-3 grid grid-cols-2 gap-3">
                {assets.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-zinc-500">暂无已导入素材</div>
                ) : null}
                {assets.map((asset) =>
                  asset.kind === "image" && asset.previewUrl ? (
                    <img key={asset.id} src={asset.previewUrl} alt={asset.name} className="h-16 w-full cursor-pointer rounded-xl object-cover" onClick={() => setPreviewImage(asset.previewUrl ?? null)} />
                  ) : (
                    <div key={asset.id} className="flex min-h-16 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-zinc-300">
                      <FileText className="h-4 w-4 shrink-0 text-amber-300" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-100">{asset.name}</div>
                        <div className="truncate text-zinc-500">文档素材</div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={generateImages} disabled={isGenerating}>
                <Sparkles className="h-4 w-4" />
                {isGenerating ? "生成中..." : "开始生成"}
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.doc,.docx,.ppt,.pptx,.pdf" multiple className="hidden" onChange={handleUpload} />
            <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleUpload} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-medium text-zinc-100">生成结果</div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Input value={resultsQuery} onChange={(e) => setResultsQuery(e.target.value)} placeholder="搜索标题" />
              </div>
            </div>

            <div className="space-y-2">
              {filteredResults.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-zinc-500">暂无生成结果，请先点击“开始生成”</div>
              ) : (
                filteredResults.map((result) => (
                  <div key={result.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-100">{result.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {result.sizePreset.replace("_", ":")} · {new Date(result.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewResult(result)}>预览</Button>
                        {isAgent && result.reviewStage === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => submitReview(result.id)}>提交审核</Button>
                        ) : null}
                        {result.reviewStage === "approved" ? (
                          <>
                            <Button type="button" size="sm" onClick={() => syncToLeads(result.id)} disabled={result.syncedToLeads}>
                              {result.syncedToLeads ? "已同步获客" : "同步到获客"}
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => syncToProducts(result.id)} disabled={result.syncedToProducts}>
                              {result.syncedToProducts ? "已同步产品" : "同步到产品管理"}
                            </Button>
                          </>
                        ) : null}
                        {result.reviewStage === "submitted" ? <Badge variant="amber">待审核</Badge> : null}
                        {result.reviewStage === "approved" ? <Badge variant="green">审核通过</Badge> : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal open={!!previewImage} title="图片预览" onClose={() => setPreviewImage(null)}>
        {previewImage ? <img src={previewImage} alt="preview" className="max-h-[70vh] rounded-md object-contain" /> : null}
      </Modal>

      <Modal open={!!previewResult} title="生成结果预览" onClose={() => setPreviewResult(null)}>
        {previewResult ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-300 whitespace-pre-line">{previewResult.body}</div>
            <div className="grid grid-cols-2 gap-3">
              {previewResult.images.map((image) => (
                <div key={image} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <img src={image} alt={previewResult.title} className="aspect-[4/3] w-full object-cover" />
                  {isAgent && previewResult.reviewStage !== "approved" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white/90">待审核水印预览</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

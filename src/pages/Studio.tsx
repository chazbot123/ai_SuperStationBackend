import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";
import { useT } from "@/i18n/useT";

type DraftStatus = "draft" | "submitted" | "rejected";
type Draft = {
  id: string;
  title: string;
  updatedAt: string;
  status: DraftStatus;
};

const seedDrafts: Draft[] = [
  {
    id: "c_1001",
    title: "AI内容中台：小红书种草标题合集",
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    status: "draft",
  },
  {
    id: "c_1000",
    title: "产品A：抖音爆款风脚本（30秒）",
    updatedAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    status: "rejected",
  },
];

function statusBadge(t: (key: string, vars?: Record<string, string | number>) => string, status: DraftStatus) {
  if (status === "draft") return <Badge variant="gray">{t("studio.status.draft")}</Badge>;
  if (status === "submitted") return <Badge variant="amber">{t("studio.status.submitted")}</Badge>;
  return <Badge variant="red">{t("studio.status.rejected")}</Badge>;
}

export default function Studio() {
  const t = useT();
  usePageMeta(t("page.studio"));
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("draft");
  const [selectedId, setSelectedId] = useState(seedDrafts[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [genStyle, setGenStyle] = useState<"xhs" | "douyin" | "wechat">("xhs");
  const [genFormat, setGenFormat] = useState<"text" | "html">("text");
  const [prodName, setProdName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sizePreset, setSizePreset] = useState<"3_4" | "9_16">("3_4");
  const [batchCsv, setBatchCsv] = useState<string>("");
  const [syncedHint, setSyncedHint] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageHint, setImageHint] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [drafts, setDrafts] = useState<Draft[]>(seedDrafts);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return drafts
      .filter((d) => {
        if (tab === "draft") return d.status === "draft";
        if (tab === "submitted") return d.status === "submitted";
        if (tab === "rejected") return d.status === "rejected";
        return true;
      })
      .filter((d) => (s ? d.title.toLowerCase().includes(s) : true));
  }, [q, tab, drafts]);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  function pickSize(preset: "3_4" | "9_16") {
    return preset === "9_16" ? ([540, 960] as const) : ([600, 800] as const);
  }

  function escapeXml(s: string) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function svgPlaceholderDataUri(label: string, preset: "3_4" | "9_16", index: number) {
    const [w, h] = pickSize(preset);
    const title = escapeXml((label || "未命名产品").trim().slice(0, 24) || "未命名产品");
    const stamp = escapeXml(new Date().toLocaleString());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="16" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/><text x="32" y="72" fill="#ffffff" font-size="28" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">AI 配图占位</text><text x="32" y="118" fill="rgba(255,255,255,0.9)" font-size="22" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">${title}</text><text x="32" y="156" fill="rgba(255,255,255,0.65)" font-size="16" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">图片生成服务不可用或被拦截</text><text x="32" y="${h - 44}" fill="rgba(255,255,255,0.55)" font-size="14" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">#${index + 1} · ${stamp}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function buildImagePrompt() {
    const name = (prodName || "某产品").trim();
    const points = sellingPoints.trim();
    const crowd = audience.trim();
    const platform =
      genStyle === "xhs" ? "小红书封面风格" : genStyle === "douyin" ? "抖音封面风格" : "微信公众号配图风格";
    const ratio = sizePreset === "9_16" ? "竖版 9:16" : "竖版 3:4";
    const parts = [
      `${name}`,
      platform,
      ratio,
      "产品摄影",
      points ? `突出卖点：${points}` : "",
      crowd ? `面向人群：${crowd}` : "",
      "干净背景",
      "柔和棚拍光",
      "主体居中清晰",
      "细节真实",
      "不要风景",
      "不要山水",
      "不要文字",
      "不要水印",
      "不要logo",
    ].filter(Boolean);
    return parts.join("，");
  }

  function pollinationsUrls(prompt: string, preset: "3_4" | "9_16") {
    const [w, h] = pickSize(preset);
    const seedBase = Date.now();
    return Array.from({ length: 3 }).map(
      (_, i) =>
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seedBase + i}&nologo=true`
    );
  }

  function ensureImageFallback(index: number, src: string) {
    const fallback = svgPlaceholderDataUri(prodName || "某产品", sizePreset, index);
    setImages((prev) => prev.map((p, i) => (i === index ? fallback : p)));
    setPreviewImage((p) => (p === src ? fallback : p));
  }

  function handleNew() {
    const newId = `c_${Date.now()}`;
    const newDraft: Draft = {
      id: newId,
      title: "新草稿（未命名）",
      updatedAt: new Date().toISOString(),
      status: "draft",
    };
    setDrafts((prev) => [newDraft, ...prev]);
    setSelectedId(newId);
    setTab("draft");
    setProdName("");
    setSellingPoints("");
    setAudience("");
    setBody("");
    setImages([]);
    setSyncedHint(null);
  }

  async function mockGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    setSyncedHint(null);
    setImageHint(null);
    const updatedDrafts = drafts.map(d => {
      if (d.id === selectedId) {
        return { ...d, title: prodName ? `【${genStyle === "xhs" ? "小红书风" : genStyle === "douyin" ? "抖音风" : "微信公众号风"}】${prodName}` : "新草稿（未命名）", updatedAt: new Date().toISOString() };
      }
      return d;
    });
    setDrafts(updatedDrafts);

    try {
      const r1 = await fetch("/api/ai/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: prodName,
          sellingPoints,
          audience,
          style: genStyle,
          format: genFormat,
        }),
      });
      if (r1.ok) {
        const j = await r1.json();
        setBody(genFormat === "text" ? j.text : j.html);
      }
      const r2 = await fetch("/api/ai/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildImagePrompt(),
          sizePreset,
        }),
      });
      if (r2.ok) {
        const j2 = await r2.json();
        if (Array.isArray(j2.urls)) setImages(j2.urls);
        const provider = String(j2?.provider ?? "");
        if (provider === "dashscope") setImageHint("图片来源：DashScope（真实生图）");
        else if (provider === "pollinations") setImageHint("图片来源：免费生图（外网）；如加载失败请换网络");
        else if (provider) setImageHint("图片来源：占位图（图片生成服务不可用）");
        if (provider === "placeholder") {
          const urls = pollinationsUrls(buildImagePrompt(), sizePreset);
          setImages(urls);
          setImageHint("图片来源：免费生图（外网）；如加载失败请换网络");
        }
      }
      if (r1.ok || r2.ok) {
        setIsGenerating(false);
        return;
      }
    } catch (e) {
      console.error(e);
    }
    const styleLabel =
      genStyle === "xhs" ? "小红书风" : genStyle === "douyin" ? "抖音风" : "微信公众号风";
    const lines = [
      `【${styleLabel}】${prodName || "某产品"}推荐`,
      `目标人群：${audience || "泛用户"}`,
      `核心卖点：${sellingPoints || "更智能/更高效/更实惠"}`,
      "",
      "标题建议：",
      `1. ${prodName || "产品"}让工作提效200%`,
      `2. 3个理由爱上${prodName || "它"}`,
      "",
      "正文示例：",
      `${prodName || "这款产品"}基于AI能力，针对${audience || "你的需求"}，提供${sellingPoints || "一站式解决方案"}。上手快、见效快，适合新手与进阶用户。`,
      "#AI #效率 #好物推荐",
    ];
    const text = lines.join("\n");
    const html = `<h3>${prodName || "产品"}推荐</h3><p>${lines.slice(1).join("<br/>")}</p>`;
    setBody(genFormat === "text" ? text : html);

    const urls = pollinationsUrls(buildImagePrompt(), sizePreset);
    setImages(urls);
    setImageHint("图片来源：免费生图（外网）；如加载失败请换网络");
    setIsGenerating(false);
  }

  function styleToPlatform() {
    if (genStyle === "douyin") return "douyin";
    if (genStyle === "wechat") return "wechat_mp";
    return "xiaohongshu";
  }

  function syncToLeads() {
    const title = prodName ? `${prodName}：图文内容` : "未命名产品：图文内容";
    const item = addContent({
      type: "copy",
      title,
      body: body || "（空内容）",
      platformStyle: styleToPlatform(),
      images,
    });
    markContentSynced(item.id);
    setSyncedHint("已自动同步至「获客」模块");
  }

  function parseCsvAndPreview() {
    const rows = batchCsv
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split(","));
    if (rows.length === 0) return;
    const previews = rows.slice(0, 3).map((cols) => cols[0] || "未命名产品");
    setBody(`批量预览（前3条）：\n- ${previews.join("\n- ")}`);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <Card className="md:col-span-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("studio.list.title")}</CardTitle>
            <Button size="sm" onClick={handleNew}>{t("studio.new")}</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.placeholder.searchTitleTag")} />
            <Tabs
              tabs={[
                { key: "draft", label: t("studio.tab.draft") },
                { key: "submitted", label: t("studio.tab.submitted") },
                { key: "rejected", label: t("studio.tab.rejected") },
              ]}
              value={tab}
              onChange={setTab}
            />

            <div className="space-y-2">
              {list.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-zinc-400">
                  {t("studio.empty")}
                </div>
              ) : (
                list.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedId === d.id
                        ? "border-amber-400/30 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-zinc-100">{d.title}</div>
                      <div className="shrink-0">{statusBadge(t, d.status)}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">更新：{new Date(d.updatedAt).toLocaleString()}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("studio.editor.title")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={mockGenerate} disabled={isGenerating}>
                {isGenerating ? "生成中..." : t("studio.aiGenerate")}
              </Button>
              <Button size="sm" onClick={syncToLeads} disabled={!body && images.length === 0 || isGenerating}>
                {t("studio.syncToLeads")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="text-sm text-zinc-300">{t("studio.selectHint")}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.productName")}</div>
                  <Input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="如：智能电动牙刷" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.sellingPoints")}</div>
                  <Input value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} placeholder="如：高频震动/长续航" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.audience")}</div>
                  <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="如：年轻上班族" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.style")}</div>
                  <Select
                    value={genStyle}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "xhs" || v === "douyin" || v === "wechat") setGenStyle(v);
                    }}
                  >
                    <option value="xhs">{t("studio.style.xhs")}</option>
                    <option value="douyin">{t("studio.style.douyin")}</option>
                    <option value="wechat">{t("studio.style.wechat")}</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.format")}</div>
                  <Select
                    value={genFormat}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "text" || v === "html") setGenFormat(v);
                    }}
                  >
                    <option value="text">{t("studio.format.text")}</option>
                    <option value="html">{t("studio.format.html")}</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.imageSize")}</div>
                  <Select
                    value={sizePreset}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "3_4" || v === "9_16") setSizePreset(v);
                    }}
                  >
                    <option value="3_4">{t("studio.size.xhs")}</option>
                    <option value="9_16">{t("studio.size.douyin")}</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.title")}</div>
                  <Input value={selected.title} readOnly />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.state")}</div>
                  <div className="flex h-10 items-center">{statusBadge(t, selected.status)}</div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.body")}</div>
                <textarea
                  className="h-56 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                  placeholder="生成结果会填入此处（纯文本或HTML）"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">{t("studio.form.images")}</div>
                <div className="grid grid-cols-3 gap-3">
                  {isGenerating ? (
                    <div className="col-span-3 rounded-md border border-dashed border-white/15 p-6 text-center text-xs text-amber-400/80">
                      AI 正在为您生成图片，请耐心等待（约 10~15 秒）...
                    </div>
                  ) : images.length === 0 ? (
                    <div className="col-span-3 rounded-md border border-dashed border-white/15 p-6 text-center text-xs text-zinc-400">
                      点击“AI生成”后展示图片
                    </div>
                  ) : (
                    images.map((src, idx) => (
                      <img 
                        key={`${src}_${idx}`} 
                        src={src} 
                        alt="img" 
                        className="h-40 w-full cursor-pointer rounded-md object-cover transition-opacity hover:opacity-80" 
                        onClick={() => setPreviewImage(src)}
                        onError={() => ensureImageFallback(idx, src)}
                        referrerPolicy="no-referrer"
                      />
                    ))
                  )}
                </div>
                {imageHint ? <div className="mt-2 text-xs text-zinc-400">{imageHint}</div> : null}
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
                {syncedHint ?? "生成结果可一键同步到「获客」，用于多平台发布。"}
              </div>

              <div className="space-y-2">
                <div className="mb-1 text-xs font-medium text-zinc-300">批量生成（CSV，每行：产品名,卖点,人群）</div>
                <textarea
                  className="h-28 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                  placeholder="示例：\n电动牙刷,高频震动/长续航,上班族\n颈部按摩仪,恒温热敷/便携,久坐人群"
                  value={batchCsv}
                  onChange={(e) => setBatchCsv(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={parseCsvAndPreview}>
                    解析预览（占位）
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!previewImage}
        title="图片预览"
        onClose={() => setPreviewImage(null)}
      >
        {previewImage && (
          <div className="flex justify-center">
            <img
              src={previewImage}
              alt="preview"
              className="max-h-[70vh] rounded-md object-contain"
              onError={() => setPreviewImage(svgPlaceholderDataUri(prodName || "某产品", sizePreset, 0))}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

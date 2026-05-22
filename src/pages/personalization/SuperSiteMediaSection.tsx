import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  updateMySuperSiteSettings,
  uploadMySuperSiteImage,
  uploadMySuperSiteVideo,
} from "@/lib/superSiteSettings";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useAppStore } from "@/store/appStore";
import DraftMediaPickerModal from "./DraftMediaPickerModal";

type ImageSlotDefinition = {
  slotKey: string;
  moduleKey: string;
  label: string;
  description: string;
};

const IMAGE_SLOT_DEFINITIONS: ImageSlotDefinition[] = [
  {
    slotKey: "home.hero_main",
    moduleKey: "home",
    label: "首页头部照片",
    description: "首页首屏右侧主视觉大图",
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    slotKey: `home.marquee_${index + 1}`,
    moduleKey: "home",
    label: `滚动条图片 ${String(index + 1).padStart(2, "0")}`,
    description: "按顺序展示，后台内固定排序",
  })),
];

function buildImageDrafts(
  siteImageSlots: Array<{
    slotKey: string;
    moduleKey: string;
    imageUrl: string;
  }>
) {
  return IMAGE_SLOT_DEFINITIONS.reduce<Record<string, string>>((acc, item) => {
    const matched = siteImageSlots.find((slot) => slot.slotKey === item.slotKey);
    acc[item.slotKey] = matched?.imageUrl ?? "";
    return acc;
  }, {});
}

export default function SuperSiteMediaSection() {
  const settings = useAppStore((s) => s.settings);
  const replaceSettings = useAppStore((s) => s.replaceSettings);
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [posterUrlDraft, setPosterUrlDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const [savedKey, setSavedKey] = useState<"images" | "video" | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: "image" | "video"; slotKey?: string }>({ open: false, type: "image" });
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const posterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImageDrafts(buildImageDrafts(settings.siteImageSlots));
    setVideoUrlDraft(settings.siteVideoSettings?.videoUrl ?? "");
    setPosterUrlDraft(settings.siteVideoSettings?.posterUrl ?? "");
  }, [settings]);

  const orderedImageSlots = useMemo(
    () =>
      IMAGE_SLOT_DEFINITIONS.map((item) => ({
        ...item,
        imageUrl: imageDrafts[item.slotKey] ?? "",
      })),
    [imageDrafts]
  );

  function markSaved(key: "images" | "video") {
    setSavedKey(key);
    window.setTimeout(() => {
      setSavedKey((current) => (current === key ? null : current));
    }, 1600);
  }

  async function handleUploadImage(slotKey: string, file?: File | null) {
    if (!file) return;
    setUploadingKey(slotKey);
    setErrorMessage(null);
    try {
      const url = await uploadMySuperSiteImage(file);
      setImageDrafts((prev) => ({
        ...prev,
        [slotKey]: url,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传图片失败");
    } finally {
      setUploadingKey((current) => (current === slotKey ? null : current));
    }
  }

  async function handleUploadVideo(file?: File | null) {
    if (!file) return;
    setUploadingKey("video");
    setErrorMessage(null);
    try {
      const url = await uploadMySuperSiteVideo(file);
      setVideoUrlDraft(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传视频失败");
    } finally {
      setUploadingKey((current) => (current === "video" ? null : current));
    }
  }

  async function handleUploadPoster(file?: File | null) {
    if (!file) return;
    setUploadingKey("poster");
    setErrorMessage(null);
    try {
      const url = await uploadMySuperSiteImage(file);
      setPosterUrlDraft(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传封面失败");
    } finally {
      setUploadingKey((current) => (current === "poster" ? null : current));
    }
  }

  async function handleSaveImages() {
    setSavingImages(true);
    setErrorMessage(null);
    try {
      const payload = await updateMySuperSiteSettings({
        siteImageSlots: IMAGE_SLOT_DEFINITIONS.map((item) => ({
          slotKey: item.slotKey,
          moduleKey: item.moduleKey,
          imageUrl: (imageDrafts[item.slotKey] ?? "").trim(),
          sourceContentId: null,
          updatedAt: new Date().toISOString(),
        })).filter((item) => item.imageUrl),
      });
      replaceSettings(payload);
      markSaved("images");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存图文设置失败");
    } finally {
      setSavingImages(false);
    }
  }

  async function handleSaveVideo() {
    setSavingVideo(true);
    setErrorMessage(null);
    try {
      const payload = await updateMySuperSiteSettings({
        siteVideoSettings: {
          videoUrl: videoUrlDraft.trim(),
          posterUrl: posterUrlDraft.trim(),
        },
      });
      replaceSettings(payload);
      markSaved("video");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存视频设置失败");
    } finally {
      setSavingVideo(false);
    }
  }

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>图片视频设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">图片设置</div>
                <div className="text-xs text-zinc-400">设置首页头部照片与滚动条图片，按固定顺序替换。</div>
              </div>
              <Button size="sm" onClick={() => void handleSaveImages()} disabled={savingImages}>
                {savingImages ? "保存中..." : savedKey === "images" ? "已保存" : "保存图片设置"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3 mb-4 xl:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{orderedImageSlots[0].label}</div>
                    <div className="text-xs text-zinc-500">{orderedImageSlots[0].description}（建议 9:16 竖屏比例）</div>
                  </div>
                </div>
                <div
                  className="group relative mx-auto mb-3 h-72 w-48 rounded-lg border border-white/10 bg-zinc-950/40 bg-cover bg-center overflow-hidden"
                  style={orderedImageSlots[0].imageUrl ? { backgroundImage: `url("${orderedImageSlots[0].imageUrl}")` } : undefined}
                >
                  {!orderedImageSlots[0].imageUrl ? (
                    <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-500">
                      <span>暂未设置图片</span>
                      <span className="text-xs opacity-60 mt-1">9:16 竖图</span>
                    </div>
                  ) : null}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-3">
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="本地上传"
                        onClick={() => imageInputRefs.current[orderedImageSlots[0].slotKey]?.click()}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="从图文草稿箱选择"
                        onClick={() => setPickerConfig({ open: true, type: "image", slotKey: orderedImageSlots[0].slotKey })}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </button>
                    </div>
                    {orderedImageSlots[0].imageUrl && (
                      <button
                        className="flex h-6 items-center justify-center rounded-full bg-red-500/20 px-3 text-xs text-red-200 hover:bg-red-500/40 transition-colors"
                        onClick={() => setImageDrafts(p => ({ ...p, [orderedImageSlots[0].slotKey]: "" }))}
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="xl:col-span-2">
                <div className="mb-2 text-sm font-medium text-zinc-100">滚动条图片</div>
                <div className="mb-3 text-xs text-zinc-500">按顺序展示，后台内固定排序。鼠标移至图片上可进行替换。</div>
                <div className="flex gap-3 overflow-x-auto pb-4 pt-2">
                  {orderedImageSlots.slice(1).map((item) => (
                    <div
                      key={item.slotKey}
                      className="group relative h-32 w-40 shrink-0 rounded-lg border border-white/10 bg-zinc-950/40 bg-cover bg-center overflow-hidden"
                      style={item.imageUrl ? { backgroundImage: `url("${item.imageUrl}")` } : undefined}
                    >
                      {!item.imageUrl && (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-500">未设置</div>
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex gap-2">
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"
                            title="本地上传"
                            onClick={() => imageInputRefs.current[item.slotKey]?.click()}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"
                            title="从图文草稿箱选择"
                            onClick={() => setPickerConfig({ open: true, type: "image", slotKey: item.slotKey })}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                        {item.imageUrl && (
                          <button
                            className="flex h-6 items-center justify-center rounded-full bg-red-500/20 px-2 text-xs text-red-200 hover:bg-red-500/40"
                            onClick={() => setImageDrafts(p => ({ ...p, [item.slotKey]: "" }))}
                          >
                            清空
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Hidden file inputs for images */}
            {orderedImageSlots.map((item) => (
              <input
                key={`input-${item.slotKey}`}
                ref={(node) => {
                  imageInputRefs.current[item.slotKey] = node;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleUploadImage(item.slotKey, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">视频设置</div>
                <div className="text-xs text-zinc-400">设置首页视频地址与封面地址，也支持直接上传。</div>
              </div>
              <Button size="sm" onClick={() => void handleSaveVideo()} disabled={savingVideo}>
                {savingVideo ? "保存中..." : savedKey === "video" ? "已保存" : "保存视频设置"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="mb-2 text-sm font-medium text-zinc-100">招商视频封面</div>
                <div className="text-xs text-zinc-500 mb-2">前台招商加盟视频的背景海报，建议使用 9:16 比例的竖屏大图。</div>
                <div className="group relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-black/20 h-72 w-48">
                  {posterUrlDraft ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url("${posterUrlDraft}")` }}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-500">
                      <span>暂未设置封面</span>
                      <span className="text-xs opacity-60 mt-1">9:16 竖屏比例</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-3">
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="本地上传"
                        onClick={() => posterInputRef.current?.click()}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="从图文草稿箱选择"
                        onClick={() => setPickerConfig({ open: true, type: "image", slotKey: "poster" })}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </button>
                    </div>
                    {posterUrlDraft && (
                      <button
                        className="flex h-6 items-center justify-center rounded-full bg-red-500/20 px-3 text-xs text-red-200 hover:bg-red-500/40 transition-colors"
                        onClick={() => setPosterUrlDraft("")}
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="mb-2 text-sm font-medium text-zinc-100">招商展示视频</div>
                <div className="text-xs text-zinc-500 mb-2">前台招商加盟区的核心展示视频，建议使用竖屏 MP4 格式，大小不超过 200MB。</div>
                <div className="group relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-black/20 h-72 w-48">
                  {videoUrlDraft ? (
                    <video
                      key={`${videoUrlDraft}-${posterUrlDraft}`}
                      className="h-full w-full bg-black object-cover"
                      src={videoUrlDraft}
                      poster={posterUrlDraft || undefined}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-500">
                      <span>暂未设置视频</span>
                      <span className="text-xs opacity-60 mt-1">竖屏视频展示区</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-3">
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="本地上传"
                        onClick={() => videoInputRef.current?.click()}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                        title="从视频草稿箱选择"
                        onClick={() => setPickerConfig({ open: true, type: "video" })}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                    </div>
                    {videoUrlDraft && (
                      <button
                        className="flex h-6 items-center justify-center rounded-full bg-red-500/20 px-3 text-xs text-red-200 hover:bg-red-500/40 transition-colors"
                        onClick={() => setVideoUrlDraft("")}
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Hidden file inputs for video & poster */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  void handleUploadVideo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={posterInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleUploadPoster(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            
            <DraftMediaPickerModal
              open={pickerConfig.open}
              type={pickerConfig.type}
              onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
              onSelect={(url) => {
                if (pickerConfig.type === "image") {
                  if (pickerConfig.slotKey === "poster") {
                    setPosterUrlDraft(url);
                  } else if (pickerConfig.slotKey) {
                    setImageDrafts((prev) => ({
                      ...prev,
                      [pickerConfig.slotKey!]: url,
                    }));
                  }
                } else {
                  setVideoUrlDraft(url);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

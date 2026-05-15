import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Info, MessageSquareText, Sparkles, UploadCloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import AssetPreviewStrip from "@/components/ui/AssetPreviewStrip";
import { cn } from "@/lib/utils";
import { extractKeyPointsFromText, extractTextFromDocument } from "@/lib/documentText";
import { usePageMeta } from "@/hooks/usePageMeta";
import { estimateProductEta, formatClock, formatMmSs } from "@/lib/videoEta";
import {
  createAvatarVideoTask,
  createVideoDraft,
  expandAvatarVideoScript,
  generateAiCopy,
  generatePlatformMeta,
  generateAiVideo,
  getAvatarVideoTaskStatus,
  getVideoTaskStatus,
  listVideoDrafts,
  polishPrompt,
  recommendBgm,
  retryAvatarVideoTask,
  updateVideoDraft,
  type AvatarVideoTaskStatusResponse,
} from "@/lib/ai";
import { toVideoDraftItem } from "@/lib/videoDraftMapper";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useModelConfigStore } from "@/store/modelConfigStore";
import { useVideoDraftStore, type VideoDraftItem, type VideoDraftSource } from "@/store/videoDraftStore";
import { useVideoWorkspaceStore, type WorkspaceUploadAsset, type VideoWorkspaceDraft } from "@/store/videoWorkspaceStore";
import { isAvatarVoiceEnabled, resolveAvatarVoiceIdForSubmit } from "@/components/video/avatarVoice";

type UploadAsset = WorkspaceUploadAsset;

type ViduVoiceOption = {
  label: string;
  value: string;
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
  enableViduVoiceSelection?: boolean;
  viduVoiceOptions?: ReadonlyArray<ViduVoiceOption>;
  draftSource: VideoDraftSource;
};

const DEMO_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const PRODUCT_VIDEO_TEMPLATES = [
  {
    key: "fashion_outfit_swap",
    title: "服装行业-一键换装",
    promptText: "服装行业-一键换装",
    copyPromptText: "服装行业-一键换装",
    copyResultText: "服装行业-一键换装",
    videoUrl: DEMO_VIDEO_URL,
    loadingMs: 10_000,
    description: "选择后直接套用预设结果，10 秒后返回模板视频。",
  },
] as const;

const ENABLE_PRODUCT_VIDEO_TEMPLATE = false;

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

function isRatioWithinLimits(width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  return ratio >= 0.25 && ratio <= 4;
}

function platformLabel(value: VideoWorkspaceDraft["platformStyle"]) {
  if (value === "xiaohongshu") return "小红书";
  if (value === "wechat_mp") return "视频号";
  if (value === "douyin") return "抖音";
  return "平台";
}

function platformPolishKey(value: VideoWorkspaceDraft["platformStyle"]) {
  if (value === "xiaohongshu" || value === "wechat_mp" || value === "douyin") {
    return value;
  }
  return "douyin";
}

function platformCopyKey(value: VideoWorkspaceDraft["platformStyle"]) {
  if (value === "xiaohongshu") return "xhs";
  if (value === "wechat_mp") return "wechat";
  return "douyin";
}

function appendPlatformHint(base: string, value: VideoWorkspaceDraft["platformStyle"]) {
  const label = platformLabel(value);
  const hint =
    value === "xiaohongshu"
      ? "风格：小红书种草分享，口吻真诚自然，信息点清晰，避免夸张与虚构。"
      : value === "wechat_mp"
        ? "风格：视频号偏可信与信息密度，表达稳重清晰；如需数据/背书仅能使用原文提供信息。"
        : "风格：抖音短视频节奏快，强开场钩子、短句、高频关键词、结尾强行动引导。";
  const visualGuide =
    "画面指引：以首帧产品为主体做轻微推进/环绕/切换细节；字幕同步口播关键句；突出 1-3 个卖点关键词；结尾展示品牌与行动引导（如有）。";
  return `${base}\n\n平台风格：${label}。${hint}\n${visualGuide}`;
}

function getProductDurationGuide(durationSec: number) {
  const seconds = Math.max(2, Math.min(16, Math.round(durationSec || 5)));
  const charMin = Math.max(12, Math.round(seconds * 4));
  const charMax = Math.max(charMin + 8, Math.round(seconds * 7));
  const sentenceCount =
    seconds <= 4 ? "1-2" : seconds <= 8 ? "2-3" : seconds <= 12 ? "3-4" : "4-5";
  const pacing =
    seconds <= 4
      ? "快节奏，开场即卖点，少铺垫。"
      : seconds <= 8
        ? "节奏紧凑，1 个核心卖点 + 1 个使用场景。"
        : seconds <= 12
          ? "中快节奏，突出 2 个卖点并保留一句 CTA。"
          : "适合更完整地讲清场景、卖点和行动引导，但仍要避免重复。";
  return {
    seconds,
    charMin,
    charMax,
    sentenceCount,
    pacing,
    summary: `建议控制在 ${charMin}-${charMax} 字，约 ${sentenceCount} 句。${pacing}`,
  };
}

function appendProductDurationHint(base: string, durationSec: number) {
  const guide = getProductDurationGuide(durationSec);
  return `${base}\n\n时长要求：目标成片约 ${guide.seconds} 秒。\n文案要求：口播控制在 ${guide.charMin}-${guide.charMax} 个中文字符，约 ${guide.sentenceCount} 句，句子尽量短，信息密度高，避免超时。\n节奏要求：${guide.pacing}`;
}

function appendAvatarVideoHint(base: string, targetSeconds: number) {
  const seconds = Math.max(10, Math.min(300, Math.round(Number(targetSeconds) || 30)));
  return `${base}\n\n视频生成要求：这是用于真人口播视频生成的提示词，请在不改变原意的前提下，自动补全缺失的主体设定、镜头节奏、画面连贯性、字幕节奏和结尾收束等必要提示。\n成片要求：目标成片约 ${seconds} 秒，表达口语化、自然分段，适合数字人口播视频。`;
}

function normalizePlatformCopyText(input: string) {
  let text = String(input ?? "").trim();
  if (!text) return "";
  text = text.trim().replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim();

  const lines = text.split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  const headingRe = /^(#{1,6}\s*)?(【\s*)?(口播文案|文案内容)(\s*】)?\s*[:：]?\s*$/i;
  if (headingRe.test(first)) {
    const rest = lines.slice(1).join("\n").trim();
    return rest;
  }
  const prefixRe = /^(#{1,6}\s*)?(【\s*)?(口播文案|文案内容)(\s*】)?\s*[:：]\s*/i;
  text = text.replace(prefixRe, "").trim();
  return text;
}

function clampCopyLength(text: string, maxChars: number) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const max = Math.max(1, Math.round(Number(maxChars) || 1));
  if (raw.length <= max) return raw;
  return raw
    .slice(0, max)
    .replace(/[，,、；;:：\s]+$/g, "")
    .trim();
}

function extractSpeechContentFromProductPrompt(input: string) {
  const raw = String(input ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index].trim();
    const matched = current.match(/^(?:【\s*)?(语音内容|旁白|配音内容|配音文案|口播内容|口播文案)(?:\s*】)?\s*[:：]\s*(.*)$/i);
    if (!matched) continue;
    const inline = matched[2]?.trim() ?? "";
    const rest = lines.slice(index + 1).join("\n").trim();
    return [inline, rest].filter(Boolean).join("\n").trim();
  }
  const structuredLineCount = lines.filter((line) => /^[^:\n：]{1,24}[:：]\s*.*$/.test(line.trim())).length;
  if (structuredLineCount >= 3) {
    return "";
  }
  return raw;
}

function stripProductAutoHints(input: string) {
  const raw = String(input ?? "").replace(/\r\n/g, "\n");
  const markers = ["\n\n时长要求：", "\n\n文案要求：", "\n\n节奏要求：", "\n\n平台风格：", "\n\n画面指引："];
  let cutIndex = -1;
  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx === -1) continue;
    cutIndex = cutIndex === -1 ? idx : Math.min(cutIndex, idx);
  }
  const sliced = (cutIndex === -1 ? raw : raw.slice(0, cutIndex)).trim();
  return sliced || raw.trim();
}

function normalizeAvatarErrorMessage(message: string) {
  const normalized = message
    .replace(/\s*\(trace_id:[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "未知错误";
  if (/invalid field|unknown field|unsupported field/i.test(normalized)) {
    return "当前视频参数组合不受支持，请调整提示词、语音内容或视频参数后重试。";
  }
  if (/AuditSubmitIllegal/i.test(normalized)) {
    return "当前内容未通过上游平台审核，请调整文案或画面描述后重试。";
  }
  if (/timeout|timed out|超时/i.test(normalized)) {
    return "视频生成超时，请稍后重试。";
  }
  return normalized;
}

function formatVideoStatusLabel(status: string | null | undefined) {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "pending") return "待提交";
  if (value === "submitted") return "已提交";
  if (value === "processing") return "生成中";
  if (value === "success") return "成功";
  if (value === "failure" || value === "failed") return "失败";
  if (value === "ready" || value === "completed") return "已完成";
  if (value === "queued") return "排队中";
  return status ? String(status) : "未知";
}

function summarizeAvatarFailures(detail: AvatarVideoTaskStatusResponse | null) {
  if (!detail) return [];
  const groups = new Map<string, { message: string; count: number; sequenceOrders: number[] }>();
  detail.segments
    .filter((segment) => segment.status === "failure")
    .forEach((segment) => {
      const message = normalizeAvatarErrorMessage(segment.errorMessage?.trim() || "未知错误");
      const current = groups.get(message) ?? { message, count: 0, sequenceOrders: [] };
      current.count += 1;
      current.sequenceOrders.push(segment.sequenceOrder + 1);
      groups.set(message, current);
    });

  return Array.from(groups.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.sequenceOrders[0] - b.sequenceOrders[0];
  });
}

export default function VideoGenerationWorkspace(props: WorkspaceProps) {
  usePageMeta(props.pageTitle);

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const textModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "text") ?? null);
  const videoModelConfig = useModelConfigStore((s) => s.configs.find((item) => item.type === "video") ?? null);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const replaceDrafts = useVideoDraftStore((s) => s.replaceItems);
  const prependDraft = useVideoDraftStore((s) => s.prependItem);
  const updateDraft = useVideoDraftStore((s) => s.updateItem);
  const draftItems = useVideoDraftStore((s) => s.items);
  const isAgent = user?.roleKey === "level1_agent";
  const draft = useVideoWorkspaceStore((s) => s.drafts[props.draftSource]);
  const ensureDraft = useVideoWorkspaceStore((s) => s.ensureDraft);
  const setDraftField = useVideoWorkspaceStore((s) => s.setField);
  const appendAssetsToDraft = useVideoWorkspaceStore((s) => s.appendAssets);
  const removeAssetFromDraft = useVideoWorkspaceStore((s) => s.removeAsset);
  const clearDraftAssets = useVideoWorkspaceStore((s) => s.clearAssets);

  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const assetMediaInputRef = useRef<HTMLInputElement | null>(null);
  const assetDocInputRef = useRef<HTMLInputElement | null>(null);
  const avatarDocInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const defaults: VideoWorkspaceDraft = {
      question: "",
      productTemplateKey: "",
      avatarCopyText: "",
      productTtsText: "",
      productSubtitleEnabled: false,
      productCopyPrompt: "",
      productCopyText: "",
      publishTitle: "",
      publishTags: [],
      platformStyle: "douyin",
      avatarTargetSeconds: 30,
      backgroundLock: true,
      style: "专业风",
      scene: props.defaultScene ?? "产品讲解",
      durationSec: props.defaultDurationSec ?? 30,
      voice: props.defaultVoice ?? "女声·亲和",
      ratio: "9:16",
      resolution: "1080p",
      assets: [],
      voiceId: "",
      movementAmplitude: "auto",
      bgmEnabled: false,
      bgmUrl: "",
      bgmTitle: "",
      bgmVolume: 0.25,
    };
    ensureDraft(props.draftSource, defaults);
  }, [
    ensureDraft,
    props.defaultDurationSec,
    props.defaultScene,
    props.defaultVoice,
    props.draftSource,
    props.enableViduVoiceSelection,
    props.viduVoiceOptions,
  ]);

  const question = draft?.question ?? "";
  const productTemplateKey = draft?.productTemplateKey ?? "";
  const avatarCopyText = draft?.avatarCopyText ?? "";
  const productTtsText = draft?.productTtsText ?? "";
  const productSubtitleEnabled = draft?.productSubtitleEnabled ?? false;
  const productCopyPrompt = draft?.productCopyPrompt ?? "";
  const productCopyText = draft?.productCopyText ?? "";
  const workspacePublishTitle = draft?.publishTitle ?? "";
  const workspacePublishTags = draft?.publishTags ?? [];
  const platformStyle = draft?.platformStyle ?? "douyin";
  const avatarTargetSeconds = draft?.avatarTargetSeconds ?? 30;
  const backgroundLock = draft?.backgroundLock ?? true;
  const style = draft?.style ?? "专业风";
  const scene = draft?.scene ?? (props.defaultScene ?? "产品讲解");
  const durationSec = draft?.durationSec ?? (props.defaultDurationSec ?? 30);
  const voice = draft?.voice ?? (props.defaultVoice ?? "女声·亲和");
  const ratio = draft?.ratio ?? "9:16";
  const resolution = draft?.resolution ?? "1080p";
  const assets = draft?.assets ?? [];
  const voiceId = draft?.voiceId ?? "";
  const movementAmplitude = draft?.movementAmplitude ?? "auto";
  const bgmEnabled = draft?.bgmEnabled ?? false;
  const bgmUrl = draft?.bgmUrl ?? "";
  const bgmTitle = draft?.bgmTitle ?? "";
  const bgmVolume = draft?.bgmVolume ?? 0.25;

  const [isDragActive, setIsDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isGeneratingProductCopy, setIsGeneratingProductCopy] = useState(false);
  const [isRecommendingBgm, setIsRecommendingBgm] = useState(false);
  const [isExpandingAvatarScript, setIsExpandingAvatarScript] = useState(false);
  const [polishHint, setPolishHint] = useState<string | null>(null);
  const [assetHint, setAssetHint] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<UploadAsset | null>(null);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorValue, setPromptEditorValue] = useState("");
  const [promptEditorHint, setPromptEditorHint] = useState<string | null>(null);
  const [copyResultEditorOpen, setCopyResultEditorOpen] = useState(false);
  const [copyResultEditorValue, setCopyResultEditorValue] = useState("");
  const [polishHelpOpen, setPolishHelpOpen] = useState(false);
  const isAvatarMode = props.draftSource === "avatar_video";
  const isProductMode = props.draftSource === "product_video";
  const enableProductBgm = false;
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoiceMode, setTtsVoiceMode] = useState<"preset" | "custom">("preset");
  const [metaEditorTitle, setMetaEditorTitle] = useState("");
  const [metaEditorTags, setMetaEditorTags] = useState("");

  const selectedProductTemplate = useMemo(() => {
    if (!ENABLE_PRODUCT_VIDEO_TEMPLATE || !isProductMode) return null;
    return PRODUCT_VIDEO_TEMPLATES.find((item) => item.key === productTemplateKey) ?? null;
  }, [isProductMode, productTemplateKey]);

  const parseTagText = (raw: string) => {
    const normalized = String(raw ?? "")
      .replace(/[，、]/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return [] as string[];
    const parts = normalized
      .split(/[,\n ]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.startsWith("#") ? item.slice(1) : item))
      .filter(Boolean);
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of parts) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 20) break;
    }
    return deduped;
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function hydrateDrafts() {
      try {
        const records = await listVideoDrafts(accessToken);
        if (cancelled) return;
        replaceDrafts(records.map(toVideoDraftItem));
      } catch {
        // Ignore refresh errors here and keep the current local snapshot.
      }
    }

    void hydrateDrafts();
    return () => {
      cancelled = true;
    };
  }, [accessToken, replaceDrafts]);

  useEffect(() => {
    if (isProductMode) {
      setTtsEnabled(false);
    }
  }, [isProductMode]);

  const resolutionOptions = useMemo(
    () => {
      const model = videoModelConfig?.modelName?.toLowerCase() ?? "";
      if (isAvatarMode) {
        if (model.includes("viduq1")) return ["1080p"] as Array<"1080p">;
        if (model.includes("vidu2.0")) return ["720p"] as Array<"720p">;
        return ["540p", "720p", "1080p"] as Array<"540p" | "720p" | "1080p">;
      }
      return ["360p", "540p", "720p", "1080p"] as Array<"360p" | "540p" | "720p" | "1080p">;
    },
    [isAvatarMode, videoModelConfig?.modelName]
  );

  const productDurationOptions = useMemo(() => {
    const model = videoModelConfig?.modelName?.toLowerCase() ?? "";
    if (model.includes("viduq1")) return [5];
    if (model.includes("vidu2.0")) return [4];
    return [2, 3, 4, 5, 6, 8, 10, 12, 16];
  }, [videoModelConfig?.modelName]);

  const productResolutionOptions = useMemo(() => {
    const model = videoModelConfig?.modelName?.toLowerCase() ?? "";
    if (model.includes("viduq1")) return ["1080p"] as Array<"1080p">;
    if (model.includes("vidu2.0")) return ["360p", "720p"] as Array<"360p" | "720p">;
    return ["1080p", "720p"] as Array<"1080p" | "720p">;
  }, [videoModelConfig?.modelName]);

  const productDurationGuide = useMemo(() => {
    if (!isProductMode) return null;
    return getProductDurationGuide(durationSec);
  }, [durationSec, isProductMode]);

  const avatarVoiceEnabled = isAvatarMode
    ? isAvatarVoiceEnabled({
        enableViduVoiceSelection: props.enableViduVoiceSelection,
        voiceId,
        legacyTtsEnabled: ttsEnabled,
      })
    : false;

  async function persistDraftPatch(id: string, patch: Partial<VideoDraftItem>) {
    updateDraft(id, patch);
    if (!accessToken) {
      return;
    }
    const saved = await updateVideoDraft({
      accessToken,
      id,
      title: patch.title,
      platformStyle: patch.platformStyle,
      publishTitle: patch.publishTitle,
      publishTags: patch.publishTags,
      durationText: patch.durationText,
      generatedScript: patch.generatedScript,
      videoUrl: patch.videoUrl,
      taskId: patch.taskId,
      provider: patch.provider,
      model: patch.model,
      errorMessage: patch.errorMessage,
      status: patch.status,
      syncedToLeads: patch.syncedToLeads,
      completedAt: patch.completedAt,
    });
    updateDraft(id, toVideoDraftItem(saved));
  }

  async function createPersistedDraft(input: {
    source: VideoDraftSource;
    title: string;
    platformStyle?: string;
    durationText: string;
    generatedScript: string;
    publishTitle?: string;
    publishTags?: string[];
    status?: VideoDraftItem["status"];
  }) {
    if (!accessToken) {
      throw new Error("请先登录");
    }
    const created = await createVideoDraft({
      accessToken,
      source: input.source,
      title: input.title,
      platformStyle: input.platformStyle,
      publishTitle: input.publishTitle,
      publishTags: input.publishTags,
      durationText: input.durationText,
      generatedScript: input.generatedScript,
      status: input.status ?? "processing",
    });
    const next = toVideoDraftItem(created);
    prependDraft(next);
    return next;
  }

  useEffect(() => {
    if (!resolutionOptions.includes(resolution)) {
      setDraftField(props.draftSource, "resolution", resolutionOptions[resolutionOptions.length - 1] ?? "1080p");
    }
  }, [props.draftSource, resolution, resolutionOptions, setDraftField]);

  useEffect(() => {
    if (!isProductMode) return;
    if (!productDurationOptions.includes(durationSec)) {
      setDraftField(props.draftSource, "durationSec", productDurationOptions[0] ?? 5);
    }
  }, [durationSec, isProductMode, productDurationOptions, props.draftSource, setDraftField]);

  useEffect(() => {
    if (!isAvatarMode) return;
    const next = Math.max(10, Math.min(300, Number.isFinite(avatarTargetSeconds) ? avatarTargetSeconds : 30));
    if (next !== avatarTargetSeconds) {
      setDraftField(props.draftSource, "avatarTargetSeconds", next);
    }
  }, [avatarTargetSeconds, isAvatarMode, props.draftSource, setDraftField]);

  useEffect(() => {
    if (!isProductMode) return;
    if (!productResolutionOptions.includes(resolution as any)) {
      setDraftField(props.draftSource, "resolution", (productResolutionOptions[0] ?? "1080p") as any);
    }
  }, [isProductMode, productResolutionOptions, props.draftSource, resolution, setDraftField]);

  async function polishPromptText(text: string) {
    const raw = text.trim();
    if (!raw) return raw;
    if (!accessToken) {
      throw new Error("请先登录");
    }
    if (!textModelConfig) {
      throw new Error("未找到文字模型配置");
    }
    const effectiveTextConfig =
      !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
        ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
        : textModelConfig;
    const result = await polishPrompt({
      text: raw,
      mode: props.draftSource,
      platformStyle: platformPolishKey(platformStyle),
      modelConfig: effectiveTextConfig,
      accessToken,
    });
    const next = result.text.trim();
    if (!next) {
      throw new Error("润色失败：未返回有效内容");
    }
    return next;
  }

  async function generateMeta(text: string) {
    const raw = text.trim();
    if (!raw) {
      return null;
    }
    if (!accessToken) {
      throw new Error("请先登录");
    }
    if (!textModelConfig) {
      throw new Error("未找到文字模型配置");
    }
    const effectiveTextConfig =
      !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
        ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
        : textModelConfig;
    return generatePlatformMeta({
      text: raw,
      mode: props.draftSource,
      platformStyle: platformPolishKey(platformStyle),
      modelConfig: effectiveTextConfig,
      accessToken,
    });
  }

  async function generateProductCopyText(raw: string) {
    if (!isProductMode) {
      throw new Error("当前不是产品视频模式");
    }
    if (!accessToken) {
      throw new Error("请先登录");
    }
    if (!textModelConfig) {
      throw new Error("未找到文字模型配置");
    }
    const effectiveTextConfig =
      !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
        ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
        : textModelConfig;
    const copy = await generateAiCopy({
      prompt: [
        `你是一名${platformLabel(platformStyle)}平台文案写作助手。`,
        "请严格根据下面的“文案提示词”生成对应文案。",
        "要求：",
        "1. 优先遵守用户明确提出的字数、篇幅、结构、语气、用途、受众等要求。",
        "2. 如果用户明确要求“500字”“分3段”“带标题”等，必须尽量严格满足。",
        "3. 只输出最终文案结果，不要解释、不要分析、不要额外说明。",
        "4. 如用户没有明确要求长度，再按当前平台风格给出自然、完整的成稿。",
        "",
        "文案提示词：",
        raw,
      ].join("\n"),
      style: platformCopyKey(platformStyle),
      format: "text",
      modelConfig: effectiveTextConfig,
      accessToken,
    });
    return normalizePlatformCopyText(copy.text).slice(0, 2000).trim();
  }

  async function syncProductMeta(text: string) {
    if (!isProductMode) return null;
    const meta = await generateMeta(text);
    if (!meta) return null;
    setDraftField(props.draftSource, "publishTitle", meta.title);
    setDraftField(props.draftSource, "publishTags", meta.tags);
    setMetaEditorTitle(meta.title);
    setMetaEditorTags(meta.tags.map((tag) => `#${tag}`).join(" "));
    if (currentProductTask?.id) {
      await persistDraftPatch(currentProductTask.id, {
        publishTitle: meta.title,
        publishTags: meta.tags,
        title: `${props.cardTitle}｜${platformLabel(platformStyle)}｜${meta.title}`,
      });
    }
    return meta;
  }

  async function handleGenerateProductCopy() {
    if (!isProductMode) return;
    const raw = productCopyPrompt.trim();
    if (!raw) {
      setPolishHint("请先填写文案提示词，再生成文案。");
      return;
    }
    if (isGeneratingProductCopy) return;
    setIsGeneratingProductCopy(true);
    setPolishHint(null);
    try {
      const next = await generateProductCopyText(raw);
      if (!next) {
        setPolishHint("文案生成失败：未返回有效内容");
        return;
      }
      setDraftField(props.draftSource, "productCopyText", next);
      if (currentProductTask?.id) {
        await persistDraftPatch(currentProductTask.id, { generatedScript: next });
      }
      try {
        await syncProductMeta(next);
        setPolishHint("已生成文案内容、标题和标签");
      } catch (error) {
        setPolishHint(
          `已生成文案内容，标题/标签生成失败：${error instanceof Error ? error.message : "请稍后重试"}`
        );
      }
    } catch (error) {
      setPolishHint(error instanceof Error ? error.message : "文案生成失败");
    } finally {
      setIsGeneratingProductCopy(false);
    }
  }

  async function handlePolishPrompt() {
    const raw = question.trim();
    if (!raw) return;
    if (isPolishing) return;

    setIsPolishing(true);
    setPolishHint(null);
    try {
      const polishedBase = await polishPromptText(raw);
      let nextPrompt = polishedBase;
      if (isAvatarMode) {
        nextPrompt = appendAvatarVideoHint(appendPlatformHint(polishedBase, platformStyle), avatarTargetSeconds);
      }
      nextPrompt = nextPrompt.slice(0, 5000);
      setDraftField(props.draftSource, "question", nextPrompt);

      setPolishHint(nextPrompt === raw ? "润色结果与原文一致" : "已润色提示词");
    } catch (error) {
      const message = error instanceof Error ? error.message : "润色失败";
      setPolishHint(message);
    } finally {
      setIsPolishing(false);
    }
  }

  async function handleExpandAvatarScript() {
    if (!isAvatarMode) return;
    const raw = question.trim();
    if (!raw) {
      setPolishHint("请先输入要讲的要点/大纲，再一键生成平台文案");
      return;
    }
    if (!accessToken) {
      setPolishHint("请先登录");
      return;
    }
    if (!textModelConfig) {
      setPolishHint("未找到文字模型配置");
      return;
    }
    if (isExpandingAvatarScript) return;

    setIsExpandingAvatarScript(true);
    setPolishHint(null);
    try {
      const effectiveTextConfig =
        !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
          ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
          : textModelConfig;
      const wrappedPrompt = [
        `请根据下面的“用户提示词”，生成一份适合${platformLabel(platformStyle)}平台的真人口播文案内容。`,
        "要求：",
        "1. 文案内容必须围绕用户提示词展开，不要偏题，不要补充无关信息。",
        "2. 如果用户明确要求字数、篇幅、段落数、结构、语气、用途，请优先严格遵守。",
        "3. 如果用户没有明确要求字数，则默认生成符合用户提示词内容的自然、完整成稿。",
        "4. 只输出最终文案内容，不要解释、不要分析、不要附加说明。",
        "",
        "用户提示词：",
        raw,
      ].join("\n");
      const result = await expandAvatarVideoScript({
        prompt: wrappedPrompt,
        targetSeconds: avatarTargetSeconds,
        platformStyle: platformPolishKey(platformStyle),
        scene,
        style,
        modelConfig: effectiveTextConfig,
        accessToken,
      });
      const next = result.text.trim();
      if (!next) {
        setPolishHint("文案生成失败：未返回有效内容");
        return;
      }
      setDraftField(props.draftSource, "avatarCopyText", next);
      setPolishHint(`已生成约 ${result.targetSeconds} 秒文案`);
    } catch (error) {
      setPolishHint(error instanceof Error ? error.message : "文案生成失败");
    } finally {
      setIsExpandingAvatarScript(false);
    }
  }

  async function handleImportAvatarDoc(event: ChangeEvent<HTMLInputElement>) {
    const file = (event.target.files ?? [])[0];
    event.target.value = "";
    if (!file) return;
    if (!isAvatarMode) return;
    if (!accessToken) {
      setPolishHint("请先登录");
      return;
    }
    if (!textModelConfig) {
      setPolishHint("未找到文字模型配置");
      return;
    }
    if (isExpandingAvatarScript) return;

    setIsExpandingAvatarScript(true);
    setPolishHint(null);
    try {
      const rawText = await extractTextFromDocument(file);
      if (!rawText.trim()) {
        setPolishHint("文档解析失败：未提取到可用文本");
        return;
      }

      const points = extractKeyPointsFromText(rawText);
      const material = points.trim() ? points : rawText.slice(0, 1800);
      const seedPrompt = `请基于以下文档要点/产品信息，生成一段真人口播脚本：\n\n${material}`;
      setDraftField(props.draftSource, "question", seedPrompt);
      setPolishHint("已解析文档，正在生成口播脚本…");

      const effectiveTextConfig =
        !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
          ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
          : textModelConfig;

      const result = await expandAvatarVideoScript({
        prompt: seedPrompt,
        targetSeconds: avatarTargetSeconds,
        platformStyle: platformPolishKey(platformStyle),
        scene,
        style,
        modelConfig: effectiveTextConfig,
        accessToken,
      });
      const next = result.text.trim();
      if (!next) {
        setPolishHint("文案生成失败：未返回有效内容");
        return;
      }
      setDraftField(props.draftSource, "avatarCopyText", next);
      setPolishHint(`已从文档生成约 ${result.targetSeconds} 秒文案`);
    } catch (error) {
      setPolishHint(error instanceof Error ? error.message : "文档解析失败");
    } finally {
      setIsExpandingAvatarScript(false);
    }
  }

  async function handleRecommendBgm() {
    const raw = question.trim();
    if (!raw) {
      setAssetHint("请先填写口播文案/产品信息，再智能推荐背景音乐。");
      return;
    }
    if (isRecommendingBgm) return;
    if (!accessToken) {
      setAssetHint("请先登录");
      return;
    }
    if (!textModelConfig) {
      setAssetHint("未找到文字模型配置");
      return;
    }

    const effectiveTextConfig =
      !textModelConfig.apiKey.trim() && videoModelConfig?.apiKey?.trim()
        ? { ...textModelConfig, apiKey: videoModelConfig.apiKey }
        : textModelConfig;

    setIsRecommendingBgm(true);
    try {
      const picked = await recommendBgm({
        text: raw,
        mode: props.draftSource,
        platformStyle: platformPolishKey(platformStyle),
        scene: props.controlMode === "scene" ? scene : undefined,
        style: props.controlMode === "style" ? style : undefined,
        modelConfig: effectiveTextConfig,
        accessToken,
      });
      setDraftField(props.draftSource, "bgmEnabled", true);
      setDraftField(props.draftSource, "bgmUrl", picked.url);
      setDraftField(props.draftSource, "bgmTitle", picked.title);
      setDraftField(props.draftSource, "bgmVolume", picked.volume);
      setAssetHint(`已推荐背景音乐：${picked.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "背景音乐推荐失败";
      setAssetHint(message);
    } finally {
      setIsRecommendingBgm(false);
    }
  }

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function readImageSize(dataUrl: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("image_load_failed"));
      image.src = dataUrl;
    });
  }

  async function appendFiles(files: File[]) {
    const supported = isProductMode
      ? files.filter((file) => isImageFile(file))
      : isAvatarMode
        ? files.filter((file) => isImageFile(file) || isVideoFile(file))
        : files.filter(
            (file) => isImageFile(file) || isVideoFile(file) || /\.(docx?|pptx?|pdf)$/i.test(file.name)
          );
    if (supported.length === 0) {
      setAssetHint(
        isProductMode
          ? "仅支持上传图片素材。"
          : isAvatarMode
            ? "真人口播仅支持上传图片或视频素材。文档请用上方“上传文档”导入。"
            : "支持图片、视频、Word、PPT、PDF 和文件夹上传。"
      );
      return;
    }

    if (isProductMode) {
      const maxBytes = 50 * 1024 * 1024;
      const allowed = supported.filter((file) => {
        const extOk = /\.(png|jpe?g|webp)$/i.test(file.name);
        if (!extOk) return false;
        if (file.size > maxBytes) return false;
        return true;
      });
      if (allowed.length === 0) {
        setAssetHint("图片仅支持 png、jpeg、jpg、webp，且单张不超过 50MB。");
        return;
      }

      const nextImages: UploadAsset[] = [];
      for (const file of allowed) {
        const previewUrl = await readFileAsDataUrl(file);
        try {
          const size = await readImageSize(previewUrl);
          if (!isRatioWithinLimits(size.width, size.height)) {
            setAssetHint("图片比例需要小于 1:4 或者 4:1。");
            continue;
          }
        } catch {
          setAssetHint("图片解析失败，请换一张图片再试。");
          continue;
        }

        nextImages.push({
          id: makeId("video_asset"),
          name: file.name,
          kind: "image",
          previewUrl,
        });
      }

      if (nextImages.length === 0) {
        return;
      }

      const nextPrimary = nextImages[nextImages.length - 1];
      if (!nextPrimary) return;
      setDraftField(props.draftSource, "assets", [nextPrimary]);
      setAssetHint("已更换首帧图像。");
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
    appendAssetsToDraft(props.draftSource, next);
    setAssetHint(`已导入 ${next.length} 个素材，其中图片 ${next.filter((item) => item.kind === "image").length} 个、视频 ${next.filter((item) => item.kind === "video").length} 个。`);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    await appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removeAsset(id: string) {
    removeAssetFromDraft(props.draftSource, id);
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
    if (!accessToken) {
      setAssetHint("请先登录后再生成视频。");
      return;
    }
    if (!videoModelConfig) {
      setAssetHint("未找到视频模型配置，请先在模型配置页设置视频模型。");
      return;
    }

    const effectiveDurationSec = durationSec <= 16 ? durationSec : 16;
    const rawQuestion = question.trim();
    if (isProductMode && !selectedProductTemplate && !rawQuestion) {
      setAssetHint("请先填写产品信息或口播文案（建议先点「润色」生成成稿），再生成视频。");
      return;
    }

    const prompt = selectedProductTemplate?.promptText || rawQuestion || props.defaultPrompt;
    const platformText = platformLabel(platformStyle);
    const avatarFullScript = avatarCopyText.trim();
    const productSpeechText = isProductMode ? extractSpeechContentFromProductPrompt(prompt) : "";
    const productGeneratedScript = productCopyText.trim() || productSpeechText || rawQuestion;
    const productSubtitleText = isProductMode ? stripProductAutoHints(productGeneratedScript) : "";
    const nextScript = isAvatarMode ? avatarFullScript : productGeneratedScript;

    setIsGenerating(true);
    let createdDraftId: string | null = null;
    try {
      const draftTitle = `${props.cardTitle}｜${platformText}｜${(nextScript || prompt).slice(0, 16) || "新视频任务"}`;
      const draftDurationText =
        props.draftSource === "avatar_video" ? "长视频" : formatDurationText(durationSec <= 16 ? durationSec : 16);
      let next: VideoDraftItem;

      if (props.draftSource === "avatar_video") {
        const referenceImages = assets
          .filter((item) => item.kind === "image" && item.previewUrl)
          .map((item) => item.previewUrl as string)
          .filter(Boolean)
          .slice(0, 3);
        const imageDataUrl = referenceImages[0] ?? "";
        if (!avatarFullScript) {
          setAssetHint("请先生成或填写“文案内容”后再提交真人口播视频");
          return;
        }
        if (!imageDataUrl) {
          setAssetHint("请先上传一张人物头像/肖像图片作为参考图");
          return;
        }
      }

      next = await createPersistedDraft({
        source: props.draftSource,
        title: draftTitle,
        platformStyle,
        durationText: draftDurationText,
        generatedScript: nextScript,
        publishTitle: workspacePublishTitle.trim() || undefined,
        publishTags: workspacePublishTags.length > 0 ? workspacePublishTags : undefined,
        status: "processing",
      });
      createdDraftId = next.id;
      setAssetHint(isProductMode ? "已提交生成任务，生成结果将显示在右侧。" : "已提交生成任务，结果将在视频草稿箱自动更新。");

      const metaBaseText = isAvatarMode ? avatarFullScript : productGeneratedScript;
      if (metaBaseText && !selectedProductTemplate) {
        try {
          const meta = await generateMeta(metaBaseText);
          if (meta) {
            await persistDraftPatch(next.id, {
              publishTitle: meta.title,
              publishTags: meta.tags,
              title: `${props.cardTitle}｜${platformText}｜${meta.title}`,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message) {
            setAssetHint(message);
          }
        }
      }

      if (props.draftSource === "avatar_video") {
        const referenceImages = assets
          .filter((item) => item.kind === "image" && item.previewUrl)
          .map((item) => item.previewUrl as string)
          .filter(Boolean)
          .slice(0, 3);
        const imageDataUrl = referenceImages[0] ?? "";
        const created = await createAvatarVideoTask({
          fullScript: avatarFullScript,
          referenceImageDataUrl: imageDataUrl,
          referenceImages,
          voiceId: resolveAvatarVoiceIdForSubmit({
            enableViduVoiceSelection: props.enableViduVoiceSelection,
            voiceId,
            legacyTtsEnabled: ttsEnabled,
          }),
          backgroundLock,
          style:
            props.controlMode === "scene"
              ? `${platformText}｜${scene}`
              : props.controlMode === "style"
                ? `${platformText}｜${style}`
                : platformText,
          aspectRatio: ratio === "16:9" || ratio === "9:16" || ratio === "1:1" ? ratio : undefined,
          resolution: resolution === "360p" ? "540p" : resolution,
          segmentDurationSeconds: 12,
          segmentMaxChars: 60,
          accessToken,
        });

        await persistDraftPatch(next.id, {
          taskId: created.taskId,
        });
        setAssetHint(
          avatarCopyText.trim()
            ? "已提交长视频生成任务：将使用上方“文案内容”作为口播脚本。进度与最终视频会在草稿箱自动更新。"
            : referenceImages.length >= 2
            ? "已提交长视频生成任务：将按上传顺序使用图片（第1张人物，第2张产品，第3张背景）。进度与最终视频会在草稿箱自动更新。"
            : "已提交长视频生成任务，进度与最终视频会在草稿箱自动更新。"
        );
        return;
      }

      if (isProductMode && selectedProductTemplate) {
        setAssetHint(`已套用模板“${selectedProductTemplate.title}”，正在生成预设视频...`);
        await new Promise((resolve) => window.setTimeout(resolve, selectedProductTemplate.loadingMs));
        await persistDraftPatch(next.id, {
          status: "ready",
          videoUrl: selectedProductTemplate.videoUrl,
          provider: "Template",
          model: selectedProductTemplate.title,
          errorMessage: undefined,
          completedAt: new Date().toISOString(),
        });
        setAssetHint(`模板“${selectedProductTemplate.title}”已生成完成。`);
        return;
      }

      const promptForVideo = isProductMode
        ? prompt.includes("平台风格：") || prompt.includes("时长要求：")
          ? prompt
          : appendPlatformHint(appendProductDurationHint(prompt, effectiveDurationSec), platformStyle)
        : appendPlatformHint(prompt, platformStyle);
      const result = await generateAiVideo({
        prompt: promptForVideo,
        ttsText: isProductMode ? (productSubtitleText || undefined) : productSpeechText || undefined,
        subtitleEnabled: isProductMode ? productSubtitleEnabled : undefined,
        referenceImages: assets
          .filter((item) => item.kind === "image" && item.previewUrl)
          .map((item) => item.previewUrl as string)
          .filter(Boolean)
          .slice(0, 3),
        bgmUrl:
          isProductMode && enableProductBgm ? (bgmEnabled ? (bgmUrl.trim() ? bgmUrl.trim() : undefined) : undefined) : undefined,
        bgmVolume: isProductMode && enableProductBgm ? (bgmEnabled ? bgmVolume : undefined) : undefined,
        movementAmplitude: isProductMode ? movementAmplitude : undefined,
        aspectRatio: ratio === "16:9" || ratio === "9:16" || ratio === "1:1" ? ratio : undefined,
        resolution,
        durationSeconds: effectiveDurationSec,
        modelConfig: videoModelConfig,
        accessToken,
      });

      if (result.status === "success" && result.videoUrl) {
        await persistDraftPatch(next.id, {
          status: "ready",
          videoUrl: result.videoUrl,
          provider: result.provider,
          model: result.model,
          completedAt: new Date().toISOString(),
        });
        setAssetHint(isProductMode ? "视频已生成完成。" : "视频已生成完成，已同步到草稿箱。");
        return;
      }

      if (result.taskId) {
        await persistDraftPatch(next.id, {
          taskId: result.taskId,
          provider: result.provider,
          model: result.model,
        });
      } else {
        await persistDraftPatch(next.id, {
          status: "failed",
          errorMessage: "视频生成失败：未返回任务 ID",
          completedAt: new Date().toISOString(),
        });
        setAssetHint("视频生成失败：未返回任务 ID");
      }
    } catch (error) {
      if (createdDraftId) {
        try {
          await persistDraftPatch(createdDraftId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "视频生成失败",
            completedAt: new Date().toISOString(),
          });
        } catch {
          // Ignore persistence errors and keep the optimistic local state.
        }
      }
      setAssetHint(error instanceof Error ? error.message : "视频生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  const currentProductTask = useMemo(() => {
    if (!isProductMode) return null;
    const next = draftItems
      .filter((item) => item.source === "product_video")
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return next[0] ?? null;
  }, [draftItems, isProductMode]);

  const productEta = useMemo(() => {
    if (!isProductMode || !currentProductTask || currentProductTask.status !== "processing") return null;
    return estimateProductEta({ items: draftItems, item: currentProductTask });
  }, [currentProductTask, draftItems, isProductMode]);

  useEffect(() => {
    if (!isProductMode) return;
    if (!accessToken) return;
    if (!currentProductTask?.taskId || currentProductTask.status !== "processing") return;

    let stopped = false;
    const taskId = currentProductTask.taskId;
    const draftId = currentProductTask.id;

    async function refreshOnce() {
      try {
        const result = await getVideoTaskStatus(accessToken, taskId);
        if (stopped) return;
        if (result.status === "success" && result.videoUrl) {
          await persistDraftPatch(draftId, {
            status: "ready",
            videoUrl: result.videoUrl,
            errorMessage: undefined,
            completedAt: new Date().toISOString(),
          });
          return;
        }
        if (result.status === "failed") {
          await persistDraftPatch(draftId, {
            status: "failed",
            errorMessage: result.errorMessage || "视频生成失败",
            completedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (stopped) return;
        await persistDraftPatch(draftId, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "视频任务查询失败",
          completedAt: new Date().toISOString(),
        });
      }
    }

    void refreshOnce();
    const timer = window.setInterval(() => {
      if (stopped) return;
      void refreshOnce();
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accessToken, currentProductTask?.id, currentProductTask?.status, currentProductTask?.taskId, isProductMode, updateDraft]);

  const avatarTaskItems = useMemo(() => {
    if (!isAvatarMode) return [];
    return draftItems
      .filter((item) => item.source === "avatar_video")
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [draftItems, isAvatarMode]);

  const [activeAvatarDraftId, setActiveAvatarDraftId] = useState<string>("");
  const [avatarDetail, setAvatarDetail] = useState<AvatarVideoTaskStatusResponse | null>(null);

  useEffect(() => {
    if (!isAvatarMode) return;
    if (avatarTaskItems.length === 0) {
      setActiveAvatarDraftId("");
      setAvatarDetail(null);
      return;
    }
    if (activeAvatarDraftId && avatarTaskItems.some((item) => item.id === activeAvatarDraftId)) {
      return;
    }
    const preferred = avatarTaskItems.find((item) => item.status === "processing")?.id ?? avatarTaskItems[0].id;
    setActiveAvatarDraftId(preferred);
  }, [activeAvatarDraftId, avatarTaskItems, isAvatarMode]);

  const activeAvatarDraft = useMemo(() => {
    if (!isAvatarMode) return null;
    return avatarTaskItems.find((item) => item.id === activeAvatarDraftId) ?? avatarTaskItems[0] ?? null;
  }, [activeAvatarDraftId, avatarTaskItems, isAvatarMode]);

  const currentMetaDraft = useMemo(() => {
    if (isProductMode) return currentProductTask;
    if (isAvatarMode) return activeAvatarDraft;
    return null;
  }, [activeAvatarDraft, currentProductTask, isAvatarMode, isProductMode]);

  const currentProductCopyResult = useMemo(() => {
    if (!isProductMode) return "";
    const raw = (productCopyText.trim() || currentProductTask?.generatedScript?.trim() || "").trim();
    if (!raw) return "";
    return stripProductAutoHints(raw);
  }, [currentProductTask?.generatedScript, isProductMode, productCopyText]);

  const currentProductCopyResultLength = useMemo(() => currentProductCopyResult.length, [currentProductCopyResult]);

  function openCopyResultEditor() {
    setCopyResultEditorValue(currentProductCopyResult);
    setCopyResultEditorOpen(true);
  }

  function openPromptEditor() {
    setPromptEditorValue(question || props.defaultPrompt);
    setPromptEditorHint(null);
    setPromptEditorOpen(true);
  }

  function saveCopyResultEditor() {
    const next = copyResultEditorValue.trim();
    setDraftField(props.draftSource, "productCopyText", next);
    if (currentProductTask?.id) {
      void persistDraftPatch(currentProductTask.id, { generatedScript: next });
    }
    setCopyResultEditorOpen(false);
    setPolishHint("已保存文案生成结果");
  }

  useEffect(() => {
    if (!currentMetaDraft) {
      if (isProductMode) {
        setMetaEditorTitle(workspacePublishTitle);
        setMetaEditorTags(workspacePublishTags.map((t) => `#${t}`).join(" "));
        return;
      }
      setMetaEditorTitle("");
      setMetaEditorTags("");
      return;
    }
    setMetaEditorTitle(currentMetaDraft.publishTitle ?? "");
    setMetaEditorTags((currentMetaDraft.publishTags ?? []).map((t) => `#${t}`).join(" "));
  }, [currentMetaDraft?.id, isProductMode, workspacePublishTags, workspacePublishTitle]);

  const metaDirty = useMemo(() => {
    if (!currentMetaDraft) {
      if (!isProductMode) return false;
      const nextTitle = metaEditorTitle.trim();
      const savedTitle = workspacePublishTitle.trim();
      if (nextTitle !== savedTitle) return true;
      const nextTags = parseTagText(metaEditorTags).join("|");
      const savedTags = workspacePublishTags.join("|");
      return nextTags !== savedTags;
    }
    const nextTitle = metaEditorTitle.trim();
    const savedTitle = (currentMetaDraft.publishTitle ?? "").trim();
    if (nextTitle !== savedTitle) return true;
    const nextTags = parseTagText(metaEditorTags).join("|");
    const savedTags = (currentMetaDraft.publishTags ?? []).join("|");
    return nextTags !== savedTags;
  }, [currentMetaDraft, isProductMode, metaEditorTags, metaEditorTitle, workspacePublishTags, workspacePublishTitle]);

  function handleSaveMeta() {
    const titleValue = metaEditorTitle.trim();
    const tagsValue = parseTagText(metaEditorTags);
    setDraftField(props.draftSource, "publishTitle", titleValue);
    setDraftField(props.draftSource, "publishTags", tagsValue);
    if (!currentMetaDraft) {
      setAssetHint("标题和标签已保存");
      return;
    }
    const platformText = platformLabel(
      (currentMetaDraft.platformStyle as VideoWorkspaceDraft["platformStyle"]) ?? "douyin",
    );
    void persistDraftPatch(currentMetaDraft.id, {
      publishTitle: titleValue || undefined,
      publishTags: tagsValue.length ? tagsValue : undefined,
      title: titleValue ? `${props.cardTitle}｜${platformText}｜${titleValue}` : currentMetaDraft.title,
    });
    setAssetHint("标题和标签已保存");
  }

  const avatarProgressPercent = useMemo(() => {
    if (!avatarDetail) return null;
    const total = Math.max(0, Number(avatarDetail.segmentCount) || 0);
    const done = Math.max(0, Number(avatarDetail.finishedCount) || 0);
    if (!total) return 0;
    const raw = (done / total) * 100;
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [avatarDetail]);

  const avatarFailureSummary = useMemo(() => summarizeAvatarFailures(avatarDetail), [avatarDetail]);

  useEffect(() => {
    if (!isAvatarMode) return;
    if (!accessToken) return;
    if (!activeAvatarDraft?.taskId) {
      setAvatarDetail(null);
      return;
    }

    let stopped = false;
    const taskId = activeAvatarDraft.taskId;

    async function refreshOnce() {
      try {
        const result = await getAvatarVideoTaskStatus(accessToken, taskId);
        if (stopped) return;
        setAvatarDetail(result);
        if (result.status === "completed" && result.finalVideoUrl) {
          await persistDraftPatch(activeAvatarDraft.id, {
            status: "ready",
            videoUrl: result.finalVideoUrl,
            errorMessage: undefined,
            completedAt: new Date().toISOString(),
          });
        } else if (result.status === "failed") {
          await persistDraftPatch(activeAvatarDraft.id, {
            status: "failed",
            errorMessage: result.errorMessage || "视频生成失败",
            completedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (stopped) return;
        setAvatarDetail(null);
      }
    }

    refreshOnce();

    const timer = window.setInterval(() => {
      if (stopped) return;
      if (activeAvatarDraft.status !== "processing") return;
      refreshOnce();
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accessToken, activeAvatarDraft, isAvatarMode, updateDraft]);

  const primaryImage = useMemo(() => {
    return assets.find((item) => item.kind === "image" && item.previewUrl)?.previewUrl ?? "";
  }, [assets]);

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
        <CardContent className={isAvatarMode ? "space-y-3" : "space-y-4"}>
          {isProductMode ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">模型</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                      {videoModelConfig ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate">{videoModelConfig.providerName}</div>
                            <div className="truncate text-xs text-zinc-400">{videoModelConfig.modelName}</div>
                          </div>
                          <Badge variant={videoModelConfig.enabled ? "green" : "red"}>
                            {videoModelConfig.enabled ? "已启用" : "未启用"}
                          </Badge>
                        </div>
                      ) : (
                        <div className="text-zinc-400">未找到视频模型配置</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">平台风格</div>
                    <Select
                      value={platformStyle}
                      onChange={(e) =>
                        setDraftField(props.draftSource, "platformStyle", e.target.value as VideoWorkspaceDraft["platformStyle"])
                      }
                    >
                      <option value="douyin">抖音</option>
                      <option value="xiaohongshu">小红书</option>
                      <option value="wechat_mp">视频号</option>
                    </Select>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">首帧图像</div>
                    <div
                      className={cn(
                        "rounded-2xl border border-dashed p-3 transition-colors",
                        isDragActive ? "border-amber-400/50 bg-amber-500/10" : "border-white/15 bg-white/5"
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      {primaryImage ? (
                        <img src={primaryImage} alt="首帧图像" className="h-36 w-full rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-36 flex-col items-center justify-center gap-2 text-xs text-zinc-500">
                          <UploadCloud className="h-6 w-6" />
                          <div>点击上传或拖拽图片到此处</div>
                          <div>支持 png、jpeg、jpg、webp；不超过 50MB</div>
                          <div>比例需要小于 1:4 或者 4:1</div>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button variant="secondary" size="sm" onClick={() => productImageInputRef.current?.click()}>
                          上传图片
                        </Button>
                        {assets.length > 0 ? (
                          <Button variant="secondary" size="sm" onClick={() => clearDraftAssets(props.draftSource)}>
                            清空
                          </Button>
                        ) : null}
                      </div>
                      {assetHint ? <div className="mt-2 text-xs text-zinc-400">{assetHint}</div> : null}
                    </div>
                  </div>

                  {ENABLE_PRODUCT_VIDEO_TEMPLATE ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">视频模板</div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextSelected = productTemplateKey === "" ? PRODUCT_VIDEO_TEMPLATES[0] : null;
                          setDraftField(props.draftSource, "productTemplateKey", nextSelected?.key ?? "");
                          if (nextSelected) {
                            setDraftField(props.draftSource, "question", nextSelected.promptText);
                            setDraftField(props.draftSource, "productCopyPrompt", nextSelected.copyPromptText);
                            setDraftField(props.draftSource, "productCopyText", nextSelected.copyResultText);
                            setDraftField(props.draftSource, "publishTitle", nextSelected.title);
                            setAssetHint(`已选中模板：${nextSelected.title}`);
                          } else {
                            setAssetHint("已切换为自定义模式，将按原逻辑生成视频。");
                          }
                        }}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition-colors",
                          productTemplateKey === PRODUCT_VIDEO_TEMPLATES[0].key
                            ? "border-amber-400/40 bg-amber-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-zinc-100">{PRODUCT_VIDEO_TEMPLATES[0].title}</div>
                            <div className="mt-1 text-xs text-zinc-400">{PRODUCT_VIDEO_TEMPLATES[0].description}</div>
                          </div>
                          <Badge variant={productTemplateKey === PRODUCT_VIDEO_TEMPLATES[0].key ? "amber" : "gray"}>
                            {productTemplateKey === PRODUCT_VIDEO_TEMPLATES[0].key ? "已选中" : "点击使用"}
                          </Badge>
                        </div>
                      </button>
                      {productTemplateKey ? (
                        <div className="text-[11px] leading-5 text-zinc-500">
                          当前已启用模板模式：点击“开始生成”后会直接返回预设视频；取消模板后恢复原始 AI 生成链路。
                        </div>
                      ) : (
                        <div className="text-[11px] leading-5 text-zinc-500">
                          未使用模板时，仍按现有模型与提示词正常生成。
                        </div>
                      )}
                    </div>
                  </div>
                  ) : null}

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-300">
                      <span>视频生成提示词</span>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span>{question.length}/5000</span>
                        <Button variant="ghost" size="sm" onClick={() => setPolishHelpOpen(true)}>
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handlePolishPrompt}
                          disabled={isPolishing || !question.trim() || !!selectedProductTemplate}
                        >
                          {isPolishing ? "润色中..." : "润色"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setPromptEditorValue(question || props.defaultPrompt);
                            setPromptEditorHint(null);
                            setPromptEditorOpen(true);
                          }}
                          disabled={!!selectedProductTemplate}
                        >
                          全屏编辑
                        </Button>
                      </div>
                    </div>
                    <textarea
                      className="h-28 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                      placeholder={props.questionPlaceholder}
                      value={question}
                      maxLength={5000}
                      onChange={(e) => setDraftField(props.draftSource, "question", e.target.value)}
                      disabled={!!selectedProductTemplate}
                    />
                    {selectedProductTemplate ? (
                      <div className="mt-2 text-xs text-zinc-500">
                        模板模式下，提示词已锁定为“{selectedProductTemplate.promptText}”。取消模板后可继续手动编辑。
                      </div>
                    ) : null}
                    {productDurationGuide ? (
                      <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/90">
                        当前时长 {productDurationGuide.seconds}s：{productDurationGuide.summary}
                      </div>
                    ) : null}
                    {polishHint ? <div className="mt-2 text-xs text-zinc-400">{polishHint}</div> : null}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-300">
                      <span>文案提示词</span>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span>{productCopyPrompt.length}/2000</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateProductCopy}
                          disabled={isGeneratingProductCopy || !productCopyPrompt.trim()}
                        >
                          {isGeneratingProductCopy ? "生成中..." : "生成文案"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDraftField(props.draftSource, "productCopyPrompt", "")}
                          disabled={!productCopyPrompt.trim() || isGeneratingProductCopy}
                        >
                          清空
                        </Button>
                      </div>
                    </div>
                    <textarea
                      className="h-28 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                      placeholder="这里保留用户输入的文案提示词，用于单独生成右侧的文案生成结果。"
                      value={productCopyPrompt}
                      maxLength={2000}
                      onChange={(e) => setDraftField(props.draftSource, "productCopyPrompt", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-300">视频时长(s)</div>
                      <Select
                        value={String(durationSec)}
                        onChange={(e) => setDraftField(props.draftSource, "durationSec", Number(e.target.value) || 5)}
                      >
                        {productDurationOptions.map((v) => (
                          <option key={v} value={String(v)}>
                            {v}s
                          </option>
                        ))}
                      </Select>
                      {productDurationGuide ? (
                        <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                          生成时会按 {productDurationGuide.seconds}s 自动收敛提示词长度与节奏。
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-300">分辨率</div>
                      <Select
                        value={resolution}
                        onChange={(e) =>
                          setDraftField(props.draftSource, "resolution", e.target.value as "360p" | "540p" | "720p" | "1080p")
                        }
                      >
                        {productResolutionOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-300">比例</div>
                      <Select value={ratio} onChange={(e) => setDraftField(props.draftSource, "ratio", e.target.value)}>
                        <option value="9:16">9:16</option>
                        <option value="16:9">16:9</option>
                        <option value="1:1">1:1</option>
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-300">运动幅度</div>
                      <Select
                        value={movementAmplitude}
                        onChange={(e) =>
                          setDraftField(
                            props.draftSource,
                            "movementAmplitude",
                            ((e.target.value as "auto" | "low" | "medium" | "high") || "auto") as "auto" | "low" | "medium" | "high"
                          )
                        }
                      >
                        <option value="auto">auto</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {isProductMode && enableProductBgm ? (
                      <>
                        <label className="flex items-center gap-2 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-400"
                            checked={bgmEnabled}
                            onChange={(e) => setDraftField(props.draftSource, "bgmEnabled", e.target.checked)}
                          />
                          <span>添加背景音乐</span>
                        </label>
                        {bgmEnabled ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              value={bgmUrl}
                              onChange={(e) => {
                                setDraftField(props.draftSource, "bgmUrl", e.target.value);
                                setDraftField(props.draftSource, "bgmTitle", "");
                              }}
                              placeholder="BGM 音频 URL（mp3/wav/m4a/aac）"
                              className="flex-1"
                            />
                            <Select
                              value={String(bgmVolume)}
                              onChange={(e) =>
                                setDraftField(props.draftSource, "bgmVolume", Number(e.target.value) || 0.25)
                              }
                              className="h-8 w-28"
                            >
                              <option value="0.15">15%</option>
                              <option value="0.25">25%</option>
                              <option value="0.35">35%</option>
                              <option value="0.5">50%</option>
                              <option value="0.7">70%</option>
                              <option value="1">100%</option>
                            </Select>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleRecommendBgm}
                              disabled={isRecommendingBgm || !question.trim()}
                            >
                              {isRecommendingBgm ? "推荐中..." : "智能推荐"}
                            </Button>
                          </div>
                        ) : null}
                        {bgmEnabled && bgmUrl.trim() ? (
                          <div className="space-y-2">
                            <div className="text-xs text-zinc-400">
                              当前 BGM：{bgmTitle.trim() ? bgmTitle.trim() : bgmUrl.trim()}
                            </div>
                            <audio className="h-10 w-full" src={bgmUrl.trim()} controls preload="none" />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {isProductMode ? null : props.enableViduVoiceSelection ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                        {avatarVoiceEnabled
                          ? "已启用音频配音：本次会使用当前所选音色生成真人口播声音。"
                          : "当前不会生成配音：请在上方“音色”选择具体音色或填写有效 voice_id，留空则只生成无声口播视频。"}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-400"
                            checked={ttsEnabled}
                            onChange={(e) => setTtsEnabled(e.target.checked)}
                          />
                          <span>添加音频配音</span>
                        </label>
                        <div className="min-w-0 flex-1">
                          <Input
                            value={voiceId}
                            onChange={(e) => setDraftField(props.draftSource, "voiceId", e.target.value)}
                            placeholder="voice_id；留空则自动选择"
                            disabled={!ttsEnabled}
                          />
                        </div>
                      </div>
                    )}
                    {isProductMode ? (
                      <label className="flex items-center gap-2 text-sm text-zinc-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-amber-400"
                          checked={productSubtitleEnabled}
                          onChange={(e) => setDraftField(props.draftSource, "productSubtitleEnabled", e.target.checked)}
                        />
                        <span>添加视频字幕</span>
                        <span className="text-xs text-zinc-500">
                          {productSubtitleEnabled ? "（将自动烧录中文字幕）" : "（不烧录字幕）"}
                        </span>
                      </label>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                        当前成片默认自动烧录中文字幕，适用于真人口播视频生成。
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={generateVideoDemo} disabled={isGenerating}>
                      <Sparkles className="h-4 w-4" />
                      {isGenerating ? "生成中..." : "开始生成"}
                    </Button>
                  </div>
                </div>
                <input
                  ref={productImageInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-100">当前生成结果</div>
                  {isProductMode && (currentMetaDraft || productCopyText.trim() || workspacePublishTitle || workspacePublishTags.length > 0) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!metaDirty}
                      onClick={handleSaveMeta}
                    >
                      保存
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {!currentProductTask ? (
                    productCopyText.trim() || workspacePublishTitle || workspacePublishTags.length > 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs font-medium text-zinc-300">标签</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant="blue">{platformLabel(platformStyle)}</Badge>
                              {workspacePublishTags.length > 0 ? (
                                workspacePublishTags.map((tag) => (
                                  <Badge key={tag} variant="gray">
                                    #{tag}
                                  </Badge>
                                ))
                              ) : (
                                <div className="text-sm text-zinc-500">-</div>
                              )}
                            </div>
                            <div className="mt-2">
                              <Input
                                value={metaEditorTags}
                                onChange={(e) => setMetaEditorTags(e.target.value)}
                                placeholder="支持空格/逗号分隔，例如：#新品 #种草 #抖音"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-medium text-zinc-300">标题</div>
                            <div className="mt-2">
                              <Input
                                value={metaEditorTitle}
                                onChange={(e) => setMetaEditorTitle(e.target.value)}
                                placeholder="请输入标题"
                              />
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-zinc-300">文案生成结果</div>
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <span>当前字数：{currentProductCopyResultLength}</span>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={openCopyResultEditor}
                                  disabled={!currentProductCopyResult}
                                >
                                  全屏编辑
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 min-h-[10.5rem] max-h-[16rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm leading-6 text-zinc-200">
                              {currentProductCopyResult || "-"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-zinc-500">
                        暂无生成结果
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-medium text-zinc-300">标签</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {currentProductTask.platformStyle ? (
                              <Badge variant="blue">{platformLabel(currentProductTask.platformStyle)}</Badge>
                            ) : null}
                            {currentProductTask.publishTags && currentProductTask.publishTags.length > 0 ? (
                              currentProductTask.publishTags.map((tag) => (
                                <Badge key={tag} variant="gray">
                                  #{tag}
                                </Badge>
                              ))
                            ) : (
                              <div className="text-sm text-zinc-500">-</div>
                            )}
                          </div>
                          <div className="mt-2">
                            <Input
                              value={metaEditorTags}
                              onChange={(e) => setMetaEditorTags(e.target.value)}
                              placeholder="支持空格/逗号分隔，例如：#新品 #种草 #抖音"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-zinc-300">标题</div>
                          <div className="mt-2">
                            <Input
                              value={metaEditorTitle}
                              onChange={(e) => setMetaEditorTitle(e.target.value)}
                              placeholder="请输入标题"
                            />
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-zinc-300">文案生成结果</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <span>当前字数：{currentProductCopyResultLength}</span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={openCopyResultEditor}
                                disabled={!currentProductCopyResult}
                              >
                                全屏编辑
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 min-h-[10.5rem] max-h-[16rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm leading-6 text-zinc-200">
                            {currentProductCopyResult || "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-zinc-300">生成视频</div>
                          <div className="mt-2">
                            {currentProductTask.videoUrl && currentProductTask.status === "ready" ? (
                              <video
                                controls
                                src={currentProductTask.videoUrl}
                                className="h-72 w-full rounded-xl bg-black object-contain"
                              />
                            ) : currentProductTask.status === "failed" ? (
                              <div className="text-sm text-zinc-300">
                                {normalizeAvatarErrorMessage(currentProductTask.errorMessage || "视频生成失败")}
                              </div>
                            ) : (
                              <div className="py-10 text-center">
                                <div className="text-sm text-zinc-500">生成中...</div>
                                {productEta ? (
                                  <div className="mt-2 text-xs text-zinc-500">
                                    已用时 {formatMmSs(productEta.elapsedMs)}
                                    {" · "}
                                    预计剩余 ~ {formatMmSs(productEta.remainingMs)}
                                    {" · "}
                                    预计 {formatClock(productEta.etaAtMs)}
                                  </div>
                                ) : null}
                                <div className="mx-auto mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-violet-500/20 via-violet-500/80 to-violet-500/20" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {!isProductMode ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">平台风格</div>
                  <Select
                    value={platformStyle}
                    onChange={(e) =>
                      setDraftField(props.draftSource, "platformStyle", e.target.value as VideoWorkspaceDraft["platformStyle"])
                    }
                  >
                    <option value="douyin">抖音</option>
                    <option value="xiaohongshu">小红书</option>
                    <option value="wechat_mp">视频号</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">
                    {props.controlMode === "scene" ? "内容场景" : props.controlMode === "duration" ? "视频时长" : "视频风格"}
                  </div>
                  {props.controlMode === "scene" ? (
                    <Select value={scene} onChange={(e) => setDraftField(props.draftSource, "scene", e.target.value)}>
                      {(props.sceneOptions ?? ["产品讲解", "招商咨询", "直播转化"]).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </Select>
                  ) : props.controlMode === "duration" ? (
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      step={5}
                      value={String(durationSec)}
                      onChange={(e) => setDraftField(props.draftSource, "durationSec", Number(e.target.value) || 30)}
                    />
                  ) : (
                    <Select value={style} onChange={(e) => setDraftField(props.draftSource, "style", e.target.value)}>
                      <option value="专业风">专业风</option>
                      <option value="社媒风">社媒风</option>
                      <option value="广告风">广告风</option>
                    </Select>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">视频比例</div>
                  <Select value={ratio} onChange={(e) => setDraftField(props.draftSource, "ratio", e.target.value)}>
                    <option value="9:16">竖版 9:16</option>
                    <option value="16:9">横版 16:9</option>
                    <option value="1:1">正方形 1:1</option>
                    <option value="3:4">竖版 3:4</option>
                    <option value="4:5">竖版 4:5</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">输出分辨率</div>
                  <Select
                    value={resolution}
                    onChange={(e) =>
                      setDraftField(props.draftSource, "resolution", e.target.value as "360p" | "540p" | "720p" | "1080p")
                    }
                  >
                    {resolutionOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                {props.enableViduVoiceSelection && props.viduVoiceOptions && props.viduVoiceOptions.length > 0 ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">音色</div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={ttsVoiceMode}
                        onChange={(e) => {
                          const mode = e.target.value as "preset" | "custom";
                          setTtsVoiceMode(mode);
                          setDraftField(props.draftSource, "voiceId", "");
                        }}
                        className="h-8 w-28"
                      >
                        <option value="preset">选择音色</option>
                        <option value="custom">自定义</option>
                      </Select>
                      {ttsVoiceMode === "preset" ? (
                        <Select
                          value={voiceId}
                          onChange={(e) => setDraftField(props.draftSource, "voiceId", e.target.value)}
                          className="flex-1"
                        >
                          <option value="">不指定（不生成配音）</option>
                          {props.viduVoiceOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          value={voiceId}
                          onChange={(e) => setDraftField(props.draftSource, "voiceId", e.target.value)}
                          placeholder="填写 voice_id"
                          className="flex-1"
                        />
                      )}
                    </div>
                  </div>
                ) : props.enableVoiceSelection ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">音色</div>
                    <Select value={voice} onChange={(e) => setDraftField(props.draftSource, "voice", e.target.value)}>
                      {(props.voiceOptions ?? ["女声·亲和", "男声·稳重", "中性·专业"]).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {isAvatarMode ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">脚本时长(10-300秒)</div>
                    <Input
                      type="number"
                      min={10}
                      max={300}
                      step={5}
                      value={String(avatarTargetSeconds)}
                      onChange={(e) =>
                        setDraftField(
                          props.draftSource,
                          "avatarTargetSeconds",
                          Math.max(10, Math.min(300, Number(e.target.value) || 30))
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>

          <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-4", isAvatarMode ? "min-h-[520px] flex flex-col justify-between" : "")}>
            {isAvatarMode ? (
              <div className="flex-1 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-400">生成画布</div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-400"
                        checked={backgroundLock}
                        onChange={(e) => setDraftField(props.draftSource, "backgroundLock", e.target.checked)}
                      />
                      <span>背景锁定（推荐）</span>
                    </label>
                    {avatarTaskItems.length > 0 ? (
                      <Select
                        className="h-8 w-60 text-xs"
                        value={activeAvatarDraftId}
                        onChange={(e) => setActiveAvatarDraftId(e.target.value)}
                      >
                        {avatarTaskItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                </div>

                {activeAvatarDraft ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                          <Badge
                            variant={
                              avatarDetail?.status === "completed"
                                ? "green"
                                : avatarDetail?.status === "failed"
                                  ? "red"
                                  : activeAvatarDraft.status === "ready"
                                    ? "green"
                                    : activeAvatarDraft.status === "failed"
                                      ? "red"
                                      : "amber"
                            }
                          >
                            {avatarDetail?.status === "completed"
                              ? "已完成"
                              : avatarDetail?.status === "failed"
                                ? "失败"
                                : activeAvatarDraft.status === "ready"
                                  ? "已完成"
                                  : activeAvatarDraft.status === "failed"
                                    ? "失败"
                                    : "生成中"}
                          </Badge>
                          {avatarDetail ? (
                            <>
                              <span>
                                分片 {avatarDetail.finishedCount}/{avatarDetail.segmentCount}
                              </span>
                              <span className={cn(avatarDetail.failedCount > 0 ? "text-red-300" : "text-zinc-400")}>
                                失败 {avatarDetail.failedCount}
                              </span>
                            </>
                          ) : null}
                        </div>
                        {avatarDetail?.failedCount ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              if (!accessToken) return;
                              if (!activeAvatarDraft.taskId) return;
                              try {
                                await retryAvatarVideoTask(accessToken, activeAvatarDraft.taskId);
                                updateDraft(activeAvatarDraft.id, { status: "processing", errorMessage: undefined });
                                setAssetHint("已触发失败分片重试，正在继续生成。");
                              } catch (error) {
                                setAssetHint(error instanceof Error ? error.message : "重试失败");
                              }
                            }}
                          >
                            仅重试失败分片
                          </Button>
                        ) : null}
                      </div>
                      {activeAvatarDraft.status === "processing" ? (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500">
                            <span>{avatarDetail ? `分片进度 ${avatarDetail.finishedCount}/${avatarDetail.segmentCount}` : "生成中..."}</span>
                            {typeof avatarProgressPercent === "number" ? <span>{avatarProgressPercent}%</span> : null}
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            {typeof avatarProgressPercent === "number" ? (
                              <div
                                className="h-full bg-orange-500 transition-[width] duration-300"
                                style={{ width: `${avatarProgressPercent}%` }}
                              />
                            ) : (
                              <div className="h-full w-full animate-pulse bg-gradient-to-r from-orange-500/20 via-orange-500/70 to-orange-500/20" />
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-zinc-300">标题与标签</div>
                        <Button size="sm" variant="secondary" disabled={!metaDirty} onClick={handleSaveMeta}>
                          保存
                        </Button>
                      </div>
                      <div className="mt-3 space-y-4">
                        <div>
                          <div className="text-xs font-medium text-zinc-300">标签</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {activeAvatarDraft.platformStyle ? (
                              <Badge variant="blue">{platformLabel(activeAvatarDraft.platformStyle)}</Badge>
                            ) : null}
                            {activeAvatarDraft.publishTags && activeAvatarDraft.publishTags.length > 0 ? (
                              activeAvatarDraft.publishTags.map((tag) => (
                                <Badge key={tag} variant="gray">
                                  #{tag}
                                </Badge>
                              ))
                            ) : (
                              <div className="text-sm text-zinc-500">-</div>
                            )}
                          </div>
                          <div className="mt-2">
                            <Input
                              value={metaEditorTags}
                              onChange={(e) => setMetaEditorTags(e.target.value)}
                              placeholder="支持空格/逗号分隔，例如：#口播 #招商 #抖音"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-medium text-zinc-300">标题</div>
                          <div className="mt-2">
                            <Input
                              value={metaEditorTitle}
                              onChange={(e) => setMetaEditorTitle(e.target.value)}
                              placeholder="请输入标题"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {activeAvatarDraft.status === "processing" && avatarDetail ? (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-zinc-400">当前分片状态</div>
                          <div className="text-[11px] text-zinc-500">仅展示未完成分片（最多 8 条）</div>
                        </div>
                        {avatarFailureSummary.length > 0 ? (
                          <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/5 p-3">
                            <div className="text-xs font-medium text-red-200">
                              失败原因汇总 · 共 {avatarDetail.failedCount} 段失败
                            </div>
                            <div className="mt-2 space-y-2">
                              {avatarFailureSummary.map((item) => (
                                <div key={`${item.message}-${item.sequenceOrders[0] ?? 0}`} className="text-xs text-zinc-300">
                                  <div>{item.count} 段：{item.message}</div>
                                  <div className="mt-1 text-zinc-500">分片：第 {item.sequenceOrders.join("、")} 段</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 space-y-2">
                          {avatarDetail.segments
                            .filter((segment) => segment.status !== "success")
                            .slice(0, 8)
                            .map((segment) => (
                              <div key={segment.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-zinc-200">
                                    第 {segment.sequenceOrder + 1} 段 · 尝试 {segment.attempts}/{segment.maxAttempts}
                                  </div>
                                  <Badge
                                    variant={
                                      segment.status === "failure" ? "red" : segment.status === "pending" ? "gray" : "amber"
                                    }
                                  >
                                    {formatVideoStatusLabel(segment.status)}
                                  </Badge>
                                </div>
                                {segment.retryAt ? (
                                  <div className="mt-1 text-zinc-400">下次重试：{new Date(segment.retryAt).toLocaleString()}</div>
                                ) : null}
                                {segment.errorMessage ? (
                                  <div className="mt-1 text-zinc-400">{normalizeAvatarErrorMessage(segment.errorMessage)}</div>
                                ) : null}
                              </div>
                            ))}
                          {avatarDetail.segments.filter((segment) => segment.status !== "success").length === 0 ? (
                            <div className="text-xs text-zinc-500">正在合成最终视频…</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {avatarDetail?.finalVideoUrl ? (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="mb-2 text-xs text-zinc-400">最终成片</div>
                        {activeAvatarDraft.publishTitle || activeAvatarDraft.publishTags ? (
                          <div className="mb-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {activeAvatarDraft.platformStyle ? (
                                <Badge variant="blue">{platformLabel(activeAvatarDraft.platformStyle)}</Badge>
                              ) : null}
                              {activeAvatarDraft.publishTitle ? (
                                <div className="text-sm font-medium text-zinc-100">{activeAvatarDraft.publishTitle}</div>
                              ) : null}
                            </div>
                            {activeAvatarDraft.publishTags ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {activeAvatarDraft.publishTags.map((tag) => (
                                  <Badge key={tag} variant="gray">
                                    #{tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <video
                          className="h-[220px] w-full rounded-lg bg-black object-contain"
                          src={avatarDetail.finalVideoUrl}
                          controls
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="mb-2 text-xs text-zinc-400">分片预览</div>
                        {avatarDetail ? (
                          <div className="grid grid-cols-1 gap-2">
                            {avatarDetail.segments.map((segment) => (
                              <div key={segment.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs text-zinc-300">
                                    片段 {segment.sequenceOrder + 1} · {formatVideoStatusLabel(segment.status)}
                                  </div>
                                  {segment.attempts > 0 ? (
                                    <div className="text-xs text-zinc-500">
                                      尝试 {segment.attempts}/{segment.maxAttempts}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-zinc-400">
                                  {segment.scriptSegment}
                                </div>
                                {segment.segmentVideoUrl ? (
                                  <video
                                    className="mt-2 h-28 w-full rounded-md bg-black object-contain"
                                    src={segment.segmentVideoUrl}
                                    controls
                                  />
                                ) : null}
                                {segment.errorMessage ? (
                                  <div className="mt-2 text-xs text-red-300">
                                    {normalizeAvatarErrorMessage(segment.errorMessage)}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-[220px] items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sm text-zinc-500">
                            {activeAvatarDraft.taskId ? "正在拉取任务进度…" : "任务已创建，等待返回任务 ID…"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-xl border border-white/10 bg-black/30">
                    <div className="text-center">
                      <div className="text-sm font-medium text-zinc-200">暂无任务记录</div>
                      <div className="mt-1 text-xs text-zinc-500">点击下方“提交”后会创建真人口播分片任务</div>
                    </div>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-400">
                      <span>
                        图片与视频素材（
                        {assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl).length}
                        ）
                      </span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                      {assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl).length > 0 ? (
                        <AssetPreviewStrip
                          items={assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl)}
                          emptyText="暂无图片或视频素材"
                          onPreview={(asset) => setPreviewAsset(asset as UploadAsset)}
                          onRemove={removeAsset}
                        />
                      ) : (
                        <div className="text-center text-xs text-zinc-500">暂无图片或视频素材</div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => assetMediaInputRef.current?.click()}>
                          上传图片/视频
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {isAvatarMode ? (
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-100">文案内容</div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <span className="text-xs">{avatarCopyText.length}/15000</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleExpandAvatarScript}
                      disabled={isExpandingAvatarScript || !question.trim()}
                    >
                      {isExpandingAvatarScript ? "生成中..." : "生成文案"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDraftField(props.draftSource, "avatarCopyText", "")}
                      disabled={!avatarCopyText.trim() || isExpandingAvatarScript}
                    >
                      清空
                    </Button>
                  </div>
                </div>
                <textarea
                  className="h-40 w-full resize-none rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="这里会根据上方“用户提示词”生成文案内容；如果未明确要求字数，默认生成符合用户提示词内容的完整成稿，也支持手动编辑。"
                  value={avatarCopyText}
                  maxLength={15000}
                  onChange={(e) => setDraftField(props.draftSource, "avatarCopyText", e.target.value)}
                />
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-zinc-100">用户提示词</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPolishHelpOpen(true)}>
                  <Info className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePolishPrompt}
                  disabled={isPolishing || !question.trim()}
                >
                  {isPolishing ? "润色中..." : "润色"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openPromptEditor}
                >
                  全屏编辑
                </Button>
              </div>
            </div>
            <div
              className={cn(
                "relative rounded-3xl border border-dashed p-4 transition-colors",
                isDragActive ? "border-amber-400/50 bg-amber-500/10" : "border-white/15 bg-white/5"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                className={cn(
                  "w-full resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500",
                  isAvatarMode ? "h-40 pr-28 pb-12" : "h-24"
                )}
                placeholder={props.questionPlaceholder}
                value={question}
                onChange={(e) => setDraftField(props.draftSource, "question", e.target.value)}
              />
              {isAvatarMode ? (
                <div className="absolute bottom-3 right-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => avatarDocInputRef.current?.click()}
                    disabled={isExpandingAvatarScript}
                  >
                    上传文档
                  </Button>
                </div>
              ) : null}
              {polishHint ? <div className="mt-2 text-xs text-zinc-400">{polishHint}</div> : null}
              {isAvatarMode ? (
                <div className="mt-2 text-xs leading-5 text-zinc-400">
                  这里的“用户提示词”用于真人口播视频生成；点击「润色」会自动补全视频生成缺失的提示词内容。如需生成语音，请直接写 `语音内容：`、`旁白：` 或 `口播文案：` 段落。
                </div>
              ) : null}
              {!isAvatarMode ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/90">
                  {isProductMode
                    ? "产品视频模式仅使用左侧上传的图片素材。"
                    : "支持图片、视频、Word、PPT、PDF 和文件夹。视频作为预览素材，图片和文档作为补充信息。"}
                </div>
              ) : null}
              <div className="mt-4 text-xs text-zinc-400">
                {isAvatarMode
                  ? "建议先上传人物图；如需“人物+产品+背景”，可再上传产品图与背景图（按上传顺序：第1张人物，第2张产品，第3张背景）。结果会进入视频草稿箱。"
                  : "生成结果统一进入视频草稿箱，审核与同步操作在草稿箱处理。"}
              </div>
              {assetHint ? <div className="mt-3 text-xs text-zinc-400">{assetHint}</div> : null}
              {!isAvatarMode && !isProductMode ? (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-400">
                      <span>图片与视频素材（{assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl).length}）</span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                      {assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl).length > 0 ? (
                        <AssetPreviewStrip
                          items={assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && asset.previewUrl)}
                          emptyText="暂无图片或视频素材"
                          onPreview={(asset) => setPreviewAsset(asset as UploadAsset)}
                          onRemove={removeAsset}
                        />
                      ) : (
                        <div className="text-center text-xs text-zinc-500">暂无图片或视频素材</div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => assetMediaInputRef.current?.click()}>
                          上传图片/视频
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-400">
                      <span>文档素材（{assets.filter((asset) => asset.kind === "file").length}）</span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                      {assets.filter((asset) => asset.kind === "file").length > 0 ? (
                        <AssetPreviewStrip
                          items={assets.filter((asset) => asset.kind === "file")}
                          emptyText="暂无文档素材"
                          onRemove={removeAsset}
                        />
                      ) : (
                        <div className="text-center text-xs text-zinc-500">暂无文档素材</div>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => assetDocInputRef.current?.click()}>
                          上传文档
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => folderInputRef.current?.click()}>
                          上传文件夹
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className={cn("mt-4 flex", isAvatarMode ? "justify-between items-center" : "justify-end")}>
              {isAvatarMode ? (
                <div className="text-xs text-zinc-400">默认提交 1080p · 任务在草稿箱异步推进</div>
              ) : null}
              <Button onClick={generateVideoDemo} disabled={isGenerating}>
                <Sparkles className="h-4 w-4" />
                {isGenerating ? "生成中..." : isAvatarMode ? "提交" : "发送并生成"}
              </Button>
            </div>
            <input ref={assetMediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
            <input ref={assetDocInputRef} type="file" accept=".doc,.docx,.ppt,.pptx,.pdf" multiple className="hidden" onChange={handleUpload} />
            <input
              ref={avatarDocInputRef}
              type="file"
              accept=".doc,.docx,.ppt,.pptx,.pdf"
              className="hidden"
              onChange={handleImportAvatarDoc}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept="image/*,video/*,.doc,.docx,.ppt,.pptx,.pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
          </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Modal
        open={promptEditorOpen}
        title={isAvatarMode ? "编辑长文本提示词" : "编辑提示词"}
        onClose={() => {
          setPromptEditorOpen(false);
          setPromptEditorHint(null);
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{promptEditorValue.length}/2000</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPromptEditorValue(props.defaultPrompt);
                  setPromptEditorHint(null);
                }}
              >
                使用默认
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(promptEditorValue);
                    setPromptEditorHint("已复制");
                  } catch {
                    setPromptEditorHint("复制失败，请手动复制");
                  }
                }}
              >
                复制
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (isPolishing) return;
                  setIsPolishing(true);
                  setPromptEditorHint(null);
                  try {
                    const next = await polishPromptText(promptEditorValue);
                    setPromptEditorValue(next);
                    setPromptEditorHint("已润色");
                  } catch (error) {
                    setPromptEditorHint(error instanceof Error ? error.message : "润色失败");
                  } finally {
                    setIsPolishing(false);
                  }
                }}
                disabled={!promptEditorValue.trim()}
              >
                {isPolishing ? "润色中..." : "润色"}
              </Button>
            </div>
          </div>
          <textarea
            className="h-[60vh] w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder={props.questionPlaceholder}
            value={promptEditorValue}
            maxLength={2000}
            onChange={(e) => setPromptEditorValue(e.target.value)}
          />
          {promptEditorHint ? <div className="text-xs text-zinc-400">{promptEditorHint}</div> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPromptEditorOpen(false);
                setPromptEditorHint(null);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDraftField(props.draftSource, "question", promptEditorValue);
                setPromptEditorOpen(false);
                setPromptEditorHint(null);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={copyResultEditorOpen}
        title="编辑文案生成结果"
        onClose={() => {
          setCopyResultEditorOpen(false);
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>当前字数：{copyResultEditorValue.length}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(copyResultEditorValue);
                  setPolishHint("已复制文案生成结果");
                } catch {
                  setPolishHint("复制失败，请手动复制");
                }
              }}
            >
              复制
            </Button>
          </div>
          <textarea
            className="h-[60vh] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
            value={copyResultEditorValue}
            maxLength={2000}
            onChange={(e) => setCopyResultEditorValue(e.target.value)}
            placeholder="暂无文案生成结果"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCopyResultEditorOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={saveCopyResultEditor}>
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={polishHelpOpen} title="润色说明" onClose={() => setPolishHelpOpen(false)}>
        <div className="space-y-2 text-sm leading-6 text-zinc-200">
          <div>保留原文里的数字、专有名词、联系方式、占位符等，只做语序、口语化、停顿、节奏之类的优化。</div>
          <div>点击润色后会用 AI 的结果替换当前内容，你仍然可以继续手动修改。</div>
          {isProductMode ? (
            <div>
              这里的“用户提示词”用于生成视频；点击「润色」会自动补全缺失的视频提示词内容。如需生成语音，请在提示词里直接写
              `语音内容：`、`旁白：` 或 `口播文案：` 段落。
            </div>
          ) : null}
          <div className="text-xs text-zinc-400">
            建议先写清楚：平台风格、产品卖点、受众、场景、限制点；润色不会凭空编造数据与背书。
          </div>
        </div>
      </Modal>

      <Modal open={!!previewAsset} title="素材预览" onClose={() => setPreviewAsset(null)}>
        {previewAsset?.kind === "image" && previewAsset.previewUrl ? <img src={previewAsset.previewUrl} alt={previewAsset.name} className="max-h-[70vh] rounded-md object-contain" /> : null}
        {previewAsset?.kind === "video" && previewAsset.previewUrl ? <video controls src={previewAsset.previewUrl} className="max-h-[70vh] w-full rounded-md bg-black" /> : null}
        {previewAsset?.kind === "file" ? <div className="text-sm text-zinc-300">{previewAsset.name}</div> : null}
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Heart, MessageCircle, Plus, Search, Share, Star, Trash2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import bilibiliIconUrl from "@/assets/哔哩哔哩.svg";
import douyinIconUrl from "@/assets/抖音.svg";
import wechatOfficialIconUrl from "@/assets/公众号.svg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getMySuperSiteSettings } from "@/lib/superSiteSettings";
import { useAuthStore } from "@/store/authStore";
import {
  listPublishingContents,
  listPublishingJobs,
  listPlatformAccounts,
  deletePublishingJob,
  publishLeadContent,
  startExtensionPublishJob,
  syncExtensionPublishJob,
  type LeadPlatformStyle,
  type LeadPublishStatus,
  type PlatformAccountItem,
  type PublishingContentItem,
  type PublishingJobItem,
} from "@/lib/publishing";
import {
  pingPlatformLoginExtension,
  startPlatformPublishExtensionSession,
} from "@/lib/platformLoginExtension";

export const publishPlatformOptions: Array<{ key: LeadPlatformStyle; label: string; enabled: boolean }> = [
  { key: "xiaohongshu", label: "小红书", enabled: true },
  { key: "douyin", label: "抖音", enabled: true },
  { key: "wechat_mp", label: "视频号", enabled: true },
  { key: "kuaishou", label: "快手", enabled: true },
  { key: "wechat_official", label: "微信公众号", enabled: true },
  { key: "bilibili", label: "哔哩哔哩", enabled: true },
];

type PlatformDraftEditorState = {
  title: string;
  body: string;
  tagsText: string;
};

function mergeJobsById(current: PublishingJobItem[], incoming: PublishingJobItem[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    merged.set(item.id, item);
  }
  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function platformLabel(platform: LeadPlatformStyle) {
  if (platform === "xiaohongshu") return "小红书";
  if (platform === "douyin") return "抖音";
  if (platform === "wechat_mp") return "视频号";
  if (platform === "kuaishou") return "快手";
  if (platform === "wechat_official") return "微信公众号";
  return "哔哩哔哩";
}

function contentTypeLabel(type: PublishingContentItem["contentType"]) {
  if (type === "video") return "视频";
  if (type === "product_asset") return "商品素材";
  if (type === "image_text") return "图文";
  return "文案";
}

function formatDraftTags(tags?: string[]) {
  return (tags ?? [])
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((item) => `#${item}`)
    .join(" ");
}

function parseDraftTags(text: string) {
  return Array.from(
    new Set(
      text
        .split(/[\s,，]+/)
        .map((item) => item.trim().replace(/^#+/, ""))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function buildPlatformDraftState(content: PublishingContentItem): PlatformDraftEditorState {
  return {
    title: content.title,
    body: content.body,
    tagsText: formatDraftTags(content.tags),
  };
}

function AssetIcon({ src, className = "" }: { src: string; className?: string }) {
  return <img src={src} alt="" className={`object-contain ${className}`} aria-hidden="true" />;
}

function XiaohongshuIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#FF2442" />
      <text
        x="32"
        y="39"
        fill="#FFFFFF"
        fontSize="20"
        fontWeight="800"
        textAnchor="middle"
        fontFamily="'Microsoft YaHei', 'PingFang SC', sans-serif"
      >
        小红书
      </text>
    </svg>
  );
}

function WechatVideoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path
        d="M282.04032 310.272c-2.96448 2.0736-9.33376 10.496-12.62592 32.22016-4.83328 31.85664-3.3792 95.90784 31.0016 220.20096 1.03936 3.4304 11.49952 37.6064 26.01472 73.73824 21.36064 53.18144 35.40992 71.08608 40.92928 76.61568 8.04864-3.29216 26.66496-15.33952 53.02272-47.40096 23.0656-28.0576 43.73504-61.53216 56.9856-91.9552-13.38368-23.23968-43.50976-74.47552-77.92128-126.04928C320.77312 329.74336 288.33792 312.6272 282.04032 310.272zM741.95968 310.272c-6.2976 2.3552-38.7328 19.47136-117.40672 137.3696-34.41152 51.57376-64.53248 102.8096-77.92128 126.04928 13.25568 30.42304 33.92 63.89248 56.9856 91.9552 26.35776 32.06144 44.9792 44.1088 53.02784 47.40096 5.52448-5.54496 19.63008-23.52128 41.08288-77.00992a985.216 985.216 0 0 0 25.85088-73.33888c34.37568-124.29312 35.83488-188.34944 31.0016-220.20608-3.29216-21.72416-9.66144-30.15168-12.6208-32.22016z"
        fill="#FA9D3B"
      />
      <path
        d="M849.92 51.2H174.08c-67.8656 0-122.88 55.0144-122.88 122.88v675.84c0 67.8656 55.0144 122.88 122.88 122.88h675.84c67.8656 0 122.88-55.0144 122.88-122.88V174.08c0-67.8656-55.0144-122.88-122.88-122.88z m-66.21184 528.50688l-0.1792 0.62976c-0.54784 1.83296-13.71136 45.57312-32.3584 90.07104-31.17568 74.37824-58.48064 106.11712-91.29472 106.11712-29.96736 0-64.49152-23.17824-102.61504-68.89472-16.52224-19.80928-32.03072-42.14784-45.2608-64.79872-13.23008 22.65088-28.73856 44.98944-45.2608 64.79872-38.12352 45.71648-72.64768 68.89472-102.61504 68.89472-32.81408 0-60.11904-31.73376-91.29472-106.11712-18.65216-44.4928-31.80544-88.23296-32.3584-90.07104l-0.1792-0.62976c-43.4944-157.11744-46.976-256.70656-10.65472-304.45056 19.60448-25.76896 44.35456-27.77088 51.47136-27.77088 0.54784 0 1.08544 0.01024 1.6128 0.03072 28.80512 0.38912 71.168 20.4288 165.12 160.11264 24.96512 37.12 47.62624 73.90208 64.1536 101.59104 16.53248-27.68896 39.18848-64.46592 64.1536-101.59104 93.952-139.68384 136.31488-159.72352 165.12-160.11264 0.52736-0.02048 1.06496-0.03072 1.6128-0.03072 7.1168 0 31.86688 2.00704 51.47136 27.77088 36.33152 47.744 32.84992 147.33312-10.64448 304.45056z"
        fill="#FA9D3B"
      />
    </svg>
  );
}

function KuaishouIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path
        d="M299.27936 624.43008v87.48544c0 14.64832 10.70592 21.24288 23.78752 14.65856l83.49696-42.01984v-32.76288L323.072 609.7664c-13.08672-6.58432-23.79264 0.01536-23.79264 14.66368zM654.42304 436.03456c36.72064 0 66.59584-29.87008 66.59584-66.59072s-29.8752-66.59584-66.59584-66.59584c-36.71552 0-66.5856 29.8752-66.5856 66.59584s29.87008 66.59072 66.5856 66.59072zM443.56096 435.65056c47.73376 0 86.56384-38.8352 86.56384-86.56896s-38.83008-86.56896-86.56384-86.56896-86.56896 38.8352-86.56896 86.56896 38.8352 86.56896 86.56896 86.56896z"
        fill="#FF4A08"
      />
      <path
        d="M849.92 51.2H174.08c-67.8656 0-122.88 55.0144-122.88 122.88v675.84c0 67.8656 55.0144 122.88 122.88 122.88h675.84c67.8656 0 122.88-55.0144 122.88-122.88V174.08c0-67.8656-55.0144-122.88-122.88-122.88zM443.56096 204.8c54.05184 0 101.22752 29.89056 125.93664 73.99936 22.24128-20.85376 52.11136-33.664 84.93056-33.664 68.54656 0 124.30848 55.76704 124.30848 124.30848s-55.76704 124.30336-124.30848 124.30336c-41.40544 0-78.12608-20.37248-100.73088-51.60448-26.48576 31.29856-66.01728 51.22048-110.13632 51.22048-79.55968 0-144.2816-64.72704-144.2816-144.2816S364.00128 204.8 443.56096 204.8z m336.65536 505.63584c0 59.97568-48.78848 108.76416-108.76416 108.76416H515.328c-47.05792 0-87.22432-30.04416-102.34368-71.96672l-87.81824 42.40384c-9.43616 4.5568-18.97984 6.8608-28.37504 6.8608h-0.00512c-30.70976 0-53.00224-24.3712-53.00224-57.9328v-140.5696c0-33.57696 22.29248-57.94304 53.00736-57.94304 9.3952 0 18.93888 2.30912 28.36992 6.86592l87.59808 42.29632c14.93504-42.26048 55.26528-72.63232 102.56896-72.63232h156.11904c59.97568 0 108.76416 48.7936 108.76416 108.76928v85.08416z"
        fill="#FF4A08"
      />
      <path
        d="M671.45216 574.28992H515.328c-28.14976 0-51.05664 22.90688-51.05664 51.05664v85.08928c0 28.14976 22.90688 51.05664 51.05664 51.05664h156.11904c28.14976 0 51.05664-22.90688 51.05664-51.05664v-85.08928c0-28.14976-22.90176-51.05664-51.05152-51.05664z"
        fill="#FF4A08"
      />
    </svg>
  );
}

function PlatformBadgeIcon({ platform, className = "" }: { platform: LeadPlatformStyle; className?: string }) {
  if (platform === "xiaohongshu") return <XiaohongshuIcon className={className} />;
  if (platform === "douyin") return <AssetIcon src={douyinIconUrl} className={className} />;
  if (platform === "wechat_mp") return <WechatVideoIcon className={className} />;
  if (platform === "kuaishou") return <KuaishouIcon className={className} />;
  if (platform === "wechat_official") return <AssetIcon src={wechatOfficialIconUrl} className={className} />;
  return <AssetIcon src={bilibiliIconUrl} className={className} />;
}

function isPlatformAccountOnline(account: PlatformAccountItem | null | undefined) {
  return Boolean(account && account.status === "valid" && account.loginStatus === "authenticated");
}

function buildDraftPreviewText(draft?: PlatformDraftEditorState | null) {
  const body = draft?.body?.trim() ?? "";
  const tags = draft?.tagsText?.trim() ?? "";
  return [body, tags].filter(Boolean).join("\n\n");
}

function resolvePreviewImage(content?: PublishingContentItem | null) {
  if (!content) return null;
  return content.coverImage || content.images?.[0] || null;
}

function buildPreviewExcerpt(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export default function Publishing() {
  usePageMeta("获客内容池");
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [contents, setContents] = useState<PublishingContentItem[]>([]);
  const [publishJobs, setPublishJobs] = useState<PublishingJobItem[]>([]);
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccountItem[]>([]);
  const [status, setStatus] = useState<"all" | LeadPublishStatus>("all");
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<LeadPlatformStyle[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Partial<Record<LeadPlatformStyle, string>>>({});
  const [activeEditorPlatform, setActiveEditorPlatform] = useState<LeadPlatformStyle | null>(null);
  const [platformDrafts, setPlatformDrafts] = useState<Partial<Record<LeadPlatformStyle, PlatformDraftEditorState>>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [superSiteBaseUrl, setSuperSiteBaseUrl] = useState("");

  const refreshPublishJobs = useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      try {
        const jobResult = await listPublishingJobs({ accessToken, page: 1, limit: 20 });
        setPublishJobs(jobResult.items);
      } catch (error) {
        if (!silent) {
          setHint(error instanceof Error ? error.message : "加载发布记录失败");
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!accessToken) {
      setContents([]);
      setPublishJobs([]);
      setPlatformAccounts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [contentResult, jobResult, accountResult] = await Promise.all([
          listPublishingContents({ accessToken, status: "active", page: 1, limit: 20 }),
          listPublishingJobs({ accessToken, page: 1, limit: 20 }),
          listPlatformAccounts({
            accessToken,
            page: 1,
            limit: 100,
            autoComplete: "none",
          }),
        ]);

        if (cancelled) return;
        setContents(contentResult.items);
        setPublishJobs(jobResult.items);
        setPlatformAccounts(accountResult.items);
        setHint(null);
      } catch (error) {
        if (!cancelled) {
          setHint(error instanceof Error ? error.message : "加载获客内容池失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const hasPendingPublishJobs = useMemo(
    () => publishJobs.some((job) => job.status === "queued" || job.status === "running"),
    [publishJobs],
  );

  useEffect(() => {
    if (!accessToken || !hasPendingPublishJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshPublishJobs(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [accessToken, hasPendingPublishJobs, refreshPublishJobs]);

  useEffect(() => {
    if (!accessToken) {
      setSuperSiteBaseUrl("");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const settings = await getMySuperSiteSettings();
        if (!cancelled) {
          setSuperSiteBaseUrl(settings.superSiteBaseUrl?.trim() ?? "");
        }
      } catch {
        if (!cancelled) {
          setSuperSiteBaseUrl("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const jobList = useMemo(
    () => (status === "all" ? publishJobs : publishJobs.filter((job) => job.status === status)),
    [publishJobs, status],
  );

  const publishContent = useMemo(
    () => contents.find((item) => item.id === publishTarget) ?? null,
    [contents, publishTarget],
  );

  const activeDraft = useMemo(
    () => (activeEditorPlatform ? platformDrafts[activeEditorPlatform] ?? null : null),
    [activeEditorPlatform, platformDrafts],
  );
  const activePreviewImage = useMemo(() => resolvePreviewImage(publishContent), [publishContent]);
  const activePreviewText = useMemo(() => buildDraftPreviewText(activeDraft), [activeDraft]);
  const activePreviewTags = useMemo(() => parseDraftTags(activeDraft?.tagsText ?? ""), [activeDraft]);
  const visiblePlatformOptions = useMemo(
    () => publishPlatformOptions.filter((item) => platformAccounts.some((account) => account.platform === item.key)),
    [platformAccounts],
  );

  function getAvailableAccounts(platform: LeadPlatformStyle) {
    return platformAccounts.filter(
      (item) => item.platform === platform && item.status === "valid" && item.loginStatus === "authenticated",
    );
  }

  function getPlatformAccounts(platform: LeadPlatformStyle) {
    return platformAccounts.filter((item) => item.platform === platform);
  }

  function hasAvailableAccount(platform: LeadPlatformStyle) {
    return getAvailableAccounts(platform).length > 0;
  }

  function getPreferredPlatformAccount(platform: LeadPlatformStyle) {
    return getAvailableAccounts(platform)[0] ?? getPlatformAccounts(platform)[0] ?? null;
  }

  function getDisplayAccount(platform: LeadPlatformStyle) {
    const accountId = selectedAccounts[platform];
    if (accountId) {
      const matched = getPlatformAccounts(platform).find((item) => item.id === accountId);
      if (matched) return matched;
    }
    return getPreferredPlatformAccount(platform);
  }

  function getDisplayAccountName(platform: LeadPlatformStyle) {
    const account = getDisplayAccount(platform);
    return account?.displayName?.trim() || account?.accountName?.trim() || "";
  }

  function getSelectedAccount(platform: LeadPlatformStyle) {
    const accountId = selectedAccounts[platform];
    if (!accountId) return null;
    return getPlatformAccounts(platform).find((item) => item.id === accountId) ?? null;
  }

  function togglePlatform(platform: LeadPlatformStyle) {
    const option = publishPlatformOptions.find((item) => item.key === platform);
    if (!option?.enabled) return;
    if (!hasAvailableAccount(platform)) {
      setHint(`${platformLabel(platform)}账号已掉线，请先重新登录后再发布。`);
      return;
    }

    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        setSelectedAccounts((accounts) => {
          const next = { ...accounts };
          delete next[platform];
          return next;
        });
        if (activeEditorPlatform === platform) {
          setActiveEditorPlatform((current) => {
            const remaining = current === platform ? selectedPlatforms.filter((item) => item !== platform) : selectedPlatforms;
            return remaining[0] ?? null;
          });
        }
        return current.filter((item) => item !== platform);
      }

      const firstAccount = getAvailableAccounts(platform)[0];
      if (firstAccount) {
        setSelectedAccounts((accounts) => ({
          ...accounts,
          [platform]: firstAccount.id,
        }));
      }
      setPlatformDrafts((drafts) => {
        if (!publishContent || drafts[platform]) return drafts;
        return {
          ...drafts,
          [platform]: buildPlatformDraftState(publishContent),
        };
      });
      setActiveEditorPlatform(platform);
      return [...current, platform];
    });
  }

  function openPublishModal(contentId: string) {
    const current = contents.find((item) => item.id === contentId) ?? null;
    const initialPlatforms = visiblePlatformOptions.filter((item) => hasAvailableAccount(item.key)).map((item) => item.key);
    const nextPlatforms =
      initialPlatforms.length > 0
        ? initialPlatforms
        : current?.platformStyle && hasAvailableAccount(current.platformStyle)
          ? [current.platformStyle]
          : [];
    setPublishTarget(contentId);
    setSelectedPlatforms(nextPlatforms);
    setSelectedAccounts(() => {
      const next: Partial<Record<LeadPlatformStyle, string>> = {};
      for (const platform of nextPlatforms) {
        const firstAccount = getAvailableAccounts(platform)[0];
        if (firstAccount) {
          next[platform] = firstAccount.id;
        }
      }
      return next;
    });
    setPlatformDrafts(() => {
      if (!current) return {};
      const next: Partial<Record<LeadPlatformStyle, PlatformDraftEditorState>> = {};
      for (const platform of visiblePlatformOptions.map((item) => item.key)) {
        next[platform] = buildPlatformDraftState(current);
      }
      return next;
    });
    setActiveEditorPlatform(nextPlatforms[0] ?? null);
  }

  function handleAccountChange(platform: LeadPlatformStyle, accountId: string) {
    setSelectedAccounts((current) => ({
      ...current,
      [platform]: accountId,
    }));
  }

  function handleDraftFieldChange(
    platform: LeadPlatformStyle,
    field: keyof PlatformDraftEditorState,
    value: string,
  ) {
    setPlatformDrafts((current) => ({
      ...current,
      [platform]: {
        title: current[platform]?.title ?? publishContent?.title ?? "",
        body: current[platform]?.body ?? publishContent?.body ?? "",
        tagsText: current[platform]?.tagsText ?? formatDraftTags(publishContent?.tags),
        [field]: value,
      },
    }));
  }

  async function handleDeleteJob(jobId: string) {
    if (!accessToken || deletingJobId) return;

    setDeletingJobId(jobId);
    try {
      await deletePublishingJob({ accessToken, id: jobId });
      setPublishJobs((current) => current.filter((job) => job.id !== jobId));
      setHint("发布记录已删除");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "删除发布记录失败");
    } finally {
      setDeletingJobId(null);
    }
  }

  const canSubmitPublish =
    selectedPlatforms.length > 0 &&
    selectedPlatforms.every((platform) => Boolean(selectedAccounts[platform]));

  async function confirmPublish() {
    if (!publishTarget || selectedPlatforms.length === 0 || !accessToken) return;

    const targets = selectedPlatforms.map((platform) => ({
      platform,
      platformAccountId: selectedAccounts[platform] ?? "",
      draftTitle: platformDrafts[platform]?.title?.trim() || undefined,
      draftBody: platformDrafts[platform]?.body ?? undefined,
      draftTags: parseDraftTags(platformDrafts[platform]?.tagsText ?? ""),
    }));

    if (targets.some((item) => !item.platformAccountId)) {
      setHint("请先为每个平台选择发布账号");
      return;
    }

    try {
      setPublishing(true);

      const extensionTargets = targets.filter(
        (item) => item.platform === "xiaohongshu" || item.platform === "wechat_mp",
      );
      const serverTargets = targets.filter(
        (item) => item.platform !== "xiaohongshu" && item.platform !== "wechat_mp",
      );

      if (extensionTargets.length > 0) {
        const extensionReady = await pingPlatformLoginExtension();
        if (!extensionReady) {
          setHint("未检测到平台扩展，请先安装并启用扩展后再发布小红书/视频号。");
          return;
        }
      }

      const createdJobs: PublishingJobItem[] = [];

      if (serverTargets.length > 0) {
        const serverResult = await publishLeadContent({
          accessToken,
          contentId: publishTarget,
          targets: serverTargets,
        });
        createdJobs.push(...serverResult.jobs);
      }

      if (extensionTargets.length > 0) {
        const extensionResult = await publishLeadContent({
          accessToken,
          contentId: publishTarget,
          targets: extensionTargets,
          executionMode: "extension",
        });
        createdJobs.push(...extensionResult.jobs);

        for (const job of extensionResult.jobs) {
          const session = await startExtensionPublishJob({
            accessToken,
            jobId: job.id,
          });
          try {
            await startPlatformPublishExtensionSession({
              session,
              platform: job.platform,
              apiBaseUrl: window.location.origin,
            });
          } catch (error) {
            await syncExtensionPublishJob({
              sessionToken: session.sessionToken,
              status: "failed",
              lastError: error instanceof Error ? error.message : "本地发布扩展启动失败",
            });
          }
        }
      }

      setPublishJobs((prev) => mergeJobsById(prev, createdJobs));
      setPublishTarget(null);
      setHint(
        extensionTargets.length > 0 && serverTargets.length > 0
          ? "已创建发布任务：小红书/视频号由本机扩展执行，其余平台由后端执行。"
          : extensionTargets.length > 0
            ? "已创建发布任务：扩展正在用户本机浏览器执行发布流程。"
            : "已创建发布任务：后端正在执行发布流程。",
      );
      void refreshPublishJobs(true);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "创建发布任务失败");
    } finally {
      setPublishing(false);
    }
  }

  function hasSuperSiteImages(item: PublishingContentItem) {
    return Boolean(item.coverImage) || (Array.isArray(item.images) && item.images.length > 0);
  }

  function openSuperSiteEditor(item: PublishingContentItem) {
    if (!accessToken || !user?.id) {
      setHint("当前登录状态无效，请重新登录后再试。");
      return;
    }
    if (!hasSuperSiteImages(item)) {
      setHint("当前内容没有可上传到超级站的图片素材。");
      return;
    }
    if (!superSiteBaseUrl) {
      setHint("请先到超级站配置中心填写“超级站前台地址”后再使用上传超级站。");
      return;
    }

    try {
      const url = new URL(superSiteBaseUrl);
      url.searchParams.set("userId", user.id);
      url.searchParams.set("siteEditor", "1");
      url.searchParams.set("contentId", item.id);
      url.searchParams.set("editorToken", accessToken);
      const opened = window.open(url.toString(), "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.assign(url.toString());
      }
      setHint("已打开超级站编辑页，请在前台选择图片后点击对应位置，再统一保存。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "超级站前台地址无效");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>获客内容池</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-zinc-300">
          内容池展示已同步入池的正式素材。小红书/视频号走本机浏览器扩展执行，其余平台由后端执行发布流程。
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>内容池</CardTitle>
        </CardHeader>
        <CardContent>
          {hint ? <div className="mb-3 text-xs text-zinc-400">{hint}</div> : null}
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>素材标题</Th>
                  <Th>类型</Th>
                  <Th>平台风格</Th>
                  <Th>创建时间</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <Tr>
                    <Td colSpan={5} className="py-10 text-center text-zinc-400">
                      加载中...
                    </Td>
                  </Tr>
                ) : contents.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="py-10 text-center text-zinc-400">
                      暂无已入池素材
                    </Td>
                  </Tr>
                ) : (
                  contents.map((item) => (
                    <Tr key={item.id}>
                      <Td className="font-medium text-zinc-100">{item.title}</Td>
                      <Td className="text-zinc-300">{contentTypeLabel(item.contentType)}</Td>
                      <Td className="text-zinc-300">{platformLabel(item.platformStyle)}</Td>
                      <Td className="text-zinc-400">{new Date(item.createdAt).toLocaleString()}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => openPublishModal(item.id)}>
                            一键发布
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!hasSuperSiteImages(item)}
                            onClick={() => openSuperSiteEditor(item)}
                          >
                            上传超级站
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>发布记录</CardTitle>
            <div className="w-40">
              <Select value={status} onChange={(e) => setStatus(e.target.value as "all" | LeadPublishStatus)}>
                <option value="all">全部状态</option>
                <option value="queued">待发布</option>
                <option value="running">发布中</option>
                <option value="success">已发布</option>
                <option value="failed">失败</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>内容ID</Th>
                  <Th>目标平台</Th>
                  <Th>发布账号</Th>
                  <Th>执行时间</Th>
                  <Th>状态</Th>
                  <Th className="w-14 text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {jobList.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-10 text-center text-zinc-400">
                      暂无发布记录
                    </Td>
                  </Tr>
                ) : (
                  jobList.map((job) => (
                    <Tr key={job.id}>
                      <Td className="font-mono text-xs text-zinc-300">{job.leadContentTitle ?? job.leadContentId}</Td>
                      <Td className="text-zinc-300">{platformLabel(job.platform)}</Td>
                      <Td className="text-zinc-400">{job.platformAccountDisplayName || job.platformAccountName || "-"}</Td>
                      <Td className="text-zinc-400">{new Date(job.draftedAt ?? job.createdAt).toLocaleString()}</Td>
                      <Td>
                        <PublishBadge status={job.status} />
                        {job.lastError ? <div className="mt-1 text-xs text-rose-300">{job.lastError}</div> : null}
                        {job.draftUrl && job.status !== "success" ? (
                          <div className="mt-1 break-all text-xs text-zinc-400">
                            <a
                              href={job.draftUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              {job.draftUrl}
                            </a>
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-right">
                        <button
                          type="button"
                          aria-label="删除发布记录"
                          title="删除"
                          disabled={deletingJobId === job.id}
                          onClick={() => void handleDeleteJob(job.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Modal
        open={!!publishTarget}
        title="一键发布"
        onClose={() => setPublishTarget(null)}
        panelClassName="max-w-[96vw] xl:max-w-[1240px]"
        bodyClassName="px-0 py-0"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">已选择 {selectedPlatforms.length} 个平台</div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPublishTarget(null)}>
                取消
              </Button>
              <Button onClick={() => void confirmPublish()} disabled={!canSubmitPublish || publishing}>
                {publishing ? "发布中..." : "发布"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex min-h-[680px] flex-col">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-base font-semibold text-zinc-100">{publishContent?.title ?? "未选择素材"}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  点击头像多选平台；下方会出现对应平台的草稿输入列，右侧头像进入详细编辑。
                </div>
              </div>
              {publishContent ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="gray">{contentTypeLabel(publishContent.contentType)}</Badge>
                  <Badge variant="blue">{platformLabel(publishContent.platformStyle)}</Badge>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {visiblePlatformOptions.map((option) => {
                const selected = selectedPlatforms.includes(option.key);
                const active = activeEditorPlatform === option.key;
                const displayAccount = getDisplayAccount(option.key);
                const online = isPlatformAccountOnline(displayAccount);

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => togglePlatform(option.key)}
                    className={`relative shrink-0 transition ${online ? "hover:scale-[1.03]" : "cursor-not-allowed"}`}
                    aria-pressed={selected}
                    title={platformLabel(option.key)}
                  >
                    <span
                      className={`absolute -right-0.5 -top-0.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                        selected ? "bg-cyan-400 text-black" : "bg-white/10 text-zinc-300"
                      }`}
                    >
                      {selected ? "✓" : "+"}
                    </span>
                    <span
                      className={`absolute inset-0 rounded-full ring-2 transition ${
                        active
                          ? "ring-orange-400/90"
                          : selected
                            ? "ring-cyan-400/70"
                            : "ring-transparent"
                      }`}
                    />
                    <span className={`relative block h-14 w-14 rounded-full ${online ? "" : "grayscale opacity-60"}`}>
                      <span className="block h-full w-full overflow-hidden rounded-full">
                        {displayAccount?.avatarUrl ? (
                          <img
                            src={displayAccount.avatarUrl}
                            alt={platformLabel(option.key)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="block h-full w-full bg-white/10" />
                        )}
                      </span>
                      <span className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                      <PlatformBadgeIcon
                        platform={option.key}
                        className="absolute -bottom-1 -right-1 h-5 w-5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid flex-1 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div className="space-y-4 border-b border-white/10 p-4 xl:border-b-0 xl:border-r xl:border-white/10">
              {selectedPlatforms.length > 0 ? (
                selectedPlatforms.map((platform) => {
                  const draft = platformDrafts[platform];
                  const displayAccount = getDisplayAccount(platform);
                  const online = isPlatformAccountOnline(displayAccount);
                  const active = activeEditorPlatform === platform;

                  return (
                    <div
                      key={platform}
                      onClick={() => setActiveEditorPlatform(platform)}
                      className={`cursor-pointer rounded-2xl bg-white/5 p-4 transition ${
                        active ? "ring-1 ring-orange-400/60" : "ring-1 ring-white/10"
                      }`}
                    >
                      <div className={`flex gap-3 ${active ? "items-start" : "items-center"}`}>
                        <span className="relative mt-1 block h-8 w-8 rounded-full">
                          <span className="block h-full w-full overflow-hidden rounded-full bg-white/10">
                            {displayAccount?.avatarUrl ? (
                              <img
                                src={displayAccount.avatarUrl}
                                alt={platformLabel(platform)}
                                className={`h-full w-full object-cover ${online ? "" : "grayscale opacity-60"}`}
                              />
                            ) : null}
                          </span>
                          <PlatformBadgeIcon
                            platform={platform}
                            className="absolute -bottom-1 -right-1 h-4 w-4 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          {active ? (
                            <div className="space-y-3">
                              <Input
                                value={draft?.title ?? ""}
                                onChange={(e) => handleDraftFieldChange(platform, "title", e.target.value)}
                                placeholder={`${platformLabel(platform)}标题`}
                              />
                              <textarea
                                value={draft?.body ?? ""}
                                onChange={(e) => handleDraftFieldChange(platform, "body", e.target.value)}
                                placeholder={`${platformLabel(platform)}开始写...`}
                                className="min-h-[120px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400/30"
                              />
                              <Input
                                value={draft?.tagsText ?? ""}
                                onChange={(e) => handleDraftFieldChange(platform, "tagsText", e.target.value)}
                                placeholder="输入 #标签，多个标签用空格分隔"
                              />
                            </div>
                          ) : (
                            <div className="truncate text-sm text-zinc-100">
                              {draft?.title?.trim() || `${platformLabel(platform)}标题`}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-zinc-400">
                  请先点击上方头像选择要发布的平台
                </div>
              )}
            </div>

            <div className="space-y-4 p-4">
              <div className="text-sm font-semibold text-zinc-100">预览</div>

              {activeEditorPlatform ? (
                <>
                  <div className="rounded-[36px] bg-zinc-900 p-3 shadow-[0_20px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
                    <div className="mx-auto w-full max-w-[270px] rounded-[34px] bg-[#161722] p-[7px] shadow-[0_30px_100px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
                      <div className="relative overflow-hidden rounded-[28px] bg-black">
                        <div className="pointer-events-none absolute left-1/2 top-0 z-30 h-7 w-28 -translate-x-1/2 rounded-b-[18px] bg-[#191a25]" />
                        <div className="pointer-events-none absolute left-1/2 top-[9px] z-30 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/20" />

                        {activeEditorPlatform === "douyin" ? (
                          <>
                            <div className="relative z-10 flex items-center justify-between px-4 pt-10 text-[11px] text-white/40">
                              <span className="font-medium">直播</span>
                              <div className="flex items-center gap-4">
                                <span className="font-medium">同城</span>
                                <span className="font-medium">关注</span>
                                <span className="border-b border-white pb-0.5 font-semibold text-white">推荐</span>
                              </div>
                              <Search className="h-3.5 w-3.5" />
                            </div>

                            <div className="relative mt-3 aspect-[9/16] bg-black">
                              {activePreviewImage ? (
                                <img src={activePreviewImage} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-sm text-zinc-500">暂无预览图片</div>
                              )}

                              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/75 to-transparent" />

                              <div className="absolute bottom-5 left-3 right-16 text-white">
                                <div className="text-[13px] font-semibold leading-5">
                                  {getDisplayAccount(activeEditorPlatform)?.accountName ? `@${getDisplayAccount(activeEditorPlatform)?.accountName}` : ""}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5">
                                  {activeDraft?.title?.trim() || "请输入标题"}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/85">
                                  {buildPreviewExcerpt(activePreviewText || "请输入文案内容", 46)}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-white/75">
                                  <span className="text-xs">♫</span>
                                  <span className="truncate">
                                    {getDisplayAccount(activeEditorPlatform)?.accountName
                                      ? `原声 ${getDisplayAccount(activeEditorPlatform)?.accountName} 的作品原声`
                                      : "原声"}
                                  </span>
                                </div>
                              </div>

                              <div className="absolute bottom-12 right-2 flex flex-col items-center gap-3 text-white">
                                <div className="relative">
                                  <div className="h-10 w-10 overflow-hidden rounded-full border border-white bg-white/10">
                                    {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                                      <img
                                        src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="absolute -bottom-1 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-[#ff2d55]">
                                    <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                                  </div>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <Heart className="h-7 w-7 fill-white text-white" strokeWidth={1.5} />
                                  <span className="text-[10px] leading-none">赞</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <MessageCircle className="h-7 w-7 fill-white text-white" strokeWidth={1.5} />
                                  <span className="text-[10px] leading-none">评论</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <Star className="h-7 w-7 fill-white text-white" strokeWidth={1.5} />
                                  <span className="text-[10px] leading-none">收藏</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <Share className="h-7 w-7 text-white" strokeWidth={1.8} />
                                  <span className="text-[10px] leading-none">分享</span>
                                </div>
                                <PlatformBadgeIcon platform="douyin" className="h-7 w-7" />
                              </div>
                            </div>

                            <div className="flex items-center justify-around border-t border-white/10 px-3 py-3 text-[11px] text-white/30">
                              <span className="text-white/70">首页</span>
                              <span>朋友</span>
                              <span className="rounded-md border border-white/40 px-3 py-0.5 text-white/80">+</span>
                              <span>消息</span>
                              <span>我</span>
                            </div>
                          </>
                        ) : activeEditorPlatform === "wechat_mp" ? (
                          <>
                            <div className="pt-10">
                              <div className="aspect-[9/11] bg-zinc-100">
                                {activePreviewImage ? (
                                  <img src={activePreviewImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">暂无预览图片</div>
                                )}
                              </div>
                            </div>

                            <div className="px-3 pt-3 text-white">
                              <div className="line-clamp-1 text-[13px] font-semibold leading-5">
                                {activeDraft?.title?.trim() || "请输入标题"}
                              </div>
                              <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/72">
                                {buildPreviewExcerpt(activeDraft?.body?.trim() || "请输入文案内容", 48)}
                              </div>
                            </div>

                            <div className="flex items-end justify-between px-3 py-4 text-white/80">
                              <div>
                                <div className="text-sm text-white/35">📍 广州市</div>
                                <div className="mt-5 flex items-center gap-2">
                                  <div className="h-5 w-5 overflow-hidden rounded-full bg-white/10">
                                    {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                                      <img
                                        src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <span className="text-[11px] text-white">
                                    {getDisplayAccountName(activeEditorPlatform)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-8 text-[12px]">
                                <div className="flex flex-col items-center gap-1">
                                  <Share className="h-5 w-5" />
                                  <span>转发</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <Heart className="h-5 w-5" />
                                  <span>赞</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                  <MessageCircle className="h-5 w-5" />
                                  <span>评论</span>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : activeEditorPlatform === "xiaohongshu" ? (
                          <>
                            <div className="overflow-hidden bg-white text-zinc-900">
                              <div className="flex items-center justify-between px-4 pt-3 text-black">
                                <div className="text-[14px] font-semibold tracking-[0.01em]">9:41</div>
                                <div className="flex items-center gap-1.5">
                                  <div className="flex items-end gap-[2px]">
                                    <span className="h-[4px] w-[2px] rounded-full bg-black" />
                                    <span className="h-[6px] w-[2px] rounded-full bg-black" />
                                    <span className="h-[8px] w-[2px] rounded-full bg-black" />
                                    <span className="h-[10px] w-[2px] rounded-full bg-black" />
                                  </div>
                                  <div className="flex h-[10px] w-[22px] items-center rounded-[3px] bg-black/10 px-[2px]">
                                    <div className="h-[6px] w-[14px] rounded-[2px] bg-black" />
                                  </div>
                                  <span className="h-[4px] w-[1.5px] rounded-full bg-black/90" />
                                </div>
                              </div>

                              <div className="flex items-center justify-between px-3 pb-3 pt-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-800"
                                  >
                                    <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                                  </button>
                                  <div className="h-8 w-8 overflow-hidden rounded-full bg-zinc-200">
                                    {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                                      <img
                                        src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="max-w-[84px] truncate text-[13px] font-medium text-zinc-900">
                                    {getDisplayAccountName(activeEditorPlatform)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button className="h-7 rounded-full border border-[#ff6b81]/45 bg-[#fff5f7] px-3 text-[12px] font-medium text-[#ff4d6d]">
                                    关注
                                  </button>
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-700"
                                  >
                                    <Share className="h-4 w-4" strokeWidth={1.9} />
                                  </button>
                                </div>
                              </div>

                              <div className="h-[320px] bg-[#f4f4f4]">
                                {activePreviewImage ? (
                                  <img src={activePreviewImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">暂无预览图片</div>
                                )}
                              </div>

                              <div className="space-y-2 px-4 pt-4 pb-3">
                                <div className="text-[14px] font-semibold leading-6">
                                  {activeDraft?.title?.trim() || "请输入标题"}
                                </div>
                                <div className="whitespace-pre-wrap break-words text-[14px] leading-6 text-zinc-700">
                                  {buildPreviewExcerpt(activeDraft?.body?.trim() || "请输入文案内容", 36)}
                                </div>
                                <div className="text-[12px] text-zinc-400">编辑于 刚刚</div>
                              </div>

                              <div className="border-t border-zinc-200 px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 overflow-hidden rounded-full bg-zinc-200">
                                    {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                                      <img
                                        src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="flex-1 rounded-full bg-zinc-100 px-4 py-2 text-[12px] text-zinc-400">
                                    说点什么，让 TA 也认识常记的你
                                  </div>
                                </div>
                              </div>

                              <div className="border-t border-zinc-200 px-4 py-3">
                                <div className="flex items-center justify-between text-[12px] text-zinc-700">
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                      <Heart className="h-5 w-5" strokeWidth={1.8} />
                                      <span>点赞</span>
                                    </div>
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                      <Star className="h-5 w-5" strokeWidth={1.8} />
                                      <span>收藏</span>
                                    </div>
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                      <MessageCircle className="h-5 w-5" strokeWidth={1.8} />
                                      <span>评论</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="overflow-hidden bg-zinc-950 text-white">
                              <div className="flex items-center justify-between border-b border-white/10 px-4 pt-10 pb-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                                    {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                                      <img
                                        src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold">{platformLabel(activeEditorPlatform)}</div>
                                    <div className="text-xs text-white/60">
                                      {getDisplayAccountName(activeEditorPlatform)}
                                    </div>
                                  </div>
                                </div>
                                <PlatformBadgeIcon platform={activeEditorPlatform} className="h-8 w-8" />
                              </div>
                              <div className="aspect-[4/5] bg-zinc-900">
                                {activePreviewImage ? (
                                  <img src={activePreviewImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">暂无预览图片</div>
                                )}
                              </div>
                              <div className="space-y-3 px-4 py-4">
                                <div className="text-sm font-semibold">{activeDraft?.title?.trim() || "请输入标题"}</div>
                                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-white/85">
                                  {buildPreviewExcerpt(activePreviewText || "请输入文案内容", 120)}
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <div className="text-xs text-zinc-400">当前预览平台</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                        {getDisplayAccount(activeEditorPlatform)?.avatarUrl ? (
                          <img
                            src={getDisplayAccount(activeEditorPlatform)?.avatarUrl ?? ""}
                            alt=""
                            className={`h-full w-full object-cover ${
                              isPlatformAccountOnline(getDisplayAccount(activeEditorPlatform)) ? "" : "grayscale opacity-60"
                            }`}
                          />
                        ) : null}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{platformLabel(activeEditorPlatform)}</div>
                        <div className="text-xs text-zinc-400">{getDisplayAccountName(activeEditorPlatform)}</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-white/5 px-4 py-10 text-center text-sm text-zinc-400">
                  点击左侧记录，查看对应平台预览
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PublishBadge(props: { status: LeadPublishStatus }) {
  if (props.status === "success") return <Badge variant="green">已发布</Badge>;
  if (props.status === "failed") return <Badge variant="red">发布失败</Badge>;
  if (props.status === "running") return <Badge variant="blue">发布中</Badge>;
  return <Badge variant="gray">排队中</Badge>;
}

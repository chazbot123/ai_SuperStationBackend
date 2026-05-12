import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  deletePlatformAccount,
  listPlatformAccounts,
  startExtensionPlatformLogin,
  type LeadPlatformStyle,
  type PlatformAccountItem,
  type PlatformAccountStatus,
  updatePlatformAccount,
  validatePlatformAccount,
} from "@/lib/publishing";
import {
  listenPlatformExtensionEvents,
  pingPlatformLoginExtension,
  startPlatformLoginExtensionSession,
} from "@/lib/platformLoginExtension";
import { useAuthStore } from "@/store/authStore";

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

function DouyinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#1F0E21" />
      <path
        d="M36 11c2 8 6 12 14 13v9c-5 0-9-1-13-4v12c0 8-6 14-15 14S8 49 8 41s6-14 14-14c2 0 4 0 6 1v10c-2-1-3-2-5-2-3 0-6 3-6 6s3 6 6 6 6-3 6-6V11h7Z"
        fill="#30F2F2"
        transform="translate(-2 1)"
      />
      <path
        d="M36 11c2 8 6 12 14 13v9c-5 0-9-1-13-4v12c0 8-6 14-15 14S8 49 8 41s6-14 14-14c2 0 4 0 6 1v10c-2-1-3-2-5-2-3 0-6 3-6 6s3 6 6 6 6-3 6-6V11h7Z"
        fill="#FE2C55"
        transform="translate(2 0)"
      />
      <path
        d="M36 11c2 8 6 12 14 13v9c-5 0-9-1-13-4v12c0 8-6 14-15 14S8 49 8 41s6-14 14-14c2 0 4 0 6 1v10c-2-1-3-2-5-2-3 0-6 3-6 6s3 6 6 6 6-3 6-6V11h7Z"
        fill="#FFFFFF"
      />
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

const platformOptions: Array<{
  value: LeadPlatformStyle;
  label: string;
  icon: JSX.Element;
  iconWrapClassName: string;
}> = [
  {
    value: "xiaohongshu",
    label: "小红书",
    icon: <XiaohongshuIcon className="h-7 w-7" />,
    iconWrapClassName: "rounded-[9px]",
  },
  {
    value: "douyin",
    label: "抖音",
    icon: <DouyinIcon className="h-8 w-8" />,
    iconWrapClassName: "rounded-[10px]",
  },
  {
    value: "wechat_mp",
    label: "视频号",
    icon: <WechatVideoIcon className="h-8 w-8" />,
    iconWrapClassName: "rounded-[10px]",
  },
  {
    value: "kuaishou",
    label: "快手",
    icon: <KuaishouIcon className="h-8 w-8" />,
    iconWrapClassName: "rounded-[10px]",
  },
];

function platformLabel(platform: LeadPlatformStyle) {
  return platformOptions.find((item) => item.value === platform)?.label ?? platform;
}

function platformMeta(platform: LeadPlatformStyle) {
  return (
    platformOptions.find((item) => item.value === platform) ?? {
      value: platform,
      label: platform,
      icon: <span className="text-xs font-semibold text-zinc-300">P</span>,
      iconWrapClassName: "rounded-full bg-white/10 ring-1 ring-white/10",
    }
  );
}

function statusMeta(status: PlatformAccountStatus) {
  if (status === "valid") return { label: "有效", variant: "green" as const };
  if (status === "invalid") return { label: "失效", variant: "red" as const };
  if (status === "disabled") return { label: "停用", variant: "blue" as const };
  return { label: "待校验", variant: "gray" as const };
}

function loginStatusMeta(status: PlatformAccountItem["loginStatus"]) {
  if (status === "pending") return { label: "登录中", variant: "blue" as const };
  if (status === "authenticated") return { label: "已登录", variant: "green" as const };
  if (status === "failed") return { label: "登录失败", variant: "red" as const };
  if (status === "cancelled") return { label: "已取消", variant: "gray" as const };
  return { label: "未登录", variant: "gray" as const };
}

function isDeletedResult(
  value: { id: string; deleted?: boolean } | PlatformAccountItem,
): value is { id: string; deleted?: boolean } {
  return "deleted" in value;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getPlatformLoginUrl(platform: LeadPlatformStyle) {
  switch (platform) {
    case "xiaohongshu":
      return "https://creator.xiaohongshu.com/login";
    case "douyin":
      return "https://creator.douyin.com/";
    case "wechat_mp":
      return "https://channels.weixin.qq.com/platform";
    case "kuaishou":
      return "https://cp.kuaishou.com/article/publish/video";
    default:
      return "";
  }
}

export default function PublishingPlatformLogin() {
  usePageMeta("平台登录");
  const accessToken = useAuthStore((s) => s.accessToken);

  const [items, setItems] = useState<PlatformAccountItem[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [startingPlatform, setStartingPlatform] = useState<LeadPlatformStyle | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [extensionReady, setExtensionReady] = useState<boolean | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlatformAccountItem | null>(null);
  const [accountName, setAccountName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [remark, setRemark] = useState("");

  const loadAccounts = useCallback(
    async (showLoading = false) => {
      if (!accessToken) {
        setItems([]);
        return;
      }

      try {
        if (showLoading) setLoading(true);
        const result = await listPlatformAccounts({ accessToken, page: 1, limit: 50, autoComplete: "none" });
        setItems(result.items);
        setHint(null);
      } catch (error) {
        setHint(error instanceof Error ? error.message : "加载平台账号失败");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadAccounts(true);
  }, [loadAccounts]);

  useEffect(() => {
    let cancelled = false;
    void pingPlatformLoginExtension()
      .then((ready) => {
        if (!cancelled) {
          setExtensionReady(ready);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExtensionReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return listenPlatformExtensionEvents((event) => {
      if (event.kind === "synced") {
        setItems((current) => {
          const exists = current.some((item) => item.id === event.account.id);
          if (exists) {
            return current.map((item) => (item.id === event.account.id ? event.account : item));
          }
          return [event.account, ...current];
        });
        setHint(`${platformLabel(event.platform)} 登录信息已自动保存。`);
        return;
      }

      if (event.kind === "error" || event.kind === "publish-error") {
        setHint(event.message);
      }
    });
  }, []);

  const summary = useMemo(() => {
    const validCount = items.filter((item) => item.status === "valid").length;
    const pendingCount = items.filter((item) => item.loginStatus === "pending").length;
    return { total: items.length, validCount, pendingCount };
  }, [items]);

  const groupedPlatforms = useMemo(
    () =>
      platformOptions.map((option) => {
        const accounts = items.filter((item) => item.platform === option.value);
        return {
          ...option,
          accounts,
          totalCount: accounts.length,
          validCount: accounts.filter((item) => item.status === "valid").length,
        };
      }),
    [items],
  );

  function resetEditForm() {
    setRemark("");
    setAccountName("");
    setDisplayName("");
    setEditingItem(null);
  }

  function openEditModal(item: PlatformAccountItem) {
    setEditingItem(item);
    setAccountName(item.accountName);
    setDisplayName(item.displayName ?? "");
    setRemark(item.remark ?? "");
    setEditorOpen(true);
  }

  function openLocalLoginPage(platform: LeadPlatformStyle, loginUrl?: string | null) {
    const targetUrl = loginUrl?.trim() || getPlatformLoginUrl(platform);
    if (!targetUrl) {
      setHint("当前平台暂未配置登录地址。");
      return;
    }

    const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      setHint("浏览器拦截了新窗口，请允许弹窗后重试。");
      return;
    }
  }

  async function handleStartLogin(platform: LeadPlatformStyle) {
    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    if (extensionReady === false) {
      setHint("未检测到平台登录扩展，请先安装并启用扩展。");
      return;
    }

    try {
      setStartingPlatform(platform);
      const session = await startExtensionPlatformLogin({ accessToken, platform });
      await startPlatformLoginExtensionSession({
        session,
        platform,
        apiBaseUrl: window.location.origin,
      });
      openLocalLoginPage(platform, session.loginUrl);
      setHint(`已打开${platformLabel(platform)}官方登录页，完成登录后系统会自动保存账号。`);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "发起平台登录失败");
    } finally {
      setStartingPlatform(null);
    }
  }

  async function handleSaveEdit() {
    if (!accessToken || !editingItem) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    const normalizedAccountName = accountName.trim();
    const normalizedDisplayName = displayName.trim();
    const normalizedRemark = remark.trim();

    if (!normalizedAccountName) {
      setHint("请填写平台账号。");
      return;
    }

    try {
      setSaving(true);
      const next = await updatePlatformAccount({
        accessToken,
        id: editingItem.id,
        accountName: normalizedAccountName,
        displayName: normalizedDisplayName || undefined,
        remark: normalizedRemark || undefined,
      });
      setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
      setHint("账号信息已更新。");

      setEditorOpen(false);
      resetEditForm();
    } catch (error) {
      setHint(error instanceof Error ? error.message : "保存平台账号失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestartLogin(item: PlatformAccountItem) {
    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    if (extensionReady === false) {
      setHint("未检测到平台登录扩展，请先安装并启用扩展。");
      return;
    }

    try {
      setRestartingId(item.id);
      const session = await startExtensionPlatformLogin({
        accessToken,
        platform: item.platform,
        accountId: item.id,
      });
      await startPlatformLoginExtensionSession({
        session,
        platform: item.platform,
        apiBaseUrl: window.location.origin,
      });
      openLocalLoginPage(item.platform, session.loginUrl || item.loginUrl);
      setHint(`已重新打开${platformLabel(item.platform)}官方登录页，完成登录后系统会自动更新账号。`);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "重新发起登录失败");
    } finally {
      setRestartingId(null);
    }
  }

  async function handleValidate(item: PlatformAccountItem) {
    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    try {
      setValidatingId(item.id);
      const next = await validatePlatformAccount({ accessToken, id: item.id });
      setItems((current) => current.map((entry) => (entry.id === item.id ? next : entry)));
      setHint(next.status === "valid" ? "账号校验通过。" : next.lastError ?? "账号校验失败。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "校验平台账号失败");
    } finally {
      setValidatingId(null);
    }
  }

  async function handleDelete(item: PlatformAccountItem) {
    if (!accessToken) {
      setHint("登录已失效，请重新登录。");
      return;
    }

    try {
      setDeletingId(item.id);
      await deletePlatformAccount({ accessToken, id: item.id });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setHint("平台账号已删除。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "删除平台账号失败");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleOpenLoginUrl(item: PlatformAccountItem) {
    await handleRestartLogin(item);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>平台登录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-300">
          <div>这里用于预登录发布任务要使用的平台账号，统一存放小红书、抖音、视频号、快手账号。</div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <KeyRound className="h-3.5 w-3.5" />
              预登录平台账号
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              供发布任务调用
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <Smartphone className="h-3.5 w-3.5" />
              浏览器真实登录
            </span>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-xs text-zinc-300">
            点击“发起登录”后，会在你的本机浏览器打开对应平台官方登录页。完成登录后，浏览器扩展会自动回传并保存登录信息。
          </div>
          <div className="text-xs text-zinc-500">
            扩展状态：
            {extensionReady === true ? " 已连接" : extensionReady === false ? " 未检测到扩展" : " 检测中..."}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <span>账号总数：{summary.total}</span>
            <span>有效账号：{summary.validCount}</span>
            <span>登录中：{summary.pendingCount}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>平台账号列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}
          {loading ? <div className="py-10 text-center text-zinc-400">加载中...</div> : null}

          {!loading
            ? groupedPlatforms.map((platformGroup) => {
                const meta = platformMeta(platformGroup.value);

                return (
                  <div key={platformGroup.value} className="rounded-xl border border-white/10 bg-black/10">
                    <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center overflow-hidden ${meta.iconWrapClassName}`}
                            aria-hidden="true"
                          >
                            {meta.icon}
                          </span>
                          <div className="text-sm font-semibold text-zinc-100">{platformGroup.label}</div>
                          <Badge variant={platformGroup.validCount > 0 ? "green" : "gray"}>
                            {platformGroup.validCount > 0
                              ? `${platformGroup.validCount} 个有效账号`
                              : "未配置账号"}
                          </Badge>
                        </div>
                        <div className="text-xs text-zinc-400">
                          已配置 {platformGroup.totalCount} 个账号，用于 {platformGroup.label} 发布任务登录。
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => void handleStartLogin(platformGroup.value)}
                        disabled={startingPlatform === platformGroup.value}
                      >
                        {startingPlatform === platformGroup.value ? "发起中..." : `发起${platformGroup.label}登录`}
                      </Button>
                    </div>

                    {platformGroup.accounts.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-zinc-500">
                        暂无账号，点击右侧按钮发起 {platformGroup.label} 浏览器登录。
                      </div>
                    ) : (
                      <TableWrap className="rounded-none border-0 bg-transparent">
                        <Table>
                          <thead>
                            <tr>
                              <Th>类型</Th>
                              <Th>登录流程</Th>
                              <Th>账号状态</Th>
                              <Th>账号</Th>
                              <Th>登录信息</Th>
                              <Th>最近登录</Th>
                              <Th>最近校验</Th>
                              <Th>备注</Th>
                              <Th className="text-right">操作</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {platformGroup.accounts.map((item) => {
                              const currentStatus = statusMeta(item.status);
                              const currentLogin = loginStatusMeta(item.loginStatus);
                              const actionBusy =
                                validatingId === item.id || deletingId === item.id || restartingId === item.id;

                              return (
                                <Tr key={item.id}>
                                  <Td className="text-zinc-300">{item.authType === "cookie" ? "Cookie" : "Token"}</Td>
                                  <Td>
                                    <Badge variant={currentLogin.variant}>{currentLogin.label}</Badge>
                                  </Td>
                                  <Td>
                                    <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
                                  </Td>
                                  <Td className="text-zinc-300">
                                    <div>{item.displayName || item.accountName}</div>
                                    <div className="text-xs text-zinc-500">
                                      {item.displayName ? `账号 ID：${item.accountName}` : item.accountName}
                                    </div>
                                  </Td>
                                  <Td className="max-w-[220px] break-all font-mono text-xs text-zinc-400">
                                    {item.authPayloadPreview}
                                  </Td>
                                  <Td className="text-zinc-400">
                                    {item.lastLoginCompletedAt
                                      ? formatTime(item.lastLoginCompletedAt)
                                      : item.lastLoginStartedAt
                                        ? formatTime(item.lastLoginStartedAt)
                                        : "-"}
                                  </Td>
                                  <Td className="text-zinc-400">{formatTime(item.lastValidatedAt)}</Td>
                                  <Td className="text-zinc-400">{item.remark || "-"}</Td>
                                  <Td className="text-right">
                                    <div className="flex flex-wrap justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => void handleRestartLogin(item)}
                                        disabled={restartingId === item.id}
                                      >
                                        {restartingId === item.id ? "打开中..." : "重新登录"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => void handleValidate(item)}
                                        disabled={validatingId === item.id || actionBusy}
                                      >
                                        {validatingId === item.id ? "校验中..." : "校验"}
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => openEditModal(item)}
                                        disabled={actionBusy}
                                      >
                                        编辑
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => void handleDelete(item)}
                                        disabled={deletingId === item.id || actionBusy}
                                      >
                                        {deletingId === item.id ? "删除中..." : "删除"}
                                      </Button>
                                    </div>

                                    {item.loginUrl ? (
                                      <div className="mt-2 text-xs text-zinc-500">
                                        <a
                                          href={item.loginUrl}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            void handleOpenLoginUrl(item);
                                          }}
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          打开登录页
                                        </a>
                                      </div>
                                    ) : null}
                                  </Td>
                                </Tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </TableWrap>
                    )}
                  </div>
                );
              })
            : null}
        </CardContent>
      </Card>

      <Modal
        open={editorOpen}
        title={
          editingItem
            ? `编辑 ${platformLabel(editingItem.platform)} 账号`
            : "编辑平台账号"
        }
        onClose={() => {
          setEditorOpen(false);
          resetEditForm();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditorOpen(false);
                resetEditForm();
              }}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={saving || !editingItem}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editingItem ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm text-zinc-200">平台</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {platformLabel(editingItem.platform)}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-zinc-200">登录类型</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {editingItem.authType === "cookie" ? "Cookie" : "Token"}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-zinc-200">平台账号</div>
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                placeholder="例如：账号 ID、手机号或平台昵称"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-zinc-200">展示名称</div>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                placeholder="例如：品牌主账号"
              />
            </div>
          </div>

          {editingItem?.authPayloadPreview ? (
            <div className="space-y-2">
              <div className="text-sm text-zinc-200">当前登录信息</div>
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 font-mono text-xs text-zinc-400">
                {editingItem.authPayloadPreview}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm text-zinc-200">备注</div>
            <textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
              placeholder="例如：品牌主账号、测试账号、备用账号"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

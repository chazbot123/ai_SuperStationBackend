import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getMySuperSiteSettings } from "@/lib/superSiteSettings";
import { useAuthStore } from "@/store/authStore";
import {
  listPublishingContents,
  listPublishingJobs,
  listPlatformAccounts,
  publishLeadContent,
  type LeadPlatformStyle,
  type LeadPublishStatus,
  type PlatformAccountItem,
  type PublishingContentItem,
  type PublishingJobItem,
} from "@/lib/publishing";

export const publishPlatformOptions: Array<{ key: LeadPlatformStyle; label: string; enabled: boolean }> = [
  { key: "xiaohongshu", label: "小红书", enabled: true },
  { key: "douyin", label: "抖音", enabled: true },
  { key: "wechat_mp", label: "视频号", enabled: true },
  { key: "kuaishou", label: "快手", enabled: true },
];

export const defaultPublishPlatforms = publishPlatformOptions
  .filter((item) => item.enabled)
  .map((item) => item.key);

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
  return "快手";
}

function contentTypeLabel(type: PublishingContentItem["contentType"]) {
  if (type === "video") return "视频";
  if (type === "product_asset") return "商品素材";
  if (type === "image_text") return "图文";
  return "文案";
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
  const [selectedPlatforms, setSelectedPlatforms] = useState<LeadPlatformStyle[]>(defaultPublishPlatforms);
  const [selectedAccounts, setSelectedAccounts] = useState<Partial<Record<LeadPlatformStyle, string>>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
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
            status: "valid",
            loginStatus: "authenticated",
            page: 1,
            limit: 50,
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

  function getAvailableAccounts(platform: LeadPlatformStyle) {
    return platformAccounts.filter(
      (item) => item.platform === platform && item.status === "valid" && item.loginStatus === "authenticated",
    );
  }

  function togglePlatform(platform: LeadPlatformStyle) {
    const option = publishPlatformOptions.find((item) => item.key === platform);
    if (!option?.enabled) return;

    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        setSelectedAccounts((accounts) => {
          const next = { ...accounts };
          delete next[platform];
          return next;
        });
        return current.filter((item) => item !== platform);
      }

      const firstAccount = getAvailableAccounts(platform)[0];
      if (firstAccount) {
        setSelectedAccounts((accounts) => ({
          ...accounts,
          [platform]: firstAccount.id,
        }));
      }
      return [...current, platform];
    });
  }

  function openPublishModal(contentId: string) {
    setPublishTarget(contentId);
    setSelectedPlatforms(defaultPublishPlatforms);
    setSelectedAccounts(() => {
      const next: Partial<Record<LeadPlatformStyle, string>> = {};
      for (const platform of defaultPublishPlatforms) {
        const firstAccount = getAvailableAccounts(platform)[0];
        if (firstAccount) {
          next[platform] = firstAccount.id;
        }
      }
      return next;
    });
  }

  function handleAccountChange(platform: LeadPlatformStyle, accountId: string) {
    setSelectedAccounts((current) => ({
      ...current,
      [platform]: accountId,
    }));
  }

  const canSubmitPublish =
    selectedPlatforms.length > 0 &&
    selectedPlatforms.every((platform) => Boolean(selectedAccounts[platform]));

  async function confirmPublish() {
    if (!publishTarget || selectedPlatforms.length === 0 || !accessToken) return;

    const targets = selectedPlatforms.map((platform) => ({
      platform,
      platformAccountId: selectedAccounts[platform] ?? "",
    }));

    if (targets.some((item) => !item.platformAccountId)) {
      setHint("请先为每个平台选择发布账号");
      return;
    }

    try {
      setPublishing(true);
      const result = await publishLeadContent({
        accessToken,
        contentId: publishTarget,
        targets,
      });
      setPublishJobs((prev) => mergeJobsById(prev, result.jobs));
      setPublishTarget(null);
      setHint("已创建发布任务，后台正在异步执行，可在下方发布记录里查看实时状态。");
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
          内容池展示已同步入池的正式素材。当前前端一键发布已开放小红书、抖音、视频号、快手，点击后会打开可见浏览器并自动执行发布流程。
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
                </tr>
              </thead>
              <tbody>
                {jobList.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="py-10 text-center text-zinc-400">
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
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPublishTarget(null)}>
              取消
            </Button>
            <Button onClick={() => void confirmPublish()} disabled={!canSubmitPublish || publishing}>
              {publishing ? "发布中..." : "一键发布"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-sm font-medium text-zinc-100">{publishContent?.title ?? "未选择素材"}</div>
            <div className="mt-1 text-xs text-zinc-400">
              当前支持小红书、抖音、视频号、快手自动发布。点击后会打开可见浏览器并自动上传、填写并执行发布。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {publishPlatformOptions.map((option) => {
              const checked = selectedPlatforms.includes(option.key);
              const accounts = getAvailableAccounts(option.key);
              const disabled = !option.enabled;

              return (
                <div
                  key={option.key}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
                    disabled
                      ? "border-white/10 bg-white/5 text-zinc-500"
                      : checked
                        ? "border-orange-500/70 bg-orange-500/10 text-zinc-50"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:border-orange-500/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 accent-orange-500"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => togglePlatform(option.key)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{option.label}</div>
                    {disabled ? (
                      <div className="mt-2 text-xs text-zinc-500">待接通</div>
                    ) : checked ? (
                      <div className="mt-2">
                        <Select
                          value={selectedAccounts[option.key] ?? ""}
                          onChange={(e) => handleAccountChange(option.key, e.target.value)}
                        >
                          <option value="">请选择发布账号</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {(account.displayName || account.accountName) + ` (${account.accountName})`}
                            </option>
                          ))}
                        </Select>
                        {accounts.length === 0 ? (
                          <div className="mt-2 text-xs text-amber-300">
                            该平台暂无可用账号，请先到平台登录页面完成账号登录。
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
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

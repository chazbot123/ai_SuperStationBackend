import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  createMySuperSiteIndustryItem,
  deleteMySuperSiteIndustryItem,
  getMySuperSiteSettings,
  listMySuperSiteIndustryItems,
  syncMySuperSiteIndustryItems,
  updateMySuperSiteIndustryItem,
  updateMySuperSiteSettings,
} from "@/lib/superSiteSettings";
import { useAppStore, type IndustryItem, type IndustrySourceConfig } from "@/store/appStore";

type IndustryItemDraft = {
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string;
  enabled: boolean;
  isPinned: boolean;
};

const PAGE_LIMIT = 10;

function toKeywordsText(keywords: string[]) {
  return keywords.join("、");
}

function splitKeywords(text: string) {
  return text
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDraftMap(items: IndustryItem[]) {
  return items.reduce<Record<string, IndustryItemDraft>>((acc, item) => {
    acc[item.id] = {
      title: item.title,
      summary: item.summary,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt ? item.publishedAt.slice(0, 10) : "",
      enabled: item.enabled,
      isPinned: item.isPinned,
    };
    return acc;
  }, {});
}

export default function SuperSiteIndustrySection() {
  const settings = useAppStore((s) => s.settings);
  const replaceSettings = useAppStore((s) => s.replaceSettings);
  const [sourceConfigs, setSourceConfigs] = useState<IndustrySourceConfig[]>(settings.industrySourceConfigs);
  const [keywordsText, setKeywordsText] = useState(toKeywordsText(settings.industryKeywords));
  const [dailyTime, setDailyTime] = useState(settings.industryRefreshConfig.dailyTime);
  const [refreshEnabled, setRefreshEnabled] = useState(settings.industryRefreshConfig.enabled);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configHint, setConfigHint] = useState<string | null>(null);
  const [items, setItems] = useState<IndustryItem[]>([]);
  const [itemDrafts, setItemDrafts] = useState<Record<string, IndustryItemDraft>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [listPagination, setListPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0 });
  const [sourceKeyFilter, setSourceKeyFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [createForm, setCreateForm] = useState({
    title: "",
    summary: "",
    sourceUrl: "",
    publishedAt: "",
  });

  useEffect(() => {
    setSourceConfigs(settings.industrySourceConfigs);
    setKeywordsText(toKeywordsText(settings.industryKeywords));
    setDailyTime(settings.industryRefreshConfig.dailyTime);
    setRefreshEnabled(settings.industryRefreshConfig.enabled);
  }, [settings.industryKeywords, settings.industryRefreshConfig.dailyTime, settings.industryRefreshConfig.enabled, settings.industrySourceConfigs]);

  const totalPages = Math.max(1, Math.ceil((listPagination.total || 0) / listPagination.limit));
  const detailItem = detailItemId ? items.find((item) => item.id === detailItemId) ?? null : null;

  function getSourceLabel(sourceKey: string) {
    return sourceConfigs.find((item) => item.key === sourceKey)?.label ?? sourceKey;
  }

  async function loadItems(page = listPage) {
    setListLoading(true);
    try {
      const result = await listMySuperSiteIndustryItems({
        page,
        limit: PAGE_LIMIT,
        sourceKey: sourceKeyFilter || undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
      });
      setItems(result.items);
      setItemDrafts(toDraftMap(result.items));
      setListPagination(result.pagination);
      setListPage(result.pagination.page);
      setListError(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "加载行业信息失败");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadItems(listPage);
  }, [listPage, sourceKeyFilter, startDateFilter, endDateFilter]);

  const sortedSourceConfigs = useMemo(
    () => [...sourceConfigs].sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [sourceConfigs]
  );

  async function handleSaveConfig() {
    setSavingConfig(true);
    setConfigHint(null);
    try {
      const payload = await updateMySuperSiteSettings({
        industrySourceConfigs: sourceConfigs,
        industryKeywords: splitKeywords(keywordsText),
        industryRefreshConfig: {
          enabled: refreshEnabled,
          frequency: "daily",
          dailyTime,
        },
      });
      replaceSettings(payload);
      setConfigHint("行业抓取配置已保存");
    } catch (error) {
      setConfigHint(error instanceof Error ? error.message : "保存行业抓取配置失败");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setConfigHint(null);
    try {
      const result = await syncMySuperSiteIndustryItems();
      await loadItems();
      const latestSettings = await getMySuperSiteSettings();
      replaceSettings(latestSettings);
      const errorsText =
        result.errors && result.errors.length > 0
          ? `，失败来源：${result.errors.join("；")}`
          : "";
      setConfigHint(
        `本次抓取 ${result.totalFetched ?? 0} 条，新增 ${result.createdCount ?? 0} 条，更新 ${result.updatedCount ?? 0} 条${errorsText}`
      );
    } catch (error) {
      setConfigHint(error instanceof Error ? error.message : "触发抓取失败");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateItem() {
    if (!createForm.title.trim()) {
      setConfigHint("请先填写标题");
      return;
    }

    try {
      await createMySuperSiteIndustryItem({
        title: createForm.title.trim(),
        summary: createForm.summary.trim(),
        sourceUrl: createForm.sourceUrl.trim() || undefined,
        publishedAt: createForm.publishedAt || undefined,
        enabled: true,
        isPinned: false,
      });
      setCreateForm({
        title: "",
        summary: "",
        sourceUrl: "",
        publishedAt: "",
      });
      setListPage(1);
      await loadItems(1);
      setConfigHint("已新增手工行业信息");
    } catch (error) {
      setConfigHint(error instanceof Error ? error.message : "新增行业信息失败");
    }
  }

  async function handleSaveItem(itemId: string) {
    const draft = itemDrafts[itemId];
    if (!draft) return;

    setSavingItemId(itemId);
    try {
      await updateMySuperSiteIndustryItem(itemId, {
        title: draft.title,
        summary: draft.summary,
        sourceUrl: draft.sourceUrl || undefined,
        publishedAt: draft.publishedAt || undefined,
        enabled: draft.enabled,
        isPinned: draft.isPinned,
      });
      await loadItems();
      setConfigHint("行业信息已保存");
    } catch (error) {
      setConfigHint(error instanceof Error ? error.message : "保存行业信息失败");
    } finally {
      setSavingItemId((current) => (current === itemId ? null : current));
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await deleteMySuperSiteIndustryItem(itemId);
      const nextTotal = Math.max(0, listPagination.total - 1);
      const nextPage = Math.min(listPage, Math.max(1, Math.ceil(nextTotal / PAGE_LIMIT)));
      setDetailItemId((current) => (current === itemId ? null : current));
      if (nextPage !== listPage) {
        setListPage(nextPage);
      } else {
        await loadItems(nextPage);
      }
      setConfigHint("行业信息已删除");
    } catch (error) {
      setConfigHint(error instanceof Error ? error.message : "删除行业信息失败");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-5">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>行业信息抓取</CardTitle>
            <Badge variant="blue">已接入真实配置</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {configHint ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{configHint}</div>
          ) : null}

          <div>
            <div className="mb-2 text-xs font-medium text-zinc-300">抓取来源站点</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {sortedSourceConfigs.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
                >
                  <div className="mb-2 min-w-0 truncate text-sm text-zinc-100">{item.label}</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    <span>启用</span>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) =>
                        setSourceConfigs((prev) =>
                          prev.map((current) =>
                            current.key === item.key ? { ...current, enabled: event.target.checked } : current
                          )
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-medium text-zinc-300">行业关键词</span>
            <Input value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} placeholder="AI建站、智能营销、数字化招商" />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-300">每日抓取时间</span>
              <Input value={dailyTime} onChange={(event) => setDailyTime(event.target.value)} placeholder="09:00" />
            </label>
            <label className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={refreshEnabled} onChange={(event) => setRefreshEnabled(event.target.checked)} />
              自动抓取启用
            </label>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-300">
            <div>最近同步状态：{settings.industryLastSyncStatus || "未执行"}</div>
            <div>最近同步时间：{settings.industryLastSyncAt ? new Date(settings.industryLastSyncAt).toLocaleString() : "暂无"}</div>
            <div>最近错误：{settings.industryLastSyncError || "无"}</div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void handleSaveConfig()} disabled={savingConfig}>
              {savingConfig ? "保存中..." : "保存配置"}
            </Button>
            <Button variant="secondary" onClick={() => void handleSyncNow()} disabled={syncing}>
              {syncing ? "抓取中..." : "立即抓取"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="xl:col-span-7 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>手工行业信息</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="标题" />
            <Input value={createForm.publishedAt} onChange={(event) => setCreateForm((prev) => ({ ...prev, publishedAt: event.target.value }))} placeholder="发布时间，如 2026-05-02" />
            <Input value={createForm.sourceUrl} onChange={(event) => setCreateForm((prev) => ({ ...prev, sourceUrl: event.target.value }))} placeholder="来源链接" />
            <div className="md:col-span-2">
              <Input value={createForm.summary} onChange={(event) => setCreateForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="摘要" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => void handleCreateItem()}>新增手工信息</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>行业信息列表</CardTitle>
              <Badge variant="gray">{listPagination.total} 条</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {listLoading ? <div className="text-sm text-zinc-300">正在加载行业信息...</div> : null}
            {listError ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{listError}</div> : null}

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">来源</span>
                <Select value={sourceKeyFilter} onChange={(event) => {
                  setSourceKeyFilter(event.target.value);
                  setListPage(1);
                }}>
                  <option value="">全部来源</option>
                  {sortedSourceConfigs.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">开始日期</span>
                <Input
                  type="date"
                  value={startDateFilter}
                  onChange={(event) => {
                    setStartDateFilter(event.target.value);
                    setListPage(1);
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">结束日期</span>
                <Input
                  type="date"
                  value={endDateFilter}
                  onChange={(event) => {
                    setEndDateFilter(event.target.value);
                    setListPage(1);
                  }}
                />
              </label>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setSourceKeyFilter("");
                    setStartDateFilter("");
                    setEndDateFilter("");
                    setListPage(1);
                  }}
                  disabled={!sourceKeyFilter && !startDateFilter && !endDateFilter}
                >
                  清空筛选
                </Button>
              </div>
            </div>

            {!listLoading && items.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-400">当前还没有行业信息数据。</div>
            ) : null}

            {items.map((item) => {
              const draft = itemDrafts[item.id] ?? {
                title: item.title,
                summary: item.summary,
                sourceUrl: item.sourceUrl,
                publishedAt: item.publishedAt ? item.publishedAt.slice(0, 10) : "",
                enabled: item.enabled,
                isPinned: item.isPinned,
              };

              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="truncate text-sm text-zinc-100">{item.title}</div>
                        {draft.isPinned ? <Badge variant="amber">置顶</Badge> : null}
                        {!draft.enabled ? <Badge variant="gray">已停用</Badge> : null}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{getSourceLabel(item.sourceKey)}</span>
                        <span>·</span>
                        <span>{draft.publishedAt || "暂无发布时间"}</span>
                        {item.sourceType === "manual" ? (
                          <>
                            <span>·</span>
                            <Badge variant="amber">手工</Badge>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setDetailItemId(item.id)}>
                        详情
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!listLoading && listPagination.total > 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-xs text-zinc-400">
                  第 {listPagination.page} / {totalPages} 页，共 {listPagination.total} 条
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={listPage <= 1} onClick={() => setListPage((page) => Math.max(1, page - 1))}>
                    上一页
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={listPage >= totalPages}
                    onClick={() => setListPage((page) => Math.min(totalPages, page + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={!!detailItem && !!detailItemId}
        title="行业信息详情"
        onClose={() => setDetailItemId(null)}
        panelClassName="max-w-2xl"
        footer={
          detailItem ? (
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => setDetailItemId(null)}>
                关闭
              </Button>
              <Button size="sm" onClick={() => void handleSaveItem(detailItem.id)} disabled={savingItemId === detailItem.id}>
                {savingItemId === detailItem.id ? "保存中..." : "保存"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void handleDeleteItem(detailItem.id)}>
                删除
              </Button>
            </div>
          ) : null
        }
      >
        {detailItem ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={detailItem.sourceType === "manual" ? "amber" : "blue"}>
                {detailItem.sourceType === "manual" ? "手工" : "抓取"}
              </Badge>
              <span className="text-xs text-zinc-400">{getSourceLabel(detailItem.sourceKey)}</span>
              <span className="text-xs text-zinc-500">{detailItem.sourceKey}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">标题</span>
                <Input
                  value={itemDrafts[detailItem.id]?.title ?? detailItem.title}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        title: event.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">发布时间</span>
                <Input
                  value={itemDrafts[detailItem.id]?.publishedAt ?? (detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "")}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        publishedAt: event.target.value,
                      },
                    }))
                  }
                  placeholder="发布时间"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">来源链接</span>
                <Input
                  value={itemDrafts[detailItem.id]?.sourceUrl ?? detailItem.sourceUrl}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        sourceUrl: event.target.value,
                      },
                    }))
                  }
                  placeholder="来源链接"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">摘要</span>
                <Input
                  value={itemDrafts[detailItem.id]?.summary ?? detailItem.summary}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        summary: event.target.value,
                      },
                    }))
                  }
                  placeholder="摘要"
                />
              </label>
            </div>

            <div className="flex gap-4 text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemDrafts[detailItem.id]?.enabled ?? detailItem.enabled}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        enabled: event.target.checked,
                      },
                    }))
                  }
                />
                启用
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemDrafts[detailItem.id]?.isPinned ?? detailItem.isPinned}
                  onChange={(event) =>
                    setItemDrafts((prev) => ({
                      ...prev,
                      [detailItem.id]: {
                        ...(prev[detailItem.id] ?? {
                          title: detailItem.title,
                          summary: detailItem.summary,
                          sourceUrl: detailItem.sourceUrl,
                          publishedAt: detailItem.publishedAt ? detailItem.publishedAt.slice(0, 10) : "",
                          enabled: detailItem.enabled,
                          isPinned: detailItem.isPinned,
                        }),
                        isPinned: event.target.checked,
                      },
                    }))
                  }
                />
                置顶
              </label>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

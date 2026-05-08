import { useEffect, useState } from "react";
import { updateMySuperSiteSettings } from "@/lib/superSiteSettings";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SiteMetricsPreview from "@/components/super-site/SiteMetricsPreview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useAppStore, type SiteMetricItem } from "@/store/appStore";

function previewMetricValue(item: {
  key: "visits" | "consultations" | "signing_rate" | "purchases";
  valueMode: "dynamic" | "fixed";
  startValue: string;
  incrementMin: string;
  incrementMax: string;
  fixedValue: string;
}) {
  if (item.valueMode === "fixed") {
    if (item.key === "signing_rate") {
      return item.fixedValue?.includes("%") ? item.fixedValue : `${item.fixedValue || "0"}%`;
    }
    return item.fixedValue || "0";
  }

  const base = Number(item.startValue || 0);
  const next = Number(item.incrementMax || item.incrementMin || 0);
  return String(base + next);
}

export default function SuperSiteMetricsSection() {
  const metrics = useAppStore((s) => s.settings.siteMetrics);
  const setSiteMetricEnabled = useAppStore((s) => s.setSiteMetricEnabled);
  const updateSiteMetric = useAppStore((s) => s.updateSiteMetric);
  const [drafts, setDrafts] = useState<Record<string, SiteMetricItem>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, SiteMetricItem> = {};
      for (const metric of metrics) {
        next[metric.key] = prev[metric.key] ?? { ...metric };
      }
      return next;
    });
  }, [metrics]);

  function updateDraft(key: SiteMetricItem["key"], patch: Partial<SiteMetricItem>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? metrics.find((item) => item.key === key)!),
        ...patch,
      },
    }));
  }

  async function handleSave(key: SiteMetricItem["key"]) {
    const draft = drafts[key];
    if (!draft) return;

    const nextMetrics = metrics.map((item) =>
      item.key === key
        ? {
            ...item,
            enabled: draft.enabled,
            valueMode: draft.valueMode,
            startValue: draft.startValue,
            tickInterval: draft.tickInterval,
            incrementMin: draft.incrementMin,
            incrementMax: draft.incrementMax,
            fixedValue: draft.fixedValue,
          }
        : item
    );

    setSavingKey(key);
    setErrorMessage(null);

    try {
      await updateMySuperSiteSettings({
        siteMetrics: nextMetrics,
      });

      setSiteMetricEnabled(key, draft.enabled);
      updateSiteMetric(key, {
        valueMode: draft.valueMode,
        startValue: draft.startValue,
        tickInterval: draft.tickInterval,
        incrementMin: draft.incrementMin,
        incrementMax: draft.incrementMax,
        fixedValue: draft.fixedValue,
      });
      setSavedKey(key);
      window.setTimeout(() => {
        setSavedKey((current) => (current === key ? null : current));
      }, 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存运营指标失败");
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>运营指标配置</CardTitle>
            <Badge variant="blue">已接入超级站配置</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {errorMessage ? (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
          {metrics.map((item) => {
            const draft = drafts[item.key] ?? item;
            return (
            <div key={item.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{item.label}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={draft.enabled ? "green" : "gray"}>{draft.enabled ? "已启用" : "已停用"}</Badge>
                  <Badge variant={draft.valueMode === "dynamic" ? "blue" : "gray"}>
                    {draft.valueMode === "dynamic" ? "动态值" : "固定值"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-300">是否展示</span>
                  <Select
                    value={draft.enabled ? "enabled" : "disabled"}
                    onChange={(e) => updateDraft(item.key, { enabled: e.target.value === "enabled" })}
                  >
                    <option value="enabled">显示</option>
                    <option value="disabled">隐藏</option>
                  </Select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-300">数值模式</span>
                  <Select
                    value={draft.valueMode}
                    onChange={(e) =>
                      updateDraft(item.key, {
                        valueMode: e.target.value as "dynamic" | "fixed",
                      })
                    }
                  >
                    <option value="dynamic">动态值</option>
                    <option value="fixed">固定值</option>
                  </Select>
                </label>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                {draft.valueMode === "dynamic" ? (
                  <>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-zinc-300">起始值</span>
                      <Input
                        value={draft.startValue}
                        onChange={(e) => updateDraft(item.key, { startValue: e.target.value })}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-zinc-300">跳动间隔（秒）</span>
                      <Input
                        value={draft.tickInterval}
                        onChange={(e) => updateDraft(item.key, { tickInterval: e.target.value })}
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2 xl:col-span-2">
                      <span className="text-xs font-medium text-zinc-300">增量区间</span>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft.incrementMin}
                          onChange={(e) => updateDraft(item.key, { incrementMin: e.target.value })}
                          placeholder="最小"
                        />
                        <span className="text-xs text-zinc-500">至</span>
                        <Input
                          value={draft.incrementMax}
                          onChange={(e) => updateDraft(item.key, { incrementMax: e.target.value })}
                          placeholder="最大"
                        />
                      </div>
                    </label>
                  </>
                ) : null}

                {draft.valueMode === "fixed" ? (
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-zinc-300">固定值</span>
                    <Input
                      value={draft.fixedValue}
                      onChange={(e) => updateDraft(item.key, { fixedValue: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-400">
                  {draft.valueMode === "dynamic" ? (
                    <>
                      规则预览：当前值从 <span className="text-zinc-200">{draft.startValue || "0"}</span> 开始，单次增加{" "}
                      <span className="text-zinc-200">
                        {draft.incrementMin || "0"} - {draft.incrementMax || draft.incrementMin || "0"}
                      </span>
                    </>
                  ) : (
                    <>
                      固定显示值：<span className="text-zinc-200">{previewMetricValue(draft)}</span>
                    </>
                  )}
                </div>
                <Button size="sm" onClick={() => handleSave(item.key)}>
                  {savingKey === item.key ? "保存中..." : savedKey === item.key ? "已保存" : "保存"}
                </Button>
              </div>
            </div>
          )})}
        </CardContent>
      </Card>

      <Card className="xl:col-span-4">
        <CardHeader>
          <CardTitle>超级站指标预览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs leading-5 text-zinc-400">
            动态值只保存涨幅规则，右侧预览按前台展示逻辑实时跳动，不由后端持续回写结果。
          </div>
          <SiteMetricsPreview metrics={metrics} />
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import type { SiteMetricItem } from "@/store/appStore";

type SiteMetricsPreviewProps = {
  metrics: SiteMetricItem[];
  emptyText?: string;
  className?: string;
};

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getInitialMetricValue(metric: SiteMetricItem) {
  if (metric.valueMode === "fixed") {
    return toNumber(metric.fixedValue);
  }

  return toNumber(metric.startValue);
}

function getMetricIntervalMs(metric: SiteMetricItem) {
  return Math.max(toNumber(metric.tickInterval, 1), 1) * 1000;
}

function getMetricIncrement(metric: SiteMetricItem) {
  const min = Math.max(0, toNumber(metric.incrementMin));
  const max = Math.max(min, toNumber(metric.incrementMax, min));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatMetricValue(metric: SiteMetricItem, value: number) {
  if (metric.key === "signing_rate") {
    return `${value}%`;
  }

  return String(value);
}

function getMetricRuleText(metric: SiteMetricItem) {
  if (metric.valueMode === "fixed") {
    return `固定展示 ${formatMetricValue(metric, getInitialMetricValue(metric))}`;
  }

  return `每 ${metric.tickInterval || "1"} 秒增加 ${metric.incrementMin || "0"} - ${metric.incrementMax || metric.incrementMin || "0"}`;
}

export default function SiteMetricsPreview(props: SiteMetricsPreviewProps) {
  const enabledMetrics = useMemo(
    () => props.metrics.filter((item) => item.enabled),
    [props.metrics]
  );
  const dynamicMetrics = useMemo(
    () => enabledMetrics.filter((item) => item.valueMode === "dynamic"),
    [enabledMetrics]
  );
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(enabledMetrics.map((item) => [item.key, getInitialMetricValue(item)]))
  );

  useEffect(() => {
    setValues(Object.fromEntries(enabledMetrics.map((item) => [item.key, getInitialMetricValue(item)])));
  }, [enabledMetrics]);

  useEffect(() => {
    if (dynamicMetrics.length === 0) return;

    const timers = dynamicMetrics.map((metric) =>
      window.setInterval(() => {
        setValues((current) => ({
          ...current,
          [metric.key]: (current[metric.key] ?? getInitialMetricValue(metric)) + getMetricIncrement(metric),
        }));
      }, getMetricIntervalMs(metric))
    );

    return () => {
      timers.forEach((timer) => window.clearInterval(timer));
    };
  }, [dynamicMetrics]);

  if (enabledMetrics.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-400">
        {props.emptyText || "当前没有启用的运营指标"}
      </div>
    );
  }

  return (
    <div className={props.className ?? "space-y-3"}>
      {enabledMetrics.map((item) => (
        <div key={item.key} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-300">{item.label}</div>
            <Badge variant={item.valueMode === "dynamic" ? "blue" : "gray"}>
              {item.valueMode === "dynamic" ? "动态" : "固定"}
            </Badge>
          </div>
          <div className="mt-3 text-2xl font-semibold text-zinc-50">
            {formatMetricValue(item, values[item.key] ?? getInitialMetricValue(item))}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">{getMetricRuleText(item)}</div>
        </div>
      ))}
    </div>
  );
}

import type { VideoDraftItem } from "@/store/videoDraftStore";

export function formatMmSs(ms: number) {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatClock(tsMs: number) {
  const d = new Date(tsMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function fallbackProductTotalMs(item: VideoDraftItem) {
  const model = (item.model ?? "").toLowerCase();
  if (model.includes("viduq1")) return 45_000;
  if (model.includes("viduq2")) return 65_000;
  if (model.includes("viduq3")) return 95_000;
  if (model.includes("vidu2.0")) return 55_000;
  return 70_000;
}

export function estimateProductEta(input: {
  items: VideoDraftItem[];
  item: VideoDraftItem;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const createdAtMs = new Date(input.item.createdAt).getTime();
  const elapsedMs = Number.isFinite(createdAtMs) ? Math.max(0, nowMs - createdAtMs) : 0;

  const provider = (input.item.provider ?? "").trim();
  const model = (input.item.model ?? "").trim();

  const history = input.items
    .filter((x) => x.source === "product_video" && x.status === "ready" && x.completedAt && x.provider && x.model)
    .filter((x) => x.provider === provider && x.model === model)
    .slice()
    .sort((a, b) => new Date(b.completedAt as string).getTime() - new Date(a.completedAt as string).getTime())
    .slice(0, 10);

  const durations = history
    .map((x) => {
      const start = new Date(x.createdAt).getTime();
      const end = new Date(x.completedAt as string).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return Math.max(0, end - start);
    })
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);

  const totalMs = median(durations) ?? fallbackProductTotalMs(input.item);
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const etaAtMs = nowMs + remainingMs;

  return {
    elapsedMs,
    remainingMs,
    etaAtMs,
    basis: durations.length ? "history" : "fallback",
  } as const;
}

export function estimateAvatarEta(input: {
  createdAt: string;
  segmentCount: number;
  finishedCount: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const createdAtMs = new Date(input.createdAt).getTime();
  const elapsedMs = Number.isFinite(createdAtMs) ? Math.max(0, nowMs - createdAtMs) : 0;

  const total = Math.max(0, Math.floor(input.segmentCount || 0));
  const done = Math.max(0, Math.floor(input.finishedCount || 0));
  const remainingSegments = Math.max(0, total - done);

  if (total === 0) {
    return { elapsedMs, remainingMs: null, etaAtMs: null, basis: "unknown" } as const;
  }

  if (done <= 0) {
    const perSegmentMs = 40_000;
    const remainingMs = remainingSegments * perSegmentMs;
    return { elapsedMs, remainingMs, etaAtMs: nowMs + remainingMs, basis: "fallback" } as const;
  }

  const perSegmentMs = Math.max(10_000, Math.round(elapsedMs / done));
  const remainingMs = remainingSegments * perSegmentMs;
  return { elapsedMs, remainingMs, etaAtMs: nowMs + remainingMs, basis: "rate" } as const;
}


import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Drawer from "@/components/ui/Drawer";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";

type AssetType = "image" | "doc" | "other";
type Asset = {
  id: string;
  type: AssetType;
  name: string;
  tags: string[];
  createdAt: string;
  sizeText: string;
};

const seed: Asset[] = [
  {
    id: "asset_1",
    type: "image",
    name: "xhs_cover_01.png",
    tags: ["小红书", "封面"],
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    sizeText: "1.2MB",
  },
  {
    id: "asset_2",
    type: "doc",
    name: "product_faq_v1.pdf",
    tags: ["FAQ", "产品"],
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    sizeText: "320KB",
  },
];

function typeBadge(t: AssetType) {
  if (t === "image") return <Badge variant="blue">图片</Badge>;
  if (t === "doc") return <Badge variant="green">文档</Badge>;
  return <Badge variant="gray">其他</Badge>;
}

export default function Assets() {
  usePageMeta("数字仓库");
  const purchases = useAppStore((s) => s.purchases);
  const metrics = useAppStore((s) => s.metrics);
  const contents = useAppStore((s) => s.contents);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | AssetType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"today" | "week" | "month">("today");
  const [view, setView] = useState<"dashboard" | "assets">("dashboard");

  const generatedAssets: Asset[] = useMemo(() => {
    const list: Asset[] = [];
    contents.forEach((c) => {
      c.images.forEach((url, idx) => {
        list.push({
          id: `${c.id}_img_${idx}`,
          type: "image",
          name: `${c.title}_img_${idx + 1}.png`,
          tags: ["生成内容", c.type === "copy" ? "图文" : "视频", c.platformStyle],
          createdAt: c.createdAt,
          sizeText: "—",
        });
      });
      if (c.type === "video") {
        list.push({
          id: `${c.id}_video`,
          type: "other",
          name: `${c.title}.mp4`,
          tags: ["生成内容", "视频", c.platformStyle],
          createdAt: c.createdAt,
          sizeText: "—",
        });
      }
    });
    return [...list, ...seed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [contents]);

  const selected = generatedAssets.find((a) => a.id === selectedId) ?? null;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return generatedAssets
      .filter((a) => (type === "all" ? true : a.type === type))
      .filter((a) => (s ? a.name.toLowerCase().includes(s) || a.tags.join(" ").toLowerCase().includes(s) : true));
  }, [generatedAssets, q, type]);

  const metric = useMemo(() => {
    if (metrics.length === 0) return null;
    const sorted = [...metrics].sort((a, b) => (a.time < b.time ? 1 : -1));
    if (scope === "today") return sorted[0];
    if (scope === "week") return sorted[Math.min(1, sorted.length - 1)];
    return sorted[Math.min(2, sorted.length - 1)];
  }, [metrics, scope]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>数据看板</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Select
                value={view}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "dashboard" || v === "assets") setView(v);
                }}
              >
                <option value="dashboard">看板</option>
                <option value="assets">素材/归档</option>
              </Select>
              <Select
                value={scope}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "today" || v === "week" || v === "month") setScope(v);
                }}
              >
                <option value="today">今日</option>
                <option value="week">本周</option>
                <option value="month">本月</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className="mb-2 text-xs font-medium text-zinc-300">购买记录（用于网站顶部滚动）</div>
              <div className="h-40 overflow-hidden rounded-md border border-white/10 bg-white/5">
                <div className="divide-y divide-white/10">
                  {purchases.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="text-zinc-200">{p.buyerLabel} 购买 {p.productName}</div>
                      <div className="text-zinc-400">{p.amountText}</div>
                    </div>
                  ))}
                  {purchases.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-zinc-400">暂无记录</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="md:col-span-8">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-zinc-400">入驻产品数量</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{metric?.productsCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-zinc-400">浏览人数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{metric?.viewsCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-zinc-400">点击次数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{metric?.clicksCount ?? 0}</div>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
                数据来源（Demo）：基于用户在 AI 网站填写/访问/点击的埋点汇总；后续对接真实埋点与订单系统。
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {view === "dashboard" ? null : (
        <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>素材/归档</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索文件名/标签" />
              <Select
                value={type}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "all" || v === "image" || v === "doc" || v === "other") setType(v);
                }}
              >
                <option value="all">全部类型</option>
                <option value="image">图片</option>
                <option value="doc">文档</option>
                <option value="other">其他</option>
              </Select>
              <Button variant="secondary">上传（占位）</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.length === 0 ? (
              <div className="md:col-span-2 rounded-md border border-white/10 bg-white/5 px-3 py-8 text-center text-sm text-zinc-400">
                暂无素材
              </div>
            ) : (
              list.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{a.name}</div>
                      <div className="mt-1 text-xs text-zinc-400">{a.sizeText} · {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="shrink-0">{typeBadge(a.type)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.tags.map((t) => (
                      <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Drawer
        open={!!selected}
        title={selected ? "素材详情" : "素材详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary">复制链接（占位）</Button>
              <Button>引用到内容（占位）</Button>
            </div>
          ) : null
        }
      >
        {!selected ? null : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">文件名</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.name}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">类型</div>
                <div className="flex h-10 items-center">{typeBadge(selected.type)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">大小</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.sizeText}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">创建时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">标签</div>
              <div className="flex flex-wrap gap-2">
                {selected.tags.map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              预览与权限控制（占位）：租户/角色可见范围、下载/引用审计。
              <div className="mt-2">
                <Button variant="secondary" size="sm">以图搜图（占位）</Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
        </>
      )}
    </div>
  );
}

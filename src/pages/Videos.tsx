import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import Badge from "@/components/ui/Badge";
import { usePageMeta } from "@/hooks/usePageMeta";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { useAppStore } from "@/store/appStore";

type VideoStatus = "ready" | "processing";
type VideoItem = {
  id: string;
  title: string;
  durationText: string;
  status: VideoStatus;
  createdAt: string;
};

const seed: VideoItem[] = [
  {
    id: "v_1",
    title: "数字人口播：产品A介绍（中文）",
    durationText: "00:30",
    status: "ready",
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
  {
    id: "v_2",
    title: "短视频脚本生成：产品B（草稿）",
    durationText: "00:30",
    status: "processing",
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
];

function badge(status: VideoStatus) {
  if (status === "ready") return <Badge variant="green">可用</Badge>;
  return <Badge variant="amber">处理中</Badge>;
}

export default function Videos() {
  usePageMeta("视频生成");
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = seed.find((v) => v.id === selectedId) ?? null;
  const [openAvatar, setOpenAvatar] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "json">("text");
  const [script, setScript] = useState("");
  const [scriptJson, setScriptJson] = useState('{"topic":"产品介绍","sellingPoints":["更快","更省"],"audience":"泛用户","keywords":["产品A","功能X"]}');
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<"male" | "female" | "cartoon">("male");
  const [durationSec, setDurationSec] = useState<15 | 30 | 45 | 60>(30);
  const [style, setStyle] = useState<"tech" | "warm" | "pro">("tech");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return seed.filter((v) => (s ? v.title.toLowerCase().includes(s) : true));
  }, [q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>视频列表</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题" />
              <Button variant="secondary">上传视频（占位）</Button>
              <Button onClick={() => setOpenAvatar(true)}>数字人生成（占位）</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.length === 0 ? (
              <div className="md:col-span-2 rounded-md border border-white/10 bg-white/5 px-3 py-8 text-center text-sm text-zinc-400">
                暂无视频
              </div>
            ) : (
              list.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className="rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{v.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">{v.durationText} · {new Date(v.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="shrink-0">{badge(v.status)}</div>
                  </div>
                  <div className="mt-3 h-24 rounded-md border border-white/10 bg-white/5" />
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Drawer
        open={!!selected}
        title={selected ? "视频详情" : "视频详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary">复制引用（占位）</Button>
              <Button>关联到内容（占位）</Button>
            </div>
          ) : null
        }
        widthClassName="max-w-2xl"
      >
        {!selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">标题</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.title}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                <div className="flex h-10 items-center">{badge(selected.status)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">时长</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.durationText}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">创建时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              Demo占位：转码/封面/字幕/多语言/数字人生成等能力将通过后端任务与第三方API集成。
            </div>
          </div>
        )}
      </Drawer>
      <Modal
        open={openAvatar}
        title="数字人讲解（占位）"
        onClose={() => {
          setOpenAvatar(false);
          setJsonErr(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenAvatar(false)}>取消</Button>
            <Button
              onClick={() => {
                let finalScript = script.trim();
                if (inputMode === "json") {
                  try {
                    const raw = JSON.parse(scriptJson) as unknown;
                    const v = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
                    const topic = String(v.topic ?? "产品介绍");
                    const audience = String(v.audience ?? "泛用户");
                    const points = Array.isArray(v.sellingPoints)
                      ? (v.sellingPoints as unknown[]).map((x) => String(x)).filter(Boolean)
                      : [];
                    const keywords = Array.isArray(v.keywords) ? (v.keywords as unknown[]).map((x) => String(x)).filter(Boolean) : [];
                    finalScript = [
                      `主题：${topic}`,
                      `受众：${audience}`,
                      points.length ? `卖点：${points.join(" / ")}` : "",
                      keywords.length ? `关键词：${keywords.join(" / ")}` : "",
                      "",
                      "旁白（Demo）：",
                      "欢迎了解本产品的核心亮点，我们将用 30 秒带你快速上手。",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    setJsonErr(null);
                  } catch {
                    setJsonErr("JSON格式不合法，请检查括号与引号。");
                    return;
                  }
                }
                const title = `数字人口播（${avatar === "male" ? "男" : avatar === "female" ? "女" : "卡通"}形象）`;
                const item = addContent({
                  type: "video",
                  title: `${title} · ${durationSec}s`,
                  body: `输出：MP4（Demo）\n时长：${durationSec}s\n风格：${style}\n\n${finalScript || "脚本/分镜/旁白占位"}`,
                  platformStyle: "douyin",
                  images: [],
                  videoUrl: "https://example.com/demo-video.mp4",
                });
                markContentSynced(item.id);
                setOpenAvatar(false);
                setScript("");
                setScriptJson('{"topic":"产品介绍","sellingPoints":["更快","更省"],"audience":"泛用户","keywords":["产品A","功能X"]}');
                setAvatar("male");
                setDurationSec(30);
                setStyle("tech");
                setInputMode("text");
                setJsonErr(null);
              }}
            >
              生成并同步到获客
            </Button>
          </div>
        }
        >
        <div className="space-y-3">
          <Tabs
            tabs={[
              { key: "text", label: "文本" },
              { key: "json", label: "结构化JSON" },
            ]}
            value={inputMode}
            onChange={(k) => {
              if (k === "text" || k === "json") setInputMode(k);
              setJsonErr(null);
            }}
          />
          {inputMode === "text" ? (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">文案/脚本</div>
              <textarea
                className="h-28 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                placeholder="输入文本（Demo占位：也可上传语音）"
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">结构化输入（JSON）</div>
              <textarea
                className="h-28 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                placeholder='{"topic":"产品介绍","sellingPoints":["更快","更省"],"audience":"泛用户","keywords":["产品A","功能X"]}'
                value={scriptJson}
                onChange={(e) => setScriptJson(e.target.value)}
              />
              {jsonErr ? (
                <div className="mt-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {jsonErr}
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">数字人形象</div>
              <Select
                value={avatar}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "male" || v === "female" || v === "cartoon") setAvatar(v);
                }}
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="cartoon">卡通</option>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">时长</div>
              <Select
                value={String(durationSec)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === 15 || v === 30 || v === 45 || v === 60) setDurationSec(v);
                }}
              >
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="45">45s</option>
                <option value="60">60s</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-300">视频风格</div>
              <Select
                value={style}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "tech" || v === "warm" || v === "pro") setStyle(v);
                }}
              >
                <option value="tech">科技感</option>
                <option value="warm">温馨感</option>
                <option value="pro">专业感</option>
              </Select>
              <div className="mt-2 text-xs text-zinc-400">输出格式：MP4（Demo占位）；禁止生成与文案无关元素（Demo不做强校验）。</div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

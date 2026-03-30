import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore, type PlatformKey, type PublishStatus } from "@/store/appStore";

function platformLabel(p: PlatformKey) {
  if (p === "xiaohongshu") return "小红书";
  if (p === "douyin") return "抖音";
  if (p === "wechat_mp") return "公众号";
  return "淘宝";
}

function statusBadge(status: PublishStatus) {
  if (status === "queued") return <Badge variant="gray">排队中</Badge>;
  if (status === "running") return <Badge variant="blue">执行中</Badge>;
  if (status === "success") return <Badge variant="green">成功</Badge>;
  return <Badge variant="red">失败</Badge>;
}

export default function Publishing() {
  usePageMeta("获客（一键发布）");
  const contents = useAppStore((s) => s.contents);
  const publishJobs = useAppStore((s) => s.publishJobs);
  const createPublishJob = useAppStore((s) => s.createPublishJob);
  const updatePublishJob = useAppStore((s) => s.updatePublishJob);
  const markContentSynced = useAppStore((s) => s.markContentSynced);

  const [status, setStatus] = useState<"all" | PublishStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openBind, setOpenBind] = useState(false);
  const [openPublish, setOpenPublish] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [platforms, setPlatforms] = useState<PlatformKey[]>(["douyin", "xiaohongshu"]);
  const [time, setTime] = useState<string>("");

  const selected = publishJobs.find((j) => j.id === selectedId) ?? null;

  const jobList = useMemo(() => {
    if (status === "all") return publishJobs;
    return publishJobs.filter((j) => j.status === status);
  }, [publishJobs, status]);

  const selectedContentIds = useMemo(() => Object.keys(picked).filter((k) => picked[k]), [picked]);

  function togglePlatform(p: PlatformKey) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function simulate(jobId: string) {
    updatePublishJob(jobId, { status: "running", lastError: null });
    setTimeout(() => {
      const fail = Math.random() < 0.15;
      updatePublishJob(jobId, fail ? { status: "failed", lastError: "Demo占位：平台限流或参数不合法" } : { status: "success", lastError: null });
    }, 1200);
  }

  function publishNow() {
    const scheduledAt = time ? new Date(time).toISOString() : null;
    selectedContentIds.forEach((contentId) => {
      markContentSynced(contentId);
      const job = createPublishJob({ contentId, platforms, scheduledAt });
      setTimeout(() => simulate(job.id), 600);
    });
    setOpenPublish(false);
    setPicked({});
    setTime("");
  }

  const contentMap = useMemo(() => new Map(contents.map((c) => [c.id, c])), [contents]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>内容池（图文/视频自动同步）</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Button variant="secondary" onClick={() => setOpenBind(true)}>平台绑定（占位）</Button>
              <Button onClick={() => setOpenPublish(true)} disabled={selectedContentIds.length === 0}>
                一键发布
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className="w-10" />
                  <Th>内容</Th>
                  <Th>类型</Th>
                  <Th>风格</Th>
                  <Th>时间</Th>
                  <Th>同步</Th>
                </tr>
              </thead>
              <tbody>
                {contents.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-8 text-center text-zinc-400">
                      暂无内容
                    </Td>
                  </Tr>
                ) : (
                  contents.map((c) => (
                    <Tr key={c.id}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={!!picked[c.id]}
                          onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))}
                        />
                      </Td>
                      <Td className="font-medium text-zinc-100">{c.title}</Td>
                      <Td className="text-zinc-300">{c.type === "copy" ? "图文" : "视频"}</Td>
                      <Td className="text-zinc-300">{platformLabel(c.platformStyle)}</Td>
                      <Td className="text-zinc-400">{new Date(c.createdAt).toLocaleString()}</Td>
                      <Td>{c.syncedToLeads ? <Badge variant="green">已同步</Badge> : <Badge variant="gray">待同步</Badge>}</Td>
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>发布记录</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Select
                value={status}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "all" || v === "queued" || v === "running" || v === "success" || v === "failed") setStatus(v);
                }}
              >
                <option value="all">全部状态</option>
                <option value="queued">排队中</option>
                <option value="running">执行中</option>
                <option value="success">成功</option>
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
                  <Th>内容</Th>
                  <Th>平台</Th>
                  <Th>发布时间</Th>
                  <Th>状态</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {jobList.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="py-8 text-center text-zinc-400">
                      暂无数据
                    </Td>
                  </Tr>
                ) : (
                  jobList.map((j) => {
                    const c = contentMap.get(j.contentId);
                    return (
                      <Tr key={j.id}>
                        <Td className="font-medium">{c?.title ?? j.contentId}</Td>
                        <Td className="text-zinc-300">{j.platforms.map(platformLabel).join(" / ")}</Td>
                        <Td className="text-zinc-400">{j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : "立即"}</Td>
                        <Td>{statusBadge(j.status)}</Td>
                        <Td className="text-right">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedId(j.id)}>
                            查看
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Modal
        open={openBind}
        title="平台绑定（占位）"
        onClose={() => setOpenBind(false)}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setOpenBind(false)}>关闭</Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-zinc-200">
          <div>将跳转至各平台官方授权页完成绑定（Demo占位）：</div>
          <ul className="list-disc pl-5">
            <li>小红书</li>
            <li>抖音</li>
            <li>淘宝</li>
            <li>公众号</li>
          </ul>
          <div className="text-xs text-zinc-400">实际接入需后端安全持有 client_secret，并处理回调与限流。</div>
        </div>
      </Modal>

      <Modal
        open={openPublish}
        title="一键发布"
        onClose={() => setOpenPublish(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenPublish(false)}>取消</Button>
            <Button onClick={publishNow} disabled={selectedContentIds.length === 0 || platforms.length === 0}>
              发布
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-zinc-200">已选择 {selectedContentIds.length} 条内容</div>
          <div>
            <div className="mb-2 text-xs font-medium text-zinc-300">选择平台</div>
            <div className="flex flex-wrap gap-2">
              {(["douyin", "xiaohongshu", "taobao", "wechat_mp"] as PlatformKey[]).map((p) => (
                <label key={p} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10">
                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  {platformLabel(p)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">定时发布（可选）</div>
            <input
              type="datetime-local"
              className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-amber-400/30"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <div className="mt-1 text-xs text-zinc-400">Demo：支持单次定时；循环任务可后续对接 Cron。</div>
          </div>
        </div>
      </Modal>

      <Drawer
        open={!!selected}
        title="发布详情"
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={selected.status !== "failed"}
                onClick={() => {
                  updatePublishJob(selected.id, { status: "queued", lastError: null });
                  setTimeout(() => simulate(selected.id), 600);
                }}
              >
                重试
              </Button>
              <Button
                variant="danger"
                disabled={selected.status === "success"}
                onClick={() => updatePublishJob(selected.id, { status: "failed", lastError: "已取消（Demo）" })}
              >
                取消
              </Button>
            </div>
          ) : null
        }
        widthClassName="max-w-2xl"
      >
        {!selected ? null : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">内容</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {contentMap.get(selected.contentId)?.title ?? selected.contentId}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                <div className="flex h-10 items-center">{statusBadge(selected.status)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">平台</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {selected.platforms.map(platformLabel).join(" / ")}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">发布时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {selected.scheduledAt ? new Date(selected.scheduledAt).toLocaleString() : "立即"}
                </div>
              </div>
            </div>

            {selected.lastError ? (
              <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{selected.lastError}</div>
            ) : (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">暂无错误信息</div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

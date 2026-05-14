import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore, type PlatformKey, type PublishStatus } from "@/store/appStore";

export const defaultPublishPlatforms: PlatformKey[] = ["xiaohongshu", "douyin"];

export const publishPlatformOptions: Array<{ key: PlatformKey; label: string; enabled: boolean }> = [
  { key: "xiaohongshu", label: "小红书", enabled: true },
  { key: "douyin", label: "抖音", enabled: true },
  { key: "wechat_mp", label: "视频号", enabled: true },
  { key: "taobao", label: "淘宝", enabled: true },
  { key: "jd", label: "京东", enabled: true },
  { key: "pdd", label: "拼多多", enabled: true },
];

function platformLabel(platform: PlatformKey) {
  if (platform === "xiaohongshu") return "小红书";
  if (platform === "douyin") return "抖音";
  if (platform === "wechat_mp") return "视频号";
  if (platform === "taobao") return "淘宝";
  if (platform === "jd") return "京东";
  if (platform === "pdd") return "拼多多";
  return "超级站";
}

export default function Publishing() {
  usePageMeta("获客内容池");
  const contents = useAppStore((s) => s.contents);
  const publishJobs = useAppStore((s) => s.publishJobs);
  const createPublishJob = useAppStore((s) => s.createPublishJob);

  const [status, setStatus] = useState<"all" | PublishStatus>("all");
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>(defaultPublishPlatforms);

  const approved = useMemo(() => contents.filter((item) => item.reviewStatus === "approved"), [contents]);
  const jobList = useMemo(
    () => (status === "all" ? publishJobs : publishJobs.filter((job) => job.status === status)),
    [publishJobs, status]
  );
  const publishContent = useMemo(
    () => approved.find((item) => item.id === publishTarget) ?? null,
    [approved, publishTarget]
  );

  function togglePlatform(platform: PlatformKey) {
    setSelectedPlatforms((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]
    );
  }

  function openPublishModal(contentId: string) {
    setPublishTarget(contentId);
    setSelectedPlatforms(defaultPublishPlatforms);
  }

  function confirmPublish() {
    if (!publishTarget || selectedPlatforms.length === 0) return;
    createPublishJob({
      contentId: publishTarget,
      platforms: selectedPlatforms,
      scheduledAt: null,
    });
    setPublishTarget(null);
  }

  function openSuperSiteEditor(contentId: string) {
    const editorUrl = `http://${window.location.hostname}:5173/?editor=super-site&contentId=${encodeURIComponent(contentId)}`;
    window.open(editorUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>获客内容池</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-zinc-300">
          内容池仅展示审核通过的素材。点击“一键发布”后可勾选目标平台，系统会将内容保存到对应平台草稿箱。
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>内容池</CardTitle>
        </CardHeader>
        <CardContent>
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
                {approved.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="py-10 text-center text-zinc-400">
                      暂无审核通过素材
                    </Td>
                  </Tr>
                ) : (
                  approved.map((item) => (
                    <Tr key={item.id}>
                      <Td className="font-medium text-zinc-100">{item.title}</Td>
                      <Td className="text-zinc-300">
                        {item.type === "video" ? "视频" : item.type === "product" ? "商品素材" : "图文"}
                      </Td>
                      <Td className="text-zinc-300">{platformLabel(item.platformStyle)}</Td>
                      <Td className="text-zinc-400">{new Date(item.createdAt).toLocaleString()}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => openPublishModal(item.id)}>
                            一键发布
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openSuperSiteEditor(item.id)}>
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
              <Select value={status} onChange={(e) => setStatus(e.target.value as "all" | PublishStatus)}>
                <option value="all">全部状态</option>
                <option value="queued">草稿箱</option>
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
                  <Th>保存时间</Th>
                  <Th>状态</Th>
                </tr>
              </thead>
              <tbody>
                {jobList.length === 0 ? (
                  <Tr>
                    <Td colSpan={4} className="py-10 text-center text-zinc-400">
                      暂无发布记录
                    </Td>
                  </Tr>
                ) : (
                  jobList.map((job) => (
                    <Tr key={job.id}>
                      <Td className="font-mono text-xs text-zinc-300">{job.contentId}</Td>
                      <Td className="text-zinc-300">{job.platforms.map(platformLabel).join(" / ")}</Td>
                      <Td className="text-zinc-400">{new Date(job.createdAt).toLocaleString()}</Td>
                      <Td>
                        <PublishBadge status={job.status} />
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
            <Button onClick={confirmPublish} disabled={selectedPlatforms.length === 0}>
              保存到草稿箱
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-sm font-medium text-zinc-100">{publishContent?.title ?? "未选择素材"}</div>
            <div className="mt-1 text-xs text-zinc-400">勾选的平台会生成对应草稿箱记录，后续可继续发布。</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {publishPlatformOptions.map((option) => {
              const checked = selectedPlatforms.includes(option.key);
              return (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                    checked
                      ? "border-orange-500/70 bg-orange-500/10 text-zinc-50"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-orange-500/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 accent-orange-500"
                    checked={checked}
                    onChange={() => togglePlatform(option.key)}
                  />
                  <div className="text-sm font-medium">{option.label}</div>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PublishBadge(props: { status: PublishStatus }) {
  if (props.status === "success") return <Badge variant="green">已发布</Badge>;
  if (props.status === "failed") return <Badge variant="red">发布失败</Badge>;
  if (props.status === "running") return <Badge variant="blue">发布中</Badge>;
  return <Badge variant="gray">草稿箱</Badge>;
}

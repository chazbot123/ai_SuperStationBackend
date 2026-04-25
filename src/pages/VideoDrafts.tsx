import { useMemo, useState } from "react";
import { Clapperboard, Mic } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useVideoDraftStore, type VideoDraftItem } from "@/store/videoDraftStore";

type SourceFilter = "all" | "product_video" | "avatar_video";

function sourceMeta(source: VideoDraftItem["source"]) {
  if (source === "product_video") {
    return {
      label: "产品视频生成",
      icon: <Clapperboard className="h-3.5 w-3.5" />,
    };
  }

  return {
    label: "真人口播视频生成",
    icon: <Mic className="h-3.5 w-3.5" />,
  };
}

export default function VideoDrafts() {
  usePageMeta("视频草稿箱");

  const user = useAuthStore((s) => s.user);
  const addContent = useAppStore((s) => s.addContent);
  const markContentSynced = useAppStore((s) => s.markContentSynced);
  const items = useVideoDraftStore((s) => s.items);
  const updateItem = useVideoDraftStore((s) => s.updateItem);
  const isAgent = user?.roleKey === "level1_agent";

  const [keyword, setKeyword] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [previewItem, setPreviewItem] = useState<VideoDraftItem | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        item.title.toLowerCase().includes(normalizedKeyword) ||
        item.generatedScript.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [items, keyword, sourceFilter]);

  function handleSubmitReview(item: VideoDraftItem) {
    updateItem(item.id, { reviewStage: "submitted" });
    setHint("已提交审核，等待主公司处理。");
  }

  function handleSyncToLeads(item: VideoDraftItem) {
    if (item.reviewStage !== "approved") {
      setHint("只有审核通过后才能同步到获客。");
      return;
    }

    const content = addContent({
      type: "video",
      title: item.title,
      body: item.generatedScript,
      platformStyle: "douyin",
      images: [],
      videoUrl: item.videoUrl,
      syncedToLeads: true,
      reviewStatus: "approved",
    });
    markContentSynced(content.id);
    updateItem(item.id, { syncedToLeads: true });
    setHint("已同步到获客内容池。");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">视频草稿箱</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                统一聚合 `产品视频生成` 和 `真人口播视频生成` 的结果。
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题或脚本"
              />
              <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                <option value="all">全部草稿</option>
                <option value="product_video">产品视频生成</option>
                <option value="avatar_video">真人口播视频生成</option>
              </Select>
            </div>
          </div>
          {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-10 text-center text-sm text-zinc-500">
                暂无视频草稿结果
              </div>
            ) : (
              filteredItems.map((item) => {
                const meta = sourceMeta(item.source);
                return (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:max-w-[520px]">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          {meta.icon}
                          <span>{meta.label}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-zinc-100">{item.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{item.generatedScript}</div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleString()} · 时长 {item.durationText}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewItem(item)}>
                          预览
                        </Button>
                        {isAgent && item.reviewStage === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleSubmitReview(item)}>
                            提交审核
                          </Button>
                        ) : null}
                        {item.reviewStage === "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSyncToLeads(item)}
                            disabled={item.syncedToLeads}
                          >
                            {item.syncedToLeads ? "已同步获客" : "同步到获客"}
                          </Button>
                        ) : null}
                        {item.reviewStage === "submitted" ? <Badge variant="amber">待审核</Badge> : null}
                        {item.reviewStage === "approved" ? <Badge variant="green">审核通过</Badge> : null}
                        {item.syncedToLeads ? <Badge variant="blue">已同步获客</Badge> : null}
                        <Badge variant={item.status === "ready" ? "green" : "amber"}>
                          {item.status === "ready" ? "可用" : "处理中"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Modal open={!!previewItem} title="视频草稿预览" onClose={() => setPreviewItem(null)}>
        {previewItem ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-zinc-100">{previewItem.title}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {new Date(previewItem.createdAt).toLocaleString()} · 时长 {previewItem.durationText}
              </div>
            </div>
            <video controls src={previewItem.videoUrl} className="h-72 w-full rounded-xl bg-black object-cover" />
            <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
              {previewItem.generatedScript}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

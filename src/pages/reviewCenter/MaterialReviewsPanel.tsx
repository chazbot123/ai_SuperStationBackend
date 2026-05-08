import { useEffect, useMemo, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import ReviewStatusBadge from "@/pages/reviewCenter/ReviewStatusBadge";
import {
  approveReviewMaterial,
  listReviewMaterials,
  rejectReviewMaterial,
  type AiReviewMaterialItem,
  type ReviewMaterialSource,
} from "@/lib/ai";
import {
  buildAiMaterialReviewItem,
  buildMaterialReviewItem,
  filterMaterialReviewItems,
  type MaterialReviewItem,
  type MaterialTypeFilter,
  type ReviewListStatus,
} from "@/pages/reviewCenter/reviewCenterModels";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";

const rejectPlaceholder = "请补充素材信息后重新提交";

export default function MaterialReviewsPanel() {
  const contents = useAppStore((s) => s.contents);
  const reviewer = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewListStatus>("pending");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<MaterialTypeFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [serverItems, setServerItems] = useState<AiReviewMaterialItem[]>([]);

  useEffect(() => {
    if (!accessToken || reviewer?.roleKey !== "main_company") {
      setServerItems([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const items = await listReviewMaterials(accessToken);
        if (!cancelled) {
          setServerItems(items);
        }
      } catch {
        if (!cancelled) {
          setServerItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, reviewer?.roleKey]);

  const items = useMemo(
    () =>
      reviewer?.roleKey === "main_company"
        ? serverItems.map(buildAiMaterialReviewItem)
        : contents.map(buildMaterialReviewItem),
    [contents, reviewer?.roleKey, serverItems]
  );
  const filteredItems = useMemo(
    () =>
      filterMaterialReviewItems(items, {
        status: statusFilter,
        materialType: materialTypeFilter,
        keyword,
      }),
    [items, keyword, materialTypeFilter, statusFilter]
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function parseSelectedSource(item: MaterialReviewItem): { source: ReviewMaterialSource; id: string } | null {
    const separatorIndex = item.id.indexOf("_");
    if (separatorIndex <= 0) return null;
    const source = item.id.slice(0, separatorIndex);
    const id = item.id.slice(separatorIndex + 1);
    if (source !== "social" && source !== "product" && source !== "video") return null;
    if (!id) return null;
    return { source, id };
  }

  async function approveItem(item: MaterialReviewItem) {
    if (!accessToken) return;
    const parsed = parseSelectedSource(item);
    if (!parsed) return;
    const updated = await approveReviewMaterial({ accessToken, source: parsed.source, id: parsed.id });
    setServerItems((prev) => prev.map((entry) => (entry.id === parsed.id && entry.source === parsed.source ? updated : entry)));
    setSelectedId(null);
  }

  async function rejectItem(item: MaterialReviewItem, reason: string) {
    if (!accessToken) return;
    const parsed = parseSelectedSource(item);
    if (!parsed) return;
    await rejectReviewMaterial({
      accessToken,
      source: parsed.source,
      id: parsed.id,
      reason: reason.trim() || rejectPlaceholder,
    });
    setServerItems((prev) => prev.filter((entry) => !(entry.id === parsed.id && entry.source === parsed.source)));
    setRejectingId(null);
    setSelectedId(null);
    setRejectReason("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>素材审核</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | ReviewListStatus)}>
              <option value="all">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已驳回</option>
            </Select>
            <Select value={materialTypeFilter} onChange={(e) => setMaterialTypeFilter(e.target.value as MaterialTypeFilter)}>
              <option value="all">全部类型</option>
              <option value="image_text">图文</option>
              <option value="video">视频</option>
              <option value="mixed">混合</option>
              <option value="copy">文案</option>
            </Select>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索标题、文案、标签" />
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>提交单</Th>
                  <Th>类型</Th>
                  <Th>提交人</Th>
                  <Th>提交时间</Th>
                  <Th>状态</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-10 text-center text-zinc-400">
                      暂无符合条件的素材审核记录
                    </Td>
                  </Tr>
                ) : (
                  filteredItems.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <div className="font-medium text-zinc-100">{item.title}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-zinc-400">{item.body}</div>
                      </Td>
                      <Td className="text-zinc-300">{item.materialTypeLabel}</Td>
                      <Td className="text-zinc-300">{item.submittedByName}</Td>
                      <Td className="text-zinc-400">{new Date(item.submittedAt).toLocaleString()}</Td>
                      <Td><ReviewStatusBadge status={item.status} /></Td>
                      <Td className="text-right">
                        <Button size="sm" variant="secondary" onClick={() => setSelectedId(item.id)}>
                          查看详情
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Drawer
        open={Boolean(selected)}
        title={selected ? `素材详情 · ${selected.title}` : "素材详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRejectingId(selected.id);
                  setRejectReason(selected.rejectReason ?? "");
                }}
              >
                驳回
              </Button>
              <Button size="sm" onClick={() => void approveItem(selected)}>
                通过
              </Button>
            </div>
          ) : null
        }
        widthClassName="max-w-3xl"
      >
        {!selected ? null : (
          <div className="space-y-4 pb-16">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBlock label="素材类型" value={selected.materialTypeLabel} />
              <InfoBlock label="提交状态" valueNode={<ReviewStatusBadge status={selected.status} />} />
              <InfoBlock label="提交人" value={selected.submittedByName} />
              <InfoBlock label="提交时间" value={new Date(selected.submittedAt).toLocaleString()} />
            </div>

            {selected.images.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>图片预览</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selected.images.map((image, index) => (
                      <img key={`${selected.id}_${index}`} src={image} alt={selected.title} className="h-48 w-full rounded-lg object-cover" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {selected.videoUrl ? (
              <Card>
                <CardHeader>
                  <CardTitle>视频预览</CardTitle>
                </CardHeader>
                <CardContent>
                  <video src={selected.videoUrl} controls className="w-full rounded-lg" />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>文案内容</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1 text-xs text-zinc-400">标题</div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">{selected.title}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-zinc-400">文案</div>
                  <div className="whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">
                    {selected.body}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-zinc-400">标签</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.tags.length === 0 ? (
                      <span className="text-sm text-zinc-400">无标签</span>
                    ) : (
                      selected.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-200">
                          #{tag}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                {selected.rejectReason ? (
                  <div>
                    <div className="mb-1 text-xs text-zinc-400">驳回原因</div>
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {selected.rejectReason}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </Drawer>

      <Modal
        open={Boolean(rejectingId)}
        title="驳回素材提交"
        onClose={() => {
          setRejectingId(null);
          setRejectReason("");
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRejectingId(null);
                setRejectReason("");
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const item = items.find((entry) => entry.id === rejectingId);
                if (!item) {
                  return;
                }
                void rejectItem(item, rejectReason);
              }}
            >
              确认驳回
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm text-zinc-300">请填写驳回原因，素材提交单会按整单驳回。</div>
          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={rejectPlaceholder} />
        </div>
      </Modal>
    </div>
  );
}

function InfoBlock(props: { label: string; value?: string; valueNode?: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-zinc-400">{props.label}</div>
      <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">
        {props.valueNode ?? props.value}
      </div>
    </div>
  );
}

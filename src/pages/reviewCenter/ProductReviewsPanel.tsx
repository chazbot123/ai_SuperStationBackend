import { useEffect, useMemo, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import ReviewStatusBadge from "@/pages/reviewCenter/ReviewStatusBadge";
import type { ReviewListStatus } from "@/pages/reviewCenter/reviewCenterModels";
import { useAuthStore } from "@/store/authStore";
import { useProductsStore } from "@/store/productsStore";

type ProductReviewStatusFilter = "all" | ReviewListStatus;

type ProductReviewItem = {
  id: string;
  name: string;
  summary: string;
  priceText: string;
  ownerName: string;
  status: ReviewListStatus;
  submittedAt: string | null;
  rejectReason: string | null;
  images: string[];
  description: string | null;
};

function mapProductStatus(status: string): ReviewListStatus | null {
  if (status === "submitted") {
    return "pending";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "live") {
    return "approved";
  }

  return null;
}

export default function ProductReviewsPanel() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const products = useProductsStore((s) => s.items);
  const loading = useProductsStore((s) => s.loading);
  const initialized = useProductsStore((s) => s.initialized);
  const error = useProductsStore((s) => s.error);
  const loadProducts = useProductsStore((s) => s.load);
  const approveProduct = useProductsStore((s) => s.approveProduct);
  const rejectProduct = useProductsStore((s) => s.rejectProduct);
  const [statusFilter, setStatusFilter] = useState<ProductReviewStatusFilter>("pending");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void loadProducts();
  }, [accessToken, loadProducts]);

  const items = useMemo<ProductReviewItem[]>(
    () =>
      products
        .map((item) => {
          const status = mapProductStatus(item.status);
          if (!status) {
            return null;
          }

          return {
            id: item.id,
            name: item.name,
            summary: item.summary,
            priceText: item.priceText,
            ownerName: item.ownerName,
            status,
            submittedAt: item.submittedAt,
            rejectReason: item.rejectReason,
            images: item.images,
            description: item.description,
          };
        })
        .filter((item): item is ProductReviewItem => Boolean(item)),
    [products]
  );

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return `${item.name} ${item.summary}`.toLowerCase().includes(normalizedKeyword);
    });
  }, [items, keyword, statusFilter]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function handleApprove(productId: string) {
    setSubmitting(true);
    try {
      await approveProduct(productId);
      setRequestError(null);
      setSelectedId(null);
    } catch (requestError) {
      setRequestError(requestError instanceof Error ? requestError.message : "商品审核通过失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(productId: string, reason: string) {
    setSubmitting(true);
    try {
      await rejectProduct(productId, reason);
      setRequestError(null);
      setRejectingId(null);
      setSelectedId(null);
      setRejectReason("");
    } catch (requestError) {
      setRequestError(requestError instanceof Error ? requestError.message : "商品驳回失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>商品审核</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductReviewStatusFilter)}>
              <option value="all">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已驳回</option>
            </Select>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索商品名称或摘要" />
          </div>

          {error || requestError ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {requestError ?? error}
            </div>
          ) : null}

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>提交人</Th>
                  <Th>价格</Th>
                  <Th>提交时间</Th>
                  <Th>状态</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {loading && !initialized ? (
                  <Tr>
                    <Td colSpan={6} className="py-10 text-center text-zinc-400">
                      正在加载商品审核数据
                    </Td>
                  </Tr>
                ) : filteredItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-10 text-center text-zinc-400">
                      暂无符合条件的商品审核记录
                    </Td>
                  </Tr>
                ) : (
                  filteredItems.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <div className="font-medium text-zinc-100">{item.name}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-zinc-400">{item.summary}</div>
                      </Td>
                      <Td className="text-zinc-300">{item.ownerName}</Td>
                      <Td className="text-zinc-300">{item.priceText}</Td>
                      <Td className="text-zinc-400">{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "-"}</Td>
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
        title={selected ? `商品详情 · ${selected.name}` : "商品详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  setRejectingId(selected.id);
                  setRejectReason(selected.rejectReason ?? "");
                }}
              >
                驳回
              </Button>
              <Button size="sm" disabled={submitting} onClick={() => void handleApprove(selected.id)}>
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
              <InfoBlock label="提交人" value={selected.ownerName} />
              <InfoBlock label="提交状态" valueNode={<ReviewStatusBadge status={selected.status} />} />
              <InfoBlock label="提交时间" value={selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : "-"} />
              <InfoBlock label="价格" value={selected.priceText} />
            </div>

            {selected.images.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>商品主图</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selected.images.map((image, index) => (
                      <img key={`${selected.id}_${index}`} src={image} alt={selected.name} className="h-48 w-full rounded-lg object-cover" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>商品信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1 text-xs text-zinc-400">商品名称</div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">{selected.name}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-zinc-400">商品摘要</div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">{selected.summary}</div>
                </div>
                {selected.description ? (
                  <div>
                    <div className="mb-1 text-xs text-zinc-400">商品描述</div>
                    <div className="whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">
                      {selected.description}
                    </div>
                  </div>
                ) : null}
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
        title="驳回商品提交"
        onClose={() => {
          setRejectingId(null);
          setRejectReason("");
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={submitting}
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
              disabled={submitting}
              onClick={() => {
                if (!rejectingId) {
                  return;
                }

                void handleReject(rejectingId, rejectReason);
              }}
            >
              确认驳回
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm text-zinc-300">请填写驳回原因。</div>
          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="请说明驳回原因" />
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

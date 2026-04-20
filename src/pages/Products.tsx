import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore, type ProductItem } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";

type Draft = {
  name: string;
  summary: string;
  priceText: string;
  images: string[];
  specialOfferEnabled: boolean;
  originalPriceText: string;
  specialPriceText: string;
  specialTag: string;
};

function emptyDraft(): Draft {
  return {
    name: "",
    summary: "",
    priceText: "楼 0",
    images: [],
    specialOfferEnabled: false,
    originalPriceText: "",
    specialPriceText: "",
    specialTag: "",
  };
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export default function Products() {
  usePageMeta("产品管理");

  const user = useAuthStore((s) => s.user);
  const products = useAppStore((s) => s.products);
  const addProduct = useAppStore((s) => s.addProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const submitProductReview = useAppStore((s) => s.submitProductReview);

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isMainCompany = user?.roleKey === "main_company";

  const visibleProducts = useMemo(() => {
    const scoped = isMainCompany ? products : products.filter((item) => item.ownerUserId === user?.id);
    const keyword = query.trim().toLowerCase();
    return scoped.filter((item) => {
      if (!keyword) return true;
      return `${item.name} ${item.summary} ${item.ownerName}`.toLowerCase().includes(keyword);
    });
  }, [isMainCompany, products, query, user?.id]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setHint(null);
  }

  function openEdit(item: ProductItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      summary: item.summary,
      priceText: item.priceText,
      images: item.images,
      specialOfferEnabled: Boolean(item.specialOfferEnabled),
      originalPriceText: item.originalPriceText ?? "",
      specialPriceText: item.specialPriceText ?? "",
      specialTag: item.specialTag ?? "",
    });
    setHint(null);
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!draft) return;
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setHint("请选择图片文件上传。");
      return;
    }

    const urls = await Promise.all(files.map(readFileAsDataUrl));
    setDraft((prev) => (prev ? { ...prev, images: [...prev.images, ...urls] } : prev));
    setHint(`已上传 ${files.length} 张图片，排序后的第一张会自动作为主图。`);
    event.target.value = "";
  }

  function removeImage(index: number) {
    setDraft((prev) => (prev ? { ...prev, images: prev.images.filter((_, current) => current !== index) } : prev));
  }

  function moveImage(index: number, direction: -1 | 1) {
    setDraft((prev) => {
      if (!prev) return prev;
      const images = [...prev.images];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= images.length) return prev;
      [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
      return { ...prev, images };
    });
  }

  function saveDraft() {
    if (!draft || !user) return;

    const payload = {
      name: draft.name || "未命名商品",
      summary: draft.summary || "请补充商品卖点",
      priceText: draft.specialOfferEnabled ? "" : draft.priceText || "楼 0",
      images: draft.images,
      specialOfferEnabled: draft.specialOfferEnabled,
      originalPriceText: draft.specialOfferEnabled ? draft.originalPriceText : "",
      specialPriceText: draft.specialOfferEnabled ? draft.specialPriceText : "",
      specialTag: draft.specialOfferEnabled ? draft.specialTag : "",
    };

    if (editingId) {
      updateProduct(editingId, payload);
    } else {
      addProduct({
        ownerUserId: user.id,
        ownerName: user.displayName,
        ownerRoleKey: user.roleKey,
        status: "draft",
        rejectReason: null,
        submittedAt: null,
        reviewedAt: null,
        ...payload,
      });
    }

    setEditingId(null);
    setDraft(null);
    setHint(null);
  }

  function toggleSpecialOffer(enabled: boolean) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        specialOfferEnabled: enabled,
        priceText: enabled ? "" : prev.priceText || "楼 0",
        originalPriceText: enabled ? prev.originalPriceText : "",
        specialPriceText: enabled ? prev.specialPriceText : "",
        specialTag: enabled ? prev.specialTag : "",
      };
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>产品管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-zinc-300">
          <div>当前商品前后台关系按“淘宝 / 千牛”模型呈现。</div>
          <div>前台只展示所有已上架商品，后台负责商品创建、编辑、审核和上架。</div>
          <div>
            {isMainCompany
              ? "主公司可查看所有一级代理商品，也可自己创建并直接上架商品。"
              : "一级代理可管理自己的商品，但商品上架前必须提交主公司审核。"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{isMainCompany ? "全局商品列表" : "我的商品"}</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索商品名称 / 创建人" />
              <Button onClick={openCreate}>新增产品</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>创建人</Th>
                  <Th>价格</Th>
                  <Th>特价</Th>
                  <Th>状态</Th>
                  <Th>更新时间</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.length === 0 ? (
                  <Tr>
                    <Td colSpan={7} className="py-10 text-center text-zinc-400">
                      暂无商品
                    </Td>
                  </Tr>
                ) : (
                  visibleProducts.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                            {item.images[0] ? (
                              <img src={item.images[0]} alt={item.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-100">{item.name}</div>
                            <div className="text-xs text-zinc-400">{item.summary}</div>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-zinc-300">{item.ownerName}</Td>
                      <Td className="text-zinc-300">
                        {item.specialOfferEnabled ? item.specialPriceText || item.originalPriceText || "未设置" : item.priceText}
                      </Td>
                      <Td>
                        {item.specialOfferEnabled ? (
                          <div className="space-y-1 text-xs text-zinc-300">
                            <Badge variant="amber">{item.specialTag || "特价"}</Badge>
                            <div className="text-zinc-500 line-through">{item.originalPriceText || "未设置原价"}</div>
                            <div className="text-emerald-300">{item.specialPriceText || "未设置特惠价"}</div>
                          </div>
                        ) : (
                          <span className="text-zinc-500">未启用</span>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={item.status} />
                      </Td>
                      <Td className="text-zinc-400">{new Date(item.updatedAt).toLocaleString()}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                            编辑
                          </Button>
                          {isMainCompany ? (
                            <Button
                              size="sm"
                              onClick={() => updateProduct(item.id, { status: item.status === "live" ? "offline" : "live" })}
                            >
                              {item.status === "live" ? "下架" : "上架"}
                            </Button>
                          ) : item.status === "draft" || item.status === "rejected" ? (
                            <Button size="sm" onClick={() => submitProductReview(item.id)}>
                              提交审核
                            </Button>
                          ) : null}
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

      <Modal
        open={!!draft}
        title={editingId ? "编辑产品" : "新增产品"}
        onClose={() => {
          setEditingId(null);
          setDraft(null);
          setHint(null);
        }}
        footer={
          draft ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                取消
              </Button>
              <Button onClick={saveDraft}>保存</Button>
            </div>
          ) : null
        }
      >
        {!draft ? null : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品名称</div>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品卖点</div>
              <Input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
            </div>

            {!draft.specialOfferEnabled ? (
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">售价</div>
                <Input value={draft.priceText} onChange={(e) => setDraft({ ...draft, priceText: e.target.value })} />
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">特价设置</div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.specialOfferEnabled}
                    onChange={(e) => toggleSpecialOffer(e.target.checked)}
                    className="accent-amber-400"
                  />
                  启用特价
                </label>
              </div>

              {draft.specialOfferEnabled ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">原价</div>
                    <Input
                      value={draft.originalPriceText}
                      onChange={(e) => setDraft({ ...draft, originalPriceText: e.target.value })}
                      placeholder="如：楼 3999"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">特惠价</div>
                    <Input
                      value={draft.specialPriceText}
                      onChange={(e) => setDraft({ ...draft, specialPriceText: e.target.value })}
                      placeholder="如：楼 2999"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">特价标签</div>
                    <Input
                      value={draft.specialTag}
                      onChange={(e) => setDraft({ ...draft, specialTag: e.target.value })}
                      placeholder="如：限时特价"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-400">未启用特价时，商品仅保留“售价”作为前台价格。</div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">商品图片</div>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  上传图片
                </Button>
              </div>
              <div className="text-xs text-zinc-400">支持手动上传商品图片，排序后第一张图片会自动作为主图。</div>
              {hint ? <div className="text-xs text-emerald-300">{hint}</div> : null}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {draft.images.length === 0 ? (
                  <div className="col-span-full rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-zinc-500">
                    暂无商品图片
                  </div>
                ) : (
                  draft.images.map((image, index) => (
                    <div key={`${image}_${index}`} className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
                      <img src={image} alt={`product_${index + 1}`} className="aspect-square w-full rounded-md object-cover" />
                      <div className="flex items-center justify-between text-xs text-zinc-300">
                        <span>{index === 0 ? "主图" : `图片 ${index + 1}`}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-white/5 px-2 py-1 hover:bg-white/10"
                            onClick={() => moveImage(index, -1)}
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white/5 px-2 py-1 hover:bg-white/10"
                            onClick={() => moveImage(index, 1)}
                          >
                            下移
                          </button>
                          <button
                            type="button"
                            className="rounded bg-red-500/15 px-2 py-1 text-red-200 hover:bg-red-500/25"
                            onClick={() => removeImage(index)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatusBadge(props: { status: "draft" | "submitted" | "live" | "rejected" | "offline" }) {
  if (props.status === "live") return <Badge variant="green">已上架</Badge>;
  if (props.status === "submitted") return <Badge variant="amber">待审核</Badge>;
  if (props.status === "rejected") return <Badge variant="red">审核驳回</Badge>;
  if (props.status === "offline") return <Badge variant="gray">已下架</Badge>;
  return <Badge variant="gray">草稿</Badge>;
}

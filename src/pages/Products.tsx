import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { requestJson } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useProductsStore, type ProductItem, type ProductStatus } from "@/store/productsStore";

type Draft = {
  name: string;
  englishName: string;
  summary: string;
  description: string;
  priceText: string;
  images: string[];
  specialOfferEnabled: boolean;
  originalPriceText: string;
  specialPriceText: string;
  specialTag: string;
};

type InferEnglishNameResponse = {
  englishName: string;
};

type ProductSortKey = "ownerName" | "price" | "status" | "updatedAt";
type ProductSortDirection = "asc" | "desc";

function emptyDraft(): Draft {
  return {
    name: "",
    englishName: "",
    summary: "",
    description: "",
    priceText: "0",
    images: [],
    specialOfferEnabled: false,
    originalPriceText: "",
    specialPriceText: "",
    specialTag: "",
  };
}

function isNumericPrice(value: string) {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

function sanitizePriceInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [integerPart = "", ...decimalParts] = normalized.split(".");
  const decimalPart = decimalParts.join("").slice(0, 2);

  if (!normalized.includes(".")) {
    return integerPart;
  }

  return `${integerPart}.${decimalPart}`;
}

export default function Products() {
  usePageMeta("产品管理");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const products = useProductsStore((s) => s.items);
  const loading = useProductsStore((s) => s.loading);
  const initialized = useProductsStore((s) => s.initialized);
  const productsError = useProductsStore((s) => s.error);
  const loadProducts = useProductsStore((s) => s.load);
  const createProduct = useProductsStore((s) => s.createProduct);
  const updateProduct = useProductsStore((s) => s.updateProduct);
  const uploadProductImage = useProductsStore((s) => s.uploadProductImage);
  const removeProduct = useProductsStore((s) => s.removeProduct);
  const submitProduct = useProductsStore((s) => s.submitProduct);
  const withdrawProductSubmission = useProductsStore((s) => s.withdrawProductSubmission);
  const publishProduct = useProductsStore((s) => s.publishProduct);
  const unpublishProduct = useProductsStore((s) => s.unpublishProduct);

  const [query, setQuery] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [sortKey, setSortKey] = useState<ProductSortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<ProductSortDirection>("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isMainCompany = user?.roleKey === "main_company";

  useEffect(() => {
    if (!accessToken) return;
    void loadProducts();
  }, [accessToken, loadProducts, user?.id, user?.roleKey]);

  const scopedProducts = useMemo(
    () => (isMainCompany ? products : products.filter((item) => item.ownerUserId === user?.id)),
    [isMainCompany, products, user?.id],
  );

  const creatorOptions = useMemo(
    () => Array.from(new Set(scopedProducts.map((item) => item.ownerName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [scopedProducts],
  );

  const visibleProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return scopedProducts
      .filter((item) => {
        if (creatorFilter !== "all" && item.ownerName !== creatorFilter) {
          return false;
        }

        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }

        if (!keyword) return true;
        return `${item.name} ${item.englishName} ${item.summary} ${item.description ?? ""} ${item.ownerName}`
          .toLowerCase()
          .includes(keyword);
      })
      .sort((left, right) => compareProducts(left, right, sortKey, sortDirection));
  }, [creatorFilter, query, scopedProducts, sortDirection, sortKey, statusFilter]);

  function toggleSort(nextKey: ProductSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "updatedAt" ? "desc" : "asc");
  }

  async function autofillEnglishName(name: string) {
    const trimmedName = name.trim();
    if (!accessToken || !trimmedName) return;

    try {
      const payload = await requestJson<InferEnglishNameResponse>("/api/products/infer-english-name", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      setDraft((current) => {
        if (!current) return current;
        if (current.name.trim() !== trimmedName) return current;
        if (current.englishName.trim()) return current;
        return { ...current, englishName: payload.englishName };
      });
    } catch {
      // Fall back to backend generation on save if the preview fill fails.
    }
  }

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setHint(null);
    setError(null);
  }

  function openEdit(item: ProductItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      englishName: item.englishName,
      summary: item.summary,
      description: item.description ?? "",
      priceText: item.priceText,
      images: item.images,
      specialOfferEnabled: Boolean(item.specialOfferEnabled),
      originalPriceText: item.originalPriceText ?? "",
      specialPriceText: item.specialPriceText ?? "",
      specialTag: item.specialTag ?? "",
    });
    setHint(null);
    setError(null);
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!draft) return;
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setHint("请选择图片文件上传。");
      return;
    }

    setUploadingImages(true);
    setError(null);
    setHint(`正在上传 ${files.length} 张图片到 MinIO...`);

    try {
      const urls = await Promise.all(files.map((file) => uploadProductImage(file)));
      setDraft((prev) => (prev ? { ...prev, images: [...prev.images, ...urls] } : prev));
      setHint(`已上传 ${files.length} 张图片到 MinIO，排序后的第一张会自动作为主图。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传商品图片失败");
    } finally {
      setUploadingImages(false);
    }

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

  async function saveDraft() {
    if (!draft || !user) return;

    const trimmedName = draft.name.trim();
    const trimmedPriceText = draft.priceText.trim();
    const trimmedOriginalPriceText = draft.originalPriceText.trim();
    const trimmedSpecialPriceText = draft.specialPriceText.trim();

    if (!trimmedName) {
      setError("请输入产品名称");
      return;
    }

    if (!draft.specialOfferEnabled && !isNumericPrice(trimmedPriceText)) {
      setError("售价只能填写数字，最多保留两位小数");
      return;
    }

    if (draft.specialOfferEnabled) {
      if (!isNumericPrice(trimmedOriginalPriceText)) {
        setError("原价只能填写数字，最多保留两位小数");
        return;
      }

      if (!isNumericPrice(trimmedSpecialPriceText)) {
        setError("特惠价只能填写数字，最多保留两位小数");
        return;
      }
    }

    const payload = {
      name: trimmedName,
      englishName: draft.englishName,
      summary: draft.summary || "请补充商品卖点",
      description: draft.description,
      priceText: draft.specialOfferEnabled ? "" : trimmedPriceText || "0",
      images: draft.images,
      specialOfferEnabled: draft.specialOfferEnabled,
      originalPriceText: draft.specialOfferEnabled ? trimmedOriginalPriceText : "",
      specialPriceText: draft.specialOfferEnabled ? trimmedSpecialPriceText : "",
      specialTag: draft.specialOfferEnabled ? draft.specialTag : "",
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await updateProduct(editingId, payload);
      } else {
        await createProduct(payload);
      }

      setEditingId(null);
      setDraft(null);
      setHint(null);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存商品失败");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSpecialOffer(enabled: boolean) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        specialOfferEnabled: enabled,
        priceText: enabled ? "" : prev.priceText || "0",
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{isMainCompany ? "全部商品列表" : "我的商品"}</CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索商品名称 / 创建人"
                className="w-[320px]"
              />
              <select
                value={creatorFilter}
                onChange={(event) => setCreatorFilter(event.target.value)}
                className="h-10 rounded-[6px] border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-orange-500"
              >
                <option value="all">全部创建人</option>
                {creatorOptions.map((ownerName) => (
                  <option key={ownerName} value={ownerName}>
                    {ownerName}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | ProductStatus)}
                className="h-10 rounded-[6px] border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-orange-500"
              >
                <option value="all">全部状态</option>
                <option value="draft">草稿</option>
                <option value="submitted">待审核</option>
                <option value="live">已上架</option>
                <option value="rejected">审核驳回</option>
                <option value="offline">已下架</option>
              </select>
              <Button onClick={openCreate} disabled={!accessToken || submitting}>
                新增产品
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {productsError ? <div className="text-sm text-red-300">{productsError}</div> : null}
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-orange-300" onClick={() => toggleSort("ownerName")}>
                      创建人
                      <span className="text-[10px] text-zinc-500">{getSortIndicator(sortKey, sortDirection, "ownerName")}</span>
                    </button>
                  </Th>
                  <Th>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-orange-300" onClick={() => toggleSort("price")}>
                      价格
                      <span className="text-[10px] text-zinc-500">{getSortIndicator(sortKey, sortDirection, "price")}</span>
                    </button>
                  </Th>
                  <Th>特价</Th>
                  <Th>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-orange-300" onClick={() => toggleSort("status")}>
                      状态
                      <span className="text-[10px] text-zinc-500">{getSortIndicator(sortKey, sortDirection, "status")}</span>
                    </button>
                  </Th>
                  <Th>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-orange-300" onClick={() => toggleSort("updatedAt")}>
                      更新时间
                      <span className="text-[10px] text-zinc-500">{getSortIndicator(sortKey, sortDirection, "updatedAt")}</span>
                    </button>
                  </Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {loading && !initialized ? (
                  <Tr>
                    <Td colSpan={7} className="py-10 text-center text-zinc-400">
                      正在加载商品...
                    </Td>
                  </Tr>
                ) : visibleProducts.length === 0 ? (
                  <Tr>
                    <Td colSpan={7} className="py-10 text-center text-zinc-400">
                      暂无商品
                    </Td>
                  </Tr>
                ) : (
                  visibleProducts.map((item) => (
                    <Tr key={item.id}>
                      <Td className="w-[360px] min-w-[360px]">
                        <div className="flex w-[360px] min-w-[360px] items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                            {item.images[0] ? (
                              <img src={item.images[0]} alt={item.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-zinc-100">{item.name}</div>
                            <div className="truncate text-xs text-zinc-500">{item.englishName}</div>
                            <div className="line-clamp-2 text-xs text-zinc-400">{item.summary}</div>
                            {item.rejectReason ? (
                              <div className="line-clamp-2 text-xs text-red-300">驳回原因：{item.rejectReason}</div>
                            ) : null}
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
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={submitting}
                            onClick={() => openEdit(item)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={submitting}
                            onClick={async () => {
                              setSubmitting(true);
                              try {
                                await removeProduct(item.id);
                                setError(null);
                              } catch (requestError) {
                                setError(requestError instanceof Error ? requestError.message : "删除商品失败");
                              } finally {
                                setSubmitting(false);
                              }
                            }}
                          >
                            删除
                          </Button>
                          {isMainCompany && item.status === "live" ? (
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={async () => {
                                setSubmitting(true);
                                try {
                                  await unpublishProduct(item.id);
                                  setError(null);
                                } catch (requestError) {
                                  setError(requestError instanceof Error ? requestError.message : "下架商品失败");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              下架
                            </Button>
                          ) : null}
                          {isMainCompany && (item.status === "draft" || item.status === "offline") ? (
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={async () => {
                                setSubmitting(true);
                                try {
                                  await publishProduct(item.id);
                                  setError(null);
                                } catch (requestError) {
                                  setError(requestError instanceof Error ? requestError.message : "上架商品失败");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              上架
                            </Button>
                          ) : null}
                          {!isMainCompany && (item.status === "draft" || item.status === "rejected") ? (
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={async () => {
                                setSubmitting(true);
                                try {
                                  await submitProduct(item.id);
                                  setError(null);
                                } catch (requestError) {
                                  setError(requestError instanceof Error ? requestError.message : "提交审核失败");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              提交审核
                            </Button>
                          ) : null}
                          {!isMainCompany && item.status === "submitted" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={submitting}
                              onClick={async () => {
                                setSubmitting(true);
                                try {
                                  await withdrawProductSubmission(item.id);
                                  setError(null);
                                } catch (requestError) {
                                  setError(requestError instanceof Error ? requestError.message : "撤销审核失败");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              撤销审核
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
          if (submitting) return;
          setEditingId(null);
          setDraft(null);
          setHint(null);
          setError(null);
        }}
        footer={
          draft ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={submitting}>
                取消
              </Button>
              <Button onClick={() => void saveDraft()} disabled={submitting}>
                {submitting ? "保存中..." : "保存"}
              </Button>
            </div>
          ) : null
        }
      >
        {!draft ? null : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品名称</div>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onBlur={() => void autofillEnglishName(draft.name)}
                disabled={submitting}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品英文名</div>
              <Input
                value={draft.englishName}
                onChange={(e) => setDraft({ ...draft, englishName: e.target.value })}
                placeholder="留空则自动生成"
                disabled={submitting}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">产品卖点</div>
              <Input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} disabled={submitting} />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">商品描述</div>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="补充商品详细说明"
                disabled={submitting}
              />
            </div>

            {!draft.specialOfferEnabled ? (
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">售价</div>
                <Input
                  value={draft.priceText}
                  onChange={(e) => setDraft({ ...draft, priceText: sanitizePriceInput(e.target.value) })}
                  placeholder="仅支持数字，最多两位小数"
                  disabled={submitting}
                />
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
                    disabled={submitting}
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
                      onChange={(e) => setDraft({ ...draft, originalPriceText: sanitizePriceInput(e.target.value) })}
                      placeholder="仅支持数字，最多两位小数"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">特惠价</div>
                    <Input
                      value={draft.specialPriceText}
                      onChange={(e) => setDraft({ ...draft, specialPriceText: sanitizePriceInput(e.target.value) })}
                      placeholder="仅支持数字，最多两位小数"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">特价标签</div>
                    <Input
                      value={draft.specialTag}
                      onChange={(e) => setDraft({ ...draft, specialTag: e.target.value })}
                      placeholder="如：限时特价"
                      disabled={submitting}
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
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={submitting || uploadingImages}>
                  {uploadingImages ? "上传中..." : "上传图片"}
                </Button>
              </div>
              <div className="text-xs text-zinc-400">图片会上传到 MinIO 的商品目录，排序后第一张图片会自动作为主图。</div>
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
                            disabled={submitting || uploadingImages}
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white/5 px-2 py-1 hover:bg-white/10"
                            onClick={() => moveImage(index, 1)}
                            disabled={submitting || uploadingImages}
                          >
                            下移
                          </button>
                          <button
                            type="button"
                            className="rounded bg-red-500/15 px-2 py-1 text-red-200 hover:bg-red-500/25"
                            onClick={() => removeImage(index)}
                            disabled={submitting || uploadingImages}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} disabled={submitting || uploadingImages} />
            </div>
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
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

function compareProducts(
  left: ProductItem,
  right: ProductItem,
  sortKey: ProductSortKey,
  sortDirection: ProductSortDirection,
) {
  const factor = sortDirection === "asc" ? 1 : -1;

  if (sortKey === "ownerName") {
    return left.ownerName.localeCompare(right.ownerName, "zh-CN") * factor;
  }

  if (sortKey === "price") {
    return (getComparablePrice(left) - getComparablePrice(right)) * factor;
  }

  if (sortKey === "status") {
    return (getStatusOrder(left.status) - getStatusOrder(right.status)) * factor;
  }

  return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * factor;
}

function getComparablePrice(item: ProductItem) {
  const rawPrice = item.specialOfferEnabled ? item.specialPriceText || item.originalPriceText || item.priceText : item.priceText;
  const normalized = Number.parseFloat((rawPrice || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
}

function getStatusOrder(status: ProductStatus) {
  if (status === "draft") return 1;
  if (status === "submitted") return 2;
  if (status === "rejected") return 3;
  if (status === "offline") return 4;
  return 5;
}

function getSortIndicator(
  currentKey: ProductSortKey,
  currentDirection: ProductSortDirection,
  targetKey: ProductSortKey,
) {
  if (currentKey !== targetKey) return "↕";
  return currentDirection === "asc" ? "↑" : "↓";
}

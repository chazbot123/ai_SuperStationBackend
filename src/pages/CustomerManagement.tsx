import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  createCustomerLead,
  getCustomerLead,
  listCustomerLeads,
  removeCustomerLead,
  updateCustomerLead,
  type CustomerLeadItem,
  type CustomerSourcePlatform,
} from "@/lib/customerManagement";
import { useAuthStore } from "@/store/authStore";

type CustomerLeadForm = {
  name: string;
  phoneNumber: string;
  address: string;
  remark: string;
  wechatId: string;
  platformName: string;
  sourcePlatform: CustomerSourcePlatform;
};

const sourcePlatformOptions: Array<{ value: CustomerSourcePlatform; label: string }> = [
  { value: "super_site", label: "超级站" },
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "video_channel", label: "视频号" },
  { value: "kuaishou", label: "快手" },
  { value: "gaode_map", label: "高德地图" },
];

const initialForm: CustomerLeadForm = {
  name: "",
  phoneNumber: "",
  address: "",
  remark: "",
  wechatId: "",
  platformName: "",
  sourcePlatform: "super_site",
};

function getSourcePlatformLabel(value: CustomerSourcePlatform) {
  return sourcePlatformOptions.find((item) => item.value === value)?.label ?? value;
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const lastItem = result[result.length - 1];
    if (typeof lastItem === "number" && page - lastItem > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }

  return result;
}

export default function CustomerManagement() {
  usePageMeta("客户管理");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user?.roleKey === "main_company";
  const [search, setSearch] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState<CustomerSourcePlatform | "all">("all");
  const [items, setItems] = useState<CustomerLeadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerLeadForm>(initialForm);

  const authorizationReady = useMemo(() => Boolean(accessToken), [accessToken]);

  const loadCustomerLeads = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      const response = await listCustomerLeads({
        accessToken,
        q: search,
        sourcePlatform,
        page,
        limit: 20,
      });
      setItems(response.items);
      setPagination(response.pagination);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载客户列表失败");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, sourcePlatform]);

  useEffect(() => {
    if (!authorizationReady || !canEdit) {
      setItems([]);
      return;
    }

    void loadCustomerLeads();
  }, [authorizationReady, canEdit, loadCustomerLeads]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    resetForm();
  };

  const loadLeadDetail = async (id: string) => {
    if (!accessToken) {
      setError("登录状态已失效");
      return;
    }

    try {
      setSubmitting(true);
      const detail = await getCustomerLead(accessToken, id);
      setForm({
        name: detail.name ?? "",
        phoneNumber: detail.phoneNumber ?? "",
        address: detail.address ?? "",
        remark: detail.remark ?? "",
        wechatId: detail.wechatId ?? "",
        platformName: detail.platformName ?? "",
        sourcePlatform: detail.sourcePlatform,
      });
      setEditingId(detail.id);
      setError(null);
      setModalOpen(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载客户详情失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!accessToken) {
      setError("登录状态已失效");
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await updateCustomerLead({
          accessToken,
          id: editingId,
          ...form,
        });
      } else {
        await createCustomerLead({
          accessToken,
          ...form,
        });
      }
      setModalOpen(false);
      resetForm();
      setError(null);
      await loadCustomerLeads();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存客户信息失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) {
      setError("登录状态已失效");
      return;
    }
    if (!window.confirm("确认删除这条客户信息吗？")) {
      return;
    }

    try {
      setSubmitting(true);
      await removeCustomerLead(accessToken, id);
      if (editingId === id) {
        setModalOpen(false);
        resetForm();
      }
      setError(null);
      await loadCustomerLeads();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除客户信息失败");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20))),
    [pagination.limit, pagination.total],
  );
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleExport = async () => {
    if (!accessToken) {
      setError("登录状态已失效");
      return;
    }

    try {
      setExporting(true);
      const pageSize = 100;
      const allItems: CustomerLeadItem[] = [];

      const firstPage = await listCustomerLeads({
        accessToken,
        q: search,
        sourcePlatform,
        page: 1,
        limit: pageSize,
      });
      allItems.push(...firstPage.items);

      const exportTotalPages = Math.max(
        1,
        Math.ceil((firstPage.pagination.total || 0) / pageSize),
      );

      for (let current = 2; current <= exportTotalPages; current += 1) {
        const response = await listCustomerLeads({
          accessToken,
          q: search,
          sourcePlatform,
          page: current,
          limit: pageSize,
        });
        allItems.push(...response.items);
      }

      const escapeCell = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;");

      const rows = allItems.map(
        (item) => `
          <tr>
            <td>${escapeCell(item.name?.trim() || "")}</td>
            <td>${escapeCell(item.phoneNumber?.trim() || "")}</td>
            <td>${escapeCell(item.address?.trim() || "")}</td>
            <td>${escapeCell(item.remark?.trim() || "")}</td>
            <td>${escapeCell(item.wechatId?.trim() || "")}</td>
            <td>${escapeCell(item.platformName?.trim() || "")}</td>
            <td>${escapeCell(getSourcePlatformLabel(item.sourcePlatform))}</td>
            <td>${escapeCell(new Date(item.updatedAt).toLocaleString("zh-CN"))}</td>
          </tr>`,
      ).join("");

      const content = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8" />
          </head>
          <body>
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>电话</th>
                  <th>地址</th>
                  <th>备注</th>
                  <th>微信号</th>
                  <th>平台名</th>
                  <th>平台来源</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </body>
        </html>`;

      const blob = new Blob(["\ufeff", content], {
        type: "application/vnd.ms-excel;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `客户管理-${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "导出 Excel 失败");
    } finally {
      setExporting(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问客户管理。该模块仅主公司可见。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>客户管理</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                用于统一收集 AI 获客和各大平台汇总的客户信息，当前已接通主公司后台的基础增删改查。
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => void handleExport()} disabled={loading || exporting}>
                {exporting ? "导出中..." : "导出 Excel"}
              </Button>
              <Button type="button" onClick={openCreateModal}>
                新增客户
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-zinc-300">搜索</span>
              <Input
                placeholder="搜索姓名、电话、地址、备注、微信号、平台名"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-300">平台来源</span>
              <Select
                value={sourcePlatform}
                onChange={(e) => {
                  setSourcePlatform(e.target.value as CustomerSourcePlatform | "all");
                  setPage(1);
                }}
              >
                <option value="all">全部平台</option>
                {sourcePlatformOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" className="w-full" onClick={() => void loadCustomerLeads()} disabled={loading}>
                {loading ? "加载中..." : "查询"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
            <span>当前客户数：{pagination.total}</span>
            <span>每页 {pagination.limit} 条</span>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <TableWrap className="mt-4">
            <Table>
              <thead>
                <Tr>
                  <Th className="whitespace-nowrap">姓名</Th>
                  <Th className="whitespace-nowrap">电话</Th>
                  <Th className="whitespace-nowrap">地址</Th>
                  <Th className="whitespace-nowrap">备注</Th>
                  <Th className="whitespace-nowrap">微信号</Th>
                  <Th className="whitespace-nowrap">平台名</Th>
                  <Th className="whitespace-nowrap">平台来源</Th>
                  <Th className="whitespace-nowrap">更新时间</Th>
                  <Th className="w-[96px]">操作</Th>
                </Tr>
              </thead>
              <tbody>
                {loading ? (
                  <Tr>
                    <Td colSpan={9} className="py-8 text-center text-zinc-400">
                      正在加载客户信息...
                    </Td>
                  </Tr>
                ) : items.length === 0 ? (
                  <Tr>
                    <Td colSpan={9} className="py-8 text-center text-zinc-400">
                      暂无客户信息
                    </Td>
                  </Tr>
                ) : (
                  items.map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.name?.trim() || "未填写"}</Td>
                      <Td>{item.phoneNumber?.trim() || "未填写"}</Td>
                      <Td className="max-w-[260px] truncate">{item.address?.trim() || "未填写"}</Td>
                      <Td className="max-w-[220px] truncate">{item.remark?.trim() || "未填写"}</Td>
                      <Td>{item.wechatId?.trim() || "未填写"}</Td>
                      <Td>{item.platformName?.trim() || "未填写"}</Td>
                      <Td>{getSourcePlatformLabel(item.sourcePlatform)}</Td>
                      <Td>{new Date(item.updatedAt).toLocaleString("zh-CN")}</Td>
                      <Td>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void loadLeadDetail(item.id)}>
                          编辑
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>

          <div className="mt-4 flex flex-col gap-3 text-sm text-zinc-400 md:flex-row md:items-center md:justify-between">
            <span>
              第 {pagination.page} / {totalPages} 页，共 {pagination.total} 条
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                上一页
              </Button>
              {pageNumbers.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-1 text-zinc-500">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    type="button"
                    variant={item === page ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setPage(item)}
                    disabled={loading}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={loading || page >= totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        title={editingId ? "编辑客户" : "新增客户"}
        onClose={closeModal}
        footerClassName="items-center justify-between gap-2"
        footer={
          <>
            {editingId ? (
              <Button type="button" variant="danger" onClick={() => void handleDelete(editingId)} disabled={submitting}>
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
                取消
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "保存中..." : "保存"}
              </Button>
            </div>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-zinc-300">姓名</span>
            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-zinc-300">电话</span>
            <Input
              value={form.phoneNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-zinc-300">地址</span>
            <Input
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-zinc-300">备注</span>
            <Input
              value={form.remark}
              onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-zinc-300">微信号</span>
            <Input value={form.wechatId} onChange={(e) => setForm((prev) => ({ ...prev, wechatId: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-zinc-300">平台名</span>
            <Input
              value={form.platformName}
              onChange={(e) => setForm((prev) => ({ ...prev, platformName: e.target.value }))}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-zinc-300">平台来源</span>
            <Select
              value={form.sourcePlatform}
              onChange={(e) => setForm((prev) => ({ ...prev, sourcePlatform: e.target.value as CustomerSourcePlatform }))}
            >
              {sourcePlatformOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Modal>
    </div>
  );
}

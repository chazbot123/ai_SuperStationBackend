import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  getKnowledgeDocument,
  listKnowledgeDocuments,
  removeKnowledgeDocument,
  searchKnowledgeRetrieval,
  uploadKnowledgeDocument,
  type KnowledgeDocumentItem,
  type KnowledgeRetrievalHitItem,
} from "@/lib/knowledge";
import { useAuthStore } from "@/store/authStore";

type KbStatus = "pending" | "indexing" | "ready" | "failed";

function statusBadge(status: KbStatus) {
  if (status === "pending") return <Badge variant="gray">待处理</Badge>;
  if (status === "ready") return <Badge variant="green">可用</Badge>;
  if (status === "indexing") return <Badge variant="amber">建索引中</Badge>;
  return <Badge variant="red">失败</Badge>;
}

function taskStatusBadge(status?: "pending" | "running" | "success" | "failed") {
  if (status === "success") return <Badge variant="green">成功</Badge>;
  if (status === "running") return <Badge variant="amber">执行中</Badge>;
  if (status === "failed") return <Badge variant="red">失败</Badge>;
  return <Badge variant="gray">待执行</Badge>;
}

function getFileCategory(fileExt: string) {
  const normalizedExt = fileExt.toLowerCase();
  if (normalizedExt === "pdf") {
    return { label: "PDF", variant: "red" as const };
  }
  if (normalizedExt === "docx") {
    return { label: "Word", variant: "blue" as const };
  }
  if (normalizedExt === "pptx") {
    return { label: "PPT", variant: "amber" as const };
  }
  if (normalizedExt === "txt" || normalizedExt === "md") {
    return { label: "文本", variant: "gray" as const };
  }
  if (["png", "jpg", "jpeg", "webp"].includes(normalizedExt)) {
    return { label: "图片", variant: "green" as const };
  }
  return { label: "其他", variant: "gray" as const };
}

function isImageFile(fileExt: string) {
  return ["png", "jpg", "jpeg", "webp"].includes(fileExt.toLowerCase());
}

export default function Assets() {
  usePageMeta("知识库管理");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user?.roleKey === "main_company";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | KbStatus>("all");
  const [documents, setDocuments] = useState<KnowledgeDocumentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<KnowledgeDocumentItem | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<KnowledgeDocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocumentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadScope, setUploadScope] = useState<"company" | "tenant" | "global">("company");
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [testQuestion, setTestQuestion] = useState("这套电热采暖系统适合哪些场景？");
  const [testing, setTesting] = useState(false);
  const [retrievalHits, setRetrievalHits] = useState<KnowledgeRetrievalHitItem[]>([]);
  const [testAnswer, setTestAnswer] = useState(
    "上传并索引 txt / md 文件后，可以在这里执行真实检索测试。"
  );

  async function handleUploadFile(file: File) {
    if (!accessToken) {
      return;
    }

    try {
      setUploading(true);
      setPageError("");
      const created = await uploadKnowledgeDocument({
        accessToken,
        file,
        title: uploadTitle,
        scope: uploadScope,
      });
      setUploadTitle("");
      setSelectedFile(null);
      setSelectedId(created.id);
      await loadDocuments();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "上传知识文件失败");
    } finally {
      setUploading(false);
    }
  }

  const loadDocuments = useCallback(
    async (showLoading = true) => {
      if (!accessToken) {
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        }
        setPageError("");
        const next = await listKnowledgeDocuments({
          accessToken,
          q: search,
          indexStatus: status === "all" ? undefined : status,
          page: 1,
          limit: 20,
        });
        setDocuments(next.items);
        setPagination(next.pagination);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "加载知识库失败");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [accessToken, search, status]
  );

  const loadSelectedDocument = useCallback(
    async (id: string, showLoading = true) => {
      if (!accessToken) {
        return;
      }

      try {
        if (showLoading) {
          setSelectedLoading(true);
        }
        const next = await getKnowledgeDocument(accessToken, id);
        setSelected(next);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "加载文档详情失败");
      } finally {
        if (showLoading) {
          setSelectedLoading(false);
        }
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (!canEdit || !accessToken) {
      return;
    }

    void loadDocuments();
  }, [accessToken, canEdit, loadDocuments]);

  useEffect(() => {
    if (!selectedId || !accessToken) {
      setSelected(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setSelectedLoading(true);
        const next = await getKnowledgeDocument(accessToken, selectedId);
        if (!cancelled) {
          setSelected(next);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "加载文档详情失败");
        }
      } finally {
        if (!cancelled) {
          setSelectedLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId]);

  const hasActiveTasks = useMemo(
    () =>
      documents.some(
        (item) =>
          item.indexStatus === "pending" ||
          item.indexStatus === "indexing" ||
          item.jobs.some((job) => job.status === "pending" || job.status === "running")
      ),
    [documents]
  );

  useEffect(() => {
    if (!accessToken || !canEdit || !hasActiveTasks) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDocuments(false);
      if (selectedId) {
        void loadSelectedDocument(selectedId, false);
      }
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [accessToken, canEdit, hasActiveTasks, loadDocuments, loadSelectedDocument, selectedId]);

  const totalChunks = useMemo(
    () => documents.reduce((sum, item) => sum + item.chunkCount, 0),
    [documents]
  );

  const handleDeleteDocument = useCallback((document: KnowledgeDocumentItem) => {
    setDeleteTarget(document);
  }, []);

  const confirmDeleteDocument = useCallback(
    async (document: KnowledgeDocumentItem) => {
      if (!accessToken) {
        return;
      }

      try {
        setDeletingId(document.id);
        setPageError("");
        await removeKnowledgeDocument(accessToken, document.id);
        setDocuments((current) => current.filter((item) => item.id !== document.id));
        setPagination((current) => ({
          ...current,
          total: Math.max(0, current.total - 1),
        }));
        if (selectedId === document.id) {
          setSelectedId(null);
          setSelected(null);
        }
        if (previewDocument?.id === document.id) {
          setPreviewDocument(null);
        }
        setDeleteTarget(null);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "删除知识文件失败");
      } finally {
        setDeletingId(null);
      }
    },
    [accessToken, previewDocument?.id, selectedId]
  );

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问知识库管理。该模块仅主公司可见。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>知识库管理</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                当前切片策略已调整为先走文字模型智能切片，失败后再回退到适配手册、文档、公司简章等长文资料的固定切片。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="gray">pgvector</Badge>
              <Button variant="secondary" disabled>
                重建索引
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <div className="space-y-3">
                <div className="text-xs font-medium text-zinc-300">上传知识文件</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.8fr_1fr]">
                  <label className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-orange-600/80 bg-orange-600 px-4 text-sm font-normal text-white transition-colors duration-150 hover:bg-orange-500 active:bg-orange-700">
                    <input
                      type="file"
                      accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      disabled={uploading || !accessToken}
                      onChange={async (event) => {
                        const file = event.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        if (file) {
                          await handleUploadFile(file);
                        }
                        event.target.value = "";
                      }}
                    />
                    <Upload className="h-4 w-4 shrink-0" />
                    <span>{uploading ? "上传中..." : "选择并上传文件"}</span>
                  </label>
                  <Select
                    value={uploadScope}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "company" || next === "tenant" || next === "global") {
                        setUploadScope(next);
                      }
                    }}
                  >
                    <option value="company">公司知识库</option>
                    <option value="tenant">租户知识库</option>
                    <option value="global">全局知识库</option>
                  </Select>
                  <Input
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    placeholder="可选标题，不填默认取文件名"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>支持 `pdf / docx / pptx / txt / md / png / jpg / jpeg / webp`</span>
                  {selectedFile ? <span>当前文件：{selectedFile.name}</span> : null}
                </div>
              </div>
            </div>
            <div className="xl:col-span-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-zinc-400">知识文件数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{pagination.total}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-zinc-400">切片总数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{totalChunks}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>知识文件列表</CardTitle>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索文件名" />
                <Select
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "all" || next === "pending" || next === "ready" || next === "indexing" || next === "failed") {
                      setStatus(next);
                    }
                  }}
                >
                  <option value="all">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="ready">可用</option>
                  <option value="indexing">建索引中</option>
                  <option value="failed">失败</option>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table className="table-fixed">
                <thead>
                  <tr>
                    <Th className="w-[28%]">文件名</Th>
                    <Th className="w-[10%]">类型</Th>
                    <Th className="w-[8%]">切片数</Th>
                    <Th className="w-[16%]">任务状态</Th>
                    <Th className="w-[18%]">更新时间</Th>
                    <Th className="w-[8%]">状态</Th>
                    <Th className="w-[12%] text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <Tr>
                      <Td colSpan={7} className="py-8 text-center text-zinc-400">
                        正在加载知识文件...
                      </Td>
                    </Tr>
                  ) : documents.length === 0 ? (
                    <Tr>
                      <Td colSpan={7} className="py-8 text-center text-zinc-400">
                        当前筛选条件下暂无知识文件
                      </Td>
                    </Tr>
                  ) : (
                    documents.map((item) => {
                      const latestJob = item.jobs[0];
                      const fileCategory = getFileCategory(item.fileExt);
                      const imageFile = isImageFile(item.fileExt);

                      return (
                        <Tr key={item.id}>
                          <Td className="font-medium text-zinc-100">
                            <div className="truncate" title={item.title}>
                              {item.title}
                            </div>
                          </Td>
                          <Td>
                            <div className="space-y-1">
                              <div>
                                <Badge variant={fileCategory.variant}>{fileCategory.label}</Badge>
                              </div>
                              <div className="text-xs uppercase text-zinc-500">{item.fileExt}</div>
                            </div>
                          </Td>
                          <Td className="text-zinc-400">{item.chunkCount || 0}</Td>
                          <Td>
                            <div className="space-y-1">
                              {taskStatusBadge(latestJob?.status)}
                              <div className="text-xs text-zinc-500">
                                {latestJob ? `${latestJob.jobType}` : "暂无任务"}
                              </div>
                            </div>
                          </Td>
                          <Td className="text-zinc-400">{new Date(item.updatedAt).toLocaleString()}</Td>
                          <Td>{statusBadge(item.indexStatus)}</Td>
                          <Td className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {imageFile && item.storageUrl ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPreviewDocument(item)}
                                >
                                  预览
                                </Button>
                              ) : null}
                              <Button size="sm" variant="secondary" onClick={() => setSelectedId(item.id)}>
                                详情
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={deletingId === item.id}
                                onClick={() => handleDeleteDocument(item)}
                              >
                                {deletingId === item.id ? "删除中..." : "删除"}
                              </Button>
                            </div>
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

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>检索测试台</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-zinc-400">
              当前已接入真实检索接口。现阶段优先支持 `txt / md` 文档建立索引并返回命中片段。
            </div>
            <Input value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} />
            <div className="flex gap-2">
              <Button
                disabled={testing}
                onClick={async () => {
                  if (!accessToken) {
                    return;
                  }

                  try {
                    setTesting(true);
                    setPageError("");
                    const result = await searchKnowledgeRetrieval({
                      accessToken,
                      query: testQuestion,
                      scope: "company",
                      topK: 5,
                    });
                    setRetrievalHits(result.hits);
                    setTestAnswer(result.answer);
                  } catch (error) {
                    setPageError(error instanceof Error ? error.message : "执行检索失败");
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "检索中..." : "执行测试"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRetrievalHits([]);
                  setTestAnswer("上传并索引 txt / md 文件后，可以在这里执行真实检索测试。");
                }}
              >
                清空结果
              </Button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs font-medium text-zinc-300">召回片段</div>
              <div className="mt-2 space-y-2 text-sm text-zinc-300">
                {retrievalHits.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-zinc-500">
                    暂无检索结果
                  </div>
                ) : (
                  retrievalHits.map((hit, index) => (
                    <div key={hit.chunkId} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-500">
                        <span>片段 {index + 1} · {hit.documentTitle}</span>
                        <span>命中 {Math.max(0, Math.round(hit.score * 100))}%</span>
                      </div>
                      <div>{hit.snippet}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs font-medium text-zinc-300">最终回答</div>
              <div className="mt-2 text-sm leading-6 text-zinc-200">{testAnswer}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Drawer
        open={!!selected}
        title={selected ? `文件详情：${selected.title}` : "文件详情"}
        onClose={() => {
          setSelectedId(null);
          setSelected(null);
        }}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled>
                重新切片
              </Button>
              <Button
                variant="danger"
                disabled={deletingId === selected.id}
                onClick={() => handleDeleteDocument(selected)}
              >
                {deletingId === selected.id ? "删除中..." : "删除文档"}
              </Button>
              <Button disabled>重新索引</Button>
            </div>
          ) : null
        }
      >
        {selectedLoading ? (
          <div className="text-sm text-zinc-400">正在加载文档详情...</div>
        ) : !selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">文件名</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.fileName}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                <div className="flex h-10 items-center">{statusBadge(selected.indexStatus)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">文件类型</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  <div className="flex items-center gap-2">
                    <Badge variant={getFileCategory(selected.fileExt).variant}>
                      {getFileCategory(selected.fileExt).label}
                    </Badge>
                    <span className="uppercase">{selected.fileExt}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">切片数量</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.chunkCount}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">作用域</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.scope}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">更新时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {new Date(selected.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {isImageFile(selected.fileExt) && selected.storageUrl ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-zinc-300">图片预览</div>
                  <Button size="sm" variant="secondary" onClick={() => setPreviewDocument(selected)}>
                    打开预览
                  </Button>
                </div>
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-xl border border-white/10 bg-black/20"
                  onClick={() => setPreviewDocument(selected)}
                >
                  <img
                    src={selected.storageUrl}
                    alt={selected.title}
                    className="h-56 w-full object-contain bg-black"
                  />
                </button>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              <div className="text-xs font-medium text-zinc-300">文档摘要</div>
              <div className="mt-2 text-zinc-400">
                {selected.summary?.trim() || "当前还没有摘要，等解析与切片链路接上后会在这里展示。"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              <div className="text-xs font-medium text-zinc-300">最近任务</div>
              <div className="mt-2 space-y-2 text-zinc-400">
                {selected.jobs.length === 0 ? (
                  <div>暂无任务记录</div>
                ) : (
                  selected.jobs.map((job) => (
                    <div key={job.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span>{job.jobType}</span>
                        <span>{job.status}</span>
                      </div>
                      {job.errorMessage ? <div className="mt-1 text-rose-300">{job.errorMessage}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-zinc-300">切片详情</div>
                <div className="text-xs text-zinc-500">
                  共 {selected.chunks?.length ?? 0} 片
                </div>
              </div>
              <div className="mt-3 space-y-3 text-zinc-400">
                {!selected.chunks || selected.chunks.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    当前文档还没有切片数据
                  </div>
                ) : (
                  selected.chunks.map((chunk) => (
                    <div key={chunk.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>切片 {chunk.chunkIndex + 1}</span>
                        <span>{chunk.charCount} 字</span>
                        {chunk.tokenCount ? <span>{chunk.tokenCount} tokens</span> : null}
                        {chunk.pageNumber ? <span>第 {chunk.pageNumber} 页</span> : null}
                        <span>{chunk.embeddingModel}</span>
                      </div>
                      {chunk.sectionTitle ? (
                        <div className="mb-2 text-xs text-zinc-300">章节：{chunk.sectionTitle}</div>
                      ) : null}
                      {chunk.keywords.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {chunk.keywords.map((keyword) => (
                            <Badge key={`${chunk.id}-${keyword}`} variant="gray">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
                        {chunk.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              <div className="text-xs font-medium text-zinc-300">当前说明</div>
              <div className="mt-2 space-y-2 text-zinc-400">
                <div>1. 当前已接通知识文件上传、列表、详情和删除。</div>
                <div>2. 当前切片会先走文字模型智能切片，再回退到面向手册、文档、公司简章、FAQ、流程资料的固定切片。</div>
                <div>3. AI 客服当前可直接复用这里的知识片段召回结果。</div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!previewDocument}
        title={previewDocument ? `图片预览：${previewDocument.title}` : "图片预览"}
        onClose={() => setPreviewDocument(null)}
      >
        {previewDocument?.storageUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-2">
              <img
                src={previewDocument.storageUrl}
                alt={previewDocument.title}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="text-xs text-zinc-400">{previewDocument.fileName}</div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="确认删除知识文件"
        onClose={() => {
          if (!deletingId) {
            setDeleteTarget(null);
          }
        }}
        footer={
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={!!deletingId}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={!deleteTarget || !!deletingId}
              onClick={() => {
                if (deleteTarget) {
                  void confirmDeleteDocument(deleteTarget);
                }
              }}
            >
              {deletingId ? "删除中..." : "确认删除"}
            </Button>
          </div>
        }
      >
        {deleteTarget ? (
          <div className="space-y-3 text-sm text-zinc-300">
            <div>删除后将移除该知识文件、切片和索引记录。</div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-xs text-zinc-500">文件标题</div>
              <div className="mt-1 break-all text-zinc-100">{deleteTarget.title}</div>
            </div>
          </div>
        ) : null}
      </Modal>

      {pageError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {pageError}
        </div>
      ) : null}
    </div>
  );
}

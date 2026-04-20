import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";

type KbStatus = "ready" | "indexing" | "failed";

type KbFile = {
  id: string;
  name: string;
  type: "pdf" | "docx" | "md" | "txt";
  chunks: number;
  updatedAt: string;
  status: KbStatus;
};

const seedFiles: KbFile[] = [
  { id: "kb_001", name: "产品常见问答.pdf", type: "pdf", chunks: 42, updatedAt: "2026-04-16 16:20", status: "ready" },
  { id: "kb_002", name: "招商合作话术.docx", type: "docx", chunks: 18, updatedAt: "2026-04-16 18:10", status: "ready" },
  { id: "kb_003", name: "安装说明.txt", type: "txt", chunks: 7, updatedAt: "2026-04-17 09:32", status: "indexing" },
];

function statusBadge(status: KbStatus) {
  if (status === "ready") return <Badge variant="green">可用</Badge>;
  if (status === "indexing") return <Badge variant="amber">建索引中</Badge>;
  return <Badge variant="red">失败</Badge>;
}

export default function Assets() {
  usePageMeta("知识库管理");

  const user = useAuthStore((s) => s.user);
  const canEdit = user?.roleKey === "main_company";
  const [folderPath, setFolderPath] = useState("D:\\customer-demo\\kb");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | KbStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(seedFiles[0]?.id ?? null);
  const [testQuestion, setTestQuestion] = useState("这套电热采暖系统适合哪些场景？");
  const [testing, setTesting] = useState(false);
  const [testAnswer, setTestAnswer] = useState(
    "适用于家庭采暖、部分商业空间和关注节能改造的项目场景。最终答复将由本地知识库目录完成召回后生成。"
  );

  const files = useMemo(() => {
    const query = search.trim().toLowerCase();
    return seedFiles.filter((item) => {
      const hitStatus = status === "all" ? true : item.status === status;
      const hitQuery = query ? item.name.toLowerCase().includes(query) : true;
      return hitStatus && hitQuery;
    });
  }, [search, status]);

  const selected = seedFiles.find((item) => item.id === selectedId) ?? null;

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
                当前版本只支持绑定本地知识库文件夹做 RAG 检索，后续前台 AI 客服将直接对接这里的索引结果。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="gray">本地目录模式</Badge>
              <Button variant="secondary">重建索引</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-300">知识库目录</div>
                <div className="flex gap-2">
                  <Input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
                  <Button>绑定目录</Button>
                </div>
              </div>
            </div>
            <div className="xl:col-span-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-zinc-400">知识文件数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">{seedFiles.length}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-zinc-400">切片总数</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-100">
                    {seedFiles.reduce((sum, item) => sum + item.chunks, 0)}
                  </div>
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
                    if (next === "all" || next === "ready" || next === "indexing" || next === "failed") {
                      setStatus(next);
                    }
                  }}
                >
                  <option value="all">全部状态</option>
                  <option value="ready">可用</option>
                  <option value="indexing">建索引中</option>
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
                    <Th>文件名</Th>
                    <Th>类型</Th>
                    <Th>切片数</Th>
                    <Th>更新时间</Th>
                    <Th>状态</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {files.length === 0 ? (
                    <Tr>
                      <Td colSpan={6} className="py-8 text-center text-zinc-400">
                        当前筛选条件下暂无知识文件
                      </Td>
                    </Tr>
                  ) : (
                    files.map((item) => (
                      <Tr key={item.id}>
                        <Td className="font-medium text-zinc-100">{item.name}</Td>
                        <Td className="uppercase text-zinc-400">{item.type}</Td>
                        <Td className="text-zinc-400">{item.chunks}</Td>
                        <Td className="text-zinc-400">{item.updatedAt}</Td>
                        <Td>{statusBadge(item.status)}</Td>
                        <Td className="text-right">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedId(item.id)}>
                            查看
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

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>检索测试台</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-zinc-400">
              用于模拟 `POST /api/admin/kb/:id/test-query`。后续对接真实 RAG 服务后，这里会展示召回片段和最终回答。
            </div>
            <Input value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} />
            <div className="flex gap-2">
              <Button
                disabled={testing}
                onClick={() => {
                  setTesting(true);
                  window.setTimeout(() => {
                    setTesting(false);
                    setTestAnswer(
                      "已根据本地知识库目录召回 3 个片段，优先命中《产品常见问答.pdf》和《招商合作话术.docx》。该答案仅为 Demo 展示。"
                    );
                  }, 700);
                }}
              >
                {testing ? "检索中..." : "执行测试"}
              </Button>
              <Button variant="secondary">清空结果</Button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs font-medium text-zinc-300">召回片段</div>
              <div className="mt-2 space-y-2 text-sm text-zinc-300">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">片段 1：电热采暖系统适合家庭、办公室和改造型项目。</div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">片段 2：招商场景建议突出节能、安装便捷和合作支持。</div>
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
        title={selected ? `文件详情：${selected.name}` : "文件详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary">重新切片</Button>
              <Button>重新索引</Button>
            </div>
          ) : null
        }
      >
        {!selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">文件名</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.name}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                <div className="flex h-10 items-center">{statusBadge(selected.status)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">文件类型</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm uppercase text-zinc-200">{selected.type}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">切片数量</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{selected.chunks}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              说明：
              <div className="mt-2 space-y-2 text-zinc-400">
                <div>1. 当前版本仅支持本地知识库目录，不做网页抓取和 OCR 入库。</div>
                <div>2. 前台 AI 客服只支持文字交流，命中失败时可进入 FIFO 转人工队列。</div>
                <div>3. 该文件详情页后续将对接真实索引状态、切片预览和来源路径。</div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

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
import { useDataStore } from "@/store/dataStore";
import type { KeywordReviewStatus } from "@/types/demo";
import { validateKeywordsAgainstRule } from "@/utils/keywordValidation";

function statusBadge(status: KeywordReviewStatus) {
  if (status === "submitted") return <Badge variant="amber">待审核</Badge>;
  if (status === "approved") return <Badge variant="green">通过</Badge>;
  if (status === "rejected") return <Badge variant="red">驳回</Badge>;
  return <Badge variant="gray">草稿</Badge>;
}

export default function KeywordReviews() {
  usePageMeta("关键词规则/审核");
  const user = useAuthStore((s) => s.user);
  const agents = useDataStore((s) => s.agents);
  const rules = useDataStore((s) => s.rules);
  const submissions = useDataStore((s) => s.submissions);
  const items = useDataStore((s) => s.items);
  const createSubmission = useDataStore((s) => s.createSubmission);
  const reviewSubmission = useDataStore((s) => s.reviewSubmission);

  const isReviewer = user?.roleKey === "main_company";
  const isAgent = user?.roleKey === "level1_agent";

  const [filterStatus, setFilterStatus] = useState<"all" | KeywordReviewStatus>("all");
  const [filterAgentId, setFilterAgentId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [agentInput, setAgentInput] = useState("AI网站搭建\n企业AI官网\n智能建站系统\nAI后台管理");
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentOk, setAgentOk] = useState<string | null>(null);

  const visibleSubmissions = useMemo(() => {
    let list = submissions;
    if (isAgent && user?.agentId) list = list.filter((s) => s.agentId === user.agentId);
    if (filterStatus !== "all") list = list.filter((s) => s.status === filterStatus);
    if (filterAgentId !== "all") list = list.filter((s) => s.agentId === filterAgentId);
    return list;
  }, [filterAgentId, filterStatus, isAgent, submissions, user?.agentId]);

  const selected = submissions.find((s) => s.id === selectedId) ?? null;
  const selectedAgent = selected ? agents.find((a) => a.id === selected.agentId) ?? null : null;
  const selectedRule = selectedAgent ? rules.find((r) => r.id === selectedAgent.ruleId) ?? null : null;
  const selectedKeywords = selected ? items.filter((it) => it.submissionId === selected.id) : [];

  const agentSelf = isAgent && user?.agentId ? agents.find((a) => a.id === user.agentId) ?? null : null;
  const agentRule = agentSelf ? rules.find((r) => r.id === agentSelf.ruleId) ?? null : null;

  return (
    <div className="space-y-4">
      {isAgent ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>提交关键词（一级代理）</CardTitle>
              {agentRule ? <Badge variant="gray">规则：{agentRule.name}</Badge> : <Badge variant="red">未分配规则</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm text-zinc-200">每行一个关键词（支持粘贴）。</div>
              <textarea
                value={agentInput}
                onChange={(e) => {
                  setAgentInput(e.target.value);
                  setAgentError(null);
                  setAgentOk(null);
                }}
                className="h-36 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
              />

              {agentError ? (
                <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {agentError}
                </div>
              ) : null}
              {agentOk ? (
                <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {agentOk}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  disabled={!agentSelf || agentSelf.status !== "active" || !agentRule}
                  onClick={() => {
                    if (!agentSelf || !agentRule) {
                      setAgentError("未分配规则，无法提交");
                      return;
                    }
                    const raw = agentInput.split(/\r?\n/);
                    const res = validateKeywordsAgainstRule(raw, agentRule);
                    if (res.errors.length) {
                      setAgentError(res.errors[0].message);
                      return;
                    }
                    createSubmission(agentSelf.id, res.keywords);
                    setAgentOk("已提交，等待后台审核");
                    setAgentError(null);
                    setAgentInput("");
                  }}
                >
                  提交审核
                </Button>
              </div>

              <div className="text-xs text-zinc-400">Demo占位：可在此扩展 CSV 导入、提交频率限制与本地预校验提示。</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>审核队列</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Select
                value={filterStatus}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "all" || next === "draft" || next === "submitted" || next === "approved" || next === "rejected") {
                    setFilterStatus(next);
                  }
                }}
              >
                <option value="all">全部状态</option>
                <option value="submitted">待审核</option>
                <option value="approved">通过</option>
                <option value="rejected">驳回</option>
              </Select>
              <Select value={filterAgentId} onChange={(e) => setFilterAgentId(e.target.value)}>
                <option value="all">全部代理</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>提交ID</Th>
                  <Th>代理</Th>
                  <Th>关键词数</Th>
                  <Th>提交时间</Th>
                  <Th>状态</Th>
                  <Th className="text-right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {visibleSubmissions.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-8 text-center text-zinc-400">
                      暂无数据
                    </Td>
                  </Tr>
                ) : (
                  visibleSubmissions.map((s) => {
                    const a = agents.find((x) => x.id === s.agentId);
                    const count = items.filter((it) => it.submissionId === s.id).length;
                    return (
                      <Tr key={s.id}>
                        <Td className="font-medium">{s.displayId}</Td>
                        <Td className="text-zinc-300">{a ? `${a.code} ${a.name}` : "-"}</Td>
                        <Td className="text-zinc-400">{count}</Td>
                        <Td className="text-zinc-400">{new Date(s.createdAt).toLocaleString()}</Td>
                        <Td>{statusBadge(s.status)}</Td>
                        <Td className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedId(s.id);
                              setRejectReason(s.rejectReason ?? "");
                            }}
                          >
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

      <Drawer
        open={!!selected}
        title={selected ? `提交详情 ${selected.displayId}` : "提交详情"}
        onClose={() => setSelectedId(null)}
        footer={
          selected && isReviewer ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const res = reviewSubmission(selected.id, "approved");
                  if (!res.ok) return;
                  setSelectedId(null);
                }}
                disabled={selected.status !== "submitted"}
              >
                通过
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const res = reviewSubmission(selected.id, "rejected", rejectReason);
                  if (!res.ok) return;
                  setSelectedId(null);
                }}
                disabled={selected.status !== "submitted"}
              >
                驳回
              </Button>
            </div>
          ) : null
        }
        widthClassName="max-w-2xl"
      >
        {!selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">代理</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {selectedAgent ? `${selectedAgent.code} ${selectedAgent.name}` : "-"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">状态</div>
                <div className="flex h-10 items-center">{statusBadge(selected.status)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">提交时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {new Date(selected.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">审核时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : "-"}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>规则摘要</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedRule ? (
                  <div className="text-sm text-zinc-300">该代理未分配规则。</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 text-sm text-zinc-200 md:grid-cols-2">
                    <div>数量：{selectedRule.minCount ?? "-"} ~ {selectedRule.maxCount ?? "-"}</div>
                    <div>长度：{selectedRule.minLen ?? "-"} ~ {selectedRule.maxLen ?? "-"}</div>
                    <div>去重：{selectedRule.dedupeRequired ? "是" : "否"}</div>
                    <div>敏感词拦截：{selectedRule.sensitiveFilterEnabled ? "启用" : "关闭"}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>关键词清单</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedKeywords.length === 0 ? (
                    <div className="text-sm text-zinc-300">无关键词。</div>
                  ) : (
                    selectedKeywords.map((k) => (
                      <span key={k.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-200">
                        {k.keyword}
                      </span>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {isReviewer ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-300">驳回原因（驳回时必填）</div>
                <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="请填写驳回原因" />
                <div className="text-xs text-zinc-400">Demo占位：此处可扩展复审、操作日志与通知。</div>
              </div>
            ) : selected.status === "rejected" ? (
              <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                驳回原因：{selected.rejectReason ?? "-"}
              </div>
            ) : null}
          </div>
        )}
      </Drawer>
    </div>
  );
}

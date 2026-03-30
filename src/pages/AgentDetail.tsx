import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const agents = useDataStore((s) => s.agents);
  const rules = useDataStore((s) => s.rules);
  const submissions = useDataStore((s) => s.submissions);
  const updateAgent = useDataStore((s) => s.updateAgent);

  const canEdit = user?.roleKey === "super_admin" || user?.roleKey === "operator";
  const agent = agents.find((a) => a.id === id);

  usePageMeta(agent ? `代理详情 - ${agent.code}` : "代理详情");

  const [tab, setTab] = useState("basic");
  const [nameDraft, setNameDraft] = useState(agent?.name ?? "");
  const [ruleDraft, setRuleDraft] = useState(agent?.ruleId ?? "");

  const agentSubs = useMemo(() => {
    if (!agent) return [];
    return submissions.filter((s) => s.agentId === agent.id);
  }, [agent, submissions]);

  if (!agent) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-zinc-300">代理不存在或已被删除。</div>
        <Button variant="secondary" onClick={() => navigate("/agents")}>
          返回列表
        </Button>
      </div>
    );
  }

  const assignedRule = rules.find((r) => r.id === agent.ruleId) ?? null;

  const tabs = [
    { key: "basic", label: "基本信息" },
    { key: "account", label: "账号绑定" },
    { key: "rule", label: "规则分配" },
    { key: "submissions", label: "提交概览" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-zinc-100">{agent.name}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-300">
            <span>{agent.code}</span>
            {agent.status === "active" ? <Badge variant="green">启用</Badge> : <Badge variant="red">停用</Badge>}
            <span className="text-zinc-400">·</span>
            <span>规则：{assignedRule?.name ?? "未分配"}</span>
          </div>
        </div>
        <Link to="/agents">
          <Button variant="secondary">返回</Button>
        </Link>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "basic" ? (
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">代理编号</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {agent.code}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">创建时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {new Date(agent.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-zinc-300">代理名称</div>
                <div className="flex gap-2">
                  <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={!canEdit} />
                  <Button
                    variant="primary"
                    disabled={!canEdit}
                    onClick={() => updateAgent(agent.id, { name: nameDraft.trim() || agent.name })}
                  >
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "account" ? (
        <Card>
          <CardHeader>
            <CardTitle>账号绑定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              Demo占位：此处可实现“绑定/重置密码/停用代理账号”。当前Demo使用登录页预置账号模拟。
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "rule" ? (
        <Card>
          <CardHeader>
            <CardTitle>规则分配</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">当前规则</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {assignedRule?.name ?? "未分配"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">选择新规则</div>
                <div className="flex gap-2">
                  <Select value={ruleDraft} onChange={(e) => setRuleDraft(e.target.value)} disabled={!canEdit}>
                    <option value="">不分配</option>
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={!canEdit}
                    onClick={() => updateAgent(agent.id, { ruleId: ruleDraft ? ruleDraft : null })}
                  >
                    生效
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-400">Demo占位：可在此展示规则变更记录与生效范围提示。</div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "submissions" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>该代理提交</CardTitle>
              <Link to="/keyword-reviews">
                <Button size="sm" variant="secondary">
                  打开审核页面
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>提交ID</Th>
                    <Th>时间</Th>
                    <Th>状态</Th>
                    <Th>原因</Th>
                  </tr>
                </thead>
                <tbody>
                  {agentSubs.length === 0 ? (
                    <Tr>
                      <Td colSpan={4} className="py-8 text-center text-zinc-400">
                        暂无提交
                      </Td>
                    </Tr>
                  ) : (
                    agentSubs.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-medium">{s.displayId}</Td>
                        <Td className="text-zinc-400">{new Date(s.createdAt).toLocaleString()}</Td>
                        <Td>
                          {s.status === "submitted" ? (
                            <Badge variant="amber">待审核</Badge>
                          ) : s.status === "approved" ? (
                            <Badge variant="green">通过</Badge>
                          ) : s.status === "rejected" ? (
                            <Badge variant="red">驳回</Badge>
                          ) : (
                            <Badge variant="gray">草稿</Badge>
                          )}
                        </Td>
                        <Td className="text-zinc-400">{s.rejectReason ?? "-"}</Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

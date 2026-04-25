import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { requestJson } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type AgentStatus = "active" | "disabled";

type AgentItem = {
  id: string;
  code: string;
  name: string;
  status: AgentStatus;
  ruleId: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

type RuleItem = {
  id: string;
  name: string;
};

type ListAgentsResponse = {
  items: AgentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type ListRulesResponse = {
  items: RuleItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

const initialForm = {
  code: "",
  name: "",
  ruleId: "",
};

export default function Agents() {
  usePageMeta("一级代理管理");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user?.roleKey === "main_company";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | AgentStatus>("all");
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  const authorizationHeaders = useMemo(
    () =>
      accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : undefined,
    [accessToken]
  );

  const loadAgents = async () => {
    if (!authorizationHeaders) {
      setAgents([]);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      const trimmedQuery = q.trim();

      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      if (status !== "all") {
        params.set("status", status);
      }

      const response = await requestJson<ListAgentsResponse>(`/api/agents?${params.toString()}`, {
        headers: authorizationHeaders,
      });
      setAgents(response.items);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载代理失败");
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    if (!authorizationHeaders) {
      setRules([]);
      return;
    }

    try {
      const response = await requestJson<ListRulesResponse>("/api/rules?page=1&limit=100", {
        headers: authorizationHeaders,
      });
      setRules(response.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载规则失败");
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setAgents([]);
      setRules([]);
      return;
    }

    void loadAgents();
    void loadRules();
  }, [accessToken]);

  const createAgent = async () => {
    if (!authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    setSubmitting(true);

    try {
      await requestJson<AgentItem>("/api/agents", {
        method: "POST",
        headers: {
          ...authorizationHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          ruleId: form.ruleId || undefined,
        }),
      });

      setForm(initialForm);
      setOpen(false);
      setError(null);
      await loadAgents();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建代理失败");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAgent = async (id: string, patch: { status?: AgentStatus }) => {
    if (!authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    setSubmitting(true);

    try {
      await requestJson<AgentItem>(`/api/agents/${id}`, {
        method: "PATCH",
        headers: {
          ...authorizationHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      setError(null);
      await loadAgents();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新代理失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <div className="w-full md:w-[260px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索代理编号/名称" />
          </div>
          <div className="w-full md:w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "all" || next === "active" || next === "disabled") {
                  setStatus(next);
                }
              }}
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </Select>
          </div>
          <Button variant="secondary" onClick={() => void loadAgents()} disabled={loading || !authorizationHeaders}>
            {loading ? "加载中..." : "搜索"}
          </Button>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)} disabled={!canEdit || submitting}>
          创建一级代理
        </Button>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>编号</Th>
              <Th>名称</Th>
              <Th>状态</Th>
              <Th>分配规则</Th>
              <Th>绑定账号</Th>
              <Th>创建时间</Th>
              <Th className="text-right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <Tr>
                <Td colSpan={7} className="py-8 text-center text-zinc-400">
                  {loading ? "加载中..." : "暂无数据"}
                </Td>
              </Tr>
            ) : (
              agents.map((agent) => {
                const rule = rules.find((item) => item.id === agent.ruleId);
                return (
                  <Tr key={agent.id}>
                    <Td className="font-medium">{agent.code}</Td>
                    <Td>{agent.name}</Td>
                    <Td>
                      {agent.status === "active" ? <Badge variant="green">启用</Badge> : <Badge variant="red">停用</Badge>}
                    </Td>
                    <Td className="text-zinc-300">{rule?.name ?? "未分配"}</Td>
                    <Td className="text-zinc-300">{agent.user?.displayName ?? agent.user?.username ?? "未绑定"}</Td>
                    <Td className="text-zinc-400">{new Date(agent.createdAt).toLocaleDateString()}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/agents/${agent.id}`}>
                          <Button size="sm" variant="secondary">
                            详情
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant={agent.status === "active" ? "danger" : "secondary"}
                          disabled={!canEdit || submitting}
                          onClick={() =>
                            void updateAgent(agent.id, {
                              status: agent.status === "active" ? "disabled" : "active",
                            })
                          }
                        >
                          {agent.status === "active" ? "停用" : "启用"}
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

      <Modal
        open={open}
        title="创建一级代理"
        onClose={() => {
          setOpen(false);
          setForm(initialForm);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setForm(initialForm);
              }}
            >
              取消
            </Button>
            <Button onClick={() => void createAgent()} disabled={submitting}>
              {submitting ? "保存中..." : "保存"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">代理编号</div>
            <Input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="A001" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">代理名称</div>
            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="华南代理" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">分配关键词规则</div>
            <Select value={form.ruleId} onChange={(e) => setForm((prev) => ({ ...prev, ruleId: e.target.value }))}>
              <option value="">不分配</option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
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

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const canEdit = user?.roleKey === "main_company";
  const [tab, setTab] = useState("basic");
  const [agent, setAgent] = useState<AgentItem | null>(null);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [ruleDraft, setRuleDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorizationHeaders = useMemo(
    () =>
      accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : undefined,
    [accessToken]
  );

  usePageMeta(agent ? `代理详情 - ${agent.code}` : "代理详情");

  const loadAgent = async () => {
    if (!id || !authorizationHeaders) {
      setAgent(null);
      return;
    }

    setLoading(true);

    try {
      const response = await requestJson<AgentItem>(`/api/agents/${id}`, {
        headers: authorizationHeaders,
      });
      setAgent(response);
      setNameDraft(response.name);
      setRuleDraft(response.ruleId ?? "");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载代理详情失败");
      setAgent(null);
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
      const response = await requestJson<{ items: RuleItem[] }>("/api/rules?page=1&limit=100", {
        headers: authorizationHeaders,
      });
      setRules(response.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载规则失败");
    }
  };

  useEffect(() => {
    if (!accessToken || !id) {
      setAgent(null);
      setRules([]);
      return;
    }

    void loadAgent();
    void loadRules();
  }, [accessToken, id]);

  const updateAgent = async (patch: { name?: string; ruleId?: string | null }) => {
    if (!id || !authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    setSubmitting(true);

    try {
      const response = await requestJson<AgentItem>(`/api/agents/${id}`, {
        method: "PATCH",
        headers: {
          ...authorizationHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      setAgent(response);
      setNameDraft(response.name);
      setRuleDraft(response.ruleId ?? "");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新代理失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!id) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-zinc-300">代理不存在。</div>
        <Button variant="secondary" onClick={() => navigate("/agents")}>
          返回列表
        </Button>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-3">
        {error ? <div className="text-sm text-red-300">{error}</div> : null}
        <div className="text-sm text-zinc-300">{loading ? "加载中..." : "代理不存在或无权访问。"}</div>
        <Button variant="secondary" onClick={() => navigate("/agents")}>
          返回列表
        </Button>
      </div>
    );
  }

  const assignedRule = rules.find((rule) => rule.id === agent.ruleId) ?? null;
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

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

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
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">{agent.code}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">创建时间</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {new Date(agent.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">绑定账号</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {agent.user?.displayName ?? agent.user?.username ?? "未绑定"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">当前状态</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                  {agent.status === "active" ? "启用" : "停用"}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-zinc-300">代理名称</div>
                <div className="flex gap-2">
                  <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={!canEdit || submitting} />
                  <Button
                    variant="primary"
                    disabled={!canEdit || submitting}
                    onClick={() => void updateAgent({ name: nameDraft.trim() || agent.name })}
                  >
                    {submitting ? "保存中..." : "保存"}
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
              当前后端仅返回代理绑定账号信息。绑定、重置密码、停用账号流程暂未落库。
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
                  <Select value={ruleDraft} onChange={(e) => setRuleDraft(e.target.value)} disabled={!canEdit || submitting}>
                    <option value="">不分配</option>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={!canEdit || submitting}
                    onClick={() => void updateAgent({ ruleId: ruleDraft || null })}
                  >
                    {submitting ? "保存中..." : "生效"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "submissions" ? (
        <Card>
          <CardHeader>
            <CardTitle>提交概览</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              当前后端未提供代理提交概览接口，这里不再展示本地 Demo 假数据。
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
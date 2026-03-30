import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";

export default function Agents() {
  usePageMeta("一级代理管理");
  const user = useAuthStore((s) => s.user);
  const agents = useDataStore((s) => s.agents);
  const rules = useDataStore((s) => s.rules);
  const createAgent = useDataStore((s) => s.createAgent);
  const updateAgent = useDataStore((s) => s.updateAgent);

  const canEdit = user?.roleKey === "super_admin" || user?.roleKey === "operator";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", ruleId: "" });
  const [err, setErr] = useState<string | null>(null);

  const agentList = useMemo(() => {
    const roleKey = user?.roleKey;
    const agentId = user?.agentId;
    const base = roleKey === "agent_l1" && agentId ? agents.filter((a) => a.id === agentId) : agents;
    return base
      .filter((a) => (status === "all" ? true : a.status === status))
      .filter((a) => {
        const s = q.trim().toLowerCase();
        if (!s) return true;
        return a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s);
      });
  }, [agents, q, status, user?.agentId, user?.roleKey]);

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
                if (next === "all" || next === "active" || next === "disabled") setStatus(next);
              }}
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </Select>
          </div>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)} disabled={!canEdit}>
          创建一级代理
        </Button>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>编号</Th>
              <Th>名称</Th>
              <Th>状态</Th>
              <Th>分配规则</Th>
              <Th>创建时间</Th>
              <Th className="text-right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {agentList.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="py-8 text-center text-zinc-400">
                  暂无数据
                </Td>
              </Tr>
            ) : (
              agentList.map((a) => {
                const rule = rules.find((r) => r.id === a.ruleId);
                return (
                  <Tr key={a.id}>
                    <Td className="font-medium">{a.code}</Td>
                    <Td>{a.name}</Td>
                    <Td>
                      {a.status === "active" ? (
                        <Badge variant="green">启用</Badge>
                      ) : (
                        <Badge variant="red">停用</Badge>
                      )}
                    </Td>
                    <Td className="text-zinc-300">{rule?.name ?? "未分配"}</Td>
                    <Td className="text-zinc-400">{new Date(a.createdAt).toLocaleDateString()}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/agents/${a.id}`}>
                          <Button size="sm" variant="secondary">
                            详情
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant={a.status === "active" ? "danger" : "secondary"}
                          disabled={!canEdit}
                          onClick={() => {
                            const next = a.status === "active" ? "disabled" : "active";
                            updateAgent(a.id, { status: next });
                          }}
                        >
                          {a.status === "active" ? "停用" : "启用"}
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
          setErr(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                const res = createAgent({
                  code: form.code,
                  name: form.name,
                  ruleId: form.ruleId ? form.ruleId : null,
                });
                if (!res.ok) {
                  setErr(res.message ?? "创建失败");
                  return;
                }
                setErr(null);
                setForm({ code: "", name: "", ruleId: "" });
                setOpen(false);
              }}
            >
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {err ? (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {err}
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">代理编号</div>
            <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="A001" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">代理名称</div>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="华南代理" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">分配关键词规则</div>
            <Select value={form.ruleId} onChange={(e) => setForm((p) => ({ ...p, ruleId: e.target.value }))}>
              <option value="">不分配</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-xs text-zinc-400">创建后可在详情页继续绑定账号与调整规则（Demo占位）。</div>
        </div>
      </Modal>
    </div>
  );
}

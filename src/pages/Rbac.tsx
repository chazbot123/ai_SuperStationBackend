import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Select from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useRbacStore } from "@/store/rbacStore";
import type { PageKey, RoleKey } from "@/types/demo";

const pages: { key: PageKey; label: string }[] = [
  { key: "dashboard", label: "仪表盘" },
  { key: "studio", label: "图片/文案生成" },
  { key: "videos", label: "视频生成" },
  { key: "publishing", label: "获客内容池" },
  { key: "products", label: "产品管理" },
  { key: "reviews", label: "审核中心" },
  { key: "personalization", label: "前台配置中心" },
  { key: "rules", label: "模型配置" },
  { key: "assets", label: "知识库管理" },
  { key: "support", label: "AI客服/工单" },
  { key: "rbac", label: "用户/角色/权限" },
];

export default function Rbac() {
  usePageMeta("用户/角色/权限");
  const roles = useRbacStore((s) => s.roles);
  const accounts = useRbacStore((s) => s.accounts);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const setRoleName = useRbacStore((s) => s.setRoleName);
  const setPermission = useRbacStore((s) => s.setPermission);
  const createAccount = useRbacStore((s) => s.createAccount);
  const updateAccount = useRbacStore((s) => s.updateAccount);

  const [tab, setTab] = useState("accounts");
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    roleKey: "level1_agent" as RoleKey,
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "accounts", label: "用户管理" },
          { key: "roles", label: "角色管理" },
          { key: "perms", label: "权限矩阵" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "accounts" ? (
        <Card>
          <CardHeader>
            <CardTitle>用户管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="邮箱"
              />
              <Input
                value={form.displayName}
                onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="显示名称"
              />
              <Select
                value={form.roleKey}
                onChange={(e) => setForm((prev) => ({ ...prev, roleKey: e.target.value as RoleKey }))}
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </Select>
              <Button
                onClick={() => {
                  const result = createAccount(form);
                  if (!result.ok) {
                    setError(result.message ?? "创建失败");
                    return;
                  }
                  setError(null);
                  setForm({ email: "", displayName: "", roleKey: "level1_agent" });
                }}
              >
                新增账号
              </Button>
            </div>
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>邮箱</Th>
                    <Th>显示名称</Th>
                    <Th>角色</Th>
                    <Th>状态</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <Tr key={account.id}>
                      <Td className="text-zinc-200">{account.email}</Td>
                      <Td className="text-zinc-100">{account.displayName}</Td>
                      <Td className="text-zinc-300">{roles.find((r) => r.key === account.roleKey)?.name}</Td>
                      <Td className="text-zinc-300">{account.status === "active" ? "启用" : "停用"}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            updateAccount(account.id, {
                              status: account.status === "active" ? "disabled" : "active",
                            })
                          }
                        >
                          {account.status === "active" ? "停用" : "启用"}
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <Card>
          <CardHeader>
            <CardTitle>角色管理</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>角色键</Th>
                    <Th>角色名称</Th>
                    <Th>说明</Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <Tr key={role.key}>
                      <Td className="font-mono text-xs text-zinc-400">{role.key}</Td>
                      <Td>
                        <Input value={role.name} onChange={(e) => setRoleName(role.key, e.target.value)} />
                      </Td>
                      <Td className="text-zinc-300">
                        {role.key === "main_company" ? "类似超管，可管理全局模块和审核流程" : "权限受限，可生成内容、管理自己的商品"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      {tab === "perms" ? (
        <Card>
          <CardHeader>
            <CardTitle>权限矩阵</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>页面</Th>
                    {roles.map((role) => (
                      <Th key={role.key}>{role.name}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <Tr key={page.key}>
                      <Td className="font-medium text-zinc-100">{page.label}</Td>
                      {roles.map((role) => (
                        <Td key={role.key}>
                          <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                            <input
                              type="checkbox"
                              checked={!!matrix[role.key]?.[page.key]}
                              onChange={(e) => setPermission(role.key, page.key, e.target.checked)}
                            />
                            {matrix[role.key]?.[page.key] ? "允许" : "禁止"}
                          </label>
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { requestJson } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";
import type { PageKey, PermissionMatrix, RoleKey } from "@/types/demo";

type UserRole = RoleKey;

type UserItem = {
  id: string;
  username: string;
  displayName: string;
  companyName: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

type ListUsersResponse = {
  items: UserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type UserDetailResponse = UserItem;

type UserFormState = {
  username: string;
  password: string;
  displayName: string;
  companyName: string;
  role: UserRole;
};

type RoleFormState = {
  key: string;
  name: string;
  description: string;
};

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
  { key: "agents", label: "代理管理" },
  { key: "rbac", label: "用户/角色/权限" },
];

const initialUserForm: UserFormState = {
  username: "",
  password: "123456",
  displayName: "",
  companyName: "",
  role: "level1_agent",
};

const initialRoleForm: RoleFormState = {
  key: "",
  name: "",
  description: "",
};

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function getRoleLabel(roleKey: string, roles: { key: string; name: string }[]) {
  return roles.find((role) => role.key === roleKey)?.name ?? roleKey;
}

export default function Rbac() {
  usePageMeta("用户/角色/权限");
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.user);
  const roles = useRbacStore((s) => s.roles);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const rbacError = useRbacStore((s) => s.error);
  const loadRbac = useRbacStore((s) => s.load);
  const createRole = useRbacStore((s) => s.createRole);
  const updateRole = useRbacStore((s) => s.updateRole);
  const removeRole = useRbacStore((s) => s.removeRole);
  const setPermission = useRbacStore((s) => s.setPermission);

  const [tab, setTab] = useState("accounts");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<UserFormState>(initialUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleFormState>(initialRoleForm);
  const [editingRoleKey, setEditingRoleKey] = useState<RoleKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPermissionKey, setUpdatingPermissionKey] = useState<string | null>(null);

  const isMainCompany = currentUser?.roleKey === "main_company";

  const authorizationHeaders = useMemo(
    () =>
      accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : undefined,
    [accessToken]
  );

  const roleOptions = useMemo(
    () => roles.map((role) => ({ key: role.key, name: role.name })),
    [roles]
  );

  const loadUsers = async () => {
    if (!authorizationHeaders) {
      setUsers([]);
      return;
    }

    setLoadingUsers(true);

    try {
      const query = search.trim();
      const params = new URLSearchParams({ page: "1", limit: "50" });
      if (query) {
        params.set("q", query);
      }

      const response = await requestJson<ListUsersResponse>(`/api/users?${params.toString()}`, {
        headers: authorizationHeaders,
      });
      setUsers(response.items);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载用户失败");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUserDetail = async (id: string) => {
    if (!authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    setSubmitting(true);
    try {
      const detail = await requestJson<UserDetailResponse>(`/api/users/${id}`, {
        headers: authorizationHeaders,
      });
      setForm({
        username: detail.username,
        password: "",
        displayName: detail.displayName,
        companyName: detail.companyName ?? "",
        role: detail.role,
      });
      setEditingUserId(detail.id);
      setUserModalOpen(true);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载用户详情失败");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm(initialUserForm);
    setEditingUserId(null);
  };

  const openCreateUserModal = () => {
    resetForm();
    setError(null);
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    if (submitting) return;
    setUserModalOpen(false);
    resetForm();
  };

  const openCreateRoleModal = () => {
    setEditingRoleKey(null);
    setRoleForm(initialRoleForm);
    setError(null);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (role: { key: string; name: string; description: string }) => {
    setEditingRoleKey(role.key);
    setRoleForm({
      key: role.key,
      name: role.name,
      description: role.description ?? "",
    });
    setError(null);
    setRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    if (submitting) return;
    setRoleModalOpen(false);
    setEditingRoleKey(null);
    setRoleForm(initialRoleForm);
  };

  useEffect(() => {
    if (accessToken) {
      void loadUsers();
      return;
    }

    setUsers([]);
    setUserModalOpen(false);
    setRoleModalOpen(false);
  }, [accessToken]);

  const submitUser = async () => {
    if (!authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    setSubmitting(true);

    try {
      if (editingUserId) {
        const payload: Partial<UserFormState> = {
          displayName: form.displayName.trim(),
          companyName: form.companyName.trim(),
          role: form.role,
        };

        if (form.password.trim()) {
          payload.password = form.password;
        }

        await requestJson<UserItem>(`/api/users/${editingUserId}`, {
          method: "PATCH",
          headers: {
            ...authorizationHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson<UserItem>("/api/users", {
          method: "POST",
          headers: {
            ...authorizationHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: form.username.trim(),
            password: form.password,
            displayName: form.displayName.trim(),
            companyName: form.companyName.trim() || undefined,
            role: form.role,
          }),
        });
      }

      setUserModalOpen(false);
      resetForm();
      await loadUsers();
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : editingUserId ? "更新用户失败" : "创建用户失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRole = async () => {
    if (!authorizationHeaders) {
      setError("登录状态已失效");
      return;
    }

    const trimmedKey = roleForm.key.trim();
    const trimmedName = roleForm.name.trim();
    const trimmedDescription = roleForm.description.trim();

    if (!editingRoleKey) {
      if (!trimmedKey) {
        setError("请输入角色键");
        return;
      }

      if (!ROLE_KEY_PATTERN.test(trimmedKey)) {
        setError("角色键仅支持小写字母、数字和下划线，且必须以字母开头");
        return;
      }
    }

    if (!trimmedName) {
      setError("请输入角色名称");
      return;
    }

    setSubmitting(true);
    try {
      if (editingRoleKey) {
        await updateRole(editingRoleKey, {
          name: trimmedName,
          description: trimmedDescription,
        });
      } else {
        await createRole({
          key: trimmedKey,
          name: trimmedName,
          description: trimmedDescription,
        });
      }

      closeRoleModal();
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : editingRoleKey ? "更新角色失败" : "新增角色失败");
    } finally {
      setSubmitting(false);
    }
  };

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
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>用户管理</CardTitle>
            <Button
              onClick={openCreateUserModal}
              disabled={!authorizationHeaders || submitting || !isMainCompany}
            >
              新增用户
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="按用户名 / 显示名 / 公司名搜索"
              />
              <Button variant="secondary" onClick={() => void loadUsers()} disabled={loadingUsers || !authorizationHeaders}>
                {loadingUsers ? "加载中..." : "搜索"}
              </Button>
            </div>

            {error ? <div className="text-sm text-red-300">{error}</div> : null}

            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>用户名</Th>
                    <Th>显示名称</Th>
                    <Th>公司名称</Th>
                    <Th>角色</Th>
                    <Th>创建时间</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td className="text-zinc-200">{user.username}</Td>
                      <Td className="text-zinc-100">{user.displayName}</Td>
                      <Td className="text-zinc-300">{user.companyName ?? "-"}</Td>
                      <Td className="text-zinc-300">{getRoleLabel(user.role, roles)}</Td>
                      <Td className="text-zinc-300">{new Date(user.createdAt).toLocaleString()}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={!authorizationHeaders || submitting} onClick={() => void loadUserDetail(user.id)}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!authorizationHeaders || submitting}
                            onClick={async () => {
                              if (!authorizationHeaders) {
                                setError("登录状态已失效");
                                return;
                              }

                              try {
                                await requestJson<{ success: true }>(`/api/users/${user.id}`, {
                                  method: "DELETE",
                                  headers: authorizationHeaders,
                                });
                                if (editingUserId === user.id) {
                                  resetForm();
                                }
                                await loadUsers();
                              } catch (requestError) {
                                setError(requestError instanceof Error ? requestError.message : "删除用户失败");
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                  {!users.length && !loadingUsers ? (
                    <Tr>
                      <Td colSpan={6} className="text-center text-zinc-400">
                        暂无用户数据
                      </Td>
                    </Tr>
                  ) : null}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}
      <Modal
        open={userModalOpen}
        title={editingUserId ? "编辑用户" : "新增用户"}
        onClose={closeUserModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeUserModal} disabled={submitting}>
              取消
            </Button>
            <Button disabled={submitting || !authorizationHeaders} onClick={() => void submitUser()}>
              {submitting ? "保存中..." : editingUserId ? "保存修改" : "确认新增"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">用户名</div>
              <Input
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="用户名"
                disabled={submitting || !!editingUserId}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">
                {editingUserId ? "新密码" : "初始密码"}
              </div>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder={editingUserId ? "留空则不修改密码" : "请输入初始密码"}
                disabled={submitting}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">显示名称</div>
              <Input
                value={form.displayName}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="显示名称"
                disabled={submitting}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">公司名称</div>
              <Input
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                placeholder="公司名称"
                disabled={submitting}
              />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-300">角色</div>
              <Select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
                disabled={submitting || !isMainCompany}
              >
                {roleOptions.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {editingUserId ? (
            <div className="text-xs text-zinc-400">
              在这里可同时修改用户资料和密码，不再单独提供“改密码”按钮。
            </div>
          ) : null}

          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>
      </Modal>

      {tab === "roles" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>角色管理</CardTitle>
            <Button
              onClick={openCreateRoleModal}
              disabled={!isMainCompany || submitting || !authorizationHeaders}
            >
              新增角色
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {rbacError ? <div className="text-sm text-red-300">{rbacError}</div> : null}
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
            <div className="text-xs text-zinc-400">
              系统角色仅支持编辑，不允许删除；自定义角色可删除。
            </div>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>角色键</Th>
                    <Th>角色名称</Th>
                    <Th>说明</Th>
                    <Th>类型</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <Tr key={role.key}>
                      <Td className="font-mono text-xs text-zinc-400">{role.key}</Td>
                      <Td className="text-zinc-100">{role.name}</Td>
                      <Td className="text-zinc-300">{role.description || "-"}</Td>
                      <Td className="text-zinc-300">{role.isSystem ? "系统角色" : "自定义角色"}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!isMainCompany || submitting}
                            onClick={() => openEditRoleModal(role)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!isMainCompany || submitting || role.isSystem}
                            title={role.isSystem ? "系统角色不允许删除" : undefined}
                            onClick={async () => {
                              setSubmitting(true);
                              try {
                                await removeRole(role.key);
                                setError(null);
                              } catch (requestError) {
                                setError(requestError instanceof Error ? requestError.message : "删除角色失败");
                              } finally {
                                setSubmitting(false);
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={roleModalOpen}
        title={editingRoleKey ? "编辑角色" : "新增角色"}
        onClose={closeRoleModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRoleModal} disabled={submitting}>
              取消
            </Button>
            <Button disabled={submitting || !authorizationHeaders} onClick={() => void submitRole()}>
              {submitting ? "保存中..." : editingRoleKey ? "保存修改" : "确认新增"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">角色键</div>
              <Input
                value={roleForm.key}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, key: event.target.value }))}
                placeholder="例如：regional_manager"
                disabled={submitting || !!editingRoleKey}
              />
              {!editingRoleKey ? (
                <div className="mt-1 text-xs text-zinc-400">
                  仅支持小写字母、数字和下划线，且必须以字母开头。
                </div>
              ) : null}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">角色名称</div>
              <Input
                value={roleForm.name}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="角色名称"
                disabled={submitting}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">说明</div>
              <Input
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="角色说明"
                disabled={submitting}
              />
            </div>
          </div>

          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>
      </Modal>

      {tab === "perms" ? (
        <Card>
          <CardHeader>
            <CardTitle>权限矩阵</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rbacError ? <div className="text-sm text-red-300">{rbacError}</div> : null}
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
                      {roles.map((role) => {
                        const permissionKey = `${role.key}:${page.key}`;
                        return (
                          <Td key={role.key}>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                              <input
                                type="checkbox"
                                checked={!!(matrix as PermissionMatrix)[role.key]?.[page.key]}
                                disabled={!isMainCompany || updatingPermissionKey === permissionKey}
                                onChange={async (event) => {
                                  setUpdatingPermissionKey(permissionKey);
                                  try {
                                    await setPermission(role.key, page.key, event.target.checked);
                                    setError(null);
                                  } catch (requestError) {
                                    setError(requestError instanceof Error ? requestError.message : "更新权限失败");
                                    await loadRbac();
                                  } finally {
                                    setUpdatingPermissionKey(null);
                                  }
                                }}
                              />
                              {(matrix as PermissionMatrix)[role.key]?.[page.key] ? "允许" : "禁止"}
                            </label>
                          </Td>
                        );
                      })}
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

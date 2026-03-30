import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { useRbacStore } from "@/store/rbacStore";
import { useAuditStore } from "@/store/auditStore";
import { useAppStore, type CardSkinKey, type UserProfile } from "@/store/appStore";
import type { PageKey, RoleKey } from "@/types/demo";
import { useT } from "@/i18n/useT";

const pages: { key: PageKey; label: string }[] = [
  { key: "dashboard", label: "仪表盘" },
  { key: "studio", label: "创作中心" },
  { key: "publishing", label: "发布管理" },
  { key: "assets", label: "数字仓库" },
  { key: "videos", label: "视频中心" },
  { key: "support", label: "客服中心" },
  { key: "personalization", label: "个性化配置" },
  { key: "agents", label: "一级代理" },
  { key: "rules", label: "规则配置" },
  { key: "reviews", label: "审核队列" },
  { key: "rbac", label: "权限与账号" },
];

export default function Rbac() {
  const t = useT();
  usePageMeta(t("page.users"));
  const user = useAuthStore((s) => s.user);
  const roleKey = user?.roleKey;
  const canSeeUsers = roleKey === "super_admin" || roleKey === "tenant_admin" || roleKey === "operator";
  const canEditRoles = roleKey === "super_admin";
  const canEditAccounts = roleKey === "super_admin" || roleKey === "tenant_admin";

  const roles = useRbacStore((s) => s.roles);
  const accounts = useRbacStore((s) => s.accounts);
  const matrix = useRbacStore((s) => s.permissionMatrix);
  const setRoleName = useRbacStore((s) => s.setRoleName);
  const setPermission = useRbacStore((s) => s.setPermission);
  const createAccount = useRbacStore((s) => s.createAccount);
  const updateAccount = useRbacStore((s) => s.updateAccount);

  const agents = useDataStore((s) => s.agents);

  const appUsers = useAppStore((s) => s.users);
  const addUser = useAppStore((s) => s.addUser);
  const updateUser = useAppStore((s) => s.updateUser);
  const removeUser = useAppStore((s) => s.removeUser);
  const cardSkin = useAppStore((s) => s.settings.cardSkin);
  const enterpriseName = useAppStore((s) => s.settings.enterpriseName);

  const [tab, setTab] = useState("users");
  const tabs = [
    { key: "users", label: t("rbac.tabs.users") },
    { key: "roles", label: t("rbac.tabs.roles") },
    { key: "accounts", label: t("rbac.tabs.accounts") },
    { key: "perms", label: t("rbac.tabs.perms") },
    { key: "audit", label: t("rbac.tabs.audit") },
  ];

  const [open, setOpen] = useState(false);
  const [accForm, setAccForm] = useState({
    roleKey: "viewer" as RoleKey,
    agentId: "",
    userId: "",
  });
  const [accErr, setAccErr] = useState<string | null>(null);
  const [accUserQ, setAccUserQ] = useState("");
  const [openUser, setOpenUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userErr, setUserErr] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    email: "",
    name: "",
    company: "",
    title: "",
    phone: "",
    images: [] as string[],
  });
  const [openCard, setOpenCard] = useState(false);
  const [cardUserId, setCardUserId] = useState<string | null>(null);

  const rolesSorted = useMemo(() => {
    const order: RoleKey[] = [
      "super_admin",
      "tenant_admin",
      "operator",
      "creator",
      "support",
      "agent_l1",
      "agent_l2",
      "viewer",
    ];
    return [...roles].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [roles]);

  if (!canSeeUsers && !canEditRoles && !canEditAccounts) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        {t("rbac.noAccess")}
      </div>
    );
  }

  const cardUser = appUsers.find((u) => u.id === cardUserId) ?? null;

  function startCreateUser() {
    setEditingUserId(null);
    setUserErr(null);
    setUserForm({ email: "", name: "", company: "", title: "", phone: "", images: [] });
    setOpenUser(true);
  }

  function startEditUser(u: UserProfile) {
    setEditingUserId(u.id);
    setUserErr(null);
    setUserForm({ email: u.email, name: u.name, company: u.company, title: u.title, phone: u.phone, images: u.images });
    setOpenUser(true);
  }

  function openCardFor(u: UserProfile) {
    setCardUserId(u.id);
    setOpenCard(true);
  }

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const reads = arr.map(
      (f) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsDataURL(f);
        })
    );
    const urls = await Promise.all(reads);
    setUserForm((p) => ({ ...p, images: [...p.images, ...urls].filter(Boolean).slice(0, 6) }));
  }

  function saveUserProfile() {
    const email = userForm.email.trim();
    const name = userForm.name.trim();
    if (!email || !name) {
      setUserErr("邮箱与姓名为必填");
      return;
    }
    if (editingUserId) {
      updateUser(editingUserId, { ...userForm, email, name });
    } else {
      addUser({ ...userForm, email, name });
    }
    setOpenUser(false);
  }

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "users" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("rbac.users.title")}</CardTitle>
              <Button size="sm" onClick={startCreateUser} disabled={!canSeeUsers}>
                {t("rbac.users.add")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>姓名</Th>
                    <Th>邮箱</Th>
                    <Th>公司</Th>
                    <Th>职位</Th>
                    <Th>电话</Th>
                    <Th>图片</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {appUsers.length === 0 ? (
                    <Tr>
                      <Td colSpan={7} className="py-8 text-center text-zinc-400">
                        {t("rbac.users.empty")}
                      </Td>
                    </Tr>
                  ) : (
                    appUsers.map((u) => (
                      <Tr key={u.id}>
                        <Td className="font-medium text-zinc-100">{u.name}</Td>
                        <Td className="text-zinc-200">{u.email}</Td>
                        <Td className="text-zinc-200">{u.company}</Td>
                        <Td className="text-zinc-200">{u.title}</Td>
                        <Td className="text-zinc-200">{u.phone}</Td>
                        <Td className="text-zinc-200">{u.images.length}</Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openCardFor(u)}>
                              {t("rbac.users.card")}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => startEditUser(u)}>
                              {t("rbac.users.edit")}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => removeUser(u.id)}>
                              {t("rbac.users.delete")}
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              {t("rbac.users.hint")}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("rbac.roles.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Role Key</Th>
                    <Th>角色名称</Th>
                    <Th>说明</Th>
                  </tr>
                </thead>
                <tbody>
                  {rolesSorted.map((r) => (
                    <Tr key={r.key}>
                      <Td className="font-mono text-xs">{r.key}</Td>
                      <Td>
                        <Input
                          value={r.name}
                          onChange={(e) => setRoleName(r.key, e.target.value)}
                        />
                      </Td>
                      <Td className="text-zinc-300">
                        {r.key === "super_admin"
                          ? "全权限"
                          : r.key === "operator"
                          ? "运营配置与审核"
                          : r.key === "agent_l1"
                          ? "代理提交与查看"
                          : "只读查看"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      {tab === "accounts" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("rbac.accounts.title")}</CardTitle>
              <Button size="sm" onClick={() => setOpen(true)}>
                {t("rbac.accounts.create")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>邮箱</Th>
                    <Th>姓名</Th>
                    <Th>角色</Th>
                    <Th>状态</Th>
                    <Th>创建时间</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <Tr key={a.id}>
                      <Td className="text-zinc-200">{a.email}</Td>
                      <Td className="text-zinc-100">{a.displayName}</Td>
                      <Td className="text-zinc-300">
                        {roles.find((r) => r.key === a.roleKey)?.name ?? a.roleKey}
                      </Td>
                      <Td className="text-zinc-300">{a.status === "active" ? "启用" : "停用"}</Td>
                      <Td className="text-zinc-400">{new Date(a.createdAt).toLocaleDateString()}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant={a.status === "active" ? "danger" : "secondary"}
                          onClick={() => updateAccount(a.id, { status: a.status === "active" ? "disabled" : "active" })}
                          disabled={a.id === user?.id}
                        >
                          {a.status === "active" ? "停用" : "启用"}
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

      {tab === "perms" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("rbac.perms.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>页面</Th>
                    {rolesSorted.map((r) => (
                      <Th key={r.key}>{r.name}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <Tr key={p.key}>
                      <Td className="font-medium">{p.label}</Td>
                      {rolesSorted.map((r) => {
                        const value = matrix[r.key]?.[p.key];
                        const locked = r.key === "super_admin";
                        return (
                          <Td key={r.key}>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                              <input
                                type="checkbox"
                                checked={!!value}
                                disabled={locked}
                                onChange={(e) => setPermission(r.key, p.key, e.target.checked)}
                              />
                              {locked ? t("rbac.perms.fixed") : value ? t("rbac.perms.allow") : t("rbac.perms.deny")}
                            </label>
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-3 text-xs text-zinc-400">{t("rbac.perms.hint")}</div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "audit" ? (
        <AuditLogs />
      ) : null}

      <Modal
        open={open}
        title={t("rbac.modal.account.title")}
        onClose={() => {
          setOpen(false);
          setAccErr(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setAccErr(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const picked = appUsers.find((u) => u.id === accForm.userId) ?? null;
                if (!picked) {
                  setAccErr(t("rbac.modal.account.noUsers"));
                  return;
                }
                const res = createAccount({
                  email: picked.email,
                  displayName: picked.name,
                  roleKey: accForm.roleKey,
                  agentId: accForm.roleKey === "agent_l1" ? accForm.agentId || undefined : undefined,
                });
                if (!res.ok) {
                  setAccErr(res.message ?? "创建失败");
                  return;
                }
                setAccErr(null);
                setAccForm({ roleKey: "viewer", agentId: "", userId: "" });
                setAccUserQ("");
                setOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {accErr ? (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {accErr}
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">{t("rbac.modal.account.pickUser")}</div>
            <Input value={accUserQ} onChange={(e) => setAccUserQ(e.target.value)} placeholder={t("rbac.modal.account.searchUser")} />
            <div className="mt-2 max-h-48 space-y-2 overflow-auto">
              {appUsers.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
                  {t("rbac.modal.account.noUsers")}
                </div>
              ) : (
                appUsers
                  .filter((u) => {
                    const q = accUserQ.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      u.id.toLowerCase().includes(q) ||
                      u.name.toLowerCase().includes(q) ||
                      u.email.toLowerCase().includes(q) ||
                      u.phone.toLowerCase().includes(q)
                    );
                  })
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setAccForm((p) => ({ ...p, userId: u.id }))}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        accForm.userId === u.id ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-zinc-100">{u.name}</div>
                        <div className="text-xs text-zinc-400">{u.id}</div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                    </button>
                  ))
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">{t("rbac.modal.account.role")}</div>
            <Select value={accForm.roleKey} onChange={(e) => setAccForm((p) => ({ ...p, roleKey: e.target.value as RoleKey }))}>
              {rolesSorted.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          {accForm.roleKey === "agent_l1" ? (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">{t("rbac.modal.account.bindAgent")}</div>
              <Select value={accForm.agentId} onChange={(e) => setAccForm((p) => ({ ...p, agentId: e.target.value }))}>
                <option value="">请选择</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="text-xs text-zinc-400">{t("rbac.modal.account.hint")}</div>
        </div>
      </Modal>

      <Modal
        open={openUser}
        title={editingUserId ? "编辑用户" : "新增用户"}
        onClose={() => {
          setOpenUser(false);
          setUserErr(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenUser(false)}>
              取消
            </Button>
            <Button onClick={saveUserProfile}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {userErr ? (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{userErr}</div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">邮箱</div>
              <Input value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">姓名</div>
              <Input value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">公司</div>
              <Input value={userForm.company} onChange={(e) => setUserForm((p) => ({ ...p, company: e.target.value }))} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-300">职位</div>
              <Input value={userForm.title} onChange={(e) => setUserForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-300">电话号码</div>
              <Input value={userForm.phone} onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-300">图片（用于 AI 名片展示）</div>
              <input
                className="block w-full text-sm text-zinc-200 file:mr-3 file:rounded-md file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:bg-white/10"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => addImages(e.target.files)}
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {userForm.images.map((src) => (
                  <img key={src} src={src} alt="img" className="h-24 w-full rounded-md object-cover" />
                ))}
              </div>
              <div className="mt-1 text-xs text-zinc-400">Demo：最多保留 6 张；后续可对接后端裁剪为 300x300。</div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={openCard}
        title="AI名片（预览）"
        onClose={() => setOpenCard(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenCard(false)}>
              关闭
            </Button>
            <Button>微信推送（占位）</Button>
          </div>
        }
      >
        {!cardUser ? (
          <div className="text-sm text-zinc-300">请选择用户</div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl p-4 ${cardClass(cardSkin)}`}>
              <div className="text-center text-xs font-semibold opacity-85">{enterpriseName || "—"}</div>
              <div className="text-xs opacity-80">AI名片</div>
              <div className="mt-2 text-lg font-semibold">{cardUser.name}</div>
              <div className="mt-1 text-sm opacity-90">{cardUser.company} · {cardUser.title}</div>
              <div className="mt-4 flex items-center justify-between text-xs opacity-80">
                <div>{maskPhone(cardUser.phone)}</div>
                <div>{cardUser.email}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cardUser.images.slice(0, 3).map((src) => (
                <img key={src} src={src} alt="img" className="h-24 w-full rounded-md object-cover" />
              ))}
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              Demo：生成名片并提供分享入口；后续可对接微信模板消息/企业微信推送。
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function cardClass(skin: CardSkinKey) {
  if (skin === "black_gold") return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-900 text-amber-50";
  if (skin === "iridescent") return "bg-gradient-to-br from-fuchsia-600 via-blue-500 to-emerald-400 text-white";
  if (skin === "geo_green") return "bg-gradient-to-br from-emerald-900 via-emerald-700 to-zinc-950 text-emerald-50";
  return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-yellow-800 text-yellow-50";
}

function maskPhone(phone: string) {
  const s = phone.trim();
  if (s.length < 7) return s || "-";
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

function AuditLogs() {
  const logs = useAuditStore((s) => s.logs);
  const clear = useAuditStore((s) => s.clear);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>审计日志（最近500条，本地存储Demo）</CardTitle>
          <Button size="sm" variant="secondary" onClick={clear}>
            清空（Demo）
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>时间</Th>
                <Th>用户</Th>
                <Th>角色</Th>
                <Th>动作</Th>
                <Th>资源</Th>
                <Th>详情</Th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <Tr>
                  <Td colSpan={6} className="py-8 text-center text-zinc-400">
                    暂无日志
                  </Td>
                </Tr>
              ) : (
                logs.map((l) => (
                  <Tr key={l.id}>
                    <Td className="text-zinc-400">{new Date(l.time).toLocaleString()}</Td>
                    <Td className="text-zinc-200">{l.userEmail}</Td>
                    <Td className="text-zinc-300">{l.userRole}</Td>
                    <Td className="text-zinc-300">{l.action}</Td>
                    <Td className="text-zinc-300">
                      {l.resourceType}:{l.resourceId}
                    </Td>
                    <Td className="text-zinc-400">{l.detail ?? "-"}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>
      </CardContent>
    </Card>
  );
}

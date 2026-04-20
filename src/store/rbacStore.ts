import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Account, PageKey, PermissionMatrix, Role, RoleKey } from "@/types/demo";
import { createDemoSeed } from "@/utils/demoSeed";
import { newId, nowIso } from "@/utils/id";

type RbacState = {
  roles: Role[];
  accounts: Account[];
  permissionMatrix: PermissionMatrix;

  setRoleName: (roleKey: RoleKey, name: string) => void;
  setPermission: (roleKey: RoleKey, pageKey: PageKey, value: boolean) => void;

  createAccount: (input: { email: string; displayName: string; roleKey: RoleKey; agentId?: string }) => {
    ok: boolean;
    message?: string;
  };
  updateAccount: (id: string, patch: Partial<Pick<Account, "displayName" | "roleKey" | "status" | "agentId">>) => void;
};

const seed = createDemoSeed();

export const useRbacStore = create<RbacState>()(
  persist(
    (set, get) => ({
      roles: seed.roles,
      accounts: seed.accounts,
      permissionMatrix: seed.permissionMatrix,

      setRoleName: (roleKey, name) => {
        const nextName = name.trim();
        if (!nextName) return;
        set({ roles: get().roles.map((r) => (r.key === roleKey ? { ...r, name: nextName } : r)) });
      },

      setPermission: (roleKey, pageKey, value) => {
        const matrix = get().permissionMatrix;
        const role = matrix[roleKey];
        set({
          permissionMatrix: {
            ...matrix,
            [roleKey]: {
              ...role,
              [pageKey]: value,
            },
          },
        });
      },

      createAccount: ({ email, displayName, roleKey, agentId }) => {
        const e = email.trim().toLowerCase();
        const n = displayName.trim();
        if (!e || !n) return { ok: false, message: "邮箱与姓名为必填" };
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, message: "邮箱格式不正确" };
        if (get().accounts.some((a) => a.email.toLowerCase() === e)) return { ok: false, message: "邮箱已存在" };

        const acc: Account = {
          id: newId("acc"),
          email: e,
          displayName: n,
          roleKey,
          agentId: roleKey === "level1_agent" ? agentId : undefined,
          status: "active",
          createdAt: nowIso(),
        };
        set({ accounts: [acc, ...get().accounts] });
        return { ok: true };
      },

      updateAccount: (id, patch) => {
        set({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
      },
    }),
    { name: "aiadmin_rbac_v1" }
  )
);

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, RoleKey } from "@/types/demo";
import { createDemoSeed } from "@/utils/demoSeed";

type AuthState = {
  user: AuthUser | null;
  loginWithPreset: (roleKey: RoleKey) => void;
  login: (email: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
};

const seed = createDemoSeed();

function userFromPreset(roleKey: RoleKey): AuthUser {
  const account = seed.accounts.find((a) => a.roleKey === roleKey);
  return {
    id: account?.id ?? `acc_${roleKey}`,
    email: account?.email ?? `${roleKey}@demo.local`,
    displayName: account?.displayName ?? roleKey,
    roleKey,
    agentId: account?.agentId,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loginWithPreset: (roleKey) => set({ user: userFromPreset(roleKey) }),
      login: (email, password) => {
        const normalized = email.trim().toLowerCase();
        const account = seed.accounts.find(
          (a) => a.email.toLowerCase() === normalized && a.status === "active"
        );
        if (!account) {
          return { ok: false, message: "账号不存在或已停用（Demo 请使用预置账号）" };
        }
        if (!password.trim()) {
          return { ok: false, message: "请输入密码（Demo 任意非空即可）" };
        }
        set({
          user: {
            id: account.id,
            email: account.email,
            displayName: account.displayName,
            roleKey: account.roleKey,
            agentId: account.agentId,
          },
        });
        return { ok: true };
      },
      logout: () => set({ user: null }),
    }),
    { name: "aiadmin_auth_v1" }
  )
);

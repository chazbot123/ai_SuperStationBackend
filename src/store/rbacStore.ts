import { create } from "zustand";
import { requestJson } from "@/lib/api";
import type { PageKey, PermissionMatrix, Role, RoleKey } from "@/types/demo";
import { useAuthStore } from "@/store/authStore";

type RbacPayload = {
  roles: Role[];
  permissionMatrix: PermissionMatrix;
};

type RbacState = {
  roles: Role[];
  permissionMatrix: PermissionMatrix;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  load: () => Promise<void>;
  createRole: (input: { key: string; name: string; description: string }) => Promise<void>;
  updateRole: (roleKey: RoleKey, input: { name: string; description: string }) => Promise<void>;
  removeRole: (roleKey: RoleKey) => Promise<void>;
  setPermission: (roleKey: RoleKey, pageKey: PageKey, value: boolean) => Promise<void>;
  reset: () => void;
};

const emptyRoles: Role[] = [
  { key: "main_company", name: "主公司", description: "全局后台管理权限", isSystem: true },
];

function getAuthHeaders() {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw new Error("登录状态已失效");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export const useRbacStore = create<RbacState>((set) => ({
  roles: emptyRoles,
  permissionMatrix: {},
  loading: false,
  initialized: false,
  error: null,
  load: async () => {
    set({ loading: true });

    try {
      const payload = await requestJson<RbacPayload>("/api/rbac", {
        headers: {
          Authorization: getAuthHeaders().Authorization,
        },
      });
      set({
        roles: payload.roles,
        permissionMatrix: payload.permissionMatrix,
        loading: false,
        initialized: true,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "加载 RBAC 失败",
      });
    }
  },
  createRole: async (input) => {
    const payload = await requestJson<RbacPayload>("/api/rbac/roles", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    set({ roles: payload.roles, permissionMatrix: payload.permissionMatrix, error: null });
  },
  updateRole: async (roleKey, input) => {
    const payload = await requestJson<RbacPayload>(`/api/rbac/roles/${encodeURIComponent(roleKey)}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    set({ roles: payload.roles, permissionMatrix: payload.permissionMatrix, error: null });
  },
  removeRole: async (roleKey) => {
    const payload = await requestJson<RbacPayload>(`/api/rbac/roles/${encodeURIComponent(roleKey)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    set({ roles: payload.roles, permissionMatrix: payload.permissionMatrix, error: null });
  },

  setPermission: async (roleKey, pageKey, value) => {
    const payload = await requestJson<RbacPayload>("/api/rbac/permissions", {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        items: [{ roleKey, pageKey, allowed: value }],
      }),
    });

    set({ roles: payload.roles, permissionMatrix: payload.permissionMatrix, error: null });
  },
  reset: () => {
    set({
      roles: emptyRoles,
      permissionMatrix: {},
      loading: false,
      initialized: false,
      error: null,
    });
  },
}));

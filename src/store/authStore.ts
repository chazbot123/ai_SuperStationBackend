import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, RoleKey } from "@/types/demo";

type LoginResult = { ok: boolean; message?: string };

type PersistedAuthState = {
  user: AuthUser | null;
  accessToken: string | null;
};

type AuthState = PersistedAuthState & {
  login: (username: string, password: string) => Promise<LoginResult>;
  loginWithPreset: (roleKey: RoleKey) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

type LoginResponse = {
  accessToken: string;
};

type MeResponse = {
  id: string;
  username: string;
  displayName: string;
  companyName?: string | null;
  role: string;
  agentId?: string | null;
};

const AUTH_STORAGE_KEY = "aiadmin_auth_v2";
const DEVICE_ID_STORAGE_KEY = "aiadmin_device_id";
const presetCredentials: Partial<Record<RoleKey, { username: string; password: string }>> = {
  main_company: { username: "demo_admin", password: "123456" },
  level1_agent: { username: "agent_a001", password: "123456" },
};

function getDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextDeviceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

function getDeviceName() {
  const userAgent = navigator.userAgent;

  if (/Windows/i.test(userAgent)) return "Browser on Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Browser on macOS";
  if (/Android/i.test(userAgent)) return "Browser on Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "Browser on iOS";

  return "Browser";
}

function mapRoleKey(role: string): RoleKey | null {
  const normalizedRole = role.trim();
  return normalizedRole ? normalizedRole : null;
}

function mapAuthUser(payload: MeResponse): AuthUser | null {
  const roleKey = mapRoleKey(payload.role);
  if (!roleKey) {
    return null;
  }

  return {
    id: payload.id,
    username: payload.username,
    displayName: payload.displayName,
    companyName: payload.companyName ?? null,
    roleKey,
    agentId: payload.agentId ?? null,
  };
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T | { message?: string }) : null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : "请求失败";
    throw new Error(message);
  }

  return data as T;
}

async function loginRequest(username: string, password: string) {
  return requestJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
    }),
  });
}

async function meRequest(accessToken: string) {
  return requestJson<MeResponse>("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      login: async (username, password) => {
        const normalizedUsername = username.trim();
        const normalizedPassword = password.trim();

        if (!normalizedUsername || !normalizedPassword) {
          return { ok: false, message: "请输入用户名和密码" };
        }

        try {
          const { accessToken } = await loginRequest(normalizedUsername, normalizedPassword);
          const profile = await meRequest(accessToken);
          const user = mapAuthUser(profile);

          if (!user) {
            return { ok: false, message: "当前账号角色未接入 Demo 页面权限" };
          }

          set({ user, accessToken });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : "登录失败",
          };
        }
      },
      loginWithPreset: async (roleKey) => {
        const preset = presetCredentials[roleKey];
        if (!preset) {
          return { ok: false, message: "当前角色没有预置账号" };
        }
        return get().login(preset.username, preset.password);
      },
      logout: async () => {
        const accessToken = get().accessToken;

        try {
          if (accessToken) {
            await fetch("/api/auth/logout", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
          }
        } finally {
          set({ user: null, accessToken: null });
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state): PersistedAuthState => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
    }
  )
);

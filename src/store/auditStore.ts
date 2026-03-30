import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/types/demo";
import { newId, nowIso } from "@/utils/id";

export type AuditAction =
  | "login"
  | "permission_change"
  | "contact_reveal"
  | "publish_retry"
  | "publish_cancel"
  | "other";

export interface AuditLog {
  id: string;
  time: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail?: string;
}

type AuditState = {
  logs: AuditLog[];
  record: (input: {
    user: AuthUser | null;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    detail?: string;
  }) => void;
  clear: () => void;
};

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      logs: [],
      record: ({ user, action, resourceType, resourceId, detail }) => {
        const log: AuditLog = {
          id: newId("log"),
          time: nowIso(),
          userId: user?.id ?? "anonymous",
          userEmail: user?.email ?? "anonymous",
          userRole: user?.roleKey ?? "unknown",
          action,
          resourceType,
          resourceId,
          detail,
        };
        set({ logs: [log, ...get().logs].slice(0, 500) });
      },
      clear: () => set({ logs: [] }),
    }),
    { name: "aiadmin_audit_v1" }
  )
);

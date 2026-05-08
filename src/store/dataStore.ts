import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentL1, KeywordItem, KeywordRule, KeywordSubmission, KeywordReviewStatus } from "@/types/demo";
import { createDemoSeed } from "@/utils/demoSeed";
import { newId, nowIso } from "@/utils/id";

type DataState = {
  agents: AgentL1[];
  rules: KeywordRule[];
  submissions: KeywordSubmission[];
  items: KeywordItem[];

  createAgent: (input: { code: string; name: string; ruleId: string | null }) => { ok: boolean; message?: string };
  updateAgent: (id: string, patch: Partial<Pick<AgentL1, "name" | "status" | "ruleId">>) => void;

  createRule: (input: Omit<KeywordRule, "id" | "createdAt">) => string;
  updateRule: (id: string, patch: Partial<Omit<KeywordRule, "id" | "createdAt">>) => void;

  createSubmission: (agentId: string, keywords: string[]) => string;
  reviewSubmission: (submissionId: string, status: Exclude<KeywordReviewStatus, "draft" | "submitted">, rejectReason?: string) => {
    ok: boolean;
    message?: string;
  };
};

const seed = createDemoSeed();

function nextDisplayId(existing: KeywordSubmission[]) {
  const nums = existing
    .map((s) => Number(String(s.displayId).replace("#", "")))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 999;
  return `#${max + 1}`;
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      agents: seed.agents,
      rules: seed.rules,
      submissions: seed.submissions,
      items: seed.items,

      createAgent: ({ code, name, ruleId }) => {
        const c = code.trim().toUpperCase();
        const n = name.trim();
        if (!c || !n) return { ok: false, message: "编号与名称为必填" };
        if (!/^A\d{3,}$/.test(c)) return { ok: false, message: "编号格式示例：A001" };
        if (get().agents.some((a) => a.code === c)) return { ok: false, message: "代理编号已存在" };
        const agent: AgentL1 = {
          id: newId("agent"),
          code: c,
          name: n,
          status: "active",
          ruleId,
          createdAt: nowIso(),
        };
        set({ agents: [agent, ...get().agents] });
        return { ok: true };
      },

      updateAgent: (id, patch) => {
        set({ agents: get().agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
      },

      createRule: (input) => {
        const rule: KeywordRule = {
          ...input,
          id: newId("rule"),
          createdAt: nowIso(),
        };
        set({ rules: [rule, ...get().rules] });
        return rule.id;
      },

      updateRule: (id, patch) => {
        set({ rules: get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
      },

      createSubmission: (agentId, keywords) => {
        const submissionId = newId("sub");
        const submission: KeywordSubmission = {
          id: submissionId,
          displayId: nextDisplayId(get().submissions),
          agentId,
          status: "submitted",
          rejectReason: null,
          createdAt: nowIso(),
          reviewedAt: null,
        };

        const items: KeywordItem[] = keywords.map((k) => ({
          id: newId("item"),
          submissionId,
          keyword: k,
        }));

        set({
          submissions: [submission, ...get().submissions],
          items: [...items, ...get().items],
        });

        return submissionId;
      },

      reviewSubmission: (submissionId, status, rejectReason) => {
        const sub = get().submissions.find((s) => s.id === submissionId);
        if (!sub) return { ok: false, message: "提交不存在" };
        if (status === "rejected" && !rejectReason?.trim()) {
          return { ok: false, message: "驳回原因必填" };
        }

        set({
          submissions: get().submissions.map((s) =>
            s.id === submissionId
              ? {
                  ...s,
                  status,
                  rejectReason: status === "rejected" ? (rejectReason ?? "").trim() : null,
                  reviewedAt: nowIso(),
                }
              : s
          ),
        });

        return { ok: true };
      },
    }),
    { name: "aiadmin_data_v1" }
  )
);


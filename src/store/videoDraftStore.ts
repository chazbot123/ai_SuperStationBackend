import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlatformKey } from "@/store/appStore";

export type VideoDraftReviewStage = "draft" | "submitted" | "approved";
export type VideoDraftStatus = "ready" | "processing" | "failed";
export type VideoDraftSource = "product_video" | "avatar_video";

const SCRIPT_TEMPLATE_LINES = new Set([
  "镜头 1：开场抛出核心问题，快速建立传播钩子。",
  "镜头 2：解释产品卖点或内容重点，突出适用场景。",
  "镜头 3：补充细节或对比信息，强化可信感。",
  "镜头 4：结尾行动引导，鼓励咨询、了解或转化。",
]);

function stripScriptTemplate(script: string) {
  const text = String(script ?? "");
  if (!text) return "";
  if (![...SCRIPT_TEMPLATE_LINES].every((line) => text.includes(line))) return script;
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((line) => !SCRIPT_TEMPLATE_LINES.has(line.trim()));
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export type VideoDraftItem = {
  id: string;
  source: VideoDraftSource;
  title: string;
  platformStyle?: PlatformKey;
  publishTitle?: string;
  publishTags?: string[];
  createdAt: string;
  completedAt?: string;
  durationText: string;
  generatedScript: string;
  videoUrl: string;
  taskId?: string;
  provider?: string;
  model?: string;
  errorMessage?: string;
  reviewStage: VideoDraftReviewStage;
  status: VideoDraftStatus;
  syncedToLeads: boolean;
};

type VideoDraftState = {
  items: VideoDraftItem[];
  replaceItems: (items: VideoDraftItem[]) => void;
  prependItem: (item: VideoDraftItem) => void;
  updateItem: (id: string, patch: Partial<VideoDraftItem>) => void;
  removeItem: (id: string) => void;
};

export const useVideoDraftStore = create<VideoDraftState>()(
  persist(
    (set) => ({
      items: [],
      replaceItems: (items) =>
        set(() => ({
          items,
        })),
      prependItem: (item) =>
        set((state) => ({
          items: [item, ...state.items.filter((entry) => entry.id !== item.id)],
        })),
      updateItem: (id, patch) =>
        set((state) => ({
          items: state.items.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        })),
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((entry) => entry.id !== id),
        })),
    }),
    {
      name: "video_drafts_v1",
      version: 2,
      migrate: (persistedState) => {
        const raw = persistedState as any;
        const state = raw?.state?.items ? raw.state : raw;
        if (!state || !Array.isArray(state.items)) return state as VideoDraftState;
        return {
          ...state,
          items: state.items.map((item: VideoDraftItem) => ({
            ...item,
            generatedScript: stripScriptTemplate(item.generatedScript),
          })),
        } satisfies VideoDraftState;
      },
    }
  )
);

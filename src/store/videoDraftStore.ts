import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VideoDraftReviewStage = "draft" | "submitted" | "approved";
export type VideoDraftStatus = "ready" | "processing";
export type VideoDraftSource = "product_video" | "avatar_video";

export type VideoDraftItem = {
  id: string;
  source: VideoDraftSource;
  title: string;
  createdAt: string;
  durationText: string;
  generatedScript: string;
  videoUrl: string;
  reviewStage: VideoDraftReviewStage;
  status: VideoDraftStatus;
  syncedToLeads: boolean;
};

type VideoDraftState = {
  items: VideoDraftItem[];
  prependItem: (item: VideoDraftItem) => void;
  updateItem: (id: string, patch: Partial<VideoDraftItem>) => void;
};

export const useVideoDraftStore = create<VideoDraftState>()(
  persist(
    (set) => ({
      items: [],
      prependItem: (item) =>
        set((state) => ({
          items: [item, ...state.items.filter((entry) => entry.id !== item.id)],
        })),
      updateItem: (id, patch) =>
        set((state) => ({
          items: state.items.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        })),
    }),
    {
      name: "video_drafts_v1",
    }
  )
);

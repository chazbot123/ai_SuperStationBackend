import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProductImageDraftReviewStage = "draft" | "submitted" | "approved";
export type ProductImageDraftSizePreset = "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
export type ProductImageDraftResolution = "1k" | "2k" | "4k";

export type ProductImageDraftItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  images: string[];
  sizePreset: ProductImageDraftSizePreset;
  resolution: ProductImageDraftResolution;
  reviewStage: ProductImageDraftReviewStage;
  syncedToLeads: boolean;
  syncedToProducts: boolean;
};

type StudioProductDraftState = {
  items: ProductImageDraftItem[];
  prependItem: (item: ProductImageDraftItem) => void;
  updateItem: (id: string, patch: Partial<ProductImageDraftItem>) => void;
  removeItem: (id: string) => void;
};

export const useStudioProductDraftStore = create<StudioProductDraftState>()(
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
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((entry) => entry.id !== id),
        })),
    }),
    {
      name: "studio_product_drafts_v1",
    }
  )
);

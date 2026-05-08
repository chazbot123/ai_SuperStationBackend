import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioDraftSource = "social" | "product";

type StudioDraftInboxState = {
  unreadKeys: string[];
  markUnread: (source: StudioDraftSource, id: string) => void;
  markViewed: (source: StudioDraftSource, id: string) => void;
};

function buildKey(source: StudioDraftSource, id: string) {
  return `${source}:${id}`;
}

export const useStudioDraftInboxStore = create<StudioDraftInboxState>()(
  persist(
    (set) => ({
      unreadKeys: [],
      markUnread: (source, id) =>
        set((state) => {
          const key = buildKey(source, id);
          if (state.unreadKeys.includes(key)) {
            return state;
          }
          return { unreadKeys: [key, ...state.unreadKeys] };
        }),
      markViewed: (source, id) =>
        set((state) => ({
          unreadKeys: state.unreadKeys.filter((key) => key !== buildKey(source, id)),
        })),
    }),
    {
      name: "studio_draft_inbox_v1",
    }
  )
);

import { create } from "zustand";
import type { PlatformKey } from "@/store/appStore";
import type { VideoDraftSource } from "@/store/videoDraftStore";

export type WorkspaceUploadAsset = {
  id: string;
  name: string;
  kind: "image" | "video" | "file";
  previewUrl?: string;
};

export type VideoWorkspaceDraft = {
  question: string;
  productTemplateKey?: string;
  avatarCopyText?: string;
  productTtsText?: string;
  productSubtitleEnabled?: boolean;
  productCopyPrompt?: string;
  productCopyText?: string;
  publishTitle?: string;
  publishTags?: string[];
  platformStyle: PlatformKey;
  avatarTargetSeconds: number;
  backgroundLock: boolean;
  style: string;
  scene: string;
  durationSec: number;
  voice: string;
  ratio: string;
  resolution: "360p" | "540p" | "720p" | "1080p";
  assets: WorkspaceUploadAsset[];
  voiceId: string;
  movementAmplitude: "auto" | "low" | "medium" | "high";
  bgmEnabled: boolean;
  bgmUrl: string;
  bgmTitle: string;
  bgmVolume: number;
};

type VideoWorkspaceState = {
  drafts: Partial<Record<VideoDraftSource, VideoWorkspaceDraft>>;
  ensureDraft: (source: VideoDraftSource, defaults: VideoWorkspaceDraft) => void;
  setField: <K extends keyof VideoWorkspaceDraft>(
    source: VideoDraftSource,
    key: K,
    value: VideoWorkspaceDraft[K]
  ) => void;
  appendAssets: (source: VideoDraftSource, next: WorkspaceUploadAsset[]) => void;
  removeAsset: (source: VideoDraftSource, id: string) => void;
  clearAssets: (source: VideoDraftSource) => void;
};

export const useVideoWorkspaceStore = create<VideoWorkspaceState>()((set) => ({
  drafts: {},
  ensureDraft: (source, defaults) =>
    set((state) => {
      if (state.drafts[source]) return state;
      return {
        drafts: {
          ...state.drafts,
          [source]: defaults,
        },
      };
    }),
  setField: (source, key, value) =>
    set((state) => {
      const current = state.drafts[source];
      if (!current) return state;
      if (Object.is(current[key], value)) return state;
      return {
        drafts: {
          ...state.drafts,
          [source]: {
            ...current,
            [key]: value,
          },
        },
      };
    }),
  appendAssets: (source, next) =>
    set((state) => {
      const current = state.drafts[source];
      if (!current) return state;
      if (next.length === 0) return state;
      return {
        drafts: {
          ...state.drafts,
          [source]: {
            ...current,
            assets: [...current.assets, ...next],
          },
        },
      };
    }),
  removeAsset: (source, id) =>
    set((state) => {
      const current = state.drafts[source];
      if (!current) return state;
      const next = current.assets.filter((item) => item.id !== id);
      if (next.length === current.assets.length) return state;
      return {
        drafts: {
          ...state.drafts,
          [source]: {
            ...current,
            assets: next,
          },
        },
      };
    }),
  clearAssets: (source) =>
    set((state) => {
      const current = state.drafts[source];
      if (!current) return state;
      if (current.assets.length === 0) return state;
      return {
        drafts: {
          ...state.drafts,
          [source]: {
            ...current,
            assets: [],
          },
        },
      };
    }),
}));

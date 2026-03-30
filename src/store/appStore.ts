import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId, nowIso } from "@/utils/id";

export type PlatformKey = "xiaohongshu" | "douyin" | "wechat_mp" | "taobao";
export type ContentType = "copy" | "video";

export type CardSkinKey = "black_gold" | "iridescent" | "geo_green" | "night_gold";
export type VirtualAvatarKey = "cat" | "dog" | "dragon" | "dilireba" | "robot" | "custom";
export type SiteTemplateKey = "standard" | "split";

export type PublishStatus = "queued" | "running" | "success" | "failed";

export type ContentItem = {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  platformStyle: PlatformKey;
  images: string[];
  videoUrl?: string;
  createdAt: string;
  syncedToLeads: boolean;
};

export type PublishJob = {
  id: string;
  contentId: string;
  platforms: PlatformKey[];
  scheduledAt: string | null;
  status: PublishStatus;
  lastError: string | null;
  createdAt: string;
};

export type PurchaseRecord = {
  id: string;
  time: string;
  productName: string;
  buyerLabel: string;
  amountText: string;
};

export type WarehouseMetric = {
  id: string;
  time: string;
  productsCount: number;
  viewsCount: number;
  clicksCount: number;
};

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  images: string[];
  createdAt: string;
};

export type Settings = {
  enterpriseName: string;
  cardSkin: CardSkinKey;
  virtualAvatar: VirtualAvatarKey;
  virtualAvatarCustomUrl: string | null;
  siteTemplate: SiteTemplateKey;
  siteModules: { key: string; label: string; enabled: boolean }[];
};

type AppState = {
  contents: ContentItem[];
  publishJobs: PublishJob[];
  purchases: PurchaseRecord[];
  metrics: WarehouseMetric[];
  users: UserProfile[];
  settings: Settings;

  addContent: (input: Omit<ContentItem, "id" | "createdAt" | "syncedToLeads">) => ContentItem;
  markContentSynced: (contentId: string) => void;
  createPublishJob: (input: { contentId: string; platforms: PlatformKey[]; scheduledAt: string | null }) => PublishJob;
  updatePublishJob: (jobId: string, patch: Partial<PublishJob>) => void;

  addUser: (input: Omit<UserProfile, "id" | "createdAt">) => UserProfile;
  updateUser: (id: string, patch: Partial<UserProfile>) => void;
  removeUser: (id: string) => void;

  setCardSkin: (skin: CardSkinKey) => void;
  setEnterpriseName: (name: string) => void;
  setVirtualAvatar: (avatar: VirtualAvatarKey) => void;
  setVirtualAvatarCustomUrl: (url: string | null) => void;
  setSiteTemplate: (tpl: SiteTemplateKey) => void;
  toggleSiteModule: (key: string) => void;
  reorderSiteModules: (fromIndex: number, toIndex: number) => void;

  seedIfEmpty: () => void;
};

function seed(): Pick<AppState, "contents" | "publishJobs" | "purchases" | "metrics" | "users" | "settings"> {
  const now = Date.now();
  const contents: ContentItem[] = [
    {
      id: newId("c"),
      type: "copy",
      title: "产品A：小红书封面文案",
      body: "【小红书风】产品A推荐\n目标人群：上班族\n核心卖点：省时省力\n\n正文示例：产品A帮你更高效完成工作。\n#AI #效率",
      platformStyle: "xiaohongshu",
      images: ["https://picsum.photos/seed/xhs_1/600/800"],
      createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      syncedToLeads: true,
    },
    {
      id: newId("c"),
      type: "video",
      title: "数字人口播：产品B介绍（男声）",
      body: "30秒脚本（含分镜/旁白占位）",
      platformStyle: "douyin",
      images: [],
      videoUrl: "https://example.com/demo-video.mp4",
      createdAt: new Date(now - 5 * 3600 * 1000).toISOString(),
      syncedToLeads: true,
    },
  ];
  const publishJobs: PublishJob[] = [
    {
      id: newId("job"),
      contentId: contents[0].id,
      platforms: ["xiaohongshu", "douyin"],
      scheduledAt: new Date(now + 30 * 60 * 1000).toISOString(),
      status: "queued",
      lastError: null,
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
    },
  ];
  const purchases: PurchaseRecord[] = [
    {
      id: newId("p"),
      time: new Date(now - 3 * 60 * 1000).toISOString(),
      productName: "AI超级站套餐",
      buyerLabel: "用户A***",
      amountText: "¥1999",
    },
    {
      id: newId("p"),
      time: new Date(now - 8 * 60 * 1000).toISOString(),
      productName: "AI名片高级版",
      buyerLabel: "用户B***",
      amountText: "¥299",
    },
  ];
  const metrics: WarehouseMetric[] = [
    { id: newId("m"), time: new Date(now - 0).toISOString(), productsCount: 128, viewsCount: 45210, clicksCount: 9301 },
    { id: newId("m"), time: new Date(now - 24 * 3600 * 1000).toISOString(), productsCount: 121, viewsCount: 40112, clicksCount: 8820 },
    { id: newId("m"), time: new Date(now - 7 * 24 * 3600 * 1000).toISOString(), productsCount: 98, viewsCount: 30211, clicksCount: 6402 },
  ];
  const users: UserProfile[] = [
    {
      id: newId("u"),
      email: "demo@company.com",
      name: "周亮",
      company: "示例科技",
      title: "运营负责人",
      phone: "13800001234",
      images: ["https://picsum.photos/seed/card_1/300/300"],
      createdAt: new Date(now - 2 * 24 * 3600 * 1000).toISOString(),
    },
  ];
  const settings: Settings = {
    enterpriseName: "示例科技",
    cardSkin: "black_gold",
    virtualAvatar: "cat",
    virtualAvatarCustomUrl: null,
    siteTemplate: "standard",
    siteModules: [
      { key: "ai_attract", label: "AI招商", enabled: true },
      { key: "ai_leads", label: "AI拓客", enabled: true },
      { key: "ai_kf", label: "AI客服", enabled: true },
      { key: "ai_video", label: "AI视频", enabled: true },
    ],
  };
  return { contents, publishJobs, purchases, metrics, users, settings };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      contents: [],
      publishJobs: [],
      purchases: [],
      metrics: [],
      users: [],
      settings: seed().settings,

      addContent: (input) => {
        const item: ContentItem = {
          ...input,
          id: newId("c"),
          createdAt: nowIso(),
          syncedToLeads: false,
        };
        set({ contents: [item, ...get().contents] });
        return item;
      },
      markContentSynced: (contentId) => {
        set({
          contents: get().contents.map((c) => (c.id === contentId ? { ...c, syncedToLeads: true } : c)),
        });
      },
      createPublishJob: ({ contentId, platforms, scheduledAt }) => {
        const job: PublishJob = {
          id: newId("job"),
          contentId,
          platforms,
          scheduledAt,
          status: "queued",
          lastError: null,
          createdAt: nowIso(),
        };
        set({ publishJobs: [job, ...get().publishJobs] });
        return job;
      },
      updatePublishJob: (jobId, patch) => {
        set({ publishJobs: get().publishJobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) });
      },

      addUser: (input) => {
        const u: UserProfile = { ...input, id: newId("u"), createdAt: nowIso() };
        set({ users: [u, ...get().users] });
        return u;
      },
      updateUser: (id, patch) => {
        set({ users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
      },
      removeUser: (id) => set({ users: get().users.filter((u) => u.id !== id) }),

      setCardSkin: (skin) => set({ settings: { ...get().settings, cardSkin: skin } }),
      setEnterpriseName: (name) => set({ settings: { ...get().settings, enterpriseName: name } }),
      setVirtualAvatar: (avatar) => set({ settings: { ...get().settings, virtualAvatar: avatar } }),
      setVirtualAvatarCustomUrl: (url) => set({ settings: { ...get().settings, virtualAvatarCustomUrl: url } }),
      setSiteTemplate: (tpl) => set({ settings: { ...get().settings, siteTemplate: tpl } }),
      toggleSiteModule: (key) => {
        set({
          settings: {
            ...get().settings,
            siteModules: get().settings.siteModules.map((m) => (m.key === key ? { ...m, enabled: !m.enabled } : m)),
          },
        });
      },
      reorderSiteModules: (fromIndex, toIndex) => {
        const list = [...get().settings.siteModules];
        if (fromIndex < 0 || fromIndex >= list.length) return;
        if (toIndex < 0 || toIndex >= list.length) return;
        const [m] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, m);
        set({ settings: { ...get().settings, siteModules: list } });
      },

      seedIfEmpty: () => {
        const s = get();
        if (s.contents.length || s.publishJobs.length || s.purchases.length || s.metrics.length || s.users.length) return;
        const initial = seed();
        set(initial);
      },
    }),
    { name: "aiadmin_app_v1" }
  )
);

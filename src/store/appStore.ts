import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId, nowIso } from "@/utils/id";

export type PlatformKey =
  | "xiaohongshu"
  | "douyin"
  | "wechat_mp"
  | "kuaishou"
  | "taobao"
  | "super_site"
  | "jd"
  | "pdd";
export type ContentType = "copy" | "video" | "product";
export type ReviewStatus = "draft" | "submitted" | "approved" | "rejected";
export type SiteTemplateKey = "standard" | "split";
export type SiteMetricKey = "visits" | "consultations" | "signing_rate" | "purchases";
export type SiteMetricValueMode = "dynamic" | "fixed";

export type PublishStatus = "queued" | "running" | "success" | "failed";

export type ContentItem = {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  platformStyle: PlatformKey;
  images: string[];
  videoUrl?: string;
  requestedPlatforms?: PlatformKey[];
  createdAt: string;
  syncedToLeads: boolean;
  reviewStatus: ReviewStatus;
  submittedById?: string;
  submittedByName?: string;
  submittedByRoleKey?: string;
  submittedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedByRoleKey?: string;
  reviewedAt?: string;
  rejectReason?: string | null;
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

export type SiteModule = {
  key: string;
  label: string;
  enabled: boolean;
};

export type SiteMetricItem = {
  key: SiteMetricKey;
  label: string;
  enabled: boolean;
  valueMode: SiteMetricValueMode;
  startValue: string;
  tickInterval: string;
  incrementMin: string;
  incrementMax: string;
  fixedValue: string;
  suffix: string;
  highlight: string;
};

export type SpecialOfferItem = {
  id: string;
  name: string;
  summary: string;
  tag: string;
  priceText: string;
  originalPriceText: string;
  ctaText: string;
  images: string[];
  enabled: boolean;
};

export type IndustrySourceType = "rss" | "html";

export type IndustrySourceConfig = {
  key: string;
  label: string;
  sourceType: IndustrySourceType;
  enabled: boolean;
};

export type IndustryRefreshConfig = {
  enabled: boolean;
  frequency: "daily";
  dailyTime: string;
};

export type IndustryItem = {
  id: string;
  sourceType: IndustrySourceType | "manual";
  sourceKey: string;
  title: string;
  summary: string;
  coverImage: string;
  sourceUrl: string;
  publishedAt: string | null;
  sortOrder: number;
  isPinned: boolean;
  enabled: boolean;
  manualCreated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductStatus = "draft" | "submitted" | "live" | "rejected" | "offline";

export type ProductItem = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  ownerRoleKey: string;
  name: string;
  summary: string;
  priceText: string;
  specialOfferEnabled?: boolean;
  originalPriceText?: string;
  specialPriceText?: string;
  specialTag?: string;
  images: string[];
  status: ProductStatus;
  rejectReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  enterpriseName: string;
  siteTemplate: SiteTemplateKey;
  siteModules: SiteModule[];
  siteMetrics: SiteMetricItem[];
  specialOfferTitle: string;
  specialOfferSubtitle: string;
  specialOffers: SpecialOfferItem[];
  industrySourceConfigs: IndustrySourceConfig[];
  industryKeywords: string[];
  industryRefreshConfig: IndustryRefreshConfig;
  industryLastSyncAt: string | null;
  industryLastSyncStatus: string | null;
  industryLastSyncError: string | null;
};

type AppState = {
  contents: ContentItem[];
  products: ProductItem[];
  publishJobs: PublishJob[];
  purchases: PurchaseRecord[];
  metrics: WarehouseMetric[];
  users: UserProfile[];
  settings: Settings;

  addContent: (
    input: Omit<
      ContentItem,
      | "id"
      | "createdAt"
      | "syncedToLeads"
      | "reviewStatus"
      | "submittedById"
      | "submittedByName"
      | "submittedByRoleKey"
      | "submittedAt"
      | "reviewedById"
      | "reviewedByName"
      | "reviewedByRoleKey"
      | "reviewedAt"
      | "rejectReason"
    > & {
      syncedToLeads?: boolean;
      reviewStatus?: ReviewStatus;
      submittedById?: string;
      submittedByName?: string;
      submittedByRoleKey?: string;
      submittedAt?: string;
      reviewedById?: string;
      reviewedByName?: string;
      reviewedByRoleKey?: string;
      reviewedAt?: string;
      rejectReason?: string | null;
    }
  ) => ContentItem;
  markContentSynced: (contentId: string) => void;
  updateContent: (contentId: string, patch: Partial<ContentItem>) => void;
  createPublishJob: (input: { contentId: string; platforms: PlatformKey[]; scheduledAt: string | null }) => PublishJob;
  updatePublishJob: (jobId: string, patch: Partial<PublishJob>) => void;

  addProduct: (
    input: Omit<ProductItem, "id" | "createdAt" | "updatedAt">
  ) => ProductItem;
  updateProduct: (productId: string, patch: Partial<ProductItem>) => void;
  submitProductReview: (productId: string) => void;
  approveProduct: (productId: string) => void;
  rejectProduct: (productId: string, reason: string) => void;

  addUser: (input: Omit<UserProfile, "id" | "createdAt">) => UserProfile;
  updateUser: (id: string, patch: Partial<UserProfile>) => void;
  removeUser: (id: string) => void;

  replaceSettings: (settings: Partial<Settings>) => void;
  setEnterpriseName: (name: string) => void;
  setSiteTemplate: (tpl: SiteTemplateKey) => void;
  toggleSiteModule: (key: string) => void;
  reorderSiteModules: (fromIndex: number, toIndex: number) => void;
  toggleSiteMetric: (key: SiteMetricKey) => void;
  setSiteMetricEnabled: (key: SiteMetricKey, enabled: boolean) => void;
  updateSiteMetric: (key: SiteMetricKey, patch: Partial<SiteMetricItem>) => void;
  reorderSiteMetrics: (fromIndex: number, toIndex: number) => void;
  setSpecialOfferTitle: (title: string) => void;
  setSpecialOfferSubtitle: (subtitle: string) => void;
  addSpecialOffer: () => void;
  updateSpecialOffer: (id: string, patch: Partial<SpecialOfferItem>) => void;
  removeSpecialOffer: (id: string) => void;

  seedIfEmpty: () => void;
};

function defaultSiteModules(): SiteModule[] {
  return [
    { key: "ai_attract", label: "AI招商", enabled: true },
    { key: "ai_leads", label: "AI拓客", enabled: true },
    { key: "special_offer", label: "特价商品", enabled: true },
    { key: "ai_kf", label: "AI客服", enabled: true },
    { key: "ai_video", label: "AI视频", enabled: true },
  ];
}

function defaultSiteMetrics(): SiteMetricItem[] {
  return [
    {
      key: "visits",
      label: "访问量",
      enabled: true,
      valueMode: "dynamic",
      startValue: "2680",
      tickInterval: "8",
      incrementMin: "1",
      incrementMax: "3",
      fixedValue: "",
      suffix: "",
      highlight: "展示站点整体访问热度",
    },
    {
      key: "consultations",
      label: "咨询量",
      enabled: true,
      valueMode: "dynamic",
      startValue: "126",
      tickInterval: "15",
      incrementMin: "1",
      incrementMax: "2",
      fixedValue: "",
      suffix: "",
      highlight: "突出线索承接效率",
    },
    {
      key: "signing_rate",
      label: "招商签约率",
      enabled: true,
      valueMode: "fixed",
      startValue: "",
      tickInterval: "",
      incrementMin: "",
      incrementMax: "",
      fixedValue: "31",
      suffix: "%",
      highlight: "适合展示阶段性经营结果",
    },
    {
      key: "purchases",
      label: "购买量",
      enabled: true,
      valueMode: "dynamic",
      startValue: "880",
      tickInterval: "20",
      incrementMin: "1",
      incrementMax: "2",
      fixedValue: "",
      suffix: "",
      highlight: "适合营造成交活跃感",
    },
  ];
}

function defaultSpecialOffers(): SpecialOfferItem[] {
  return [
    {
      id: "offer-starter",
      name: "爆款引流套餐",
      summary: "限时植入首页首屏，适合拉新转化",
      tag: "今日特价",
      priceText: "¥199",
      originalPriceText: "¥399",
      ctaText: "立即抢购",
      images: [],
      enabled: true,
    },
    {
      id: "offer-pro",
      name: "企业获客升级版",
      summary: "含 AI 文案、线索承接与客服分发",
      tag: "组合优惠",
      priceText: "¥699",
      originalPriceText: "¥999",
      ctaText: "查看详情",
      images: [],
      enabled: true,
    },
    {
      id: "offer-addon",
      name: "视频种草加购包",
      summary: "搭配短视频素材与直播话术使用",
      tag: "加价购",
      priceText: "¥99",
      originalPriceText: "¥159",
      ctaText: "加入购物车",
      images: [],
      enabled: false,
    },
  ];
}

function defaultIndustrySourceConfigs(): IndustrySourceConfig[] {
  return [
    { key: "huxiu_rss", label: "虎嗅", sourceType: "rss", enabled: true },
    { key: "36kr_rss", label: "36氪", sourceType: "rss", enabled: true },
    { key: "qbitai_html", label: "量子位", sourceType: "rss", enabled: true },
    { key: "leiphone_html", label: "雷峰网", sourceType: "rss", enabled: true },
    { key: "infoq_rss", label: "InfoQ", sourceType: "rss", enabled: true },
    { key: "ifanr_rss", label: "爱范儿", sourceType: "rss", enabled: true },
    { key: "sspai_rss", label: "少数派", sourceType: "rss", enabled: true },
    { key: "geekpark_rss", label: "极客公园", sourceType: "rss", enabled: true },
  ];
}

function defaultIndustryKeywords(): string[] {
  return ["AI建站", "智能营销", "数字化招商"];
}

function defaultIndustryRefreshConfig(): IndustryRefreshConfig {
  return {
    enabled: true,
    frequency: "daily",
    dailyTime: "09:00",
  };
}

function buildSpecialOffer(index: number, patch?: Partial<SpecialOfferItem>): SpecialOfferItem {
  return {
    id: patch?.id ?? newId("offer"),
    name: patch?.name ?? `特价商品 ${index + 1}`,
    summary: patch?.summary ?? "请补充该特价位的核心卖点与优惠信息",
    tag: patch?.tag ?? "限时特惠",
    priceText: patch?.priceText ?? "¥0",
    originalPriceText: patch?.originalPriceText ?? "¥0",
    ctaText: patch?.ctaText ?? "立即查看",
    images: patch?.images ?? [],
    enabled: patch?.enabled ?? true,
  };
}

function defaultSettings(): Settings {
  return {
    enterpriseName: "示例科技",
    siteTemplate: "standard",
    siteModules: defaultSiteModules(),
    siteMetrics: defaultSiteMetrics(),
    specialOfferTitle: "特价商品专区",
    specialOfferSubtitle: "支持首页插入限时优惠、秒杀引导与爆款推荐",
    specialOffers: defaultSpecialOffers(),
    industrySourceConfigs: defaultIndustrySourceConfigs(),
    industryKeywords: defaultIndustryKeywords(),
    industryRefreshConfig: defaultIndustryRefreshConfig(),
    industryLastSyncAt: null,
    industryLastSyncStatus: null,
    industryLastSyncError: null,
  };
}

function mergeSettings(settings?: Partial<Settings> | null): Settings {
  const defaults = defaultSettings();
  const savedModules = settings?.siteModules ?? [];
  const savedMetrics = settings?.siteMetrics ?? [];
  const savedOffers = settings?.specialOffers ?? [];
  const savedIndustrySourceConfigs = settings?.industrySourceConfigs ?? [];
  const hasSavedOffers = Array.isArray(settings?.specialOffers);

  const siteModules = [
    ...savedModules,
    ...defaults.siteModules.filter((module) => !savedModules.some((saved) => saved.key === module.key)),
  ];
  const siteMetrics = [
    ...savedMetrics.map((metric) => ({
      ...defaults.siteMetrics.find((item) => item.key === metric.key),
      ...metric,
    })),
    ...defaults.siteMetrics.filter((metric) => !savedMetrics.some((saved) => saved.key === metric.key)),
  ];

  const specialOffers = hasSavedOffers
    ? savedOffers.map((offer, index) => buildSpecialOffer(index, { ...defaults.specialOffers[index], ...offer }))
    : defaults.specialOffers;

  return {
    ...defaults,
    ...settings,
    siteModules,
    siteMetrics,
    specialOffers,
    industrySourceConfigs: defaults.industrySourceConfigs.map((item) => ({
      ...item,
      enabled: savedIndustrySourceConfigs.find((saved) => saved.key === item.key)?.enabled ?? item.enabled,
    })),
    industryKeywords:
      settings?.industryKeywords?.map((item) => item.trim()).filter(Boolean).length
        ? settings.industryKeywords.map((item) => item.trim()).filter(Boolean)
        : defaults.industryKeywords,
    industryRefreshConfig: {
      ...defaults.industryRefreshConfig,
      ...(settings?.industryRefreshConfig ?? {}),
    },
    industryLastSyncAt: settings?.industryLastSyncAt ?? defaults.industryLastSyncAt,
    industryLastSyncStatus: settings?.industryLastSyncStatus ?? defaults.industryLastSyncStatus,
    industryLastSyncError: settings?.industryLastSyncError ?? defaults.industryLastSyncError,
  };
}

function seed(): Pick<AppState, "contents" | "products" | "publishJobs" | "purchases" | "metrics" | "users" | "settings"> {
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
      reviewStatus: "approved",
      rejectReason: null,
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
      reviewStatus: "approved",
      rejectReason: null,
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
  const products: ProductItem[] = [
    {
      id: "prod_main_001",
      ownerUserId: "acc_main_company",
      ownerName: "主公司",
      ownerRoleKey: "main_company",
      name: "AI电热采暖系统",
      summary: "适用于家庭与商用场景的节能采暖方案",
      priceText: "¥ 2999",
      images: ["https://picsum.photos/seed/product_main_1/800/800"],
      status: "live",
      rejectReason: null,
      submittedAt: null,
      reviewedAt: new Date(now - 6 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date(now - 9 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 6 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: "prod_agent_001",
      ownerUserId: "acc_agent_a001",
      ownerName: "一级代理 A001",
      ownerRoleKey: "level1_agent",
      name: "石墨烯节能墙暖",
      summary: "适合招商和门店展示的轻量化取暖商品",
      priceText: "¥ 1299",
      images: ["https://picsum.photos/seed/product_agent_1/800/800"],
      status: "submitted",
      rejectReason: null,
      submittedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      reviewedAt: null,
      createdAt: new Date(now - 2 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: "prod_agent_002",
      ownerUserId: "acc_agent_a001",
      ownerName: "一级代理 A001",
      ownerRoleKey: "level1_agent",
      name: "模块化地暖控制器",
      summary: "已上架商品示例，前台应展示",
      priceText: "¥ 899",
      images: ["https://picsum.photos/seed/product_agent_2/800/800"],
      status: "live",
      rejectReason: null,
      submittedAt: new Date(now - 5 * 24 * 3600 * 1000).toISOString(),
      reviewedAt: new Date(now - 4 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date(now - 7 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(now - 4 * 24 * 3600 * 1000).toISOString(),
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
  const settings = defaultSettings();
  return { contents, products, publishJobs, purchases, metrics, users, settings };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      contents: [],
      products: [],
      publishJobs: [],
      purchases: [],
      metrics: [],
      users: [],
      settings: defaultSettings(),

      addContent: (input) => {
        const item: ContentItem = {
          ...input,
          id: newId("c"),
          createdAt: nowIso(),
          syncedToLeads: input.syncedToLeads ?? false,
          reviewStatus: input.reviewStatus ?? "approved",
          rejectReason: input.rejectReason ?? null,
        };
        set({ contents: [item, ...get().contents] });
        return item;
      },
      markContentSynced: (contentId) => {
        set({
          contents: get().contents.map((c) => (c.id === contentId ? { ...c, syncedToLeads: true } : c)),
        });
      },
      updateContent: (contentId, patch) => {
        set({ contents: get().contents.map((c) => (c.id === contentId ? { ...c, ...patch } : c)) });
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

      addProduct: (input) => {
        const item: ProductItem = {
          ...input,
          id: newId("prod"),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set({ products: [item, ...get().products] });
        return item;
      },
      updateProduct: (productId, patch) => {
        set({
          products: get().products.map((p) =>
            p.id === productId ? { ...p, ...patch, updatedAt: nowIso() } : p
          ),
        });
      },
      submitProductReview: (productId) => {
        set({
          products: get().products.map((p) =>
            p.id === productId
              ? { ...p, status: "submitted", submittedAt: nowIso(), rejectReason: null, updatedAt: nowIso() }
              : p
          ),
        });
      },
      approveProduct: (productId) => {
        set({
          products: get().products.map((p) =>
            p.id === productId
              ? { ...p, status: "live", reviewedAt: nowIso(), rejectReason: null, updatedAt: nowIso() }
              : p
          ),
        });
      },
      rejectProduct: (productId, reason) => {
        set({
          products: get().products.map((p) =>
            p.id === productId
              ? { ...p, status: "rejected", reviewedAt: nowIso(), rejectReason: reason || "未填写驳回原因", updatedAt: nowIso() }
              : p
          ),
        });
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

      replaceSettings: (settings) => set({ settings: mergeSettings(settings) }),
      setEnterpriseName: (name) => set({ settings: { ...get().settings, enterpriseName: name } }),
      setSiteTemplate: (tpl) => set({ settings: { ...get().settings, siteTemplate: tpl } }),
      toggleSiteModule: (key) => {
        set({
          settings: {
            ...get().settings,
            siteModules: get().settings.siteModules.map((m) => (m.key === key ? { ...m, enabled: !m.enabled } : m)),
          },
        });
      },
      toggleSiteMetric: (key) => {
        set({
          settings: {
            ...get().settings,
            siteMetrics: get().settings.siteMetrics.map((metric) =>
              metric.key === key ? { ...metric, enabled: !metric.enabled } : metric
            ),
          },
        });
      },
      setSiteMetricEnabled: (key, enabled) => {
        set({
          settings: {
            ...get().settings,
            siteMetrics: get().settings.siteMetrics.map((metric) =>
              metric.key === key ? { ...metric, enabled } : metric
            ),
          },
        });
      },
      updateSiteMetric: (key, patch) => {
        set({
          settings: {
            ...get().settings,
            siteMetrics: get().settings.siteMetrics.map((metric) =>
              metric.key === key ? { ...metric, ...patch, key: metric.key } : metric
            ),
          },
        });
      },
      reorderSiteMetrics: (fromIndex, toIndex) => {
        const list = [...get().settings.siteMetrics];
        if (fromIndex < 0 || fromIndex >= list.length) return;
        if (toIndex < 0 || toIndex >= list.length) return;
        const [metric] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, metric);
        set({ settings: { ...get().settings, siteMetrics: list } });
      },
      reorderSiteModules: (fromIndex, toIndex) => {
        const list = [...get().settings.siteModules];
        if (fromIndex < 0 || fromIndex >= list.length) return;
        if (toIndex < 0 || toIndex >= list.length) return;
        const [m] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, m);
        set({ settings: { ...get().settings, siteModules: list } });
      },
      setSpecialOfferTitle: (title) => set({ settings: { ...get().settings, specialOfferTitle: title } }),
      setSpecialOfferSubtitle: (subtitle) => set({ settings: { ...get().settings, specialOfferSubtitle: subtitle } }),
      addSpecialOffer: () => {
        const offers = get().settings.specialOffers;
        set({
          settings: {
            ...get().settings,
            specialOffers: [...offers, buildSpecialOffer(offers.length)],
          },
        });
      },
      updateSpecialOffer: (id, patch) => {
        set({
          settings: {
            ...get().settings,
            specialOffers: get().settings.specialOffers.map((offer) =>
              offer.id === id ? { ...offer, ...patch, id: offer.id } : offer
            ),
          },
        });
      },
      removeSpecialOffer: (id) => {
        set({
          settings: {
            ...get().settings,
            specialOffers: get().settings.specialOffers.filter((offer) => offer.id !== id),
          },
        });
      },

      seedIfEmpty: () => {
        const s = get();
        if (s.contents.length || s.products.length || s.publishJobs.length || s.purchases.length || s.metrics.length || s.users.length) return;
        const initial = seed();
        set(initial);
      },
    }),
    {
      name: "aiadmin_app_v1",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<AppState>) ?? {};
        return {
          ...currentState,
          ...persisted,
          settings: mergeSettings(persisted.settings),
        };
      },
    }
  )
);

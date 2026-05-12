import { SuperSiteIndustrySourceType } from '@prisma/client';

export type SuperSiteIndustrySourceConfig = {
  key: string;
  label: string;
  sourceType: SuperSiteIndustrySourceType;
  enabled: boolean;
};

export type SuperSiteIndustryRefreshConfig = {
  enabled: boolean;
  frequency: 'daily';
  dailyTime: string;
};

export type SuperSiteIndustryItemView = {
  id: string;
  sourceType: SuperSiteIndustrySourceType;
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

export type SuperSiteIndustryCrawlRecord = {
  sourceType: Exclude<SuperSiteIndustrySourceType, 'manual'>;
  sourceKey: string;
  title: string;
  summary: string;
  coverImage: string;
  sourceUrl: string;
  publishedAt: Date | null;
  rawPayload: Record<string, unknown>;
};

export type SuperSiteIndustryCrawlResult = {
  records: SuperSiteIndustryCrawlRecord[];
  errors: string[];
};

export type SuperSiteIndustrySourceDefinition = {
  key: string;
  label: string;
  sourceType: Exclude<SuperSiteIndustrySourceType, 'manual'>;
  requestUrl: string;
  fallbackRequestUrl?: string;
};

export const SUPER_SITE_INDUSTRY_SOURCE_DEFINITIONS: SuperSiteIndustrySourceDefinition[] =
  [
    {
      key: 'huxiu_rss',
      label: '虎嗅',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.huxiu.com/rss/0.xml',
      fallbackRequestUrl: 'https://www.huxiu.com/',
    },
    {
      key: '36kr_rss',
      label: '36氪',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://36kr.com/feed',
    },
    {
      key: 'qbitai_html',
      label: '量子位',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.qbitai.com/feed',
    },
    {
      key: 'leiphone_html',
      label: '雷峰网',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.leiphone.com/feed',
    },
    {
      key: 'infoq_rss',
      label: 'InfoQ',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.infoq.cn/feed',
    },
    {
      key: 'ifanr_rss',
      label: '爱范儿',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.ifanr.com/feed',
    },
    {
      key: 'sspai_rss',
      label: '少数派',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://sspai.com/feed',
    },
    {
      key: 'geekpark_rss',
      label: '极客公园',
      sourceType: SuperSiteIndustrySourceType.rss,
      requestUrl: 'https://www.geekpark.net/rss',
    },
  ];

export function buildDefaultIndustrySourceConfigs(): SuperSiteIndustrySourceConfig[] {
  return SUPER_SITE_INDUSTRY_SOURCE_DEFINITIONS.map((item) => ({
    key: item.key,
    label: item.label,
    sourceType: item.sourceType,
    enabled: true,
  }));
}

export function buildDefaultIndustryKeywords(): string[] {
  return ['AI建站', '智能营销', '数字化招商'];
}

export function buildDefaultIndustryRefreshConfig(): SuperSiteIndustryRefreshConfig {
  return {
    enabled: true,
    frequency: 'daily',
    dailyTime: '09:00',
  };
}

export function findIndustrySourceDefinition(key: string) {
  return SUPER_SITE_INDUSTRY_SOURCE_DEFINITIONS.find((item) => item.key === key);
}

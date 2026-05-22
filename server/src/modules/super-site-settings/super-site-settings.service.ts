import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiVideoStorageService } from '../ai/ai-video-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductImageStorageService } from '../products/product-image-storage.service';
import type { ProductUploadFile } from '../products/product-image.types';
import {
  SuperSiteImageSlotDto,
  UpdateSuperSiteSettingDto,
  type SuperSiteIndustryRefreshConfigDto,
  type SuperSiteIndustrySourceConfigDto,
  type SuperSiteMetricDto,
  type SuperSiteModuleDto,
  type SuperSiteSpecialOfferDto,
  type SuperSiteVideoSettingsDto,
} from './dto/update-super-site-setting.dto';
import {
  buildDefaultIndustryKeywords,
  buildDefaultIndustryRefreshConfig,
  buildDefaultIndustrySourceConfigs,
  type SuperSiteIndustryRefreshConfig,
  type SuperSiteIndustrySourceConfig,
} from './super-site-industry.types';
import { SuperSiteIndustryQueueService } from './super-site-industry-queue.service';

type SuperSiteSettingsView = {
  enterpriseName: string;
  superSiteBaseUrl: string;
  siteTemplate: string;
  siteModules: SuperSiteModuleDto[];
  siteMetrics: SuperSiteMetricDto[];
  specialOfferTitle: string;
  specialOfferSubtitle: string;
  specialOffers: SuperSiteSpecialOfferDto[];
  siteImageSlots: SuperSiteImageSlotDto[];
  siteVideoSettings: SuperSiteVideoSettingsDto;
  industrySourceConfigs: SuperSiteIndustrySourceConfig[];
  industryKeywords: string[];
  industryRefreshConfig: SuperSiteIndustryRefreshConfig;
  industryLastSyncAt: string | null;
  industryLastSyncStatus: string | null;
  industryLastSyncError: string | null;
};

export type PublicSuperSiteSettingsView = Pick<
  SuperSiteSettingsView,
  | 'enterpriseName'
  | 'superSiteBaseUrl'
  | 'siteTemplate'
  | 'siteModules'
  | 'siteMetrics'
  | 'specialOfferTitle'
  | 'specialOfferSubtitle'
  | 'specialOffers'
  | 'siteImageSlots'
  | 'siteVideoSettings'
>;

@Injectable()
export class SuperSiteSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStorage: ProductImageStorageService,
    private readonly aiVideoStorage: AiVideoStorageService,
    @Optional()
    private readonly superSiteIndustryQueueService?: SuperSiteIndustryQueueService,
  ) {}

  async getMySettings(userId: string) {
    const existing = await this.prisma.superSiteSetting.findUnique({
      where: { userId },
    });

    if (!existing) {
      return this.buildDefaultSettings();
    }

    return this.mergeSettings({
      enterpriseName: existing.enterpriseName,
      superSiteBaseUrl: existing.superSiteBaseUrl,
      siteTemplate: existing.siteTemplate,
      siteModules: this.readJsonArray<SuperSiteModuleDto>(existing.siteModules),
      siteMetrics: this.readJsonArray<SuperSiteMetricDto>(existing.siteMetrics),
      specialOfferTitle: existing.specialOfferTitle,
      specialOfferSubtitle: existing.specialOfferSubtitle,
      specialOffers: this.readJsonArray<SuperSiteSpecialOfferDto>(existing.specialOffers),
      siteImageSlots: this.readJsonArray<SuperSiteImageSlotDto>(existing.siteImageSlots),
      siteVideoSettings:
        this.readJsonObject<SuperSiteVideoSettingsDto>(existing.siteVideoSettings) ??
        undefined,
      industrySourceConfigs: this.readJsonArray<SuperSiteIndustrySourceConfigDto>(
        existing.industrySourceConfigs,
      ),
      industryKeywords: this.readJsonArray<string>(existing.industryKeywords),
      industryRefreshConfig:
        this.readJsonObject<SuperSiteIndustryRefreshConfigDto>(
          existing.industryRefreshConfig,
        ) ?? undefined,
      industryLastSyncAt: existing.industryLastSyncAt?.toISOString() ?? null,
      industryLastSyncStatus: existing.industryLastSyncStatus,
      industryLastSyncError: existing.industryLastSyncError,
    });
  }

  async updateMySettings(userId: string, dto: UpdateSuperSiteSettingDto) {
    const current = await this.getMySettings(userId);
    const next = this.mergeSettings({
      ...current,
      ...dto,
    });

    const saved = await this.prisma.superSiteSetting.upsert({
      where: { userId },
      create: {
        userId,
        enterpriseName: next.enterpriseName,
        superSiteBaseUrl: next.superSiteBaseUrl,
        siteTemplate: next.siteTemplate,
        siteModules: next.siteModules as unknown as Prisma.InputJsonValue,
        siteMetrics: next.siteMetrics as unknown as Prisma.InputJsonValue,
        specialOfferTitle: next.specialOfferTitle,
        specialOfferSubtitle: next.specialOfferSubtitle,
        specialOffers: next.specialOffers as unknown as Prisma.InputJsonValue,
        siteImageSlots: next.siteImageSlots as unknown as Prisma.InputJsonValue,
        siteVideoSettings:
          next.siteVideoSettings as unknown as Prisma.InputJsonValue,
        industrySourceConfigs:
          next.industrySourceConfigs as unknown as Prisma.InputJsonValue,
        industryKeywords: next.industryKeywords as unknown as Prisma.InputJsonValue,
        industryRefreshConfig:
          next.industryRefreshConfig as unknown as Prisma.InputJsonValue,
        industryLastSyncAt: next.industryLastSyncAt
          ? new Date(next.industryLastSyncAt)
          : null,
        industryLastSyncStatus: next.industryLastSyncStatus,
        industryLastSyncError: next.industryLastSyncError,
      },
      update: {
        enterpriseName: next.enterpriseName,
        superSiteBaseUrl: next.superSiteBaseUrl,
        siteTemplate: next.siteTemplate,
        siteModules: next.siteModules as unknown as Prisma.InputJsonValue,
        siteMetrics: next.siteMetrics as unknown as Prisma.InputJsonValue,
        specialOfferTitle: next.specialOfferTitle,
        specialOfferSubtitle: next.specialOfferSubtitle,
        specialOffers: next.specialOffers as unknown as Prisma.InputJsonValue,
        siteImageSlots: next.siteImageSlots as unknown as Prisma.InputJsonValue,
        siteVideoSettings:
          next.siteVideoSettings as unknown as Prisma.InputJsonValue,
        industrySourceConfigs:
          next.industrySourceConfigs as unknown as Prisma.InputJsonValue,
        industryKeywords: next.industryKeywords as unknown as Prisma.InputJsonValue,
        industryRefreshConfig:
          next.industryRefreshConfig as unknown as Prisma.InputJsonValue,
        industryLastSyncAt: next.industryLastSyncAt
          ? new Date(next.industryLastSyncAt)
          : null,
        industryLastSyncStatus: next.industryLastSyncStatus,
        industryLastSyncError: next.industryLastSyncError,
      },
    });

    await this.superSiteIndustryQueueService?.syncUserScheduler(
      userId,
      next.industryRefreshConfig,
    );

    return this.mergeSettings({
      enterpriseName: saved.enterpriseName,
      superSiteBaseUrl: saved.superSiteBaseUrl,
      siteTemplate: saved.siteTemplate,
      siteModules: this.readJsonArray<SuperSiteModuleDto>(saved.siteModules),
      siteMetrics: this.readJsonArray<SuperSiteMetricDto>(saved.siteMetrics),
      specialOfferTitle: saved.specialOfferTitle,
      specialOfferSubtitle: saved.specialOfferSubtitle,
      specialOffers: this.readJsonArray<SuperSiteSpecialOfferDto>(saved.specialOffers),
      siteImageSlots: this.readJsonArray<SuperSiteImageSlotDto>(saved.siteImageSlots),
      siteVideoSettings:
        this.readJsonObject<SuperSiteVideoSettingsDto>(saved.siteVideoSettings) ??
        undefined,
      industrySourceConfigs: this.readJsonArray<SuperSiteIndustrySourceConfigDto>(
        saved.industrySourceConfigs,
      ),
      industryKeywords: this.readJsonArray<string>(saved.industryKeywords),
      industryRefreshConfig:
        this.readJsonObject<SuperSiteIndustryRefreshConfigDto>(
          saved.industryRefreshConfig,
        ) ?? undefined,
      industryLastSyncAt: saved.industryLastSyncAt?.toISOString() ?? null,
      industryLastSyncStatus: saved.industryLastSyncStatus,
      industryLastSyncError: saved.industryLastSyncError,
    });
  }

  async getPublicSettings(userId: string): Promise<PublicSuperSiteSettingsView> {
    const settings = await this.getMySettings(userId);
    return {
      enterpriseName: settings.enterpriseName,
      superSiteBaseUrl: settings.superSiteBaseUrl,
      siteTemplate: settings.siteTemplate,
      siteModules: settings.siteModules,
      siteMetrics: settings.siteMetrics,
      specialOfferTitle: settings.specialOfferTitle,
      specialOfferSubtitle: settings.specialOfferSubtitle,
      specialOffers: settings.specialOffers,
      siteImageSlots: settings.siteImageSlots,
      siteVideoSettings: settings.siteVideoSettings,
    };
  }

  async uploadSiteImage(userId: string, file?: ProductUploadFile) {
    const uploaded = await this.productImageStorage.uploadProductImage(userId, file);
    return { url: uploaded.url };
  }

  async uploadSiteVideo(userId: string, file?: ProductUploadFile) {
    this.validateVideoFile(file);
    const uploaded = await this.aiVideoStorage.uploadVideoObject({
      userId,
      taskId: 'super-site-brand-video',
      fileName: this.normalizeVideoFileName(file.originalname),
      buffer: file.buffer,
    });
    return { url: uploaded.url };
  }

  private buildDefaultSettings(): SuperSiteSettingsView {
    return {
      enterpriseName: '示例科技',
      superSiteBaseUrl: '',
      siteTemplate: 'standard',
      siteModules: [
        { key: 'ai_attract', label: 'AI招商', enabled: true },
        { key: 'ai_leads', label: 'AI拓客', enabled: true },
        { key: 'special_offer', label: '特价商品', enabled: true },
        { key: 'ai_kf', label: 'AI客服', enabled: true },
        { key: 'ai_video', label: 'AI视频', enabled: true },
      ],
      siteMetrics: [
        {
          key: 'visits',
          label: '访问量',
          enabled: true,
          valueMode: 'dynamic',
          startValue: '2680',
          tickInterval: '8',
          incrementMin: '1',
          incrementMax: '3',
          fixedValue: '',
          suffix: '',
          highlight: '展示站点整体访问热度',
        },
        {
          key: 'consultations',
          label: '咨询量',
          enabled: true,
          valueMode: 'dynamic',
          startValue: '126',
          tickInterval: '15',
          incrementMin: '1',
          incrementMax: '2',
          fixedValue: '',
          suffix: '',
          highlight: '突出线索承接效率',
        },
        {
          key: 'signing_rate',
          label: '招商签约率',
          enabled: true,
          valueMode: 'fixed',
          startValue: '',
          tickInterval: '',
          incrementMin: '',
          incrementMax: '',
          fixedValue: '31',
          suffix: '%',
          highlight: '适合展示阶段性经营结果',
        },
        {
          key: 'purchases',
          label: '购买量',
          enabled: true,
          valueMode: 'dynamic',
          startValue: '880',
          tickInterval: '20',
          incrementMin: '1',
          incrementMax: '2',
          fixedValue: '',
          suffix: '',
          highlight: '适合营造成交活跃感',
        },
      ],
      specialOfferTitle: '特价商品专区',
      specialOfferSubtitle: '支持首页插入限时优惠、秒杀引导与爆款推荐',
      specialOffers: [
        {
          id: 'offer-starter',
          name: '爆款引流套餐',
          summary: '限时植入首页首屏，适合拉新转化',
          tag: '今日特价',
          priceText: '¥199',
          originalPriceText: '¥399',
          ctaText: '立即抢购',
          images: [],
          enabled: true,
        },
        {
          id: 'offer-pro',
          name: '企业获客升级版',
          summary: '含 AI 文案、线索承接与客服分发',
          tag: '组合优惠',
          priceText: '¥699',
          originalPriceText: '¥999',
          ctaText: '查看详情',
          images: [],
          enabled: true,
        },
        {
          id: 'offer-addon',
          name: '视频种草加购包',
          summary: '搭配短视频素材与直播话术使用',
          tag: '加价购',
          priceText: '¥99',
          originalPriceText: '¥159',
          ctaText: '加入购物车',
          images: [],
          enabled: false,
        },
      ],
      siteImageSlots: [],
      siteVideoSettings: {
        videoUrl: '',
        posterUrl: '',
      },
      industrySourceConfigs: buildDefaultIndustrySourceConfigs(),
      industryKeywords: buildDefaultIndustryKeywords(),
      industryRefreshConfig: buildDefaultIndustryRefreshConfig(),
      industryLastSyncAt: null,
      industryLastSyncStatus: null,
      industryLastSyncError: null,
    };
  }

  private mergeSettings(
    settings?: Partial<SuperSiteSettingsView> | null,
  ): SuperSiteSettingsView {
    const defaults = this.buildDefaultSettings();
    const savedModules = settings?.siteModules ?? [];
    const savedMetrics = settings?.siteMetrics ?? [];
    const savedOffers = settings?.specialOffers ?? [];
    const savedImageSlots = settings?.siteImageSlots ?? [];
    const savedSiteVideoSettings = settings?.siteVideoSettings;
    const savedIndustrySourceConfigs = settings?.industrySourceConfigs ?? [];

    return {
      enterpriseName: settings?.enterpriseName ?? defaults.enterpriseName,
      superSiteBaseUrl:
        typeof settings?.superSiteBaseUrl === 'string'
          ? settings.superSiteBaseUrl.trim()
          : defaults.superSiteBaseUrl,
      siteTemplate: settings?.siteTemplate ?? defaults.siteTemplate,
      siteModules: [
        ...savedModules,
        ...defaults.siteModules.filter(
          (item) => !savedModules.some((saved) => saved.key === item.key),
        ),
      ],
      siteMetrics: [
        ...savedMetrics.map((metric) => ({
          ...defaults.siteMetrics.find((item) => item.key === metric.key),
          ...metric,
        })),
        ...defaults.siteMetrics.filter(
          (item) => !savedMetrics.some((saved) => saved.key === item.key),
        ),
      ],
      specialOfferTitle:
        settings?.specialOfferTitle ?? defaults.specialOfferTitle,
      specialOfferSubtitle:
        settings?.specialOfferSubtitle ?? defaults.specialOfferSubtitle,
      specialOffers:
        savedOffers.length > 0 ? savedOffers : defaults.specialOffers,
      siteImageSlots: savedImageSlots
        .filter((item) => item?.slotKey?.trim() && item?.moduleKey?.trim() && item?.imageUrl?.trim())
        .map((item) => ({
          slotKey: item.slotKey.trim(),
          moduleKey: item.moduleKey.trim(),
          imageUrl: item.imageUrl.trim(),
          sourceContentId: item.sourceContentId?.trim() || null,
          updatedAt: item.updatedAt?.trim() || null,
        })),
      siteVideoSettings: {
        videoUrl:
          typeof savedSiteVideoSettings?.videoUrl === 'string'
            ? savedSiteVideoSettings.videoUrl.trim()
            : defaults.siteVideoSettings.videoUrl,
        posterUrl:
          typeof savedSiteVideoSettings?.posterUrl === 'string'
            ? savedSiteVideoSettings.posterUrl.trim()
            : defaults.siteVideoSettings.posterUrl,
      },
      industrySourceConfigs: defaults.industrySourceConfigs.map((item) => ({
        ...item,
        enabled:
          savedIndustrySourceConfigs.find((saved) => saved.key === item.key)
            ?.enabled ?? item.enabled,
      })),
      industryKeywords:
        settings?.industryKeywords?.length &&
        settings.industryKeywords.some((item) => item.trim())
          ? settings.industryKeywords.map((item) => item.trim()).filter(Boolean)
          : defaults.industryKeywords,
      industryRefreshConfig: {
        ...defaults.industryRefreshConfig,
        ...(settings?.industryRefreshConfig ?? {}),
      },
      industryLastSyncAt:
        settings?.industryLastSyncAt ?? defaults.industryLastSyncAt,
      industryLastSyncStatus:
        settings?.industryLastSyncStatus ?? defaults.industryLastSyncStatus,
      industryLastSyncError:
        settings?.industryLastSyncError ?? defaults.industryLastSyncError,
    };
  }

  private readJsonArray<T>(value: Prisma.JsonValue | null): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private readJsonObject<T>(value: Prisma.JsonValue | null): T | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as T)
      : null;
  }

  private validateVideoFile(file?: ProductUploadFile): asserts file is ProductUploadFile {
    if (!file) {
      throw new BadRequestException('请选择视频文件');
    }

    if (!file.mimetype.startsWith('video/')) {
      throw new BadRequestException('仅支持上传视频文件');
    }

    if (file.size <= 0) {
      throw new BadRequestException('视频文件不能为空');
    }

    if (file.size > 200 * 1024 * 1024) {
      throw new BadRequestException('视频大小不能超过 200MB');
    }
  }

  private normalizeVideoFileName(fileName: string) {
    const trimmed = String(fileName || '').trim();
    const safe = trimmed.replace(/[^\w.\-]+/g, '-');
    return safe || 'brand-video.mp4';
  }
}

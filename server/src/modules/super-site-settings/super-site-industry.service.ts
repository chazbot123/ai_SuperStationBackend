import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SuperSiteIndustrySourceType,
  type SuperSiteIndustryItem,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuperSiteIndustryItemDto } from './dto/create-super-site-industry-item.dto';
import { ListSuperSiteIndustryItemsQueryDto } from './dto/list-super-site-industry-items-query.dto';
import { ReorderSuperSiteIndustryItemsDto } from './dto/reorder-super-site-industry-items.dto';
import { SyncSuperSiteIndustryDto } from './dto/sync-super-site-industry.dto';
import { UpdateSuperSiteIndustryItemDto } from './dto/update-super-site-industry-item.dto';
import { SuperSiteIndustryCrawlerService } from './super-site-industry-crawler.service';
import type {
  SuperSiteIndustryCrawlRecord,
  SuperSiteIndustryItemView,
  SuperSiteIndustryRefreshConfig,
  SuperSiteIndustrySourceConfig,
} from './super-site-industry.types';
import {
  buildDefaultIndustryKeywords,
  buildDefaultIndustryRefreshConfig,
  buildDefaultIndustrySourceConfigs,
} from './super-site-industry.types';

type SuperSiteIndustryItemListResult = {
  items: SuperSiteIndustryItemView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

@Injectable()
export class SuperSiteIndustryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly superSiteIndustryCrawlerService: SuperSiteIndustryCrawlerService,
  ) {}

  async listMyIndustryItems(
    userId: string,
    query: ListSuperSiteIndustryItemsQueryDto,
  ) {
    return this.listIndustryItems(userId, query, false);
  }

  async listPublicIndustryItems(
    userId: string,
    query: ListSuperSiteIndustryItemsQueryDto,
  ) {
    return this.listIndustryItems(userId, query, true);
  }

  async createMyIndustryItem(
    userId: string,
    dto: CreateSuperSiteIndustryItemDto,
  ) {
    const sortOrder = await this.getNextSortOrder(userId);
    const created = await this.prisma.superSiteIndustryItem.create({
      data: {
        userId,
        sourceType: SuperSiteIndustrySourceType.manual,
        sourceKey: 'manual',
        title: dto.title.trim(),
        summary: dto.summary?.trim() ?? '',
        coverImage: dto.coverImage?.trim() || null,
        sourceUrl: dto.sourceUrl?.trim() || null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        sortOrder,
        isPinned: dto.isPinned ?? false,
        enabled: dto.enabled ?? true,
        manualCreated: true,
      },
    });

    return this.serializeItem(created);
  }

  async updateMyIndustryItem(
    userId: string,
    itemId: string,
    dto: UpdateSuperSiteIndustryItemDto,
  ) {
    await this.ensureItemOwner(userId, itemId);
    const updated = await this.prisma.superSiteIndustryItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
        ...(dto.coverImage !== undefined
          ? { coverImage: dto.coverImage.trim() || null }
          : {}),
        ...(dto.sourceUrl !== undefined
          ? { sourceUrl: dto.sourceUrl.trim() || null }
          : {}),
        ...(dto.publishedAt !== undefined
          ? { publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
      },
    });

    return this.serializeItem(updated);
  }

  async deleteMyIndustryItem(userId: string, itemId: string) {
    await this.ensureItemOwner(userId, itemId);
    await this.prisma.superSiteIndustryItem.delete({
      where: { id: itemId },
    });
    return { success: true };
  }

  async reorderMyIndustryItems(
    userId: string,
    dto: ReorderSuperSiteIndustryItemsDto,
  ) {
    const currentItems = await this.prisma.superSiteIndustryItem.findMany({
      where: { userId },
      select: { id: true },
    });
    const currentIds = new Set(currentItems.map((item) => item.id));

    for (const id of dto.orderedIds) {
      if (!currentIds.has(id)) {
        throw new NotFoundException('存在不属于当前用户的行业信息');
      }
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.superSiteIndustryItem.update({
          where: { id },
          data: {
            sortOrder: index,
          },
        }),
      ),
    );

    return this.listMyIndustryItems(userId, {
      page: 1,
      limit: Math.max(dto.orderedIds.length, 20),
    });
  }

  async syncMyIndustryItems(userId: string, dto?: SyncSuperSiteIndustryDto) {
    const settings = await this.prisma.superSiteSetting.findUnique({
      where: { userId },
      select: {
        industrySourceConfigs: true,
        industryKeywords: true,
      },
    });

    const sourceConfigs = this.readIndustrySourceConfigs(
      settings?.industrySourceConfigs ?? null,
    );
    const keywords = this.readIndustryKeywords(settings?.industryKeywords ?? null);

    await this.updateSyncState(userId, {
      industryLastSyncStatus: 'running',
      industryLastSyncError: null,
    });

    try {
      const records = await this.superSiteIndustryCrawlerService.crawl(
        sourceConfigs,
        keywords,
        dto?.sourceKeys,
      );
      const result = await this.upsertCrawledItems(userId, records.records);
      const syncStatus =
        records.errors.length > 0
          ? result.totalFetched > 0
            ? 'partial_success'
            : 'failed'
          : 'success';
      await this.updateSyncState(userId, {
        industryLastSyncAt: new Date(),
        industryLastSyncStatus: syncStatus,
        industryLastSyncError: records.errors.length
          ? records.errors.join('；')
          : null,
      });

      return {
        ...result,
        errors: records.errors,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '行业抓取失败';
      await this.updateSyncState(userId, {
        industryLastSyncAt: new Date(),
        industryLastSyncStatus: 'failed',
        industryLastSyncError: message,
      });
      throw error;
    }
  }

  private async listIndustryItems(
    userId: string,
    query: ListSuperSiteIndustryItemsQueryDto,
    onlyEnabled: boolean,
  ): Promise<SuperSiteIndustryItemListResult> {
    const trimmedQuery = query.q?.trim();
    const publishedAtFilter = this.buildPublishedAtFilter(
      query.startDate,
      query.endDate,
    );
    const where: Prisma.SuperSiteIndustryItemWhereInput = {
      userId,
      ...(onlyEnabled ? { enabled: true } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType as any } : {}),
      ...(query.sourceKey ? { sourceKey: query.sourceKey } : {}),
      ...(publishedAtFilter ? { publishedAt: publishedAtFilter } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { title: { contains: trimmedQuery, mode: 'insensitive' } },
              { summary: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.superSiteIndustryItem.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { sortOrder: 'asc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.superSiteIndustryItem.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeItem(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  private async ensureItemOwner(userId: string, itemId: string) {
    const item = await this.prisma.superSiteIndustryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!item || item.userId !== userId) {
      throw new NotFoundException('行业信息不存在');
    }
  }

  private async getNextSortOrder(userId: string) {
    const result = await this.prisma.superSiteIndustryItem.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? -1) + 1;
  }

  private async upsertCrawledItems(
    userId: string,
    records: SuperSiteIndustryCrawlRecord[],
  ) {
    let createdCount = 0;
    let updatedCount = 0;
    let nextSortOrder = await this.getNextSortOrder(userId);

    for (const record of records) {
      const crawlHash = this.buildCrawlHash(userId, record);
      const existing = await this.prisma.superSiteIndustryItem.findFirst({
        where: {
          userId,
          OR: [
            { crawlHash },
            {
              sourceKey: record.sourceKey,
              sourceUrl: record.sourceUrl,
            },
          ],
        },
      });

      if (existing) {
        await this.prisma.superSiteIndustryItem.update({
          where: { id: existing.id },
          data: {
            sourceType: record.sourceType,
            title: record.title,
            summary: record.summary,
            coverImage: record.coverImage || null,
            sourceUrl: record.sourceUrl,
            publishedAt: record.publishedAt,
            rawPayload: record.rawPayload as Prisma.InputJsonValue,
            crawlHash,
          },
        });
        updatedCount += 1;
        continue;
      }

      await this.prisma.superSiteIndustryItem.create({
        data: {
          userId,
          sourceType: record.sourceType,
          sourceKey: record.sourceKey,
          title: record.title,
          summary: record.summary,
          coverImage: record.coverImage || null,
          sourceUrl: record.sourceUrl,
          publishedAt: record.publishedAt,
          sortOrder: nextSortOrder,
          enabled: true,
          isPinned: false,
          manualCreated: false,
          rawPayload: record.rawPayload as Prisma.InputJsonValue,
          crawlHash,
        },
      });
      createdCount += 1;
      nextSortOrder += 1;
    }

    return {
      createdCount,
      updatedCount,
      totalFetched: records.length,
      errors: [] as string[],
    };
  }

  private buildCrawlHash(
    userId: string,
    record: SuperSiteIndustryCrawlRecord,
  ) {
    return createHash('sha1')
      .update(
        [
          userId,
          record.sourceKey,
          record.sourceUrl,
          record.title,
          record.publishedAt?.toISOString() ?? '',
        ].join('|'),
      )
      .digest('hex');
  }

  private async updateSyncState(
    userId: string,
    patch: {
      industryLastSyncAt?: Date | null;
      industryLastSyncStatus?: string | null;
      industryLastSyncError?: string | null;
    },
  ) {
    await this.prisma.superSiteSetting.upsert({
      where: { userId },
      create: {
        userId,
        enterpriseName: '示例科技',
        siteTemplate: 'standard',
        siteModules: [],
        siteMetrics: [],
        specialOfferTitle: '特价商品专区',
        specialOfferSubtitle: '支持首页插入限时优惠、秒杀引导与爆款推荐',
        specialOffers: [],
        ...patch,
      },
      update: patch,
    });
  }

  private readIndustrySourceConfigs(value: Prisma.JsonValue | null | undefined) {
    const saved = Array.isArray(value)
      ? (value as SuperSiteIndustrySourceConfig[])
      : [];
    const defaults = buildDefaultIndustrySourceConfigs();
    return defaults.map((item) => ({
      ...item,
      enabled:
        saved.find((savedItem) => savedItem.key === item.key)?.enabled ??
        item.enabled,
    }));
  }

  private readIndustryKeywords(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return buildDefaultIndustryKeywords();
    }

    const keywords = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return keywords.length > 0 ? keywords : buildDefaultIndustryKeywords();
  }

  private serializeItem(item: SuperSiteIndustryItem): SuperSiteIndustryItemView {
    return {
      id: item.id,
      sourceType: item.sourceType,
      sourceKey: item.sourceKey,
      title: item.title,
      summary: item.summary,
      coverImage: item.coverImage ?? '',
      sourceUrl: item.sourceUrl ?? '',
      publishedAt: item.publishedAt?.toISOString() ?? null,
      sortOrder: item.sortOrder,
      isPinned: item.isPinned,
      enabled: item.enabled,
      manualCreated: item.manualCreated,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private buildPublishedAtFilter(startDate?: string, endDate?: string) {
    const filter: Prisma.DateTimeNullableFilter = {};

    if (startDate) {
      filter.gte = new Date(`${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      filter.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerSourcePlatform } from '@prisma/client';
import type { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { resolveAmapWebServiceKey } from './amap.config';
import { ImportGaodeStoresDto } from './dto/import-gaode-stores.dto';
import { ListStoreSearchRegionsQueryDto } from './dto/list-store-search-regions-query.dto';
import { SearchGaodeStoresDto } from './dto/search-gaode-stores.dto';
import { UpdateStoreSearchConfigDto } from './dto/update-store-search-config.dto';

const AMAP_DISTRICT_URL = 'https://restapi.amap.com/v3/config/district';
const AMAP_TEXT_SEARCH_URL = 'https://restapi.amap.com/v3/place/text';
const AMAP_STATIC_MAP_URL = 'https://restapi.amap.com/v3/staticmap';
const MAX_KEYWORDS = 10;
const MAX_SLICE_COUNT = 20;
const PAGE_SIZE = 25;
const MAX_PAGES_PER_QUERY = 8;
const MAX_REQUEST_BUDGET = 120;
const STATIC_MAP_MARKER_LIMIT = 9;
const MAX_REGION_CHILDREN = 100;
const AMAP_REQUEST_INTERVAL_MS = 250;
const AMAP_RATE_LIMIT_RETRY_DELAYS = [500, 1000, 1500];

type RegionCenter = {
  lng: number;
  lat: number;
};

type ResolvedSliceRegion = {
  name: string;
  adcode: string;
  level: string;
  center: RegionCenter | null;
};

type ResolvedRegion = ResolvedSliceRegion & {
  slices: ResolvedSliceRegion[];
};

type AmapDistrictItem = {
  adcode?: string;
  citycode?: string | string[];
  name?: string;
  level?: string;
  center?: string;
  districts?: AmapDistrictItem[];
};

type AmapDistrictResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  districts?: AmapDistrictItem[];
};

type AmapPoi = {
  id?: unknown;
  name?: unknown;
  address?: unknown;
  tel?: unknown;
  type?: unknown;
  typecode?: unknown;
  business_area?: unknown;
  location?: unknown;
  pname?: unknown;
  cityname?: unknown;
  adname?: unknown;
  website?: unknown;
  biz_ext?: {
    rating?: unknown;
    cost?: unknown;
  };
};

type AmapTextSearchResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  count?: string;
  pois?: AmapPoi[];
};

type StoreSearchRegionItem = {
  name: string;
  adcode: string;
  level: string;
  center: RegionCenter | null;
};

type SearchItem = {
  amapId: string;
  name: string;
  matchedKeywords: string[];
  telRaw: string;
  primaryPhone: string;
  address: string;
  pname: string;
  cityname: string;
  adname: string;
  businessArea: string;
  type: string;
  typecode: string;
  locationLng: number | null;
  locationLat: number | null;
  website: string;
  rating: string;
  cost: string;
};

@Injectable()
export class PublishingStoreSearchService {
  private readonly logger = new Logger(PublishingStoreSearchService.name);
  private lastAmapRequestAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getConfig(user: SessionUser) {
    const config = await this.prisma.leadStoreSearchConfig.findUnique({
      where: { userId: user.userId },
    });

    return {
      keywords: this.normalizeKeywords(
        Array.isArray(config?.keywords) ? (config?.keywords as string[]) : [],
      ),
      provinceAdcode: config?.provinceAdcode || '',
      provinceName: config?.provinceName || '',
      cityAdcode: config?.cityAdcode || '',
      cityName: config?.cityName || '',
      districtAdcode: config?.districtAdcode || '',
      districtName: config?.districtName || '',
      streetAdcode: config?.streetAdcode || '',
      streetName: config?.streetName || '',
    };
  }

  async updateConfig(user: SessionUser, dto: UpdateStoreSearchConfigDto) {
    const keywords = this.normalizeKeywords(dto.keywords);
    const provinceAdcode = this.normalizeTextValue(dto.provinceAdcode);
    const provinceName = this.normalizeTextValue(dto.provinceName);
    const cityAdcode = this.normalizeTextValue(dto.cityAdcode);
    const cityName = this.normalizeTextValue(dto.cityName);
    const districtAdcode = this.normalizeTextValue(dto.districtAdcode);
    const districtName = this.normalizeTextValue(dto.districtName);
    const streetAdcode = this.normalizeTextValue(dto.streetAdcode);
    const streetName = this.normalizeTextValue(dto.streetName);
    await this.prisma.leadStoreSearchConfig.upsert({
      where: { userId: user.userId },
      create: {
        userId: user.userId,
        keywords,
        provinceAdcode: provinceAdcode || null,
        provinceName: provinceName || null,
        cityAdcode: cityAdcode || null,
        cityName: cityName || null,
        districtAdcode: districtAdcode || null,
        districtName: districtName || null,
        streetAdcode: streetAdcode || null,
        streetName: streetName || null,
      },
      update: {
        keywords,
        provinceAdcode: provinceAdcode || null,
        provinceName: provinceName || null,
        cityAdcode: cityAdcode || null,
        cityName: cityName || null,
        districtAdcode: districtAdcode || null,
        districtName: districtName || null,
        streetAdcode: streetAdcode || null,
        streetName: streetName || null,
      },
    });

    return {
      keywords,
      provinceAdcode,
      provinceName,
      cityAdcode,
      cityName,
      districtAdcode,
      districtName,
      streetAdcode,
      streetName,
    };
  }

  async listRegions(_user: SessionUser, dto: ListStoreSearchRegionsQueryDto) {
    const amapKey = this.getAmapKey();
    const items = await this.fetchRegionChildren(
      amapKey,
      this.normalizeTextValue(dto.parentAdcode),
    );

    return {
      items,
    };
  }

  async search(user: SessionUser, dto: SearchGaodeStoresDto) {
    const regionAdcode = this.normalizeTextValue(dto.regionAdcode);
    const regionName = this.normalizeTextValue(dto.regionName);
    if (!regionAdcode || !regionName) {
      throw new BadRequestException('请先选择搜索地区');
    }

    const configKeywords = dto.keywordsOverride?.length
      ? dto.keywordsOverride
      : (await this.getConfig(user)).keywords;
    const keywords = this.normalizeKeywords(configKeywords);
    if (keywords.length === 0) {
      throw new BadRequestException('请先配置行业关键词');
    }

    const amapKey = this.getAmapKey();
    const resolvedRegion = await this.resolveRegion(amapKey, regionAdcode, regionName);

    const merged = new Map<string, SearchItem>();
    let upstreamRequestCount = 0;
    let remainingBudget = MAX_REQUEST_BUDGET;
    let partialByBudget = false;

    outer: for (const keyword of keywords) {
      for (const slice of resolvedRegion.slices) {
        if (remainingBudget <= 0) {
          partialByBudget = true;
          break outer;
        }

        const result = await this.searchSliceByKeyword(
          amapKey,
          slice,
          keyword,
          remainingBudget,
        );
        remainingBudget -= result.requestsUsed;
        upstreamRequestCount += result.requestsUsed;

        for (const item of result.items) {
          const identity = item.amapId || this.buildFallbackIdentity(item);
          const existing = merged.get(identity);
          if (existing) {
            for (const matchedKeyword of item.matchedKeywords) {
              if (!existing.matchedKeywords.includes(matchedKeyword)) {
                existing.matchedKeywords.push(matchedKeyword);
              }
            }
            if (!existing.primaryPhone && item.primaryPhone) {
              existing.primaryPhone = item.primaryPhone;
              existing.telRaw = item.telRaw;
            }
            if (!existing.address && item.address) {
              existing.address = item.address;
            }
            if (!existing.businessArea && item.businessArea) {
              existing.businessArea = item.businessArea;
            }
            if (!existing.website && item.website) {
              existing.website = item.website;
            }
            continue;
          }

          merged.set(identity, item);
        }

        if (result.partialByBudget) {
          partialByBudget = true;
          break outer;
        }
      }
    }

    const items = [...merged.values()].sort((a, b) => {
      const phoneScore = Number(Boolean(b.primaryPhone)) - Number(Boolean(a.primaryPhone));
      if (phoneScore !== 0) return phoneScore;

      const keywordScore = b.matchedKeywords.length - a.matchedKeywords.length;
      if (keywordScore !== 0) return keywordScore;

      return a.name.localeCompare(b.name, 'zh-CN');
    });
    const staticMapUrl = this.buildStaticMapUrl(amapKey, resolvedRegion, items);

    return {
      keywords,
      resolvedRegion: {
        name: resolvedRegion.name,
        adcode: resolvedRegion.adcode,
        level: resolvedRegion.level,
        center: resolvedRegion.center,
      },
      sliceRegions: resolvedRegion.slices,
      items,
      total: items.length,
      partialByBudget,
      upstreamRequestCount,
      staticMapUrl,
    };
  }

  async importToCustomerManagement(user: SessionUser, dto: ImportGaodeStoresDto) {
    this.ensureMainCompany(user);

    const normalizedItems = dto.items
      .map((item) => ({
        name: this.normalizeTextValue(item.name),
        phoneNumber: this.normalizeTextValue(item.primaryPhone || item.telRaw || ''),
        address: this.normalizeTextValue(item.address),
        remark: this.normalizeTextValue(item.type),
      }))
      .filter((item) => item.name);

    if (normalizedItems.length === 0) {
      throw new BadRequestException('没有可导入的门店数据');
    }

    const phones = normalizedItems
      .map((item) => item.phoneNumber)
      .filter(Boolean);
    const existingByPhone = phones.length
      ? await this.prisma.customerLead.findMany({
          where: {
            phoneNumber: { in: phones },
          },
          select: { phoneNumber: true },
        })
      : [];
    const existingPhoneSet = new Set(
      existingByPhone
        .map((item) => this.normalizeTextValue(item.phoneNumber))
        .filter((item): item is string => Boolean(item)),
    );

    let createdCount = 0;
    let skippedCount = 0;

    for (const item of normalizedItems) {
      if (item.phoneNumber && existingPhoneSet.has(item.phoneNumber)) {
        skippedCount += 1;
        continue;
      }

      if (item.phoneNumber) {
        const existingLead = await this.prisma.customerLead.findFirst({
          where: {
            sourcePlatform: CustomerSourcePlatform.gaode_map,
            name: item.name,
            address: item.address || null,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            phoneNumber: true,
          },
        });

        if (existingLead && !this.normalizeTextValue(existingLead.phoneNumber)) {
          await this.prisma.customerLead.update({
            where: { id: existingLead.id },
            data: {
              phoneNumber: item.phoneNumber,
              remark: item.remark || undefined,
            },
          });
          existingPhoneSet.add(item.phoneNumber);
          skippedCount += 1;
          continue;
        }
      }

      await this.prisma.customerLead.create({
        data: {
          name: item.name,
          phoneNumber: item.phoneNumber || null,
          address: item.address || null,
          remark: item.remark || null,
          wechatId: null,
          platformName: '未填写',
          sourcePlatform: CustomerSourcePlatform.gaode_map,
        },
      });
      createdCount += 1;
      if (item.phoneNumber) {
        existingPhoneSet.add(item.phoneNumber);
      }
    }

    return {
      createdCount,
      skippedCount,
    };
  }

  private getAmapKey() {
    return resolveAmapWebServiceKey(this.configService);
  }

  private async resolveRegion(
    amapKey: string,
    regionAdcode: string,
    regionName: string,
  ): Promise<ResolvedRegion> {
    const district =
      (await this.findDistrict(amapKey, regionAdcode)) ||
      (await this.findDistrict(amapKey, regionName));
    if (!district?.adcode || !district.name) {
      throw new BadRequestException('未识别到有效的搜索地区');
    }

    const baseRegion: ResolvedSliceRegion = {
      name: this.normalizeTextValue(district.name),
      adcode: this.normalizeTextValue(district.adcode),
      level: this.normalizeTextValue(district.level) || 'district',
      center: this.parseCenter(district.center),
    };

    const slices = this.buildSliceRegions(baseRegion, district.districts ?? []);
    return {
      ...baseRegion,
      slices,
    };
  }

  private async fetchRegionChildren(amapKey: string, parentAdcode?: string) {
    const keyword = parentAdcode || '中国';
    const response = await this.fetchJson<AmapDistrictResponse>(
      AMAP_DISTRICT_URL,
      {
        key: amapKey,
        keywords: keyword,
        subdistrict: '1',
        page: '1',
        offset: String(MAX_REGION_CHILDREN),
        extensions: 'base',
      },
      '地区列表加载失败',
    );

    return (response.districts?.[0]?.districts ?? [])
      .map((item) => this.toRegionItem(item))
      .filter((item): item is StoreSearchRegionItem => Boolean(item));
  }

  private async findDistrict(amapKey: string, keyword: string) {
    const normalizedKeyword = this.normalizeTextValue(keyword);
    if (!normalizedKeyword) {
      return null;
    }

    const response = await this.fetchJson<AmapDistrictResponse>(
      AMAP_DISTRICT_URL,
      {
        key: amapKey,
        keywords: normalizedKeyword,
        subdistrict: '1',
        page: '1',
        offset: String(MAX_SLICE_COUNT),
        extensions: 'base',
      },
      '行政区域解析失败',
    );

    return response.districts?.[0] ?? null;
  }

  private buildSliceRegions(
    region: ResolvedSliceRegion,
    children: AmapDistrictItem[],
  ): ResolvedSliceRegion[] {
    if (region.level === 'district' || region.level === 'street') {
      return [region];
    }

    const slices = children
      .map((item) => ({
        name: this.normalizeTextValue(item.name),
        adcode: this.normalizeTextValue(item.adcode),
        level: this.normalizeTextValue(item.level) || 'district',
        center: this.parseCenter(item.center),
      }))
      .filter((item) => item.name && item.adcode)
      .slice(0, MAX_SLICE_COUNT);

    if (slices.length === 0) {
      return [region];
    }

    return slices;
  }

  private async searchSliceByKeyword(
    amapKey: string,
    slice: ResolvedSliceRegion,
    keyword: string,
    remainingBudget: number,
  ) {
    const items: SearchItem[] = [];
    let requestsUsed = 0;

    const firstPage = await this.searchPoiPage(amapKey, slice, keyword, 1);
    requestsUsed += 1;
    items.push(...firstPage.items);

    const count = Math.min(firstPage.count, PAGE_SIZE * MAX_PAGES_PER_QUERY);
    const totalPages = Math.min(
      MAX_PAGES_PER_QUERY,
      Math.max(1, Math.ceil(count / PAGE_SIZE)),
    );
    let partialByBudget = false;

    for (let page = 2; page <= totalPages; page += 1) {
      if (requestsUsed >= remainingBudget) {
        partialByBudget = true;
        break;
      }

      const nextPage = await this.searchPoiPage(amapKey, slice, keyword, page);
      requestsUsed += 1;
      items.push(...nextPage.items);
      if (nextPage.items.length < PAGE_SIZE) {
        break;
      }
    }

    return {
      items,
      requestsUsed,
      partialByBudget,
    };
  }

  private async searchPoiPage(
    amapKey: string,
    slice: ResolvedSliceRegion,
    keyword: string,
    page: number,
  ) {
    const response = await this.fetchJson<AmapTextSearchResponse>(
      AMAP_TEXT_SEARCH_URL,
      {
        key: amapKey,
        keywords: keyword,
        city: slice.adcode,
        citylimit: 'true',
        extensions: 'all',
        offset: String(PAGE_SIZE),
        page: String(page),
      },
      `${slice.name} ${keyword} 搜索失败`,
    );

    const count = Number.parseInt(this.normalizeTextValue(response.count) || '0', 10);
    return {
      count: Number.isNaN(count) ? 0 : count,
      items: (response.pois ?? [])
        .map((poi) => this.toSearchItem(poi, keyword))
        .filter((item): item is SearchItem => Boolean(item)),
    };
  }

  private toSearchItem(poi: AmapPoi, keyword: string): SearchItem | null {
    const name = this.normalizeTextValue(poi.name);
    if (!name) {
      return null;
    }

    const location = this.parseCenter(poi.location);
    const telRaw = this.normalizeTextValue(poi.tel);
    const primaryPhone = this.normalizePhone(telRaw);

    return {
      amapId: this.normalizeTextValue(poi.id) || this.buildPoiIdentity(name, location),
      name,
      matchedKeywords: [keyword],
      telRaw,
      primaryPhone,
      address: this.normalizeTextValue(poi.address),
      pname: this.normalizeTextValue(poi.pname),
      cityname: this.normalizeTextValue(poi.cityname),
      adname: this.normalizeTextValue(poi.adname),
      businessArea: this.normalizeBusinessArea(poi.business_area),
      type: this.normalizeTextValue(poi.type),
      typecode: this.normalizeTextValue(poi.typecode),
      locationLng: location?.lng ?? null,
      locationLat: location?.lat ?? null,
      website: this.normalizeTextValue(poi.website),
      rating: this.normalizeTextValue(poi.biz_ext?.rating),
      cost: this.normalizeTextValue(poi.biz_ext?.cost),
    };
  }

  private buildStaticMapUrl(
    amapKey: string,
    resolvedRegion: ResolvedRegion,
    items: SearchItem[],
  ) {
    const center = resolvedRegion.center;
    if (!center) {
      return '';
    }

    const params = new URLSearchParams({
      key: amapKey,
      location: `${center.lng},${center.lat}`,
      zoom: this.pickZoom(resolvedRegion.level),
      size: '900*320',
      scale: '2',
      traffic: '0',
    });

    params.set(
      'labels',
      `${this.truncateLabel(resolvedRegion.name)},0,1,14,0xFFFFFF,0x2563eb:${center.lng},${center.lat}`,
    );

    const markerLocations = items
      .filter((item) => item.locationLng !== null && item.locationLat !== null)
      .slice(0, STATIC_MAP_MARKER_LIMIT)
      .map((item) => `${item.locationLng},${item.locationLat}`);
    if (markerLocations.length > 0) {
      params.set(
        'markers',
        `mid,0xDC2626,:${markerLocations.join(';')}`,
      );
    }

    return `${AMAP_STATIC_MAP_URL}?${params.toString()}`;
  }

  private pickZoom(level: string) {
    if (level === 'province') return '6';
    if (level === 'city') return '9';
    return '11';
  }

  private normalizeKeywords(keywords: string[]) {
    return [...new Set(
      keywords
        .map((item) => this.normalizeTextValue(item))
        .filter(Boolean)
        .slice(0, MAX_KEYWORDS),
    )];
  }

  private normalizePhone(value: string) {
    return this.normalizeTextValue(value)
      .split(/[;,，/、\s]+/)
      .map((item) => item.trim())
      .find(Boolean) || '';
  }

  private normalizeBusinessArea(value?: unknown) {
    return this.normalizeTextValue(value);
  }

  private normalizeTextValue(value: unknown) {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .join('、');
    }
    return '';
  }

  private toRegionItem(item: AmapDistrictItem): StoreSearchRegionItem | null {
    const name = this.normalizeTextValue(item.name);
    const adcode = this.normalizeTextValue(item.adcode);
    if (!name || !adcode) {
      return null;
    }

    return {
      name,
      adcode,
      level: this.normalizeTextValue(item.level),
      center: this.parseCenter(item.center),
    };
  }

  private parseCenter(value?: unknown) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const [lngText, latText] = trimmed.split(',');
      const lng = Number.parseFloat(lngText || '');
      const lat = Number.parseFloat(latText || '');
      if (Number.isNaN(lng) || Number.isNaN(lat)) {
        return null;
      }
      return { lng, lat };
    }
    if (Array.isArray(value) && value.length >= 2) {
      const lng = Number.parseFloat(String(value[0] ?? ''));
      const lat = Number.parseFloat(String(value[1] ?? ''));
      if (Number.isNaN(lng) || Number.isNaN(lat)) {
        return null;
      }
      return { lng, lat };
    }
    if (value && typeof value === 'object') {
      const maybeLng = (value as { lng?: unknown; lon?: unknown; longitude?: unknown }).lng
        ?? (value as { lon?: unknown }).lon
        ?? (value as { longitude?: unknown }).longitude;
      const maybeLat = (value as { lat?: unknown; latitude?: unknown }).lat
        ?? (value as { latitude?: unknown }).latitude;
      const lng = Number.parseFloat(String(maybeLng ?? ''));
      const lat = Number.parseFloat(String(maybeLat ?? ''));
      if (Number.isNaN(lng) || Number.isNaN(lat)) {
        return null;
      }
      return { lng, lat };
    }
    return null;
  }

  private buildPoiIdentity(name: string, center: RegionCenter | null) {
    if (!center) {
      return name;
    }
    return `${name}|${center.lng},${center.lat}`;
  }

  private buildFallbackIdentity(item: SearchItem) {
    if (item.locationLng !== null && item.locationLat !== null) {
      return `${item.name}|${item.locationLng},${item.locationLat}`;
    }
    return item.name;
  }

  private truncateLabel(value: string) {
    return value.length > 10 ? value.slice(0, 10) : value;
  }

  private async fetchJson<T extends { status?: string; info?: string }>(
    baseUrl: string,
    params: Record<string, string>,
    errorMessage: string,
  ) {
    const url = `${baseUrl}?${new URLSearchParams(params).toString()}`;

    for (let attempt = 0; attempt <= AMAP_RATE_LIMIT_RETRY_DELAYS.length; attempt += 1) {
      await this.waitForAmapRateLimitWindow();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(errorMessage);
      }

      const payload = (await response.json()) as T & {
        info?: string;
        infocode?: string;
      };
      if (payload.status === '1') {
        return payload;
      }

      const amapInfo = this.normalizeTextValue(payload.info);
      const amapInfoCode = this.normalizeTextValue(payload.infocode);
      this.logger.warn(
        `${errorMessage}: ${amapInfo || 'unknown'}${amapInfoCode ? ` (${amapInfoCode})` : ''}`,
      );

      if (this.isAmapRateLimitError(amapInfo) && attempt < AMAP_RATE_LIMIT_RETRY_DELAYS.length) {
        await this.sleep(AMAP_RATE_LIMIT_RETRY_DELAYS[attempt]);
        continue;
      }

      throw new ServiceUnavailableException(
        this.buildAmapErrorMessage(errorMessage, amapInfo, amapInfoCode),
      );
    }
    throw new ServiceUnavailableException(errorMessage);
  }

  private async waitForAmapRateLimitWindow() {
    const now = Date.now();
    const waitMs = this.lastAmapRequestAt + AMAP_REQUEST_INTERVAL_MS - now;
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.lastAmapRequestAt = Date.now();
  }

  private isAmapRateLimitError(info: string) {
    return info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT';
  }

  private buildAmapErrorMessage(baseMessage: string, info: string, infoCode: string) {
    if (info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT') {
      return '高德接口当前限流，请稍后重试';
    }
    if (
      info === 'DAILY_QUERY_OVER_LIMIT'
      || info === 'USER_DAILY_QUERY_OVER_LIMIT'
      || info === 'ACCESS_TOO_FREQUENT'
    ) {
      return '高德接口当日额度已用尽，请更换 Key 或次日再试';
    }
    if (info === 'INVALID_USER_KEY' || info === 'SERVICE_NOT_AVAILABLE') {
      return '高德地图服务密钥无效或未开通对应能力，请检查 Key 配置';
    }
    if (info === 'USERKEY_PLAT_NOMATCH') {
      return '当前高德 Key 与接口平台类型不匹配。门店搜索使用的是高德 Web 服务接口，请改用 Web 服务 Key，并确认已开通对应能力';
    }
    if (info || infoCode) {
      return `${baseMessage}：${info}${infoCode ? ` (${infoCode})` : ''}`;
    }
    return baseMessage;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可导入到客户管理');
    }
  }
}

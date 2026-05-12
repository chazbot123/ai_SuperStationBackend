import { Injectable, Logger } from '@nestjs/common';
import {
  type SuperSiteIndustryCrawlRecord,
  type SuperSiteIndustryCrawlResult,
  type SuperSiteIndustrySourceConfig,
  type SuperSiteIndustrySourceDefinition,
  SUPER_SITE_INDUSTRY_SOURCE_DEFINITIONS,
  findIndustrySourceDefinition,
} from './super-site-industry.types';

@Injectable()
export class SuperSiteIndustryCrawlerService {
  private readonly logger = new Logger(SuperSiteIndustryCrawlerService.name);

  async crawl(
    sourceConfigs: SuperSiteIndustrySourceConfig[],
    keywords: string[],
    sourceKeys?: string[],
  ): Promise<SuperSiteIndustryCrawlResult> {
    const enabledSourceKeys = new Set(
      sourceConfigs.filter((item) => item.enabled).map((item) => item.key),
    );
    const targetSourceKeys = sourceKeys?.length
      ? sourceKeys.filter((item) => enabledSourceKeys.has(item))
      : [...enabledSourceKeys];
    const targetDefinitions = SUPER_SITE_INDUSTRY_SOURCE_DEFINITIONS.filter(
      (item) => targetSourceKeys.includes(item.key),
    );

    const records = await Promise.allSettled(
      targetDefinitions.map(async (definition) => {
        if (definition.sourceType === 'rss') {
          return this.crawlRssSource(definition, keywords);
        }

        return this.crawlHtmlSource(
          definition.requestUrl,
          definition.key,
          keywords,
        );
      }),
    );

    const errors: string[] = [];
    const fulfilledRecords: SuperSiteIndustryCrawlRecord[] = [];

    records.forEach((result, index) => {
      const definition = targetDefinitions[index];
      if (result.status === 'fulfilled') {
        fulfilledRecords.push(...result.value);
        return;
      }

      const message = `${definition.label} 抓取失败`;
      errors.push(message);
      this.logger.warn(
        `${message}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
    });

    return {
      records: fulfilledRecords,
      errors,
    };
  }

  private async crawlRssSource(
    definition: SuperSiteIndustrySourceDefinition,
    keywords: string[],
  ): Promise<SuperSiteIndustryCrawlRecord[]> {
    const { requestUrl, key: sourceKey, fallbackRequestUrl } = definition;
    const response = await fetch(requestUrl);
    if (!response.ok) {
      if (fallbackRequestUrl) {
        this.logger.warn(
          `${definition.label} 源不可用，回退站点页抓取: ${response.status}`,
        );
        const fallbackRecords = await this.crawlHtmlSource(
          fallbackRequestUrl,
          sourceKey,
          keywords,
        );
        if (fallbackRecords.length > 0) {
          return fallbackRecords;
        }

        throw new Error(`来源不可用且站点页无可解析内容: ${sourceKey}`);
      }
      throw new Error(`来源抓取失败: ${sourceKey}`);
    }

    const xmlText = await response.text();
    const blocks =
      this.matchBlocks(xmlText, 'item').length > 0
        ? this.matchBlocks(xmlText, 'item')
        : this.matchBlocks(xmlText, 'entry');

    const records = blocks
      .map((block) => {
        const title = this.decodeText(this.readXmlTagValue(block, 'title'));
        const sourceUrl = this.normalizeSourceUrl(
          this.readXmlTagValue(block, 'link') ||
            this.matchAttribute(block, 'link', 'href') ||
            '',
        );
        const summary = this.decodeText(
          this.readXmlTagValue(block, 'description') ||
            this.readXmlTagValue(block, 'summary') ||
            '',
        );
        const publishedAt = this.parseDate(
          this.readXmlTagValue(block, 'pubDate') ||
            this.readXmlTagValue(block, 'published') ||
            this.readXmlTagValue(block, 'updated') ||
            '',
        );

        return {
          sourceType: 'rss' as const,
          sourceKey,
          title,
          summary,
          coverImage: '',
          sourceUrl: sourceUrl.trim(),
          publishedAt,
          rawPayload: {
            title,
            sourceUrl,
            publishedAt: publishedAt?.toISOString() ?? null,
          },
        };
      })
      .filter((item) => this.hasValidShape(item.title, item.sourceUrl));

    const filteredRecords = this.applyKeywordFilter(records, keywords).slice(0, 20);
    if (filteredRecords.length === 0) {
      throw new Error(`来源暂无可解析内容: ${sourceKey}`);
    }

    return filteredRecords;
  }

  private async crawlHtmlSource(
    requestUrl: string,
    sourceKey: string,
    keywords: string[],
  ): Promise<SuperSiteIndustryCrawlRecord[]> {
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`HTML 抓取失败: ${sourceKey}`);
    }

    const htmlText = await response.text();
    const normalizedHtml = htmlText
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/\s+/g, ' ');
    const anchorRegex = /<a[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const items = new Map<string, SuperSiteIndustryCrawlRecord>();

    for (const match of normalizedHtml.matchAll(anchorRegex)) {
      const rawUrl = match[1]?.trim() ?? '';
      const title = this.decodeText(this.stripHtml(match[2] ?? ''));
      if (!this.hasValidShape(title, rawUrl)) {
        continue;
      }

      const sourceUrl = this.toAbsoluteUrl(rawUrl, requestUrl);
      if (!sourceUrl || items.has(sourceUrl)) {
        continue;
      }

      items.set(sourceUrl, {
        sourceType: 'html',
        sourceKey,
        title,
        summary: '',
        coverImage: '',
        sourceUrl,
        publishedAt: null,
        rawPayload: {
          title,
          sourceUrl,
        },
      });
    }

    return this.applyKeywordFilter([...items.values()], keywords).slice(0, 20);
  }

  getSourceLabels(sourceConfigs: SuperSiteIndustrySourceConfig[]) {
    return sourceConfigs.map((item) => ({
      ...item,
      label: findIndustrySourceDefinition(item.key)?.label ?? item.label,
    }));
  }

  private hasValidShape(title: string, sourceUrl: string) {
    const normalizedTitle = title.trim();
    const normalizedUrl = sourceUrl.trim();
    if (!normalizedTitle || normalizedTitle.length < 6 || !normalizedUrl) {
      return false;
    }

    return true;
  }

  private applyKeywordFilter(
    records: SuperSiteIndustryCrawlRecord[],
    keywords: string[],
  ) {
    if (!keywords.length) {
      return records;
    }

    const normalizedKeywords = keywords
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (!normalizedKeywords.length) {
      return records;
    }

    const matched = records.filter((item) => {
      const keywordText =
        `${item.title} ${item.summary} ${item.sourceUrl}`.toLowerCase();
      return normalizedKeywords.some((keyword) => keywordText.includes(keyword));
    });

    return matched.length > 0 ? matched : records;
  }

  private matchBlocks(text: string, tagName: string) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
    return [...text.matchAll(regex)].map((item) => item[1] ?? '');
  }

  private matchTag(text: string, tagName: string) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = text.match(regex);
    return match ? this.stripHtml(match[1] ?? '') : null;
  }

  private matchCdata(text: string, tagName: string) {
    const regex = new RegExp(
      `<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`,
      'i',
    );
    const match = text.match(regex);
    return match ? match[1] ?? '' : null;
  }

  private matchAttribute(text: string, tagName: string, attribute: string) {
    const regex = new RegExp(
      `<${tagName}[^>]*${attribute}=["']([^"']+)["'][^>]*\\/?>`,
      'i',
    );
    const match = text.match(regex);
    return match ? match[1] ?? null : null;
  }

  private stripHtml(text: string) {
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private decodeText(text: string) {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeXmlText(text: string) {
    return this.decodeText(
      text
        .replace(/<!\[CDATA\[/gi, '')
        .replace(/\]\]>/gi, ''),
    );
  }

  private readXmlTagValue(text: string, tagName: string) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = text.match(regex);
    return match ? this.decodeXmlText(match[1] ?? '') : '';
  }

  private normalizeSourceUrl(value: string) {
    const cleaned = value
      .replace(/<!\[CDATA\[/gi, '')
      .replace(/\]\]>/gi, '')
      .trim();
    return this.toAbsoluteUrl(cleaned, cleaned);
  }

  private toAbsoluteUrl(url: string, baseUrl: string) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return '';
    }
  }

  private parseDate(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}

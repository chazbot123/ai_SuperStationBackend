import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

type DouyinClientTokenResponse = {
  message?: string;
  data?: {
    access_token?: string;
    expires_in?: number;
    description?: string;
  };
};

type DouyinOpenTicketResponse = {
  data?: {
    ticket?: string;
    expires_in?: number;
  };
};

type CachedValue = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class DouyinShareSchemaService {
  private readonly logger = new Logger(DouyinShareSchemaService.name);
  private cachedClientToken: CachedValue | null = null;
  private cachedTicket: CachedValue | null = null;

  constructor(private readonly configService: ConfigService) {}

  async generateShareSchema(input: {
    title: string;
    topics: string[];
    videoUrl?: string | null;
    imageUrls?: string[];
    downloadType?: number;
    privateStatus?: number;
    shareId?: string;
  }) {
    const clientKey = this.getClientKey();
    const ticket = await this.getOpenTicket();
    const nonceStr = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(ticket, nonceStr, timestamp);

    const url = new URL('snssdk1128://openplatform/share');
    const query = url.searchParams;
    query.set('client_key', clientKey);
    if (input.shareId) {
      query.set('state', input.shareId);
    }
    query.set('nonce_str', nonceStr);
    if (input.title) {
      query.set('title', input.title);
    }
    query.set('timestamp', timestamp);
    query.set('signature', signature);
    query.set('share_type', 'h5');

    const normalizedVideoUrl = input.videoUrl?.trim();
    if (normalizedVideoUrl) {
      query.set('video_path', normalizedVideoUrl);
      query.set('share_to_publish', '1');
    }

    const normalizedImages = (input.imageUrls ?? [])
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item));
    if (normalizedImages.length > 0) {
      query.set('image_list_path', JSON.stringify(normalizedImages));
    }

    const normalizedTopics = (input.topics ?? [])
      .map((topic) => topic?.trim())
      .filter((topic): topic is string => Boolean(topic));
    if (normalizedTopics.length > 0) {
      query.set(
        'title_hashtag_list',
        JSON.stringify(
          normalizedTopics.map((topic) => ({
            name: topic,
            start: input.title.length,
          })),
        ),
      );
    }

    if (input.downloadType !== undefined) {
      query.set('download_type', String(input.downloadType));
    }
    if (input.privateStatus !== undefined) {
      query.set('private_status', String(input.privateStatus));
    }

    return url.toString().replace(/\+/g, '%20');
  }

  private async getOpenTicket() {
    const now = Date.now();
    if (this.cachedTicket && this.cachedTicket.expiresAt > now + 30_000) {
      return this.cachedTicket.value;
    }

    const clientToken = await this.getClientToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('https://open.douyin.com/open/getticket/', {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'access-token': clientToken,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        this.logger.warn(`[douyin-ticket] http=${response.status} body=${text.slice(0, 200)}`);
        throw new ConflictException('抖音 Open Ticket 获取失败');
      }

      const payload = (text ? (JSON.parse(text) as DouyinOpenTicketResponse) : {}) as DouyinOpenTicketResponse;
      const ticket = payload.data?.ticket?.trim();
      if (!ticket) {
        throw new ConflictException('抖音 Open Ticket 返回缺少 ticket');
      }
      const expiresIn = Number(payload.data?.expires_in ?? 0);
      const expiresAt = now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 60 * 60 * 1000);
      this.cachedTicket = {
        value: ticket,
        expiresAt,
      };
      return ticket;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getClientToken() {
    const now = Date.now();
    if (this.cachedClientToken && this.cachedClientToken.expiresAt > now + 30_000) {
      return this.cachedClientToken.value;
    }

    const clientKey = this.getClientKey();
    const clientSecret = this.getClientSecret();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('https://open.douyin.com/oauth/client_token/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: 'client_credential',
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        this.logger.warn(`[douyin-client-token] http=${response.status} body=${text.slice(0, 200)}`);
        throw new ConflictException('抖音 Client Token 获取失败');
      }

      const payload = (text ? (JSON.parse(text) as DouyinClientTokenResponse) : {}) as DouyinClientTokenResponse;
      if ((payload.message || '').toLowerCase() !== 'success') {
        throw new ConflictException(payload.data?.description || '抖音 Client Token 获取失败');
      }
      const token = payload.data?.access_token?.trim();
      if (!token) {
        throw new ConflictException('抖音 Client Token 返回缺少 access_token');
      }
      const expiresIn = Number(payload.data?.expires_in ?? 0);
      const expiresAt = now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 2 * 60 * 60 * 1000);
      this.cachedClientToken = {
        value: token,
        expiresAt,
      };
      this.cachedTicket = null;
      return token;
    } finally {
      clearTimeout(timeout);
    }
  }

  private generateSignature(ticket: string, nonceStr: string, timestamp: string) {
    const signStr = `nonce_str=${nonceStr}&ticket=${ticket}&timestamp=${timestamp}`;
    return createHash('md5').update(signStr).digest('hex');
  }

  private getClientKey() {
    const clientKey = this.configService.get<string>('DOUYIN_OPEN_CLIENT_KEY')?.trim();
    if (!clientKey) {
      throw new ConflictException('未配置抖音开放平台 Client Key');
    }
    return clientKey;
  }

  private getClientSecret() {
    const clientSecret = this.configService.get<string>('DOUYIN_OPEN_CLIENT_SECRET')?.trim();
    if (!clientSecret) {
      throw new ConflictException('未配置抖音开放平台 Client Secret');
    }
    return clientSecret;
  }
}


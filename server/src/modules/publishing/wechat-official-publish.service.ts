import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LeadPublishJob, LeadPlatformAccount } from '@prisma/client';
import * as crypto from 'crypto';

type WechatUploadImgResponse = {
  url?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatUploadMaterialResponse = {
  media_id?: string;
  url?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatUploadNewsResponse = {
  media_id?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatSubmitPublishResponse = {
  errcode?: number;
  errmsg?: string;
};

type WechatQueryPublishResponse = {
  status?: string;
  url?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatRefreshAuthorizerTokenResponse = {
  authorizer_access_token?: string;
  expires_in?: number;
  authorizer_refresh_token?: string;
  errcode?: number;
  errmsg?: string;
};

type OfficialWechatTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
  authorizerAppId: string;
};

@Injectable()
export class WechatOfficialPublishService {
  private readonly logger = new Logger(WechatOfficialPublishService.name);

  constructor(private readonly configService: ConfigService) {}

  async publishMpNewsFromJob(input: {
    job: Pick<LeadPublishJob, 'draftTitle' | 'draftBody' | 'draftImages' | 'draftVideoUrl'>;
    leadContent: { title: string; body: string; images: string[]; coverImage: string | null };
    account: Pick<LeadPlatformAccount, 'authPayloadEncrypted' | 'authType'>;
    componentAccessToken: string;
    componentAppId: string;
  }) {
    if (input.job.draftVideoUrl?.trim()) {
      throw new ConflictException('微信公众号官方发布当前仅支持图文');
    }

    const token = this.readTokenPayload(input.account.authType, input.account.authPayloadEncrypted);

    const coverUrl = this.pickFirstUrl([
      input.job.draftImages[0],
      input.leadContent.coverImage,
      input.leadContent.images[0],
    ]);
    if (!coverUrl) {
      throw new ConflictException('微信公众号发布需要封面图');
    }

    const bodyText = (input.job.draftBody || input.leadContent.body || '').trim();
    const images = (input.job.draftImages.length ? input.job.draftImages : input.leadContent.images)
      .map((item) => (item || '').trim())
      .filter(Boolean);

    const title = (input.job.draftTitle || input.leadContent.title || '公众号图文').trim();

    const publish = async (accessToken: string) => {
      const thumbMediaId = await this.uploadCoverImageAsMaterial(accessToken, coverUrl);

      const uploadedImages: string[] = [];
      for (const url of images) {
        const uploaded = await this.uploadArticleImage(accessToken, url);
        uploadedImages.push(uploaded);
      }

      const content = this.buildArticleHtml(bodyText, uploadedImages);
      const mediaId = await this.uploadNews(accessToken, {
        title,
        thumbMediaId,
        content,
        digest: '',
        showCoverPic: 1,
      });

      await this.submitPublish(accessToken, mediaId);
      const query = await this.queryPublish(accessToken, mediaId);
      return {
        mediaId,
        url: query.url || null,
        status: query.status || 'submitted',
      };
    };

    try {
      const result = await publish(token.accessToken);
      return { result, token: null as { accessToken: string; refreshToken: string | null } | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const shouldRefresh =
        Boolean(token.refreshToken) &&
        (message.includes('access_token') ||
          message.toLowerCase().includes('token') ||
          message.includes('invalid credential') ||
          message.includes('access_token expired'));
      if (!shouldRefresh) throw error;

      const refreshed = await this.refreshAuthorizerToken({
        componentAccessToken: input.componentAccessToken,
        componentAppId: input.componentAppId,
        authorizerAppId: token.authorizerAppId,
        authorizerRefreshToken: token.refreshToken ?? '',
      });

      const result = await publish(refreshed.accessToken);
      return { result, token: refreshed };
    }
  }

  private readTokenPayload(authType: LeadPlatformAccount['authType'], encrypted: string): OfficialWechatTokenPayload {
    if (authType !== 'token') {
      throw new ConflictException('平台账号授权类型不匹配');
    }
    const raw = this.decryptAuthPayload(encrypted);
    let payload: unknown = {};
    try {
      payload = raw ? (JSON.parse(raw) as unknown) : {};
    } catch {
      throw new ConflictException('平台账号 Token 数据格式异常');
    }
    if (!payload || typeof payload !== 'object') {
      throw new ConflictException('平台账号 Token 数据格式异常');
    }

    const accessToken =
      typeof (payload as { accessToken?: unknown }).accessToken === 'string'
        ? ((payload as { accessToken: string }).accessToken || '').trim()
        : '';
    const refreshToken =
      typeof (payload as { refreshToken?: unknown }).refreshToken === 'string'
        ? ((payload as { refreshToken: string }).refreshToken || '').trim()
        : null;
    const authorizerAppId =
      typeof (payload as { authorizerAppId?: unknown }).authorizerAppId === 'string'
        ? ((payload as { authorizerAppId: string }).authorizerAppId || '').trim()
        : '';

    if (!accessToken) throw new ConflictException('平台账号缺少 accessToken');
    if (!authorizerAppId) throw new ConflictException('平台账号缺少 authorizerAppId');
    return { accessToken, refreshToken, authorizerAppId };
  }

  private async refreshAuthorizerToken(input: {
    componentAccessToken: string;
    componentAppId: string;
    authorizerAppId: string;
    authorizerRefreshToken: string;
  }) {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token');
    url.searchParams.set('component_access_token', input.componentAccessToken);

    const payload = await this.requestJson<WechatRefreshAuthorizerTokenResponse>(url.toString(), {
      component_appid: input.componentAppId,
      authorizer_appid: input.authorizerAppId,
      authorizer_refresh_token: input.authorizerRefreshToken,
    });

    const accessToken = (payload.authorizer_access_token || '').trim();
    if (!accessToken) {
      throw new ConflictException(payload.errmsg || '微信公众号刷新 authorizer_access_token 失败');
    }
    const refreshToken = (payload.authorizer_refresh_token || '').trim() || null;
    return {
      accessToken,
      refreshToken,
    };
  }

  private async uploadCoverImageAsMaterial(accessToken: string, coverUrl: string) {
    const bytes = await this.fetchBytes(coverUrl, 10 * 1024 * 1024, '封面素材');

    const url = new URL('https://api.weixin.qq.com/cgi-bin/material/add_material');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('type', 'image');

    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(bytes)]), 'cover');

    const payload = await this.requestJson<WechatUploadMaterialResponse>(url.toString(), form, true);
    const mediaId = (payload.media_id || '').trim();
    if (!mediaId) {
      throw new ConflictException(payload.errmsg || '微信公众号上传封面失败');
    }
    return mediaId;
  }

  private async uploadArticleImage(accessToken: string, imageUrl: string) {
    const bytes = await this.fetchBytes(imageUrl, 10 * 1024 * 1024, '正文图片');

    const url = new URL('https://api.weixin.qq.com/cgi-bin/media/uploadimg');
    url.searchParams.set('access_token', accessToken);

    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(bytes)]), 'image');

    const payload = await this.requestJson<WechatUploadImgResponse>(url.toString(), form, true);
    const uploadedUrl = (payload.url || '').trim();
    if (!uploadedUrl) {
      throw new ConflictException(payload.errmsg || '微信公众号上传正文图片失败');
    }
    return uploadedUrl;
  }

  private async uploadNews(
    accessToken: string,
    input: {
      title: string;
      thumbMediaId: string;
      content: string;
      digest: string;
      showCoverPic: 0 | 1;
    },
  ) {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/publish/uploadnews');
    url.searchParams.set('access_token', accessToken);

    const payload = await this.requestJson<WechatUploadNewsResponse>(url.toString(), {
      articles: [
        {
          title: input.title,
          thumb_media_id: input.thumbMediaId,
          author: '',
          digest: input.digest,
          show_cover_pic: input.showCoverPic,
          content: input.content,
          content_source_url: '',
          need_open_comment: 0,
          only_fans_can_comment: 0,
        },
      ],
    });

    const mediaId = (payload.media_id || '').trim();
    if (!mediaId) {
      throw new ConflictException(payload.errmsg || '微信公众号上传图文失败');
    }
    return mediaId;
  }

  private async submitPublish(accessToken: string, mediaId: string) {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/publish/submit');
    url.searchParams.set('access_token', accessToken);

    const payload = await this.requestJson<WechatSubmitPublishResponse>(url.toString(), {
      media_id: mediaId,
      msgtype: 'mpnews',
    });
    if (payload.errcode && payload.errcode !== 0) {
      throw new ConflictException(payload.errmsg || '微信公众号提交发布失败');
    }
  }

  private async queryPublish(accessToken: string, mediaId: string) {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/publish/query');
    url.searchParams.set('access_token', accessToken);

    const payload = await this.requestJson<WechatQueryPublishResponse>(url.toString(), {
      media_id: mediaId,
    });
    if (payload.errcode && payload.errcode !== 0) {
      throw new ConflictException(payload.errmsg || '微信公众号查询发布状态失败');
    }
    return payload;
  }

  private buildArticleHtml(body: string, imageUrls: string[]) {
    const parts: string[] = [];
    if (body) {
      const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        parts.push(`<p>${this.escapeHtml(line)}</p>`);
      }
    }

    for (const url of imageUrls) {
      parts.push(`<p><img src="${this.escapeHtml(url)}" /></p>`);
    }

    if (!parts.length) {
      parts.push('<p></p>');
    }
    return parts.join('');
  }

  private escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private pickFirstUrl(values: Array<string | null | undefined>) {
    for (const value of values) {
      const trimmed = (value || '').trim();
      if (trimmed) return trimmed;
    }
    return '';
  }

  private async fetchBytes(url: string, maxSize: number, label: string) {
    const response = await fetch(url, { headers: { Accept: '*/*' }, redirect: 'follow' });
    if (!response.ok) {
      throw new ConflictException(`微信公众号${label}下载失败：${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= 0) {
      throw new ConflictException(`微信公众号${label}为空`);
    }
    if (bytes.length > maxSize) {
      throw new ConflictException(`微信公众号${label}不能超过 ${Math.floor(maxSize / 1024 / 1024)}MB`);
    }
    return bytes;
  }

  private async requestJson<T extends Record<string, unknown>>(
    url: string,
    body: Record<string, unknown> | FormData,
    isMultipart = false,
  ): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: isMultipart ? undefined : { 'content-type': 'application/json' },
      body: isMultipart ? (body as FormData) : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      this.logger.warn(`[wechat-official] invalid json http=${response.status} body=${text.slice(0, 200)}`);
      throw new ConflictException(`微信公众号接口返回异常：HTTP ${response.status}`);
    }

    if (!response.ok) {
      const msg =
        typeof (parsed as { errmsg?: unknown }).errmsg === 'string'
          ? ((parsed as { errmsg: string }).errmsg || '').trim()
          : '';
      throw new ConflictException(msg || `微信公众号接口失败：HTTP ${response.status}`);
    }

    const payload = parsed as Record<string, unknown>;
    const errcode = typeof payload.errcode === 'number' ? payload.errcode : null;
    if (errcode && errcode !== 0) {
      const errmsg = typeof payload.errmsg === 'string' ? payload.errmsg : '';
      throw new ConflictException(errmsg || `微信公众号接口错误：${errcode}`);
    }

    return payload as unknown as T;
  }

  private decryptAuthPayload(value: string) {
    const [ivBase64, tagBase64, encryptedBase64] = value.split('.');
    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new ConflictException('平台登录信息格式无效');
    }
    const key = this.getPlatformAccountSecretKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private getPlatformAccountSecretKey() {
    const secret =
      this.configService.get<string>('PLATFORM_ACCOUNT_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'change_me_platform_account_secret';
    return crypto.createHash('sha256').update(secret).digest();
  }
}

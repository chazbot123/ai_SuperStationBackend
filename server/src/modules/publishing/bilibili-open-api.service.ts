import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

type BilibiliApiResponse<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type BilibiliInitResponse = {
  upload_token?: string;
};

type BilibiliCoverUploadResponse = {
  url?: string;
};

type BilibiliSubmitResponse = {
  resource_id?: string;
};

@Injectable()
export class BilibiliOpenApiService {
  private readonly logger = new Logger(BilibiliOpenApiService.name);

  constructor(private readonly configService: ConfigService) {}

  async publishVideoFromUrl(input: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    videoUrl: string;
    coverUrl: string;
    title: string;
    desc: string;
    tags: string[];
    tid?: number;
    copyright?: 1 | 2;
    source?: string;
    noReprint?: 0 | 1;
  }) {
    const uploadToken = await this.initUpload({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      name: `video_${Date.now()}.mp4`,
    });

    await this.uploadVideoByParts({
      uploadToken,
      videoUrl: input.videoUrl,
    });

    await this.completeUpload({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      uploadToken,
    });

    const cover = await this.uploadCover({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      coverUrl: input.coverUrl,
    });

    const submit = await this.submitArchive({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      uploadToken,
      title: input.title,
      desc: input.desc,
      coverUrl: cover,
      tid: input.tid ?? this.getDefaultTid(),
      tag: this.buildTagValue(input.tags),
      copyright: input.copyright ?? 1,
      source: input.source ?? '',
      noReprint: input.noReprint ?? 0,
    });

    return {
      resourceId: submit,
      playUrl: `https://www.bilibili.com/video/${submit}`,
    };
  }

  private getDefaultTid() {
    const raw = this.configService.get<string>('BILIBILI_DEFAULT_TID')?.trim() || '';
    const parsed = Number(raw);
    if (raw && !Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return 21;
  }

  private buildTagValue(tags: string[]) {
    const normalized = tags.map((item) => item.trim()).filter(Boolean);
    if (!normalized.length) return '投稿';
    return normalized.join(',');
  }

  private async initUpload(input: {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    name: string;
  }) {
    const url = 'https://member.bilibili.com/arcopen/fn/archive/video/init';
    const body = JSON.stringify({ name: input.name, utype: '0' });
    const headers = this.buildSignedHeaders({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      body,
      contentType: 'application/json',
    });

    const payload = await this.requestJson<BilibiliInitResponse>(url, {
      method: 'POST',
      headers,
      body,
    });
    const token = payload.upload_token?.trim() || '';
    if (!token) {
      throw new ConflictException('B站文件上传预处理返回缺少 upload_token');
    }
    return token;
  }

  private async uploadVideoByParts(input: { uploadToken: string; videoUrl: string }) {
    const response = await fetch(input.videoUrl, {
      headers: { Accept: '*/*' },
      redirect: 'follow',
    });
    if (!response.ok || !response.body) {
      throw new ConflictException(`B站视频素材下载失败：${response.status}`);
    }

    const reader = response.body.getReader();
    const partSize = 8 * 1024 * 1024;
    let partNumber = 1;
    let buffer = new Uint8Array(0);

    const flushPart = async (chunk: Uint8Array) => {
      const url = new URL('https://openupos.bilivideo.com/video/v2/part/upload');
      url.searchParams.set('upload_token', input.uploadToken);
      url.searchParams.set('part_number', String(partNumber));

      const partResponse = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
        },
        body: chunk,
      } as RequestInit);
      const text = await partResponse.text();
      if (!partResponse.ok) {
        this.logger.warn(`[bilibili-upload] part=${partNumber} http=${partResponse.status} body=${text.slice(0, 200)}`);
        throw new ConflictException(`B站分片上传失败：HTTP ${partResponse.status}`);
      }
      const payload = this.parseJson(text) as Record<string, unknown>;
      const code = typeof payload.code === 'number' ? payload.code : null;
      if (code !== null && code !== 0) {
        const message = typeof payload.message === 'string' ? payload.message : '';
        throw new ConflictException(message || 'B站分片上传失败');
      }
      partNumber += 1;
    };

    const concat = (left: Uint8Array, right: Uint8Array) => {
      const merged = new Uint8Array(left.length + right.length);
      merged.set(left, 0);
      merged.set(right, left.length);
      return merged;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      buffer = concat(buffer, value);
      while (buffer.length >= partSize) {
        const chunk = buffer.slice(0, partSize);
        buffer = buffer.slice(partSize);
        await flushPart(chunk);
      }
    }

    if (buffer.length > 0) {
      await flushPart(buffer);
    }
  }

  private async completeUpload(input: {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    uploadToken: string;
  }) {
    const url = new URL('https://member.bilibili.com/arcopen/fn/archive/video/complete');
    url.searchParams.set('upload_token', input.uploadToken);

    const headers = this.buildSignedHeaders({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      body: '',
      contentType: 'application/json',
    });

    await this.requestJson(url.toString(), {
      method: 'POST',
      headers,
      body: undefined,
    });
  }

  private async uploadCover(input: {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    coverUrl: string;
  }) {
    const bytes = await this.fetchBytes(input.coverUrl, 5 * 1024 * 1024, 'B站封面');

    const url = 'https://member.bilibili.com/arcopen/fn/archive/cover/upload';
    const headers = this.buildSignedHeaders({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      body: '',
    });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)]), 'cover');

    const payload = await this.requestJson<BilibiliCoverUploadResponse>(url, {
      method: 'POST',
      headers,
      body: form,
    });
    const coverUrl = payload.url?.trim() || '';
    if (!coverUrl) {
      throw new ConflictException('B站封面上传失败');
    }
    return coverUrl;
  }

  private async submitArchive(input: {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    uploadToken: string;
    title: string;
    coverUrl: string;
    tid: number;
    tag: string;
    desc: string;
    copyright: 1 | 2;
    source: string;
    noReprint: 0 | 1;
  }) {
    const url = new URL('https://member.bilibili.com/arcopen/fn/archive/add-by-utoken');
    url.searchParams.set('upload_token', input.uploadToken);

    const body = JSON.stringify({
      title: input.title,
      cover: input.coverUrl,
      tid: input.tid,
      no_reprint: input.noReprint,
      desc: input.desc,
      tag: input.tag,
      copyright: input.copyright,
      source: input.source,
    });

    const headers = this.buildSignedHeaders({
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      body,
      contentType: 'application/json',
    });

    const payload = await this.requestJson<BilibiliSubmitResponse>(url.toString(), {
      method: 'POST',
      headers,
      body,
    });

    const resourceId = payload.resource_id?.trim() || '';
    if (!resourceId) {
      throw new ConflictException('B站稿件提交返回缺少 resource_id');
    }
    return resourceId;
  }

  private buildSignedHeaders(input: {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    body: string;
    contentType?: string;
  }) {
    const nonce = crypto.randomBytes(16).toString('base64url');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const contentMd5 = crypto.createHash('md5').update(input.body || '').digest('hex');

    const headers = {
      Accept: 'application/json',
      ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
      'Access-Token': input.accessToken,
      'X-Bili-Accesskeyid': input.clientId,
      'X-Bili-Content-Md5': contentMd5,
      'X-Bili-Signature-Method': 'HMAC-SHA256',
      'X-Bili-Signature-Nonce': nonce,
      'X-Bili-Signature-Version': '2.0',
      'X-Bili-Timestamp': timestamp,
    };

    const signaturePayload = [
      `x-bili-accesskeyid:${headers['X-Bili-Accesskeyid']}`,
      `x-bili-content-md5:${headers['X-Bili-Content-Md5']}`,
      `x-bili-signature-method:${headers['X-Bili-Signature-Method']}`,
      `x-bili-signature-nonce:${headers['X-Bili-Signature-Nonce']}`,
      `x-bili-signature-version:${headers['X-Bili-Signature-Version']}`,
      `x-bili-timestamp:${headers['X-Bili-Timestamp']}`,
    ].join('\n');

    return {
      ...headers,
      Authorization: crypto
        .createHmac('sha256', input.clientSecret)
        .update(signaturePayload)
        .digest('hex'),
    };
  }

  private async fetchBytes(url: string, maxSize: number, label: string) {
    const response = await fetch(url, { headers: { Accept: '*/*' }, redirect: 'follow' });
    if (!response.ok) {
      throw new ConflictException(`${label}下载失败：${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= 0) {
      throw new ConflictException(`${label}为空`);
    }
    if (bytes.length > maxSize) {
      throw new ConflictException(`${label}不能超过 ${Math.floor(maxSize / 1024 / 1024)}MB`);
    }
    return bytes;
  }

  private parseJson(text: string) {
    try {
      return text ? (JSON.parse(text) as unknown) : {};
    } catch {
      return {};
    }
  }

  private async requestJson<T extends Record<string, unknown>>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetch(url, init);
    const text = await response.text();
    const json = this.parseJson(text) as BilibiliApiResponse<T>;

    if (!response.ok) {
      throw new ConflictException(json.message || `B站接口失败：HTTP ${response.status}`);
    }

    const code = typeof json.code === 'number' ? json.code : null;
    if (code !== null && code !== 0) {
      throw new ConflictException(json.message || `B站接口错误：${code}`);
    }
    if (!json.data) {
      return {} as T;
    }
    return json.data as T;
  }
}

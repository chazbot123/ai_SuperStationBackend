import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

type JsonRpcSuccess = { jsonrpc: '2.0'; id: string | number; result: unknown };
type JsonRpcError = {
  jsonrpc: '2.0';
  id: string | number;
  error: { code?: number; message?: string; data?: unknown };
};

type AitoearnEnvelope<T> = {
  code: number;
  message?: string;
  data?: T;
};

@Injectable()
export class AitoearnUnifiedMcpService {
  private readonly logger = new Logger(AitoearnUnifiedMcpService.name);
  private cachedDouyinPublishToolName: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  isEnabled() {
    return Boolean(this.getApiKey() && this.getApiUrl());
  }

  async publishDouyinDraft(input: {
    accountId: string;
    title: string;
    body: string;
    tags: string[];
    images: string[];
    videoUrl: string | null;
  }) {
    const toolName = await this.resolveDouyinPublishToolName();
    const result = await this.callRpc('tools/call', {
      name: toolName,
      arguments: {
        accountId: input.accountId,
        title: input.title,
        body: input.body,
        tags: input.tags,
        images: input.images,
        videoUrl: input.videoUrl,
      },
    });

    const draftUrl = this.extractFirstUrl(result);
    const externalDraftId = this.readFirstKeyField(result, [
      'draftId',
      'draft_id',
      'externalDraftId',
    ]);
    const externalFlowId = this.readFirstKeyField(result, [
      'flowId',
      'flow_id',
      'externalFlowId',
      'taskId',
    ]);

    return {
      draftUrl,
      externalDraftId,
      externalFlowId,
      raw: result,
    };
  }

  private getApiKey() {
    return this.configService.get<string>('AITOEARN_MCP_API_KEY')?.trim() || '';
  }

  private getApiUrl() {
    const configured = this.configService.get<string>('AITOEARN_MCP_BASE_URL')?.trim() || '';
    if (!configured) return '';

    try {
      const url = new URL(configured);
      if (url.pathname.includes('/api/')) {
        return url.toString();
      }
      url.pathname = '/api/unified/mcp';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return '';
    }
  }

  private async resolveDouyinPublishToolName() {
    if (this.cachedDouyinPublishToolName) {
      return this.cachedDouyinPublishToolName;
    }

    const tools = await this.callRpc('tools/list', {});
    const toolName = this.pickToolName(tools);
    if (!toolName) {
      throw new Error('AiToEarn MCP 未找到抖音发布工具');
    }

    this.cachedDouyinPublishToolName = toolName;
    return toolName;
  }

  private pickToolName(value: unknown) {
    const items = this.readField(value, ['tools']);
    if (!Array.isArray(items)) return '';

    const candidates = items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const name =
          typeof (item as { name?: unknown }).name === 'string'
            ? ((item as { name: string }).name || '').trim()
            : '';
        const description =
          typeof (item as { description?: unknown }).description === 'string'
            ? ((item as { description: string }).description || '').trim()
            : '';
        return { name, description };
      })
      .filter((item): item is { name: string; description: string } => Boolean(item?.name));

    const normalized = candidates.map((item) => ({
      ...item,
      combined: `${item.name} ${item.description}`.toLowerCase(),
    }));

    const matched =
      normalized.find((item) => item.combined.includes('douyin') && item.combined.includes('publish')) ||
      normalized.find((item) => item.combined.includes('抖音') && item.combined.includes('发布')) ||
      normalized.find((item) => item.combined.includes('douyin')) ||
      normalized.find((item) => item.combined.includes('抖音'));

    return matched?.name || '';
  }

  private async callRpc(method: string, params: Record<string, unknown>) {
    const payload = {
      jsonrpc: '2.0',
      id: randomBytes(8).toString('hex'),
      method,
      params,
    };

    const data = await this.request(payload);
    if (!data || typeof data !== 'object') {
      throw new Error('AiToEarn MCP 返回格式异常');
    }

    if ((data as { jsonrpc?: unknown }).jsonrpc === '2.0') {
      const rpc = data as JsonRpcSuccess | JsonRpcError;
      if ('error' in rpc && rpc.error) {
        throw new Error(rpc.error.message || 'AiToEarn MCP 调用失败');
      }
      if ('result' in rpc) {
        return rpc.result;
      }
      throw new Error('AiToEarn MCP 缺少 result');
    }

    const envelope = data as AitoearnEnvelope<unknown>;
    if (typeof envelope.code === 'number') {
      if (envelope.code !== 0) {
        throw new Error(envelope.message || 'AiToEarn MCP 调用失败');
      }
      return envelope.data;
    }

    return data;
  }

  private async request(body: unknown) {
    const url = this.getApiUrl();
    const apiKey = this.getApiKey();
    if (!url || !apiKey) {
      throw new Error('AiToEarn MCP 未配置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        this.logger.warn(`[mcp] http=${response.status} body=${text.slice(0, 200)}`);
        throw new Error(`AiToEarn MCP HTTP ${response.status}`);
      }

      try {
        return JSON.parse(text) as unknown;
      } catch {
        this.logger.warn(`[mcp] invalid json: ${text.slice(0, 200)}`);
        throw new Error('AiToEarn MCP 返回非 JSON');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractFirstUrl(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string') {
      const match = value.match(/https?:\/\/[^\s"']+/);
      return match?.[0] ?? null;
    }

    const asString = JSON.stringify(value);
    const match = asString.match(/https?:\/\/[^\s"']+/);
    return match?.[0] ?? null;
  }

  private readField(value: unknown, path: string[]) {
    if (!value || typeof value !== 'object') return null;

    let current: unknown = value;
    for (const key of path) {
      if (!current || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[key];
    }
    return current ?? null;
  }

  private readFirstKeyField(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const found = record[key];
      if (found !== undefined && found !== null && `${found}`.trim() !== '') {
        return found;
      }
    }
    return null;
  }
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BitBrowserRuntimeProvider } from './bitbrowser.contracts';
import type {
  BitBrowserBrowserCreatePayload,
  BitBrowserCreateProfileResult,
  BitBrowserOpenProfileResult,
  BrowserProfileBinding,
  CreateBitBrowserProfileInput,
  PlatformType,
} from './bitbrowser.types';

export interface BitBrowserGatewayEndpointConfig {
  health: string;
  updateBrowser: string;
  updateBrowserPartial: string;
  openBrowser: string;
  closeBrowser: string;
  deleteBrowser: string;
  browserDetail: string;
  groupList: string;
  groupAdd: string;
}

export interface BitBrowserGatewayConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  endpoints?: Partial<BitBrowserGatewayEndpointConfig>;
  platformHomeUrls?: Partial<Record<PlatformType, string>>;
  openArgs?: string[];
  queueOpen?: boolean;
}

interface BitBrowserApiEnvelope<T> {
  success: boolean;
  data?: T;
  msg?: string;
}

interface BitBrowserHealthData {
  success: true;
}

interface BitBrowserBrowserOpenData {
  ws?: string;
  http?: string;
  coreVersion?: string;
  driver?: string;
  id?: string;
}

interface BitBrowserBrowserDetailData {
  id: string;
  name?: string;
  remark?: string;
  platform?: string;
  url?: string;
  cookie?: string;
  groupId?: string;
  proxyMethod?: number;
  proxyType?: string;
  syncExtensions?: boolean;
  syncUserExtensions?: boolean;
}

interface BitBrowserBrowserUpdateData {
  id?: string;
  name?: string;
}

interface BitBrowserGroupData {
  id?: string;
  groupId?: string;
  groupName?: string;
  name?: string;
}

const DEFAULT_GATEWAY_ENDPOINTS: BitBrowserGatewayEndpointConfig = {
  health: '/health',
  updateBrowser: '/browser/update',
  updateBrowserPartial: '/browser/update/partial',
  openBrowser: '/browser/open',
  closeBrowser: '/browser/close',
  deleteBrowser: '/browser/delete',
  browserDetail: '/browser/detail',
  groupList: '/group/list',
  groupAdd: '/group/add',
};

const DEFAULT_PLATFORM_HOME_URLS: Partial<Record<PlatformType, string>> = {
  douyin: 'https://creator.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  wechat_video: 'https://channels.weixin.qq.com/',
  wechat_mp: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
};

function joinUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function reportDouyinLoginDebug(
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>,
) {
  let url = 'http://127.0.0.1:7777/event';
  let sessionId = 'douyin-login-page';
  try {
    const envText = readFileSync(
      resolve(process.cwd(), '..', '.dbg', 'douyin-login-page.env'),
      'utf8',
    );
    url = envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() ?? url;
    sessionId =
      envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() ?? sessionId;
  } catch {}

  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}

export function createBitBrowserGatewayEndpoints(
  config: BitBrowserGatewayConfig,
): BitBrowserGatewayEndpointConfig {
  const merged = {
    ...DEFAULT_GATEWAY_ENDPOINTS,
    ...(config.endpoints ?? {}),
  };

  return {
    health: joinUrl(config.baseUrl, merged.health),
    updateBrowser: joinUrl(config.baseUrl, merged.updateBrowser),
    updateBrowserPartial: joinUrl(config.baseUrl, merged.updateBrowserPartial),
    openBrowser: joinUrl(config.baseUrl, merged.openBrowser),
    closeBrowser: joinUrl(config.baseUrl, merged.closeBrowser),
    deleteBrowser: joinUrl(config.baseUrl, merged.deleteBrowser),
    browserDetail: joinUrl(config.baseUrl, merged.browserDetail),
    groupList: joinUrl(config.baseUrl, merged.groupList),
    groupAdd: joinUrl(config.baseUrl, merged.groupAdd),
  };
}

export class BitBrowserGatewayClient implements BitBrowserRuntimeProvider {
  private readonly endpoints: BitBrowserGatewayEndpointConfig;
  private readonly platformHomeUrls: Partial<Record<PlatformType, string>>;

  constructor(private readonly config: BitBrowserGatewayConfig) {
    this.endpoints = createBitBrowserGatewayEndpoints(config);
    this.platformHomeUrls = {
      ...DEFAULT_PLATFORM_HOME_URLS,
      ...(config.platformHomeUrls ?? {}),
    };
  }

  async healthcheck(): Promise<{ status: 'ok' | 'error'; message?: string }> {
    const response = await this.requestEnvelope<BitBrowserHealthData>(
      this.endpoints.health,
      {
        method: 'POST',
      },
    );

    return response.success
      ? { status: 'ok' }
      : { status: 'error', message: response.msg ?? 'healthcheck failed' };
  }

  async createProfile(
    input: CreateBitBrowserProfileInput,
    payload: BitBrowserBrowserCreatePayload,
  ): Promise<BitBrowserCreateProfileResult> {
    const data = await this.updateBrowser(payload);
    const profileId =
      typeof data.id === 'string' && data.id.trim()
        ? data.id
        : null;

    if (!profileId) {
      throw new Error('BitBrowser 创建窗口成功但未返回窗口 id');
    }

    return {
      profileId,
      profileName: payload.name || input.profileName,
      browserConfig: payload,
    };
  }

  async openProfile(
    binding: BrowserProfileBinding,
  ): Promise<BitBrowserOpenProfileResult> {
    const detail = await this.detailBrowser(binding.profileId);
    if (!detail) {
      throw new Error(
        `BitBrowser profile ${binding.profileId} 不存在，请先在 BitBrowser 中创建窗口并绑定该 profileId`,
      );
    }

    await this.ensureProfileExtensionSync(binding.profileId, detail);

    // #region debug-point B:gateway-open-profile
    await reportDouyinLoginDebug(
      'B',
      'bitbrowser.gateway:openProfile:before',
      'openProfile request prepared',
      {
        profileId: binding.profileId,
        profileName: binding.profileName,
        detailName: detail.name ?? null,
        detailUrl: detail.url ?? null,
        openArgs: this.config.openArgs ?? [],
        queueOpen: this.config.queueOpen ?? true,
      },
    );
    // #endregion

    const response = await this.requestEnvelope<BitBrowserBrowserOpenData>(
      this.endpoints.openBrowser,
      {
        method: 'POST',
        body: {
          id: binding.profileId,
          args: this.config.openArgs ?? [],
          queue: this.config.queueOpen ?? true,
        },
      },
    );

    const data = this.unwrapResponse(response, '打开 BitBrowser 窗口失败');
    // #region debug-point B:gateway-open-profile-result
    await reportDouyinLoginDebug(
      'B',
      'bitbrowser.gateway:openProfile:after',
      'openProfile response received',
      {
        profileId: binding.profileId,
        debugUrl: typeof data.http === 'string' ? data.http : '',
        wsEndpoint: typeof data.ws === 'string' ? data.ws : null,
        coreVersion: typeof data.coreVersion === 'string' ? data.coreVersion : null,
      },
    );
    // #endregion
    return {
      profileId: binding.profileId,
      debugUrl: typeof data.http === 'string' ? data.http : '',
      wsEndpoint: typeof data.ws === 'string' ? data.ws : null,
    };
  }

  async closeProfile(binding: BrowserProfileBinding): Promise<void> {
    await this.closeProfileById(binding.profileId);
  }

  async closeProfileById(profileId: string): Promise<void> {
    // #region debug-point H2:gateway-close-profile-before
    await reportDouyinLoginDebug(
      'H2',
      'bitbrowser.gateway:closeProfileById:before',
      'closeProfile request prepared',
      {
        profileId,
      },
    );
    // #endregion
    const response = await this.requestEnvelope<Record<string, unknown>>(
      this.endpoints.closeBrowser,
      {
        method: 'POST',
        body: {
          id: profileId,
        },
      },
    );
    // #region debug-point H2:gateway-close-profile-after
    await reportDouyinLoginDebug(
      'H2',
      'bitbrowser.gateway:closeProfileById:after',
      'closeProfile response received',
      {
        profileId,
        success: response.success,
        msg: response.msg ?? null,
        data: response.data ?? null,
      },
    );
    // #endregion
    this.unwrapResponse(response, '关闭 BitBrowser 窗口失败');
  }

  async deleteProfileById(profileId: string): Promise<void> {
    const response = await this.requestEnvelope<Record<string, unknown>>(
      this.endpoints.deleteBrowser,
      {
        method: 'POST',
        body: {
          id: profileId,
        },
      },
    );
    this.unwrapResponse(response, '删除 BitBrowser 窗口失败');
  }

  async openPlatformHome(
    binding: BrowserProfileBinding,
    platform: PlatformType,
    runtime?: BitBrowserOpenProfileResult,
  ): Promise<void> {
    const homeUrl = this.platformHomeUrls[platform];
    if (!homeUrl) {
      throw new Error(`未配置平台 ${platform} 的首页地址`);
    }

    await this.openPage(binding, homeUrl, runtime);
  }

  async openPage(
    binding: BrowserProfileBinding,
    pageUrl: string,
    runtime?: BitBrowserOpenProfileResult,
  ): Promise<void> {
    const targetUrl = pageUrl.trim();
    if (!targetUrl) {
      throw new Error('打开 BitBrowser 页面失败：pageUrl 不能为空');
    }

    // #region debug-point A:gateway-open-page
    await reportDouyinLoginDebug(
      'A',
      'bitbrowser.gateway:openPage:before',
      'openPage request prepared',
      {
        profileId: binding.profileId,
        profileName: binding.profileName,
        pageUrl: targetUrl,
        openArgs: this.config.openArgs ?? [],
        queueOpen: this.config.queueOpen ?? true,
        ignoreDefaultUrls: true,
      },
    );
    // #endregion

    const response = await this.requestEnvelope<BitBrowserBrowserOpenData>(
      this.endpoints.openBrowser,
      {
        method: 'POST',
        body: {
          id: binding.profileId,
          args: this.config.openArgs ?? [],
          queue: this.config.queueOpen ?? true,
          ignoreDefaultUrls: true,
          newPageUrl: targetUrl,
        },
      },
    );
    this.unwrapResponse(response, `打开 BitBrowser 页面失败: ${targetUrl}`);
    await this.forceOpenPageViaDebugPort(runtime, targetUrl);
    // #region debug-point A:gateway-open-page-result
    await reportDouyinLoginDebug(
      'A',
      'bitbrowser.gateway:openPage:after',
      'openPage response received',
      {
        profileId: binding.profileId,
        pageUrl: targetUrl,
      },
    );
    // #endregion
  }

  private async forceOpenPageViaDebugPort(
    runtime: BitBrowserOpenProfileResult | undefined,
    targetUrl: string,
  ) {
    const debugBaseUrl = this.resolveDebugBaseUrl(runtime);
    if (!debugBaseUrl) {
      return;
    }

    const requestUrl = `${debugBaseUrl}/json/new?${encodeURIComponent(targetUrl)}`;
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(requestUrl, { method: 'PUT' });
        if (!response.ok) {
          lastError = `status ${response.status}`;
        } else {
          // #region debug-point A:gateway-open-page-debug-port-success
          await reportDouyinLoginDebug(
            'A',
            'bitbrowser.gateway:forceOpenPageViaDebugPort:success',
            'debug port forced page open succeeded',
            {
              targetUrl,
              debugBaseUrl,
              attempt,
            },
          );
          // #endregion
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }

    // #region debug-point A:gateway-open-page-debug-port-failed
    await reportDouyinLoginDebug(
      'A',
      'bitbrowser.gateway:forceOpenPageViaDebugPort:failed',
      'debug port forced page open failed',
      {
        targetUrl,
        debugBaseUrl,
        error: lastError,
      },
    );
    // #endregion
  }

  private resolveDebugBaseUrl(runtime?: BitBrowserOpenProfileResult) {
    if (runtime?.debugUrl) {
      return runtime.debugUrl.startsWith('http')
        ? runtime.debugUrl
        : `http://${runtime.debugUrl}`;
    }
    if (runtime?.wsEndpoint) {
      return runtime.wsEndpoint
        .replace(/^ws:\/\//, 'http://')
        .replace(/\/devtools\/browser\/.*$/, '');
    }
    return null;
  }

  async detailBrowser(profileId: string) {
    const response = await this.requestEnvelope<BitBrowserBrowserDetailData>(
      this.endpoints.browserDetail,
      {
        method: 'POST',
        body: {
          id: profileId,
        },
      },
    );

    if (!response.success) {
      return null;
    }
    return response.data ?? null;
  }

  async updateBrowser(payload: BitBrowserBrowserCreatePayload | Record<string, unknown>) {
    const response = await this.requestEnvelope<BitBrowserBrowserUpdateData>(
      this.endpoints.updateBrowser,
      {
        method: 'POST',
        body: payload,
      },
    );
    return this.unwrapResponse(response, '创建或更新 BitBrowser 窗口失败');
  }

  async updateBrowserPartial(ids: string[], payload: Record<string, unknown>) {
    const response = await this.requestEnvelope<BitBrowserBrowserUpdateData>(
      this.endpoints.updateBrowserPartial,
      {
        method: 'POST',
        body: {
          ids,
          ...payload,
        },
      },
    );
    if (!response.success) {
      throw new Error(response.msg || '局部更新 BitBrowser 窗口失败');
    }
    return response.data ?? {};
  }

  async ensureProfileGroupedByPlatform(
    binding: BrowserProfileBinding,
    platform: PlatformType,
  ): Promise<void> {
    const groupName = this.resolvePlatformGroupName(platform);
    const groupId = await this.findOrCreateGroupId(groupName);
    const detail = await this.detailBrowser(binding.profileId);
    if (detail?.groupId === groupId) {
      return;
    }

    await this.updateBrowserPartial([binding.profileId], { groupId });
  }

  private async ensureProfileExtensionSync(
    profileId: string,
    detail: BitBrowserBrowserDetailData,
  ) {
    if (detail.syncExtensions && detail.syncUserExtensions) {
      return;
    }

    await this.updateBrowser({
      ids: [profileId],
      syncExtensions: true,
      syncUserExtensions: true,
      browserFingerPrint: {},
    });
  }

  private async findOrCreateGroupId(groupName: string) {
    const existingGroup = await this.findGroupByName(groupName);
    if (existingGroup?.id) {
      return existingGroup.id;
    }

    try {
      const createdGroup = await this.createGroup(groupName);
      if (createdGroup.id) {
        return createdGroup.id;
      }
    } catch {}

    const retryGroup = await this.findGroupByName(groupName);
    if (retryGroup?.id) {
      return retryGroup.id;
    }

    throw new Error(`创建 BitBrowser 分组失败: ${groupName}`);
  }

  private async findGroupByName(groupName: string) {
    const response = await this.requestEnvelope<unknown>(this.endpoints.groupList, {
      method: 'POST',
      body: {
        page: 0,
        pageSize: 100,
        all: true,
      },
    });
    const groups = this.extractGroupList(response.data);
    const normalizedGroupName = this.normalizeName(groupName);

    return (
      groups.find(
        (group) =>
          this.normalizeName(group.groupName ?? group.name ?? '') === normalizedGroupName,
      ) ?? null
    );
  }

  private async createGroup(groupName: string) {
    const response = await this.requestEnvelope<BitBrowserGroupData>(
      this.endpoints.groupAdd,
      {
        method: 'POST',
        body: {
          groupName,
          sortNum: 0,
        },
      },
    );

    return this.unwrapResponse(response, `创建 BitBrowser 分组失败: ${groupName}`);
  }

  private extractGroupList(data: unknown): BitBrowserGroupData[] {
    if (Array.isArray(data)) {
      return data.filter((item): item is BitBrowserGroupData => this.isRecord(item));
    }

    if (!this.isRecord(data)) {
      return [];
    }

    for (const key of ['list', 'rows', 'records', 'items', 'data']) {
      const value = data[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is BitBrowserGroupData => this.isRecord(item));
      }
    }

    return [];
  }

  private resolvePlatformGroupName(platform: PlatformType) {
    switch (platform) {
      case 'douyin':
        return '抖音';
      case 'xiaohongshu':
        return '小红书';
      case 'wechat_video':
      case 'wechat_mp':
        return '视频号';
      case 'kuaishou':
        return '快手';
      default:
        return String(platform).trim() || '未分组';
    }
  }

  private normalizeName(value: string) {
    return value.trim().toLowerCase();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async requestEnvelope<T>(
    url: string,
    options: {
      method: 'POST';
      body?: unknown;
    },
  ): Promise<BitBrowserApiEnvelope<T>> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...(this.config.apiKey
            ? { authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(options.body ?? {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `BitBrowser request failed: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as BitBrowserApiEnvelope<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  private unwrapResponse<T>(
    response: BitBrowserApiEnvelope<T>,
    fallbackMessage: string,
  ) {
    if (!response.success || !response.data) {
      throw new Error(response.msg || fallbackMessage);
    }
    return response.data;
  }
}

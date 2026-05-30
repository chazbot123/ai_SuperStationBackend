import os from 'node:os';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadPublishPlatform } from '@prisma/client';
import type { BitBrowserRuntimeFacade } from '../bitbrowser/bitbrowser.bootstrap';
import { BitBrowserExtensionBridgeService } from '../bitbrowser/bitbrowser.extension-bridge.service';
import { FileBitBrowserBindingRepository } from '../bitbrowser/bitbrowser.file-store';
import { BitBrowserGatewayClient } from '../bitbrowser/bitbrowser.gateway';
import { BitBrowserRuntimeSessionService } from '../bitbrowser/bitbrowser.runtime-session.service';
import {
  BitBrowserProfileService,
  buildProfileTaskId,
} from '../bitbrowser/bitbrowser.service';
import type {
  BitBrowserBrowserCreatePayload,
  BitBrowserOpenProfileResult,
  BrowserProfileBinding,
  BusinessOwner,
  PlatformType,
  RuntimeCommand,
} from '../bitbrowser/bitbrowser.types';
import {
  PROFILE_BINDING_MODE_DEDICATED_BY_ACCOUNT,
} from '../bitbrowser/bitbrowser.types';

type RuntimeStatus = 'completed' | 'failed' | 'closed';
type BitBrowserProfileSnapshot = {
  authPayload: string;
  sourceUrl: string | null;
  accountName: string | null;
  externalAccountId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
};

type StartLoginRuntimeInput = {
  creatorId: string;
  platform: LeadPublishPlatform;
  accountId: string | null;
  accountName: string;
  externalGroupId: string;
  sessionId: string;
  sessionToken: string;
  forceFreshLogin?: boolean;
};

type StartPublishRuntimeInput = {
  creatorId: string;
  platform: LeadPublishPlatform;
  accountId: string;
  accountName: string;
  externalGroupId: string;
  sessionToken: string;
  accountAuthPayload: string;
  accountCookiePayload?: string | null;
  job: {
    id: string;
    draftVideoUrl?: string | null;
    [key: string]: unknown;
  };
};

type LoginFallbackResult = {
  authType: 'cookie';
  authPayload: string;
  accountName: string | null;
  externalAccountId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  sourceUrl: string | null;
};

const DEFAULT_RUNTIME_READY_TIMEOUT_MS = 20000;
const DEFAULT_RUNTIME_EXPIRES_MS = 15 * 60 * 1000;

@Injectable()
export class PublishingBitBrowserService implements OnModuleInit {
  private readonly logger = new Logger(PublishingBitBrowserService.name);
  private readonly enabled: boolean;
  private readonly repository?: FileBitBrowserBindingRepository;
  private readonly gatewayClient?: BitBrowserGatewayClient;
  private readonly profileService?: BitBrowserProfileService;
  private readonly runtimeSessionService?: BitBrowserRuntimeSessionService;
  private readonly extensionBridgeService?: BitBrowserExtensionBridgeService;

  constructor(private readonly configService: ConfigService) {
    const localApiBaseUrl =
      this.configService.get<string>('BITBROWSER_LOCAL_API_BASE_URL')?.trim() || '';
    if (!localApiBaseUrl) {
      this.enabled = false;
      return;
    }

    const gatewayClient = new BitBrowserGatewayClient({
      baseUrl: localApiBaseUrl,
      apiKey: this.configService.get<string>('BITBROWSER_LOCAL_API_KEY')?.trim() || undefined,
      timeoutMs: this.readNumberEnv('BITBROWSER_LOCAL_API_TIMEOUT_MS', 15000),
      queueOpen: this.readBooleanEnv('BITBROWSER_QUEUE_OPEN', true),
      openArgs: this.buildOpenArgs(),
    });
    const repository = new FileBitBrowserBindingRepository(this.getStorageFilePath());
    const profileService = new BitBrowserProfileService(
      repository,
      gatewayClient,
    );
    const runtimeSessionService = new BitBrowserRuntimeSessionService(
      repository,
      profileService,
    );
    const extensionBridgeService = new BitBrowserExtensionBridgeService(
      runtimeSessionService,
    );

    this.enabled = true;
    this.repository = repository;
    this.gatewayClient = gatewayClient;
    this.profileService = profileService;
    this.runtimeSessionService = runtimeSessionService;
    this.extensionBridgeService = extensionBridgeService;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('BitBrowser 未启用：缺少 BITBROWSER_LOCAL_API_BASE_URL');
      return;
    }

    if (
      !this.profileService ||
      !this.runtimeSessionService ||
      !this.extensionBridgeService
    ) {
      return;
    }

    this.logger.log(
      `BitBrowser bridge mounted at ${this.getBridgeBaseUrl()}/api/bitbrowser/health`,
    );
  }

  isEnabled() {
    return this.enabled;
  }

  getBridgeBaseUrl() {
    return this.getBackendApiBaseUrl();
  }

  getBridgeFacade(): BitBrowserRuntimeFacade {
    const profileService = this.profileService;
    const runtimeSessionService = this.runtimeSessionService;
    const extensionBridgeService = this.extensionBridgeService;

    if (!profileService || !runtimeSessionService || !extensionBridgeService) {
      throw new ConflictException(
        'BitBrowser 未配置：请先设置 BITBROWSER_LOCAL_API_BASE_URL 并启动后端',
      );
    }

    return {
      service: profileService,
      runtimeSessionService,
      extensionBridgeService,
      prepare: (creatorId, ownerId, platform, reason, expiresAt) =>
        profileService.prepareOwnerRuntime({
          creatorId,
          ownerId,
          platform,
          reason,
          expiresAt,
          taskId: buildProfileTaskId(ownerId, platform),
        }),
    };
  }

  async startLoginRuntime(input: StartLoginRuntimeInput) {
    this.assertEnabled();
    // #region debug-point B:start-login-runtime
    this.reportDebugEvent('B', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:entry', {
      creatorId: input.creatorId,
      platform: input.platform,
      accountId: input.accountId,
      externalGroupId: input.externalGroupId,
      forceFreshLogin: Boolean(input.forceFreshLogin),
    });
    // #endregion

    if (!input.accountId?.trim()) {
      throw new ConflictException('扩展登录必须先绑定平台账号记录');
    }

    const owner = await this.ensureOwner(input.creatorId, input.externalGroupId);
    const profileBinding = await this.ensureDedicatedProfileBindingForAccount({
      creatorId: input.creatorId,
      owner,
      platform: input.platform,
      accountId: input.accountId,
      accountName: input.accountName,
    });
    const platform = this.toBitBrowserPlatform(input.platform);

    await this.ensurePlatformAccountBinding({
      creatorId: input.creatorId,
      ownerId: owner.id,
      profileBinding,
      platform,
      accountName: input.accountName,
      accountId: input.accountId,
    });
    await this.closeStaleLoginRuntimes(profileBinding.id);

    const opened = await this.openRuntimeSession({
      creatorId: input.creatorId,
      ownerId: owner.id,
      platform,
      platformAccountId: input.accountId,
      reason: 'login',
      taskId: `publishing-login:${input.platform}:${input.externalGroupId}:${Date.now()}`,
    });
    // #region debug-point B:runtime-opened
    this.reportDebugEvent('B', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:runtime-opened', {
      ownerId: owner.id,
      profileId: opened.context.profileBinding.profileId,
      runtimeSessionId: opened.session.id,
      platform,
    });
    // #endregion

    try {
      const targetUrl = this.getPlatformLoginUrl(input.platform);
      // #region debug-point C:before-open-page
      this.reportDebugEvent('C', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:before-open-page', {
        runtimeSessionId: opened.session.id,
        profileId: opened.context.profileBinding.profileId,
        targetUrl,
      });
      // #endregion
      await this.openRuntimePageWithBridgeState(
        opened.context.profileBinding,
        opened.session.id,
        opened.runtime,
        targetUrl,
      );
      // #region debug-point C:after-open-page
      this.reportDebugEvent('C', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:after-open-page', {
        runtimeSessionId: opened.session.id,
        targetUrl,
      });
      // #endregion
      const fallbackLoginResult = await this.waitForRuntimeReady(
        opened.session.id,
        opened.context.profileBinding.profileId,
        input.platform,
        opened.runtime.debugUrl,
      );
      // #region debug-point D:runtime-ready
      this.reportDebugEvent('D', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:runtime-ready', {
        runtimeSessionId: opened.session.id,
        fallbackApplied: Boolean(fallbackLoginResult),
      });
      // #endregion

      if (fallbackLoginResult) {
        return {
          ownerId: owner.id,
          profileId: opened.context.profileBinding.profileId,
          runtimeSessionId: opened.session.id,
          runtimeCommandId: null,
          bridgeBaseUrl: this.getBridgeBaseUrl(),
          loginUrl: targetUrl,
          fallbackLoginResult,
        };
      }

      const command = await this.extensionBridgeService!.queueLoginExecute({
        runtimeSessionId: opened.session.id,
        payload: {
          sessionId: input.sessionId,
          sessionToken: input.sessionToken,
          apiBaseUrl: this.getBackendApiBaseUrl(),
          platform: input.platform,
          forceFreshLogin: Boolean(input.forceFreshLogin),
          targetUrl,
        },
      });
      // #region debug-point E:login-command-queued
      this.reportDebugEvent('E', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:login-command-queued', {
        runtimeSessionId: opened.session.id,
        commandId: command.id,
        bridgeBaseUrl: this.getBridgeBaseUrl(),
      });
      // #endregion

      return {
        ownerId: owner.id,
        profileId: opened.context.profileBinding.profileId,
        runtimeSessionId: opened.session.id,
        runtimeCommandId: command.id,
        bridgeBaseUrl: this.getBridgeBaseUrl(),
        loginUrl: targetUrl,
        fallbackLoginResult: null,
      };
    } catch (error) {
      // #region debug-point E:start-login-runtime-error
      this.reportDebugEvent('E', 'pre-fix', 'publishing-bitbrowser.service:startLoginRuntime:error', {
        runtimeSessionId: opened.session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // #endregion
      await this.closeRuntimeSession(opened.session.id, 'failed');
      throw error;
    }
  }

  async startPublishRuntime(input: StartPublishRuntimeInput) {
    this.assertEnabled();
    // #region debug-point H1:start-publish-runtime-entry
    this.reportDebugEvent(
      'H1',
      'pre-fix',
      'publishing-bitbrowser.service:startPublishRuntime:entry',
      {
        creatorId: input.creatorId,
        platform: input.platform,
        accountId: input.accountId,
        jobId: input.job?.id ?? null,
        externalGroupId: input.externalGroupId,
      },
    );
    // #endregion

    const owner = await this.ensureOwner(input.creatorId, input.externalGroupId);
    const platform = this.toBitBrowserPlatform(input.platform);
    const profileBinding = await this.ensureDedicatedProfileBindingForAccount({
      creatorId: input.creatorId,
      owner,
      platform: input.platform,
      accountId: input.accountId,
      accountName: input.accountName,
    });

    await this.ensurePlatformAccountBinding({
      creatorId: input.creatorId,
      ownerId: owner.id,
      profileBinding,
      platform,
      accountName: input.accountName,
      accountId: input.accountId,
    });

    const opened = await this.openRuntimeSession({
      creatorId: input.creatorId,
      ownerId: owner.id,
      platform,
      platformAccountId: input.accountId,
      reason: 'publish',
      taskId: `publishing-job:${input.job.id}:${Date.now()}`,
    });
    // #region debug-point B5:publish-runtime-profile
    this.reportDebugEvent(
      'B5',
      'pre-fix',
      'publishing-bitbrowser.service:startPublishRuntime:profile-reused',
      {
        platform: input.platform,
        accountId: input.accountId,
        jobId: input.job.id,
        runtimeSessionId: opened.session.id,
        profileId: opened.context.profileBinding.profileId,
        accountCookiePayloadLength: input.accountCookiePayload ? input.accountCookiePayload.length : 0,
        accountAuthPayloadLength: input.accountAuthPayload ? input.accountAuthPayload.length : 0,
      },
    );
    void fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'bitbrowser-cookie-persist',
        runId: 'post-fix',
        hypothesisId: 'B',
        location: 'server/src/modules/publishing/publishing-bitbrowser.service.ts:startPublishRuntime:profile-reused',
        msg: '[DEBUG] publish runtime profile reused',
        data: {
          platform: input.platform,
          accountId: input.accountId,
          jobId: input.job.id,
          runtimeSessionId: opened.session.id,
          profileId: opened.context.profileBinding.profileId,
          accountCookiePayloadLength: input.accountCookiePayload ? input.accountCookiePayload.length : 0,
          accountAuthPayloadLength: input.accountAuthPayload ? input.accountAuthPayload.length : 0,
        },
        ts: Date.now(),
      }),
    }).catch(() => undefined);
    // #endregion

    try {
      const targetUrl = this.getPlatformPublishUrl(input.platform, input.job);
      // #region debug-point H5:start-publish-runtime-target-url
      this.reportDebugEvent(
        'H5',
        'pre-fix',
        'publishing-bitbrowser.service:startPublishRuntime:target-url',
        {
          runtimeSessionId: opened.session.id,
          profileId: opened.context.profileBinding.profileId,
          platform: input.platform,
          targetUrl,
          debugUrl: opened.runtime.debugUrl,
        },
      );
      // #endregion
      await this.openRuntimePageWithBridgeState(
        opened.context.profileBinding,
        opened.session.id,
        opened.runtime,
        targetUrl,
      );
      await this.waitForRuntimeReady(
        opened.session.id,
        opened.context.profileBinding.profileId,
        input.platform,
        opened.runtime.debugUrl,
      );

      const command = await this.extensionBridgeService!.queuePublishCommand({
        runtimeSessionId: opened.session.id,
        type: 'PUBLISH_EXECUTE',
        payload: {
          sessionToken: input.sessionToken,
          apiBaseUrl: this.getBackendApiBaseUrl(),
          platform: input.platform,
          accountAuthPayload: input.accountAuthPayload,
          accountCookiePayload: input.accountCookiePayload || undefined,
          job: input.job,
          targetUrl,
        },
      });
      // #region debug-point H1:start-publish-runtime-command-queued
      this.reportDebugEvent(
        'H1',
        'pre-fix',
        'publishing-bitbrowser.service:startPublishRuntime:command-queued',
        {
          runtimeSessionId: opened.session.id,
          runtimeCommandId: command.id,
          profileId: opened.context.profileBinding.profileId,
          platform: input.platform,
          targetUrl,
          commandType: command.type,
        },
      );
      // #endregion

      return {
        ownerId: owner.id,
        profileId: opened.context.profileBinding.profileId,
        runtimeSessionId: opened.session.id,
        runtimeCommandId: command.id,
        bridgeBaseUrl: this.getBridgeBaseUrl(),
        publishUrl: targetUrl,
      };
    } catch (error) {
      // #region debug-point H1:start-publish-runtime-error
      this.reportDebugEvent(
        'H1',
        'pre-fix',
        'publishing-bitbrowser.service:startPublishRuntime:error',
        {
          platform: input.platform,
          accountId: input.accountId,
          jobId: input.job?.id ?? null,
          message: error instanceof Error ? error.message : String(error),
        },
      );
      // #endregion
      await this.closeRuntimeSession(opened.session.id, 'failed');
      throw error;
    }
  }

  async closeRuntimeSession(runtimeSessionId: string | null | undefined, status: RuntimeStatus) {
    if (!this.enabled || !runtimeSessionId || !this.runtimeSessionService) {
      return;
    }

    try {
      await this.runtimeSessionService.closeRuntimeSession(runtimeSessionId, status);
    } catch (error) {
      this.logger.warn(
        `关闭 BitBrowser runtimeSession 失败: ${runtimeSessionId} - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async openPlatformAccountHome(input: {
    creatorId: string;
    platform: LeadPublishPlatform;
    accountId: string;
    accountName: string;
    externalGroupId: string;
  }) {
    this.assertEnabled();
    const owner = await this.ensureOwner(input.creatorId, input.externalGroupId);
    const profileBinding = await this.getDedicatedProfileBinding({
      creatorId: input.creatorId,
      ownerId: owner.id,
      platform: this.toBitBrowserPlatform(input.platform),
      accountId: input.accountId,
      accountName: input.accountName,
    });
    const targetUrl = this.getPlatformLoginUrl(input.platform);
    const runtime = await this.gatewayClient!.openProfile(profileBinding);
    await this.gatewayClient!.openPage(profileBinding, targetUrl, runtime);
    return {
      profileId: profileBinding.profileId,
      loginUrl: targetUrl,
    };
  }

  async collectPlatformAccountCookieSnapshot(input: {
    creatorId: string;
    platform: LeadPublishPlatform;
    accountId: string;
    accountName: string;
    externalGroupId: string;
  }): Promise<BitBrowserProfileSnapshot | null> {
    this.assertEnabled();
    const owner = await this.ensureOwner(input.creatorId, input.externalGroupId);
    const profileBinding = await this.getDedicatedProfileBinding({
      creatorId: input.creatorId,
      ownerId: owner.id,
      platform: this.toBitBrowserPlatform(input.platform),
      accountId: input.accountId,
      accountName: input.accountName,
    });
    const runtimeSnapshot = await this.collectCookieSnapshotFromLiveProfile({
      profileBinding,
      platform: input.platform,
    });
    if (runtimeSnapshot?.authPayload) {
      return runtimeSnapshot;
    }

    const detail = await this.gatewayClient!.detailBrowser(profileBinding.profileId).catch(() => null);
    const fallbackAuthPayload = this.buildCookieAuthPayload(detail?.cookie);
    if (!fallbackAuthPayload) {
      return null;
    }
    return {
      authPayload: fallbackAuthPayload,
      sourceUrl: typeof detail?.url === 'string' ? detail.url.trim() || null : null,
      accountName: null,
      externalAccountId: null,
      displayName: null,
      avatarUrl: null,
      followerCount: null,
    };
  }

  async releaseDedicatedProfile(
    creatorId: string,
    _externalGroupId: string | null | undefined,
    profileId?: string | null,
  ) {
    // #region debug-point H2:release-profile-entry
    this.reportDebugEvent('H2', 'pre-fix', 'publishing-bitbrowser.service:releaseDedicatedProfile:entry', {
      creatorId,
      externalGroupId: _externalGroupId,
      profileId: profileId ?? null,
      enabled: this.enabled,
      hasRepository: Boolean(this.repository),
      hasGatewayClient: Boolean(this.gatewayClient),
    });
    // #endregion
    if (!this.enabled || !this.repository) {
      return;
    }

    const normalizedProfileId = (profileId || '').trim();
    if (normalizedProfileId && this.gatewayClient) {
      const beforeDetail = await this.gatewayClient.detailBrowser(normalizedProfileId).catch(() => null);
      // #region debug-point H2:release-profile-direct-close-before
      this.reportDebugEvent(
        'H2',
        'pre-fix',
        'publishing-bitbrowser.service:releaseDedicatedProfile:before-direct-close',
        {
          profileId: normalizedProfileId,
          beforeDetailExists: Boolean(beforeDetail),
          beforeDetailName: beforeDetail?.name ?? null,
        },
      );
      // #endregion
      await this.gatewayClient.closeProfileById(normalizedProfileId).catch((error) => {
        // #region debug-point H2:release-profile-direct-close-error
        this.reportDebugEvent(
          'H2',
          'pre-fix',
          'publishing-bitbrowser.service:releaseDedicatedProfile:direct-close-error',
          {
            profileId: normalizedProfileId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // #endregion
        this.logger.warn(
          `关闭 BitBrowser 专属窗口失败: ${normalizedProfileId} - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      await this.sleep(800);
      await this.gatewayClient.deleteProfileById(normalizedProfileId).catch((error) => {
        this.reportDebugEvent(
          'H2',
          'post-fix',
          'publishing-bitbrowser.service:releaseDedicatedProfile:direct-delete-error',
          {
            profileId: normalizedProfileId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        this.logger.warn(
          `删除 BitBrowser 专属窗口失败: ${normalizedProfileId} - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      const afterDetail = await this.gatewayClient.detailBrowser(normalizedProfileId).catch(() => null);
      // #region debug-point H2:release-profile-direct-close-after
      this.reportDebugEvent(
        'H2',
        'pre-fix',
        'publishing-bitbrowser.service:releaseDedicatedProfile:after-direct-close',
        {
          profileId: normalizedProfileId,
          afterDetailExists: Boolean(afterDetail),
          afterDetailName: afterDetail?.name ?? null,
        },
      );
      // #endregion
    }
    if (normalizedProfileId) {
      try {
        await this.repository.deleteProfileBindingResourcesByProfileId(creatorId, normalizedProfileId);
      } catch (error) {
        this.logger.error(
          `清理 BitBrowser 专属窗口绑定资源失败: creatorId=${creatorId}, profileId=${normalizedProfileId}, error=${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
    }
  }

  async renameDedicatedProfile(input: {
    creatorId: string;
    externalGroupId: string | null | undefined;
    platform: LeadPublishPlatform;
    accountName: string | null | undefined;
    platformAccountId?: string | null;
    profileId?: string | null;
  }) {
    // #region debug-point H2:rename-entry
    this.reportDebugEvent('H2', 'pre-fix', 'publishing-bitbrowser.service:renameDedicatedProfile:entry', {
      creatorId: input.creatorId,
      externalGroupId: input.externalGroupId,
      platform: input.platform,
      accountName: input.accountName,
      profileId: input.profileId ?? null,
      enabled: this.enabled,
      hasRepository: Boolean(this.repository),
      hasGatewayClient: Boolean(this.gatewayClient),
    });
    // #endregion
    if (!this.enabled || !this.repository || !this.gatewayClient || !input.externalGroupId) {
      return;
    }

    const normalizedGroupId = this.normalizeGroupId(input.externalGroupId);
    const normalizedAccountName = (input.accountName || '').trim();
    const normalizedPlatformAccountId = (input.platformAccountId || '').trim() || null;
    if (!normalizedAccountName) {
      return;
    }

    const ownerCode = this.buildOwnerCode(normalizedGroupId);
    const owner = (await this.repository.listOwners(input.creatorId)).find(
      (item) => item.code === ownerCode,
    );
    const targetProfileId = (input.profileId || '').trim();
    if (!owner && !targetProfileId) {
      return;
    }

    const profileBinding =
      owner && normalizedPlatformAccountId
        ? await this.repository.getProfileBindingByPlatformAccount(
            input.creatorId,
            owner.id,
            this.toBitBrowserPlatform(input.platform),
            normalizedPlatformAccountId,
            normalizedAccountName,
          )
        : null;
    const resolvedProfileId = targetProfileId || profileBinding?.profileId || '';
    // #region debug-point H3:rename-target-resolved
    this.reportDebugEvent('H3', 'pre-fix', 'publishing-bitbrowser.service:renameDedicatedProfile:target-resolved', {
      externalGroupId: normalizedGroupId,
      ownerId: owner?.id ?? null,
      profileBindingId: profileBinding?.id ?? null,
      profileBindingProfileId: profileBinding?.profileId ?? null,
      requestProfileId: targetProfileId || null,
      resolvedProfileId: resolvedProfileId || null,
    });
    // #endregion
    if (!resolvedProfileId) {
      return;
    }

    const profileName = this.buildDedicatedProfileName(input.platform, normalizedAccountName);
    const beforeDetail = await this.gatewayClient.detailBrowser(resolvedProfileId).catch(() => null);
    // #region debug-point H2:rename-before-update
    this.reportDebugEvent(
      'H2',
      'pre-fix',
      'publishing-bitbrowser.service:renameDedicatedProfile:before-update',
      {
        resolvedProfileId,
        targetProfileName: profileName,
        beforeDetailExists: Boolean(beforeDetail),
        beforeDetailName: beforeDetail?.name ?? null,
      },
    );
    // #endregion

    await this.gatewayClient
      .updateBrowserPartial([resolvedProfileId], { name: profileName })
      .catch((error) => {
        // #region debug-point H2:rename-update-error
        this.reportDebugEvent(
          'H2',
          'pre-fix',
          'publishing-bitbrowser.service:renameDedicatedProfile:update-error',
          {
            resolvedProfileId,
            targetProfileName: profileName,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // #endregion
        throw error;
      });
    await this.gatewayClient
      .ensureProfileGroupedByPlatform(
        {
          id: profileBinding?.id ?? `binding_${resolvedProfileId}`,
          creatorId: input.creatorId,
          ownerId: owner?.id ?? '',
          platform: profileBinding?.platform ?? input.platform,
          accountId: profileBinding?.accountId ?? normalizedPlatformAccountId,
          accountName: profileBinding?.accountName ?? normalizedAccountName,
          provider: 'bitbrowser',
          profileId: resolvedProfileId,
          profileName,
          bindingMode: PROFILE_BINDING_MODE_DEDICATED_BY_ACCOUNT,
          proxyConfig: profileBinding?.proxyConfig ?? null,
          browserConfig: profileBinding?.browserConfig ?? null,
          status: profileBinding?.status ?? 'active',
          lastUsedAt: profileBinding?.lastUsedAt ?? null,
          createdAt: profileBinding?.createdAt ?? new Date().toISOString(),
          updatedAt: profileBinding?.updatedAt ?? new Date().toISOString(),
        },
        this.toBitBrowserPlatform(input.platform),
      )
      .catch((error) => {
        this.reportDebugEvent(
          'H2',
          'pre-fix',
          'publishing-bitbrowser.service:renameDedicatedProfile:group-update-error',
          {
            resolvedProfileId,
            platform: input.platform,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return undefined;
      });
    const afterDetail = await this.gatewayClient.detailBrowser(resolvedProfileId).catch(() => null);
    // #region debug-point H2:rename-after-update
    this.reportDebugEvent(
      'H2',
      'pre-fix',
      'publishing-bitbrowser.service:renameDedicatedProfile:after-update',
      {
        resolvedProfileId,
        targetProfileName: profileName,
        afterDetailExists: Boolean(afterDetail),
        afterDetailName: afterDetail?.name ?? null,
      },
    );
    // #endregion
    if (owner && profileBinding) {
      const browserConfig = {
        ...(profileBinding.browserConfig ?? {}),
        name: profileName,
      };
      const dedicatedBinding = await this.repository.bindProfile({
        creatorId: input.creatorId,
        ownerId: owner.id,
        platform: this.toBitBrowserPlatform(input.platform),
        accountId: normalizedPlatformAccountId,
        accountName: normalizedAccountName,
        profileId: resolvedProfileId,
        profileName,
        proxyConfig: profileBinding.proxyConfig,
        browserConfig,
      });
      await this.profileService!.registerPlatformAccount({
        creatorId: input.creatorId,
        ownerId: owner.id,
        profileBindingId: dedicatedBinding.id,
        platform: this.toBitBrowserPlatform(input.platform),
        accountName: normalizedAccountName,
        accountId: normalizedPlatformAccountId,
        authPayloadRef: normalizedPlatformAccountId,
      });
    }
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new ConflictException(
        'BitBrowser 未配置：请先设置 BITBROWSER_LOCAL_API_BASE_URL 并启动后端',
      );
    }
  }

  private async ensureOwner(creatorId: string, externalGroupId: string) {
    const normalizedGroupId = this.normalizeGroupId(externalGroupId);
    const ownerCode = this.buildOwnerCode(normalizedGroupId);
    const existing = (await this.repository!.listOwners(creatorId)).find(
      (item) => item.code === ownerCode,
    );
    if (existing) {
      return existing;
    }

    return this.profileService!.createOwner({
      creatorId,
      name: this.buildOwnerName(normalizedGroupId),
      code: ownerCode,
    });
  }

  private async ensurePlatformAccountBinding(input: {
    creatorId: string;
    ownerId: string;
    profileBinding: BrowserProfileBinding;
    platform: PlatformType;
    accountName: string;
    accountId: string | null;
  }) {
    return this.profileService!.registerPlatformAccount({
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      profileBindingId: input.profileBinding.id,
      platform: input.platform,
      accountName: input.accountName,
      accountId: input.accountId,
      authPayloadRef: input.accountId,
    });
  }

  private async ensureDedicatedProfileBindingForAccount(input: {
    creatorId: string;
    owner: BusinessOwner;
    platform: LeadPublishPlatform;
    accountId: string;
    accountName: string;
  }) {
    if (!this.repository || !this.gatewayClient || !this.profileService) {
      throw new ConflictException('BitBrowser 未配置完整，无法准备平台账号专属窗口');
    }

    const platform = this.toBitBrowserPlatform(input.platform);
    const existingDedicatedBinding = await this.repository.getProfileBindingByPlatformAccount(
      input.creatorId,
      input.owner.id,
      platform,
      input.accountId,
      input.accountName,
    );

    if (
      existingDedicatedBinding &&
      existingDedicatedBinding.bindingMode === PROFILE_BINDING_MODE_DEDICATED_BY_ACCOUNT &&
      existingDedicatedBinding.profileId
    ) {
      return existingDedicatedBinding;
    }

    const profileName = this.buildDedicatedProfileName(input.platform, input.accountName);
    const browserConfig = this.buildDedicatedBrowserCreatePayload(
      input.owner.name,
      profileName,
      existingDedicatedBinding?.browserConfig ?? undefined,
    );
    const createdProfile = await this.gatewayClient.createProfile(
      {
        creatorId: input.creatorId,
        ownerId: input.owner.id,
        profileName,
        proxyConfig: existingDedicatedBinding?.proxyConfig ?? null,
        browserConfig,
      },
      browserConfig,
    );
    const dedicatedBinding = await this.repository.bindProfile({
      creatorId: input.creatorId,
      ownerId: input.owner.id,
      platform,
      accountId: input.accountId,
      accountName: input.accountName,
      profileId: createdProfile.profileId,
      profileName: createdProfile.profileName,
      proxyConfig: existingDedicatedBinding?.proxyConfig ?? null,
      browserConfig: createdProfile.browserConfig,
    });

    await this.gatewayClient.ensureProfileGroupedByPlatform(dedicatedBinding, platform).catch(() => {
      return undefined;
    });
    await this.profileService.registerPlatformAccount({
      creatorId: input.creatorId,
      ownerId: input.owner.id,
      profileBindingId: dedicatedBinding.id,
      platform,
      accountName: input.accountName,
      accountId: input.accountId,
      authPayloadRef: input.accountId,
    });

    return dedicatedBinding;
  }

  private async getDedicatedProfileBinding(input: {
    creatorId: string;
    ownerId: string;
    platform: PlatformType;
    accountId: string;
    accountName: string;
  }) {
    const dedicatedBinding = await this.repository?.getProfileBindingByPlatformAccount(
      input.creatorId,
      input.ownerId,
      input.platform,
      input.accountId,
      input.accountName,
    );
    if (!dedicatedBinding) {
      throw new ConflictException('当前账号尚未绑定专属 BitBrowser Profile，请先重新登录一次');
    }
    return dedicatedBinding;
  }

  private async openRuntimeSession(input: {
    creatorId: string;
    ownerId: string;
    platform: PlatformType;
    platformAccountId?: string | null;
    reason: 'login' | 'publish';
    taskId: string;
  }) {
    return this.runtimeSessionService!.openRuntimeSession({
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      platform: input.platform,
      platformAccountId: input.platformAccountId ?? null,
      taskId: input.taskId,
      reason: input.reason,
      expiresAt: new Date(Date.now() + DEFAULT_RUNTIME_EXPIRES_MS).toISOString(),
    });
  }

  private async waitForRuntimeReady(
    runtimeSessionId: string,
    profileId: string,
    platform: LeadPublishPlatform,
    debugUrl: string | null | undefined,
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < DEFAULT_RUNTIME_READY_TIMEOUT_MS) {
      const session = await this.runtimeSessionService!.getRuntimeSession(runtimeSessionId);
      if (session?.extensionInstanceId && session.tabId !== null) {
        return null;
      }
      await this.sleep(200);
    }

    const fallback = await this.tryCollectLoginFallback({
      runtimeSessionId,
      profileId,
      platform,
      debugUrl,
    });
    if (fallback) {
      return fallback;
    }

    throw new ConflictException('BitBrowser 扩展未就绪，请确认 BitBrowser 已加载登录发布扩展');
  }

  private async tryCollectLoginFallback(input: {
    runtimeSessionId: string;
    profileId: string;
    platform: LeadPublishPlatform;
    debugUrl: string | null | undefined;
  }): Promise<LoginFallbackResult | null> {
    try {
      const authPayload = await this.collectLiveAuthPayloadFromDebugPort(
        input.platform,
        input.debugUrl,
      );
      if (!authPayload) {
        const detail = await this.gatewayClient!.detailBrowser(input.profileId);
        const fallbackAuthPayload = this.buildCookieAuthPayload(detail?.cookie);
        if (!fallbackAuthPayload) {
          this.reportDebugEvent(
            'H4',
            'pre-fix',
            'publishing-bitbrowser.service:tryCollectLoginFallback:missing-cookie',
            {
              runtimeSessionId: input.runtimeSessionId,
              profileId: input.profileId,
            },
          );
          return null;
        }
        return this.buildLoginFallbackResult(input, fallbackAuthPayload);
      }
      return this.buildLoginFallbackResult(input, authPayload);
    } catch (error) {
      this.reportDebugEvent(
        'F',
        'pre-fix',
        'publishing-bitbrowser.service:tryCollectLoginFallback:failed',
        {
          runtimeSessionId: input.runtimeSessionId,
          profileId: input.profileId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  }

  async collectLoginProfileFallback(input: {
    runtimeSessionId: string;
    platform: LeadPublishPlatform;
  }): Promise<LoginFallbackResult | null> {
    if (!this.runtimeSessionService) {
      return null;
    }

    const session = await this.runtimeSessionService.getRuntimeSession(input.runtimeSessionId);
    if (!session?.profileId) {
      return null;
    }

    return this.tryCollectLoginFallback({
      runtimeSessionId: input.runtimeSessionId,
      profileId: session.profileId,
      platform: input.platform,
      debugUrl: session.debugUrl,
    });
  }

  private buildCookieAuthPayload(rawCookie: string | null | undefined) {
    const normalized = String(rawCookie || '').trim();
    if (!normalized) {
      return '';
    }

    try {
      const parsed = JSON.parse(normalized);
      if (!Array.isArray(parsed)) {
        return normalized;
      }
      const pairs = parsed
        .map((item) => {
          const name = String(item?.name || '').trim();
          const value = String(item?.value || '').trim();
          if (!name || !value) {
            return '';
          }
          return `${name}=${value}`;
        })
        .filter(Boolean);
      return pairs.join('; ');
    } catch {
      return normalized;
    }
  }

  private async collectCookieSnapshotFromLiveProfile(input: {
    profileBinding: BrowserProfileBinding;
    platform: LeadPublishPlatform;
  }): Promise<BitBrowserProfileSnapshot | null> {
    const runtime = await this.gatewayClient!.openProfile(input.profileBinding).catch(() => null);
    const authPayload = await this.collectLiveAuthPayloadFromDebugPort(
      input.platform,
      runtime?.debugUrl,
    );
    if (!authPayload) {
      return null;
    }

    const inspected = await this.inspectProfileFromDebugPort(input.platform, runtime?.debugUrl).catch(
      () => null,
    );

    return {
      authPayload,
      sourceUrl: inspected?.sourceUrl || this.getPlatformLoginUrl(input.platform),
      accountName: inspected?.accountName || null,
      externalAccountId: inspected?.externalAccountId || null,
      displayName: inspected?.displayName || null,
      avatarUrl: inspected?.avatarUrl || null,
      followerCount:
        typeof inspected?.followerCount === 'number' && Number.isFinite(inspected.followerCount)
          ? inspected.followerCount
          : null,
    };
  }

  private async collectLiveAuthPayloadFromDebugPort(
    platform: LeadPublishPlatform,
    debugUrl: string | null | undefined,
  ) {
    const debugBaseUrl = this.normalizeDebugBaseUrl(debugUrl);
    if (!debugBaseUrl) {
      return '';
    }

    const targetUrl = this.getPlatformLoginUrl(platform);
    const pageTarget = await this.findDebugPageTarget(debugBaseUrl, targetUrl);
    if (!pageTarget?.webSocketDebuggerUrl) {
      return '';
    }

    const cookies = await this.getCookiesInDebugTarget(pageTarget.webSocketDebuggerUrl, [
      pageTarget.url || targetUrl,
      targetUrl,
    ]);
    if (!cookies.length) {
      return '';
    }

    return this.buildCookieAuthPayload(JSON.stringify(cookies));
  }

  private buildLoginFallbackResult(
    input: {
      runtimeSessionId: string;
      profileId: string;
      platform: LeadPublishPlatform;
      debugUrl: string | null | undefined;
    },
    authPayload: string,
  ): Promise<LoginFallbackResult | null> {
    return this.inspectProfileFromDebugPort(input.platform, input.debugUrl).then((inspected) => {
      if (!inspected) {
        this.reportDebugEvent(
          'H4',
          'pre-fix',
          'publishing-bitbrowser.service:tryCollectLoginFallback:inspect-null',
          {
            runtimeSessionId: input.runtimeSessionId,
            profileId: input.profileId,
            debugUrl: input.debugUrl ?? null,
            authPayloadLength: authPayload.length,
          },
        );
        return null;
      }

      this.reportDebugEvent(
        'F',
        'pre-fix',
        'publishing-bitbrowser.service:tryCollectLoginFallback:success',
        {
          runtimeSessionId: input.runtimeSessionId,
          profileId: input.profileId,
          sourceUrl: inspected.sourceUrl,
          accountName: inspected.accountName,
          displayName: inspected.displayName,
        },
      );

      return {
        authType: 'cookie',
        authPayload,
        accountName: inspected.accountName,
        externalAccountId: inspected.externalAccountId,
        displayName: inspected.displayName,
        avatarUrl: inspected.avatarUrl,
        followerCount: inspected.followerCount,
        sourceUrl: inspected.sourceUrl,
      };
    });
  }

  private async inspectProfileFromDebugPort(
    platform: LeadPublishPlatform,
    debugUrl: string | null | undefined,
  ) {
    const debugBaseUrl = this.normalizeDebugBaseUrl(debugUrl);
    if (!debugBaseUrl) {
      this.reportDebugEvent(
        'H4',
        'pre-fix',
          'publishing-bitbrowser.service:inspectProfileFromDebugPort:missing-debug-url',
        {
            platform,
          debugUrl: debugUrl ?? null,
        },
      );
      return null;
    }

    const targets = (await fetch(`${debugBaseUrl}/json/list`).then((response) => response.json())) as Array<{
      type?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
    }>;

    const hostKeyword =
      platform === LeadPublishPlatform.douyin
        ? 'creator.douyin.com'
        : platform === LeadPublishPlatform.xiaohongshu
          ? 'creator.xiaohongshu.com'
          : platform === LeadPublishPlatform.wechat_mp
            ? 'channels.weixin.qq.com'
            : '';
    const target = targets.find(
      (item) =>
        item.type === 'page' &&
        typeof item.url === 'string' &&
        (!hostKeyword || item.url.includes(hostKeyword)),
    );
    if (!target?.webSocketDebuggerUrl) {
      this.reportDebugEvent(
        'H4',
        'pre-fix',
        'publishing-bitbrowser.service:inspectProfileFromDebugPort:target-missing',
        {
          platform,
          debugBaseUrl,
          targetCount: targets.length,
          targets: targets.slice(0, 8).map((item) => ({
            type: item.type ?? null,
            url: item.url ?? null,
            hasSocket: Boolean(item.webSocketDebuggerUrl),
          })),
        },
      );
      return null;
    }

    const inspected = await this.evaluateInDebugTarget<{
      sourceUrl: string | null;
      accountName: string | null;
      externalAccountId: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      followerCount: number | null;
    }>(
      target.webSocketDebuggerUrl,
      `((currentPlatform) => {
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const parseCountText = (value) => {
          const normalized = normalize(value).replace(/[,，]/g, '');
          if (!normalized) return null;
          const match = normalized.match(/(\\d+(?:\\.\\d+)?)(万|w|W|k|K)?/);
          if (!match) return null;
          const base = Number(match[1]);
          if (Number.isNaN(base)) return null;
          const unit = match[2];
          if (unit === '万' || unit === 'w' || unit === 'W') return Math.round(base * 10000);
          if (unit === 'k' || unit === 'K') return Math.round(base * 1000);
          return Math.round(base);
        };
        const findFirstText = (selectors) => {
          for (const selector of selectors) {
            try {
              const node = document.querySelector(selector);
              const text = normalize(node && (node.innerText || node.textContent || ''));
              if (text && text.length <= 120) return text;
            } catch {}
          }
          return '';
        };
        const findFirstImageSrc = (selectors) => {
          for (const selector of selectors) {
            try {
              const node = document.querySelector(selector);
              const src = normalize(node && ((node.getAttribute && node.getAttribute('src')) || node.src || ''));
              if (src) return src;
            } catch {}
          }
          return '';
        };
        const normalizeDouyinAccountId = (value) => {
          const normalized = normalize(value);
          if (!normalized) return '';
          const cleaned = normalized
            .replace(/^抖音号\\s*[:：]?\\s*/i, '')
            .replace(/^douyin\\s*id\\s*[:：]?\\s*/i, '')
            .trim();
          return /^[A-Za-z0-9_-]{2,}$/.test(cleaned) ? cleaned : '';
        };
        const findDivByText = (keyword) =>
          Array.from(document.querySelectorAll('div, span, p, h2, h3'))
            .find((node) => normalize(node.innerText || node.textContent).includes(keyword));
        const pageText = normalize(document.body && (document.body.innerText || document.body.textContent || ''));

        if (currentPlatform === 'douyin') {
          const accountMatch = pageText.match(/抖音号\\s*[:：]?\\s*([A-Za-z0-9_-]+)/i);
          const displayMatch = pageText.match(/([^\\s]{1,40})\\s+抖音号\\s*[:：]?\\s*[A-Za-z0-9_-]+/i);
          const accountName =
            normalizeDouyinAccountId(findFirstText([
              'div.unique_id-EuH8eA',
              '[class*="unique_id-"]',
              '[class*="unique-id"]',
              '[class*="douyin-id"]',
            ])) ||
            normalizeDouyinAccountId(accountMatch && accountMatch[1]);
          const displayName =
            normalize(findFirstText([
              'div.name-_lSSDc',
              '[data-e2e*="user-name"]',
              '[class*="creator-name"]',
              '[class*="nickname"]',
              '[class*="user-name"]',
            ])) ||
            normalize(displayMatch && displayMatch[1]);
          const followerCount =
            parseCountText(
              findFirstText([
                'span.number-No6ev9',
                '[class*="fans"] span.number-No6ev9',
                '[class*="follower"] span.number-No6ev9',
              ]),
            ) ||
            parseCountText(pageText.replace(/^.*?粉丝/, '粉丝'));
          return {
            sourceUrl: normalize(location.href) || null,
            accountName: accountName || null,
            externalAccountId: accountName || null,
            displayName: displayName || null,
            avatarUrl:
              findFirstImageSrc([
                'img.img-PeynF_',
                'img[src*="aweme-avatar"]',
                'img[src*="douyinpic.com/aweme/"]',
              ]) || null,
            followerCount: followerCount ?? null,
          };
        }

        if (currentPlatform === 'xiaohongshu') {
          const nameNode = document.querySelector('.account-name');
          const accountIdNode = findDivByText('小红书账号') || findDivByText('小红书号');
          const avatarUrl =
            findFirstImageSrc([
              'img[src*="img.xiaohongshu.com/avatar"]',
              'img[src*="/avatar/"]',
              '.avatar img',
              '[class*="avatar"] img',
            ]) || null;
          const followerNode = Array.from(document.querySelectorAll('span, div, p')).find((node) =>
            normalize(node.innerText || node.textContent).includes('粉丝'),
          );
          const followerText =
            normalize(
              followerNode?.parentElement?.querySelector('.numerical, [class*="numerical"]')?.innerText ||
              followerNode?.parentElement?.querySelector('.numerical, [class*="numerical"]')?.textContent,
            ) ||
            normalize(followerNode?.innerText || followerNode?.textContent);
          const displayName = normalize(nameNode && (nameNode.innerText || nameNode.textContent));
          const accountIdText = normalize(accountIdNode && (accountIdNode.innerText || accountIdNode.textContent));
          const accountName =
            accountIdText.match(/小红书(?:账号|号)\\s*[:：]?\\s*([A-Za-z0-9_-]+)/)?.[1]?.trim() ||
            '';
          return {
            sourceUrl: normalize(location.href) || null,
            accountName: accountName || null,
            externalAccountId: accountName || null,
            displayName: displayName || null,
            avatarUrl,
            followerCount: parseCountText(followerText),
          };
        }

        if (currentPlatform === 'wechat_mp') {
          const nicknameNode = document.querySelector('h2.finder-nickname');
          const avatarUrl =
            findFirstImageSrc([
              'img.avatar',
              'img[src*="wx.qlogo.cn/finderhead/"]',
              '[class*="finder"] img.avatar',
              '[class*="finder"] [class*="avatar"] img',
            ]) || null;
          const extractVideoChannelId = (value) =>
            normalize(value)?.match(/视频号ID\\s*[:：]?\\s*([A-Za-z0-9_-]+)/)?.[1]?.trim() || '';
          const displayName = normalize(nicknameNode && (nicknameNode.innerText || nicknameNode.textContent));
          const idNode = findDivByText('视频号ID') || findDivByText('视频号');
          const accountName = extractVideoChannelId(
            normalize(idNode && (idNode.innerText || idNode.textContent)) || pageText,
          );
          const followerNode = Array.from(document.querySelectorAll('span, div, p')).find((node) =>
            normalize(node.innerText || node.textContent).includes('粉丝'),
          );
          const followerText =
            normalize(
              followerNode?.parentElement?.querySelector(
                '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
              )?.innerText ||
              followerNode?.parentElement?.querySelector(
                '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
              )?.textContent,
            ) ||
            normalize(followerNode?.innerText || followerNode?.textContent);
          return {
            sourceUrl: normalize(location.href) || null,
            accountName: accountName || null,
            externalAccountId: accountName || null,
            displayName: displayName || null,
            avatarUrl,
            followerCount: parseCountText(followerText),
          };
        }

        return null;
      })(${JSON.stringify(platform)})`,
    );

    if (!inspected?.sourceUrl) {
      this.reportDebugEvent(
        'H4',
        'pre-fix',
        'publishing-bitbrowser.service:inspectProfileFromDebugPort:evaluate-null',
        {
          platform,
          debugBaseUrl,
          targetUrl: target.url ?? null,
        },
      );
      return null;
    }

    return inspected;
  }

  private normalizeDebugBaseUrl(debugUrl: string | null | undefined) {
    const normalized = String(debugUrl || '').trim();
    if (!normalized) {
      return null;
    }
    return normalized.startsWith('http') ? normalized : `http://${normalized}`;
  }

  private buildRuntimeBootstrapUrl(targetUrl: string, runtimeSessionId: string) {
    return this.buildRuntimePageUrl(targetUrl, runtimeSessionId);
  }

  private async openRuntimePageWithBridgeState(
    profileBinding: BrowserProfileBinding,
    runtimeSessionId: string,
    runtime: BitBrowserOpenProfileResult,
    targetUrl: string,
  ) {
    const debugUrl = runtime.debugUrl;
    const bootstrapUrl = this.buildRuntimeBootstrapUrl(targetUrl, runtimeSessionId);
    await this.gatewayClient!.openPage(profileBinding, bootstrapUrl, runtime);
    await this.sleep(1200);
    if (await this.hasRuntimeBridgeReadySignal(runtimeSessionId)) {
      this.reportDebugEvent(
        'C1',
        'pre-fix',
        'publishing-bitbrowser.service:openRuntimePageWithBridgeState:runtime-ready-short-circuit',
        {
          runtimeSessionId,
          bootstrapUrl,
          targetUrl,
        },
      );
      return;
    }

    const persisted = await this.persistRuntimeBridgeStateAndNavigate(
      debugUrl,
      runtimeSessionId,
      targetUrl,
    );
    if (persisted) {
      this.reportDebugEvent(
        'C1',
        'pre-fix',
        'publishing-bitbrowser.service:openRuntimePageWithBridgeState:persisted',
        {
          runtimeSessionId,
          bootstrapUrl,
          targetUrl,
        },
      );
      return;
    }

    const runtimeUrl = this.buildRuntimePageUrl(targetUrl, runtimeSessionId);
    if (debugUrl) {
      try {
        await this.openTargetUrlWithDebug(debugUrl, runtimeUrl);
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          'publishing-bitbrowser.service:openRuntimePageWithBridgeState:fallback-debug-opened',
          {
            runtimeSessionId,
            runtimeUrl,
            debugUrl,
          },
        );
        return;
      } catch (error) {
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          'publishing-bitbrowser.service:openRuntimePageWithBridgeState:fallback-open-error',
          {
            runtimeSessionId,
            runtimeUrl,
            debugUrl,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    this.reportDebugEvent(
      'C1',
      'pre-fix',
      'publishing-bitbrowser.service:openRuntimePageWithBridgeState:fallback-runtime-url',
      {
        runtimeSessionId,
        bootstrapUrl,
        runtimeUrl,
        debugUrl: debugUrl ?? null,
      },
    );
    await this.gatewayClient!.openPage(profileBinding, runtimeUrl, runtime);
  }

  private async closeStaleLoginRuntimes(profileBindingId: string) {
    if (!this.repository || !this.runtimeSessionService) {
      return;
    }
    const sessions = await this.repository.listRuntimeSessionsByProfileBindingId(profileBindingId);
    const staleSessions = sessions.filter(
      (item) =>
        item.reason === 'login' &&
        !['completed', 'failed', 'closed'].includes(String(item.status || '').trim()),
    );
    for (const session of staleSessions) {
      try {
        await this.runtimeSessionService.closeRuntimeSession(session.id, 'failed');
      } catch (error) {
        this.reportDebugEvent(
          'B',
          'pre-fix',
          'publishing-bitbrowser.service:closeStaleLoginRuntimes:error',
          {
            runtimeSessionId: session.id,
            profileBindingId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  private async persistRuntimeBridgeStateAndNavigate(
    debugUrl: string | null | undefined,
    runtimeSessionId: string,
    targetUrl: string,
  ) {
    const debugBaseUrl = this.normalizeDebugBaseUrl(debugUrl);
    if (!debugBaseUrl) {
      return false;
    }

    const bridgeBaseUrl = this.getBridgeBaseUrl();
    const scriptSource = `(() => {
      const runtimeSessionId = ${JSON.stringify(runtimeSessionId)};
      const apiBaseUrl = ${JSON.stringify(bridgeBaseUrl)};
      const pairs = [
        ['AI_SUPERWEB_RUNTIME_SESSION_ID', runtimeSessionId],
        ['ai_superweb_runtime_session_id', runtimeSessionId],
        ['AI_SUPERWEB_BRIDGE_API_BASE_URL', apiBaseUrl],
        ['ai_superweb_bridge_base_url', apiBaseUrl],
      ];
      for (const [key, value] of pairs) {
        try { window.sessionStorage.setItem(key, value); } catch {}
        try { window.localStorage.setItem(key, value); } catch {}
      }
    })();`;

    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await this.hasRuntimeBridgeReadySignal(runtimeSessionId)) {
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:runtime-ready-short-circuit',
          {
            runtimeSessionId,
            debugBaseUrl,
            targetUrl,
            attempt,
          },
        );
        return true;
      }
      const pageTarget = await this.findDebugPageTarget(debugBaseUrl, targetUrl);
      if (!pageTarget?.webSocketDebuggerUrl) {
        lastError = 'debug page target missing';
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:target-missing-attempt',
          {
            runtimeSessionId,
            debugBaseUrl,
            targetUrl,
            attempt,
          },
        );
        await this.sleep(500);
        continue;
      }

      try {
        const persisted = await this.addInitScriptAndNavigateInDebugTarget(
          pageTarget.webSocketDebuggerUrl,
          scriptSource,
          targetUrl,
        );
        const success = Boolean(persisted?.navigated);
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          success
            ? 'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:success'
            : 'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:invalid-result',
          {
            runtimeSessionId,
            debugBaseUrl,
            targetUrl,
            attempt,
            currentHref: persisted?.frameUrl ?? null,
            scriptIdentifier: persisted?.scriptIdentifier ?? null,
            frameId: persisted?.frameId ?? null,
          },
        );
        if (success) {
          return true;
        }
        lastError = 'cdp init script navigate invalid result';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.reportDebugEvent(
          'C1',
          'pre-fix',
          'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:evaluate-error',
          {
            runtimeSessionId,
            debugBaseUrl,
            targetUrl,
            attempt,
            error: lastError,
          },
        );
      }

      await this.sleep(500);
    }

    this.reportDebugEvent(
      'C1',
      'pre-fix',
      'publishing-bitbrowser.service:persistRuntimeBridgeStateAndNavigate:failed',
      {
        runtimeSessionId,
        debugBaseUrl,
        targetUrl,
        lastError,
      },
    );
    return false;
  }

  private async hasRuntimeBridgeReadySignal(runtimeSessionId: string) {
    if (!this.runtimeSessionService) {
      return false;
    }
    const session = await this.runtimeSessionService.getRuntimeSession(runtimeSessionId);
    if (!session) {
      return false;
    }
    return Boolean(
      session.handshakeAt ||
        session.lastHeartbeatAt ||
        (typeof session.tabId === 'number' && session.tabId > 0) ||
        ['ready', 'running'].includes(String(session.status || '').trim()),
    );
  }

  private async addInitScriptAndNavigateInDebugTarget(
    webSocketDebuggerUrl: string,
    scriptSource: string,
    targetUrl: string,
  ) {
    return new Promise<{
      scriptIdentifier: string | null;
      navigated: boolean;
      frameId: string | null;
      frameUrl: string | null;
    }>((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const pageEnableRequestId = Date.now();
      const addScriptRequestId = pageEnableRequestId + 1;
      const navigateRequestId = pageEnableRequestId + 2;
      const removeScriptRequestId = pageEnableRequestId + 3;
      let closed = false;
      let scriptIdentifier: string | null = null;
      let navigated = false;
      let frameId: string | null = null;
      let frameUrl: string | null = null;
      let addScriptAck = false;
      let navigateAck = false;
      let removeRequested = false;

      const finish = (callback: () => void) => {
        if (closed) {
          return;
        }
        closed = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        callback();
      };

      const requestRemoveScript = () => {
        if (removeRequested) {
          return;
        }
        if (!scriptIdentifier) {
          finish(() =>
            resolve({
              scriptIdentifier: null,
              navigated,
              frameId,
              frameUrl,
            }),
          );
          return;
        }
        removeRequested = true;
        ws.send(
          JSON.stringify({
            id: removeScriptRequestId,
            method: 'Page.removeScriptToEvaluateOnNewDocument',
            params: {
              identifier: scriptIdentifier,
            },
          }),
        );
      };

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('DevTools init script navigate timeout')));
      }, 15000);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            id: pageEnableRequestId,
            method: 'Page.enable',
          }),
        );
        ws.send(
          JSON.stringify({
            id: addScriptRequestId,
            method: 'Page.addScriptToEvaluateOnNewDocument',
            params: {
              source: scriptSource,
            },
          }),
        );
      });

      ws.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.method === 'Page.frameNavigated') {
            const url = String(payload.params?.frame?.url || '').trim();
            if (url) {
              frameUrl = url;
            }
            const navigatedFrameId = String(payload.params?.frame?.id || '').trim();
            if (navigatedFrameId) {
              frameId = navigatedFrameId;
            }
            if (
              navigateAck &&
              typeof frameUrl === 'string' &&
              frameUrl.includes(new URL(targetUrl).host)
            ) {
              navigated = true;
              requestRemoveScript();
            }
            return;
          }

          if (payload.id === pageEnableRequestId) {
            return;
          }

          if (payload.id === addScriptRequestId) {
            if (payload.error) {
              finish(() =>
                reject(new Error(payload.error?.message || 'CDP add init script failed')),
              );
              return;
            }
            scriptIdentifier = String(payload.result?.identifier || '').trim() || null;
            addScriptAck = true;
            ws.send(
              JSON.stringify({
                id: navigateRequestId,
                method: 'Page.navigate',
                params: {
                  url: targetUrl,
                },
              }),
            );
            return;
          }

          if (payload.id === navigateRequestId) {
            if (payload.error) {
              finish(() =>
                reject(new Error(payload.error?.message || 'CDP page navigate failed')),
              );
              return;
            }
            navigateAck = true;
            if (
              addScriptAck &&
              typeof frameUrl === 'string' &&
              frameUrl.includes(new URL(targetUrl).host)
            ) {
              navigated = true;
              requestRemoveScript();
            }
            return;
          }

          if (payload.id === removeScriptRequestId) {
            if (payload.error) {
              finish(() =>
                reject(new Error(payload.error?.message || 'CDP remove init script failed')),
              );
              return;
            }
            finish(() =>
              resolve({
                scriptIdentifier,
                navigated,
                frameId,
                frameUrl,
              }),
            );
          }
        } catch (error) {
          finish(() => reject(error));
        }
      });

      ws.addEventListener('close', () => {
        if (closed) {
          return;
        }
        finish(() => reject(new Error('DevTools init script websocket closed unexpectedly')));
      });

      ws.addEventListener('error', () => {
        finish(() => reject(new Error('DevTools init script websocket connect failed')));
      });
    });
  }

  private async findDebugPageTarget(debugBaseUrl: string, targetUrl: string) {
    const targetHost = new URL(targetUrl).host;
    let lastTargets: Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }> = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const targets = (await fetch(`${debugBaseUrl}/json/list`).then((response) =>
        response.json(),
      )) as Array<{
        type?: string;
        url?: string;
        webSocketDebuggerUrl?: string;
      }>;
      lastTargets = targets;
      const pageTarget =
        targets.find(
          (item) =>
            item.type === 'page' &&
            typeof item.url === 'string' &&
            item.url.includes(targetHost) &&
            Boolean(item.webSocketDebuggerUrl),
        ) ??
        targets.find(
          (item) => item.type === 'page' && Boolean(item.webSocketDebuggerUrl),
        );
      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget;
      }
      await this.sleep(400);
    }

    this.reportDebugEvent(
      'C1',
      'pre-fix',
      'publishing-bitbrowser.service:findDebugPageTarget:missing',
      {
        debugBaseUrl,
        targetUrl,
        targetCount: lastTargets.length,
        targets: lastTargets.slice(0, 8).map((item) => ({
          type: item.type ?? null,
          url: item.url ?? null,
          hasSocket: Boolean(item.webSocketDebuggerUrl),
        })),
      },
    );
    return null;
  }

  private async openTargetUrlWithDebug(debugUrl: string, targetUrl: string) {
    const debugBaseUrl = this.normalizeDebugBaseUrl(debugUrl);
    if (!debugBaseUrl) {
      throw new Error('BitBrowser 调试地址无效');
    }

    const target = await this.findDebugPageTarget(debugBaseUrl, targetUrl);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('未找到可导航的 BitBrowser 页面目标');
    }
    const webSocketDebuggerUrl = target.webSocketDebuggerUrl;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const enableRequestId = Date.now();
      const navigateRequestId = enableRequestId + 1;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        callback();
      };

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('DevTools fallback navigate timeout')));
      }, 12000);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            id: enableRequestId,
            method: 'Page.enable',
          }),
        );
      });

      ws.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.id === enableRequestId) {
            ws.send(
              JSON.stringify({
                id: navigateRequestId,
                method: 'Page.navigate',
                params: {
                  url: targetUrl,
                },
              }),
            );
            return;
          }

          if (payload.id === navigateRequestId) {
            if (payload.error) {
              finish(() =>
                reject(new Error(payload.error?.message || 'CDP fallback page navigate failed')),
              );
              return;
            }
            finish(() => resolve());
          }
        } catch (error) {
          finish(() => reject(error));
        }
      });

      ws.addEventListener('error', () => {
        finish(() => reject(new Error('DevTools fallback websocket connect failed')));
      });

      ws.addEventListener('close', () => {
        if (settled) {
          return;
        }
        finish(() => reject(new Error('DevTools fallback websocket closed unexpectedly')));
      });
    });
  }

  private async evaluateInDebugTarget<T>(webSocketDebuggerUrl: string, expression: string) {
    return new Promise<T | null>((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const enableRequestId = Date.now();
      const evaluateRequestId = enableRequestId + 1;
      let closed = false;
      let evaluateSent = false;
      let evaluateContextId: number | undefined;

      const finish = (callback: () => void) => {
        if (closed) {
          return;
        }
        closed = true;
        clearTimeout(timeout);
        clearTimeout(fallbackEvaluateTimer);
        try {
          ws.close();
        } catch {}
        callback();
      };

      const sendEvaluate = () => {
        if (evaluateSent) {
          return;
        }
        evaluateSent = true;
        ws.send(
          JSON.stringify({
            id: evaluateRequestId,
            method: 'Runtime.evaluate',
            params: {
              expression,
              returnByValue: true,
              awaitPromise: true,
              contextId: evaluateContextId,
            },
          }),
        );
      };

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('DevTools evaluate timeout')));
      }, 12000);
      const fallbackEvaluateTimer = setTimeout(() => {
        sendEvaluate();
      }, 1200);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            id: enableRequestId,
            method: 'Runtime.enable',
          }),
        );
      });

      ws.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.method === 'Runtime.executionContextCreated') {
            evaluateContextId =
              typeof payload.params?.context?.id === 'number'
                ? payload.params.context.id
                : undefined;
            sendEvaluate();
            return;
          }
          if (payload.id === enableRequestId) {
            return;
          }
          if (payload.id !== evaluateRequestId) {
            return;
          }
          if (payload.error) {
            finish(() =>
              reject(new Error(payload.error?.message || 'DevTools evaluate failed')),
            );
            return;
          }
          if (payload.result?.exceptionDetails) {
            finish(() =>
              reject(
                new Error(
                  payload.result.exceptionDetails?.text || 'DevTools evaluate exception',
                ),
              ),
            );
            return;
          }
          finish(() => resolve((payload.result?.result?.value ?? null) as T | null));
        } catch (error) {
          finish(() => reject(error));
        }
      });

      ws.addEventListener('close', () => {
        if (closed) {
          return;
        }
        finish(() => reject(new Error('DevTools websocket closed unexpectedly')));
      });

      ws.addEventListener('error', () => {
        finish(() => reject(new Error('DevTools websocket connect failed')));
      });
    });
  }

  private async getCookiesInDebugTarget(
    webSocketDebuggerUrl: string,
    urls: string[],
  ): Promise<Array<Record<string, unknown>>> {
    return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      const enableRequestId = Date.now();
      const getCookiesRequestId = enableRequestId + 1;
      let closed = false;

      const finish = (callback: () => void) => {
        if (closed) {
          return;
        }
        closed = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        callback();
      };

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('DevTools get cookies timeout')));
      }, 12000);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            id: enableRequestId,
            method: 'Network.enable',
          }),
        );
      });

      ws.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.id === enableRequestId) {
            ws.send(
              JSON.stringify({
                id: getCookiesRequestId,
                method: 'Network.getCookies',
                params: {
                  urls: urls.filter((item) => typeof item === 'string' && item.trim()),
                },
              }),
            );
            return;
          }
          if (payload.id !== getCookiesRequestId) {
            return;
          }
          if (payload.error) {
            finish(() =>
              reject(new Error(payload.error?.message || 'DevTools get cookies failed')),
            );
            return;
          }
          const cookies = Array.isArray(payload.result?.cookies)
            ? payload.result.cookies
                .map((item: Record<string, unknown>) => ({
                  name: String(item?.name || '').trim(),
                  value: String(item?.value || '').trim(),
                  domain: String(item?.domain || '').trim(),
                  path: String(item?.path || '/').trim() || '/',
                  secure: Boolean(item?.secure),
                  httpOnly: Boolean(item?.httpOnly),
                  sameSite: String(item?.sameSite || '').trim() || undefined,
                  expirationDate:
                    typeof item?.expires === 'number' && Number.isFinite(item.expires)
                      ? item.expires
                      : undefined,
                }))
                .filter((item: { name: string; value: string }) => item.name && item.value)
            : [];
          finish(() => resolve(cookies));
        } catch (error) {
          finish(() => reject(error));
        }
      });

      ws.addEventListener('close', () => {
        if (closed) {
          return;
        }
        finish(() => reject(new Error('DevTools websocket closed unexpectedly')));
      });

      ws.addEventListener('error', () => {
        finish(() => reject(new Error('DevTools websocket connect failed')));
      });
    });
  }

  private buildRuntimePageUrl(baseUrl: string, runtimeSessionId: string) {
    const url = new URL(baseUrl);
    url.searchParams.set('ai_superweb_runtime_session_id', runtimeSessionId);
    url.searchParams.set('ai_superweb_bridge_base_url', this.getBridgeBaseUrl());
    return url.toString();
  }

  private getPlatformLoginUrl(platform: LeadPublishPlatform) {
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return 'https://creator.xiaohongshu.com/login';
      case LeadPublishPlatform.douyin:
        return 'https://creator.douyin.com/';
      case LeadPublishPlatform.wechat_mp:
        return 'https://channels.weixin.qq.com/';
      case LeadPublishPlatform.kuaishou:
        return 'https://cp.kuaishou.com/profile';
      default:
        throw new ConflictException(`平台 ${platform} 暂不支持 BitBrowser 登录`);
    }
  }

  private getPlatformPublishUrl(
    platform: LeadPublishPlatform,
    job: { draftVideoUrl?: string | null },
  ) {
    const hasVideo = Boolean(job.draftVideoUrl?.trim());
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return hasVideo
          ? 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video&openFilePicker=true'
          : 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true';
      case LeadPublishPlatform.douyin:
        return 'https://creator.douyin.com/creator-micro/home';
      case LeadPublishPlatform.wechat_mp:
        return 'https://channels.weixin.qq.com/platform';
      case LeadPublishPlatform.kuaishou:
        return 'https://cp.kuaishou.com/profile';
      default:
        throw new ConflictException(`平台 ${platform} 暂不支持 BitBrowser 发布`);
    }
  }

  private toBitBrowserPlatform(platform: LeadPublishPlatform): PlatformType {
    if (platform === LeadPublishPlatform.wechat_mp) {
      return 'wechat_mp';
    }
    return platform;
  }

  private normalizeGroupId(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ConflictException('账号组不能为空，请先填写账号组，例如 A 或 B');
    }
    return normalized.slice(0, 80);
  }

  private buildOwnerCode(groupId: string) {
    return `platform-group:${groupId.toLowerCase()}`;
  }

  private buildOwnerName(groupId: string) {
    return `账号组 ${groupId}`;
  }

  private buildDedicatedProfileName(platform: LeadPublishPlatform, accountName: string) {
    return `${this.getPlatformLabel(platform)} ${accountName}`.slice(0, 80);
  }

  private buildDedicatedBrowserCreatePayload(
    ownerName: string,
    profileName: string,
    basePayload?: Partial<BitBrowserBrowserCreatePayload>,
  ): BitBrowserBrowserCreatePayload {
    const nextBasePayload = basePayload ?? {};
    return {
      proxyMethod: 2,
      proxyType: 'noproxy',
      syncExtensions: true,
      syncUserExtensions: true,
      browserFingerPrint: {
        coreProduct: 'chrome',
        coreVersion: '130',
        ostype: 'PC',
        os: 'Win32',
        osVersion: '11,10',
        ...(nextBasePayload.browserFingerPrint ?? {}),
      },
      ...nextBasePayload,
      name: profileName || nextBasePayload.name || `${ownerName} 专属环境`,
    };
  }

  private getPlatformLabel(platform: LeadPublishPlatform) {
    switch (platform) {
      case LeadPublishPlatform.douyin:
        return '抖音';
      case LeadPublishPlatform.xiaohongshu:
        return '小红书';
      case LeadPublishPlatform.wechat_mp:
        return '视频号';
      case LeadPublishPlatform.kuaishou:
        return '快手';
      default:
        return platform;
    }
  }

  private getBackendApiBaseUrl() {
    const explicit =
      this.configService.get<string>('BITBROWSER_BACKEND_API_BASE_URL')?.trim() ||
      this.configService.get<string>('BACKEND_API_BASE_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }

    const port = this.configService.get<string>('PORT')?.trim() || '3001';
    return `http://127.0.0.1:${port}`;
  }

  private getStorageFilePath() {
    const configured = this.configService.get<string>('BITBROWSER_STORAGE_FILE')?.trim();
    if (configured) {
      return resolve(configured);
    }
    return resolve(process.cwd(), '.runtime', 'bitbrowser', 'bitbrowser.store.json');
  }

  private buildOpenArgs() {
    const openArgs: string[] = [];
    const extensionDir = this.getBitBrowserExtensionDir();
    if (!extensionDir) {
      return openArgs;
    }

    const disableExceptArg = `--disable-extensions-except=${extensionDir}`;
    if (!openArgs.includes(disableExceptArg)) {
      openArgs.push(disableExceptArg);
    }

    const loadExtensionArg = `--load-extension=${extensionDir}`;
    if (!openArgs.includes(loadExtensionArg)) {
      openArgs.push(loadExtensionArg);
    }

    return Array.from(new Set(openArgs));
  }

  private getBitBrowserExtensionDir() {
    const clientDirCandidates = [
      join(dirname(process.execPath), 'platform-login-helper'),
      join(process.cwd(), 'platform-login-helper'),
    ];
    for (const candidate of clientDirCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const workspaceExtensionDir = resolve(
      process.cwd(),
      '..',
      'scripts',
      'browser-extension',
      'platform-login-helper',
    );
    if (existsSync(workspaceExtensionDir)) {
      return workspaceExtensionDir;
    }

    return join(os.homedir(), 'AISuperWeb', 'platform-login-helper');
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      return fallback;
    }
    return value === '1' || value.toLowerCase() === 'true';
  }

  private readNumberEnv(name: string, fallback: number) {
    const raw = this.configService.get<string>(name)?.trim();
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  // #region debug-point A:report-debug-event
  private reportDebugEvent(
    hypothesisId: string,
    runId: string,
    location: string,
    data: Record<string, unknown>,
  ) {
    const sessionId = 'douyin-publish-idle';
    const payload = {
      sessionId,
      runId,
      hypothesisId,
      location,
      msg: `[DEBUG] ${location}`,
      data,
      ts: Date.now(),
    };
    void fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    const filePath = resolve(process.cwd(), '.runtime', 'bitbrowser', 'debug-handshake.ndjson');
    void mkdir(dirname(filePath), { recursive: true })
      .then(() => appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8'))
      .catch(() => undefined);
  }
  // #endregion
}

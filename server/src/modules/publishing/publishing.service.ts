import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  LeadContentStatus,
  LeadPublishPlatform,
  LeadPublishMode,
  LeadPublishStatus,
  PlatformAccountAuthType,
  PlatformAccountLoginStatus,
  PlatformAccountProvider,
  PlatformAccountStatus,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProductImageStorageService } from '../products/product-image-storage.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreatePlatformAccountDto } from './dto/create-platform-account.dto';
import { ListPublishingContentsQueryDto } from './dto/list-publishing-contents-query.dto';
import { ListPublishingJobsQueryDto } from './dto/list-publishing-jobs-query.dto';
import { ListPlatformAccountsQueryDto } from './dto/list-platform-accounts-query.dto';
import { PublishLeadContentDto } from './dto/publish-lead-content.dto';
import { StartMcpPlatformLoginDto } from './dto/start-mcp-platform-login.dto';
import { StartOfficialOauthLoginDto } from './dto/start-official-oauth-login.dto';
import { StartExtensionPublishJobDto } from './dto/start-extension-publish-job.dto';
import { StartPlatformExtensionLoginDto } from './dto/start-platform-extension-login.dto';
import { StartPlatformLoginDto } from './dto/start-platform-login.dto';
import { SyncExtensionPublishJobDto } from './dto/sync-extension-publish-job.dto';
import { SyncPlatformExtensionLoginDto } from './dto/sync-platform-extension-login.dto';
import { SyncPublishingContentDto } from './dto/sync-publishing-content.dto';
import { UpdatePlatformAccountDto } from './dto/update-platform-account.dto';
import { DouyinShareSchemaService } from './douyin-share-schema.service';
import { KuaishouOpenApiService } from './kuaishou-open-api.service';
import { PlatformLoginBrowserService } from './platform-login-browser.service';
import { WechatOfficialPublishService } from './wechat-official-publish.service';
import { BilibiliOpenApiService } from './bilibili-open-api.service';
import { PublishingBitBrowserService } from './publishing-bitbrowser.service';

const leadContentInclude = {
  creator: {
    select: { id: true, username: true, displayName: true, role: true },
  },
  publishJobs: {
    orderBy: [{ createdAt: 'desc' }],
    take: 10,
  },
} satisfies Prisma.LeadContentInclude;

type LeadContentWithRelations = Prisma.LeadContentGetPayload<{
  include: typeof leadContentInclude;
}>;

const leadContentListInclude = {
  creator: {
    select: { id: true, username: true, displayName: true, role: true },
  },
} satisfies Prisma.LeadContentInclude;

type LeadContentListItem = Prisma.LeadContentGetPayload<{
  include: typeof leadContentListInclude;
}>;

const leadPublishJobInclude = {
  leadContent: {
    select: {
      id: true,
      title: true,
      body: true,
      images: true,
      coverImage: true,
      creatorId: true,
    },
  },
  platformAccount: {
    select: {
      id: true,
      platform: true,
      provider: true,
      authType: true,
      authPayloadEncrypted: true,
      accountName: true,
      displayName: true,
      browserSessionPath: true,
      externalAccountId: true,
      externalGroupId: true,
      externalMeta: true,
      status: true,
      loginStatus: true,
    },
  },
} satisfies Prisma.LeadPublishJobInclude;

type LeadPublishJobWithRelations = Prisma.LeadPublishJobGetPayload<{
  include: typeof leadPublishJobInclude;
}>;

type LeadPublishJobPlain = Prisma.LeadPublishJobGetPayload<Record<string, never>>;

const leadPlatformAccountInclude = {
  creator: {
    select: {
      id: true,
      displayName: true,
    },
  },
} satisfies Prisma.LeadPlatformAccountInclude;

type LeadPlatformAccountWithRelations = Prisma.LeadPlatformAccountGetPayload<{
  include: typeof leadPlatformAccountInclude;
}>;

const PENDING_LOGIN_PLACEHOLDER = '__PLATFORM_LOGIN_PENDING__';
const PENDING_LOGIN_PREVIEW = '浏览器登录中，完成后自动回收 Cookie';
const EXTENSION_LOGIN_TOKEN_PURPOSE = 'publishing_extension_login';
const EXTENSION_PUBLISH_TOKEN_PURPOSE = 'publishing_extension_publish';
const OFFICIAL_OAUTH_STATE_PURPOSE = 'publishing_official_oauth';
const EXTENSION_LOGIN_TTL_SECONDS = 5 * 60;
const EXTENSION_PUBLISH_TTL_SECONDS = 10 * 60;
const SUPPORTED_AUTO_PUBLISH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
  LeadPublishPlatform.kuaishou,
  LeadPublishPlatform.wechat_official,
  LeadPublishPlatform.bilibili,
]);
const FORCE_EXTENSION_PUBLISH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
]);
const BITBROWSER_EXTENSION_PUBLISH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
]);
const BITBROWSER_SHARED_PROFILE_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
  LeadPublishPlatform.kuaishou,
]);
const BITBROWSER_KEEPALIVE_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
  LeadPublishPlatform.kuaishou,
]);
const SUPPORTED_OFFICIAL_OAUTH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.kuaishou,
  LeadPublishPlatform.bilibili,
  LeadPublishPlatform.wechat_official,
]);

type ExtensionLoginSession = {
  sessionId: string;
  userId: string;
  platform: LeadPublishPlatform;
  accountId: string | null;
  externalGroupId: string | null;
  profileId: string | null;
  expiresAt: number;
  status: 'pending' | 'completed';
  syncedAccountId: string | null;
  runtimeSessionId: string | null;
};

type ExtensionLoginTokenPayload = {
  purpose: typeof EXTENSION_LOGIN_TOKEN_PURPOSE;
  sid: string;
  uid: string;
  platform: LeadPublishPlatform;
  aid?: string | null;
};

type ExtensionPublishTokenPayload = {
  purpose: typeof EXTENSION_PUBLISH_TOKEN_PURPOSE;
  jid: string;
  uid: string;
  platform: LeadPublishPlatform;
  aid: string;
};

type OfficialOauthStatePayload = {
  purpose: typeof OFFICIAL_OAUTH_STATE_PURPOSE;
  uid: string;
  platform: LeadPublishPlatform;
  aid?: string | null;
};

type OfficialOauthClientConfig = {
  clientId: string;
  clientSecret: string;
  scope: string;
  preAuthCode?: string;
  bizAppId?: string;
};

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);
  private readonly backgroundRunningJobIds = new Set<string>();
  private readonly extensionLoginSessions = new Map<string, ExtensionLoginSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly productImageStorageService: ProductImageStorageService,
    private readonly platformLoginBrowserService: PlatformLoginBrowserService,
    private readonly douyinShareSchemaService: DouyinShareSchemaService,
    private readonly kuaishouOpenApiService: KuaishouOpenApiService,
    private readonly wechatOfficialPublishService: WechatOfficialPublishService,
    private readonly bilibiliOpenApiService: BilibiliOpenApiService,
    private readonly publishingBitBrowserService: PublishingBitBrowserService,
  ) {}

  async listContents(user: SessionUser, query: ListPublishingContentsQueryDto) {
    const trimmedQuery = query.q?.trim();
    const where: Prisma.LeadContentWhereInput = {
      ...(this.isMainCompany(user) ? {} : { creatorId: user.userId }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.contentType ? { contentType: query.contentType } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.platformStyle ? { platformStyle: query.platformStyle } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { title: { contains: trimmedQuery, mode: 'insensitive' } },
              { body: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.leadContent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: leadContentListInclude,
      }),
      this.prisma.leadContent.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeLeadContentListItem(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  async getContentById(user: SessionUser, id: string) {
    const item = await this.findAccessibleLeadContent(user, id);
    return this.serializeLeadContent(item);
  }

  async syncFromSource(user: SessionUser, dto: SyncPublishingContentDto) {
    const normalizedTags = this.normalizeTags(dto.tags);
    const persistedAssets = await this.persistLeadContentAssets(user.userId, {
      coverImage: dto.coverImage?.trim() || null,
      images: dto.images ?? [],
      videoUrl: dto.videoUrl?.trim() || null,
    });
    const existing =
      dto.sourceId?.trim()
        ? await this.prisma.leadContent.findFirst({
            where: {
              creatorId: user.userId,
              sourceType: dto.sourceType,
              sourceId: dto.sourceId.trim(),
              status: {
                not: LeadContentStatus.deleted,
              },
            },
            include: leadContentInclude,
          })
        : null;

    if (existing) {
      const needsRefresh =
        existing.title !== dto.title.trim() ||
        existing.body !== dto.body.trim() ||
        !this.areStringArraysEqual(existing.tags, normalizedTags) ||
        existing.contentType !== dto.contentType ||
        existing.platformStyle !== dto.platformStyle ||
        existing.coverImage !== persistedAssets.coverImage ||
        existing.videoUrl !== persistedAssets.videoUrl ||
        !this.areStringArraysEqual(existing.images, persistedAssets.images);

      if (!needsRefresh) {
        return this.serializeLeadContent(existing);
      }

      const updated = await this.prisma.leadContent.update({
        where: { id: existing.id },
        data: {
          title: dto.title.trim(),
          body: dto.body.trim(),
          tags: normalizedTags,
          contentType: dto.contentType,
          platformStyle: dto.platformStyle,
          coverImage: persistedAssets.coverImage,
          images: persistedAssets.images,
          videoUrl: persistedAssets.videoUrl,
          status: LeadContentStatus.active,
        },
        include: leadContentInclude,
      });
      return this.serializeLeadContent(updated);
    }

    const created = await this.prisma.leadContent.create({
      data: {
        creatorId: user.userId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId?.trim() || null,
        title: dto.title.trim(),
        body: dto.body.trim(),
        tags: normalizedTags,
        contentType: dto.contentType,
        platformStyle: dto.platformStyle,
        coverImage: persistedAssets.coverImage,
        images: persistedAssets.images,
        videoUrl: persistedAssets.videoUrl,
        status: LeadContentStatus.active,
      },
      include: leadContentInclude,
    });

    return this.serializeLeadContent(created);
  }

  async publishContent(user: SessionUser, id: string, dto: PublishLeadContentDto) {
    this.logger.log(
      `[publish-request] content=${id} user=${user.userId} targets=${dto.targets
        .map((item) => `${item.platform}:${item.platformAccountId}`)
        .join(',')}`,
    );
    let content = await this.findAccessibleLeadContent(user, id);
    content = await this.ensureLeadContentAssetsPersisted(content);

    if (content.status !== LeadContentStatus.active) {
      throw new ForbiddenException('当前内容状态不可发布');
    }

    const uniquePlatforms = new Set<string>();
    for (const target of dto.targets) {
      if (uniquePlatforms.has(target.platform)) {
        throw new ConflictException('同一平台只能选择一个发布账号');
      }
      uniquePlatforms.add(target.platform);
    }

    const requestedAccountIds = dto.targets.map((item) => item.platformAccountId.trim());
    const platformAccounts = await this.prisma.leadPlatformAccount.findMany({
      where: {
        id: { in: requestedAccountIds },
        ...(this.isMainCompany(user) ? {} : { creatorId: user.userId }),
      },
      include: leadPlatformAccountInclude,
    });
    const platformAccountMap = new Map(platformAccounts.map((item) => [item.id, item]));

    for (const target of dto.targets) {
      const account = platformAccountMap.get(target.platformAccountId.trim());
      if (!account) {
        throw new NotFoundException('所选平台账号不存在');
      }
      if (!this.isAutoPublishPlatformSupported(target.platform as LeadPublishPlatform)) {
        throw new ConflictException('当前阶段仅支持小红书、抖音、视频号、快手自动发布');
      }
      if (account.platform !== (target.platform as LeadPublishPlatform)) {
        throw new ConflictException('平台与所选账号不匹配');
      }
      if (
        account.loginStatus !== PlatformAccountLoginStatus.authenticated ||
        account.status !== PlatformAccountStatus.valid
      ) {
        throw new ConflictException('所选平台账号尚未完成有效登录');
      }
    }

    if (
      dto.executionMode !== 'extension' &&
      dto.targets.some((item) => FORCE_EXTENSION_PUBLISH_PLATFORMS.has(item.platform as LeadPublishPlatform))
    ) {
      throw new ConflictException('小红书、视频号发布已切回浏览器扩展执行，请使用扩展发布模式');
    }

    const createdJobs = await this.prisma.$transaction(
      dto.targets.map((target) => {
        const account = platformAccountMap.get(target.platformAccountId.trim());
        if (!account) {
          throw new NotFoundException('所选平台账号不存在');
        }
        const draftPayload = this.buildPublishDraftPayload(
          content,
          target.platform as LeadPublishPlatform,
          {
            draftTitle: target.draftTitle,
            draftBody: target.draftBody,
            draftTags: target.draftTags,
          },
        );
        return this.prisma.leadPublishJob.create({
          data: {
            leadContentId: content.id,
            createdById: user.userId,
            platform: target.platform as LeadPublishPlatform,
            provider: account.provider,
            platformAccountId: account.id,
            publishMode: LeadPublishMode.draft_box,
            status: LeadPublishStatus.queued,
            draftTitle: draftPayload.title,
            draftBody: draftPayload.body,
            draftTags: draftPayload.tags,
            draftImages: draftPayload.images,
            draftVideoUrl: draftPayload.videoUrl,
          },
        });
      }),
    );

    this.logger.log(
      `[publish-request] queued jobs=${createdJobs
        .map((job) => `${job.id}:${job.platform}:${job.platformAccountId}`)
        .join(',')}`,
    );

    if (dto.executionMode === 'extension') {
      for (const job of createdJobs) {
        await this.startBitBrowserPublishJob(job.id);
      }
    } else {
      this.triggerPublishJobs(createdJobs.map((job) => job.id));
    }

    const refreshedJobs = await this.prisma.leadPublishJob.findMany({
      where: {
        id: {
          in: createdJobs.map((job) => job.id),
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      include: leadPublishJobInclude,
    });

    return {
      contentId: content.id,
      jobs: refreshedJobs.map((job) => this.serializePublishJob(job)),
    };
  }

  async startExtensionPublishJob(user: SessionUser, dto: StartExtensionPublishJobDto) {
    const job = await this.findAccessibleLeadPublishJob(user, dto.jobId.trim());
    return this.prepareExtensionPublishSession(job, user.userId);
  }

  async getExtensionPublishAuth(sessionToken: string) {
    const tokenPayload = await this.verifyExtensionPublishToken(sessionToken.trim());
    const job = await this.prisma.leadPublishJob.findFirst({
      where: {
        id: tokenPayload.jid,
        createdById: tokenPayload.uid,
      },
      include: leadPublishJobInclude,
    });

    if (!job) {
      throw new NotFoundException('扩展发布任务不存在或无权限访问');
    }

    const accountAuthPayload = this.getValidatedExtensionPublishAuthPayload(job);
    const accountCookiePayload = this.getExtensionAccountCookiePayload(job.platformAccount);
    return {
      sessionToken: sessionToken.trim(),
      accountAuthPayload,
      accountCookiePayload,
      platform: job.platform,
      platformAccountId: job.platformAccount!.id,
    };
  }

  async openPlatformAccountHome(user: SessionUser, accountId: string) {
    const account = await this.findAccessiblePlatformAccount(user, accountId.trim());

    if (account.provider !== PlatformAccountProvider.extension) {
      throw new ConflictException('当前仅支持扩展登录账号在 BitBrowser 中打开');
    }

    if (account.authType !== PlatformAccountAuthType.cookie) {
      throw new ConflictException('当前账号不是 Cookie 登录态，无法在 BitBrowser 中打开');
    }

    const authPayload = this.decryptAuthPayload(account.authPayloadEncrypted).trim();
    if (!authPayload || authPayload === PENDING_LOGIN_PLACEHOLDER) {
      throw new ConflictException('当前账号缺少可用 Cookie，请先重新登录后再试');
    }

    const validation = this.validateAuthPayload(PlatformAccountAuthType.cookie, authPayload);
    if (validation.status !== PlatformAccountStatus.valid) {
      throw new ConflictException(validation.lastError ?? '当前账号 Cookie 不可用，请重新登录后再试');
    }

    const externalGroupId = this.requireExternalGroupId(account, account.platform);
    const opened = await this.publishingBitBrowserService.openPlatformAccountHome({
      creatorId: account.creatorId,
      platform: account.platform,
      accountId: account.id,
      accountName: account.accountName,
      externalGroupId,
    });

    return {
      platform: account.platform,
      loginUrl: opened.loginUrl,
      profileId: opened.profileId,
    };
  }

  async syncExtensionPublishJob(dto: SyncExtensionPublishJobDto) {
    const tokenPayload = await this.verifyExtensionPublishToken(dto.sessionToken);
    const job = await this.prisma.leadPublishJob.findUnique({
      where: { id: tokenPayload.jid },
      include: leadPublishJobInclude,
    });

    if (!job || !job.platformAccountId || !job.platformAccount) {
      throw new NotFoundException('发布任务不存在');
    }

    if (job.platform !== tokenPayload.platform || job.platformAccountId !== tokenPayload.aid) {
      throw new UnauthorizedException('扩展发布任务与平台账号不匹配');
    }

    const nextAuthPayload = dto.authPayload?.trim() || '';
    const nextCookiePayload = this.normalizeExtensionCookiePayload(dto.cookiePayload);

    if (nextAuthPayload || nextCookiePayload) {
      const updatedAccount = await this.prisma.leadPlatformAccount.update({
        where: { id: job.platformAccount.id },
        data: {
          accountName: dto.accountName?.trim() || job.platformAccount.accountName,
          displayName:
            dto.displayName !== undefined
              ? dto.displayName.trim() || null
              : job.platformAccount.displayName,
          ...(nextAuthPayload
            ? {
                authType: PlatformAccountAuthType.cookie,
                authPayloadEncrypted: this.encryptAuthPayload(nextAuthPayload),
                authPayloadPreview: this.maskAuthPayload(nextAuthPayload),
                status: PlatformAccountStatus.valid,
                loginStatus: PlatformAccountLoginStatus.authenticated,
                lastLoginCompletedAt: new Date(),
                lastValidatedAt: new Date(),
                lastError: null,
              }
            : {}),
          ...(nextCookiePayload
            ? {
                externalMeta: {
                  ...(job.platformAccount.externalMeta &&
                  typeof job.platformAccount.externalMeta === 'object' &&
                  !Array.isArray(job.platformAccount.externalMeta)
                    ? (job.platformAccount.externalMeta as Record<string, unknown>)
                    : {}),
                  cookiePayload: nextCookiePayload,
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
        include: leadPlatformAccountInclude,
      });
      await this.publishingBitBrowserService
        .persistDedicatedProfileCookie({
          profileId: this.extractExternalProfileId(updatedAccount.externalMeta),
          runtimeSessionId: dto.runtimeSessionId?.trim() || null,
          authPayload: nextAuthPayload || null,
          cookiePayload: nextCookiePayload,
          source: 'sync-extension-publish-job',
        })
        .catch(() => undefined);
    }

    const nextStatus =
      dto.status === 'running'
        ? LeadPublishStatus.running
        : dto.status === 'success'
          ? LeadPublishStatus.success
          : LeadPublishStatus.failed;
    const runtimeSessionId = dto.runtimeSessionId?.trim() || null;

    const updated = await this.prisma.leadPublishJob.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        draftUrl: dto.draftUrl?.trim() || job.draftUrl,
        draftedAt: dto.status === 'success' ? new Date() : job.draftedAt,
        lastError:
          dto.status === 'failed'
            ? dto.lastError?.trim() || '本地扩展执行发布失败'
            : dto.status === 'success'
              ? null
              : job.lastError,
      },
      include: leadPublishJobInclude,
    });

    if (nextStatus === LeadPublishStatus.failed && updated.platformAccountId) {
      await this.markPlatformAccountAuthExpiredIfNeeded(
        updated.platformAccountId,
        updated.lastError || '',
      );
    }

    if (nextStatus === LeadPublishStatus.success || nextStatus === LeadPublishStatus.failed) {
      await this.publishingBitBrowserService.closeRuntimeSession(
        runtimeSessionId,
        nextStatus === LeadPublishStatus.success ? 'completed' : 'failed',
      );
    }

    return this.serializePublishJob(updated);
  }

  async listJobs(user: SessionUser, query: ListPublishingJobsQueryDto) {
    const trimmedContentId = query.contentId?.trim();
    const where: Prisma.LeadPublishJobWhereInput = {
      ...(this.isMainCompany(user)
        ? {}
        : {
            OR: [{ createdById: user.userId }, { leadContent: { creatorId: user.userId } }],
          }),
      ...(query.platform ? { platform: query.platform as LeadPublishPlatform } : {}),
      ...(query.status ? { status: query.status as LeadPublishStatus } : {}),
      ...(trimmedContentId ? { leadContentId: trimmedContentId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.leadPublishJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: leadPublishJobInclude,
      }),
      this.prisma.leadPublishJob.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializePublishJob(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  async getJobById(user: SessionUser, id: string) {
    const item = await this.findAccessibleLeadPublishJob(user, id);
    return this.serializePublishJob(item);
  }

  async retryJob(user: SessionUser, id: string) {
    const job = await this.findAccessibleLeadPublishJob(user, id);
    const updated = await this.prisma.leadPublishJob.update({
      where: { id: job.id },
      data: {
        status: LeadPublishStatus.queued,
        lastError: null,
      },
      include: leadPublishJobInclude,
    });
    if (this.shouldUseBitBrowserPublish(updated)) {
      await this.startBitBrowserPublishJob(updated.id);
    } else {
      this.triggerPublishJobs([updated.id]);
    }
    return this.serializePublishJob(updated);
  }

  async deleteJob(user: SessionUser, id: string) {
    const job = await this.findAccessibleLeadPublishJob(user, id);
    await this.prisma.leadPublishJob.delete({
      where: { id: job.id },
    });
    return { id: job.id };
  }

  async listPlatformAccounts(user: SessionUser, query: ListPlatformAccountsQueryDto) {
    const where: Prisma.LeadPlatformAccountWhereInput = {
      ...(this.isMainCompany(user) ? {} : { creatorId: user.userId }),
      ...(query.platform ? { platform: query.platform as LeadPublishPlatform } : {}),
      ...(query.status ? { status: query.status as PlatformAccountStatus } : {}),
      ...(query.provider ? { provider: query.provider as PlatformAccountProvider } : {}),
      ...(query.loginStatus
        ? { loginStatus: query.loginStatus as PlatformAccountLoginStatus }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.leadPlatformAccount.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: leadPlatformAccountInclude,
      }),
      this.prisma.leadPlatformAccount.count({ where }),
    ]);

    const normalizedItems =
      query.autoComplete === 'pending'
        ? await Promise.all(
            items.map(async (item) => {
              if (item.loginStatus !== PlatformAccountLoginStatus.pending) {
                return item;
              }

              return this.tryAutoCompletePlatformLogin(item);
            }),
          )
        : items;

    return {
      items: normalizedItems.map((item) => this.serializePlatformAccount(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  async keepAliveLoggedInPlatformAccounts(user: SessionUser) {
    return this.runKeepAliveForPlatformAccounts({
      creatorId: this.isMainCompany(user) ? null : user.userId,
      trigger: 'manual',
    });
  }

  async runScheduledKeepAliveForPlatformAccounts() {
    return this.runKeepAliveForPlatformAccounts({
      creatorId: null,
      trigger: 'schedule',
    });
  }

  async createPlatformAccount(user: SessionUser, dto: CreatePlatformAccountDto) {
    const accountName = dto.accountName.trim();
    const authPayload = dto.authPayload.trim();
    const displayName = dto.displayName?.trim() || null;
    const remark = dto.remark?.trim() || null;
    const externalGroupId = dto.externalGroupId?.trim() || null;

    if (!accountName) {
      throw new ConflictException('账号名称不能为空');
    }

    if (!authPayload) {
      throw new ConflictException('Cookie / Token 不能为空');
    }

    try {
      const created = await this.prisma.leadPlatformAccount.create({
        data: {
          creatorId: user.userId,
          platform: dto.platform as LeadPublishPlatform,
          authType: dto.authType as PlatformAccountAuthType,
          accountName,
          displayName,
          authPayloadEncrypted: this.encryptAuthPayload(authPayload),
          authPayloadPreview: this.maskAuthPayload(authPayload),
          status: PlatformAccountStatus.saved,
          remark,
          externalGroupId,
        },
        include: leadPlatformAccountInclude,
      });

      return this.serializePlatformAccount(created);
    } catch (error) {
      this.handlePlatformAccountWriteError(error);
    }
  }

  async startPlatformLogin(user: SessionUser, dto: StartPlatformLoginDto) {
    const remark = dto.remark?.trim() || null;
    const accountName = `pending_${dto.platform}_${Date.now()}`;

    let created: LeadPlatformAccountWithRelations;
    try {
      created = await this.prisma.leadPlatformAccount.create({
        data: {
          creatorId: user.userId,
          platform: dto.platform as LeadPublishPlatform,
          authType: PlatformAccountAuthType.cookie,
          accountName,
          displayName: null,
          authPayloadEncrypted: this.encryptAuthPayload(PENDING_LOGIN_PLACEHOLDER),
          authPayloadPreview: PENDING_LOGIN_PREVIEW,
          status: PlatformAccountStatus.saved,
          remark,
        },
        include: leadPlatformAccountInclude,
      });
    } catch (error) {
      this.handlePlatformAccountWriteError(error);
    }

    return this.launchHostedLoginForAccount(created);
  }

  async startPlatformExtensionLogin(user: SessionUser, dto: StartPlatformExtensionLoginDto) {
    this.cleanupExpiredExtensionLoginSessions();

    const platform = dto.platform as LeadPublishPlatform;
    const requestedAccountId = dto.accountId?.trim() || null;
    // #region debug-point A:video-login-entry
    void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"A",location:"server/src/modules/publishing/publishing.service.ts:startPlatformExtensionLogin:entry",msg:"[DEBUG] extension login start entry",data:{userId:user.userId,platform,requestedAccountId,requestedGroupId:dto.externalGroupId?.trim()||null},ts:Date.now()})}).catch(()=>undefined);
    // #endregion
    // #region debug-point A:extension-login-entry
    this.reportDebugEvent('A', 'pre-fix', 'publishing.service:startPlatformExtensionLogin:entry', {
      userId: user.userId,
      platform,
      accountId: requestedAccountId,
      requestedGroupId: dto.externalGroupId?.trim() || null,
    });
    // #endregion
    let currentAccount: LeadPlatformAccountWithRelations | null = null;

    if (requestedAccountId) {
      currentAccount = await this.findAccessiblePlatformAccount(user, requestedAccountId);
      if (currentAccount.platform !== platform) {
        throw new ConflictException('平台与所选账号不匹配');
      }
    }

    const externalGroupId = await this.resolvePlatformLoginGroupId({
      userId: user.userId,
      platform,
      currentAccount,
      requestedGroupId: dto.externalGroupId?.trim() || null,
    });
    // #region debug-point A:group-resolved
    this.reportDebugEvent('A', 'pre-fix', 'publishing.service:startPlatformExtensionLogin:group-resolved', {
      userId: user.userId,
      platform,
      accountId: requestedAccountId,
      externalGroupId,
      currentAccountId: currentAccount?.id || null,
    });
    // #endregion

    if (!currentAccount) {
      const pendingAccountName = `pending_${platform}_${externalGroupId}_${Date.now().toString(36)}`;
      try {
        currentAccount = await this.prisma.leadPlatformAccount.create({
          data: {
            creatorId: user.userId,
            platform,
            authType: PlatformAccountAuthType.cookie,
            accountName: pendingAccountName,
            displayName: null,
            authPayloadEncrypted: this.encryptAuthPayload(PENDING_LOGIN_PLACEHOLDER),
            authPayloadPreview: PENDING_LOGIN_PREVIEW,
            status: PlatformAccountStatus.saved,
            externalGroupId,
          },
          include: leadPlatformAccountInclude,
        });
      } catch (error) {
        this.handlePlatformAccountWriteError(error);
      }
    }

    const accountId = currentAccount.id;

    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + EXTENSION_LOGIN_TTL_SECONDS * 1000;
    const sessionToken = await this.jwtService.signAsync(
      {
        purpose: EXTENSION_LOGIN_TOKEN_PURPOSE,
        sid: sessionId,
        uid: user.userId,
        platform,
        aid: accountId,
      } satisfies ExtensionLoginTokenPayload,
      {
        expiresIn: `${EXTENSION_LOGIN_TTL_SECONDS}s`,
      },
    );

    this.extensionLoginSessions.set(sessionId, {
      sessionId,
      userId: user.userId,
      platform,
      accountId,
      externalGroupId,
      profileId: null,
      expiresAt,
      status: 'pending',
      syncedAccountId: null,
      runtimeSessionId: null,
    });

    let runtime;
    try {
      runtime = await this.publishingBitBrowserService.startLoginRuntime({
        creatorId: user.userId,
        platform,
        accountId,
        accountName: currentAccount.accountName,
        externalGroupId,
        sessionId,
        sessionToken,
        forceFreshLogin: Boolean(requestedAccountId),
      });
    } catch (error) {
      this.extensionLoginSessions.delete(sessionId);
      // #region debug-point A:video-login-error
      void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"A",location:"server/src/modules/publishing/publishing.service.ts:startPlatformExtensionLogin:error",msg:"[DEBUG] extension login start failed",data:{platform,accountId,externalGroupId,error:error instanceof Error ? error.message : String(error),errorName:error instanceof Error ? error.name : typeof error},ts:Date.now()})}).catch(()=>undefined);
      // #endregion
      if (error instanceof HttpException) {
        throw error;
      }
      const message = this.normalizePlatformLoginErrorMessage(error);
      throw new ConflictException(message);
    }
    // #region debug-point A:video-login-runtime
    void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"A",location:"server/src/modules/publishing/publishing.service.ts:startPlatformExtensionLogin:runtime",msg:"[DEBUG] extension login runtime created",data:{platform,accountId,externalGroupId,runtimeSessionId:runtime.runtimeSessionId,profileId:runtime.profileId,ownerId:runtime.ownerId||null,loginUrl:runtime.loginUrl},ts:Date.now()})}).catch(()=>undefined);
    // #endregion
    // #region debug-point A:runtime-created
    this.reportDebugEvent('A', 'pre-fix', 'publishing.service:startPlatformExtensionLogin:runtime-created', {
      sessionId,
      runtimeSessionId: runtime.runtimeSessionId,
      profileId: runtime.profileId,
      externalGroupId,
      loginUrl: runtime.loginUrl,
    });
    // #endregion

    if (currentAccount) {
      await this.prisma.leadPlatformAccount.update({
        where: { id: currentAccount.id },
        data: {
          loginStatus: PlatformAccountLoginStatus.pending,
          lastLoginStartedAt: new Date(),
          loginUrl: runtime.loginUrl,
          lastError: null,
          externalGroupId,
        },
      });
    }

    const storedSession = this.extensionLoginSessions.get(sessionId);
    if (storedSession) {
      storedSession.runtimeSessionId = runtime.runtimeSessionId;
      storedSession.profileId = runtime.profileId;
    }

    if (runtime.fallbackLoginResult) {
      await this.syncPlatformExtensionLogin({
        sessionToken,
        authType: runtime.fallbackLoginResult.authType,
        authPayload: runtime.fallbackLoginResult.authPayload,
        accountName: runtime.fallbackLoginResult.accountName || undefined,
        externalAccountId: runtime.fallbackLoginResult.externalAccountId || undefined,
        displayName: runtime.fallbackLoginResult.displayName || undefined,
        avatarUrl: runtime.fallbackLoginResult.avatarUrl || undefined,
        followerCount: runtime.fallbackLoginResult.followerCount ?? undefined,
        sourceUrl: runtime.fallbackLoginResult.sourceUrl || undefined,
        runtimeSessionId: runtime.runtimeSessionId,
      });
    }

    return {
      sessionId,
      sessionToken,
      platform,
      accountId,
      externalGroupId,
      expiresAt: new Date(expiresAt).toISOString(),
      loginUrl: runtime.loginUrl,
      runtimeSessionId: runtime.runtimeSessionId,
      profileId: runtime.profileId,
      ownerId: runtime.ownerId,
      bridgeBaseUrl: runtime.bridgeBaseUrl,
    };
  }

  // #region debug-point A:report-debug-event
  private reportDebugEvent(
    hypothesisId: string,
    runId: string,
    location: string,
    data: Record<string, unknown>,
  ) {
    const payload = {
      sessionId: 'douyin-login-no-reaction',
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
  }
  // #endregion

  async startMcpPlatformLogin(_user: SessionUser, dto: StartMcpPlatformLoginDto) {
    const platform = dto.platform as LeadPublishPlatform;

    throw new GoneException(
      `平台 ${platform} 的 MCP 登录已移除，请使用浏览器插件或官方 OAuth 登录`,
    );
  }

  async startOfficialOauthLogin(user: SessionUser, dto: StartOfficialOauthLoginDto) {
    const platform = dto.platform as LeadPublishPlatform;
    if (!this.isOfficialOauthPlatformSupported(platform)) {
      throw new ConflictException('当前平台暂未开放官方 OAuth 登录');
    }

    const accountId = dto.accountId?.trim() || null;
    if (accountId) {
      const current = await this.findAccessiblePlatformAccount(user, accountId);
      if (current.platform !== platform) {
        throw new ConflictException('平台与所选账号不匹配');
      }
    }

    this.getOfficialOauthClientConfig(platform);

    const state = await this.jwtService.signAsync(
      {
        purpose: OFFICIAL_OAUTH_STATE_PURPOSE,
        uid: user.userId,
        platform,
        aid: accountId,
      } satisfies OfficialOauthStatePayload,
      {
        expiresIn: '10m',
      },
    );

    return {
      provider: 'official_oauth' as const,
      platform,
      loginUrl: this.buildOfficialOauthAuthorizeUrl(platform, state),
      syncHint: '授权完成后会自动回到系统并保存平台账号。',
    };
  }

  async completeOfficialOauthLogin(input: { platform: string; code: string; state: string }) {
    try {
      const platform = this.parseOfficialOauthPlatform(input.platform);
      if (!input.code?.trim()) {
        throw new BadRequestException('授权回调缺少 code');
      }
      if (!input.state?.trim()) {
        throw new BadRequestException('授权回调缺少 state');
      }

      const statePayload = await this.verifyOfficialOauthState(input.state.trim());
      if (statePayload.platform !== platform) {
        throw new BadRequestException('授权回调平台不匹配');
      }

      const tokenResult = await this.exchangeOfficialOauthToken(platform, input.code.trim());
      const accountName =
        tokenResult.accountName ||
        tokenResult.externalAccountId ||
        `oauth_${platform}_${new Date().getTime().toString(36)}`;
      const authPayload = JSON.stringify(tokenResult.authPayload);
      const existing = statePayload.aid
        ? await this.prisma.leadPlatformAccount.findFirst({
            where: {
              id: statePayload.aid,
              creatorId: statePayload.uid,
            },
            include: leadPlatformAccountInclude,
          })
        : tokenResult.externalAccountId
          ? await this.prisma.leadPlatformAccount.findFirst({
              where: {
                creatorId: statePayload.uid,
                platform,
                provider: PlatformAccountProvider.official_oauth,
                externalAccountId: tokenResult.externalAccountId,
              },
              include: leadPlatformAccountInclude,
            })
          : null;

      const saved = existing
        ? await this.prisma.leadPlatformAccount.update({
            where: { id: existing.id },
            data: {
              provider: PlatformAccountProvider.official_oauth,
              authType: PlatformAccountAuthType.token,
              accountName,
              displayName: tokenResult.displayName,
              authPayloadEncrypted: this.encryptAuthPayload(authPayload),
              authPayloadPreview: this.maskAuthPayload(tokenResult.authPayload.accessToken),
              status: PlatformAccountStatus.valid,
              loginStatus: PlatformAccountLoginStatus.authenticated,
              loginUrl: this.buildOfficialOauthAuthorizeUrl(platform, input.state.trim()),
              externalAccountId: tokenResult.externalAccountId,
              externalMeta: tokenResult.externalMeta as Prisma.InputJsonValue,
              lastLoginCompletedAt: new Date(),
              lastValidatedAt: new Date(),
              lastError: null,
            },
            include: leadPlatformAccountInclude,
          })
        : await this.prisma.leadPlatformAccount.create({
            data: {
              creatorId: statePayload.uid,
              platform,
              provider: PlatformAccountProvider.official_oauth,
              authType: PlatformAccountAuthType.token,
              accountName,
              displayName: tokenResult.displayName,
              authPayloadEncrypted: this.encryptAuthPayload(authPayload),
              authPayloadPreview: this.maskAuthPayload(tokenResult.authPayload.accessToken),
              status: PlatformAccountStatus.valid,
              loginStatus: PlatformAccountLoginStatus.authenticated,
              loginUrl: this.buildOfficialOauthAuthorizeUrl(platform, input.state.trim()),
              externalAccountId: tokenResult.externalAccountId,
              externalMeta: tokenResult.externalMeta as Prisma.InputJsonValue,
              lastLoginCompletedAt: new Date(),
              lastValidatedAt: new Date(),
            },
            include: leadPlatformAccountInclude,
          });

      return this.buildOfficialOauthResultRedirectUrl({
        platform,
        status: 'success',
        accountId: saved.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '官方授权登录失败';
      return this.buildOfficialOauthResultRedirectUrl({
        platform: this.parseOfficialOauthPlatform(input.platform, false),
        status: 'failed',
        error: message,
      });
    }
  }

  async syncPlatformExtensionLogin(dto: SyncPlatformExtensionLoginDto) {
    this.cleanupExpiredExtensionLoginSessions();

    const tokenPayload = await this.verifyExtensionLoginToken(dto.sessionToken);
    const session = this.extensionLoginSessions.get(tokenPayload.sid);

    if (!session || session.userId !== tokenPayload.uid || session.platform !== tokenPayload.platform) {
      throw new UnauthorizedException('扩展登录会话不存在或已失效');
    }

    if (session.expiresAt <= Date.now()) {
      this.extensionLoginSessions.delete(session.sessionId);
      throw new UnauthorizedException('扩展登录会话已过期');
    }

    const runtimeSessionId = dto.runtimeSessionId?.trim() || session.runtimeSessionId;

    try {
      const authPayload = dto.authPayload.trim();
      const cookiePayload = this.normalizeExtensionCookiePayload(dto.cookiePayload);
      if (!authPayload) {
        throw new ConflictException('Cookie / Token 不能为空');
      }

      const validation = this.validateAuthPayload(dto.authType as PlatformAccountAuthType, authPayload);
      if (validation.status !== PlatformAccountStatus.valid) {
        throw new ConflictException(validation.lastError ?? '登录信息校验未通过');
      }

      const requestedAccountName = this.sanitizeExtensionResolvedAccountText(
        session.platform,
        dto.accountName?.trim() || '',
      );
      const externalAccountId = this.sanitizeExtensionResolvedAccountText(
        session.platform,
        dto.externalAccountId?.trim() || null,
      );
      const displayName = this.sanitizeExtensionResolvedAccountText(
        session.platform,
        dto.displayName?.trim() || null,
      );
      const remark = dto.remark?.trim() || null;
      const avatarUrl = dto.avatarUrl?.trim() || null;
      const followerCount =
        typeof dto.followerCount === 'number' && Number.isFinite(dto.followerCount)
          ? Math.max(0, Math.round(dto.followerCount))
          : null;
      const weakRequestedAccountName = this.isWeakExtensionIdentityValue(requestedAccountName);
      const weakDisplayName = this.isWeakExtensionIdentityValue(displayName);

      let fallbackProfile:
        | {
            accountName: string | null;
            externalAccountId: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            followerCount: number | null;
            sourceUrl: string | null;
          }
        | null = null;
      if (
        runtimeSessionId &&
        session.platform !== LeadPublishPlatform.douyin &&
        (
          weakRequestedAccountName ||
          !externalAccountId ||
          weakDisplayName ||
          !avatarUrl ||
          followerCount === null
        )
      ) {
        const collected = await this.publishingBitBrowserService.collectLoginProfileFallback({
          runtimeSessionId,
          platform: session.platform,
        });
        if (collected) {
          fallbackProfile = {
            accountName: this.sanitizeExtensionResolvedAccountText(
              session.platform,
              collected.accountName || '',
            ),
            externalAccountId: this.sanitizeExtensionResolvedAccountText(
              session.platform,
              collected.externalAccountId || null,
            ),
            displayName: this.sanitizeExtensionResolvedAccountText(
              session.platform,
              collected.displayName || null,
            ),
            avatarUrl: collected.avatarUrl || null,
            followerCount:
              typeof collected.followerCount === 'number' && Number.isFinite(collected.followerCount)
                ? Math.max(0, Math.round(collected.followerCount))
                : null,
            sourceUrl: collected.sourceUrl || null,
          };
        }
      }

      const finalAccountName =
        (weakRequestedAccountName ? fallbackProfile?.accountName : requestedAccountName) ||
        requestedAccountName ||
        fallbackProfile?.accountName ||
        '';
      const finalExternalAccountId = externalAccountId || fallbackProfile?.externalAccountId || null;
      const finalDisplayName =
        (weakDisplayName ? fallbackProfile?.displayName : displayName) ||
        displayName ||
        fallbackProfile?.displayName ||
        null;
      const finalAvatarUrl = avatarUrl || fallbackProfile?.avatarUrl || null;
      const finalFollowerCount =
        followerCount !== null ? followerCount : fallbackProfile?.followerCount ?? null;
      const finalSourceUrl = dto.sourceUrl?.trim() || fallbackProfile?.sourceUrl || null;
      // #region debug-point C:video-login-resolved
      void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"C",location:"server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:resolved",msg:"[DEBUG] sync extension login resolved identity",data:{platform:session.platform,sessionId:session.sessionId,accountId:session.accountId,requestedAccountName,externalAccountId,displayName,weakRequestedAccountName,weakDisplayName,fallbackAccountName:fallbackProfile?.accountName||null,fallbackExternalAccountId:fallbackProfile?.externalAccountId||null,fallbackDisplayName:fallbackProfile?.displayName||null,finalAccountName,finalExternalAccountId,finalDisplayName,finalAvatarUrl,finalFollowerCount,finalSourceUrl},ts:Date.now()})}).catch(()=>undefined);
      // #endregion
      // #region debug-point B3:cookie-profile-input
      void fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'bitbrowser-cookie-persist',
          runId: 'post-fix',
          hypothesisId: 'A',
          location: 'server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:cookie-profile-input',
          msg: '[DEBUG] extension login persistence input',
          data: {
            sessionId: session.sessionId,
            platform: session.platform,
            runtimeSessionId,
            profileId: session.profileId ?? null,
            authPayloadLength: authPayload.length,
            cookiePayloadLength: cookiePayload ? cookiePayload.length : 0,
            finalAccountName,
            finalExternalAccountId,
            finalDisplayName,
            finalSourceUrl,
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
      // #endregion
      // #region debug-point P4:extension-login-input
      void fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'douyin-profile-detect',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:input',
          msg: '[DEBUG] syncPlatformExtensionLogin input',
          data: {
            sessionId: session.sessionId,
            platform: session.platform,
            runtimeSessionId,
            dtoAccountName: dto.accountName?.trim() || '',
            dtoExternalAccountId: dto.externalAccountId?.trim() || '',
            dtoDisplayName: dto.displayName?.trim() || '',
            dtoAvatarUrl: dto.avatarUrl?.trim() || '',
            dtoFollowerCount:
              typeof dto.followerCount === 'number' && Number.isFinite(dto.followerCount)
                ? dto.followerCount
                : null,
            requestedAccountName,
            externalAccountId,
            displayName,
            finalAccountName,
            finalExternalAccountId,
            finalDisplayName,
            finalAvatarUrl,
            finalFollowerCount,
            finalSourceUrl,
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
      // #endregion
      const resolvedAccountName = this.resolveExtensionAccountName({
        platform: session.platform,
        authPayload,
        accountName: finalAccountName,
        externalAccountId: finalExternalAccountId,
        displayName: finalDisplayName,
      });
      const hasResolvedIdentity = Boolean(
        finalAccountName || finalExternalAccountId || finalDisplayName,
      );
      // #region debug-point P5:extension-login-resolved-name
      void fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'douyin-profile-detect',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:resolved-name',
          msg: '[DEBUG] syncPlatformExtensionLogin resolved name',
          data: {
            sessionId: session.sessionId,
            platform: session.platform,
            resolvedAccountName,
            hasResolvedIdentity,
            finalAccountName,
            finalExternalAccountId,
            finalDisplayName,
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
      // #endregion

      let saved: LeadPlatformAccountWithRelations;
      const current = session.accountId
        ? await this.prisma.leadPlatformAccount.findFirst({
            where: {
              id: session.accountId,
              creatorId: session.userId,
            },
            include: leadPlatformAccountInclude,
          })
        : finalExternalAccountId
          ? await this.prisma.leadPlatformAccount.findFirst({
              where: {
                creatorId: session.userId,
                platform: session.platform,
                provider: PlatformAccountProvider.extension,
                externalAccountId: finalExternalAccountId,
              },
              include: leadPlatformAccountInclude,
            })
          : null;

      if (current) {
        saved = await this.prisma.leadPlatformAccount.update({
          where: { id: current.id },
          data: {
            provider: PlatformAccountProvider.extension,
            authType: dto.authType as PlatformAccountAuthType,
            accountName: resolvedAccountName || current.accountName,
            displayName: finalDisplayName,
            authPayloadEncrypted: this.encryptAuthPayload(authPayload),
            authPayloadPreview: this.maskAuthPayload(authPayload),
            loginUrl: this.platformLoginBrowserService.getPlatformLoginUrl(session.platform),
            status: PlatformAccountStatus.valid,
            loginStatus: PlatformAccountLoginStatus.authenticated,
            externalAccountId: finalExternalAccountId,
            externalGroupId: session.externalGroupId,
            lastLoginCompletedAt: new Date(),
            lastValidatedAt: new Date(),
            lastError: null,
            externalMeta: {
              ...(current.externalMeta && typeof current.externalMeta === 'object'
                ? (current.externalMeta as Record<string, unknown>)
                : {}),
              ...(session.profileId ? { profileId: session.profileId } : {}),
              ...(finalAvatarUrl ? { avatarUrl: finalAvatarUrl } : {}),
              ...(finalFollowerCount !== null ? { followerCount: finalFollowerCount } : {}),
              ...(cookiePayload ? { cookiePayload } : {}),
            } as Prisma.InputJsonValue,
            ...(remark !== null ? { remark } : {}),
          },
          include: leadPlatformAccountInclude,
        });
      } else {
        try {
          saved = await this.prisma.leadPlatformAccount.create({
            data: {
              creatorId: session.userId,
              platform: session.platform,
              authType: dto.authType as PlatformAccountAuthType,
              accountName: resolvedAccountName,
              displayName: finalDisplayName,
              authPayloadEncrypted: this.encryptAuthPayload(authPayload),
              authPayloadPreview: this.maskAuthPayload(authPayload),
              loginUrl: this.platformLoginBrowserService.getPlatformLoginUrl(session.platform),
              status: PlatformAccountStatus.valid,
              loginStatus: PlatformAccountLoginStatus.authenticated,
              externalAccountId: finalExternalAccountId,
              externalGroupId: session.externalGroupId,
              lastLoginCompletedAt: new Date(),
              lastValidatedAt: new Date(),
              lastError: null,
              remark,
              externalMeta: {
                ...(session.profileId ? { profileId: session.profileId } : {}),
                ...(finalAvatarUrl ? { avatarUrl: finalAvatarUrl } : {}),
                ...(finalFollowerCount !== null ? { followerCount: finalFollowerCount } : {}),
                ...(cookiePayload ? { cookiePayload } : {}),
              } as Prisma.InputJsonValue,
            },
            include: leadPlatformAccountInclude,
          });
        } catch (error) {
          this.handlePlatformAccountWriteError(error);
        }
      }

      // #region debug-point C:video-login-saved
      void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"C",location:"server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:saved",msg:"[DEBUG] sync extension login saved account",data:{platform:session.platform,savedAccountId:saved.id,accountName:saved.accountName,displayName:saved.displayName,externalAccountId:saved.externalAccountId||null,externalGroupId:saved.externalGroupId||null,loginStatus:saved.loginStatus,status:saved.status},ts:Date.now()})}).catch(()=>undefined);
      // #endregion
      session.accountId = saved.id;
      session.syncedAccountId = saved.id;
      await this.publishingBitBrowserService
        .persistDedicatedProfileCookie({
          profileId: session.profileId || this.extractExternalProfileId(saved.externalMeta),
          runtimeSessionId,
          authPayload,
          cookiePayload,
          source: 'sync-platform-extension-login',
        })
        .catch(() => undefined);
      // #region debug-point B4:cookie-profile-saved
      void fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'bitbrowser-cookie-persist',
          runId: 'post-fix',
          hypothesisId: 'A',
          location: 'server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:cookie-profile-saved',
          msg: '[DEBUG] extension login persistence saved',
          data: {
            sessionId: session.sessionId,
            platform: session.platform,
            accountId: saved.id,
            accountName: saved.accountName,
            profileId:
              saved.externalMeta &&
              typeof saved.externalMeta === 'object' &&
              !Array.isArray(saved.externalMeta)
                ? String((saved.externalMeta as Record<string, unknown>).profileId || '')
                : '',
            hasCookiePayload:
              Boolean(
                saved.externalMeta &&
                  typeof saved.externalMeta === 'object' &&
                  !Array.isArray(saved.externalMeta) &&
                  String((saved.externalMeta as Record<string, unknown>).cookiePayload || '').trim(),
              ),
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
      // #endregion
      // #region debug-point P6:extension-login-saved
      void fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'douyin-profile-detect',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'server/src/modules/publishing/publishing.service.ts:syncPlatformExtensionLogin:saved',
          msg: '[DEBUG] syncPlatformExtensionLogin saved account',
          data: {
            sessionId: session.sessionId,
            platform: session.platform,
            accountId: saved.id,
            accountName: saved.accountName,
            displayName: saved.displayName,
            externalAccountId: saved.externalAccountId,
            avatarUrl:
              saved.externalMeta &&
              typeof saved.externalMeta === 'object' &&
              !Array.isArray(saved.externalMeta)
                ? String((saved.externalMeta as Record<string, unknown>).avatarUrl || '')
                : '',
            followerCount:
              saved.externalMeta &&
              typeof saved.externalMeta === 'object' &&
              !Array.isArray(saved.externalMeta) &&
              typeof (saved.externalMeta as Record<string, unknown>).followerCount === 'number'
                ? (saved.externalMeta as Record<string, unknown>).followerCount
                : null,
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
      // #endregion
      if (!hasResolvedIdentity) {
        // #region debug-point H2:partial-sync-return
        this.reportDebugEvent('H2', 'pre-fix', 'publishing.service:syncPlatformExtensionLogin:partial-sync-return', {
          sessionId: session.sessionId,
          platform: session.platform,
          runtimeSessionId,
          accountId: saved.id,
          accountName: saved.accountName,
          sourceUrl: finalSourceUrl,
        });
        // #endregion
        return {
          sessionId: session.sessionId,
          account: this.serializePlatformAccount(saved),
          sourceUrl: finalSourceUrl,
        };
      }

      session.status = 'completed';
      session.runtimeSessionId = null;
      // #region debug-point H1:rename-dispatch
      this.reportDebugEvent('H1', 'pre-fix', 'publishing.service:syncPlatformExtensionLogin:before-rename', {
        sessionId: session.sessionId,
        platform: session.platform,
        accountId: saved.id,
        accountName: saved.accountName,
        externalGroupId: session.externalGroupId,
        profileId: session.profileId,
      });
      // #endregion
      await this.publishingBitBrowserService
        .renameDedicatedProfile({
          creatorId: session.userId,
          externalGroupId: session.externalGroupId,
          platform: session.platform,
          platformAccountId: saved.id,
          accountName: saved.displayName || saved.accountName,
          profileId: session.profileId,
        })
        .then(() => {
          // #region debug-point H1:rename-dispatch-result
          this.reportDebugEvent(
            'H1',
            'pre-fix',
            'publishing.service:syncPlatformExtensionLogin:rename-dispatched',
            {
              sessionId: session.sessionId,
              platform: session.platform,
              accountId: saved.id,
              profileId: session.profileId,
            },
          );
          // #endregion
        })
        .catch((error) => {
          // #region debug-point H1:rename-dispatch-error
          this.reportDebugEvent(
            'H1',
            'pre-fix',
            'publishing.service:syncPlatformExtensionLogin:rename-dispatch-error',
            {
              sessionId: session.sessionId,
              platform: session.platform,
              accountId: saved.id,
              profileId: session.profileId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          // #endregion
          return undefined;
        });
      await this.publishingBitBrowserService.closeRuntimeSession(runtimeSessionId, 'completed');

      return {
        sessionId: session.sessionId,
        account: this.serializePlatformAccount(saved),
        sourceUrl: finalSourceUrl,
      };
    } catch (error) {
      // #region debug-point H5:sync-platform-login-error
      this.reportDebugEvent('H5', 'pre-fix', 'publishing.service:syncPlatformExtensionLogin:error', {
        sessionId: session.sessionId,
        platform: session.platform,
        runtimeSessionId,
        error: error instanceof Error ? error.message : String(error),
        sourceUrl: dto.sourceUrl?.trim() || null,
      });
      // #endregion
      await this.publishingBitBrowserService.closeRuntimeSession(runtimeSessionId, 'failed');
      throw error;
    }
  }

  async updatePlatformAccount(user: SessionUser, id: string, dto: UpdatePlatformAccountDto) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    const nextAuthPayload = dto.authPayload?.trim();
    const authPayloadChanged = typeof nextAuthPayload === 'string';

    try {
      const updated = await this.prisma.leadPlatformAccount.update({
        where: { id: current.id },
        data: {
          ...(dto.authType ? { authType: dto.authType as PlatformAccountAuthType } : {}),
          ...(dto.accountName !== undefined ? { accountName: dto.accountName.trim() } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() || null } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark.trim() || null } : {}),
          ...(dto.externalGroupId !== undefined
            ? { externalGroupId: dto.externalGroupId.trim() || null }
            : {}),
          ...(dto.status ? { status: dto.status as PlatformAccountStatus } : {}),
          ...(authPayloadChanged
            ? {
                authPayloadEncrypted: this.encryptAuthPayload(nextAuthPayload ?? ''),
                authPayloadPreview: this.maskAuthPayload(nextAuthPayload ?? ''),
                status: PlatformAccountStatus.saved,
                lastValidatedAt: null,
                lastError: null,
              }
            : {}),
        },
        include: leadPlatformAccountInclude,
      });

      return this.serializePlatformAccount(updated);
    } catch (error) {
      this.handlePlatformAccountWriteError(error);
    }
  }

  async deletePlatformAccount(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    const profileId = this.extractExternalProfileId(current.externalMeta);
    try {
      // #region debug-point H1:delete-account
      this.reportDebugEvent('H1', 'pre-fix', 'publishing.service:deletePlatformAccount:before-release-profile', {
        accountId: current.id,
        platform: current.platform,
        externalGroupId: current.externalGroupId,
        profileId,
      });
      // #endregion
      await this.publishingBitBrowserService.releaseDedicatedProfile(
        user.userId,
        current.externalGroupId,
        profileId,
      );
      // #region debug-point H1:delete-account-result
      this.reportDebugEvent('H1', 'pre-fix', 'publishing.service:deletePlatformAccount:after-release-profile', {
        accountId: current.id,
        platform: current.platform,
        externalGroupId: current.externalGroupId,
        profileId,
      });
      // #endregion
      await this.prisma.leadPlatformAccount.delete({
        where: { id: current.id },
      });
      return { id: current.id };
    } catch (error) {
      this.logger.error(
        `删除平台账号失败: accountId=${current.id}, platform=${current.platform}, externalGroupId=${current.externalGroupId ?? ''}, profileId=${profileId ?? ''}, error=${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async validatePlatformAccount(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    const decryptedPayload = this.decryptAuthPayload(current.authPayloadEncrypted);
    if (current.authType === PlatformAccountAuthType.cookie) {
      const externalGroupId = current.externalGroupId?.trim() || '';
      if (
        current.provider === PlatformAccountProvider.extension &&
        externalGroupId &&
        this.publishingBitBrowserService.isEnabled()
      ) {
        try {
          const snapshot = await this.publishingBitBrowserService.collectPlatformAccountCookieSnapshot({
            creatorId: current.creatorId,
            platform: current.platform,
            accountId: current.id,
            accountName: current.accountName,
            externalGroupId,
          });
          if (snapshot?.authPayload) {
            if (this.isPlatformReauthSourceUrl(current.platform, snapshot.sourceUrl)) {
              const reauthMessage = '命中登录页 / 401 / 请重新登录';
              const updated = await this.prisma.leadPlatformAccount.update({
                where: { id: current.id },
                data: {
                  status: PlatformAccountStatus.invalid,
                  loginStatus: PlatformAccountLoginStatus.failed,
                  lastValidatedAt: new Date(),
                  lastError: reauthMessage,
                  loginUrl: snapshot.sourceUrl || current.loginUrl,
                  externalMeta: {
                    ...this.clearPlatformAccountKeepAliveState(current.externalMeta),
                    keepAliveStatus: 'reauth_required',
                    keepAliveError: reauthMessage,
                    reauthRequired: true,
                  } as Prisma.InputJsonValue,
                },
                include: leadPlatformAccountInclude,
              });
              return this.serializePlatformAccount(updated);
            }
            const validation = this.validateAuthPayload(
              PlatformAccountAuthType.cookie,
              snapshot.authPayload,
            );
            const snapshotAccountName = this.sanitizeExtensionResolvedAccountText(
              current.platform,
              snapshot.accountName,
            );
            const snapshotExternalAccountId = this.sanitizeExtensionResolvedAccountText(
              current.platform,
              snapshot.externalAccountId,
            );
            const snapshotDisplayName = this.sanitizeExtensionResolvedAccountText(
              current.platform,
              snapshot.displayName,
            );
            const nextAccountName =
              snapshotExternalAccountId ||
              snapshotAccountName ||
              snapshotDisplayName ||
              current.accountName;
            const updated = await this.prisma.leadPlatformAccount.update({
              where: { id: current.id },
              data: {
                accountName: nextAccountName,
                displayName: snapshotDisplayName ?? current.displayName,
                authType: PlatformAccountAuthType.cookie,
                authPayloadEncrypted: this.encryptAuthPayload(snapshot.authPayload),
                authPayloadPreview: this.maskAuthPayload(snapshot.authPayload),
                status: validation.status,
                loginStatus:
                  validation.status === PlatformAccountStatus.valid
                    ? PlatformAccountLoginStatus.authenticated
                    : PlatformAccountLoginStatus.failed,
                lastValidatedAt: new Date(),
                lastLoginCompletedAt:
                  validation.status === PlatformAccountStatus.valid
                    ? new Date()
                    : current.lastLoginCompletedAt,
                lastError: validation.lastError,
                loginUrl: snapshot.sourceUrl || current.loginUrl,
                externalAccountId: snapshotExternalAccountId ?? current.externalAccountId,
                externalMeta: {
                  ...this.clearPlatformAccountKeepAliveState(current.externalMeta),
                  ...(snapshot.avatarUrl ? { avatarUrl: snapshot.avatarUrl } : {}),
                  ...(typeof snapshot.followerCount === 'number' &&
                  Number.isFinite(snapshot.followerCount)
                    ? { followerCount: Math.max(0, Math.round(snapshot.followerCount)) }
                    : {}),
                } as Prisma.InputJsonValue,
              },
              include: leadPlatformAccountInclude,
            });
            return this.serializePlatformAccount(updated);
          }
        } catch (error) {
          this.logger.warn(
            `BitBrowser 平台账号校验回退到旧链路: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      try {
        const result = await this.platformLoginBrowserService.collectLoginResult({
          accountId: current.id,
          sessionPath:
            current.browserSessionPath || this.platformLoginBrowserService.getSessionPath(current.id),
          platform: current.platform,
          authPayload: decryptedPayload,
          loginUrl: current.loginUrl,
          fallbackAccountName: current.accountName,
        });

        const updated = await this.prisma.leadPlatformAccount.update({
          where: { id: current.id },
          data: {
            accountName: result.accountName || current.accountName,
            displayName: result.displayName,
            authType: PlatformAccountAuthType.cookie,
            authPayloadEncrypted: this.encryptAuthPayload(result.authPayload),
            authPayloadPreview: this.maskAuthPayload(result.authPayload),
            status: PlatformAccountStatus.valid,
            loginStatus: PlatformAccountLoginStatus.authenticated,
            lastValidatedAt: new Date(),
            lastLoginCompletedAt: new Date(),
            lastError: null,
            externalMeta: {
              ...this.clearPlatformAccountKeepAliveState(current.externalMeta),
              ...(result.avatarUrl ? { avatarUrl: result.avatarUrl } : {}),
              ...(result.followerCount !== null ? { followerCount: result.followerCount } : {}),
            } as Prisma.InputJsonValue,
          },
          include: leadPlatformAccountInclude,
        });

        return this.serializePlatformAccount(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : '平台登录状态校验失败';
        const updated = await this.prisma.leadPlatformAccount.update({
          where: { id: current.id },
          data: {
            status: PlatformAccountStatus.invalid,
            loginStatus:
              current.loginStatus === PlatformAccountLoginStatus.pending
                ? PlatformAccountLoginStatus.pending
                : PlatformAccountLoginStatus.failed,
            lastValidatedAt: new Date(),
            lastError: message,
          },
          include: leadPlatformAccountInclude,
        });

        return this.serializePlatformAccount(updated);
      }
    }

    const validation = this.validateAuthPayload(current.authType, decryptedPayload);
    const nextLoginStatus =
      validation.status === PlatformAccountStatus.valid
        ? PlatformAccountLoginStatus.authenticated
        : current.loginStatus === PlatformAccountLoginStatus.pending
          ? PlatformAccountLoginStatus.pending
          : PlatformAccountLoginStatus.failed;

    const updated = await this.prisma.leadPlatformAccount.update({
      where: { id: current.id },
      data: {
        status: validation.status,
        loginStatus: nextLoginStatus,
        lastValidatedAt: new Date(),
        lastError: validation.lastError,
      },
      include: leadPlatformAccountInclude,
    });

    return this.serializePlatformAccount(updated);
  }

  private async runKeepAliveForPlatformAccounts(input: {
    creatorId: string | null;
    trigger: 'manual' | 'schedule';
  }) {
    const accounts = await this.prisma.leadPlatformAccount.findMany({
      where: {
        ...(input.creatorId ? { creatorId: input.creatorId } : {}),
        provider: PlatformAccountProvider.extension,
        loginStatus: PlatformAccountLoginStatus.authenticated,
        status: { not: PlatformAccountStatus.disabled },
        platform: { in: Array.from(BITBROWSER_KEEPALIVE_PLATFORMS) },
        externalGroupId: { not: null },
      },
      orderBy: [{ updatedAt: 'asc' }],
      include: leadPlatformAccountInclude,
    });

    const result = {
      trigger: input.trigger,
      total: accounts.length,
      succeeded: 0,
      reauthRequired: 0,
      collectFailed: 0,
      skipped: 0,
      items: [] as Array<{
        id: string;
        platform: LeadPublishPlatform;
        accountName: string;
        status: 'success' | 'reauth_required' | 'collect_failed' | 'skipped';
        message: string;
      }>,
    };

    for (const account of accounts) {
      const externalGroupId = account.externalGroupId?.trim() || '';
      const authPayload = this.decryptAuthPayload(account.authPayloadEncrypted).trim();
      const cookiePayload = this.getExtensionAccountCookiePayload(account);

      if (!externalGroupId) {
        result.skipped += 1;
        result.items.push({
          id: account.id,
          platform: account.platform,
          accountName: account.accountName,
          status: 'skipped',
          message: '缺少 externalGroupId',
        });
        continue;
      }

      if (!authPayload && !cookiePayload) {
        result.skipped += 1;
        result.items.push({
          id: account.id,
          platform: account.platform,
          accountName: account.accountName,
          status: 'skipped',
          message: '缺少可用 Cookie',
        });
        continue;
      }

      try {
        const snapshot = await this.publishingBitBrowserService.keepAliveDedicatedProfile({
          creatorId: account.creatorId,
          platform: account.platform,
          accountId: account.id,
          accountName: account.accountName,
          externalGroupId,
          authPayload,
          cookiePayload,
        });

        if (!snapshot) {
          throw new ConflictException('保活执行失败');
        }
        if (snapshot.keepAliveStatus === 'reauth_required') {
          await this.prisma.leadPlatformAccount.update({
            where: { id: account.id },
            data: {
              status: PlatformAccountStatus.invalid,
              loginStatus: PlatformAccountLoginStatus.failed,
              lastValidatedAt: new Date(),
              lastError: snapshot.keepAliveMessage.slice(0, 500),
              externalMeta: {
                ...(account.externalMeta &&
                typeof account.externalMeta === 'object' &&
                !Array.isArray(account.externalMeta)
                  ? (account.externalMeta as Record<string, unknown>)
                  : {}),
                keepAliveAt: new Date().toISOString(),
                keepAliveTrigger: input.trigger,
                keepAliveStatus: 'reauth_required',
                keepAliveError: snapshot.keepAliveMessage,
                reauthRequired: true,
              } as Prisma.InputJsonValue,
            },
          });
          result.reauthRequired += 1;
          result.items.push({
            id: account.id,
            platform: account.platform,
            accountName: account.accountName,
            status: 'reauth_required',
            message: snapshot.keepAliveMessage,
          });
          continue;
        }
        if (
          snapshot.keepAliveStatus === 'collect_failed' ||
          (!snapshot.authPayload?.trim() && !snapshot.cookiePayload?.trim())
        ) {
          await this.prisma.leadPlatformAccount.update({
            where: { id: account.id },
            data: {
              lastValidatedAt: new Date(),
              lastError: `保活采集失败: ${snapshot.keepAliveMessage}`.slice(0, 500),
              externalMeta: {
                ...(account.externalMeta &&
                typeof account.externalMeta === 'object' &&
                !Array.isArray(account.externalMeta)
                  ? (account.externalMeta as Record<string, unknown>)
                  : {}),
                keepAliveAt: new Date().toISOString(),
                keepAliveTrigger: input.trigger,
                keepAliveStatus: 'collect_failed',
                keepAliveError: snapshot.keepAliveMessage,
                reauthRequired: false,
              } as Prisma.InputJsonValue,
            },
          });
          result.collectFailed += 1;
          result.items.push({
            id: account.id,
            platform: account.platform,
            accountName: account.accountName,
            status: 'collect_failed',
            message: snapshot.keepAliveMessage,
          });
          continue;
        }

        const normalizedCookiePayload =
          this.normalizeExtensionCookiePayload(snapshot.cookiePayload ?? undefined) ?? cookiePayload;
        const nextAccountName =
          this.sanitizeExtensionResolvedAccountText(
            account.platform,
            this.resolveExtensionAccountName({
              platform: account.platform,
              authPayload: snapshot.authPayload,
              accountName: snapshot.accountName,
              externalAccountId: snapshot.externalAccountId,
              displayName: snapshot.displayName,
            }),
          ) || account.accountName;
        const nextDisplayName =
          this.sanitizeExtensionResolvedAccountText(account.platform, snapshot.displayName) ||
          account.displayName;
        const nextExternalAccountId =
          this.sanitizeExtensionResolvedAccountText(account.platform, snapshot.externalAccountId) ||
          account.externalAccountId;

        const updated = await this.prisma.leadPlatformAccount.update({
          where: { id: account.id },
          data: {
            accountName: nextAccountName,
            displayName: nextDisplayName,
            authType: PlatformAccountAuthType.cookie,
            authPayloadEncrypted: this.encryptAuthPayload(snapshot.authPayload),
            authPayloadPreview: this.maskAuthPayload(snapshot.authPayload),
            externalAccountId: nextExternalAccountId,
            status: PlatformAccountStatus.valid,
            loginStatus: PlatformAccountLoginStatus.authenticated,
            lastValidatedAt: new Date(),
            lastError: null,
            externalMeta: {
              ...(account.externalMeta &&
              typeof account.externalMeta === 'object' &&
              !Array.isArray(account.externalMeta)
                ? (account.externalMeta as Record<string, unknown>)
                : {}),
              ...(snapshot.profileId ? { profileId: snapshot.profileId } : {}),
              ...(snapshot.sourceUrl ? { sourceUrl: snapshot.sourceUrl } : {}),
              ...(snapshot.avatarUrl ? { avatarUrl: snapshot.avatarUrl } : {}),
              ...(snapshot.followerCount !== null ? { followerCount: snapshot.followerCount } : {}),
              ...(normalizedCookiePayload ? { cookiePayload: normalizedCookiePayload } : {}),
              keepAliveAt: new Date().toISOString(),
              keepAliveTrigger: input.trigger,
              keepAliveStatus: 'success',
              keepAliveError: null,
              reauthRequired: false,
            } as Prisma.InputJsonValue,
          },
          include: leadPlatformAccountInclude,
        });

        await this.publishingBitBrowserService
          .persistDedicatedProfileCookie({
            profileId: this.extractExternalProfileId(updated.externalMeta),
            authPayload: snapshot.authPayload,
            cookiePayload: normalizedCookiePayload,
            source: `keepalive-${input.trigger}`,
          })
          .catch(() => undefined);

        result.succeeded += 1;
        result.items.push({
          id: account.id,
          platform: account.platform,
          accountName: updated.accountName,
          status: 'success',
          message: snapshot.keepAliveMessage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldInvalidate =
          message.includes('命中登录页') ||
          message.includes('401') ||
          message.includes('请重新登录');
        await this.prisma.leadPlatformAccount.update({
          where: { id: account.id },
          data: {
            ...(shouldInvalidate
              ? {
                  status: PlatformAccountStatus.invalid,
                  loginStatus: PlatformAccountLoginStatus.failed,
                }
              : {}),
            lastValidatedAt: new Date(),
            lastError: `保活失败: ${message}`.slice(0, 500),
            externalMeta: {
              ...(account.externalMeta &&
              typeof account.externalMeta === 'object' &&
              !Array.isArray(account.externalMeta)
                ? (account.externalMeta as Record<string, unknown>)
                : {}),
              keepAliveAt: new Date().toISOString(),
              keepAliveTrigger: input.trigger,
              keepAliveStatus: shouldInvalidate ? 'reauth_required' : 'collect_failed',
              keepAliveError: message,
              reauthRequired: shouldInvalidate,
            } as Prisma.InputJsonValue,
          },
        });
        if (shouldInvalidate) {
          result.reauthRequired += 1;
        } else {
          result.collectFailed += 1;
        }
        result.items.push({
          id: account.id,
          platform: account.platform,
          accountName: account.accountName,
          status: shouldInvalidate ? 'reauth_required' : 'collect_failed',
          message,
        });
      }
    }

    // #region debug-point D:video-keepalive-result
    void fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"video-login-500",runId:"pre-fix",hypothesisId:"D",location:"server/src/modules/publishing/publishing.service.ts:runKeepAliveForPlatformAccounts:result",msg:"[DEBUG] keepalive aggregated result",data:{trigger:input.trigger,total:result.total,succeeded:result.succeeded,reauthRequired:result.reauthRequired,collectFailed:result.collectFailed,skipped:result.skipped,items:result.items.slice(0,10)},ts:Date.now()})}).catch(()=>undefined);
    // #endregion
    return result;
  }

  async restartPlatformLogin(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    return this.launchHostedLoginForAccount(current, true);
  }

  async completePlatformLogin(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    const updated = await this.finalizePlatformLogin(current);
    return this.serializePlatformAccount(updated);
  }

  async cancelPlatformLogin(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    await this.platformLoginBrowserService.closeSession(current.id);

    if (this.isPendingPlaceholderAccount(current)) {
      await this.prisma.leadPlatformAccount.delete({
        where: { id: current.id },
      });
      return { id: current.id, deleted: true };
    }

    const updated = await this.prisma.leadPlatformAccount.update({
      where: { id: current.id },
      data: {
        loginStatus: PlatformAccountLoginStatus.cancelled,
        lastError: null,
      },
      include: leadPlatformAccountInclude,
    });

    return this.serializePlatformAccount(updated);
  }

  private async findAccessibleLeadContent(user: SessionUser, id: string) {
    const item = await this.prisma.leadContent.findUnique({
      where: { id },
      include: leadContentInclude,
    });

    if (!item) {
      throw new NotFoundException('获客内容不存在');
    }

    if (!this.isMainCompany(user) && item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该获客内容');
    }

    return item;
  }

  private async findAccessibleLeadPublishJob(user: SessionUser, id: string) {
    const item = await this.prisma.leadPublishJob.findUnique({
      where: { id },
      include: leadPublishJobInclude,
    });

    if (!item) {
      throw new NotFoundException('发布任务不存在');
    }

    const canAccess =
      this.isMainCompany(user) ||
      item.createdById === user.userId ||
      item.leadContent.creatorId === user.userId;

    if (!canAccess) {
      throw new ForbiddenException('无权访问该发布任务');
    }

    return item;
  }

  private async findAccessiblePlatformAccount(user: SessionUser, id: string) {
    const item = await this.prisma.leadPlatformAccount.findUnique({
      where: { id },
      include: leadPlatformAccountInclude,
    });

    if (!item) {
      throw new NotFoundException('平台登录账号不存在');
    }

    if (!this.isMainCompany(user) && item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该平台登录账号');
    }

    return item;
  }

  private isMainCompany(user: SessionUser) {
    return user.role === MAIN_COMPANY_ROLE_KEY;
  }

  private async launchHostedLoginForAccount(
    account: LeadPlatformAccountWithRelations,
    preserveExistingAuth = false,
  ) {
    const sessionPath =
      account.browserSessionPath || this.platformLoginBrowserService.getSessionPath(account.id);

    const baseData: Prisma.LeadPlatformAccountUpdateInput = {
      authType: PlatformAccountAuthType.cookie,
      browserSessionPath: sessionPath,
      loginStatus: PlatformAccountLoginStatus.pending,
      lastLoginStartedAt: new Date(),
      loginUrl: this.platformLoginBrowserService.getPlatformLoginUrl(account.platform),
      lastError: null,
    };

    const pendingData: Prisma.LeadPlatformAccountUpdateInput = preserveExistingAuth
      ? baseData
      : {
          ...baseData,
          authPayloadEncrypted: this.encryptAuthPayload(PENDING_LOGIN_PLACEHOLDER),
          authPayloadPreview: PENDING_LOGIN_PREVIEW,
          lastValidatedAt: null,
          lastLoginCompletedAt: null,
          status: PlatformAccountStatus.saved,
        };

    const pending = await this.prisma.leadPlatformAccount.update({
      where: { id: account.id },
      data: pendingData,
      include: leadPlatformAccountInclude,
    });

    try {
      const launched = await this.platformLoginBrowserService.launchLoginPage({
        accountId: account.id,
        platform: account.platform,
        sessionPath,
      });

      if (launched.loginUrl !== pending.loginUrl) {
        const refreshed = await this.prisma.leadPlatformAccount.update({
          where: { id: account.id },
          data: { loginUrl: launched.loginUrl },
          include: leadPlatformAccountInclude,
        });
        return this.serializePlatformAccount(refreshed);
      }

      return this.serializePlatformAccount(pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : '发起浏览器登录失败';
      const failed = await this.prisma.leadPlatformAccount.update({
        where: { id: account.id },
        data: {
          loginStatus: PlatformAccountLoginStatus.failed,
          lastError: message,
        },
        include: leadPlatformAccountInclude,
      });

      this.serializePlatformAccount(failed);
      throw new ConflictException(message);
    }
  }

  private async finalizePlatformLogin(account: LeadPlatformAccountWithRelations) {
    const sessionPath =
      account.browserSessionPath || this.platformLoginBrowserService.getSessionPath(account.id);
    const result = await this.platformLoginBrowserService.collectLoginResult({
      accountId: account.id,
      sessionPath,
      platform: account.platform,
      loginUrl: account.loginUrl,
      fallbackAccountName: account.accountName,
    });

    let updated: LeadPlatformAccountWithRelations;
    try {
      updated = await this.prisma.leadPlatformAccount.update({
        where: { id: account.id },
        data: {
          accountName: result.accountName,
          displayName: result.displayName,
          authType: PlatformAccountAuthType.cookie,
          authPayloadEncrypted: this.encryptAuthPayload(result.authPayload),
          authPayloadPreview: this.maskAuthPayload(result.authPayload),
          status: PlatformAccountStatus.valid,
          loginStatus: PlatformAccountLoginStatus.authenticated,
          lastLoginCompletedAt: new Date(),
          lastValidatedAt: new Date(),
          lastError: null,
          externalMeta: {
            ...(account.externalMeta && typeof account.externalMeta === 'object'
              ? (account.externalMeta as Record<string, unknown>)
              : {}),
            ...(result.avatarUrl ? { avatarUrl: result.avatarUrl } : {}),
            ...(result.followerCount !== null ? { followerCount: result.followerCount } : {}),
          } as Prisma.InputJsonValue,
        },
        include: leadPlatformAccountInclude,
      });
    } catch (error) {
      this.handlePlatformAccountWriteError(error);
    }

    return updated;
  }

  private async tryAutoCompletePlatformLogin(account: LeadPlatformAccountWithRelations) {
    try {
      return await this.finalizePlatformLogin(account);
    } catch {
      return account;
    }
  }

  private async executeDraftSave(jobId: string) {
    const current = await this.prisma.leadPublishJob.findUnique({
      where: { id: jobId },
      include: leadPublishJobInclude,
    });

    if (!current) {
      throw new NotFoundException('发布任务不存在');
    }

    if (!current.platformAccountId || !current.platformAccount) {
      throw new ConflictException('该发布任务未绑定平台账号，请重新发起');
    }

    if (
      current.platformAccount.status !== PlatformAccountStatus.valid ||
      current.platformAccount.loginStatus !== PlatformAccountLoginStatus.authenticated
    ) {
      throw new ConflictException('所选平台账号未处于可发布状态');
    }

    if (!this.isAutoPublishPlatformSupported(current.platform)) {
      return this.prisma.leadPublishJob.update({
        where: { id: current.id },
        data: {
          status: LeadPublishStatus.failed,
          lastError: '当前阶段仅支持小红书、抖音、视频号、快手、微信公众号、哔哩哔哩自动发布',
        },
        include: leadPublishJobInclude,
      });
    }

    await this.prisma.leadPublishJob.update({
      where: { id: current.id },
      data: {
        status: LeadPublishStatus.running,
        lastError: null,
      },
    });

    try {
      const useOfficialOauthShareSchema =
        current.platform === LeadPublishPlatform.douyin &&
        current.platformAccount.provider === PlatformAccountProvider.official_oauth;

      const useKuaishouOfficialOauth =
        current.platform === LeadPublishPlatform.kuaishou &&
        current.platformAccount.provider === PlatformAccountProvider.official_oauth;

      const useWechatOfficialOauth =
        current.platform === LeadPublishPlatform.wechat_official &&
        current.platformAccount.provider === PlatformAccountProvider.official_oauth;

      const useBilibiliOfficialOauth =
        current.platform === LeadPublishPlatform.bilibili &&
        current.platformAccount.provider === PlatformAccountProvider.official_oauth;

      if (current.platformAccount.provider === PlatformAccountProvider.mcp) {
        throw new ConflictException('当前账号为 MCP 渠道账号，但后端已移除 MCP 发布能力');
      }

      if (FORCE_EXTENSION_PUBLISH_PLATFORMS.has(current.platform)) {
        throw new ConflictException('小红书、视频号发布已切回浏览器扩展执行，请使用扩展发布模式');
      }

      if (useOfficialOauthShareSchema) {
        const shareSchemaResult = await this.publishDouyinWithShareSchema(current);
        return this.prisma.leadPublishJob.update({
          where: { id: current.id },
          data: {
            status: LeadPublishStatus.success,
            draftUrl: shareSchemaResult.draftUrl,
            externalStatus: shareSchemaResult.externalStatus,
            draftedAt: new Date(),
            lastError: null,
          },
          include: leadPublishJobInclude,
        });
      }

      if (useWechatOfficialOauth) {
        if (current.platformAccount.authType !== PlatformAccountAuthType.token) {
          throw new ConflictException('公众号官方发布需要官方 OAuth Token 登录态');
        }

        const componentAccessToken =
          this.configService.get<string>('WECHAT_OPEN_COMPONENT_ACCESS_TOKEN')?.trim() || '';
        const componentAppId =
          this.configService.get<string>('WECHAT_OPEN_COMPONENT_APP_ID')?.trim() || '';
        if (!componentAccessToken || !componentAppId) {
          throw new ConflictException('未配置微信公众号第三方平台 component_access_token / component_app_id');
        }

        const result = await this.wechatOfficialPublishService.publishMpNewsFromJob({
          job: {
            draftTitle: current.draftTitle,
            draftBody: current.draftBody,
            draftImages: current.draftImages,
            draftVideoUrl: current.draftVideoUrl,
          },
          leadContent: {
            title: current.leadContent.title,
            body: current.leadContent.body,
            images: current.leadContent.images,
            coverImage: current.leadContent.coverImage,
          },
          account: {
            authPayloadEncrypted: current.platformAccount.authPayloadEncrypted,
            authType: current.platformAccount.authType,
          },
          componentAccessToken,
          componentAppId,
        });

        if (result.token) {
          await this.updateOfficialOauthTokenPayload(current.platformAccount.id, {
            accessToken: result.token.accessToken,
            refreshToken: result.token.refreshToken,
          });
        }

        return this.prisma.leadPublishJob.update({
          where: { id: current.id },
          data: {
            status: LeadPublishStatus.success,
            draftUrl: result.result.url,
            externalDraftId: result.result.mediaId,
            externalStatus: result.result.status,
            draftedAt: new Date(),
            lastError: null,
          },
          include: leadPublishJobInclude,
        });
      }

      if (useBilibiliOfficialOauth) {
        if (current.platformAccount.authType !== PlatformAccountAuthType.token) {
          throw new ConflictException('B站官方发布需要官方 OAuth Token 登录态');
        }
        if (!current.draftVideoUrl?.trim()) {
          throw new ConflictException('B站官方发布当前仅支持视频内容');
        }

        const coverUrl = await this.resolveBilibiliCoverUrl(current);
        if (!coverUrl) {
          throw new ConflictException('B站官方发布需要封面图');
        }

        const config = this.getOfficialOauthClientConfig(LeadPublishPlatform.bilibili);
        const tokenPayload = this.readOfficialOauthTokenPayload(current.platformAccount);

        const publish = await this.bilibiliOpenApiService.publishVideoFromUrl({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          accessToken: tokenPayload.accessToken,
          videoUrl: current.draftVideoUrl.trim(),
          coverUrl,
          title: current.draftTitle || current.leadContent.title || 'B站视频',
          desc: this.truncateText(current.draftBody || current.leadContent.body || '', 250),
          tags: current.draftTags,
        });

        return this.prisma.leadPublishJob.update({
          where: { id: current.id },
          data: {
            status: LeadPublishStatus.success,
            draftUrl: publish.playUrl,
            externalDraftId: publish.resourceId,
            externalStatus: 'submitted',
            draftedAt: new Date(),
            lastError: null,
          },
          include: leadPublishJobInclude,
        });
      }

      if (useKuaishouOfficialOauth) {
        const useKuaishouOpenApi =
          current.platformAccount.authType === PlatformAccountAuthType.token &&
          Boolean(current.draftVideoUrl?.trim());

        if (useKuaishouOpenApi) {
          const publishResult = await this.publishKuaishouWithOpenApi(current);

          return this.prisma.leadPublishJob.update({
            where: { id: current.id },
            data: {
              status: LeadPublishStatus.success,
              draftUrl: publishResult.draftUrl,
              externalDraftId: publishResult.externalDraftId,
              externalStatus: publishResult.externalStatus,
              draftedAt: new Date(),
              lastError: null,
            },
            include: leadPublishJobInclude,
          });
        }

        if (current.platformAccount.authType !== PlatformAccountAuthType.cookie) {
          throw new ConflictException(
            '快手图文发布需要 Cookie 登录态：请先用浏览器插件登录把 Cookie 同步到该账号，再重试发布',
          );
        }
      }

      const result = await this.platformLoginBrowserService.publish({
        accountId: current.platformAccount.id,
        sessionPath:
          current.platformAccount.browserSessionPath ||
          this.platformLoginBrowserService.getSessionPath(current.platformAccount.id),
        platform: current.platform,
        jobId: current.id,
        authPayload: this.decryptAuthPayload(current.platformAccount.authPayloadEncrypted),
        title: current.draftTitle,
        body: current.draftBody,
        tags: current.draftTags,
        images: current.draftImages,
        videoUrl: current.draftVideoUrl,
      });

      if (result.authPayload) {
        await this.prisma.leadPlatformAccount.update({
          where: { id: current.platformAccount.id },
          data: {
            accountName: result.accountName || current.platformAccount.accountName,
            displayName:
              result.displayName !== undefined
                ? result.displayName
                : current.platformAccount.displayName,
            authType: PlatformAccountAuthType.cookie,
            authPayloadEncrypted: this.encryptAuthPayload(result.authPayload),
            authPayloadPreview: this.maskAuthPayload(result.authPayload),
            status: PlatformAccountStatus.valid,
            loginStatus: PlatformAccountLoginStatus.authenticated,
            lastLoginCompletedAt: new Date(),
            lastValidatedAt: new Date(),
            lastError: null,
          },
        });
      }

      return this.prisma.leadPublishJob.update({
        where: { id: current.id },
        data: {
          status: LeadPublishStatus.success,
          draftUrl: result.draftUrl,
          draftedAt: new Date(),
          lastError: null,
        },
        include: leadPublishJobInclude,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布平台内容失败';
      await this.markPlatformAccountAuthExpiredIfNeeded(current.platformAccount.id, message);
      return this.prisma.leadPublishJob.update({
        where: { id: current.id },
        data: {
          status: LeadPublishStatus.failed,
          lastError: message,
        },
        include: leadPublishJobInclude,
      });
    }
  }

  private async publishKuaishouWithOpenApi(job: LeadPublishJobWithRelations) {
    if (!job.platformAccount) {
      throw new ConflictException('发布任务缺少平台账号');
    }
    if (!job.draftVideoUrl?.trim()) {
      throw new ConflictException('快手官方 OAuth 发布当前仅支持视频内容');
    }

    const coverUrl = await this.resolveKuaishouCoverUrl(job);
    if (!coverUrl) {
      throw new ConflictException('快手官方 OAuth 发布需要封面图');
    }

    const config = this.getOfficialOauthClientConfig(LeadPublishPlatform.kuaishou);
    const tokenPayload = this.readOfficialOauthTokenPayload(job.platformAccount);

    const publish = await this.kuaishouOpenApiService.publishVideoFromUrl({
      appId: config.clientId,
      appSecret: config.clientSecret,
      accessToken: tokenPayload.accessToken,
      refreshToken: tokenPayload.refreshToken,
      videoUrl: job.draftVideoUrl.trim(),
      coverUrl,
      caption: job.draftTitle || job.leadContent.title || '快手视频',
    });

    if (publish.token.accessToken !== tokenPayload.accessToken) {
      await this.updateOfficialOauthTokenPayload(job.platformAccount.id, {
        ...tokenPayload,
        accessToken: publish.token.accessToken,
        refreshToken: publish.token.refreshToken,
      });
    }

    return {
      externalDraftId: publish.photoId,
      draftUrl: publish.playUrl,
      externalStatus: publish.pending ? 'pending' : 'published',
    };
  }

  private readOfficialOauthTokenPayload(account: {
    authType: PlatformAccountAuthType;
    authPayloadEncrypted: string;
  }) {
    if (account.authType !== PlatformAccountAuthType.token) {
      throw new ConflictException('平台账号授权类型不匹配');
    }
    const raw = this.decryptAuthPayload(account.authPayloadEncrypted);
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

    if (!accessToken) {
      throw new ConflictException('平台账号缺少 accessToken');
    }

    return { accessToken, refreshToken };
  }

  private async updateOfficialOauthTokenPayload(
    platformAccountId: string,
    token: { accessToken: string; refreshToken: string | null },
  ) {
    const current = await this.prisma.leadPlatformAccount.findUnique({
      where: { id: platformAccountId },
      select: { authPayloadEncrypted: true },
    });
    const raw = current?.authPayloadEncrypted ? this.decryptAuthPayload(current.authPayloadEncrypted) : '';
    let nextPayload: Record<string, unknown> = {};
    try {
      nextPayload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      nextPayload = {};
    }
    nextPayload.accessToken = token.accessToken;
    nextPayload.refreshToken = token.refreshToken;
    const authPayload = JSON.stringify(nextPayload);

    await this.prisma.leadPlatformAccount.update({
      where: { id: platformAccountId },
      data: {
        authPayloadEncrypted: this.encryptAuthPayload(authPayload),
        authPayloadPreview: this.maskAuthPayload(token.accessToken),
        lastValidatedAt: new Date(),
        lastError: null,
      },
    });
  }

  private async resolveKuaishouCoverUrl(job: LeadPublishJobWithRelations) {
    const draftCover = job.draftImages.find((item) => item?.trim());
    if (draftCover) {
      return draftCover.trim();
    }

    const content = await this.prisma.leadContent.findUnique({
      where: { id: job.leadContentId },
      select: {
        coverImage: true,
        images: true,
      },
    });
    const candidates = [content?.coverImage, ...(content?.images ?? [])]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item));
    return candidates[0] ?? '';
  }

  private async resolveBilibiliCoverUrl(job: LeadPublishJobWithRelations) {
    const draftCover = job.draftImages.find((item) => item?.trim());
    if (draftCover) {
      return draftCover.trim();
    }

    const content = await this.prisma.leadContent.findUnique({
      where: { id: job.leadContentId },
      select: {
        coverImage: true,
        images: true,
      },
    });
    const candidates = [content?.coverImage, ...(content?.images ?? [])]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item));
    return candidates[0] ?? '';
  }

  private truncateText(input: string, maxLen: number) {
    const trimmed = (input || '').trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen);
  }

  private async publishDouyinWithShareSchema(job: LeadPublishJobWithRelations) {
    const userId = job.createdById;
    const title = job.draftTitle?.trim() || job.draftBody?.trim() || '';
    const topics = job.draftTags ?? [];

    const resolvedVideoUrl = job.draftVideoUrl?.trim()
      ? (await this.productImageStorageService.mirrorRemoteAsset(userId, job.draftVideoUrl.trim()))
          .url
      : null;

    const resolvedImages = await Promise.all(
      (job.draftImages ?? []).map(async (item) => {
        const normalized = item?.trim();
        if (!normalized) return null;
        const stored = await this.productImageStorageService.mirrorRemoteAsset(userId, normalized);
        return stored.url;
      }),
    ).then((items) => items.filter((item): item is string => Boolean(item)));

    const draftUrl = await this.douyinShareSchemaService.generateShareSchema({
      title,
      topics,
      videoUrl: resolvedVideoUrl,
      imageUrls: resolvedImages,
    });

    return {
      draftUrl,
      externalStatus: '请用手机打开链接继续发布',
    };
  }

  private triggerPublishJobs(jobIds: string[]) {
    for (const jobId of jobIds) {
      if (!jobId || this.backgroundRunningJobIds.has(jobId)) {
        continue;
      }

      this.backgroundRunningJobIds.add(jobId);
      this.logger.log(`[publish-queue] schedule job=${jobId}`);
      setTimeout(() => {
        void this.executeDraftSaveInBackground(jobId);
      }, 0);
    }
  }

  private async executeDraftSaveInBackground(jobId: string) {
    try {
      this.logger.log(`[publish-queue] run job=${jobId}`);
      await this.executeDraftSave(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布任务后台执行失败';
      this.logger.error(`[publish-job:${jobId}] ${message}`);
    } finally {
      this.backgroundRunningJobIds.delete(jobId);
    }
  }

  private async markPlatformAccountAuthExpiredIfNeeded(accountId: string, message: string) {
    if (!this.isPlatformAuthExpiredMessage(message)) {
      return;
    }

    await this.prisma.leadPlatformAccount.update({
      where: { id: accountId },
      data: {
        status: PlatformAccountStatus.invalid,
        loginStatus: PlatformAccountLoginStatus.failed,
        lastError: message,
      },
    });
  }

  private isPlatformAuthExpiredMessage(message: string) {
    const normalized = message.toLowerCase();
    const hints = [
      '登录已失效',
      '仍在登录页',
      '请完成登录',
      '未读取到登录 cookie',
      'cookie 已失效',
      'cookie失效',
      '登录状态失效',
      '登录状态已失效',
      'session expired',
      'login expired',
      'not logged in',
      'please login',
      '账号后台',
      'auth expired',
      'invalid cookie',
      'unauthorized',
      'access denied',
      'forbidden',
      'expired',
      '重新登录',
    ];
    return hints.some((hint) => normalized.includes(hint.toLowerCase()));
  }

  private async startBitBrowserPublishJob(jobId: string) {
    const current = await this.prisma.leadPublishJob.findUnique({
      where: { id: jobId },
      include: leadPublishJobInclude,
    });

    if (!current) {
      throw new NotFoundException('发布任务不存在');
    }

    const session = await this.prepareExtensionPublishSession(current, current.createdById);
    const platformAccount = current.platformAccount;
    if (!platformAccount) {
      throw new NotFoundException('未找到发布账号');
    }

    try {
      return await this.publishingBitBrowserService.startPublishRuntime({
        creatorId: current.createdById,
        platform: current.platform,
        accountId: platformAccount.id,
        accountName: platformAccount.accountName,
        externalGroupId: this.requireExternalGroupId(platformAccount, current.platform),
        sessionToken: session.sessionToken,
        accountAuthPayload: session.accountAuthPayload,
        accountCookiePayload: session.accountCookiePayload ?? undefined,
        job: session.job,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BitBrowser 发布启动失败';
      await this.prisma.leadPublishJob.update({
        where: { id: current.id },
        data: {
          status: LeadPublishStatus.failed,
          lastError: message,
        },
      });
      throw error;
    }
  }

  private async prepareExtensionPublishSession(
    job: LeadPublishJobWithRelations,
    userId: string,
  ) {
    const accountAuthPayload = this.getValidatedExtensionPublishAuthPayload(job);
    const platformAccount = job.platformAccount;
    if (!platformAccount) {
      throw new NotFoundException('未找到发布账号');
    }

    const sessionToken = await this.jwtService.signAsync(
      {
        purpose: EXTENSION_PUBLISH_TOKEN_PURPOSE,
        jid: job.id,
        uid: userId,
        platform: job.platform,
        aid: platformAccount.id,
      } satisfies ExtensionPublishTokenPayload,
      {
        expiresIn: `${EXTENSION_PUBLISH_TTL_SECONDS}s`,
      },
    );

    const running =
      job.status === LeadPublishStatus.running
        ? job
        : await this.prisma.leadPublishJob.update({
            where: { id: job.id },
            data: {
              status: LeadPublishStatus.running,
              lastError: null,
            },
            include: leadPublishJobInclude,
          });

    return {
      sessionToken,
      expiresAt: new Date(Date.now() + EXTENSION_PUBLISH_TTL_SECONDS * 1000).toISOString(),
      job: this.serializePublishJob(running),
      accountAuthPayload,
      accountCookiePayload: this.getExtensionAccountCookiePayload(platformAccount),
      platformAccountId: platformAccount.id,
      platformAccountName: platformAccount.accountName,
      platformAccountDisplayName: platformAccount.displayName,
    };
  }

  private shouldUseBitBrowserPublish(job: LeadPublishJobWithRelations) {
    return Boolean(
      job.platformAccount &&
        job.platformAccount.provider === PlatformAccountProvider.extension &&
        BITBROWSER_EXTENSION_PUBLISH_PLATFORMS.has(job.platform),
    );
  }

  private requireExternalGroupId(
    account: Pick<LeadPlatformAccountWithRelations, 'externalGroupId'>,
    platform: LeadPublishPlatform,
  ) {
    const externalGroupId = account.externalGroupId?.trim() || '';
    if (!externalGroupId) {
      throw new ConflictException(
        `${this.getPlatformDisplayName(platform)}账号尚未建立浏览器环境，请重新登录一次后再试`,
      );
    }
    return externalGroupId;
  }

  private async resolvePlatformLoginGroupId(input: {
    userId: string;
    platform: LeadPublishPlatform;
    currentAccount: LeadPlatformAccountWithRelations | null;
    requestedGroupId: string | null;
  }) {
    const currentGroupId = input.currentAccount?.externalGroupId?.trim();
    if (currentGroupId) {
      await this.migrateSharedPlatformGroupIfNeeded(input.userId, input.currentAccount);
      return currentGroupId;
    }

    const requestedGroupId = input.requestedGroupId?.trim();
    if (requestedGroupId) {
      return this.normalizeAutoGroupId(requestedGroupId);
    }

    const existingAccounts = await this.prisma.leadPlatformAccount.findMany({
      where: {
        creatorId: input.userId,
        provider: PlatformAccountProvider.extension,
        externalGroupId: {
          not: null,
        },
      },
      select: {
        externalGroupId: true,
      },
    });

    const groupIds = new Set<string>();
    for (const account of existingAccounts) {
      const groupId = this.normalizeAutoGroupId(account.externalGroupId || '');
      if (!groupId) {
        continue;
      }
      groupIds.add(groupId);
    }

    return this.buildNextAutoGroupId(groupIds);
  }

  private async migrateSharedPlatformGroupIfNeeded(
    userId: string,
    currentAccount: LeadPlatformAccountWithRelations | null,
  ) {
    if (!currentAccount?.externalGroupId) {
      return;
    }

    const sharedAccounts = await this.prisma.leadPlatformAccount.findMany({
      where: {
        creatorId: userId,
        provider: PlatformAccountProvider.extension,
        externalGroupId: currentAccount.externalGroupId,
        id: {
          not: currentAccount.id,
        },
      },
      select: {
        id: true,
      },
    });
    if (!sharedAccounts.length) {
      return;
    }

    await this.prisma.leadPlatformAccount.updateMany({
      where: {
        id: {
          in: sharedAccounts.map((item) => item.id),
        },
      },
      data: {
        externalGroupId: null,
        loginStatus: PlatformAccountLoginStatus.failed,
        lastError: '请重新登录以迁移到专属 BitBrowser Profile',
      },
    });
  }

  private normalizeAutoGroupId(value: string) {
    return value.trim().toUpperCase();
  }

  private buildNextAutoGroupId(existingGroupIds: Set<string>) {
    let index = 0;
    while (index < 702) {
      const candidate = this.convertIndexToGroupId(index);
      if (!existingGroupIds.has(candidate)) {
        return candidate;
      }
      index += 1;
    }
    throw new ConflictException('自动分配账号分组失败，请清理无效账号后重试');
  }

  private convertIndexToGroupId(index: number) {
    let current = index;
    let result = '';
    do {
      result = String.fromCharCode(65 + (current % 26)) + result;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return result;
  }

  private getPlatformDisplayName(platform: LeadPublishPlatform) {
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return '小红书';
      case LeadPublishPlatform.douyin:
        return '抖音';
      case LeadPublishPlatform.wechat_mp:
        return '视频号';
      case LeadPublishPlatform.kuaishou:
        return '快手';
      case LeadPublishPlatform.wechat_official:
        return '微信公众号';
      case LeadPublishPlatform.bilibili:
        return '哔哩哔哩';
      default:
        return platform;
    }
  }

  private serializeLeadContent(item: LeadContentWithRelations) {
    return {
      id: item.id,
      creatorId: item.creatorId,
      creatorName: item.creator.displayName,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      body: item.body,
      tags: item.tags,
      contentType: item.contentType,
      platformStyle: item.platformStyle,
      coverImage: item.coverImage,
      images: item.images,
      videoUrl: item.videoUrl,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      publishJobs: item.publishJobs.map((job) => this.serializePublishJobPlain(job)),
    };
  }

  private serializeLeadContentListItem(item: LeadContentListItem) {
    return {
      id: item.id,
      creatorId: item.creatorId,
      creatorName: item.creator.displayName,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      body: item.body,
      tags: item.tags,
      contentType: item.contentType,
      platformStyle: item.platformStyle,
      coverImage: item.coverImage,
      images: item.images,
      videoUrl: item.videoUrl,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private serializePublishJob(item: LeadPublishJobWithRelations) {
    return {
      ...this.serializePublishJobPlain(item),
      leadContentTitle: item.leadContent.title,
      platformAccountId: item.platformAccountId,
      platformAccountName: item.platformAccount?.accountName ?? null,
      platformAccountDisplayName: item.platformAccount?.displayName ?? null,
    };
  }

  private serializePublishJobPlain(item: LeadPublishJobPlain) {
    return {
      id: item.id,
      leadContentId: item.leadContentId,
      createdById: item.createdById,
      platform: item.platform,
      provider: item.provider,
      platformAccountId: item.platformAccountId,
      publishMode: item.publishMode,
      status: item.status,
      draftTitle: item.draftTitle,
      draftBody: item.draftBody,
      draftTags: item.draftTags,
      draftImages: item.draftImages,
      draftVideoUrl: item.draftVideoUrl,
      draftUrl: item.draftUrl,
      externalDraftId: item.externalDraftId,
      externalFlowId: item.externalFlowId,
      externalStatus: item.externalStatus,
      draftedAt: item.draftedAt?.toISOString() ?? null,
      queuedAt: item.queuedAt?.toISOString() ?? null,
      startedAt: item.startedAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      lastError: item.lastError,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private buildPublishDraftPayload(
    content: LeadContentWithRelations,
    platform: LeadPublishPlatform,
    overrides?: {
      draftTitle?: string;
      draftBody?: string;
      draftTags?: string[];
    },
  ) {
    const sourceBody = overrides?.draftBody?.trim() || content.body;
    const tags =
      overrides?.draftTags !== undefined
        ? this.normalizeTags(overrides.draftTags)
        : overrides?.draftBody !== undefined
          ? this.extractTags(sourceBody).length > 0
            ? this.extractTags(sourceBody)
            : this.normalizeTags(content.tags)
          : content.tags.length > 0
            ? this.normalizeTags(content.tags)
            : this.extractTags(content.body);
    return {
      title: overrides?.draftTitle?.trim() || content.title.trim(),
      body: this.normalizeDraftBody(sourceBody, tags, platform),
      tags: this.normalizeDraftTagsForPlatform(tags, platform),
      images: content.images,
      videoUrl: content.videoUrl,
    };
  }

  private extractTags(body: string) {
    return Array.from(
      new Set(
        Array.from(body.matchAll(/#([^\s#]+)/g))
          .map((item) => item[1]?.trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );
  }

  private normalizeDraftBody(body: string, tags: string[], platform: LeadPublishPlatform) {
    const normalized = body.replace(/\r\n/g, '\n').trim();
    const plainBody = this.removeTagsFromDraftBody(normalized);
    if (platform === LeadPublishPlatform.douyin || platform === LeadPublishPlatform.xiaohongshu) {
      return plainBody;
    }

    const formattedTags = this.formatInlineDraftTags(tags, platform);
    if (!formattedTags) {
      return plainBody;
    }

    return [plainBody, formattedTags].filter(Boolean).join('\n').trim();
  }

  private removeTagsFromDraftBody(body: string) {
    return body
      .replace(/#([^\s#]+)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private formatDraftTag(tag: string, _platform: LeadPublishPlatform) {
    const normalizedTag = tag.trim().replace(/^#/, '');
    if (!normalizedTag) {
      return '';
    }

    return `#${normalizedTag}`;
  }

  private normalizeDraftTagsForPlatform(tags: string[], platform: LeadPublishPlatform) {
    const normalizedTags = this.normalizeTags(tags);
    if (platform === LeadPublishPlatform.douyin || platform === LeadPublishPlatform.xiaohongshu) {
      return normalizedTags;
    }

    return normalizedTags.map((tag) => this.formatDraftTag(tag, platform)).filter(Boolean);
  }

  private formatInlineDraftTags(tags: string[], platform: LeadPublishPlatform) {
    return this.normalizeTags(tags)
      .map((tag) => this.formatDraftTag(tag, platform))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private normalizeTags(tags?: string[]) {
    return Array.from(
      new Set(
        (tags ?? [])
          .map((item) => item.replace(/^#+/, '').trim())
          .filter(Boolean),
      ),
    );
  }

  private isAutoPublishPlatformSupported(platform: LeadPublishPlatform) {
    return SUPPORTED_AUTO_PUBLISH_PLATFORMS.has(platform);
  }

  private isOfficialOauthPlatformSupported(platform: LeadPublishPlatform) {
    return SUPPORTED_OFFICIAL_OAUTH_PLATFORMS.has(platform);
  }

  private parseOfficialOauthPlatform(
    platform: string,
    strict = true,
  ): LeadPublishPlatform | null {
    if (
      platform === LeadPublishPlatform.douyin ||
      platform === LeadPublishPlatform.kuaishou ||
      platform === LeadPublishPlatform.bilibili ||
      platform === LeadPublishPlatform.wechat_official
    ) {
      return platform;
    }
    if (strict) {
      throw new BadRequestException('当前平台暂未开放官方 OAuth 登录');
    }
    return null;
  }

  private getOfficialOauthClientConfig(platform: LeadPublishPlatform): OfficialOauthClientConfig {
    if (platform === LeadPublishPlatform.douyin) {
      const clientKey = this.configService.get<string>('DOUYIN_OPEN_CLIENT_KEY')?.trim();
      const clientSecret = this.configService.get<string>('DOUYIN_OPEN_CLIENT_SECRET')?.trim();
      if (!clientKey || !clientSecret) {
        throw new ConflictException('未配置抖音开放平台 Client Key / Client Secret');
      }
      return {
        clientId: clientKey,
        clientSecret,
        scope: this.configService.get<string>('DOUYIN_OPEN_SCOPE')?.trim() || 'user_info',
      };
    }

    if (platform === LeadPublishPlatform.kuaishou) {
      const appId = this.configService.get<string>('KUAISHOU_OPEN_APP_ID')?.trim();
      const appSecret = this.configService.get<string>('KUAISHOU_OPEN_APP_SECRET')?.trim();
      if (!appId || !appSecret) {
        throw new ConflictException('未配置快手开放平台 App ID / App Secret');
      }
      return {
        clientId: appId,
        clientSecret: appSecret,
        scope:
          this.configService.get<string>('KUAISHOU_OPEN_SCOPE')?.trim() ||
          'user_info,user_video_publish,user_video_info',
      };
    }

    if (platform === LeadPublishPlatform.bilibili) {
      const clientId = this.configService.get<string>('BILIBILI_OPEN_CLIENT_ID')?.trim();
      const clientSecret = this.configService.get<string>('BILIBILI_OPEN_CLIENT_SECRET')?.trim();
      if (!clientId || !clientSecret) {
        throw new ConflictException('未配置哔哩哔哩开放平台 Client ID / Client Secret');
      }
      return {
        clientId,
        clientSecret,
        scope: this.configService.get<string>('BILIBILI_OPEN_SCOPE')?.trim() || '',
      };
    }

    if (platform === LeadPublishPlatform.wechat_official) {
      const clientId = this.configService.get<string>('WECHAT_OPEN_COMPONENT_APP_ID')?.trim();
      const clientSecret = this.configService.get<string>('WECHAT_OPEN_COMPONENT_APP_SECRET')?.trim();
      if (!clientId || !clientSecret) {
        throw new ConflictException('未配置微信开放平台第三方平台 AppID / AppSecret');
      }
      const preAuthCode = this.configService.get<string>('WECHAT_OPEN_PRE_AUTH_CODE')?.trim();
      if (!preAuthCode) {
        throw new ConflictException(
          '未配置微信第三方平台 pre_auth_code，当前还未完成自动票据刷新链路',
        );
      }
      return {
        clientId,
        clientSecret,
        scope: this.configService.get<string>('WECHAT_OPEN_AUTH_TYPE')?.trim() || '2',
        preAuthCode,
        bizAppId: this.configService.get<string>('WECHAT_OPEN_BIZ_APP_ID')?.trim() || '',
      };
    }

    throw new ConflictException('当前平台暂未开放官方 OAuth 登录');
  }

  private buildOfficialOauthAuthorizeUrl(platform: LeadPublishPlatform, state: string) {
    const config = this.getOfficialOauthClientConfig(platform);
    const redirectUri = this.getOfficialOauthCallbackUrl(platform);
    const params = new URLSearchParams();

    if (platform === LeadPublishPlatform.douyin) {
      params.set('client_key', config.clientId);
      params.set('response_type', 'code');
      params.set('scope', config.scope);
      params.set('redirect_uri', redirectUri);
      params.set('state', state);
      return `https://open.douyin.com/platform/oauth/connect/?${params.toString()}`;
    }

    if (platform === LeadPublishPlatform.kuaishou) {
      params.set('app_id', config.clientId);
      params.set('scope', config.scope);
      params.set('response_type', 'code');
      params.set('redirect_uri', redirectUri);
      params.set('state', state);
      params.set('ua', 'pc');
      return `https://open.kuaishou.com/oauth2/authorize?${params.toString()}`;
    }

    if (platform === LeadPublishPlatform.bilibili) {
      params.set('client_id', config.clientId);
      params.set('response_type', 'code');
      params.set('gourl', redirectUri);
      params.set('state', state);
      if (config.scope) {
        params.set('scope', config.scope);
      }
      return `https://account.bilibili.com/pc/account-pc/auth/oauth?${params.toString()}`;
    }

    if (platform === LeadPublishPlatform.wechat_official) {
      params.set('component_appid', config.clientId);
      params.set('pre_auth_code', config.preAuthCode || '');
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set('state', state);
      params.set('redirect_uri', callbackUrl.toString());
      params.set('auth_type', config.scope);
      if (config.bizAppId) {
        params.set('biz_appid', config.bizAppId);
      }
      return `https://mp.weixin.qq.com/cgi-bin/componentloginpage?${params.toString()}`;
    }

    throw new ConflictException('当前平台暂未开放官方 OAuth 登录');
  }

  private getOfficialOauthCallbackUrl(platform: LeadPublishPlatform) {
    const appBaseUrl = this.getPublicAppBaseUrl();
    const url = new URL('/api/publishing/platform-accounts/official-oauth/callback', appBaseUrl);
    url.searchParams.set('platform', platform);
    return url.toString();
  }

  private getPublicAppBaseUrl() {
    const explicit =
      this.configService.get<string>('PLATFORM_OAUTH_APP_BASE_URL')?.trim() ||
      this.configService.get<string>('APP_BASE_URL')?.trim() ||
      this.configService.get<string>('CORS_ORIGIN')?.trim();

    if (!explicit) {
      throw new ConflictException('未配置平台 OAuth 回调基础地址');
    }

    return explicit.endsWith('/') ? explicit : `${explicit}/`;
  }

  private buildOfficialOauthResultRedirectUrl(input: {
    platform: LeadPublishPlatform | null;
    status: 'success' | 'failed';
    accountId?: string;
    error?: string;
  }) {
    const resultUrl = new URL('/publishing/platform-login', this.getPublicAppBaseUrl());
    if (input.platform) {
      resultUrl.searchParams.set('oauth_platform', input.platform);
    }
    resultUrl.searchParams.set('oauth_status', input.status);
    if (input.accountId) {
      resultUrl.searchParams.set('oauth_account_id', input.accountId);
    }
    if (input.error) {
      resultUrl.searchParams.set('oauth_error', input.error);
    }
    return resultUrl.toString();
  }

  private async exchangeOfficialOauthToken(platform: LeadPublishPlatform, code: string) {
    const config = this.getOfficialOauthClientConfig(platform);
    const redirectUri = this.getOfficialOauthCallbackUrl(platform);

    if (platform === LeadPublishPlatform.douyin) {
      const payload = await this.requestOfficialOauthTokenJson(
        'https://open.douyin.com/oauth/access_token/',
        {
          client_key: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: 'authorization_code',
        },
      );
      const data = this.pickOauthResponseData(payload);
      const accessToken = this.readOauthField(data, ['access_token']);
      const refreshToken = this.readOauthField(data, ['refresh_token']);
      const externalAccountId = this.readOauthField(data, ['open_id', 'openId']);

      return {
        accountName: externalAccountId,
        displayName: null,
        externalAccountId,
        authPayload: {
          accessToken,
          refreshToken,
          openId: externalAccountId,
          expiresIn: this.readOauthField(data, ['expires_in'], false),
          refreshExpiresIn: this.readOauthField(data, ['refresh_expires_in'], false),
        },
        externalMeta: data,
      };
    }

    if (platform === LeadPublishPlatform.bilibili) {
      const payload = await this.requestOfficialOauthTokenJson(
        'https://api.bilibili.com/x/account-oauth2/v1/token',
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: 'authorization_code',
        },
      );
      const data = this.pickOauthResponseData(payload);
      const accessToken = this.readOauthField(data, ['access_token']);
      const refreshToken = this.readOauthField(data, ['refresh_token'], false);
      const profile = await this.fetchBilibiliOauthUserInfo(
        accessToken,
        config.clientId,
        config.clientSecret,
      );
      const externalAccountId =
        this.readOauthField(profile, ['openid', 'open_id'], false) ||
        this.readOauthField(data, ['openid', 'open_id'], false);
      const displayName = this.readOauthField(profile, ['name'], false) || null;

      return {
        accountName:
          externalAccountId ||
          displayName ||
          `bilibili_${new Date().getTime().toString(36)}`,
        displayName,
        externalAccountId: externalAccountId || null,
        authPayload: {
          accessToken,
          refreshToken,
          openId: externalAccountId || '',
          expiresIn: this.readOauthField(data, ['expires_in'], false),
          scopes: Array.isArray(data.scopes) ? data.scopes : [],
        },
        externalMeta: {
          token: data,
          profile,
        },
      };
    }

    if (platform === LeadPublishPlatform.wechat_official) {
      const componentAccessToken = this.configService
        .get<string>('WECHAT_OPEN_COMPONENT_ACCESS_TOKEN')
        ?.trim();
      if (!componentAccessToken) {
        throw new ConflictException(
          '未配置微信第三方平台 component_access_token，当前还未完成自动票据刷新链路',
        );
      }

      const payload = await this.requestOfficialOauthJson(
        `https://api.weixin.qq.com/cgi-bin/component/api_query_auth?component_access_token=${encodeURIComponent(
          componentAccessToken,
        )}`,
        {
          component_appid: config.clientId,
          authorization_code: code,
        },
      );
      const data = this.pickOauthResponseData(payload);
      const authorizationInfo = this.pickOauthResponseData(
        this.readOauthObject(data, ['authorization_info']),
      );
      const externalAccountId = this.readOauthField(authorizationInfo, ['authorizer_appid']);
      const accessToken = this.readOauthField(authorizationInfo, ['authorizer_access_token']);
      const refreshToken = this.readOauthField(
        authorizationInfo,
        ['authorizer_refresh_token'],
        false,
      );

      return {
        accountName: externalAccountId,
        displayName: null,
        externalAccountId,
        authPayload: {
          accessToken,
          refreshToken,
          authorizerAppId: externalAccountId,
          expiresIn: this.readOauthField(authorizationInfo, ['expires_in'], false),
        },
        externalMeta: data,
      };
    }

    const payload = await this.requestOfficialOauthTokenJson(
      'https://open.kuaishou.com/oauth2/access_token',
      {
        app_id: config.clientId,
        app_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
    );
    const data = this.pickOauthResponseData(payload);
    const accessToken = this.readOauthField(data, ['access_token']);
    const refreshToken = this.readOauthField(data, ['refresh_token'], false);
    const externalAccountId = this.readOauthField(data, ['open_id', 'openId', 'user_id'], false);

    return {
      accountName: externalAccountId || this.readOauthField(data, ['kwai_user_id'], false),
      displayName: null,
      externalAccountId: externalAccountId || null,
      authPayload: {
        accessToken,
        refreshToken,
        openId: externalAccountId,
        expiresIn: this.readOauthField(data, ['expires_in'], false),
        refreshExpiresIn: this.readOauthField(data, ['refresh_token_expires_in'], false),
      },
      externalMeta: data,
    };
  }

  private async requestOfficialOauthTokenJson(
    url: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(body),
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ConflictException(`OAuth Token 接口返回异常：${text || 'empty response'}`);
    }

    if (!response.ok) {
      throw new ConflictException(this.resolveOauthErrorMessage(payload, 'OAuth Token 换取失败'));
    }

    this.assertOauthPayloadSuccess(payload, 'OAuth Token 换取失败');
    return payload;
  }

  private async requestOfficialOauthJson(
    url: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ConflictException(`OAuth 接口返回异常：${text || 'empty response'}`);
    }

    if (!response.ok) {
      throw new ConflictException(this.resolveOauthErrorMessage(payload, 'OAuth 请求失败'));
    }

    this.assertOauthPayloadSuccess(payload, 'OAuth 请求失败');
    return payload;
  }

  private async fetchBilibiliOauthUserInfo(
    accessToken: string,
    clientId: string,
    clientSecret: string,
  ) {
    const response = await fetch('https://member.bilibili.com/arcopen/fn/user/account/info', {
      headers: this.buildBilibiliOauthHeaders(accessToken, clientId, clientSecret),
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ConflictException(`B站用户信息接口返回异常：${text || 'empty response'}`);
    }

    if (!response.ok) {
      throw new ConflictException(this.resolveOauthErrorMessage(payload, 'B站用户信息获取失败'));
    }

    this.assertOauthPayloadSuccess(payload, 'B站用户信息获取失败');
    return this.pickOauthResponseData(payload);
  }

  private buildBilibiliOauthHeaders(
    accessToken: string,
    clientId: string,
    clientSecret: string,
  ): Record<string, string> {
    const nonce = randomBytes(16).toString('base64url');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers = {
      'Accept': 'application/json',
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
      'X-Bili-AccessKeyId': clientId,
      'X-Bili-Content-Md5': createHash('md5').update('').digest('hex'),
      'X-Bili-Signature-Method': 'HMAC-SHA256',
      'X-Bili-Signature-Nonce': nonce,
      'X-Bili-Signature-Version': '2.0',
      'X-Bili-Timestamp': timestamp,
    };

    const signaturePayload = [
      `x-bili-accesskeyid:${headers['X-Bili-AccessKeyId']}`,
      `x-bili-content-md5:${headers['X-Bili-Content-Md5']}`,
      `x-bili-signature-method:${headers['X-Bili-Signature-Method']}`,
      `x-bili-signature-nonce:${headers['X-Bili-Signature-Nonce']}`,
      `x-bili-signature-version:${headers['X-Bili-Signature-Version']}`,
      `x-bili-timestamp:${headers['X-Bili-Timestamp']}`,
    ].join('\n');

    return {
      ...headers,
      Authorization: createHmac('sha256', clientSecret).update(signaturePayload).digest('hex'),
    };
  }

  private pickOauthResponseData(payload: Record<string, unknown>) {
    const data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return payload;
  }

  private readOauthObject(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    throw new ConflictException(`OAuth 返回缺少对象字段：${keys.join('/')}`);
  }

  private readOauthField(
    payload: Record<string, unknown>,
    keys: string[],
    required = true,
  ) {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }

    if (required) {
      throw new ConflictException(`OAuth 返回缺少字段：${keys.join('/')}`);
    }
    return '';
  }

  private resolveOauthErrorMessage(payload: Record<string, unknown>, fallback: string) {
    const candidates = [
      payload.message,
      payload.description,
      payload.error_description,
      payload.msg,
      payload.error_msg,
      payload.errmsg,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return fallback;
  }

  private assertOauthPayloadSuccess(payload: Record<string, unknown>, fallback: string) {
    const code = this.readOauthStatusCode(payload, ['code', 'errcode']);
    if (code !== null && code !== 0) {
      throw new ConflictException(this.resolveOauthErrorMessage(payload, fallback));
    }
  }

  private readOauthStatusCode(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private async ensureLeadContentAssetsPersisted(content: LeadContentWithRelations) {
    const persistedAssets = await this.persistLeadContentAssets(content.creatorId, {
      coverImage: content.coverImage,
      images: content.images,
      videoUrl: content.videoUrl,
    });

    if (
      content.coverImage === persistedAssets.coverImage &&
      content.videoUrl === persistedAssets.videoUrl &&
      this.areStringArraysEqual(content.images, persistedAssets.images)
    ) {
      return content;
    }

    return this.prisma.leadContent.update({
      where: { id: content.id },
      data: {
        coverImage: persistedAssets.coverImage,
        images: persistedAssets.images,
        videoUrl: persistedAssets.videoUrl,
      },
      include: leadContentInclude,
    });
  }

  private async persistLeadContentAssets(
    userId: string,
    input: {
      coverImage: string | null;
      images: string[];
      videoUrl: string | null;
    },
  ) {
    const cache = new Map<string, Promise<string>>();
    const persistUrl = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return Promise.resolve('');
      }

      if (this.productImageStorageService.isManagedPublicUrl(trimmed)) {
        return Promise.resolve(trimmed);
      }

      const existing = cache.get(trimmed);
      if (existing) {
        return existing;
      }

      const nextPromise = this.productImageStorageService
        .mirrorRemoteAsset(userId, trimmed)
        .then((asset) => asset.url);
      cache.set(trimmed, nextPromise);
      return nextPromise;
    };

    const images = (
      await Promise.all(
        (input.images ?? []).map(async (item) => {
          const persisted = await persistUrl(item);
          return persisted.trim();
        }),
      )
    ).filter(Boolean);

    const explicitCoverImage = await persistUrl(input.coverImage);
    const videoUrl = await persistUrl(input.videoUrl);

    return {
      coverImage: explicitCoverImage || images[0] || null,
      images,
      videoUrl: videoUrl || null,
    };
  }

  private areStringArraysEqual(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => item === right[index]);
  }

  private serializePlatformAccount(item: LeadPlatformAccountWithRelations) {
    const loginSourceLabel =
      item.provider === 'mcp'
        ? 'MCP 渠道'
        : item.provider === 'official_oauth'
          ? '官方授权'
          : '本地扩展';
    const avatarUrl = this.extractExternalAvatarUrl(item.externalMeta);
    const followerCount = this.extractExternalFollowerCount(item.externalMeta);
    const keepAliveStatus = this.extractExternalKeepAliveStatus(item.externalMeta);
    const keepAliveError = this.extractExternalKeepAliveError(item.externalMeta);
    const keepAliveAt = this.extractExternalKeepAliveAt(item.externalMeta);
    const reauthRequired = this.extractExternalReauthRequired(item.externalMeta);
    return {
      id: item.id,
      creatorId: item.creatorId,
      creatorName: item.creator.displayName,
      platform: item.platform,
      provider: item.provider,
      authType: item.authType,
      accountName: item.accountName,
      displayName: item.displayName,
      avatarUrl,
      followerCount,
      authPayloadPreview: item.authPayloadPreview,
      loginStatus: item.loginStatus,
      loginUrl: item.loginUrl,
      externalAccountId: item.externalAccountId,
      externalGroupId: item.externalGroupId,
      loginSourceLabel,
      status: item.status,
      remark: item.remark,
      lastLoginStartedAt: item.lastLoginStartedAt?.toISOString() ?? null,
      lastLoginCompletedAt: item.lastLoginCompletedAt?.toISOString() ?? null,
      lastValidatedAt: item.lastValidatedAt?.toISOString() ?? null,
      lastError: item.lastError,
      keepAliveStatus,
      keepAliveError,
      keepAliveAt,
      reauthRequired,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private extractExternalAvatarUrl(value: unknown) {
    return (
      this.readFirstStringFromPaths(value, [
        ['avatarUrl'],
        ['avatar_url'],
        ['avatar'],
        ['headimgurl'],
        ['headImgUrl'],
        ['head_url'],
        ['profile', 'avatarUrl'],
        ['profile', 'avatar_url'],
        ['profile', 'avatar'],
        ['profile', 'face'],
        ['profile', 'headimgurl'],
        ['data', 'avatarUrl'],
        ['data', 'avatar'],
        ['user', 'avatarUrl'],
        ['user', 'avatar'],
      ]) || null
    );
  }

  private extractExternalFollowerCount(value: unknown) {
    return this.readFirstNumberFromPaths(value, [
      ['followerCount'],
      ['followers'],
      ['fans'],
      ['fansCount'],
      ['fans_count'],
      ['follower_count'],
      ['profile', 'followerCount'],
      ['profile', 'followers'],
      ['profile', 'fans'],
      ['profile', 'fansCount'],
    ]);
  }

  private extractExternalProfileId(value: unknown) {
    return (
      this.readFirstStringFromPaths(value, [
        ['profileId'],
        ['profile_id'],
        ['bitbrowserProfileId'],
        ['runtime', 'profileId'],
      ]) || null
    );
  }

  private extractExternalKeepAliveStatus(value: unknown) {
    const found = this.readFirstStringFromPaths(value, [['keepAliveStatus']]);
    return found || null;
  }

  private extractExternalKeepAliveError(value: unknown) {
    const found = this.readFirstStringFromPaths(value, [['keepAliveError']]);
    return found || null;
  }

  private extractExternalKeepAliveAt(value: unknown) {
    const found = this.readFirstStringFromPaths(value, [['keepAliveAt']]);
    return found || null;
  }

  private clearPlatformAccountKeepAliveState(value: unknown) {
    const next =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
    delete next.keepAliveStatus;
    delete next.keepAliveError;
    delete next.reauthRequired;
    return next;
  }

  private isPlatformReauthSourceUrl(
    platform: LeadPublishPlatform,
    sourceUrl: string | null | undefined,
  ) {
    const normalizedSourceUrl = String(sourceUrl || '').trim().toLowerCase();
    if (!normalizedSourceUrl) {
      return false;
    }
    if (platform === LeadPublishPlatform.xiaohongshu) {
      return (
        normalizedSourceUrl.includes('creator.xiaohongshu.com/login') ||
        normalizedSourceUrl.includes('redirectreason=401')
      );
    }
    if (platform === LeadPublishPlatform.douyin) {
      return (
        normalizedSourceUrl.includes('creator.douyin.com/passport') ||
        normalizedSourceUrl.includes('creator.douyin.com/login') ||
        normalizedSourceUrl.includes('creator.douyin.com/auth')
      );
    }
    if (platform === LeadPublishPlatform.wechat_mp) {
      return (
        normalizedSourceUrl.includes('channels.weixin.qq.com/platform/login') ||
        normalizedSourceUrl.includes('channels.weixin.qq.com/login')
      );
    }
    if (platform === LeadPublishPlatform.kuaishou) {
      return (
        normalizedSourceUrl.includes('cp.kuaishou.com/login') ||
        normalizedSourceUrl.includes('passport.kuaishou.com')
      );
    }
    return false;
  }

  private extractExternalReauthRequired(value: unknown) {
    const found = this.readUnknownPath(value, ['reauthRequired']);
    return found === true;
  }

  private readFirstStringFromPaths(value: unknown, paths: string[][]) {
    if (!value) return '';
    for (const path of paths) {
      const found = this.readUnknownPath(value, path);
      if (typeof found === 'string' && found.trim()) {
        return found.trim();
      }
    }
    return '';
  }

  private readFirstNumberFromPaths(value: unknown, paths: string[][]) {
    if (!value) return null;
    for (const path of paths) {
      const found = this.readUnknownPath(value, path);
      if (typeof found === 'number' && Number.isFinite(found)) {
        return found;
      }
      if (typeof found === 'string' && found.trim()) {
        const parsed = Number(found);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private sanitizeExtensionResolvedAccountText(
    platform: LeadPublishPlatform,
    value?: string | null,
  ) {
    const normalized = this.normalizeExtensionIdentityText(platform, value);
    if (!normalized) return null;

    const lowered = normalized.toLowerCase();
    const blockedKeywords: Record<LeadPublishPlatform, string[]> = {
      [LeadPublishPlatform.xiaohongshu]: [
        '小红书',
        'xiaohongshu',
        '创作服务平台',
        '创作中心',
        '发布中心',
        '内容管理',
        '数据中心',
      ],
      [LeadPublishPlatform.douyin]: ['抖音', 'douyin', '创作者平台'],
      [LeadPublishPlatform.wechat_mp]: [
        '视频号',
        '微信视频号',
        '视频号助手',
        '视频号管理',
        'wechat',
        'channels',
      ],
      [LeadPublishPlatform.kuaishou]: ['快手', 'kuaishou', '创作者服务平台'],
      [LeadPublishPlatform.bilibili]: ['哔哩哔哩', 'bilibili'],
      [LeadPublishPlatform.wechat_official]: ['公众号', '微信公众平台', 'mp.weixin'],
    };

    const matchedBlockedKeyword = (blockedKeywords[platform] ?? []).some((keyword) =>
      platform === LeadPublishPlatform.wechat_mp
        ? lowered === keyword.toLowerCase()
        : lowered.includes(keyword.toLowerCase()),
    );
    if (matchedBlockedKeyword) {
      return null;
    }

    return normalized;
  }

  private normalizeExtensionIdentityText(
    platform: LeadPublishPlatform,
    value?: string | null,
  ) {
    const normalized = value?.trim() || '';
    if (!normalized) {
      return '';
    }
    if (platform !== LeadPublishPlatform.wechat_mp) {
      return normalized;
    }
    if (/^(?:微信)?视频号(?:名称|ID|Id)?\s*[:：]/i.test(normalized)) {
      return normalized
        .replace(/^(?:微信)?视频号(?:名称|ID|Id)?\s*[:：]\s*/i, '')
        .trim();
    }
    return normalized;
  }

  private isWeakExtensionIdentityValue(value?: string | null) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return normalized.startsWith('pending_') || normalized.startsWith('auto_');
  }

  private normalizePlatformLoginErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '').trim();
    const normalized = message.toLowerCase();
    if (
      normalized.includes('今日打开窗口次数已达上限') ||
      normalized.includes('打开窗口次数已达上限') ||
      normalized.includes('绐楀彛娆℃暟宸茶揪涓婇檺') ||
      normalized.includes('window open limit') ||
      normalized.includes('open window limit')
    ) {
      return 'BitBrowser 今日打开窗口次数已达上限，请稍后再试或先关闭部分窗口后重试';
    }
    return message || '发起扩展登录失败';
  }

  private getPlatformAccountOpenUrl(platform: LeadPublishPlatform) {
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return 'https://creator.xiaohongshu.com/';
      case LeadPublishPlatform.douyin:
        return 'https://creator.douyin.com/';
      case LeadPublishPlatform.wechat_mp:
        return 'https://channels.weixin.qq.com/platform';
      case LeadPublishPlatform.kuaishou:
        return 'https://cp.kuaishou.com/profile';
      default:
        return this.platformLoginBrowserService.getPlatformLoginUrl(platform);
    }
  }

  private resolveExtensionAccountName(input: {
    platform: LeadPublishPlatform;
    authPayload: string;
    accountName: string | null;
    externalAccountId: string | null;
    displayName: string | null;
  }) {
    const preferredIdentity =
      input.externalAccountId || input.accountName || input.displayName;
    if (preferredIdentity) {
      return preferredIdentity;
    }

    const fingerprint = createHash('sha1').update(input.authPayload).digest('hex').slice(0, 10);
    return `auto_${input.platform}_${fingerprint}`;
  }

  private getValidatedExtensionPublishAuthPayload(job: LeadPublishJobWithRelations) {
    if (!job.platformAccountId || !job.platformAccount) {
      throw new ConflictException('该发布任务未绑定平台账号，请重新发起');
    }

    if (
      job.platformAccount.status !== PlatformAccountStatus.valid ||
      job.platformAccount.loginStatus !== PlatformAccountLoginStatus.authenticated
    ) {
      throw new ConflictException('所选平台账号尚未完成有效登录');
    }

    if (!this.isAutoPublishPlatformSupported(job.platform)) {
      throw new ConflictException('当前阶段仅支持小红书、抖音、视频号、快手自动发布');
    }

    if (job.platformAccount.authType !== PlatformAccountAuthType.cookie) {
      throw new ConflictException('扩展发布仅支持 Cookie 登录态账号，请先重新登录该平台账号');
    }

    const accountAuthPayload = this.decryptAuthPayload(job.platformAccount.authPayloadEncrypted).trim();
    if (!accountAuthPayload || accountAuthPayload === PENDING_LOGIN_PLACEHOLDER) {
      throw new ConflictException('所选平台账号缺少可用 Cookie，请先重新登录后再发布');
    }

    const authValidation = this.validateAuthPayload(
      PlatformAccountAuthType.cookie,
      accountAuthPayload,
    );
    if (authValidation.status !== PlatformAccountStatus.valid) {
      throw new ConflictException(authValidation.lastError ?? '所选平台账号 Cookie 校验未通过');
    }

    return accountAuthPayload;
  }

  private getExtensionAccountCookiePayload(
    account: Pick<LeadPlatformAccountWithRelations, 'externalMeta'> | null | undefined,
  ) {
    const cookiePayload = this.readUnknownPath(account?.externalMeta, ['cookiePayload']);
    return typeof cookiePayload === 'string' && cookiePayload.trim() ? cookiePayload.trim() : null;
  }

  private normalizeExtensionCookiePayload(value: string | undefined) {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return null;
      }
      const normalized = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const cookie = item as Record<string, unknown>;
          const name = String(cookie.name || '').trim();
          const value = String(cookie.value || '').trim();
          if (!name || !value) {
            return null;
          }
          return {
            name,
            value,
            domain: String(cookie.domain || '').trim() || undefined,
            path: String(cookie.path || '/').trim() || '/',
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.httpOnly),
            sameSite: String(cookie.sameSite || '').trim() || undefined,
            expirationDate:
              typeof cookie.expirationDate === 'number' && Number.isFinite(cookie.expirationDate)
                ? cookie.expirationDate
                : undefined,
          };
        })
        .filter(Boolean);
      return normalized.length ? JSON.stringify(normalized) : null;
    } catch {
      return null;
    }
  }

  private readUnknownPath(value: unknown, path: string[]) {
    let current: unknown = value;
    for (const key of path) {
      if (!current || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[key];
    }
    return current ?? null;
  }

  private encryptAuthPayload(value: string) {
    const iv = randomBytes(12);
    const key = this.getPlatformAccountSecretKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decryptAuthPayload(value: string) {
    const [ivBase64, tagBase64, encryptedBase64] = value.split('.');
    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new ConflictException('平台登录信息格式无效');
    }

    const key = this.getPlatformAccountSecretKey();
    const decipher = createDecipheriv(
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
    return createHash('sha256').update(secret).digest();
  }

  private maskAuthPayload(value: string) {
    const compactValue = value.replace(/\s+/g, ' ').trim();
    if (compactValue.length <= 8) {
      return compactValue ? `${compactValue.slice(0, 2)}***` : '***';
    }
    return `${compactValue.slice(0, 4)}***${compactValue.slice(-4)}`;
  }

  private isPendingPlaceholderAccount(item: LeadPlatformAccountWithRelations) {
    return (
      item.loginStatus === PlatformAccountLoginStatus.pending &&
      item.authPayloadPreview === PENDING_LOGIN_PREVIEW
    );
  }

  private validateAuthPayload(
    authType: PlatformAccountAuthType,
    authPayload: string,
  ): {
    status: PlatformAccountStatus;
    lastError: string | null;
  } {
    const value = authPayload.trim();

    if (!value) {
      return {
        status: PlatformAccountStatus.invalid,
        lastError: '登录信息为空',
      };
    }

    if (authType === PlatformAccountAuthType.cookie) {
      const looksLikeCookie = value.includes('=') && value.length >= 20;
      return looksLikeCookie
        ? { status: PlatformAccountStatus.valid, lastError: null }
        : {
            status: PlatformAccountStatus.invalid,
            lastError: 'Cookie 格式校验未通过',
          };
    }

    const looksLikeToken = value.length >= 16;
    return looksLikeToken
      ? { status: PlatformAccountStatus.valid, lastError: null }
      : {
          status: PlatformAccountStatus.invalid,
          lastError: 'Token 长度校验未通过',
        };
  }

  private cleanupExpiredExtensionLoginSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.extensionLoginSessions.entries()) {
      if (session.expiresAt <= now) {
        this.extensionLoginSessions.delete(sessionId);
      }
    }
  }

  private async verifyExtensionLoginToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<ExtensionLoginTokenPayload>(token);
      if (payload.purpose !== EXTENSION_LOGIN_TOKEN_PURPOSE) {
        throw new UnauthorizedException('扩展登录令牌用途无效');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('扩展登录令牌无效或已过期');
    }
  }

  private async verifyExtensionPublishToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<ExtensionPublishTokenPayload>(token);
      if (payload.purpose !== EXTENSION_PUBLISH_TOKEN_PURPOSE) {
        throw new UnauthorizedException('扩展发布令牌用途无效');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('扩展发布令牌无效或已过期');
    }
  }

  private async verifyOfficialOauthState(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<OfficialOauthStatePayload>(token);
      if (payload.purpose !== OFFICIAL_OAUTH_STATE_PURPOSE) {
        throw new UnauthorizedException('官方 OAuth state 用途无效');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('官方 OAuth state 无效或已过期');
    }
  }

  private handlePlatformAccountWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('同平台下已存在同名账号');
    }

    throw error;
  }
}

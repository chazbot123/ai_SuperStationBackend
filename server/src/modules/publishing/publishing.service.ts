import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadContentStatus,
  LeadPublishPlatform,
  LeadPublishMode,
  LeadPublishStatus,
  PlatformAccountAuthType,
  PlatformAccountLoginStatus,
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
import { StartPlatformLoginDto } from './dto/start-platform-login.dto';
import { SyncPublishingContentDto } from './dto/sync-publishing-content.dto';
import { UpdatePlatformAccountDto } from './dto/update-platform-account.dto';
import { PlatformLoginBrowserService } from './platform-login-browser.service';

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
      creatorId: true,
    },
  },
  platformAccount: {
    select: {
      id: true,
      platform: true,
      accountName: true,
      displayName: true,
      browserSessionPath: true,
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
const SUPPORTED_AUTO_PUBLISH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
  LeadPublishPlatform.wechat_mp,
  LeadPublishPlatform.kuaishou,
]);

@Injectable()
export class PublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly productImageStorageService: ProductImageStorageService,
    private readonly platformLoginBrowserService: PlatformLoginBrowserService,
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

    const createdJobs = await this.prisma.$transaction(
      dto.targets.map((target) => {
        const account = platformAccountMap.get(target.platformAccountId.trim());
        if (!account) {
          throw new NotFoundException('所选平台账号不存在');
        }
        const draftPayload = this.buildPublishDraftPayload(
          content,
          target.platform as LeadPublishPlatform,
        );
        return this.prisma.leadPublishJob.create({
          data: {
            leadContentId: content.id,
            createdById: user.userId,
            platform: target.platform as LeadPublishPlatform,
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

    for (const job of createdJobs) {
      await this.executeDraftSave(job.id);
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
    const executed = await this.executeDraftSave(updated.id);
    return this.serializePublishJob(executed);
  }

  async listPlatformAccounts(user: SessionUser, query: ListPlatformAccountsQueryDto) {
    const where: Prisma.LeadPlatformAccountWhereInput = {
      ...(this.isMainCompany(user) ? {} : { creatorId: user.userId }),
      ...(query.platform ? { platform: query.platform as LeadPublishPlatform } : {}),
      ...(query.status ? { status: query.status as PlatformAccountStatus } : {}),
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

  async createPlatformAccount(user: SessionUser, dto: CreatePlatformAccountDto) {
    const accountName = dto.accountName.trim();
    const authPayload = dto.authPayload.trim();
    const displayName = dto.displayName?.trim() || null;
    const remark = dto.remark?.trim() || null;

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
    await this.prisma.leadPlatformAccount.delete({
      where: { id: current.id },
    });
    return { id: current.id };
  }

  async validatePlatformAccount(user: SessionUser, id: string) {
    const current = await this.findAccessiblePlatformAccount(user, id);
    const decryptedPayload = this.decryptAuthPayload(current.authPayloadEncrypted);
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
          lastError: '当前阶段仅支持小红书、抖音、视频号、快手自动发布',
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
      const result = await this.platformLoginBrowserService.publish({
        accountId: current.platformAccount.id,
        sessionPath:
          current.platformAccount.browserSessionPath ||
          this.platformLoginBrowserService.getSessionPath(current.platformAccount.id),
        platform: current.platform,
        jobId: current.id,
        title: current.draftTitle,
        body: current.draftBody,
        tags: current.draftTags,
        images: current.draftImages,
        videoUrl: current.draftVideoUrl,
      });

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

  private async markPlatformAccountAuthExpiredIfNeeded(accountId: string, message: string) {
    const normalized = message.toLowerCase();
    const looksExpired =
      this.isPlatformAuthExpiredMessage(message) ||
      normalized.includes('鐧诲綍') ||
      normalized.includes('cookie') ||
      normalized.includes('login') ||
      normalized.includes('auth');

    if (!looksExpired) {
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
    const hints = ['登录已失效', '仍在登录页', '请完成登录', 'cookie', '账号后台'];
    return hints.some((hint) => normalized.includes(hint.toLowerCase()));
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
      platformAccountId: item.platformAccountId,
      publishMode: item.publishMode,
      status: item.status,
      draftTitle: item.draftTitle,
      draftBody: item.draftBody,
      draftTags: item.draftTags,
      draftImages: item.draftImages,
      draftVideoUrl: item.draftVideoUrl,
      draftUrl: item.draftUrl,
      draftedAt: item.draftedAt?.toISOString() ?? null,
      lastError: item.lastError,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private buildPublishDraftPayload(
    content: LeadContentWithRelations,
    platform: LeadPublishPlatform,
  ) {
    const tags = content.tags.length > 0 ? this.normalizeTags(content.tags) : this.extractTags(content.body);
    return {
      title: content.title.trim(),
      body: this.normalizeDraftBody(content.body, tags, platform),
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
    return {
      id: item.id,
      creatorId: item.creatorId,
      creatorName: item.creator.displayName,
      platform: item.platform,
      authType: item.authType,
      accountName: item.accountName,
      displayName: item.displayName,
      authPayloadPreview: item.authPayloadPreview,
      loginStatus: item.loginStatus,
      loginUrl: item.loginUrl,
      status: item.status,
      remark: item.remark,
      lastLoginStartedAt: item.lastLoginStartedAt?.toISOString() ?? null,
      lastLoginCompletedAt: item.lastLoginCompletedAt?.toISOString() ?? null,
      lastValidatedAt: item.lastValidatedAt?.toISOString() ?? null,
      lastError: item.lastError,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
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

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ProductImageDraft,
  SocialGeneratedPost,
  SocialPostReviewStage,
  VideoDraft,
  VideoDraftStatus,
  VideoDraftSource,
  VideoMainTaskStatus,
  VideoSubTaskStatus,
} from '@prisma/client';
import { SessionUser } from '../auth/auth.types';
import { ProductImageStorageService } from '../products/product-image-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { resolvePublicBucketBaseUrl, rewriteManagedPublicObjectUrl } from '../shared/public-asset-url.util';
import {
  AiModelConfigCacheService,
  type StoredModelConfig,
} from './ai-model-config-cache.service';
import { CreateProductImageDraftDto } from './dto/create-product-image-draft.dto';
import { CreateVideoDraftDto } from './dto/create-video-draft.dto';
import { AiVideoConcatService } from './ai-video-concat.service';
import { AiVideoStorageService } from './ai-video-storage.service';
import { AiVideoTtsCacheService } from './ai-video-tts-cache.service';
import { CreateAvatarVideoTaskDto } from './dto/create-avatar-video.dto';
import { ExpandAvatarVideoScriptDto } from './dto/expand-avatar-video-script.dto';
import { GenerateCopyDto, TextModelConfigInput } from './dto/generate-copy.dto';
import { GenerateImagesDto, ImageModelConfigInput } from './dto/generate-images.dto';
import { GeneratePlatformMetaDto } from './dto/generate-platform-meta.dto';
import { GenerateVideoDto, VideoModelConfigInput } from './dto/generate-video.dto';
import { GenerateSocialPostDto } from './dto/generate-social-post.dto';
import { PromptPolishDto } from './dto/prompt-polish.dto';
import { PolishPromptDto } from './dto/polish-prompt.dto';
import { RecommendBgmDto } from './dto/recommend-bgm.dto';
import { ReviewMaterialDecisionDto } from './dto/review-material-decision.dto';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import {
  getProviderPreset,
  inferProviderKeyByUrl,
  resolveProviderProtocol,
  type ModelType,
  type ProviderKey,
  type ProviderProtocol,
} from './model-provider-presets';
import { TestModelConfigDto } from './dto/test-model-config.dto';
import { UpdateProductImageDraftDto } from './dto/update-product-image-draft.dto';
import { UpdateSocialPostDto } from './dto/update-social-post.dto';
import { UpdateVideoDraftDto } from './dto/update-video-draft.dto';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

type ResolvedModelConfig = {
  enabled: boolean;
  providerKey: ProviderKey;
  protocol: ProviderProtocol;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  apiKey: string;
  modelName: string;
};

type GeneratedCopyPayload = {
  title: string;
  body: string;
  tags: string[];
};

type ReviewMaterialSource = 'social' | 'product' | 'video';
class UpstreamHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly payload?: unknown,
  ) {
    super(message);
  }
}

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private readonly activeAvatarTaskRunners = new Set<string>();
  private readonly activeAvatarSegmentRunners = new Set<string>();
  private readonly viduTaskQueryCache = new Map<
    string,
    {
      expiresAt: number;
      value: {
        status: 'processing' | 'success' | 'failed';
        videoUrl: string | null;
        errorMessage?: string | null;
      };
    }
  >();
  private avatarQueueConnection: IORedis | null = null;
  private avatarQueue: Queue | null = null;
  private avatarWorker: Worker | null = null;
  private readonly avatarQueueName = 'ai-avatar-video';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly modelConfigCache: AiModelConfigCacheService,
    private readonly productImageStorage: ProductImageStorageService,
    private readonly videoStorage: AiVideoStorageService,
    private readonly videoConcat: AiVideoConcatService,
    private readonly videoTtsCache: AiVideoTtsCacheService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim() || 'redis://localhost:6379';
    try {
      this.avatarQueueConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
      });
      await Promise.race([
        this.avatarQueueConnection.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('redis_ping_timeout')), 2000)),
      ]);
      this.avatarQueue = new Queue(this.avatarQueueName, {
        connection: this.avatarQueueConnection,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 200,
        },
      });
      this.avatarWorker = new Worker(
        this.avatarQueueName,
        async (job: Job) => {
          if (job.name === 'avatar.submit') {
            await this.processAvatarSubmitJob(String(job.data?.taskId ?? ''));
            return;
          }
          if (job.name === 'avatar.poll') {
            await this.processAvatarPollJob(String(job.data?.taskId ?? ''));
            return;
          }
          if (job.name === 'avatar.download') {
            await this.processAvatarDownloadJob(String(job.data?.segmentId ?? ''));
            return;
          }
          if (job.name === 'avatar.concat') {
            await this.processAvatarConcatJob(String(job.data?.taskId ?? ''));
            return;
          }
        },
        {
          connection: this.avatarQueueConnection,
          concurrency: 10,
        },
      );
      this.avatarWorker.on('failed', (job, error) => {
        this.logger.warn(`avatar queue job failed: ${job?.name ?? 'unknown'} ${job?.id ?? ''} ${error?.message ?? ''}`);
      });
      this.logger.log(`avatar queue enabled redis=${redisUrl}`);
    } catch (error) {
      this.logger.warn(`avatar queue init failed: ${error instanceof Error ? error.message : String(error)}`);
      await this.onModuleDestroy();
    }
  }

  async onModuleDestroy() {
    try {
      await this.avatarWorker?.close();
    } catch {}
    try {
      await this.avatarQueue?.close();
    } catch {}
    try {
      await this.avatarQueueConnection?.quit();
    } catch {}
    this.avatarWorker = null;
    this.avatarQueue = null;
    this.avatarQueueConnection = null;
  }

  private async enqueueAvatarJob(name: string, data: Record<string, unknown>, options?: JobsOptions) {
    if (!this.avatarQueue) return;
    try {
      await this.avatarQueue.add(name, data, options);
    } catch (error) {
      this.logger.warn(
        `enqueue avatar job failed name=${name} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private enqueueAvatarSubmit(taskId: string, delayMs = 0) {
    if (!taskId) return;
    this.enqueueAvatarJob(
      'avatar.submit',
      { taskId },
      {
        delay: Math.max(0, Math.floor(delayMs)),
      },
    ).catch(() => null);
  }

  private enqueueAvatarPoll(taskId: string, delayMs = 0) {
    if (!taskId) return;
    this.enqueueAvatarJob(
      'avatar.poll',
      { taskId },
      {
        delay: Math.max(0, Math.floor(delayMs)),
      },
    ).catch(() => null);
  }

  private enqueueAvatarConcat(taskId: string, delayMs = 0) {
    if (!taskId) return;
    this.enqueueAvatarJob(
      'avatar.concat',
      { taskId },
      {
        delay: Math.max(0, Math.floor(delayMs)),
        removeOnComplete: true,
        removeOnFail: true,
      },
    ).catch(() => null);
  }

  private enqueueAvatarDownload(segmentId: string, delayMs = 0) {
    if (!segmentId) return;
    this.enqueueAvatarJob(
      'avatar.download',
      { segmentId },
      {
        delay: Math.max(0, Math.floor(delayMs)),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    ).catch(() => null);
  }

  private kickoffAvatarVideoTask(taskId: string) {
    if (!taskId) return;
    if (this.avatarQueue) {
      this.enqueueAvatarSubmit(taskId, 0);
      this.enqueueAvatarPoll(taskId, 1_500);
      return;
    }
    if (this.activeAvatarTaskRunners.has(taskId)) return;
    this.activeAvatarTaskRunners.add(taskId);

    const run = async () => {
      try {
        await this.advanceAvatarVideoTask(taskId);
      } catch (error) {
        this.logger.warn(
          `advanceAvatarVideoTask failed taskId=${taskId} ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        try {
          const latest = await this.prisma.videoMainTask.findUnique({
            where: { id: taskId },
            select: { status: true },
          });
          if (!latest || latest.status !== VideoMainTaskStatus.processing) {
            this.activeAvatarTaskRunners.delete(taskId);
            return;
          }
          setTimeout(run, 2000);
        } catch {
          this.activeAvatarTaskRunners.delete(taskId);
        }
      }
    };

    setTimeout(run, 0);
  }

  private getIntEnv(key: string, fallback: number, min: number, max: number) {
    const rawText = this.configService.get<string>(key);
    const normalized = typeof rawText === 'string' ? rawText.trim() : '';
    const raw = normalized ? Number(normalized) : Number.NaN;
    const value = Number.isFinite(raw) ? Math.floor(raw) : fallback;
    return Math.min(max, Math.max(min, value));
  }

  private getAvatarConcurrencyLimits() {
    const perTask = this.getIntEnv(
      'AI_AVATAR_TASK_CONCURRENCY',
      this.getIntEnv('AI_AVATAR_MAX_CONCURRENT', 3, 1, 6),
      1,
      6,
    );
    const perUser = this.getIntEnv('AI_AVATAR_USER_CONCURRENCY', 3, 1, 10);
    const global = this.getIntEnv('AI_AVATAR_GLOBAL_CONCURRENCY', 12, 1, 100);
    return { perTask, perUser, global };
  }

  private isRetryableUpstream(statusCode: number | null, message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid field')) return false;
    if (normalized.includes('required field')) return false;
    if (normalized.includes('unsupported')) return false;
    if (statusCode === null) return true;
    if (statusCode === 429) return true;
    if (statusCode === 408) return true;
    if (statusCode >= 500) return true;
    return false;
  }

  private shouldStopRetry(statusCode: number | null, message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid field')) return true;
    if (normalized.includes('required field')) return true;
    if (normalized.includes('unsupported')) return true;
    if (statusCode === null) return false;
    if (statusCode === 400) return true;
    if (statusCode === 401) return true;
    if (statusCode === 403) return true;
    if (statusCode === 404) return true;
    if (statusCode === 422) return true;
    return false;
  }

  private async processAvatarSubmitJob(taskId: string) {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return;
    if (this.activeAvatarTaskRunners.has(normalizedTaskId)) return;
    this.activeAvatarTaskRunners.add(normalizedTaskId);
    try {
      const task = await this.prisma.videoMainTask.findUnique({
        where: { id: normalizedTaskId },
        include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
      });
      if (!task) return;
      if (task.status !== VideoMainTaskStatus.processing) return;

      const baseVideoConfig = await this.getEffectiveModelConfig('video', undefined, task.userId);
      const resolvedConfig = this.resolveAvatarVideoConfig(baseVideoConfig, {
        scriptChars: this.estimateAvatarScriptChars(task.fullScript),
      });
      this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
      this.ensureApiKey('视频模型', resolvedConfig.apiKey);
      this.ensureBaseUrl(resolvedConfig.baseUrl);
      if (resolvedConfig.protocol !== 'vidu_video') {
        await this.prisma.videoMainTask.update({
          where: { id: normalizedTaskId },
          data: { status: VideoMainTaskStatus.failed, errorMessage: '当前视频模型不支持真人口播生成' },
        });
        return;
      }

      const { backgroundPlan, backgroundSeed } = await this.ensureAvatarBackgroundPlan({
        id: task.id,
        userId: task.userId,
        backgroundLock: task.backgroundLock,
        backgroundSeed: task.backgroundSeed,
        backgroundPlan: task.backgroundPlan,
        fullScript: task.fullScript,
        style: task.style ?? null,
      });

      const { perTask, perUser, global } = this.getAvatarConcurrencyLimits();
      const activeCutoff = new Date(Date.now() - 30 * 60 * 1000);
      const activeCount = task.segments.filter(
        (segment) =>
          (segment.status === VideoSubTaskStatus.submitted ||
            segment.status === VideoSubTaskStatus.processing) &&
          segment.updatedAt >= activeCutoff,
      ).length;
      const userActive = await this.prisma.videoSubTask.count({
        where: {
          status: { in: [VideoSubTaskStatus.submitted, VideoSubTaskStatus.processing] },
          updatedAt: { gte: activeCutoff },
          mainTask: { userId: task.userId, status: VideoMainTaskStatus.processing },
        },
      });
      const globalActive = await this.prisma.videoSubTask.count({
        where: {
          status: { in: [VideoSubTaskStatus.submitted, VideoSubTaskStatus.processing] },
          updatedAt: { gte: activeCutoff },
          mainTask: { status: VideoMainTaskStatus.processing },
        },
      });
      const available = Math.max(0, Math.min(perTask - activeCount, perUser - userActive, global - globalActive));
      if (available <= 0) {
        this.enqueueAvatarSubmit(normalizedTaskId, 2_000);
        return;
      }

      const now = new Date();
      const toSubmit = task.segments
        .filter((segment) => {
          if (segment.status === VideoSubTaskStatus.pending) {
            return !segment.retryAt || segment.retryAt <= now;
          }
          if (segment.status === VideoSubTaskStatus.failure) {
            return segment.attempts < segment.maxAttempts && (!segment.retryAt || segment.retryAt <= now);
          }
          return false;
        })
        .slice(0, available);

      await this.mapWithConcurrencyStrict(toSubmit, Math.min(available, 3), async (segment) => {
        const claimed = await this.prisma.videoSubTask.updateMany({
          where: {
            id: segment.id,
            status: segment.status,
            attempts: { lt: segment.maxAttempts },
            OR: [{ retryAt: null }, { retryAt: { lte: now } }],
          },
          data: {
            status: VideoSubTaskStatus.submitted,
            attempts: { increment: 1 },
            viduTaskId: null,
            errorMessage: null,
            retryAt: null,
            lastErrorAt: null,
          },
        });
        if (claimed.count === 0) return;

        try {
          const viduTaskId = await this.submitViduReferenceSegment(resolvedConfig, {
            model: resolvedConfig.modelName,
            prompt: segment.scriptSegment,
            referenceImageUrls: [
              task.characterImageUrl,
              task.productImageUrl,
              task.backgroundImageUrl,
            ].filter((item): item is string => !!item),
            durationSeconds: this.computeAvatarSegmentDurationSeconds({
              modelName: resolvedConfig.modelName,
              segmentText: segment.scriptSegment,
              baseDurationSeconds: task.segmentDurationSeconds ?? 12,
              baseMaxChars: task.segmentMaxChars ?? 60,
            }),
            aspectRatio: (task.aspectRatio as '16:9' | '9:16' | '1:1') ?? '16:9',
            resolution: (task.resolution as '540p' | '720p' | '1080p') ?? '1080p',
            voiceId: (() => {
              const value = (task.voice ?? '').trim();
              if (!value) return null;
              if (value === 'auto') return null;
              if (value.includes('·')) return null;
              return value;
            })(),
            backgroundLock: task.backgroundLock,
            backgroundPlan,
            seed: backgroundSeed,
          });
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              viduTaskId,
              status: VideoSubTaskStatus.submitted,
            },
          });
          this.enqueueAvatarPoll(normalizedTaskId, 2_000);
        } catch (error) {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts + 1;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const statusCode = error instanceof UpstreamHttpError ? error.statusCode : null;
          const message = error instanceof Error ? error.message : '提交任务失败';
          const stopRetry = this.shouldStopRetry(statusCode, message);
          const retryAt =
            !stopRetry && attemptIndex < maxAttempts
              ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex) * (statusCode === 429 ? 3 : 1))
              : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: message,
              retryAt,
              lastErrorAt: new Date(),
              attempts: stopRetry ? maxAttempts : undefined,
            },
          });
        }
      });

      this.enqueueAvatarPoll(normalizedTaskId, 2_000);
      const remainingSegments = await this.prisma.videoSubTask.count({
        where: {
          mainTaskId: normalizedTaskId,
          status: { in: [VideoSubTaskStatus.pending, VideoSubTaskStatus.failure] },
        },
      });
      if (remainingSegments > 0) {
        this.enqueueAvatarSubmit(normalizedTaskId, 3_000);
      }
    } finally {
      this.activeAvatarTaskRunners.delete(normalizedTaskId);
    }
  }

  private async processAvatarPollJob(taskId: string) {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return;
    if (this.activeAvatarTaskRunners.has(normalizedTaskId)) return;
    this.activeAvatarTaskRunners.add(normalizedTaskId);
    try {
      const task = await this.prisma.videoMainTask.findUnique({
        where: { id: normalizedTaskId },
        include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
      });
      if (!task) return;
      if (task.status !== VideoMainTaskStatus.processing) return;

      const baseVideoConfig = await this.getEffectiveModelConfig('video', undefined, task.userId);
      const resolvedConfig = this.resolveAvatarVideoConfig(baseVideoConfig, {
        scriptChars: this.estimateAvatarScriptChars(task.fullScript),
      });
      this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
      this.ensureApiKey('视频模型', resolvedConfig.apiKey);
      this.ensureBaseUrl(resolvedConfig.baseUrl);
      if (resolvedConfig.protocol !== 'vidu_video') {
        await this.prisma.videoMainTask.update({
          where: { id: normalizedTaskId },
          data: { status: VideoMainTaskStatus.failed, errorMessage: '当前视频模型不支持真人口播生成' },
        });
        return;
      }

      const running = task.segments.filter(
        (segment) =>
          segment.viduTaskId &&
          (segment.status === VideoSubTaskStatus.submitted || segment.status === VideoSubTaskStatus.processing),
      );
      const submitTimeoutMs = 2 * 60 * 1000;
      const staleSubmitted = task.segments.filter(
        (segment) =>
          segment.status === VideoSubTaskStatus.submitted &&
          !segment.viduTaskId &&
          Date.now() - segment.updatedAt.getTime() > submitTimeoutMs,
      );
      if (staleSubmitted.length > 0) {
        await this.mapWithConcurrencyStrict(staleSubmitted, 4, async (segment) => {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const retryAt =
            attemptIndex < maxAttempts ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex)) : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: '任务提交超时',
              retryAt,
              lastErrorAt: new Date(),
            },
          });
        });
      }
      const segmentTimeoutMs = 20 * 60 * 1000;
      let hadRetryableQueryError = false;
      await this.mapWithConcurrencyStrict(running, 4, async (segment) => {
        const viduTaskId = segment.viduTaskId;
        if (!viduTaskId) return;

        if (segment.updatedAt && Date.now() - segment.updatedAt.getTime() > segmentTimeoutMs) {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const retryAt =
            attemptIndex < maxAttempts ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex)) : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: '任务处理超时',
              retryAt,
              lastErrorAt: new Date(),
            },
          });
          return;
        }

        try {
          const query = await this.queryViduTask(resolvedConfig, viduTaskId, resolvedConfig.taskQueryUrlTemplate);
          if (query.status === 'processing') {
            if (segment.status !== VideoSubTaskStatus.processing) {
              await this.prisma.videoSubTask.update({
                where: { id: segment.id },
                data: { status: VideoSubTaskStatus.processing },
              });
            }
            return;
          }
          if (query.status === 'failed') {
            const current = await this.prisma.videoSubTask.findUnique({
              where: { id: segment.id },
              select: { attempts: true, maxAttempts: true },
            });
            const attemptIndex = current?.attempts ?? segment.attempts;
            const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
            const message = query.errorMessage?.trim() || '视频片段生成失败';
            const stopRetry = this.shouldStopRetry(400, message);
            const retryAt =
              !stopRetry && attemptIndex < maxAttempts
                ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex))
                : null;
            await this.prisma.videoSubTask.update({
              where: { id: segment.id },
              data: {
                status: VideoSubTaskStatus.failure,
                viduTaskId: null,
                errorMessage: message,
                retryAt,
                lastErrorAt: new Date(),
                attempts: stopRetry ? maxAttempts : undefined,
              },
            });
            return;
          }
          if (!query.videoUrl) {
            const current = await this.prisma.videoSubTask.findUnique({
              where: { id: segment.id },
              select: { attempts: true, maxAttempts: true },
            });
            const attemptIndex = current?.attempts ?? segment.attempts;
            const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
            const retryAt =
              attemptIndex < maxAttempts ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex)) : null;
            await this.prisma.videoSubTask.update({
              where: { id: segment.id },
              data: {
                status: VideoSubTaskStatus.failure,
                viduTaskId: null,
                errorMessage: '视频片段未返回可用地址',
                retryAt,
                lastErrorAt: new Date(),
              },
            });
            return;
          }

          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.processing,
              segmentAudioUrl: query.videoUrl,
              errorMessage: null,
              lastErrorAt: null,
            },
          });
          this.enqueueAvatarDownload(segment.id, 0);
        } catch (error) {
          const statusCode = error instanceof UpstreamHttpError ? error.statusCode : null;
          const message = error instanceof Error ? error.message : '任务查询失败';
          if (!this.isRetryableUpstream(statusCode, message)) {
            const current = await this.prisma.videoSubTask.findUnique({
              where: { id: segment.id },
              select: { attempts: true, maxAttempts: true },
            });
            const attemptIndex = current?.attempts ?? segment.attempts;
            const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
            await this.prisma.videoSubTask.update({
              where: { id: segment.id },
              data: {
                status: VideoSubTaskStatus.failure,
                viduTaskId: null,
                errorMessage: message,
                retryAt: null,
                lastErrorAt: new Date(),
                attempts: maxAttempts,
              },
            });
            return;
          }
          hadRetryableQueryError = true;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              errorMessage: message,
              lastErrorAt: new Date(),
            },
          });
        }
      });

      const latest = await this.prisma.videoMainTask.findUnique({
        where: { id: normalizedTaskId },
        include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
      });
      if (!latest) return;

      const failures = latest.segments.filter((segment) => segment.status === VideoSubTaskStatus.failure);
      const segmentsWaitingDownload = latest.segments.filter(
        (segment) => !!segment.segmentAudioUrl && !segment.segmentVideoUrl,
      );
      if (segmentsWaitingDownload.length > 0) {
        for (const segment of segmentsWaitingDownload) {
          this.enqueueAvatarDownload(segment.id, 0);
        }
      }
      const hasPendingOrRunning = latest.segments.some(
        (segment) =>
          segment.status === VideoSubTaskStatus.pending ||
          segment.status === VideoSubTaskStatus.submitted ||
          segment.status === VideoSubTaskStatus.processing ||
          (!!segment.segmentAudioUrl && !segment.segmentVideoUrl),
      );
      const hasRetriableFailure = failures.some((segment) => segment.attempts < segment.maxAttempts);
      if (failures.length > 0 && !hasPendingOrRunning && !hasRetriableFailure) {
        await this.prisma.videoMainTask.update({
          where: { id: normalizedTaskId },
          data: { status: VideoMainTaskStatus.failed, errorMessage: '存在生成失败的片段任务（已达到最大重试次数）' },
        });
        return;
      }

      const allSegmentsUploaded =
        latest.segments.length > 0 &&
        latest.segments.every((segment) => segment.status === VideoSubTaskStatus.success && segment.segmentVideoUrl);
      if (allSegmentsUploaded && !latest.finalVideoUrl) {
        this.enqueueAvatarConcat(normalizedTaskId, 0);
        return;
      }

      const hasRunning = latest.segments.some(
        (segment) =>
          segment.viduTaskId &&
          (segment.status === VideoSubTaskStatus.submitted || segment.status === VideoSubTaskStatus.processing),
      );
      if (hasRunning || segmentsWaitingDownload.length > 0) {
        this.enqueueAvatarPoll(normalizedTaskId, hadRetryableQueryError ? 10_000 : 3_000);
      }

      const hasReadyToSubmit = latest.segments.some((segment) => {
        if (segment.status === VideoSubTaskStatus.pending) return !segment.retryAt || segment.retryAt <= new Date();
        if (segment.status === VideoSubTaskStatus.failure)
          return segment.attempts < segment.maxAttempts && (!segment.retryAt || segment.retryAt <= new Date());
        return false;
      });
      if (hasReadyToSubmit) {
        this.enqueueAvatarSubmit(normalizedTaskId, 0);
      }
    } finally {
      this.activeAvatarTaskRunners.delete(normalizedTaskId);
    }
  }

  private async processAvatarDownloadJob(segmentId: string) {
    const normalizedSegmentId = segmentId.trim();
    if (!normalizedSegmentId) return;
    if (this.activeAvatarSegmentRunners.has(normalizedSegmentId)) return;
    this.activeAvatarSegmentRunners.add(normalizedSegmentId);
    try {
      const segment = await this.prisma.videoSubTask.findUnique({
        where: { id: normalizedSegmentId },
        include: { mainTask: true },
      });
      if (!segment) return;
      if (!segment.mainTask) return;
      if (segment.mainTask.status !== VideoMainTaskStatus.processing) return;
      if (segment.segmentVideoUrl) return;
      const upstreamUrl = (segment.segmentAudioUrl ?? '').trim();
      if (!upstreamUrl) return;

      const safeUrl = this.ensureSafeExternalMediaUrl(upstreamUrl);
      const buffer = await this.downloadBinary(safeUrl);
      const uploaded = await this.videoStorage.uploadVideoObject({
        userId: segment.mainTask.userId,
        taskId: segment.mainTaskId,
        fileName: `segment-${segment.sequenceOrder}.mp4`,
        buffer,
      });
      await this.prisma.videoSubTask.update({
        where: { id: normalizedSegmentId },
        data: {
          status: VideoSubTaskStatus.success,
          segmentVideoUrl: uploaded.url,
          segmentAudioUrl: null,
          errorMessage: null,
        },
      });
      this.enqueueAvatarConcat(segment.mainTaskId, 0);
    } finally {
      this.activeAvatarSegmentRunners.delete(normalizedSegmentId);
    }
  }

  private async processAvatarConcatJob(taskId: string) {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return;
    if (this.activeAvatarTaskRunners.has(normalizedTaskId)) return;
    this.activeAvatarTaskRunners.add(normalizedTaskId);
    try {
      const latest = await this.prisma.videoMainTask.findUnique({
        where: { id: normalizedTaskId },
        include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
      });
      if (!latest) return;
      if (latest.status !== VideoMainTaskStatus.processing) return;
      if (latest.finalVideoUrl) return;

      const failures = latest.segments.filter((segment) => segment.status === VideoSubTaskStatus.failure);
      const hasPendingOrRunning = latest.segments.some(
        (segment) =>
          segment.status === VideoSubTaskStatus.pending ||
          segment.status === VideoSubTaskStatus.submitted ||
          segment.status === VideoSubTaskStatus.processing ||
          (!!segment.segmentAudioUrl && !segment.segmentVideoUrl),
      );
      const hasRetriableFailure = failures.some((segment) => segment.attempts < segment.maxAttempts);
      if (failures.length > 0 && !hasPendingOrRunning && !hasRetriableFailure) {
        await this.prisma.videoMainTask.update({
          where: { id: normalizedTaskId },
          data: { status: VideoMainTaskStatus.failed, errorMessage: '存在生成失败的片段任务（已达到最大重试次数）' },
        });
        return;
      }

      const allSegmentsUploaded =
        latest.segments.length > 0 &&
        latest.segments.every((segment) => segment.status === VideoSubTaskStatus.success && segment.segmentVideoUrl);
      if (!allSegmentsUploaded) return;

      const inputFiles = await this.downloadSegmentsToTempFiles(latest.segments.map((s) => s.segmentVideoUrl as string));
      const segmentDurations = await Promise.all(inputFiles.map((filePath) => this.videoConcat.getVideoDuration(filePath)));
      let merged = await this.videoConcat.concatMp4Files(inputFiles, { transitionSeconds: 0.2 });
      const subtitleCues = this.buildSubtitleCuesForSegments(latest.segments, segmentDurations);
      if (subtitleCues.length > 0) {
        merged = Buffer.from(await this.videoConcat.burnSubtitles({
          videoBuffer: merged,
          cues: subtitleCues,
        }));
      }
      const uploaded = await this.videoStorage.uploadVideoObject({
        userId: latest.userId,
        taskId: latest.id,
        fileName: subtitleCues.length > 0 ? 'final-with-subtitles.mp4' : 'final.mp4',
        buffer: merged,
      });
      await this.prisma.videoMainTask.update({
        where: { id: normalizedTaskId },
        data: {
          status: VideoMainTaskStatus.completed,
          finalVideoUrl: uploaded.url,
        },
      });
    } finally {
      this.activeAvatarTaskRunners.delete(normalizedTaskId);
    }
  }

  async generateCopy(user: SessionUser, dto: GenerateCopyDto) {
    const style = dto.style ?? 'xhs';
    const productName = dto.productName?.trim() || '产品';
    const sellingPoints = dto.sellingPoints?.trim() || '更智能/更高效';
    const audience = dto.audience?.trim() || '泛用户';
    const prompt = dto.prompt?.trim() || '';
    const styleLabel = this.pickStyleLabel(style);
    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig, user.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const system = this.buildGenerateCopySystemPrompt();
      const user = this.buildGenerateCopyUserPrompt({
        styleLabel,
        prompt,
        productName,
        audience,
        sellingPoints,
      });
      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }
      const generated = this.parseGeneratedCopyPayload(content, {
        style,
        productName,
        prompt,
      });

      return {
        title: generated.title,
        body: generated.body,
        tags: generated.tags,
        text: generated.body,
        html: `<h3>${generated.title}</h3><p>${generated.body.split('\n').join('<br/>')}</p>`,
        used: 'text',
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, '文字模型调用失败');
    }
  }

  async polishPrompt(user: SessionUser, dto: PolishPromptDto) {
    const text = dto.text?.trim() || '';
    if (!text) {
      throw new BadRequestException('请输入需要润色的内容');
    }

    const mode = dto.mode ?? 'product_video';
    const platformStyle = dto.platformStyle ?? 'douyin';
    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig, user.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const platformLabel =
        platformStyle === 'xiaohongshu' ? '小红书' : platformStyle === 'wechat_mp' ? '视频号' : '抖音';
      const system =
        '你是一个中文润色与增强助手。只输出润色后的内容，不要解释、不加标题、不使用Markdown、不输出引号。不得编造不存在的信息。必须保留原文中的数字、专有名词、链接、代码片段、变量占位符（例如 {xx}、{{xx}}、[xx]）含义不变。';

      const parseTargetSeconds = (input: string) => {
        const s = input.replace(/\s+/g, '');
        const secMatch = /([0-9]{1,3})秒/.exec(s);
        if (secMatch) {
          const v = Number(secMatch[1]);
          if (Number.isFinite(v)) return Math.max(10, Math.min(120, v));
        }
        const minMatch = /([0-9]{1,2})分钟/.exec(s);
        if (minMatch) {
          const v = Number(minMatch[1]);
          if (Number.isFinite(v)) return Math.max(10, Math.min(120, v * 60));
        }
        return 40;
      };

      const looksLikeRequest = (input: string) => {
        const s = input.trim();
        if (s.length <= 120 && /(生成|写一段|写个|帮我写|来一段|做一个)/.test(s)) return true;
        if (s.length <= 120 && /(口播|文案|脚本)/.test(s) && /([0-9]{1,3}秒|[0-9]{1,2}分钟)/.test(s)) return true;
        return false;
      };

      const user =
        mode === 'avatar_video'
          ? [
              `请将以下“真人口播脚本”润色为更符合${platformLabel}平台风格的成稿。`,
              '要求：不新增事实信息与卖点；可适度调整语序、拆分/合并句子、增加停顿与口语连接词；保留品牌名、产品名、价格、联系方式、活动规则等关键信息；避免夸大与虚构。',
              '口播脚本：',
              text,
            ].join('\n')
          : looksLikeRequest(text)
            ? [
                `请根据以下“用户需求/提示词”，生成一段更符合${platformLabel}平台风格的“产品短视频口播文案”。`,
                `目标时长约 ${parseTargetSeconds(text)} 秒，口语化、短句、节奏清晰，适合主播正对镜头连续讲解。`,
                '要求：不要输出“我来拍个视频/咱们聊xx秒”这类元话术；不要解释过程；不要标题；不要列表符号；只输出一段中文口播稿。',
                '合规：不得编造未提供的规格参数、材质、价格优惠、资质背书、功效承诺；如果用户未提供关键字段，请使用占位符（例如 {品牌}、{型号}、{价格}、{卖点1}、{卖点2}、{下单方式}）。',
                '结构：开场钩子 → 痛点/场景 → 亮点（可用占位符）→ 购买/咨询行动引导。',
                '',
                '用户需求/提示词：',
                text,
              ].join('\n')
          : [
              `请将以下内容整理为更符合${platformLabel}平台风格的“产品短视频口播文案”。`,
              '要求：围绕原文提到的产品与卖点输出；不得编造未提供的规格参数、功效承诺、价格优惠、资质背书；必须保留原文中的品牌名/产品名/数字/联系方式/占位符；短句、口语化、节奏清晰；结尾给出明确行动引导；只输出一段中文口播稿，不要标题，不要 Markdown，不要列表符号。',
              '原文：',
              text,
            ].join('\n');

      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      let next = content.trim();
      if (next.startsWith('```')) {
        next = next
          .replace(/^```[a-zA-Z]*\n?/, '')
          .replace(/```$/, '')
          .trim();
      }

      if (!next) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      return {
        text: next,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, '文字模型调用失败');
    }
  }

  async expandAvatarVideoScript(user: SessionUser, dto: ExpandAvatarVideoScriptDto) {
    const raw = dto.prompt?.trim() || '';
    if (!raw) {
      throw new BadRequestException('请输入提示词');
    }

    const targetSeconds = Math.max(30, Math.min(300, Math.round(dto.targetSeconds)));
    const targetMinutes = Math.max(1, Math.round(targetSeconds / 60));
    const platformStyle = dto.platformStyle ?? 'douyin';
    const platformLabel =
      platformStyle === 'xiaohongshu' ? '小红书' : platformStyle === 'wechat_mp' ? '视频号' : '抖音';
    const scene = dto.scene?.trim() || '';
    const style = dto.style?.trim() || '';
    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig as TextModelConfigInput, user.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    const charsPerSecond = 4;
    const estimatedSeconds = targetSeconds;
    const targetChars = targetSeconds * charsPerSecond;
    const minChars = Math.floor(targetChars * 0.85);
    const maxChars = Math.floor(targetChars * 1.15);

    try {
      const system =
        '你是一个中文真人口播脚本编写助手。只输出脚本文本，不要解释，不要使用Markdown，不要输出标题编号或列表符号。不得编造不存在的信息与承诺。必须保留用户给出的品牌名、产品名、数字、链接、占位符（例如 {xx}、{{xx}}、[xx]）含义不变。';
      const userPrompt = [
        `请为${platformLabel}平台生成一段“真人口播讲解”脚本，目标时长约 ${estimatedSeconds} 秒（约 ${targetMinutes} 分钟）。`,
        `脚本应口语化、节奏清晰、停顿自然，适合一位主播正对镜头连续讲解；不要出现“镜头一/二/三”或分镜描述；不要出现括号舞台提示。`,
        `字数控制在 ${minChars}-${maxChars} 个中文字符左右（不含空格与标点不强制），尽量接近目标时长。`,
        scene ? `内容场景：${scene}` : '',
        style ? `表达风格：${style}` : '',
        '',
        '用户提示词/素材：',
        raw,
      ]
        .filter(Boolean)
        .join('\n');

      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user: userPrompt,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      const text = content.trim().slice(0, 15000);
      if (!text) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      return {
        text,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
        targetSeconds,
      };
    } catch (error) {
      this.rethrowModelError(error, '脚本生成失败');
    }
  }

  async generatePlatformMeta(user: SessionUser, dto: GeneratePlatformMetaDto) {
    const text = dto.text?.trim() || '';
    if (!text) {
      throw new BadRequestException('请输入内容');
    }

    const mode = dto.mode ?? 'product_video';
    const platformStyle = dto.platformStyle ?? 'douyin';
    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig, user.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const platformLabel =
        platformStyle === 'xiaohongshu' ? '小红书' : platformStyle === 'wechat_mp' ? '视频号' : '抖音';
      const system =
        '你是一个中文标题与标签生成助手。只输出JSON，不要解释，不要使用Markdown，不要输出代码块。不得编造不存在的信息或卖点。';
      const user = [
        `平台：${platformLabel}`,
        `内容类型：${mode === 'avatar_video' ? '真人口播视频' : '产品视频'}`,
        '请基于下方内容生成一个贴合平台风格的标题和两个标签。',
        '输出 JSON 格式：{"title":"...","tags":["...","..."]}',
        '要求：title 10-24 个中文字符；tags 两个，每个 2-10 个中文字符，不含#，不要重复；不要出现敏感词；不要编造未提供的信息。',
        '内容：',
        text,
      ].join('\n');

      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      let normalized = content.trim();
      if (normalized.startsWith('```')) {
        normalized = normalized
          .replace(/^```[a-zA-Z]*\n?/, '')
          .replace(/```$/, '')
          .trim();
      }

      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      const candidate = start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
      const parsed = this.parseJsonSafely<{ title?: unknown; tags?: unknown }>(candidate);
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      const tag1 = typeof tags[0] === 'string' ? tags[0].trim() : '';
      const tag2 = typeof tags[1] === 'string' ? tags[1].trim() : '';

      if (!title || !tag1 || !tag2) {
        throw new BadGatewayException('标题/标签生成失败：返回格式不正确');
      }

      return {
        title,
        tags: [tag1, tag2] as [string, string],
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, '文字模型调用失败');
    }
  }

  async generateImages(user: SessionUser, dto: GenerateImagesDto) {
    const prompt = dto.prompt?.trim() || '请生成一组商品营销图片';
    const sizePreset = dto.sizePreset ?? '3_4';
    const resolution = dto.resolution ?? '1k';
    const referenceImages = (dto.referenceImages ?? []).filter(Boolean).slice(0, 3);
    const resolvedConfig = await this.getEffectiveModelConfig('image', dto.modelConfig, user.userId);

    this.ensureModelEnabled('图片模型', resolvedConfig.enabled);
    this.ensureApiKey('图片模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    const urls = await this.generateImagesByProtocol(resolvedConfig, {
      prompt,
      sizePreset,
      resolution,
      referenceImages,
      count: 3,
    });
    const persistedUrls = await this.persistDraftImages(user.userId, urls, 'ai-generated-images');

    return {
      urls: persistedUrls,
      provider: resolvedConfig.providerName,
      model: resolvedConfig.modelName,
    };
  }

  async promptPolish(user: SessionUser, dto: PromptPolishDto) {
    const prompt = dto.prompt.trim();
    if (!prompt) {
      throw new BadRequestException('提示词不能为空');
    }

    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig, user.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const content = await this.generateTextContent(resolvedConfig, {
        system: this.buildPromptPolishSystemPrompt(dto.scene),
        user: this.buildPromptPolishUserPrompt(dto.scene, prompt),
        errorLabel: '提示词润色失败',
      });

      const polishedPrompt = content.trim();
      if (!polishedPrompt) {
        throw new BadGatewayException('提示词润色未返回有效内容');
      }

      return {
        prompt: polishedPrompt,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, '提示词润色失败');
    }
  }

  async generateTextReply(input: {
    system?: string;
    user: string;
    errorLabel?: string;
    userId?: string;
  }) {
    const resolvedConfig = await this.getEffectiveModelConfig('text', undefined, input.userId);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const content = await this.generateTextContent(resolvedConfig, {
        system: input.system,
        user: input.user,
        errorLabel: input.errorLabel ?? '文字模型调用失败',
      });

      const text = content.trim();
      if (!text) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      return {
        text,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, input.errorLabel ?? '文字模型调用失败');
    }
  }

  async generateVideo(user: SessionUser, dto: GenerateVideoDto) {
    try {
      const prompt = dto.prompt?.trim() || '请生成一个简短的产品视频。';
      const ttsText = dto.ttsText?.trim() || '';
      const resolvedConfig = await this.getEffectiveModelConfig('video', dto.modelConfig, user.userId);

    this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
    this.ensureApiKey('视频模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    const referenceImages = (dto.referenceImages ?? [])
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, 6);
    const viduReferenceImages = referenceImages
      .map((item) => item.trim())
      .filter((item) => this.parseDataUrl(item));

    const url =
      resolvedConfig.protocol === 'vidu_video'
        ? `${this.normalizeViduEntV2BaseUrl(resolvedConfig.baseUrl)}/${
            viduReferenceImages.length > 0 ? 'reference2video' : 'text2video'
          }`
        : this.buildRequestUrl(resolvedConfig);

    const rawVoiceId = dto.voiceId?.trim() || '';
    const defaultVoiceId = this.configService.get<string>('VIDU_DEFAULT_VOICE_ID') || 'male-qn-daxuesheng';
    const voiceId = rawVoiceId === 'auto' ? defaultVoiceId : rawVoiceId;
    const audioRequested = !!rawVoiceId;
    const useViduUpstreamAudio = false;

    const headers = this.createJsonHeaders(
      resolvedConfig,
      resolvedConfig.protocol === 'dashscope_video' ? { 'X-DashScope-Async': 'enable' } : undefined,
    );

    const buildViduPayload = (options?: { disableAudio?: boolean; dropVoiceId?: boolean }) => {
      const duration = (() => {
        const desiredRaw = dto.durationSeconds;
        const desired =
          typeof desiredRaw === 'number' && Number.isFinite(desiredRaw) && desiredRaw > 0
            ? Math.round(desiredRaw)
            : 5;
        const model = resolvedConfig.modelName.toLowerCase();
        if (model.includes('viduq3')) return Math.min(16, Math.max(3, desired));
        if (model.includes('viduq2')) return Math.min(10, Math.max(1, desired));
        if (model.includes('vidu2.0')) return 4;
        if (model.includes('viduq1')) return 5;
        return Math.min(10, Math.max(1, desired));
      })();

      const resolution = (() => {
        const raw = dto.resolution;
        const model = resolvedConfig.modelName.toLowerCase();
        if (model.includes('viduq1')) return '1080p';
        if (model.includes('vidu2.0')) return raw === '720p' ? '720p' : '360p';
        if (raw === '1080p' || raw === '720p' || raw === '540p') return raw;
        const seconds = dto.durationSeconds ?? 5;
        return seconds > 5 ? '720p' : '1080p';
      })();

      const enableAudio = useViduUpstreamAudio && !options?.disableAudio && audioRequested;
      const voiceIdEffective = !options?.dropVoiceId && voiceId ? voiceId : null;

      if (viduReferenceImages.length > 0) {
        const body: Record<string, unknown> = {
          model: resolvedConfig.modelName,
          subjects: [
            {
              name: '1',
              images: viduReferenceImages.slice(0, 3),
            },
          ],
          prompt: prompt.slice(0, 5000),
          duration,
          aspect_ratio: dto.aspectRatio ?? '16:9',
          resolution,
        };
        return body;
      }

      const body: Record<string, unknown> = {
        model: resolvedConfig.modelName,
        style: 'general',
        prompt: prompt.slice(0, 5000),
        duration,
        seed: Math.floor(Math.random() * 2147483647),
        aspect_ratio: dto.aspectRatio ?? '16:9',
        resolution,
        movement_amplitude: dto.movementAmplitude ?? 'auto',
        payload: '',
      };
      return body;
    };

    const requestBody =
      resolvedConfig.protocol === 'vidu_video'
        ? buildViduPayload()
        : {
            model: resolvedConfig.modelName,
            input: {
              prompt,
            },
            parameters: {
              resolution: dto.resolution,
            },
          };

    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    let rawText = await response.text();
    let data = this.parseJsonSafely(rawText);

    if (
      !response.ok &&
      resolvedConfig.protocol === 'vidu_video' &&
      useViduUpstreamAudio &&
      response.status === 400
    ) {
      const detail = this.extractErrorMessage(data) ?? '';
      if (detail.toLowerCase().includes('voice')) {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildViduPayload({ dropVoiceId: true })),
        });
        rawText = await response.text();
        data = this.parseJsonSafely(rawText);
      }

      if (!response.ok) {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildViduPayload({ disableAudio: true })),
        });
        rawText = await response.text();
        data = this.parseJsonSafely(rawText);
      }
    }
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('视频生成失败', data, response.status),
      );
    }

    const taskId = this.extractTaskId(data);
    if (!taskId) {
      const urls = this.extractHttpUrls(data);
      if (urls.length > 0) {
        return {
          provider: resolvedConfig.providerName,
          model: resolvedConfig.modelName,
          status: 'success',
          videoUrl: urls[0],
        };
      }
      throw new BadGatewayException('视频生成失败：未返回任务 ID');
    }

    const bgmUrl = dto.bgmUrl?.trim() || '';
    const bgmRequested = !!bgmUrl;

    if (resolvedConfig.protocol === 'vidu_video') {
      const sanitizeSubtitleText = (input: string) =>
        input
          .replace(/\n{3,}/g, '\n\n')
          .replace(/^(平台风格|时长要求|文案要求|节奏要求|画面指引|视频生成要求|成片要求)\s*[:：].*$/gim, '')
          .trim();
      const cleanedText = sanitizeSubtitleText(ttsText || prompt);
      const textForTts = cleanedText.slice(0, 2000);
      const subtitleText = cleanedText.slice(0, 4000);
      await this.videoTtsCache.set(
        taskId,
        {
          voiceId: audioRequested ? voiceId : null,
          text: audioRequested ? textForTts : '',
          subtitleText,
          subtitleEnabled: dto.subtitleEnabled ?? true,
          ttsTaskId: '',
          audioUrl: null,
          bgmUrl: bgmRequested ? bgmUrl : null,
          bgmVolume: typeof dto.bgmVolume === 'number' && Number.isFinite(dto.bgmVolume) ? dto.bgmVolume : 0.25,
          sourceVideoUrl: null,
          finalVideoUrl: null,
          status: 'processing',
          createdAt: new Date().toISOString(),
          userId: user.userId,
        },
        24 * 60 * 60,
      );
    }

      return {
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
        status: 'processing',
        taskId,
      };
    } catch (error) {
      this.rethrowModelError(error, '视频生成请求失败');
    }
  }

  async getVideoTask(user: SessionUser, taskId: string) {
    try {
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId) {
        throw new BadRequestException('任务 ID 不能为空');
      }

    const resolvedConfig = await this.getEffectiveModelConfig('video', undefined, user.userId);
    this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
    this.ensureApiKey('视频模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    const template =
      resolvedConfig.protocol === 'vidu_video'
        ? `${this.normalizeViduEntV2BaseUrl(resolvedConfig.baseUrl)}/tasks/{taskId}/creations`
        : resolvedConfig.taskQueryUrlTemplate?.trim() || '';

    if (!template) {
      throw new BadRequestException('视频模型未配置任务查询地址模板');
    }

    const response = await fetch(this.buildTaskQueryUrl(template, normalizedTaskId), {
      method: 'GET',
      headers: {
        Authorization: this.createJsonHeaders(resolvedConfig).Authorization,
      },
    });
    const data = this.parseJsonSafely(await response.text());

    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('视频任务查询失败', data, response.status),
      );
    }

    const status = this.extractVideoTaskStatus(data);
    const urls = this.extractHttpUrls(data);
    const videoUrl = urls.find((url) => /\.mp4(\?|$)/i.test(url) || url.includes('video')) ?? urls[0];

    const ttsEntry = await this.videoTtsCache.get(normalizedTaskId);
    if (ttsEntry && status === 'success' && videoUrl) {
      if (ttsEntry.status === 'success' && ttsEntry.finalVideoUrl) {
        return {
          taskId: normalizedTaskId,
          provider: resolvedConfig.providerName,
          model: resolvedConfig.modelName,
          status,
          videoUrl: this.rewriteManagedAssetUrl(ttsEntry.finalVideoUrl),
        };
      }

      if (ttsEntry.status === 'failed') {
        throw new BadGatewayException(ttsEntry.errorMessage || '音频合成失败');
      }

      if (!ttsEntry.sourceVideoUrl) {
        await this.videoTtsCache.set(
          normalizedTaskId,
          { ...ttsEntry, sourceVideoUrl: videoUrl, status: 'processing' },
          24 * 60 * 60,
        );
        this.startMuxAudioForVideoTask(normalizedTaskId).catch(() => null);
      }

      return {
        taskId: normalizedTaskId,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
        status: 'processing',
        videoUrl: null,
      };
    }

    if (status === 'failed') {
      const errorMessage = this.extractErrorMessage(data) ?? this.extractDeepErrorMessage(data);
      return {
        taskId: normalizedTaskId,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
        status,
        videoUrl: null,
        errorMessage: errorMessage || null,
      };
    }

      return {
        taskId: normalizedTaskId,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
        status,
        videoUrl: status === 'success' ? this.rewriteManagedAssetUrl(videoUrl ?? null) : null,
      };
    } catch (error) {
      this.rethrowModelError(error, '视频任务查询失败');
    }
  }

  private async startMuxAudioForVideoTask(taskId: string) {
    const entry = await this.videoTtsCache.get(taskId);
    if (!entry) return;
    if (entry.status === 'success' && entry.finalVideoUrl) return;
    if (entry.status === 'failed') return;
    if (!entry.sourceVideoUrl) return;

    try {
      const resolvedConfig = await this.getEffectiveModelConfig('video', undefined, entry.userId);
      this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
      this.ensureApiKey('视频模型', resolvedConfig.apiKey);
      this.ensureBaseUrl(resolvedConfig.baseUrl);
      if (resolvedConfig.protocol !== 'vidu_video') {
        throw new Error('当前视频模型不支持音频合成');
      }

      const videoBuffer = await this.downloadBinary(entry.sourceVideoUrl);

      const text = (entry.text ?? '').trim();
      const voiceId = (entry.voiceId ?? '').trim();
      const voiceRequested = !!text && !!voiceId;
      const subtitleEnabled = entry.subtitleEnabled !== false;
      const subtitleText = (entry.subtitleText ?? entry.text ?? '').trim();

      let ttsTaskId = '';
      let audioUrl: string | null = null;
      let voiceAudioBuffer: Buffer | null = null;
      let voiceAudioExtension: string | undefined;

      if (voiceRequested) {
        const tts = await this.submitViduAudioTts(resolvedConfig, { text, voiceId });
        ttsTaskId = tts.taskId;
        audioUrl = tts.fileUrl || (await this.waitForViduAudioFileUrl(resolvedConfig, tts.taskId));
        if (!audioUrl) {
          throw new Error('配音任务未返回音频地址');
        }
        voiceAudioBuffer = await this.downloadBinary(audioUrl);
        voiceAudioExtension = this.guessAudioExtension(audioUrl);
      }

      const bgmUrl = (entry.bgmUrl ?? '').trim();
      const bgmRequested = !!bgmUrl;
      let bgmAudioBuffer: Buffer | null = null;
      let bgmAudioExtension: string | undefined;

      if (bgmRequested) {
        const safeUrl = this.ensureSafeExternalMediaUrl(bgmUrl);
        bgmAudioBuffer = await this.downloadBinary(safeUrl);
        bgmAudioExtension = this.guessAudioExtension(safeUrl);
      }

      const needsAudioPostProcess = !!voiceAudioBuffer || !!bgmAudioBuffer;
      let finalBuffer = needsAudioPostProcess
        ? await this.videoConcat.muxMp4WithAudioMix({
            videoBuffer,
            voiceAudioBuffer,
            voiceAudioExtension,
            bgmAudioBuffer,
            bgmAudioExtension,
            bgmVolume: typeof entry.bgmVolume === 'number' && Number.isFinite(entry.bgmVolume) ? entry.bgmVolume : 0.25,
          })
        : videoBuffer;

      if (subtitleEnabled && subtitleText) {
        const durationSeconds = await this.videoConcat.getVideoDuration(entry.sourceVideoUrl);
        const cues = this.buildSubtitleCuesForDuration(subtitleText, durationSeconds);
        finalBuffer = Buffer.from(await this.videoConcat.burnSubtitles({
          videoBuffer: finalBuffer,
          cues,
        }));
      }

      const uploaded = await this.videoStorage.uploadVideoObject({
        userId: 'system',
        taskId,
        fileName: subtitleEnabled && subtitleText ? 'final-with-subtitles.mp4' : 'final-with-audio.mp4',
        buffer: finalBuffer,
      });

      await this.videoTtsCache.set(
        taskId,
        {
          ...entry,
          ttsTaskId,
          audioUrl,
          finalVideoUrl: uploaded.url,
          status: 'success',
          errorMessage: null,
        },
        24 * 60 * 60,
      );
    } catch (error) {
      await this.videoTtsCache.set(
        taskId,
        {
          ...entry,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '视频后处理失败',
        },
        24 * 60 * 60,
      );
    }
  }

  private async submitViduAudioTts(config: ResolvedModelConfig, input: { text: string; voiceId: string }) {
    const baseUrl = this.normalizeViduEntV2BaseUrl(config.baseUrl);
    const url = `${baseUrl}/audio-tts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        text: input.text.slice(0, 2000),
        voice_setting_voice_id: input.voiceId,
      }),
    });
    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(this.buildUpstreamErrorMessage('配音生成失败', data, response.status));
    }
    const taskId =
      (typeof (data as any)?.task_id === 'string' ? (data as any).task_id : null) ||
      (typeof (data as any)?.taskId === 'string' ? (data as any).taskId : null) ||
      (typeof (data as any)?.id === 'string' ? (data as any).id : null) ||
      '';
    const fileUrl =
      (typeof (data as any)?.file_url === 'string' ? (data as any).file_url : null) ||
      (typeof (data as any)?.fileUrl === 'string' ? (data as any).fileUrl : null) ||
      '';
    if (!taskId) {
      throw new BadGatewayException('配音生成失败：未返回任务 ID');
    }
    return { taskId, fileUrl: fileUrl || null };
  }

  private async waitForViduAudioFileUrl(config: ResolvedModelConfig, taskId: string) {
    const baseUrl = this.normalizeViduEntV2BaseUrl(config.baseUrl);
    const template = `${baseUrl}/tasks/{taskId}/creations`;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i += 1) {
      const response = await fetch(this.buildTaskQueryUrl(template, taskId), {
        method: 'GET',
        headers: {
          Authorization: this.createJsonHeaders(config).Authorization,
        },
      });
      const data = this.parseJsonSafely(await response.text());
      if (!response.ok) {
        throw new BadGatewayException(this.buildUpstreamErrorMessage('配音任务查询失败', data, response.status));
      }
      const status = this.extractVideoTaskStatus(data);
      if (status === 'failed') {
        throw new BadGatewayException('配音生成失败');
      }
      const urls = this.extractHttpUrls(data);
      const audioUrl =
        urls.find((url) => /\.(mp3|wav|m4a|aac)(\?|$)/i.test(url) || url.includes('audio')) ?? null;
      if (audioUrl) return audioUrl;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new BadGatewayException('配音生成超时');
  }

  private guessAudioExtension(url: string) {
    const match = /\.(mp3|wav|m4a|aac)(\?|$)/i.exec(url);
    return match?.[1]?.toLowerCase() || 'mp3';
  }

  private buildSubtitleCuesForDuration(text: string, durationSeconds: number, startOffset = 0) {
    const normalizedText = this.normalizeSubtitleText(text);
    if (!normalizedText || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return [] as Array<{ startSeconds: number; endSeconds: number; text: string }>;
    }

    const chunks = this.splitSubtitleText(
      normalizedText,
      this.resolveSubtitleChunkMaxChars(durationSeconds, normalizedText),
    );
    if (chunks.length === 0) {
      return [] as Array<{ startSeconds: number; endSeconds: number; text: string }>;
    }

    const weights = chunks.map((chunk) => this.estimateSubtitleWeight(chunk));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || chunks.length;
    const cues: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
    let cursor = startOffset;
    const totalEnd = startOffset + durationSeconds;

    for (let index = 0; index < chunks.length; index += 1) {
      const remainingDuration = totalEnd - cursor;
      if (remainingDuration <= 0.02) {
        break;
      }
      const remainingCount = chunks.length - index;
      const rawSlice = (durationSeconds * weights[index]) / totalWeight;
      const minSlice = Math.min(0.8, Math.max(0.28, durationSeconds / Math.max(chunks.length * 1.5, 1)));
      const reserveForRest = Math.max(0, remainingCount - 1) * 0.02;
      const maxSlice = Math.max(minSlice, remainingDuration - reserveForRest);
      const slice = index === chunks.length - 1 ? remainingDuration : Math.max(minSlice, Math.min(rawSlice, maxSlice));
      const endSeconds = index === chunks.length - 1 ? totalEnd : Math.min(totalEnd, cursor + slice);
      if (endSeconds <= cursor + 0.02) {
        break;
      }
      cues.push({
        startSeconds: cursor,
        endSeconds,
        text: chunks[index],
      });
      cursor = endSeconds;
    }

    return cues;
  }

  private buildSubtitleCuesForSegments(
    segments: Array<{ scriptSegment: string }>,
    segmentDurations: number[],
  ) {
    const cues: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
    let offset = 0;

    for (let index = 0; index < segments.length; index += 1) {
      const durationSeconds = segmentDurations[index];
      const segmentText = segments[index]?.scriptSegment ?? '';
      const nextCues = this.buildSubtitleCuesForDuration(segmentText, durationSeconds, offset);
      cues.push(...nextCues);
      offset += Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
    }

    return cues;
  }

  private normalizeSubtitleText(text: string) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private resolveSubtitleChunkMaxChars(durationSeconds: number, text: string) {
    const totalChars = this.countSubtitleChars(text);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || totalChars <= 0) {
      return 20;
    }

    if (durationSeconds <= 6) {
      return 30;
    }
    if (durationSeconds <= 10) {
      return 26;
    }

    const targetChunkCount = Math.max(2, Math.round(durationSeconds / 1.8));
    return Math.max(20, Math.min(32, Math.ceil(totalChars / targetChunkCount)));
  }

  private splitSubtitleText(text: string, maxChars = 20) {
    const blocks = text
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const parts: string[] = [];
    for (const block of blocks) {
      const sentences = block
        .split(/(?<=[。！？!?；;，,])/)
        .map((item) => item.trim())
        .filter(Boolean);
      const source = sentences.length > 0 ? sentences : [block];
      for (const sentence of source) {
        if (this.countSubtitleChars(sentence) <= maxChars) {
          parts.push(sentence);
          continue;
        }
        let cursor = '';
        for (const char of sentence) {
          cursor += char;
          if (this.countSubtitleChars(cursor) >= maxChars) {
            parts.push(cursor.trim());
            cursor = '';
          }
        }
        if (cursor.trim()) {
          parts.push(cursor.trim());
        }
      }
    }
    return this.mergeSubtitleParts(parts.filter(Boolean), maxChars);
  }

  private mergeSubtitleParts(parts: string[], maxChars: number) {
    if (parts.length <= 1) {
      return parts;
    }

    const merged: string[] = [];
    for (const part of parts) {
      const current = part.trim();
      if (!current) {
        continue;
      }
      const previous = merged[merged.length - 1];
      if (!previous) {
        merged.push(current);
        continue;
      }

      const combined = `${previous}${current}`;
      const previousChars = this.countSubtitleChars(previous);
      const currentChars = this.countSubtitleChars(current);
      const combinedChars = this.countSubtitleChars(combined);
      const shouldMerge =
        combinedChars <= maxChars &&
        (previousChars <= Math.ceil(maxChars * 0.45) || currentChars <= Math.ceil(maxChars * 0.45));

      if (shouldMerge) {
        merged[merged.length - 1] = combined;
        continue;
      }
      merged.push(current);
    }

    return merged;
  }

  private countSubtitleChars(text: string) {
    return text.replace(/\s+/g, '').length;
  }

  private estimateSubtitleWeight(text: string) {
    return Math.max(1, this.countSubtitleChars(text));
  }

  private isAllowlistedExternalMediaHost(hostname: string) {
    const raw = this.configService.get<string>('AI_EXTERNAL_MEDIA_ALLOWLIST_HOSTS')?.trim() ?? '';
    if (!raw) return false;
    const allowed = raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(hostname.toLowerCase());
  }

  private ensureSafeExternalMediaUrl(input: string) {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('背景音乐地址仅支持 http/https');
    }

    const hostname = url.hostname.toLowerCase();
    if (!hostname) {
      throw new BadRequestException('背景音乐地址不合法');
    }
    if (this.isAllowlistedExternalMediaHost(hostname)) {
      return url.toString();
    }
    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      throw new BadRequestException('背景音乐地址不合法（不允许 localhost/.local）');
    }
    if (hostname === '0.0.0.0' || hostname === '127.0.0.1' || hostname === '::1') {
      throw new BadRequestException('背景音乐地址不合法（不允许本机回环地址）');
    }

    if (isIP(hostname)) {
      if (hostname.startsWith('10.')) throw new BadRequestException('背景音乐地址不合法（不允许内网 IP）');
      if (hostname.startsWith('192.168.')) throw new BadRequestException('背景音乐地址不合法（不允许内网 IP）');
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) throw new BadRequestException('背景音乐地址不合法（不允许内网 IP）');
      if (hostname.startsWith('169.254.')) throw new BadRequestException('背景音乐地址不合法（不允许链路本地 IP）');
    }

    return url.toString();
  }

  async recommendBgm(user: SessionUser, dto: RecommendBgmDto) {
    const text = dto.text?.trim() || '';
    if (!text) {
      throw new BadRequestException('请输入文案内容');
    }

    const platformStyle = dto.platformStyle === 'xiaohongshu' || dto.platformStyle === 'wechat_mp' ? dto.platformStyle : 'douyin';
    const platformLabel =
      platformStyle === 'xiaohongshu' ? '小红书' : platformStyle === 'wechat_mp' ? '视频号' : '抖音';
    const mode = dto.mode === 'avatar_video' ? 'avatar_video' : 'product_video';

    const library = this.buildBgmLibrary();
    if (library.length === 0) {
      throw new BadRequestException('未配置 BGM 曲库');
    }

    const resolvedConfig = await (async () => {
      try {
        return await this.getEffectiveModelConfig('text', dto.modelConfig, user.userId);
      } catch {
        return null;
      }
    })();

    if (!resolvedConfig || !resolvedConfig.enabled || !resolvedConfig.apiKey.trim() || !resolvedConfig.baseUrl.trim()) {
      return this.fallbackPickBgm({ text, platformStyle, library });
    }

    const system =
      '你是一个中文短视频背景音乐匹配助手。只输出JSON，不要解释，不要使用Markdown，不要输出代码块。不得编造不存在的曲目。';
    const userPrompt = [
      `平台：${platformLabel}`,
      `内容类型：${mode === 'avatar_video' ? '真人口播视频' : '产品视频'}`,
      dto.scene?.trim() ? `场景：${dto.scene.trim()}` : '',
      dto.style?.trim() ? `风格：${dto.style.trim()}` : '',
      '请从曲库中选出“最匹配当前文案氛围与节奏”的一首背景音乐，并给出建议音量（0-1）。',
      '输出 JSON 格式：{"id":"曲目ID","volume":0.25}',
      '文案：',
      text,
      '',
      '曲库：',
      JSON.stringify(
        library.map((item) => ({ id: item.id, title: item.title, tags: item.tags })),
      ),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
      this.ensureApiKey('文字模型', resolvedConfig.apiKey);
      this.ensureBaseUrl(resolvedConfig.baseUrl);

      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user: userPrompt,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      const parsed = this.parseJsonSafely<{ id?: string; volume?: number }>(content);
      const pickedId = (parsed?.id ?? '').trim();
      const picked = library.find((item) => item.id === pickedId) ?? null;
      if (!picked) {
        return this.fallbackPickBgm({ text, platformStyle, library });
      }

      const volume = (() => {
        const raw = Number(parsed?.volume);
        if (!Number.isFinite(raw)) return 0.25;
        return Math.min(1, Math.max(0, raw));
      })();

      let safeUrl = '';
      try {
        safeUrl = this.ensureSafeExternalMediaUrl(picked.url);
      } catch {
        throw new BadRequestException(
          '背景音乐地址不合法：请配置 AI_BGM_PUBLIC_BASE_URL / AI_BGM_LIBRARY_JSON 为可公网访问地址，或将域名加入 AI_EXTERNAL_MEDIA_ALLOWLIST_HOSTS',
        );
      }
      return {
        id: picked.id,
        title: picked.title,
        url: safeUrl,
        volume,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof BadGatewayException) {
        return this.fallbackPickBgm({ text, platformStyle, library });
      }
      this.rethrowModelError(error, '文字模型调用失败');
    }
  }

  private buildBgmLibrary() {
    const json = this.configService.get<string>('AI_BGM_LIBRARY_JSON')?.trim() ?? '';
    const itemsFromJson = (() => {
      if (!json) return null;
      const parsed = this.parseJsonSafely<any>(json);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .map((raw) => ({
          id: String(raw?.id ?? '').trim(),
          title: String(raw?.title ?? '').trim(),
          url: String(raw?.url ?? '').trim(),
          tags: Array.isArray(raw?.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
        }))
        .filter((item) => item.id && item.title && item.url);
    })();
    if (itemsFromJson && itemsFromJson.length > 0) {
      return itemsFromJson;
    }

    const base = this.getBgmPublicBaseUrl();
    if (!base) return [];
    const join = (path: string) =>
      `${base.replace(/\/+$/, '')}/${path
        .split('/')
        .filter(Boolean)
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;

    return [
      {
        id: 'bgm_pop_bright_01',
        title: '明亮流行',
        url: join('bgm/pop/bright-01.mp3'),
        tags: ['轻快', '明亮', '产品展示', '节奏感'],
      },
      {
        id: 'bgm_ecom_dynamic_01',
        title: '电商动感',
        url: join('bgm/ecom/dynamic-01.mp3'),
        tags: ['动感', '快节奏', '转化', '抖音'],
      },
      {
        id: 'bgm_lifestyle_warm_01',
        title: '生活方式·温暖',
        url: join('bgm/lifestyle/warm-01.mp3'),
        tags: ['温暖', '治愈', '日常', '小红书'],
      },
      {
        id: 'bgm_brand_trust_01',
        title: '品牌可信',
        url: join('bgm/brand/trust-01.mp3'),
        tags: ['稳重', '可信', '信息密度', '视频号'],
      },
      {
        id: 'bgm_tech_clean_01',
        title: '科技简洁',
        url: join('bgm/tech/clean-01.mp3'),
        tags: ['科技', '简洁', '专业', '产品讲解'],
      },
      {
        id: 'bgm_minimal_neutral_01',
        title: '极简中性',
        url: join('bgm/minimal/neutral-01.mp3'),
        tags: ['中性', '不抢口播', '通用', '配音友好'],
      },
    ];
  }

  private getBgmPublicBaseUrl() {
    const explicit = this.configService.get<string>('AI_BGM_PUBLIC_BASE_URL')?.trim();
    if (explicit) return explicit;
    const bucket = this.configService.get<string>('MINIO_BUCKET') ?? 'ai-superweb';
    return resolvePublicBucketBaseUrl({
      bucketName: bucket,
      fileBaseUrl: this.configService.get<string>('FILE_BASE_URL'),
      minioPublicBaseUrl: this.configService.get<string>('MINIO_PUBLIC_BASE_URL'),
      endpoint: this.configService.get<string>('MINIO_ENDPOINT'),
      port: Number(this.configService.get<string>('MINIO_PORT') ?? '9000'),
      useSSL: String(this.configService.get<string>('MINIO_USE_SSL') ?? 'false') === 'true',
    });
  }

  private rewriteManagedAssetUrl(url?: string | null) {
    return rewriteManagedPublicObjectUrl(
      {
        bucketName: this.configService.get<string>('MINIO_BUCKET') ?? 'ai-superweb',
        fileBaseUrl: this.configService.get<string>('FILE_BASE_URL'),
        minioPublicBaseUrl: this.configService.get<string>('MINIO_PUBLIC_BASE_URL'),
        endpoint: this.configService.get<string>('MINIO_ENDPOINT'),
        port: Number(this.configService.get<string>('MINIO_PORT') ?? '9000'),
        useSSL: String(this.configService.get<string>('MINIO_USE_SSL') ?? 'false') === 'true',
      },
      url,
    );
  }

  private fallbackPickBgm(input: {
    text: string;
    platformStyle: 'douyin' | 'xiaohongshu' | 'wechat_mp';
    library: Array<{ id: string; title: string; url: string; tags: string[] }>;
  }) {
    const text = input.text.toLowerCase();
    const score = (item: { tags: string[] }) =>
      item.tags.reduce((acc, t) => (text.includes(String(t).toLowerCase()) ? acc + 2 : acc), 0);
    const platformBoost = (item: { tags: string[] }) =>
      input.platformStyle === 'douyin'
        ? item.tags.includes('抖音')
          ? 3
          : 0
        : input.platformStyle === 'xiaohongshu'
          ? item.tags.includes('小红书')
            ? 3
            : 0
          : item.tags.includes('视频号')
            ? 3
            : 0;

    const ranked = input.library
      .map((item) => ({ item, s: score(item) + platformBoost(item) }))
      .sort((a, b) => b.s - a.s);
    const picked = ranked[0]?.item ?? input.library[0];
    let safeUrl = '';
    try {
      safeUrl = this.ensureSafeExternalMediaUrl(picked.url);
    } catch {
      throw new BadRequestException(
        '背景音乐地址不合法：请配置 AI_BGM_PUBLIC_BASE_URL / AI_BGM_LIBRARY_JSON 为可公网访问地址，或将域名加入 AI_EXTERNAL_MEDIA_ALLOWLIST_HOSTS',
      );
    }
    return { id: picked.id, title: picked.title, url: safeUrl, volume: 0.25, provider: 'fallback', model: 'fallback' };
  }

  async createAvatarVideoTask(user: SessionUser, dto: CreateAvatarVideoTaskDto) {
    try {
      const fullScript = String(dto?.fullScript ?? '').trim();
      if (!fullScript) {
        throw new BadRequestException('请输入口播脚本');
      }

      const referenceImageDataUrl = String(dto?.referenceImageDataUrl ?? '').trim();
      if (!referenceImageDataUrl) {
        throw new BadRequestException('请上传人物参考图');
      }
      if (!this.parseDataUrl(referenceImageDataUrl)) {
        throw new BadRequestException('人物参考图格式不正确');
      }

      const referenceImages = (dto.referenceImages ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const productImageUrl =
        referenceImages.length >= 2 ? this.normalizeOptionalReferenceImageInput(referenceImages[1]) : null;
      const backgroundImageUrl =
        referenceImages.length >= 3 ? this.normalizeOptionalReferenceImageInput(referenceImages[2]) : null;

      const segmentDurationSeconds = dto.segmentDurationSeconds ?? 12;
      const segmentMaxChars = dto.segmentMaxChars ?? 60;
      const aspectRatio = dto.aspectRatio ?? '16:9';

      this.logger.log(
        `createAvatarVideoTask userId=${user.userId} scriptChars=${fullScript.length} imageChars=${referenceImageDataUrl.length} segmentDurationSeconds=${segmentDurationSeconds} segmentMaxChars=${segmentMaxChars}`,
      );

      const baseVideoConfig = await this.getEffectiveModelConfig('video', undefined, user.userId);
      const resolvedConfig = this.resolveAvatarVideoConfig(baseVideoConfig, {
        scriptChars: this.estimateAvatarScriptChars(fullScript),
      });
      this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
      this.ensureApiKey('视频模型', resolvedConfig.apiKey);
      this.ensureBaseUrl(resolvedConfig.baseUrl);

      if (resolvedConfig.protocol !== 'vidu_video') {
        throw new BadRequestException('真人口播视频生成当前仅支持 Vidu 视频模型');
      }

      const model = resolvedConfig.modelName.toLowerCase();
      const normalizedSegmentDurationSeconds = this.normalizeViduDurationSeconds(
        resolvedConfig.modelName,
        segmentDurationSeconds,
      );
      const normalizedSegmentMaxChars = this.normalizeAvatarSegmentMaxChars({
        modelName: resolvedConfig.modelName,
        baseDurationSeconds: segmentDurationSeconds,
        baseMaxChars: segmentMaxChars,
      });
      const resolution = (() => {
        if (model.includes('viduq1')) return '1080p';
        if (model.includes('vidu2.0')) return '720p';
        return dto.resolution ?? '1080p';
      })();

      const segments = this.splitScript(fullScript, normalizedSegmentMaxChars);
      if (segments.length === 0) {
        throw new BadRequestException('脚本拆分失败，请检查输入内容');
      }

      this.logger.log(
        `createAvatarVideoTask prepared userId=${user.userId} segmentCount=${segments.length} aspectRatio=${aspectRatio} resolution=${resolution} model=${resolvedConfig.modelName} segmentDurationSeconds=${normalizedSegmentDurationSeconds} segmentMaxChars=${normalizedSegmentMaxChars}`,
      );

      const backgroundLock = !!dto.backgroundLock;
      const backgroundSeed = backgroundLock ? Math.floor(Math.random() * 1_000_000_000) : null;

      const created = await this.prisma.videoMainTask.create({
        data: {
          userId: user.userId,
          characterImageUrl: referenceImageDataUrl,
          productImageUrl,
          backgroundImageUrl,
          fullScript,
          voice: dto.voiceId?.trim() || dto.voice?.trim() || null,
          style: dto.style?.trim() || null,
          aspectRatio,
          resolution,
          segmentDurationSeconds: normalizedSegmentDurationSeconds,
          segmentMaxChars: normalizedSegmentMaxChars,
          backgroundLock,
          backgroundSeed,
          backgroundPlan: null,
          status: VideoMainTaskStatus.processing,
          segments: {
            create: segments.map((segment, index) => ({
              scriptSegment: segment,
              sequenceOrder: index,
              status: VideoSubTaskStatus.pending,
            })),
          },
        },
        include: {
          segments: true,
        },
      });

      this.kickoffAvatarVideoTask(created.id);

      return {
        taskId: created.id,
        status: created.status,
        segmentCount: created.segments.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) {
        throw error;
      }
      if (error instanceof Error) {
        this.logger.error(`createAvatarVideoTask failed: ${error.message}`, error.stack);
        throw new InternalServerErrorException(`真人口播任务创建失败：${error.message}`);
      }
      this.logger.error('createAvatarVideoTask failed: unknown error');
      throw new InternalServerErrorException('真人口播任务创建失败');
    }
  }

  async getAvatarVideoTask(user: SessionUser, id: string) {
    const taskId = id.trim();
    if (!taskId) {
      throw new BadRequestException('任务 ID 不能为空');
    }

    const task = await this.prisma.videoMainTask.findUnique({
      where: { id: taskId },
      include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (!this.isMainCompany(user) && task.userId !== user.userId) {
      throw new ForbiddenException('无权限访问该任务');
    }

    if (task.status === VideoMainTaskStatus.processing) {
      this.kickoffAvatarVideoTask(task.id);
    }

    const finishedCount = task.segments.filter((segment) => segment.status === VideoSubTaskStatus.success).length;
    const failedCount = task.segments.filter((segment) => segment.status === VideoSubTaskStatus.failure).length;

    return {
      taskId: task.id,
      status: task.status,
      segmentCount: task.segments.length,
      finishedCount,
      failedCount,
      characterImageUrl: this.rewriteManagedAssetUrl(task.characterImageUrl),
      fullScript: task.fullScript,
      finalVideoUrl: this.rewriteManagedAssetUrl(task.finalVideoUrl),
      errorMessage: task.errorMessage ?? null,
      segments: task.segments.map((segment) => ({
        id: segment.id,
        sequenceOrder: segment.sequenceOrder,
        scriptSegment: segment.scriptSegment,
        status: segment.status,
        attempts: segment.attempts,
        maxAttempts: segment.maxAttempts,
        retryAt: segment.retryAt ? segment.retryAt.toISOString() : null,
        segmentVideoUrl: this.rewriteManagedAssetUrl(segment.segmentVideoUrl),
        errorMessage: segment.errorMessage ?? null,
      })),
    };
  }

  async retryAvatarVideoTask(user: SessionUser, id: string) {
    const taskId = id.trim();
    if (!taskId) {
      throw new BadRequestException('任务 ID 不能为空');
    }

    const task = await this.prisma.videoMainTask.findUnique({
      where: { id: taskId },
      include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (!this.isMainCompany(user) && task.userId !== user.userId) {
      throw new ForbiddenException('无权限访问该任务');
    }

    if (task.status === VideoMainTaskStatus.completed) {
      return this.getAvatarVideoTask(user, taskId);
    }

    const resetResult = await this.prisma.videoSubTask.updateMany({
      where: {
        mainTaskId: taskId,
        status: VideoSubTaskStatus.failure,
      },
      data: {
        status: VideoSubTaskStatus.pending,
        viduTaskId: null,
        segmentVideoUrl: null,
        segmentAudioUrl: null,
        attempts: 0,
        errorMessage: null,
        retryAt: null,
        lastErrorAt: null,
      },
    });

    await this.prisma.videoMainTask.update({
      where: { id: taskId },
      data: {
        status: VideoMainTaskStatus.processing,
        errorMessage: null,
      },
    });

    this.kickoffAvatarVideoTask(taskId);

    return {
      taskId,
      resetCount: resetResult.count,
    };
  }

  private splitScript(fullScript: string, maxChars: number) {
    const cleaned = fullScript
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');

    const parts = cleaned
      .split(/(?<=[。！？!?\.\n])\s*/g)
      .map((item) => item.trim())
      .filter(Boolean);

    const out: string[] = [];
    let buffer = '';

    for (const part of parts) {
      const next = buffer ? `${buffer}${part}` : part;
      if (next.length <= maxChars) {
        buffer = next;
        continue;
      }
      if (buffer) {
        out.push(buffer);
        if (part.length <= maxChars) {
          buffer = part;
          continue;
        }
        for (let i = 0; i < part.length; i += maxChars) {
          const chunk = part.slice(i, i + maxChars).trim();
          if (!chunk) continue;
          if (chunk.length <= maxChars && i + maxChars < part.length) {
            out.push(chunk);
          } else {
            buffer = chunk;
          }
        }
        continue;
      }
      for (let i = 0; i < part.length; i += maxChars) {
        out.push(part.slice(i, i + maxChars));
      }
      buffer = '';
    }

    if (buffer) {
      out.push(buffer);
    }

    return this.rebalanceAvatarSegments(
      out.map((item) => item.trim()).filter(Boolean),
      maxChars,
    );
  }

  private rebalanceAvatarSegments(segments: string[], maxChars: number) {
    const cleaned = segments.map((item) => item.trim()).filter(Boolean);
    if (cleaned.length <= 1) {
      return cleaned;
    }

    const softMaxChars = Math.max(maxChars, Math.round(maxChars * 1.4));
    const minPreferredChars = Math.max(8, Math.round(maxChars * 0.45));
    const merged: string[] = [];

    for (const segment of cleaned) {
      const current = segment.trim();
      if (!current) continue;

      const prev = merged[merged.length - 1];
      if (prev && (current.length < minPreferredChars || prev.length < minPreferredChars)) {
        const combined = `${prev}${current}`.trim();
        if (combined.length <= softMaxChars) {
          merged[merged.length - 1] = combined;
          continue;
        }
      }

      merged.push(current);
    }

    return merged;
  }

  private async advanceAvatarVideoTask(taskId: string) {
    const task = await this.prisma.videoMainTask.findUnique({
      where: { id: taskId },
      include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!task) return;
    if (task.status !== VideoMainTaskStatus.processing) return;

    const baseVideoConfig = await this.getEffectiveModelConfig('video', undefined, task.userId);
    const resolvedConfig = this.resolveAvatarVideoConfig(baseVideoConfig, {
      scriptChars: this.estimateAvatarScriptChars(task.fullScript),
    });
    this.ensureModelEnabled('视频模型', resolvedConfig.enabled);
    this.ensureApiKey('视频模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);
    if (resolvedConfig.protocol !== 'vidu_video') {
      await this.prisma.videoMainTask.update({
        where: { id: taskId },
        data: {
          status: VideoMainTaskStatus.failed,
          errorMessage: '当前视频模型不支持真人口播生成',
        },
      });
      return;
    }

    const { backgroundPlan, backgroundSeed } = await this.ensureAvatarBackgroundPlan({
      id: task.id,
      userId: task.userId,
      backgroundLock: task.backgroundLock,
      backgroundSeed: task.backgroundSeed,
      backgroundPlan: task.backgroundPlan,
      fullScript: task.fullScript,
      style: task.style ?? null,
    });

    const activeCount = task.segments.filter(
      (segment) =>
        segment.status === VideoSubTaskStatus.submitted ||
        segment.status === VideoSubTaskStatus.processing,
    ).length;
    const { perTask, perUser, global } = this.getAvatarConcurrencyLimits();
    const userActive = await this.prisma.videoSubTask.count({
      where: {
        status: { in: [VideoSubTaskStatus.submitted, VideoSubTaskStatus.processing] },
        mainTask: { userId: task.userId },
      },
    });
    const globalActive = await this.prisma.videoSubTask.count({
      where: { status: { in: [VideoSubTaskStatus.submitted, VideoSubTaskStatus.processing] } },
    });
    const maxConcurrent = perTask;
    const now = new Date();
    const available = Math.max(0, Math.min(maxConcurrent - activeCount, perUser - userActive, global - globalActive));

    const toSubmit = task.segments
      .filter((segment) => {
        if (segment.status === VideoSubTaskStatus.pending) {
          return !segment.retryAt || segment.retryAt <= now;
        }
        if (segment.status === VideoSubTaskStatus.failure) {
          return segment.attempts < segment.maxAttempts && (!segment.retryAt || segment.retryAt <= now);
        }
        return false;
      })
      .slice(0, available);

    await Promise.allSettled(
      toSubmit.map(async (segment) => {
        const claimed = await this.prisma.videoSubTask.updateMany({
          where: {
            id: segment.id,
            status: segment.status,
            attempts: { lt: segment.maxAttempts },
            OR: [{ retryAt: null }, { retryAt: { lte: now } }],
          },
          data: {
            status: VideoSubTaskStatus.submitted,
            attempts: { increment: 1 },
            viduTaskId: null,
            errorMessage: null,
            retryAt: null,
            lastErrorAt: null,
          },
        });
        if (claimed.count === 0) return;

        try {
          const viduTaskId = await this.submitViduReferenceSegment(resolvedConfig, {
            model: resolvedConfig.modelName,
            prompt: segment.scriptSegment,
            referenceImageUrls: [
              task.characterImageUrl,
              task.productImageUrl,
              task.backgroundImageUrl,
            ].filter((item): item is string => !!item),
            durationSeconds: this.computeAvatarSegmentDurationSeconds({
              modelName: resolvedConfig.modelName,
              segmentText: segment.scriptSegment,
              baseDurationSeconds: task.segmentDurationSeconds ?? 12,
              baseMaxChars: task.segmentMaxChars ?? 60,
            }),
            aspectRatio: (task.aspectRatio as '16:9' | '9:16' | '1:1') ?? '16:9',
            resolution: (task.resolution as '540p' | '720p' | '1080p') ?? '1080p',
            voiceId: (() => {
              const value = (task.voice ?? '').trim();
              if (!value) return null;
              if (value === 'auto') return null;
              if (value.includes('·')) return null;
              return value;
            })(),
            backgroundLock: task.backgroundLock,
            backgroundPlan,
            seed: backgroundSeed,
          });
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              viduTaskId,
              status: VideoSubTaskStatus.submitted,
            },
          });
        } catch (error) {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts + 1;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const statusCode = error instanceof UpstreamHttpError ? error.statusCode : null;
          const message = error instanceof Error ? error.message : '提交任务失败';
          const stopRetry = this.shouldStopRetry(statusCode, message);
          const retryAt =
            !stopRetry && attemptIndex < maxAttempts
              ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex) * (statusCode === 429 ? 3 : 1))
              : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: message,
              retryAt,
              lastErrorAt: new Date(),
              attempts: stopRetry ? maxAttempts : undefined,
            },
          });
        }
      }),
    );

    const running = task.segments.filter(
      (segment) =>
        segment.viduTaskId &&
        (segment.status === VideoSubTaskStatus.submitted ||
          segment.status === VideoSubTaskStatus.processing),
    );
    const segmentTimeoutMs = 20 * 60 * 1000;
    await this.mapWithConcurrency(running, Math.min(maxConcurrent, 4), async (segment) => {
      const viduTaskId = segment.viduTaskId;
      if (!viduTaskId) return;
      try {
        if (segment.updatedAt && Date.now() - segment.updatedAt.getTime() > segmentTimeoutMs) {
          const retryAt =
            segment.attempts < segment.maxAttempts
              ? new Date(Date.now() + this.computeRetryDelayMs(segment.attempts))
              : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: '任务处理超时',
              retryAt,
              lastErrorAt: new Date(),
            },
          });
          return;
        }

        const query = await this.queryViduTask(resolvedConfig, viduTaskId, resolvedConfig.taskQueryUrlTemplate);
        if (query.status === 'processing') {
          if (segment.status !== VideoSubTaskStatus.processing) {
            await this.prisma.videoSubTask.update({
              where: { id: segment.id },
              data: { status: VideoSubTaskStatus.processing },
            });
          }
          return;
        }
        if (query.status === 'failed') {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const message = query.errorMessage?.trim() || '视频片段生成失败';
          const stopRetry = this.shouldStopRetry(400, message);
          const retryAt =
            !stopRetry && attemptIndex < maxAttempts ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex)) : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: message,
              retryAt,
              lastErrorAt: new Date(),
              attempts: stopRetry ? maxAttempts : undefined,
            },
          });
          return;
        }
        if (!query.videoUrl) {
          const current = await this.prisma.videoSubTask.findUnique({
            where: { id: segment.id },
            select: { attempts: true, maxAttempts: true },
          });
          const attemptIndex = current?.attempts ?? segment.attempts;
          const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
          const retryAt =
            attemptIndex < maxAttempts ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex)) : null;
          await this.prisma.videoSubTask.update({
            where: { id: segment.id },
            data: {
              status: VideoSubTaskStatus.failure,
              viduTaskId: null,
              errorMessage: '视频片段未返回可用地址',
              retryAt,
              lastErrorAt: new Date(),
            },
          });
          return;
        }

        await this.prisma.videoSubTask.update({
          where: { id: segment.id },
          data: {
            status: VideoSubTaskStatus.success,
            segmentVideoUrl: query.videoUrl,
          },
        });
      } catch (error) {
        const current = await this.prisma.videoSubTask.findUnique({
          where: { id: segment.id },
          select: { attempts: true, maxAttempts: true },
        });
        const attemptIndex = current?.attempts ?? segment.attempts;
        const maxAttempts = current?.maxAttempts ?? segment.maxAttempts;
        const statusCode = error instanceof UpstreamHttpError ? error.statusCode : null;
        const message = error instanceof Error ? error.message : '任务查询失败';
        const stopRetry = this.shouldStopRetry(statusCode, message);
        const retryAt =
          !stopRetry && attemptIndex < maxAttempts
            ? new Date(Date.now() + this.computeRetryDelayMs(attemptIndex) * (statusCode === 429 ? 3 : 1))
            : null;
        await this.prisma.videoSubTask.update({
          where: { id: segment.id },
          data: {
            status: VideoSubTaskStatus.failure,
            viduTaskId: null,
            errorMessage: message,
            retryAt,
            lastErrorAt: new Date(),
            attempts: stopRetry ? maxAttempts : undefined,
          },
        });
      }
    });

    const latest = await this.prisma.videoMainTask.findUnique({
      where: { id: taskId },
      include: { segments: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!latest) return;

    const failures = latest.segments.filter((segment) => segment.status === VideoSubTaskStatus.failure);
    const hasPendingOrRunning = latest.segments.some(
      (segment) =>
        segment.status === VideoSubTaskStatus.pending ||
        segment.status === VideoSubTaskStatus.submitted ||
        segment.status === VideoSubTaskStatus.processing,
    );
    const hasRetriableFailure = failures.some((segment) => segment.attempts < segment.maxAttempts);
    if (failures.length > 0 && !hasPendingOrRunning && !hasRetriableFailure) {
      await this.prisma.videoMainTask.update({
        where: { id: taskId },
        data: { status: VideoMainTaskStatus.failed, errorMessage: '存在生成失败的片段任务（已达到最大重试次数）' },
      });
      return;
    }

    const allSuccess =
      latest.segments.length > 0 &&
      latest.segments.every((segment) => segment.status === VideoSubTaskStatus.success && segment.segmentVideoUrl);
    if (!allSuccess) return;

    if (!latest.finalVideoUrl) {
      const inputFiles = await this.downloadSegmentsToTempFiles(latest.segments.map((s) => s.segmentVideoUrl as string));
      const merged = await this.videoConcat.concatMp4Files(inputFiles, { transitionSeconds: 0.2 });
      const uploaded = await this.videoStorage.uploadVideoObject({
        userId: latest.userId,
        taskId: latest.id,
        fileName: 'final.mp4',
        buffer: merged,
      });

      await this.prisma.videoMainTask.update({
        where: { id: taskId },
        data: {
          status: VideoMainTaskStatus.completed,
          finalVideoUrl: uploaded.url,
        },
      });
    }
  }

  private computeRetryDelayMs(attemptIndex: number) {
    if (attemptIndex <= 1) return 5_000;
    if (attemptIndex === 2) return 15_000;
    if (attemptIndex === 3) return 45_000;
    return 90_000;
  }

  private computeStableSeed(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 1_000_000_000;
  }

  private fallbackAvatarBackgroundPlan(input: { style: string | null; fullScript: string }) {
    const style = (input.style ?? '').trim();
    const text = input.fullScript.toLowerCase();
    const platform =
      style.includes('抖音') ? 'douyin' : style.includes('小红书') ? 'xiaohongshu' : style.includes('视频号') ? 'wechat' : '';
    const productHint =
      text.includes('手表') || text.includes('腕表') ? 'watch product demo' : text.includes('护肤') ? 'skincare demo' : '';
    const palette =
      platform === 'xiaohongshu'
        ? 'clean bright neutral tones'
        : platform === 'douyin'
          ? 'high-contrast cool tones'
          : 'neutral soft light';
    const location = productHint.includes('watch') ? 'modern watch showroom / live demo desk' : 'clean indoor studio / live demo desk';
    return [
      `- Location/Backdrop: ${location}`,
      `- Lighting/Palette: ${palette}, soft key light, gentle fill`,
      `- Camera: fixed tripod, medium shot, shallow background blur, no scene cuts`,
      `- Props: simple display desk only, keep background uncluttered`,
      `- No-go: no text posters, no logos, no background changes, no outdoor scenes`,
    ].join('\n');
  }

  private async ensureAvatarBackgroundPlan(task: {
    id: string;
    userId: string;
    backgroundLock: boolean;
    backgroundSeed: number | null;
    backgroundPlan: string | null;
    fullScript: string;
    style: string | null;
  }) {
    if (!task.backgroundLock) {
      return { backgroundPlan: null as string | null, backgroundSeed: null as number | null };
    }

    const backgroundSeed =
      typeof task.backgroundSeed === 'number' && Number.isFinite(task.backgroundSeed)
        ? Math.max(0, Math.round(task.backgroundSeed))
        : this.computeStableSeed(task.id);
    const existing = (task.backgroundPlan ?? '').trim();
    if (existing) {
      if (task.backgroundSeed == null) {
        await this.prisma.videoMainTask.updateMany({
          where: { id: task.id, backgroundSeed: null },
          data: { backgroundSeed },
        });
      }
      return { backgroundPlan: existing, backgroundSeed };
    }

    let plan = '';
    try {
      const textConfig = await this.getEffectiveModelConfig('text', undefined, task.userId);
      if (textConfig.enabled && textConfig.baseUrl.trim() && textConfig.apiKey.trim()) {
        const scriptSnippet = task.fullScript.trim().slice(0, 2400);
        const styleHint = (task.style ?? '').trim();
        plan = await this.generateTextContent(textConfig, {
          system:
            'You are a video art director. Create one fixed background plan for a multi-segment Chinese talking-head sales video. Output plain English bullet points (5 lines max). Keep it consistent across all segments. No brand logos or background text.',
          user: [
            styleHint ? `Style hint: ${styleHint}` : '',
            'Constraints:',
            '- Single person talking to camera',
            '- Background must stay the same for the whole video',
            '- No scene changes, no posters, no visible text',
            '',
            'Script (Chinese, excerpt):',
            scriptSnippet,
          ]
            .filter(Boolean)
            .join('\n'),
          errorLabel: '背景方案生成失败',
        });
      }
    } catch (error) {
      this.logger.warn(`avatar background plan generate failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    plan = (plan || '').trim();
    if (!plan) {
      plan = this.fallbackAvatarBackgroundPlan({ style: task.style, fullScript: task.fullScript });
    }
    plan = plan.trim().replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim().slice(0, 1200);

    const updated = await this.prisma.videoMainTask.updateMany({
      where: { id: task.id, backgroundPlan: null },
      data: { backgroundPlan: plan, backgroundSeed },
    });
    if (updated.count === 0) {
      const latest = await this.prisma.videoMainTask.findUnique({
        where: { id: task.id },
        select: { backgroundPlan: true, backgroundSeed: true },
      });
      return {
        backgroundPlan: (latest?.backgroundPlan ?? plan).trim() || plan,
        backgroundSeed: typeof latest?.backgroundSeed === 'number' ? latest.backgroundSeed : backgroundSeed,
      };
    }

    return { backgroundPlan: plan, backgroundSeed };
  }

  private async submitViduReferenceSegment(
    config: ResolvedModelConfig,
    input: {
      model: string;
      prompt: string;
      referenceImageUrls: string[];
      durationSeconds: number;
      aspectRatio: '16:9' | '9:16' | '1:1';
      resolution: '540p' | '720p' | '1080p';
      voiceId?: string | null;
      backgroundLock?: boolean;
      backgroundPlan?: string | null;
      seed?: number | null;
    },
  ) {
    const baseUrl = this.normalizeViduEntV2BaseUrl(config.baseUrl);
    const url = `${baseUrl}/reference2video`;
    const normalizedImages = (input.referenceImageUrls ?? [])
      .map((item) => this.normalizeOptionalReferenceImageInput(item))
      .filter((item): item is string => !!item);
    const characterImage = this.normalizeAvatarReferenceImageInput(normalizedImages[0] ?? '');
    const productImage = normalizedImages[1] ?? null;
    const backgroundImage = normalizedImages[2] ?? null;
    const backgroundPlan = (input.backgroundPlan ?? '').trim();
    const lockBackground = !!input.backgroundLock;
    const prompt = [
      productImage || backgroundImage
        ? 'Generate a portrait video where a single person introduces a product naturally.'
        : 'Generate a talking-head video with a single person facing the camera and speaking naturally.',
      'Use the 1st reference image as the main character. Keep facial features and hairstyle consistent with the 1st reference image.',
      'The person speaks the script below in Chinese. Keep speech clear and natural.',
      productImage ? 'Use the 2nd reference image as the product reference. Keep product appearance consistent with it.' : '',
      backgroundImage ? 'Use the 3rd reference image as the background reference. Keep background style consistent with it.' : '',
      lockBackground
        ? 'Keep the background fixed and consistent across the entire video. Do not change location, lighting, props, or camera angle between segments.'
        : '',
      'Treat every segment as a continuation of the same take. Keep framing, subject size, pose baseline, wardrobe, lighting, and camera height consistent between segments.',
      'Do not introduce hard scene cuts, sudden camera jumps, or noticeable composition changes at the start of a segment.',
      '',
      'Script (Chinese):',
      input.prompt.trim(),
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 5000);
    const voiceId = input.voiceId?.trim() || '';
    const audioRequested = !!voiceId;

    const buildBody = (options?: { dropVoiceId?: boolean; disableAudio?: boolean; dropSeed?: boolean }) => {
      const enableAudio = audioRequested && !options?.disableAudio;
      const voiceIdEffective = !options?.dropVoiceId && voiceId ? voiceId : null;
      const subjectImages = [characterImage, productImage, backgroundImage].filter((item): item is string => !!item);
      const body: Record<string, unknown> = {
        model: input.model,
        subjects: [{ name: '1', images: subjectImages }],
        prompt,
        duration: input.durationSeconds,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
      };
      if (!options?.dropSeed && typeof input.seed === 'number' && Number.isFinite(input.seed)) {
        body.seed = Math.max(0, Math.round(input.seed));
      }
      if (enableAudio) {
        body.audio = true;
        body.audio_type = 'speech_only';
        if (voiceIdEffective) {
          body.voice_id = voiceIdEffective;
        }
      }
      return body;
    };

    const headers = this.createJsonHeaders(config);
    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody()),
    });

    let rawText = await response.text();
    let data = this.parseJsonSafely(rawText);

    if (!response.ok && (response.status === 400 || response.status === 422)) {
      const detail = (this.extractErrorMessage(data) ?? '').toLowerCase();
      if (typeof input.seed === 'number' && (detail.includes('seed') || detail.includes('invalid field'))) {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildBody({ dropSeed: true })),
        });
        rawText = await response.text();
        data = this.parseJsonSafely(rawText);
      }

      if (!response.ok && audioRequested) {
        const nextDetail = (this.extractErrorMessage(data) ?? '').toLowerCase();
        const shouldRetryWithoutVoiceId =
          nextDetail.includes('voice') || nextDetail.includes('audio') || nextDetail.includes('invalid field');
        if (shouldRetryWithoutVoiceId) {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildBody({ dropVoiceId: true })),
          });
          rawText = await response.text();
          data = this.parseJsonSafely(rawText);
        }

        if (!response.ok) {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildBody({ disableAudio: true })),
          });
          rawText = await response.text();
          data = this.parseJsonSafely(rawText);
        }
      }
    }

    if (!response.ok) {
      throw new UpstreamHttpError(
        response.status,
        this.buildUpstreamErrorMessage('视频片段提交失败', data, response.status),
        data,
      );
    }

    const taskId = this.extractTaskId(data);
    if (!taskId) {
      throw new BadGatewayException('视频片段提交失败：未返回任务 ID');
    }
    return taskId;
  }

  private normalizeAvatarReferenceImageInput(value: string) {
    const raw = String(value ?? '').trim();
    if (!raw) {
      throw new BadRequestException('请上传人物参考图');
    }
    if (this.parseDataUrl(raw)) {
      return raw;
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('人物参考图格式不正确');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('人物参考图地址仅支持 http/https 或 data URL');
    }

    const hostname = url.hostname.toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      throw new BadRequestException('旧任务中的人物参考图不可被 Vidu 访问，请重新上传图片后创建新任务');
    }

    if (isIP(hostname)) {
      if (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
        hostname.startsWith('169.254.')
      ) {
        throw new BadRequestException('旧任务中的人物参考图不可被 Vidu 访问，请重新上传图片后创建新任务');
      }
    }

    return url.toString();
  }

  private normalizeOptionalReferenceImageInput(value: string) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (this.parseDataUrl(raw)) return raw;

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('参考图格式不正确');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('参考图地址仅支持 http/https 或 data URL');
    }
    const hostname = url.hostname.toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      throw new BadRequestException('参考图地址不可被 Vidu 访问，请重新上传图片后创建新任务');
    }
    if (isIP(hostname)) {
      if (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
        hostname.startsWith('169.254.')
      ) {
        throw new BadRequestException('参考图地址不可被 Vidu 访问，请重新上传图片后创建新任务');
      }
    }
    return url.toString();
  }

  private normalizeViduDurationSeconds(modelName: string, desiredRaw?: number | null) {
    const desired =
      typeof desiredRaw === 'number' && Number.isFinite(desiredRaw) && desiredRaw > 0
        ? Math.round(desiredRaw)
        : 5;
    const model = String(modelName ?? '').toLowerCase();
    if (model.includes('viduq1')) return 5;
    if (model.includes('vidu2.0')) return 4;
    if (model.includes('viduq2')) return Math.min(10, Math.max(1, desired));
    if (model.includes('viduq3')) return Math.min(16, Math.max(3, desired));
    return Math.min(10, Math.max(1, desired));
  }

  private resolveAvatarVideoConfig(
    config: ResolvedModelConfig,
    context?: {
      scriptChars?: number;
    },
  ) {
    const overrideModelName = this.configService.get<string>('AI_AVATAR_MODEL_NAME')?.trim();
    if (overrideModelName) {
      return {
        ...config,
        modelName: overrideModelName,
      };
    }

    const currentModel = String(config.modelName ?? '').trim();
    if (/viduq3/i.test(currentModel)) {
      const scriptChars = Number.isFinite(context?.scriptChars)
        ? Math.max(0, Math.round(context?.scriptChars ?? 0))
        : 0;
      const fasterModelName = scriptChars >= 110 ? 'ViduQ2' : 'ViduQ1';
      return {
        ...config,
        modelName: fasterModelName,
      };
    }

    return config;
  }

  private normalizeAvatarSegmentMaxChars(input: {
    modelName: string;
    baseDurationSeconds: number;
    baseMaxChars: number;
  }) {
    const safeBaseDuration =
      Number.isFinite(input.baseDurationSeconds) && input.baseDurationSeconds > 0
        ? Math.round(input.baseDurationSeconds)
        : 12;
    const safeBaseMaxChars =
      Number.isFinite(input.baseMaxChars) && input.baseMaxChars > 0 ? Math.round(input.baseMaxChars) : 60;
    const modelName = String(input.modelName ?? '').toLowerCase();
    const baselineCharsPerSecond = safeBaseMaxChars / safeBaseDuration || 5;
    const charsPerSecond = modelName.includes('viduq1')
      ? Math.max(6, Math.min(8, baselineCharsPerSecond + 1.5))
      : Math.max(4, Math.min(7, baselineCharsPerSecond));
    const normalizedDuration = this.normalizeViduDurationSeconds(input.modelName, safeBaseDuration);
    const minChars = modelName.includes('viduq1') ? 30 : 20;
    return Math.max(minChars, Math.min(80, Math.round(normalizedDuration * charsPerSecond)));
  }

  private estimateAvatarScriptChars(text: string) {
    return String(text ?? '')
      .replace(/\s+/g, '')
      .trim().length;
  }

  private computeAvatarSegmentDurationSeconds(input: {
    modelName: string;
    segmentText: string;
    baseDurationSeconds: number;
    baseMaxChars: number;
  }) {
    const baseDurationSeconds = Number.isFinite(input.baseDurationSeconds) ? Math.max(1, Math.round(input.baseDurationSeconds)) : 12;
    const baseMaxChars = Number.isFinite(input.baseMaxChars) ? Math.max(1, Math.round(input.baseMaxChars)) : 60;
    const chars = this.estimateAvatarScriptChars(input.segmentText);
    if (!chars) {
      return this.normalizeViduDurationSeconds(input.modelName, baseDurationSeconds);
    }

    const cps = baseMaxChars / baseDurationSeconds;
    const desired = cps > 0 ? Math.round(chars / cps) : baseDurationSeconds;
    return this.normalizeViduDurationSeconds(input.modelName, desired);
  }

  private async queryViduTask(
    config: ResolvedModelConfig,
    taskId: string,
    template?: string,
  ): Promise<{ status: 'processing' | 'success' | 'failed'; videoUrl: string | null; errorMessage?: string | null }> {
    const taskQueryTemplate = this.resolveViduTaskQueryTemplate(config, template);
    const cacheKey = `${taskQueryTemplate}|${taskId}`;
    const cached = this.viduTaskQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const response = await fetch(this.buildTaskQueryUrl(taskQueryTemplate, taskId), {
      method: 'GET',
      headers: {
        Authorization: this.createJsonHeaders(config).Authorization,
      },
    });
    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new UpstreamHttpError(
        response.status,
        this.buildUpstreamErrorMessage('视频任务查询失败', data, response.status),
        data,
      );
    }

    const status = this.extractVideoTaskStatus(data);
    const urls = this.extractHttpUrls(data);
    const videoUrl = urls.find((url) => /\.mp4(\?|$)/i.test(url)) ?? urls[0] ?? null;
    const errorMessage = status === 'failed' ? this.extractErrorMessage(data) ?? this.extractDeepErrorMessage(data) : null;

    const result = {
      status,
      videoUrl: status === 'success' ? videoUrl : null,
      errorMessage,
    };
    this.viduTaskQueryCache.set(cacheKey, { expiresAt: Date.now() + 2000, value: result });
    if (this.viduTaskQueryCache.size > 2000) {
      this.viduTaskQueryCache.clear();
    }
    return result;
  }

  private async waitForViduImageUrls(
    config: ResolvedModelConfig,
    taskId: string,
    template?: string,
  ): Promise<string[]> {
    const taskQueryTemplate = this.resolveViduTaskQueryTemplate(config, template);
    let lastErrorMessage = '图片模型任务未返回图片';

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await fetch(this.buildTaskQueryUrl(taskQueryTemplate, taskId), {
        method: 'GET',
        headers: {
          Authorization: this.createJsonHeaders(config).Authorization,
        },
      });
      const data = this.parseJsonSafely(await response.text());

      if (!response.ok) {
        const message = this.buildUpstreamErrorMessage('图片任务查询失败', data, response.status);
        if ([400, 401, 403, 404, 422].includes(response.status)) {
          throw new BadGatewayException(message);
        }
        lastErrorMessage = message;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      const status = this.extractVideoTaskStatus(data);
      const urls = this.extractHttpUrls(data).filter((url) => /\.(png|jpe?g|webp)(\?|$)/i.test(url) || url.includes('image'));

      if (status === 'failed') {
        throw new BadGatewayException(
          this.extractErrorMessage(data) ?? this.extractDeepErrorMessage(data) ?? '图片模型生成失败',
        );
      }

      if (status === 'success' && urls.length > 0) {
        return urls;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new BadGatewayException(lastErrorMessage || '图片模型任务未返回图片');
  }

  private async mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
    if (items.length === 0) return;
    const limit = Math.max(1, Math.floor(concurrency));
    let index = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }).map(async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        await worker(items[current]);
      }
    });
    await Promise.allSettled(runners);
  }

  private async mapWithConcurrencyStrict<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    if (items.length === 0) return;
    const limit = Math.max(1, Math.floor(concurrency));
    let index = 0;
    let firstError: unknown = null;
    const runners = Array.from({ length: Math.min(limit, items.length) }).map(async () => {
      while (true) {
        if (firstError) return;
        const current = index;
        index += 1;
        if (current >= items.length) return;
        try {
          await worker(items[current]);
        } catch (error) {
          firstError = error;
          return;
        }
      }
    });
    await Promise.all(runners);
    if (firstError) {
      throw firstError;
    }
  }

  private async downloadBinary(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`下载视频片段失败（${response.status}）`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async downloadSegmentsToTempFiles(urls: string[]) {
    const dir = join(tmpdir(), `ai-superweb-segments-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      const buffer = await this.downloadBinary(url);
      const filePath = join(dir, `seg-${String(i).padStart(4, '0')}.mp4`);
      await writeFile(filePath, buffer);
      files.push(filePath);
    }
    return files;
  }

  async testModelConnection(type: string, dto: TestModelConfigDto) {
    const normalizedType = this.parseModelType(type);
    const resolvedConfig = this.resolveModelConfig(normalizedType, dto);

    this.ensureModelEnabled('模型', resolvedConfig.enabled);
    this.ensureApiKey('模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    if (normalizedType === 'text') {
      return this.testTextModelConnection(resolvedConfig);
    }

    if (normalizedType === 'video') {
      return this.testVideoModelConnection(resolvedConfig);
    }

    return this.testImageModelConnection(resolvedConfig);
  }

  async listActiveModelConfigs(user: SessionUser) {
    return this.modelConfigCache.getAll(user.userId);
  }

  async listSavedModelConfigs(user: SessionUser) {
    return this.modelConfigCache.getAllSaved(user.userId);
  }

  async activateModelConfig(user: SessionUser, type: string, dto: SaveModelConfigDto) {
    const normalizedType = this.parseModelType(type);
    const resolvedConfig = this.resolveModelConfig(normalizedType, dto);

    this.ensureApiKey('模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    await this.modelConfigCache.setSaved(
      user.userId,
      normalizedType,
      resolvedConfig.providerKey,
      this.toStoredModelConfig(resolvedConfig),
    );

    return this.modelConfigCache.set(user.userId, normalizedType, this.toStoredModelConfig(resolvedConfig));
  }

  async listSocialPosts(user: SessionUser) {
    const items = await this.prisma.socialGeneratedPost.findMany({
      where: { creatorId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    const normalizedItems = await Promise.all(
      items.map((item) => this.repairSocialPostImages(user.userId, item)),
    );

    return normalizedItems.map((item) => this.serializeSocialPost(item));
  }

  async listProductImageDrafts(user: SessionUser) {
    const items = await this.prisma.productImageDraft.findMany({
      where: { creatorId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    const normalizedItems = await Promise.all(
      items.map((item) => this.repairProductDraftImages(user.userId, item)),
    );

    return normalizedItems.map((item) => this.serializeProductImageDraft(this.repairMalformedProductDraftCopy(item)));
  }

  async listVideoDrafts(user: SessionUser) {
    const items = await this.prisma.videoDraft.findMany({
      where: { creatorId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeVideoDraft(item));
  }

  async listReviewMaterials(user: SessionUser) {
    this.ensureMainCompanyUser(user, '仅主公司可查看素材审核列表');

    const [socialItems, productItems, videoItems] = await Promise.all([
      this.prisma.socialGeneratedPost.findMany({
        where: { reviewStage: { in: [SocialPostReviewStage.submitted, SocialPostReviewStage.approved] } },
        include: { creator: { select: { displayName: true, username: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.productImageDraft.findMany({
        where: { reviewStage: { in: [SocialPostReviewStage.submitted, SocialPostReviewStage.approved] } },
        include: { creator: { select: { displayName: true, username: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.videoDraft.findMany({
        where: { reviewStage: { in: [SocialPostReviewStage.submitted, SocialPostReviewStage.approved] } },
        include: { creator: { select: { displayName: true, username: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return [
      ...socialItems.map((item) => this.serializeReviewMaterial('social', item)),
      ...productItems.map((item) => this.serializeReviewMaterial('product', item)),
      ...videoItems.map((item) => this.serializeReviewMaterial('video', item)),
    ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  async approveReviewMaterial(user: SessionUser, source: string, id: string) {
    this.ensureMainCompanyUser(user, '仅主公司可审核素材');
    const normalizedSource = this.parseReviewMaterialSource(source);

    if (normalizedSource === 'social') {
      const updated = await this.prisma.socialGeneratedPost.update({
        where: { id },
        data: { reviewStage: SocialPostReviewStage.approved },
        include: { creator: { select: { displayName: true, username: true } } },
      });
      return this.serializeReviewMaterial('social', updated);
    }

    if (normalizedSource === 'product') {
      const updated = await this.prisma.productImageDraft.update({
        where: { id },
        data: { reviewStage: SocialPostReviewStage.approved },
        include: { creator: { select: { displayName: true, username: true } } },
      });
      return this.serializeReviewMaterial('product', updated);
    }

    const updated = await this.prisma.videoDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.approved },
      include: { creator: { select: { displayName: true, username: true } } },
    });
    return this.serializeReviewMaterial('video', updated);
  }

  async rejectReviewMaterial(user: SessionUser, source: string, id: string, _dto: ReviewMaterialDecisionDto) {
    this.ensureMainCompanyUser(user, '仅主公司可审核素材');
    const normalizedSource = this.parseReviewMaterialSource(source);

    if (normalizedSource === 'social') {
      await this.prisma.socialGeneratedPost.update({
        where: { id },
        data: { reviewStage: SocialPostReviewStage.draft },
      });
      return { success: true };
    }

    if (normalizedSource === 'product') {
      await this.prisma.productImageDraft.update({
        where: { id },
        data: { reviewStage: SocialPostReviewStage.draft },
      });
      return { success: true };
    }

    await this.prisma.videoDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.draft },
    });
    return { success: true };
  }

  async generateSocialPost(user: SessionUser, dto: GenerateSocialPostDto) {
    const prompt = dto.prompt?.trim() || '请生成一版适合当前平台风格的社媒图文。';
    const style = dto.style ?? 'xiaohongshu';
    const sizePreset = dto.sizePreset ?? '3_4';
    const resolution = dto.resolution ?? '1k';
    const referenceImages = (dto.referenceImages ?? []).filter(Boolean).slice(0, 3);

    const [copyResult, imageResult] = await Promise.all([
      this.generateCopy(user, {
        prompt,
        style: style === 'xiaohongshu' ? 'xhs' : style,
        format: 'text',
        modelConfig: dto.textModelConfig,
      }),
      this.generateImages(user, {
        prompt,
        sizePreset,
        resolution,
        referenceImages,
        modelConfig: dto.imageModelConfig,
      }),
    ]);

    const created = await this.prisma.socialGeneratedPost.create({
      data: {
        creatorId: user.userId,
        title: copyResult.title,
        prompt,
        body: copyResult.body,
        tags: copyResult.tags,
        style,
        sizePreset,
        resolution,
        images: imageResult.urls,
        reviewStage: this.isMainCompany(user)
          ? SocialPostReviewStage.approved
          : SocialPostReviewStage.draft,
        synced: false,
      },
    });

    return this.serializeSocialPost(created);
  }

  async createProductImageDraft(user: SessionUser, dto: CreateProductImageDraftDto) {
    const prompt = dto.prompt.trim();
    const title = dto.title.trim();
    const body = dto.body.trim();
    const tags = Array.from(new Set((dto.tags ?? []).map((item) => item.trim()).filter(Boolean))).slice(0, 20);
    const images = dto.images.map((item) => item.trim()).filter(Boolean).slice(0, 12);

    if (!title) {
      throw new BadRequestException('标题不能为空');
    }

    if (!body) {
      throw new BadRequestException('文案不能为空');
    }

    const created = await this.prisma.productImageDraft.create({
      data: {
        creatorId: user.userId,
        prompt,
        title,
        body,
        tags,
        images,
        sizePreset: dto.sizePreset,
        resolution: dto.resolution,
        reviewStage: this.isMainCompany(user)
          ? SocialPostReviewStage.approved
          : SocialPostReviewStage.draft,
        syncedToLeads: false,
        syncedToProducts: false,
      },
    });

    return this.serializeProductImageDraft(created);
  }

  async createVideoDraft(user: SessionUser, dto: CreateVideoDraftDto) {
    const prompt = dto.prompt.trim();
    const title = dto.title.trim();
    const durationText = dto.durationText.trim();
    const generatedScript = dto.generatedScript.trim();
    const platformStyle = dto.platformStyle?.trim() || null;
    const publishTitle = dto.publishTitle?.trim() || null;
    const publishTags = Array.from(
      new Set(
        (dto.publishTags ?? [])
          .map((item) => item.trim().replace(/^#+/, ''))
          .filter(Boolean)
          .slice(0, 20),
      ),
    );
    const source = dto.source === 'avatar_video' ? VideoDraftSource.avatar_video : VideoDraftSource.product_video;
    const status =
      dto.status === 'ready'
        ? VideoDraftStatus.ready
        : dto.status === 'failed'
          ? VideoDraftStatus.failed
          : VideoDraftStatus.processing;

    if (!title) {
      throw new BadRequestException('标题不能为空');
    }

    if (!durationText) {
      throw new BadRequestException('时长不能为空');
    }

    if (!generatedScript) {
      throw new BadRequestException('脚本不能为空');
    }

    const created = await this.prisma.videoDraft.create({
      data: {
        creatorId: user.userId,
        prompt,
        source,
        title,
        platformStyle,
        publishTitle,
        publishTags,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
        durationText,
        generatedScript,
        videoUrl: dto.videoUrl?.trim() || '',
        taskId: dto.taskId?.trim() || null,
        provider: dto.provider?.trim() || null,
        model: dto.model?.trim() || null,
        errorMessage: dto.errorMessage?.trim() || null,
        reviewStage: this.isMainCompany(user)
          ? SocialPostReviewStage.approved
          : SocialPostReviewStage.draft,
        status,
        syncedToLeads: false,
      },
    });

    return this.serializeVideoDraft(created);
  }

  private async getEffectiveModelConfig(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & VideoModelConfigInput & TestModelConfigDto>,
    userId?: string | null,
  ) {
    const hasExplicitOverride = !!override && Object.values(override).some((value) => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      return value !== undefined && value !== null;
    });

    if (hasExplicitOverride) {
      return this.resolveModelConfig(type, override);
    }

    const normalizedUserId = userId?.trim();
    if (normalizedUserId) {
      const cached = await this.modelConfigCache.get(normalizedUserId, type);
      if (cached) {
        return this.resolveModelConfig(type, cached);
      }
    }
    return this.resolveModelConfig(type, override);
  }

  private toStoredModelConfig(config: ResolvedModelConfig): StoredModelConfig {
    return {
      enabled: config.enabled,
      providerKey: config.providerKey,
      providerName: config.providerName,
      baseUrl: config.baseUrl,
      taskQueryUrlTemplate: config.taskQueryUrlTemplate,
      apiKey: config.apiKey,
      modelName: config.modelName,
    };
  }

  async submitSocialPost(user: SessionUser, id: string) {
    const existing = await this.findAccessibleSocialPost(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司生成内容无需提审');
    }

    if (existing.reviewStage !== SocialPostReviewStage.draft) {
      throw new ForbiddenException('当前状态不可提审');
    }

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.submitted },
    });

    return this.serializeSocialPost(updated);
  }

  async withdrawSocialPostReview(user: SessionUser, id: string) {
    const existing = await this.findAccessibleSocialPost(user, id);
    this.ensureDraftReviewWithdrawable(user, existing.reviewStage);

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.draft },
    });

    return this.serializeSocialPost(updated);
  }

  async markSocialPostSynced(user: SessionUser, id: string) {
    const existing = await this.findAccessibleSocialPost(user, id);

    if (existing.reviewStage !== SocialPostReviewStage.approved) {
      throw new ForbiddenException('只有审核通过后才能同步到获客');
    }

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: { synced: true },
    });

    return this.serializeSocialPost(updated);
  }

  async updateSocialPost(user: SessionUser, id: string, dto: UpdateSocialPostDto) {
    const existing = await this.findAccessibleSocialPost(user, id);
    const nextPrompt = dto.prompt !== undefined ? dto.prompt.trim() : existing.prompt;
    const nextTitle = dto.title.trim();
    const nextBody = dto.body.trim();
    const nextTags = (dto.tags ?? existing.tags)
      .map((item) => item.trim().replace(/^#+/, ''))
      .filter(Boolean)
      .slice(0, 20);
    const nextImages = (dto.images ?? existing.images).map((item) => item.trim()).filter(Boolean).slice(0, 12);

    if (!nextTitle) {
      throw new BadRequestException('标题不能为空');
    }

    if (!nextBody) {
      throw new BadRequestException('文案不能为空');
    }

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: {
        prompt: nextPrompt,
        title: nextTitle,
        body: nextBody,
        tags: Array.from(new Set(nextTags)),
        images: nextImages,
        synced: false,
        reviewStage:
          existing.reviewStage === SocialPostReviewStage.approved && !this.isMainCompany(user)
            ? SocialPostReviewStage.draft
            : existing.reviewStage,
      },
    });

    return this.serializeSocialPost(updated);
  }

  async removeSocialPost(user: SessionUser, id: string) {
    await this.findAccessibleSocialPost(user, id);
    await this.prisma.socialGeneratedPost.delete({
      where: { id },
    });
    return { success: true };
  }

  async updateProductImageDraft(user: SessionUser, id: string, dto: UpdateProductImageDraftDto) {
    const existing = await this.findAccessibleProductImageDraft(user, id);
    const nextPrompt = dto.prompt !== undefined ? dto.prompt.trim() : existing.prompt;
    const nextTitle = dto.title.trim();
    const nextBody = dto.body.trim();
    const nextTags = (dto.tags ?? existing.tags).map((item) => item.trim()).filter(Boolean).slice(0, 20);
    const nextImages = (dto.images ?? existing.images).map((item) => item.trim()).filter(Boolean).slice(0, 12);

    if (!nextTitle) {
      throw new BadRequestException('标题不能为空');
    }

    if (!nextBody) {
      throw new BadRequestException('文案不能为空');
    }

    const updated = await this.prisma.productImageDraft.update({
      where: { id },
      data: {
        prompt: nextPrompt,
        title: nextTitle,
        body: nextBody,
        tags: Array.from(new Set(nextTags)),
        images: nextImages,
        syncedToLeads: false,
        syncedToProducts: false,
        reviewStage:
          existing.reviewStage === SocialPostReviewStage.approved && !this.isMainCompany(user)
            ? SocialPostReviewStage.draft
            : existing.reviewStage,
      },
    });

    return this.serializeProductImageDraft(updated);
  }

  async removeProductImageDraft(user: SessionUser, id: string) {
    await this.findAccessibleProductImageDraft(user, id);
    await this.prisma.productImageDraft.delete({
      where: { id },
    });
    return { success: true };
  }

  async submitProductImageDraft(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProductImageDraft(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司生成内容无需提审');
    }

    if (existing.reviewStage !== SocialPostReviewStage.draft) {
      throw new ForbiddenException('当前状态不可提审');
    }

    const updated = await this.prisma.productImageDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.submitted },
    });

    return this.serializeProductImageDraft(updated);
  }

  async withdrawProductImageDraftReview(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProductImageDraft(user, id);
    this.ensureDraftReviewWithdrawable(user, existing.reviewStage);

    const updated = await this.prisma.productImageDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.draft },
    });

    return this.serializeProductImageDraft(updated);
  }

  async markProductImageDraftSynced(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProductImageDraft(user, id);

    if (existing.reviewStage !== SocialPostReviewStage.approved) {
      throw new ForbiddenException('只有审核通过后才能同步到获客');
    }

    const updated = await this.prisma.productImageDraft.update({
      where: { id },
      data: { syncedToLeads: true },
    });

    return this.serializeProductImageDraft(updated);
  }

  async markProductImageDraftProductSynced(user: SessionUser, id: string) {
    const existing = await this.findAccessibleProductImageDraft(user, id);

    if (existing.reviewStage !== SocialPostReviewStage.approved) {
      throw new ForbiddenException('只有审核通过后才能同步到产品管理');
    }

    const updated = await this.prisma.productImageDraft.update({
      where: { id },
      data: { syncedToProducts: true },
    });

    return this.serializeProductImageDraft(updated);
  }

  async updateVideoDraft(user: SessionUser, id: string, dto: UpdateVideoDraftDto) {
    const existing = await this.findAccessibleVideoDraft(user, id);
    const nextPrompt = dto.prompt !== undefined ? dto.prompt.trim() : existing.prompt;
    const nextTitle = dto.title?.trim() ?? existing.title;
    const nextDurationText = dto.durationText?.trim() ?? existing.durationText;
    const nextGeneratedScript = dto.generatedScript?.trim() ?? existing.generatedScript;
    const nextPlatformStyle =
      dto.platformStyle !== undefined ? dto.platformStyle.trim() || null : existing.platformStyle;
    const nextPublishTitle =
      dto.publishTitle !== undefined ? dto.publishTitle.trim() || null : existing.publishTitle;
    const nextPublishTags =
      dto.publishTags !== undefined
        ? Array.from(
            new Set(
              dto.publishTags
                .map((item) => item.trim().replace(/^#+/, ''))
                .filter(Boolean)
                .slice(0, 20),
            ),
          )
        : existing.publishTags;

    if (!nextTitle) {
      throw new BadRequestException('标题不能为空');
    }

    if (!nextDurationText) {
      throw new BadRequestException('时长不能为空');
    }

    if (!nextGeneratedScript) {
      throw new BadRequestException('脚本不能为空');
    }

    const nextStatus =
      dto.status === undefined
        ? existing.status
        : dto.status === 'ready'
          ? VideoDraftStatus.ready
          : dto.status === 'failed'
            ? VideoDraftStatus.failed
            : VideoDraftStatus.processing;

    const updated = await this.prisma.videoDraft.update({
      where: { id },
      data: {
        prompt: nextPrompt,
        title: nextTitle,
        platformStyle: nextPlatformStyle,
        publishTitle: nextPublishTitle,
        publishTags: nextPublishTags,
        durationText: nextDurationText,
        generatedScript: nextGeneratedScript,
        videoUrl: dto.videoUrl !== undefined ? dto.videoUrl.trim() : existing.videoUrl,
        taskId: dto.taskId !== undefined ? dto.taskId.trim() || null : existing.taskId,
        provider: dto.provider !== undefined ? dto.provider.trim() || null : existing.provider,
        model: dto.model !== undefined ? dto.model.trim() || null : existing.model,
        errorMessage:
          dto.errorMessage !== undefined ? dto.errorMessage.trim() || null : existing.errorMessage,
        status: nextStatus,
        syncedToLeads: dto.syncedToLeads ?? existing.syncedToLeads,
        completedAt: dto.completedAt !== undefined ? new Date(dto.completedAt) : existing.completedAt,
        reviewStage:
          existing.reviewStage === SocialPostReviewStage.approved && !this.isMainCompany(user)
            ? SocialPostReviewStage.draft
            : existing.reviewStage,
      },
    });

    return this.serializeVideoDraft(updated);
  }

  async removeVideoDraft(user: SessionUser, id: string) {
    await this.findAccessibleVideoDraft(user, id);
    await this.prisma.videoDraft.delete({
      where: { id },
    });
    return { success: true };
  }

  async submitVideoDraft(user: SessionUser, id: string) {
    const existing = await this.findAccessibleVideoDraft(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司生成内容无需提审');
    }

    if (existing.reviewStage !== SocialPostReviewStage.draft) {
      throw new ForbiddenException('当前状态不可提审');
    }

    const updated = await this.prisma.videoDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.submitted },
    });

    return this.serializeVideoDraft(updated);
  }

  async withdrawVideoDraftReview(user: SessionUser, id: string) {
    const existing = await this.findAccessibleVideoDraft(user, id);
    this.ensureDraftReviewWithdrawable(user, existing.reviewStage);

    const updated = await this.prisma.videoDraft.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.draft },
    });

    return this.serializeVideoDraft(updated);
  }

  async markVideoDraftSynced(user: SessionUser, id: string) {
    const existing = await this.findAccessibleVideoDraft(user, id);

    if (existing.reviewStage !== SocialPostReviewStage.approved) {
      throw new ForbiddenException('只有审核通过后才能同步到获客');
    }

    const updated = await this.prisma.videoDraft.update({
      where: { id },
      data: { syncedToLeads: true },
    });

    return this.serializeVideoDraft(updated);
  }

  private pickStyleLabel(style: 'xhs' | 'douyin' | 'wechat') {
    if (style === 'douyin') return '抖音风';
    if (style === 'wechat') return '视频号风';
    return '小红书风';
  }

  private ensureDraftReviewWithdrawable(user: SessionUser, reviewStage: SocialPostReviewStage) {
    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司生成内容无需撤销审核');
    }

    if (reviewStage !== SocialPostReviewStage.submitted) {
      throw new ForbiddenException('仅待审核内容可撤销审核');
    }
  }

  private buildPromptPolishSystemPrompt(scene: 'social_post' | 'product_image') {
    const sceneGuide =
      scene === 'social_post'
        ? '你要把用户原始想法润色成更适合社媒图文生成的提示词，强化平台风格、画面主体、情绪氛围、文案语气和封面感。'
        : '你要把用户原始想法润色成更适合商品图与详情图生成的提示词，强化商品主体、卖点表达、构图、材质、光线和详情展示信息。';

    return [
      '你是一名资深中文视觉提示词优化助手。',
      sceneGuide,
      '只返回润色后的提示词正文，不要解释，不要加标题，不要使用代码块。',
      '输出结果必须保留用户原意，但要更清晰、可执行、适合图像生成模型理解。',
    ].join('');
  }

  private buildPromptPolishUserPrompt(scene: 'social_post' | 'product_image', prompt: string) {
    const sceneLabel = scene === 'social_post' ? '社媒图文生成' : '商品图与详情图生成';
    return [`当前场景：${sceneLabel}`, '请直接润色下面这段提示词，并输出可直接继续用于生成的版本：', prompt].join('\n');
  }

  private buildGenerateCopySystemPrompt() {
    return [
      '你是一个擅长写中文互联网风格图文内容的中文内容创作助手。',
      '图文正文要符合中文互联网常见内容表达，口语化、有传播感、有真实分享感，但不要固定写成某一个平台的统一腔调。',
      '输出必须贴合用户输入，不要编造不存在的功能、体验、数据或承诺。',
      '你必须只返回 JSON 对象，不要返回代码块，不要补充解释。',
      'JSON 固定字段为：title、body、tags。',
      'title：一个标题，限制 20 个字符以内；要像中文互联网里常见的高点击内容标题，口语化、有记忆点，但不过度夸张。',
      'body：只生成正文文案，不要包含标题，不要包含任何标签，不要包含额外说明。',
      'body 风格规则：',
      '1. 按中文互联网常见内容节奏写：开头先用反差/痛点/场景切入吸引注意，中间展开真实体验感和核心爆点，结尾轻收口或轻推荐。',
      '2. 多用情绪词和口语化表达，句子尽量短一些，要有真实分享感、聊天感、停顿感。',
      '3. 必须写出明确使用场景、具体感受和核心卖点，不要空泛堆词，不要只罗列参数。',
      '4. 爆点结构优先写“原本顾虑/痛点 -> 上手后的反差 -> 最戳人的结果/感受”。',
      '5. 可参考中文互联网常见内容句式，例如：“真的会想反复回购”“一开始没抱太大希望，结果...”“谁懂这种...”“用了才知道...”；可以借鉴这种语气和节奏，但不要整段机械套模板。',
      '6. 允许根据发布平台微调语气、节奏和标签方向，但不要把正文写成固定的小红书腔、抖音腔或官方宣传腔。',
      'tags：只生成当前平台适用的 #标签，多个标签用单个空格分隔。',
    ].join('');
  }

  private buildGenerateCopyUserPrompt(input: {
    styleLabel: string;
    prompt: string;
    productName: string;
    audience: string;
    sellingPoints: string;
  }) {
    return [
      `请生成一条图文种草内容，发布平台：${input.styleLabel}。`,
      '正文风格请按中文互联网内容表达生成，并结合当前发布平台微调语气、节奏与标签方向，但不要固定套用单一平台腔调。',
      input.prompt ? `补充提示词：${input.prompt}` : '',
      `产品名称：${input.productName}`,
      `目标人群：${input.audience}`,
      `核心卖点：${input.sellingPoints}`,
      '正文输出为纯文本，段落清晰。',
      '请严格返回 JSON，例如：{"title":"示例标题","body":"示例正文","tags":"#标签1 #标签2 #标签3"}',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildSocialPostTitle(
    body: string,
    style: 'xiaohongshu' | 'douyin' | 'wechat',
    prompt: string,
  ) {
    const title =
      body
        .split('\n')
        .map((item) => item.trim())
        .find((item) => item.length > 0)
        ?.slice(0, 20) || `${this.pickStyleLabel(style === 'xiaohongshu' ? 'xhs' : style)}${prompt.slice(0, 14) || '社媒图文'}`;
    return Array.from(title).slice(0, 20).join('');
  }

  private serializeSocialPost(item: SocialGeneratedPost) {
    return {
      id: item.id,
      prompt: item.prompt,
      title: item.title,
      createdAt: item.createdAt,
      body: item.body,
      tags: item.tags,
      images: item.images,
      downloadableImages: item.images.map((image) => !this.productImageStorage.isManagedPublicUrl(image)),
      style: item.style,
      sizePreset: item.sizePreset,
      resolution: item.resolution,
      reviewStage: item.reviewStage,
      synced: item.synced,
    };
  }

  private serializeProductImageDraft(item: ProductImageDraft) {
    return {
      id: item.id,
      prompt: item.prompt,
      title: item.title,
      createdAt: item.createdAt,
      body: item.body,
      tags: item.tags,
      images: item.images,
      downloadableImages: item.images.map((image) => !this.productImageStorage.isManagedPublicUrl(image)),
      sizePreset: item.sizePreset,
      resolution: item.resolution,
      reviewStage: item.reviewStage,
      syncedToLeads: item.syncedToLeads,
      syncedToProducts: item.syncedToProducts,
    };
  }

  private repairMalformedProductDraftCopy(item: ProductImageDraft) {
    const normalizedBody = item.body.trim();
    if (!normalizedBody.startsWith('{') || !/"title"\s*:/.test(normalizedBody) || !/"body"\s*:/.test(normalizedBody)) {
      return item;
    }

    const repaired = this.parseGeneratedCopyPayload(normalizedBody, {
      style: 'xhs',
      productName: item.title || '产品',
      prompt: item.prompt || '',
    });

    if (!repaired.body) {
      return item;
    }

    return {
      ...item,
      title: repaired.title || item.title,
      body: repaired.body,
      tags: repaired.tags.length > 0 ? repaired.tags : item.tags,
    };
  }

  private serializeVideoDraft(item: VideoDraft) {
    return {
      id: item.id,
      prompt: item.prompt,
      source: item.source,
      title: item.title,
      platformStyle: item.platformStyle,
      publishTitle: item.publishTitle,
      publishTags: item.publishTags,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
      durationText: item.durationText,
      generatedScript: item.generatedScript,
      videoUrl: this.rewriteManagedAssetUrl(item.videoUrl),
      taskId: item.taskId,
      provider: item.provider,
      model: item.model,
      errorMessage: item.errorMessage,
      reviewStage: item.reviewStage,
      status: item.status,
      syncedToLeads: item.syncedToLeads,
    };
  }

  private async repairSocialPostImages(userId: string, item: SocialGeneratedPost) {
    const nextImages = await this.persistDraftImages(userId, item.images, 'ai-generated-images');
    if (this.areImagesEqual(item.images, nextImages)) {
      return item;
    }

    return this.prisma.socialGeneratedPost.update({
      where: { id: item.id },
      data: { images: nextImages },
    });
  }

  private async repairProductDraftImages(userId: string, item: ProductImageDraft) {
    const nextImages = await this.persistDraftImages(userId, item.images, 'ai-generated-images');
    if (this.areImagesEqual(item.images, nextImages)) {
      return item;
    }

    return this.prisma.productImageDraft.update({
      where: { id: item.id },
      data: { images: nextImages },
    });
  }

  private async persistDraftImages(userId: string, images: string[], folder: string) {
    const normalized = images
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);

    const persisted = await Promise.all(
      normalized.map(async (image) => {
        if (this.productImageStorage.isManagedPublicUrl(image)) {
          return image;
        }
        if (image.startsWith('/')) {
          return image;
        }

        try {
          const asset = await this.productImageStorage.mirrorRemoteAsset(userId, image, folder);
          return asset.url;
        } catch {
          return image;
        }
      }),
    );

    return persisted;
  }

  private areImagesEqual(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => item === right[index]);
  }

  private serializeReviewMaterial(
    source: ReviewMaterialSource,
    item:
      | (SocialGeneratedPost & { creator: { displayName: string; username: string } })
      | (ProductImageDraft & { creator: { displayName: string; username: string } })
      | (VideoDraft & { creator: { displayName: string; username: string } }),
  ) {
    if (source === 'social') {
      const social = item as SocialGeneratedPost & { creator: { displayName: string; username: string } };
      return {
        id: social.id,
        source,
        title: social.title,
        body: social.body,
        tags: social.tags,
        images: social.images,
        downloadableImages: social.images.map((image) => !this.productImageStorage.isManagedPublicUrl(image)),
        videoUrl: null,
        reviewStage: social.reviewStage,
        submittedByName: social.creator.displayName || social.creator.username,
        submittedAt: social.updatedAt.toISOString(),
      };
    }

    if (source === 'product') {
      const product = item as ProductImageDraft & { creator: { displayName: string; username: string } };
      return {
        id: product.id,
        source,
        title: product.title,
        body: product.body,
        tags: [] as string[],
        images: product.images,
        downloadableImages: product.images.map((image) => !this.productImageStorage.isManagedPublicUrl(image)),
        videoUrl: null,
        reviewStage: product.reviewStage,
        submittedByName: product.creator.displayName || product.creator.username,
        submittedAt: product.updatedAt.toISOString(),
      };
    }

    const video = item as VideoDraft & { creator: { displayName: string; username: string } };
    return {
      id: video.id,
      source,
      title: video.title,
      body: video.generatedScript,
      tags: video.publishTags,
      images: [] as string[],
      downloadableImages: [] as boolean[],
      videoUrl: this.rewriteManagedAssetUrl(video.videoUrl),
      reviewStage: video.reviewStage,
      submittedByName: video.creator.displayName || video.creator.username,
      submittedAt: video.updatedAt.toISOString(),
    };
  }

  private parseReviewMaterialSource(source: string): ReviewMaterialSource {
    if (source === 'social' || source === 'product' || source === 'video') {
      return source;
    }

    throw new BadRequestException('审核素材来源不支持');
  }

  private async findAccessibleSocialPost(user: SessionUser, id: string) {
    const item = await this.prisma.socialGeneratedPost.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('生成结果不存在');
    }

    if (item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该生成结果');
    }

    return item;
  }

  private async findAccessibleProductImageDraft(user: SessionUser, id: string) {
    const item = await this.prisma.productImageDraft.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('商品图草稿不存在');
    }

    if (item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该商品图草稿');
    }

    return item;
  }

  private async findAccessibleVideoDraft(user: SessionUser, id: string) {
    const item = await this.prisma.videoDraft.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('视频草稿不存在');
    }

    if (item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该视频草稿');
    }

    return item;
  }

  private resolveModelConfig(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & TestModelConfigDto>,
  ): ResolvedModelConfig {
    const providerKey = this.resolveProviderKey(type, override);
    const preset = getProviderPreset(type, providerKey);
    const legacyRequestUrl =
      (override as Partial<{ requestUrl?: string }> | undefined)?.requestUrl?.trim() || '';
    const baseUrl =
      override?.baseUrl?.trim() ||
      legacyRequestUrl ||
      preset?.baseUrl ||
      '';
    return {
      enabled: override?.enabled ?? true,
      providerKey,
      protocol: resolveProviderProtocol(type, providerKey, baseUrl),
      providerName: override?.providerName?.trim() || preset?.providerName || 'Custom',
      baseUrl,
      taskQueryUrlTemplate:
        override?.taskQueryUrlTemplate?.trim() || preset?.taskQueryUrlTemplate,
      apiKey:
        override?.apiKey?.trim() ||
        this.configService.get<string>('DASHSCOPE_API_KEY') ||
        this.configService.get<string>('ALIYUN_API_KEY') ||
        '',
      modelName: override?.modelName?.trim() || preset?.defaultModelName || '',
    };
  }

  private resolveProviderKey(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & TestModelConfigDto>,
  ): ProviderKey {
    const rawProviderKey = typeof override?.providerKey === 'string' ? override.providerKey : undefined;
    if (rawProviderKey) {
      return rawProviderKey as ProviderKey;
    }

    const url =
      override?.baseUrl ||
      (override as Partial<{ requestUrl?: string }> | undefined)?.requestUrl;
    return inferProviderKeyByUrl(url, override?.providerName);
  }

  private pickDimensions(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const factor = resolution === '4k' ? 2 : resolution === '2k' ? 1.5 : 1;
    const base =
      sizePreset === '1_1'
        ? [1024, 1024]
        : sizePreset === '4_5'
          ? [1080, 1350]
          : sizePreset === '9_16'
            ? [1080, 1920]
            : sizePreset === '16_9'
              ? [1920, 1080]
              : [1080, 1440];

    return [Math.round(base[0] * factor), Math.round(base[1] * factor)] as const;
  }

  private ensureModelEnabled(label: string, enabled: boolean) {
    if (!enabled) {
      throw new BadRequestException(`${label}未启用`);
    }
  }

  private ensureApiKey(label: string, apiKey: string) {
    if (!apiKey.trim()) {
      throw new BadRequestException(`${label}缺少 API Key`);
    }
  }

  private ensureBaseUrl(baseUrl: string) {
    if (!baseUrl.trim()) {
      throw new BadRequestException('Base URL 不能为空');
    }
  }

  private rethrowModelError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BadRequestException || error instanceof BadGatewayException) {
      throw error;
    }

    if (error instanceof Error && error.message.trim()) {
      throw new BadGatewayException(`${fallbackMessage}：${error.message}`);
    }

    throw new BadGatewayException(fallbackMessage);
  }

  private pickDashScopeSize(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const [width, height] = this.pickDimensions(sizePreset, resolution);
    return `${width}*${height}`;
  }

  private extractHttpUrls(input: unknown) {
    const out: string[] = [];
    const seen = new Set<string>();
    const visit = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string') {
        if ((node.startsWith('http://') || node.startsWith('https://')) && !seen.has(node)) {
          seen.add(node);
          out.push(node);
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const value of node) visit(value);
        return;
      }
      if (typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        for (const value of [obj.url, obj.image, obj.image_url, obj.imageUrl]) {
          visit(value);
        }
        for (const value of Object.values(obj)) {
          visit(value);
        }
      }
    };
    visit(input);
    return out;
  }

  private parseJsonSafely<T>(text: string) {
    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return { raw: text } as T;
    }
  }

  private parseJsonFromText<T>(text: string) {
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    const candidates: string[] = [normalized];
    const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]?.trim()) {
      candidates.unshift(fencedMatch[1].trim());
    }

    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      candidates.push(normalized.slice(objectStart, objectEnd + 1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        continue;
      }
    }

    return null;
  }

  private parseGeneratedCopyPayload(
    raw: string,
    input: { style: 'xhs' | 'douyin' | 'wechat'; productName: string; prompt: string },
  ): GeneratedCopyPayload {
    const parsed = this.parseJsonFromText<{
      title?: unknown;
      body?: unknown;
      tags?: unknown;
      text?: unknown;
    }>(raw);
    const looseParsed = !parsed ? this.parseLooseGeneratedCopyPayload(raw) : null;
    const fallbackStyle = input.style === 'xhs' ? 'xiaohongshu' : input.style;
    const fallbackBody = raw.trim();
    const bodySource =
      typeof parsed?.body === 'string'
        ? parsed.body
        : typeof looseParsed?.body === 'string'
          ? looseParsed.body
        : typeof parsed?.text === 'string'
          ? parsed.text
          : typeof looseParsed?.text === 'string'
            ? looseParsed.text
          : fallbackBody;
    const body = this.normalizeGeneratedBody(bodySource);
    const fallbackTitle =
      input.productName.trim() ||
      this.buildSocialPostTitle(body || fallbackBody, fallbackStyle, input.prompt);

    return {
      title: this.normalizeGeneratedTitle(
        typeof parsed?.title === 'string'
          ? parsed.title
          : typeof looseParsed?.title === 'string'
            ? looseParsed.title
            : fallbackTitle,
        fallbackTitle,
      ),
      body,
      tags: this.normalizeGeneratedTags(parsed?.tags ?? looseParsed?.tags),
    };
  }

  private parseLooseGeneratedCopyPayload(text: string) {
    const normalized = text.trim();
    if (!normalized.startsWith('{')) {
      return null;
    }

    const titleMatch = normalized.match(/"title"\s*:\s*"([\s\S]*?)"\s*,\s*"body"\s*:/);
    const bodyMatch = normalized.match(/"body"\s*:\s*"([\s\S]*?)"\s*,\s*"tags"\s*:/);
    const tagsArrayMatch = normalized.match(/"tags"\s*:\s*\[([\s\S]*?)\]\s*\}?$/);
    const tagsStringMatch = normalized.match(/"tags"\s*:\s*"([\s\S]*?)"\s*\}?$/);

    const title = titleMatch?.[1]?.trim() ?? '';
    const body = bodyMatch?.[1]?.trim() ?? '';
    const tags =
      tagsArrayMatch?.[1]
        ?.split(',')
        .map((item) => item.replace(/^["'\s]+|["'\s]+$/g, '').trim())
        .filter(Boolean) ??
      tagsStringMatch?.[1]?.trim() ??
      '';

    if (!title && !body && !tags) {
      return null;
    }

    return {
      title,
      body,
      tags,
      text: body,
    };
  }

  private normalizeGeneratedTitle(value: string, fallback: string) {
    const normalized = value.trim() || fallback.trim() || '营销文案';
    return Array.from(normalized).slice(0, 20).join('');
  }

  private normalizeGeneratedBody(value: string) {
    return value
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeGeneratedTags(value: unknown) {
    const raw = Array.isArray(value)
      ? value.map((item) => String(item ?? '').trim()).join(' ')
      : typeof value === 'string'
        ? value
        : '';

    return Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map((item) => item.replace(/^#+/, '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 12);
  }

  private buildUpstreamErrorMessage(prefix: string, payload: unknown, status?: number) {
    const detail = this.extractErrorMessage(payload);
    const traceId = this.extractTraceId(payload);
    if (detail) {
      return traceId
        ? `${prefix}（${status ?? 'upstream'}）：${detail} (trace_id: ${traceId})`
        : `${prefix}（${status ?? 'upstream'}）：${detail}`;
    }
    return traceId ? `${prefix}（${status ?? 'upstream'}） (trace_id: ${traceId})` : prefix;
  }

  private extractTraceId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidates = [
      (payload as { trace_id?: unknown }).trace_id,
      (payload as { traceId?: unknown }).traceId,
      (payload as { request_id?: unknown }).request_id,
      (payload as { requestId?: unknown }).requestId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidates = [
      (payload as { message?: unknown }).message,
      (payload as { error?: { message?: unknown } }).error?.message,
      (payload as { detail?: unknown }).detail,
      (payload as { details?: unknown }).details,
      (payload as { error?: { detail?: unknown } }).error?.detail,
      (payload as { error?: { details?: unknown } }).error?.details,
      (payload as { error_msg?: unknown }).error_msg,
      (payload as { msg?: unknown }).msg,
      (payload as { error?: { type?: unknown } }).error?.type,
      (payload as { type?: unknown }).type,
      (payload as { code?: unknown }).code,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        const fieldNames = this.extractUpstreamFieldNames(payload);
        const normalizedMessage =
          fieldNames.length > 0
            ? candidate.replace(/\{\{\s*\.?fields\s*\}\}/gi, fieldNames.join(', ')).trim()
            : candidate.trim();
        const details: string[] = [normalizedMessage];
        if (
          fieldNames.length > 0 &&
          !normalizedMessage.includes(fieldNames[0]) &&
          !/\bfields?\b/i.test(normalizedMessage)
        ) {
          details.push(`字段：${fieldNames.join(', ')}`);
        }
        return details.join('；');
      }
    }

    return null;
  }

  private extractUpstreamFieldNames(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const out = new Set<string>();
    const sources = [
      payload,
      (payload as { fields?: unknown }).fields,
      (payload as { error?: { fields?: unknown } }).error?.fields,
      (payload as { errors?: unknown }).errors,
    ];
    const ignoredKeys = new Set([
      'message',
      'error',
      'errors',
      'detail',
      'details',
      'msg',
      'code',
      'status',
      'statusCode',
      'trace_id',
      'request_id',
      'data',
      'output',
    ]);

    const visit = (value: unknown, depth = 0) => {
      if (depth > 6) return;
      if (!value) return;
      if (typeof value === 'string') {
        const normalized = value.trim().replace(/^[@$]/, '');
        if (
          normalized &&
          normalized !== '{{fields}}' &&
          !/^invalid field/i.test(normalized) &&
          !/^field(s)?$/i.test(normalized)
        ) {
          out.add(normalized);
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value !== 'object') {
        return;
      }

      const objectValue = value as Record<string, unknown>;
      const directCandidates = [
        objectValue.field,
        objectValue.fields,
        objectValue.field_name,
        objectValue.fieldName,
        objectValue.name,
        objectValue.path,
        objectValue.param,
        objectValue.parameter,
        objectValue.key,
        objectValue.invalid_fields,
        objectValue.invalidFields,
      ];

      let matched = false;
      for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          out.add(candidate.trim());
          matched = true;
        } else if (Array.isArray(candidate)) {
          candidate.forEach((item) => visit(item, depth + 1));
          matched = true;
        } else if (candidate && typeof candidate === 'object') {
          visit(candidate, depth + 1);
          matched = true;
        }
      }

      for (const [key, nested] of Object.entries(objectValue)) {
        if (!ignoredKeys.has(key) && /field|param|name|path|key/i.test(key)) {
          out.add(key);
        }
        if (matched && ignoredKeys.has(key)) continue;
        if (typeof nested === 'string' || Array.isArray(nested) || (nested && typeof nested === 'object')) {
          if (!ignoredKeys.has(key) && /^[a-zA-Z0-9_.-]+$/.test(key) && !/field|param|name|path|key/i.test(key)) {
            const nestedText =
              typeof nested === 'string'
                ? nested
                : Array.isArray(nested)
                  ? nested.map((item) => (typeof item === 'string' ? item : '')).join(' ')
                  : '';
            if (/invalid field|unknown field|unsupported field/i.test(nestedText)) {
              out.add(key);
            }
          }
          visit(nested, depth + 1);
        }
      }
    };

    sources.forEach((source) => visit(source));
    return Array.from(out);
  }

  private extractDeepErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const keys = new Set([
      'message',
      'error_message',
      'errorMessage',
      'error_msg',
      'msg',
      'detail',
      'reason',
      'description',
    ]);
    const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
    const maxDepth = 6;
    const maxNodes = 800;
    let visited = 0;

    while (queue.length > 0 && visited < maxNodes) {
      const current = queue.shift();
      if (!current) break;
      const { value, depth } = current;
      visited += 1;

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed.length > 500 ? trimmed.slice(0, 500) + '…' : trimmed;
        }
        continue;
      }

      if (!value || typeof value !== 'object') {
        continue;
      }

      if (Array.isArray(value)) {
        if (depth >= maxDepth) continue;
        for (const item of value) {
          queue.push({ value: item, depth: depth + 1 });
        }
        continue;
      }

      const obj = value as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (!val) continue;
        if (keys.has(key)) {
          if (typeof val === 'string' && val.trim()) {
            const trimmed = val.trim();
            return trimmed.length > 500 ? trimmed.slice(0, 500) + '…' : trimmed;
          }
          if (Array.isArray(val)) {
            const joined = val
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .join('；');
            if (joined) {
              return joined.length > 500 ? joined.slice(0, 500) + '…' : joined;
            }
          }
        }
      }

      if (depth >= maxDepth) continue;
      for (const child of Object.values(obj)) {
        queue.push({ value: child, depth: depth + 1 });
      }
    }

    return null;
  }

  private buildTaskQueryUrl(template: string, taskId: string) {
    return template.includes('{taskId}')
      ? template.replaceAll('{taskId}', encodeURIComponent(taskId))
      : template;
  }

  private resolveViduTaskQueryTemplate(config: ResolvedModelConfig, template?: string) {
    const normalizedBase = this.normalizeViduEntV2BaseUrl(config.baseUrl);
    const fallback = `${normalizedBase}/tasks/{taskId}/creations`;
    const raw = template?.trim();
    if (!raw) return fallback;

    try {
      const templateUrl = new URL(this.buildTaskQueryUrl(raw, 'task-id-placeholder'));
      const baseUrl = new URL(normalizedBase);
      const isViduDomain =
        /(^|\.)vidu\.(cn|com)$/i.test(templateUrl.hostname) || /(^|\.)vidu\.(cn|com)$/i.test(baseUrl.hostname);
      if (
        isViduDomain &&
        (templateUrl.hostname !== baseUrl.hostname || !/\/ent\/v2\/tasks\//i.test(templateUrl.pathname))
      ) {
        return fallback;
      }
      return raw;
    } catch {
      return fallback;
    }
  }

  private normalizeViduEntV2BaseUrl(baseUrl: string) {
    const normalized = baseUrl.replace(/\/+$/, '');
    const match = /^(.*?)(\/ent\/v2)(?:\/.*)?$/i.exec(normalized);
    if (match) {
      return `${match[1]}${match[2]}`;
    }
    return `${normalized}/ent/v2`;
  }

  private buildRequestUrl(config: ResolvedModelConfig) {
    const baseUrl = config.baseUrl.replace(/\/+$/, '');

    if (config.protocol === 'gemini_generate_content') {
      if (/:generateContent$/i.test(baseUrl)) {
        return baseUrl;
      }
      return `${baseUrl}/models/${encodeURIComponent(config.modelName)}:generateContent`;
    }

    if (config.protocol === 'openai_chat') {
      if (/\/chat\/completions$/i.test(baseUrl)) {
        return baseUrl;
      }
      return `${baseUrl}/chat/completions`;
    }

    if (config.protocol === 'openai_image') {
      if (/\/images\/generations$/i.test(baseUrl)) {
        return baseUrl;
      }
      return `${baseUrl}/images/generations`;
    }

    if (config.protocol === 'dashscope_image') {
      return `${baseUrl}/text2image/image-synthesis`;
    }

    if (config.protocol === 'doubao_image') {
      return `${baseUrl}/images/generations`;
    }

    if (config.protocol === 'vidu_image') {
      return `${this.normalizeViduEntV2BaseUrl(baseUrl)}/reference2image`;
    }

    if (config.protocol === 'dashscope_video') {
      return `${baseUrl}/video-generation/video-synthesis`;
    }

    if (config.protocol === 'vidu_video') {
      return `${this.normalizeViduEntV2BaseUrl(baseUrl)}/text2video`;
    }

    return baseUrl;
  }

  private createJsonHeaders(
    config: ResolvedModelConfig,
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (config.protocol === 'gemini_generate_content') {
      headers['x-goog-api-key'] = config.apiKey;
      return headers;
    }

    if (config.protocol === 'vidu_video' || config.protocol === 'vidu_image') {
      headers.Authorization = `Token ${config.apiKey}`;
      return headers;
    }

    headers.Authorization = `Bearer ${config.apiKey}`;
    return headers;
  }

  private parseDataUrl(value: string) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
    if (!match) {
      return null;
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  private pickOpenAiImageSize(sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9') {
    if (sizePreset === '1_1') return '1024x1024';
    if (sizePreset === '16_9') return '1536x1024';
    return '1024x1536';
  }

  private pickDoubaoImageSize(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const map1k = {
      // Doubao requires at least 3,686,400 pixels even for the lowest preset.
      '1_1': '1920x1920',
      '3_4': '1664x2216',
      '4_5': '1728x2160',
      '9_16': '1440x2560',
      '16_9': '2560x1440',
    } as const;
    const map2k = {
      '1_1': '2048x2048',
      '3_4': '1728x2304',
      '4_5': '1800x2250',
      '9_16': '1600x2848',
      '16_9': '2848x1600',
    } as const;
    const map4k = {
      '1_1': '4096x4096',
      '3_4': '3520x4704',
      '4_5': '3648x4560',
      '9_16': '3040x5504',
      '16_9': '5504x3040',
    } as const;

    if (resolution === '4k') return map4k[sizePreset];
    if (resolution === '2k') return map2k[sizePreset];
    return map1k[sizePreset];
  }

  private pickViduImageAspectRatio(sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9') {
    if (sizePreset === '1_1') return '1:1';
    if (sizePreset === '16_9') return '16:9';
    return '9:16';
  }

  private extractTaskId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidates = [
      (payload as { task_id?: unknown }).task_id,
      (payload as { taskId?: unknown }).taskId,
      (payload as { output?: { task_id?: unknown; taskId?: unknown } }).output?.task_id,
      (payload as { output?: { task_id?: unknown; taskId?: unknown } }).output?.taskId,
      (payload as { data?: { task_id?: unknown; taskId?: unknown } }).data?.task_id,
      (payload as { data?: { task_id?: unknown; taskId?: unknown } }).data?.taskId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private extractVideoTaskStatus(payload: unknown): 'processing' | 'success' | 'failed' {
    if (!payload || typeof payload !== 'object') {
      return 'processing';
    }

    const candidates = [
      (payload as { status?: unknown }).status,
      (payload as { state?: unknown }).state,
      (payload as { task_status?: unknown }).task_status,
      (payload as { output?: { task_status?: unknown } }).output?.task_status,
      (payload as { data?: { status?: unknown; state?: unknown } }).data?.status,
      (payload as { data?: { status?: unknown; state?: unknown } }).data?.state,
    ];

    const raw = candidates.find((value) => typeof value === 'string' && value.trim());
    if (!raw || typeof raw !== 'string') {
      return 'processing';
    }

    const normalized = raw.trim().toLowerCase();
    if (['success', 'succeeded', 'completed', 'done', 'finished'].includes(normalized)) {
      return 'success';
    }
    if (['failed', 'error', 'rejected', 'canceled', 'cancelled'].includes(normalized)) {
      return 'failed';
    }
    if (['succeeded'].includes(normalized)) {
      return 'success';
    }
    if (['processing', 'running', 'pending', 'queued', 'created', 'in_progress'].includes(normalized)) {
      return 'processing';
    }

    if (normalized === 'succeeded' || normalized === 'succeed') {
      return 'success';
    }

    const upper = raw.trim().toUpperCase();
    if (upper === 'SUCCEEDED') return 'success';
    if (upper === 'FAILED') return 'failed';
    if (['RUNNING', 'PENDING', 'QUEUED', 'PROCESSING'].includes(upper)) return 'processing';

    return 'processing';
  }

  private parseModelType(type: string): ModelType {
    if (type === 'text' || type === 'image' || type === 'video') {
      return type;
    }

    throw new BadRequestException('模型类型不支持');
  }

  private isMainCompany(user: SessionUser) {
    return user.role === MAIN_COMPANY_ROLE_KEY;
  }

  private ensureMainCompanyUser(user: SessionUser, message = '仅主公司可维护模型配置') {
    if (!this.isMainCompany(user)) {
      throw new ForbiddenException(message);
    }
  }

  private isWan26Model(model: string) {
    const normalized = model.toLowerCase();
    return normalized === 'wan2.6-image' || normalized.startsWith('wan2.6-');
  }

  private async generateTextContent(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    if (config.protocol === 'gemini_generate_content') {
      return this.geminiGenerateText(config, input);
    }

    return this.openAiStyleGenerateText(config, input);
  }

  private async generateImagesByProtocol(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      referenceImages: string[];
      count: number;
    },
  ) {
    if (config.protocol === 'vidu_image') {
      return this.viduGenerateImages(config, input);
    }

    if (config.protocol === 'vidu_video') {
      throw new BadRequestException('Vidu 当前仅支持视频模型，不支持图片生成');
    }

    if (config.protocol === 'openai_image') {
      if (input.referenceImages.length > 0) {
        throw new BadRequestException('当前服务商图片协议暂不支持参考图生成');
      }
      return this.openAiImageGenerate(config, input);
    }

    if (config.protocol === 'doubao_image') {
      return this.doubaoGenerateImages(config, input);
    }

    if (config.protocol === 'gemini_generate_content') {
      return this.geminiGenerateImages(config, input);
    }

    if (input.referenceImages.length > 0) {
      return this.dashscopeReferenceGenerate({
        apiKey: config.apiKey,
        model: config.modelName,
        prompt: input.prompt,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        referenceImages: input.referenceImages,
        requestUrl: this.buildRequestUrl(config),
      });
    }

    if (this.isWan26Model(config.modelName)) {
      return this.dashscopeWan26Generate({
        apiKey: config.apiKey,
        model: config.modelName,
        prompt: input.prompt,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        count: input.count,
        requestUrl: this.buildRequestUrl(config),
      });
    }

    return this.dashscopeTextToImageGenerate({
      apiKey: config.apiKey,
      model: config.modelName,
      prompt: input.prompt,
      sizePreset: input.sizePreset,
      resolution: input.resolution,
      count: input.count,
      requestUrl: this.buildRequestUrl(config),
      taskQueryUrlTemplate: config.taskQueryUrlTemplate,
    });
  }

  private async testTextModelConnection(config: ResolvedModelConfig) {
    const content = await this.generateTextContent(config, {
      user: '请回复“连接成功”。',
      errorLabel: '文字模型测试失败',
    });
    if (!content) {
      throw new BadGatewayException('文字模型测试失败：未返回有效内容');
    }

    return {
      success: true,
      message: '文字模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async testImageModelConnection(config: ResolvedModelConfig) {
    if (config.protocol === 'vidu_image') {
      await this.viduTestCredits(config, '图片模型测试失败');
      return {
        success: true,
        message: '图片模型连接成功',
        provider: config.providerName,
        model: config.modelName,
      };
    }

    const urls = await this.generateImagesByProtocol(config, {
      prompt: '测试连接，请生成一张简单图片。',
      sizePreset: '1_1',
      resolution: config.protocol === 'doubao_image' ? '2k' : '1k',
      referenceImages: [],
      count: 1,
    });
    if (urls.length === 0) {
      throw new BadGatewayException('图片模型测试失败：未返回可识别结果');
    }

    return {
      success: true,
      message: '图片模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async testVideoModelConnection(config: ResolvedModelConfig) {
    if (config.protocol === 'vidu_video') {
      await this.viduTestCredits(config);
      return {
        success: true,
        message: '视频模型连接成功',
        provider: config.providerName,
        model: config.modelName,
      };
    }

    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        input: {
          prompt: '测试连接，请创建一个简短视频任务。',
        },
      }),
    });

    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('视频模型测试失败', data, response.status),
      );
    }

    const taskId = this.extractTaskId(data);
    if (taskId && config.taskQueryUrlTemplate?.trim()) {
      const authHeader = this.createJsonHeaders(config).Authorization;
      const queryResponse = await fetch(this.buildTaskQueryUrl(config.taskQueryUrlTemplate, taskId), {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
      });
      const queryData = this.parseJsonSafely(await queryResponse.text());
      if (!queryResponse.ok) {
        throw new BadGatewayException(
          this.buildUpstreamErrorMessage('视频模型任务查询失败', queryData, queryResponse.status),
        );
      }
    }

    return {
      success: true,
      message: taskId ? '视频模型连接成功，已创建测试任务' : '视频模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async openAiStyleGenerateText(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    const requestUrl = this.buildRequestUrl(config);
    const headers = this.createJsonHeaders(config);
    const messages = [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.user },
    ];

    let response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.modelName,
        messages,
        temperature: 0.8,
      }),
    });

    let data = this.parseJsonSafely<{ choices?: Array<{ message?: { content?: string } }> }>(
      await response.text(),
    );

    // Some OpenAI-compatible gateways reject temperature or map it differently.
    if (!response.ok && response.status === 400) {
      const retryResponse = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelName,
          messages,
        }),
      });
      const retryData = this.parseJsonSafely<{ choices?: Array<{ message?: { content?: string } }> }>(
        await retryResponse.text(),
      );
      response = retryResponse;
      data = retryData;
    }

    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage(input.errorLabel, data, response.status),
      );
    }

    return String(data.choices?.[0]?.message?.content ?? '').trim();
  }

  private async geminiGenerateText(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        systemInstruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        contents: [
          {
            role: 'user',
            parts: [{ text: input.user }],
          },
        ],
      }),
    });

    const data = this.parseJsonSafely<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage(input.errorLabel, data, response.status),
      );
    }

    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => String(part.text ?? '').trim())
      .filter(Boolean)
      .join('\n');
    return content.trim();
  }

  private async openAiImageGenerate(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      count: number;
    },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        prompt: input.prompt,
        n: input.count,
        size: this.pickOpenAiImageSize(input.sizePreset),
      }),
    });

    const data = this.parseJsonSafely<{
      data?: Array<{ url?: string; b64_json?: string }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.data ?? [])
      .map((item) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
      })
      .filter(Boolean);

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async doubaoGenerateImages(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      referenceImages: string[];
      count: number;
    },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        prompt: input.prompt,
        ...(input.referenceImages.length > 0
          ? {
              image:
                input.referenceImages.length === 1
                  ? input.referenceImages[0]
                  : input.referenceImages.slice(0, 14),
            }
          : {}),
        size: this.pickDoubaoImageSize(input.sizePreset, input.resolution),
        sequential_image_generation: input.count > 1 ? 'auto' : 'disabled',
      }),
    });

    const data = this.parseJsonSafely<{
      data?: Array<{ url?: string; b64_json?: string }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.data ?? [])
      .map((item) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
      })
      .filter(Boolean)
      .slice(0, Math.max(1, input.count));

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async geminiGenerateImages(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      referenceImages: string[];
      count: number;
    },
  ) {
    const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    for (const image of input.referenceImages) {
      const parsed = this.parseDataUrl(image);
      if (parsed) {
        parts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        });
      }
    }

    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    const data = this.parseJsonSafely<{
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => {
        const mimeType = part.inlineData?.mimeType;
        const raw = part.inlineData?.data;
        return mimeType && raw ? `data:${mimeType};base64,${raw}` : '';
      })
      .filter(Boolean)
      .slice(0, input.count);

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async viduGenerateImages(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      referenceImages: string[];
      count: number;
    },
  ) {
    const images = (input.referenceImages ?? [])
      .map((item) => this.normalizeOptionalReferenceImageInput(item))
      .filter((item): item is string => !!item)
      .slice(0, 7);

    if (images.length === 0) {
      throw new BadRequestException('Vidu 图片模型至少需要 1 张参考图');
    }

    const requestUrl = this.buildRequestUrl(config);
    const taskQueryTemplate = this.resolveViduTaskQueryTemplate(config, config.taskQueryUrlTemplate);
    const seedBase = Math.floor(Math.random() * 2000000000);
    const urls: string[] = [];
    let lastErrorMessage = '图片模型未返回有效图片';

    for (let i = 0; i < input.count; i += 1) {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: this.createJsonHeaders(config),
        body: JSON.stringify({
          model: config.modelName,
          images,
          prompt: input.prompt.slice(0, 2000),
          seed: seedBase + i,
          aspect_ratio: this.pickViduImageAspectRatio(input.sizePreset),
        }),
      });
      const data = this.parseJsonSafely(await response.text());

      if (!response.ok) {
        lastErrorMessage = this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status);
        continue;
      }

      const directUrls = this.extractHttpUrls(data).filter(
        (url) => /\.(png|jpe?g|webp)(\?|$)/i.test(url) || url.includes('image'),
      );
      if (directUrls.length > 0) {
        urls.push(directUrls[0]);
        continue;
      }

      const taskId = this.extractTaskId(data);
      if (!taskId) {
        lastErrorMessage = '图片模型未返回有效任务';
        continue;
      }

      const generatedUrls = await this.waitForViduImageUrls(config, taskId, taskQueryTemplate);
      if (generatedUrls.length > 0) {
        urls.push(generatedUrls[0]);
      }
    }

    if (urls.length === 0) {
      throw new BadGatewayException(lastErrorMessage);
    }

    return urls;
  }

  private async viduTestCredits(config: ResolvedModelConfig, errorLabel = '视频模型测试失败') {
    const baseUrl = this.normalizeViduEntV2BaseUrl(config.baseUrl);
    const url = `${baseUrl}/credits?show_detail=false`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.createJsonHeaders(config),
    });
    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage(errorLabel, data, response.status),
      );
    }
  }

  private async dashscopeReferenceGenerate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    referenceImages: string[];
    requestUrl: string;
  }) {
    const size = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const response = await fetch(opts.requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                ...opts.referenceImages.slice(0, 3).map((image) => ({ image })),
                {
                  text: `请基于参考图生成新的商品营销图片，保留主体商品特征与整体风格一致性，并结合以下要求：${opts.prompt}`,
                },
              ],
            },
          ],
        },
        parameters: {
          n: 3,
          negative_prompt: '低清晰度，模糊，变形，多余文字，水印，logo',
          prompt_extend: true,
          watermark: false,
          size,
        },
      }),
    });

    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型参考图生成失败', data, response.status),
      );
    }

    const urls = this.extractHttpUrls(data).slice(0, 3);
    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回参考图生成结果');
    }

    return urls;
  }

  private async dashscopeWan26Generate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    count: number;
    requestUrl: string;
  }) {
    const seedBase = Math.floor(Math.random() * 2000000000);
    const preferredSize = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const fallbackSizes = ['1024*1024', preferredSize].filter(
      (value, index, array) => array.indexOf(value) === index,
    );
    const urls: string[] = [];
    let lastErrorMessage = '图片模型未返回有效图片';

    for (let i = 0; i < opts.count; i += 1) {
      for (const size of fallbackSizes) {
        const attempts: Array<{ input: unknown; parameters: Record<string, unknown> }> = [
          {
            input: {
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'text', text: opts.prompt }],
                },
              ],
            },
            parameters: { size, seed: seedBase + i },
          },
          {
            input: {
              messages: [
                {
                  role: 'user',
                  content: [{ text: opts.prompt }],
                },
              ],
            },
            parameters: { size, seed: seedBase + i },
          },
          {
            input: { prompt: opts.prompt },
            parameters: { size, seed: seedBase + i },
          },
        ];

        for (const attempt of attempts) {
          const response = await fetch(
            opts.requestUrl,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: opts.model,
                input: attempt.input,
                parameters: attempt.parameters,
              }),
            },
          );

          const data = this.parseJsonSafely(await response.text());

          if (!response.ok) {
            lastErrorMessage = this.buildUpstreamErrorMessage(
              '图片模型调用失败',
              data,
              response.status,
            );
            continue;
          }

          const candidates = this.extractHttpUrls(data);
          const imageUrl =
            candidates.find((url) => /\.(png|jpe?g|webp)(\?|$)/i.test(url)) ??
            candidates.find((url) => /aliyuncs\.com|oss-/.test(url)) ??
            candidates[0];

          if (imageUrl) {
            urls.push(imageUrl);
            break;
          }
        }

        if (urls.length >= i + 1) {
          break;
        }
      }
    }

    if (urls.length === 0) {
      throw new BadGatewayException(lastErrorMessage);
    }

    return urls;
  }

  private async dashscopeTextToImageGenerate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    count: number;
    requestUrl: string;
    taskQueryUrlTemplate?: string;
  }) {
    const size = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const seedBase = Math.floor(Math.random() * 2000000000);
    const taskIds: string[] = [];
    let lastErrorMessage = '图片模型未返回有效任务';

    for (let i = 0; i < opts.count; i += 1) {
      const response = await fetch(opts.requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: opts.model,
          input: {
            prompt: `高质量产品主图，商品：${opts.prompt}，干净背景，商业摄影光照，8k分辨率，杰作`,
          },
          parameters: {
            size,
            seed: seedBase + i,
          },
        }),
      });

      const data = this.parseJsonSafely<{
        output?: { task_id?: string };
      }>(await response.text());

      if (!response.ok) {
        lastErrorMessage = this.buildUpstreamErrorMessage(
          '图片模型调用失败',
          data,
          response.status,
        );
        continue;
      }

      const taskId = data.output?.task_id;
      if (taskId) {
        taskIds.push(taskId);
      } else {
        const directUrls = this.extractHttpUrls(data);
        if (directUrls.length > 0) {
          return directUrls.slice(0, opts.count);
        }
      }
    }

    if (taskIds.length === 0) {
      throw new BadGatewayException(lastErrorMessage);
    }

    if (!opts.taskQueryUrlTemplate?.trim()) {
      throw new BadGatewayException('图片模型返回了异步任务，但未配置任务查询地址模板');
    }

    const urls: string[] = [];
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (urls.length >= taskIds.length) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      for (const taskId of taskIds) {
        const response = await fetch(this.buildTaskQueryUrl(opts.taskQueryUrlTemplate, taskId), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
          },
        });
        const data = this.parseJsonSafely<{
          output?: { task_status?: string; results?: Array<{ url?: string }> };
        }>(await response.text());

        if (!response.ok) {
          lastErrorMessage = this.buildUpstreamErrorMessage(
            '图片任务查询失败',
            data,
            response.status,
          );
          continue;
        }

        if (data.output?.task_status !== 'SUCCEEDED') {
          continue;
        }

        for (const result of data.output.results ?? []) {
          const url = String(result.url ?? '');
          if (url && !urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }

    if (urls.length === 0) {
      throw new BadGatewayException(lastErrorMessage || '图片模型任务未返回图片');
    }

    return urls;
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SuperSiteIndustryService } from './super-site-industry.service';
import type { SuperSiteIndustryRefreshConfig } from './super-site-industry.types';

type IndustrySyncJobData = {
  userId: string;
};

@Injectable()
export class SuperSiteIndustryQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SuperSiteIndustryQueueService.name);
  private readonly queueName = 'super-site-industry-sync';
  private connection: IORedis | null = null;
  private queue: Queue<IndustrySyncJobData> | null = null;
  private worker: Worker<IndustrySyncJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly superSiteIndustryService: SuperSiteIndustryService,
  ) {}

  async onModuleInit() {
    const redisUrl =
      this.configService.get<string>('REDIS_URL')?.trim() ||
      'redis://localhost:6379';

    try {
      this.connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
      });
      await this.connection.ping();
      this.queue = new Queue<IndustrySyncJobData>(this.queueName, {
        connection: this.connection,
      });
      this.worker = new Worker<IndustrySyncJobData>(
        this.queueName,
        async (job) => {
          await this.superSiteIndustryService.syncMyIndustryItems(job.data.userId);
        },
        {
          connection: this.connection,
          concurrency: 1,
        },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error(
          `行业抓取任务失败 userId=${job?.data.userId ?? 'unknown'}: ${error.message}`,
        );
      });
      await this.restoreSchedulers();
    } catch (error) {
      this.logger.warn(
        `行业抓取队列未启用：${error instanceof Error ? error.message : String(error)}`,
      );
      await this.safeClose();
    }
  }

  async onModuleDestroy() {
    await this.safeClose();
  }

  async syncUserScheduler(
    userId: string,
    refreshConfig: SuperSiteIndustryRefreshConfig,
  ) {
    if (!this.queue) {
      return;
    }

    const schedulerId = this.buildSchedulerId(userId);
    if (!refreshConfig.enabled) {
      await this.queue.removeJobScheduler(schedulerId);
      return;
    }

    const pattern = this.buildCronPattern(refreshConfig.dailyTime);
    await this.queue.upsertJobScheduler(
      schedulerId,
      {
        pattern,
      },
      {
        name: 'sync',
        data: {
          userId,
        },
      },
    );
  }

  async enqueueManualSync(userId: string) {
    if (!this.queue) {
      await this.superSiteIndustryService.syncMyIndustryItems(userId);
      return;
    }

    await this.queue.add('manual-sync', { userId });
  }

  private async restoreSchedulers() {
    if (!this.queue) {
      return;
    }

    const settings = await this.prisma.superSiteSetting.findMany({
      select: {
        userId: true,
        industryRefreshConfig: true,
      },
    });

    for (const item of settings) {
      if (!item.industryRefreshConfig || Array.isArray(item.industryRefreshConfig)) {
        continue;
      }

      const config = item.industryRefreshConfig as unknown as SuperSiteIndustryRefreshConfig;
      if (!config.enabled) {
        continue;
      }

      await this.syncUserScheduler(item.userId, config);
    }
  }

  private buildSchedulerId(userId: string) {
    return `industry-sync:${userId}`;
  }

  private buildCronPattern(dailyTime: string) {
    const [hourText = '9', minuteText = '0'] = dailyTime.split(':');
    const hour = Number.isFinite(Number(hourText)) ? Number(hourText) : 9;
    const minute = Number.isFinite(Number(minuteText))
      ? Number(minuteText)
      : 0;
    return `${Math.min(Math.max(minute, 0), 59)} ${Math.min(
      Math.max(hour, 0),
      23,
    )} * * *`;
  }

  private async safeClose() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
    this.worker = null;
    this.queue = null;
    this.connection = null;
  }
}

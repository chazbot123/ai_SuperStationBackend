import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadPublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublishingCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishingCleanupService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.isCleanupEnabled()) {
      return;
    }

    const intervalMs = this.resolveCleanupIntervalMs();
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredPublishJobs();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async cleanupExpiredPublishJobs() {
    if (!this.isCleanupEnabled()) {
      return { count: 0, skipped: true };
    }

    const retentionDays = this.resolveRetentionDays();
    if (retentionDays <= 0) {
      return { count: 0, skipped: true };
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.leadPublishJob.deleteMany({
      where: {
        status: { in: [LeadPublishStatus.success, LeadPublishStatus.failed] },
        updatedAt: { lt: cutoff },
      },
    });

    this.logger.log(`Removed ${result.count} expired publish jobs older than ${retentionDays} days.`);
    return result;
  }

  private isCleanupEnabled() {
    return this.configService.get('PUBLISH_JOB_CLEANUP_ENABLED', 'true') !== 'false';
  }

  private resolveRetentionDays() {
    const raw = this.configService.get('PUBLISH_JOB_RETENTION_DAYS', '30');
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : 30;
  }

  private resolveCleanupIntervalMs() {
    const raw = this.configService.get('PUBLISH_JOB_CLEANUP_INTERVAL_MS', '86400000');
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400000;
  }
}

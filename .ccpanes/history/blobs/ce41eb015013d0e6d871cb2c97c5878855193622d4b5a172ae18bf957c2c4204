import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishingService } from './publishing.service';

@Injectable()
export class PublishingProfileKeepaliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishingProfileKeepaliveService.name);
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly publishingService: PublishingService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      return;
    }

    const intervalMs = this.resolveIntervalMs();
    const initialDelayMs = this.resolveInitialDelayMs();
    this.startupTimer = setTimeout(() => {
      void this.executeScheduledKeepAlive();
      this.keepAliveTimer = setInterval(() => {
        void this.executeScheduledKeepAlive();
      }, intervalMs);
    }, initialDelayMs);
  }

  onModuleDestroy() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  async executeScheduledKeepAlive() {
    if (!this.isEnabled()) {
      return { skipped: true };
    }
    if (this.running) {
      return { skipped: true, reason: 'running' };
    }

    this.running = true;
    try {
      const result = await this.publishingService.runScheduledKeepAliveForPlatformAccounts();
      this.logger.log(
        `Profile keepalive finished: total=${result.total}, succeeded=${result.succeeded}, reauthRequired=${result.reauthRequired}, collectFailed=${result.collectFailed}, skipped=${result.skipped}`,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Profile keepalive failed: ${message}`);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private isEnabled() {
    return this.configService.get('PUBLISH_PROFILE_KEEPALIVE_ENABLED', 'true') !== 'false';
  }

  private resolveIntervalMs() {
    const raw = this.configService.get('PUBLISH_PROFILE_KEEPALIVE_INTERVAL_MS', '86400000');
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400000;
  }

  private resolveInitialDelayMs() {
    const raw = this.configService.get('PUBLISH_PROFILE_KEEPALIVE_INITIAL_DELAY_MS', '60000');
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60000;
  }
}

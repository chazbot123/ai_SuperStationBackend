import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

export type VideoTtsCacheEntry = {
  userId?: string | null;
  voiceId?: string | null;
  text?: string;
  subtitleText?: string | null;
  subtitleEnabled?: boolean | null;
  ttsTaskId: string;
  audioUrl: string | null;
  bgmUrl?: string | null;
  bgmVolume?: number | null;
  sourceVideoUrl: string | null;
  finalVideoUrl: string | null;
  status: 'processing' | 'success' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
};

@Injectable()
export class AiVideoTtsCacheService implements OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  private connectPromise?: Promise<ReturnType<typeof createClient>>;

  constructor(private readonly configService: ConfigService) {}

  async get(videoTaskId: string): Promise<VideoTtsCacheEntry | null> {
    const client = await this.getClient();
    const raw = await client.get(this.buildKey(videoTaskId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as VideoTtsCacheEntry;
    } catch {
      return null;
    }
  }

  async set(videoTaskId: string, entry: VideoTtsCacheEntry, ttlSeconds = 3600) {
    const client = await this.getClient();
    await client.setEx(this.buildKey(videoTaskId), ttlSeconds, JSON.stringify(entry));
    return entry;
  }

  async del(videoTaskId: string) {
    const client = await this.getClient();
    await client.del(this.buildKey(videoTaskId));
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private buildKey(videoTaskId: string) {
    return `ai:video-tts:${videoTaskId}`;
  }

  private async getClient(): Promise<ReturnType<typeof createClient>> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      throw new ServiceUnavailableException('Redis 未配置，无法保存视频配音任务');
    }

    const client = createClient({ url: redisUrl });
    this.client = client;

    this.connectPromise = client
      .connect()
      .then(() => client)
      .catch((error: unknown) => {
        this.connectPromise = undefined;
        this.client = undefined;
        const message = error instanceof Error ? error.message : 'unknown_error';
        throw new ServiceUnavailableException(`Redis 不可用：${message}`);
      });

    return this.connectPromise as Promise<ReturnType<typeof createClient>>;
  }
}

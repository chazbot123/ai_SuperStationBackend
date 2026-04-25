import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { type ModelType, type ProviderKey } from './model-provider-presets';

export type StoredModelConfig = {
  enabled: boolean;
  providerKey: ProviderKey;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  apiKey: string;
  modelName: string;
};

export type StoredModelConfigItem = StoredModelConfig & {
  type: ModelType;
};

export type StoredProviderModelConfigItem = StoredModelConfig & {
  type: ModelType;
  providerKey: ProviderKey;
};

@Injectable()
export class AiModelConfigCacheService implements OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  private connectPromise?: Promise<ReturnType<typeof createClient>>;

  constructor(private readonly configService: ConfigService) {}

  async get(type: ModelType): Promise<StoredModelConfig | null> {
    const client = await this.getClient();
    const raw = await client.get(this.buildKey(type));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredModelConfig;
    } catch {
      return null;
    }
  }

  async getAll(): Promise<StoredModelConfigItem[]> {
    const types: ModelType[] = ['text', 'image', 'video'];
    const items = await Promise.all(
      types.map(async (type) => {
        const config = await this.get(type);
        return config ? { type, ...config } : null;
      }),
    );
    return items.filter(Boolean) as StoredModelConfigItem[];
  }

  async getSaved(type: ModelType, providerKey: ProviderKey): Promise<StoredModelConfig | null> {
    const client = await this.getClient();
    const raw = await client.get(this.buildSavedKey(type, providerKey));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredModelConfig;
    } catch {
      return null;
    }
  }

  async getAllSaved(): Promise<StoredProviderModelConfigItem[]> {
    const client = await this.getClient();
    const keys = await client.keys('ai:model-config:saved:*');
    if (keys.length === 0) {
      return [];
    }

    const entries = await Promise.all(
      keys.map(async (key) => {
        const raw = await client.get(key);
        if (!raw) {
          return null;
        }

        const parts = key.split(':');
        const type = parts[4] as ModelType | undefined;
        const providerKey = parts[5] as ProviderKey | undefined;
        if (!type || !providerKey) {
          return null;
        }

        try {
          const config = JSON.parse(raw) as StoredModelConfig;
          return {
            type,
            ...config,
            providerKey,
          };
        } catch {
          return null;
        }
      }),
    );

    return entries.filter(Boolean) as StoredProviderModelConfigItem[];
  }

  async set(type: ModelType, config: StoredModelConfig) {
    const client = await this.getClient();
    await client.set(this.buildKey(type), JSON.stringify(config));
    return { type, ...config };
  }

  async setSaved(type: ModelType, providerKey: ProviderKey, config: StoredModelConfig) {
    const client = await this.getClient();
    await client.set(this.buildSavedKey(type, providerKey), JSON.stringify(config));
    return { type, ...config, providerKey };
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private buildKey(type: ModelType) {
    return `ai:model-config:active:${type}`;
  }

  private buildSavedKey(type: ModelType, providerKey: ProviderKey) {
    return `ai:model-config:saved:${type}:${providerKey}`;
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
      throw new ServiceUnavailableException('Redis 未配置，无法保存模型配置');
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

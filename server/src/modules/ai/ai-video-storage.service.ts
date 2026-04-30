import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'minio';

@Injectable()
export class AiVideoStorageService {
  private readonly client: Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private ensureBucketPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = Number(this.configService.get<string>('MINIO_PORT') ?? '9000');
    const useSSL = String(this.configService.get<string>('MINIO_USE_SSL') ?? 'false') === 'true';
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY');
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY');
    const bucketName = this.configService.get<string>('MINIO_BUCKET') ?? 'ai-superweb';

    if (!accessKey || !secretKey) {
      throw new InternalServerErrorException('MinIO 配置不完整');
    }

    this.client = new Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
    this.bucketName = bucketName;
    this.publicBaseUrl = this.buildPublicBaseUrl(endpoint, port, useSSL);
  }

  async uploadReferenceImage(userId: string, dataUrl: string) {
    const parsed = this.parseDataUrl(dataUrl);
    if (!parsed || !parsed.mimeType.startsWith('image/')) {
      throw new InternalServerErrorException('参考图格式不支持');
    }

    await this.ensureBucket();

    const extension = this.pickImageExtension(parsed.mimeType);
    const objectKey = `videos/${userId}/reference/${Date.now()}-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(parsed.data, 'base64');

    try {
      await this.client.putObject(this.bucketName, objectKey, buffer, buffer.length, {
        'Content-Type': parsed.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch {
      throw new InternalServerErrorException('上传参考图到 MinIO 失败');
    }

    return {
      bucket: this.bucketName,
      objectKey,
      url: `${this.publicBaseUrl}/${this.bucketName}/${this.encodeObjectKey(objectKey)}`,
    };
  }

  async uploadVideoObject(opts: { userId: string; taskId: string; fileName: string; buffer: Buffer }) {
    await this.ensureBucket();
    const objectKey = `videos/${opts.userId}/${opts.taskId}/${Date.now()}-${randomUUID()}-${opts.fileName}`;

    try {
      await this.client.putObject(this.bucketName, objectKey, opts.buffer, opts.buffer.length, {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch {
      throw new InternalServerErrorException('上传视频到 MinIO 失败');
    }

    return {
      bucket: this.bucketName,
      objectKey,
      url: `${this.publicBaseUrl}/${this.bucketName}/${this.encodeObjectKey(objectKey)}`,
    };
  }

  private ensureBucket() {
    if (!this.ensureBucketPromise) {
      this.ensureBucketPromise = this.ensureBucketInternal();
    }
    return this.ensureBucketPromise;
  }

  private async ensureBucketInternal() {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName);
      }
      await this.client.setBucketPolicy(this.bucketName, JSON.stringify(this.buildPublicReadPolicy()));
    } catch {
      this.ensureBucketPromise = null;
      throw new InternalServerErrorException('初始化 MinIO Bucket 失败');
    }
  }

  private buildPublicBaseUrl(endpoint: string, port: number, useSSL: boolean) {
    const protocol = useSSL ? 'https' : 'http';
    const isDefaultPort = (!useSSL && port === 80) || (useSSL && port === 443);
    return `${protocol}://${endpoint}${isDefaultPort ? '' : `:${port}`}`;
  }

  private encodeObjectKey(objectKey: string) {
    return objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private buildPublicReadPolicy() {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetBucketLocation', 's3:ListBucket'],
          Resource: [`arn:aws:s3:::${this.bucketName}`],
        },
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucketName}/*`],
        },
      ],
    };
  }

  private parseDataUrl(value: string) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }

  private pickImageExtension(mimeType: string) {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
    };
    return map[mimeType] ?? 'png';
  }
}


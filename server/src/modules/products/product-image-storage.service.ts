import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { ProductUploadFile } from './product-image.types';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class ProductImageStorageService {
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

  async uploadProductImage(userId: string, file?: ProductUploadFile) {
    this.validateImage(file);

    await this.ensureBucket();

    const objectKey = this.buildObjectKey(userId, file);

    try {
      await this.client.putObject(this.bucketName, objectKey, file.buffer, file.size, {
        'Content-Type': file.mimetype,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch {
      throw new InternalServerErrorException('上传图片到 MinIO 失败');
    }

    return {
      bucket: this.bucketName,
      objectKey,
      url: `${this.publicBaseUrl}/${this.bucketName}/${this.encodeObjectKey(objectKey)}`,
    };
  }

  private validateImage(file?: ProductUploadFile): asserts file is ProductUploadFile {
    if (!file) {
      throw new BadRequestException('请选择商品图片');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('仅支持上传图片文件');
    }

    if (file.size <= 0) {
      throw new BadRequestException('图片文件不能为空');
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('图片大小不能超过 10MB');
    }
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

  private buildObjectKey(userId: string, file: ProductUploadFile) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const extension = this.resolveExtension(file);

    return `products/${userId}/${year}/${month}/${day}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  private resolveExtension(file: ProductUploadFile) {
    const normalized = extname(file.originalname).replace('.', '').toLowerCase();
    if (normalized) {
      return normalized;
    }

    const mimeToExtension: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };

    return mimeToExtension[file.mimetype] ?? 'bin';
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
}

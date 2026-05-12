import {
  BadGatewayException,
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
const MAX_REMOTE_ASSET_SIZE_BYTES = 100 * 1024 * 1024;

type StoredPublicAsset = {
  bucket: string;
  objectKey: string;
  url: string;
};

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

    return this.storePublicAsset(userId, file, 'products');
  }

  isManagedPublicUrl(url?: string | null) {
    const trimmed = url?.trim();
    if (!trimmed) {
      return false;
    }

    return trimmed.startsWith(`${this.publicBaseUrl}/${this.bucketName}/`);
  }

  async mirrorRemoteAsset(
    userId: string,
    sourceUrl: string,
    folder = 'publishing-assets',
  ): Promise<StoredPublicAsset> {
    const trimmedSourceUrl = sourceUrl.trim();
    if (!trimmedSourceUrl) {
      throw new BadRequestException('素材地址不能为空');
    }

    if (this.isManagedPublicUrl(trimmedSourceUrl)) {
      const prefix = `${this.publicBaseUrl}/${this.bucketName}/`;
      return {
        bucket: this.bucketName,
        objectKey: decodeURIComponent(trimmedSourceUrl.slice(prefix.length)),
        url: trimmedSourceUrl,
      };
    }

    const dataUrlAsset = this.parseDataUrl(trimmedSourceUrl);
    if (dataUrlAsset) {
      return this.storePublicAsset(
        userId,
        {
          buffer: dataUrlAsset.buffer,
          size: dataUrlAsset.buffer.length,
          mimetype: dataUrlAsset.mimeType,
          originalname: `inline.${this.resolveExtensionFromMimeType(dataUrlAsset.mimeType)}`,
        },
        folder,
      );
    }

    const response = await fetch(trimmedSourceUrl, {
      headers: {
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Referer: trimmedSourceUrl,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new BadGatewayException(`素材下载失败：${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_REMOTE_ASSET_SIZE_BYTES) {
      throw new BadRequestException('素材大小不能超过 100MB');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length <= 0) {
      throw new BadRequestException('素材文件不能为空');
    }
    if (buffer.length > MAX_REMOTE_ASSET_SIZE_BYTES) {
      throw new BadRequestException('素材大小不能超过 100MB');
    }

    const mimeType = this.normalizeMimeType(response.headers.get('content-type'));
    const originalname = this.buildRemoteOriginalName(trimmedSourceUrl, mimeType);

    return this.storePublicAsset(
      userId,
      {
        buffer,
        size: buffer.length,
        mimetype: mimeType,
        originalname,
      },
      folder,
    );
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

  private async storePublicAsset(
    userId: string,
    file: Pick<ProductUploadFile, 'buffer' | 'size' | 'mimetype' | 'originalname'>,
    folder: string,
  ): Promise<StoredPublicAsset> {
    await this.ensureBucket();

    const objectKey = this.buildObjectKey(userId, file, folder);

    try {
      await this.client.putObject(this.bucketName, objectKey, file.buffer, file.size, {
        'Content-Type': file.mimetype,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch {
      throw new InternalServerErrorException('上传素材到 MinIO 失败');
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

  private buildObjectKey(
    userId: string,
    file: Pick<ProductUploadFile, 'mimetype' | 'originalname'>,
    folder: string,
  ) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const extension = this.resolveExtension(file);

    return `${folder}/${userId}/${year}/${month}/${day}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  private resolveExtension(file: Pick<ProductUploadFile, 'mimetype' | 'originalname'>) {
    const normalized = extname(file.originalname).replace('.', '').toLowerCase();
    if (normalized) {
      return normalized;
    }

    return this.resolveExtensionFromMimeType(file.mimetype);
  }

  private buildPublicBaseUrl(endpoint: string, port: number, useSSL: boolean) {
    const explicit = this.configService.get<string>('MINIO_PUBLIC_BASE_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const protocol = useSSL ? 'https' : 'http';
    const isDefaultPort = (!useSSL && port === 80) || (useSSL && port === 443);

    return `${protocol}://${endpoint}${isDefaultPort ? '' : `:${port}`}`.replace(/\/+$/, '');
  }

  private encodeObjectKey(objectKey: string) {
    return objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private resolveExtensionFromMimeType(mimeType: string) {
    const mimeToExtension: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'application/octet-stream': 'bin',
    };

    return mimeToExtension[mimeType] ?? 'bin';
  }

  private normalizeMimeType(value: string | null) {
    const trimmed = value?.split(';')[0]?.trim().toLowerCase();
    return trimmed || 'application/octet-stream';
  }

  private buildRemoteOriginalName(sourceUrl: string, mimeType: string) {
    try {
      const url = new URL(sourceUrl);
      const pathname = decodeURIComponent(url.pathname);
      const name = pathname.split('/').pop()?.trim();
      if (name) {
        return name;
      }
    } catch {
      // ignore invalid path segments and fall back to mime-based name
    }

    return `remote.${this.resolveExtensionFromMimeType(mimeType)}`;
  }

  private parseDataUrl(value: string) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
    if (!match) {
      return null;
    }

    return {
      mimeType: match[1].trim().toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
    };
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

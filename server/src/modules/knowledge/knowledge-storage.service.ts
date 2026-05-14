import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { encodeObjectKeyForPublicUrl, resolvePublicBucketBaseUrl } from '../shared/public-asset-url.util';
import { normalizeUploadFileName } from './knowledge-file-name.util';
import type { KnowledgeUploadFile } from './knowledge-file.types';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'pptx',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

@Injectable()
export class KnowledgeStorageService {
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
    this.publicBaseUrl =
      resolvePublicBucketBaseUrl({
        bucketName,
        fileBaseUrl: this.configService.get<string>('FILE_BASE_URL'),
        minioPublicBaseUrl: this.configService.get<string>('MINIO_PUBLIC_BASE_URL'),
        endpoint,
        port,
        useSSL,
      }) ?? '';
  }

  async uploadKnowledgeFile(userId: string, file?: KnowledgeUploadFile) {
    this.validateFile(file);
    await this.ensureBucket();

    const extension = this.resolveExtension(file);
    const objectKey = this.buildObjectKey(userId, extension);

    try {
      await this.client.putObject(this.bucketName, objectKey, file.buffer, file.size, {
        'Content-Type': file.mimetype,
        'Cache-Control': 'private, max-age=0, no-cache',
      });
    } catch {
      throw new InternalServerErrorException('上传知识库文件到 MinIO 失败');
    }

    return {
      bucket: this.bucketName,
      objectKey,
      fileExt: extension,
      url: `${this.publicBaseUrl}/${encodeObjectKeyForPublicUrl(objectKey)}`,
    };
  }

  async removeKnowledgeFile(objectKey: string) {
    await this.ensureBucket();
    try {
      await this.client.removeObject(this.bucketName, objectKey);
    } catch {
      throw new InternalServerErrorException('删除知识库文件失败');
    }
  }

  async getKnowledgeFileBuffer(objectKey: string) {
    await this.ensureBucket();

    try {
      const stream = await this.client.getObject(this.bucketName, objectKey);
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      return Buffer.concat(chunks);
    } catch {
      throw new InternalServerErrorException('读取知识库文件失败');
    }
  }

  private validateFile(file?: KnowledgeUploadFile): asserts file is KnowledgeUploadFile {
    if (!file) {
      throw new BadRequestException('请选择知识库文件');
    }

    if (file.size <= 0) {
      throw new BadRequestException('知识库文件不能为空');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('知识库文件大小不能超过 20MB');
    }

    const extension = this.resolveExtension(file);
    if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
      throw new BadRequestException('仅支持 pdf、docx、pptx、txt、md、png、jpg、jpeg、webp 文件');
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
    } catch {
      this.ensureBucketPromise = null;
      throw new InternalServerErrorException('初始化知识库 Bucket 失败');
    }
  }

  private buildObjectKey(userId: string, extension: string) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `knowledge/${userId}/${year}/${month}/${day}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  private resolveExtension(file: KnowledgeUploadFile) {
    return extname(normalizeUploadFileName(file.originalname)).replace('.', '').toLowerCase() || 'bin';
  }

}

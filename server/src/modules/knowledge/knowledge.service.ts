import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  KnowledgeDocumentIndexStatus,
  KnowledgeDocumentJobType,
  KnowledgeDocumentParseStatus,
  Prisma,
  KnowledgeDocumentJobStatus,
} from '@prisma/client';
import type { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import type { ListKnowledgeDocumentsQueryDto } from './dto/list-knowledge-documents-query.dto';
import type { SearchKnowledgeRetrievalDto } from './dto/search-knowledge-retrieval.dto';
import type { UploadKnowledgeDocumentDto } from './dto/upload-knowledge-document.dto';
import { normalizeUploadFileName } from './knowledge-file-name.util';
import type { KnowledgeUploadFile } from './knowledge-file.types';
import { KnowledgeParserService } from './knowledge-parser.service';
import { KnowledgeStorageService } from './knowledge-storage.service';

const knowledgeInclude = {
  creator: {
    select: { id: true, username: true, displayName: true, role: true },
  },
  jobs: {
    orderBy: { createdAt: 'desc' },
    take: 5,
  },
} satisfies Prisma.KnowledgeDocumentInclude;

type KnowledgeDocumentWithRelations = Prisma.KnowledgeDocumentGetPayload<{
  include: typeof knowledgeInclude;
}>;

type RetrievalHitRow = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  contentPreview: string | null;
  score: number;
};

const EMBEDDING_DIM = 1024;
const CHUNK_TARGET_SIZE = 800;
const CHUNK_OVERLAP = 120;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeStorageService: KnowledgeStorageService,
    private readonly knowledgeParserService: KnowledgeParserService,
  ) {}

  async uploadDocument(user: SessionUser, dto: UploadKnowledgeDocumentDto, file?: KnowledgeUploadFile) {
    this.ensureMainCompanyUser(user);

    const uploaded = await this.knowledgeStorageService.uploadKnowledgeFile(user.userId, file);
    const fileName = normalizeUploadFileName(file?.originalname ?? '');
    const title = dto.title?.trim() || this.buildTitle(fileName);

    const created = await this.prisma.knowledgeDocument.create({
      data: {
        creatorId: user.userId,
        kbScope: dto.scope ?? 'company',
        title,
        fileName,
        fileExt: uploaded.fileExt,
        mimeType: file?.mimetype ?? 'application/octet-stream',
        fileSize: file?.size ?? 0,
        bucket: uploaded.bucket,
        objectKey: uploaded.objectKey,
        storageUrl: uploaded.url,
        parseStatus: KnowledgeDocumentParseStatus.pending,
        indexStatus: KnowledgeDocumentIndexStatus.pending,
        jobs: {
          create: {
            jobType: KnowledgeDocumentJobType.parse,
          },
        },
      },
      include: knowledgeInclude,
    });

    this.startIndexDocument(created.id);
    return this.serializeDocument(created);
  }

  async listDocuments(user: SessionUser, query: ListKnowledgeDocumentsQueryDto) {
    this.ensureMainCompanyUser(user);

    const trimmedQuery = query.q?.trim();
    const where: Prisma.KnowledgeDocumentWhereInput = {
      ...(trimmedQuery
        ? {
            OR: [
              { title: { contains: trimmedQuery, mode: 'insensitive' } },
              { fileName: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.indexStatus ? { indexStatus: query.indexStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.knowledgeDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: knowledgeInclude,
      }),
      this.prisma.knowledgeDocument.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeDocument(item)),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async getDocumentById(user: SessionUser, id: string) {
    this.ensureMainCompanyUser(user);
    const document = await this.findDocumentOrThrow(id);
    return this.serializeDocument(document);
  }

  async removeDocument(user: SessionUser, id: string) {
    this.ensureMainCompanyUser(user);
    const document = await this.findDocumentOrThrow(id);
    await this.knowledgeStorageService.removeKnowledgeFile(document.objectKey);
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    return { success: true };
  }

  async searchRetrieval(user: SessionUser, dto: SearchKnowledgeRetrievalDto) {
    this.ensureMainCompanyUser(user);

    const query = dto.query.trim();
    const scope = dto.scope ?? 'company';
    const vectorLiteral = this.toVectorLiteral(this.buildEmbedding(query));

    const rows = await this.prisma.$queryRawUnsafe<RetrievalHitRow[]>(
      `
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS "documentTitle",
          c.content AS "content",
          c."contentPreview" AS "contentPreview",
          1 - (c.embedding <=> CAST($1 AS vector)) AS "score"
        FROM "KnowledgeDocumentChunk" c
        INNER JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        WHERE d."indexStatus" = 'ready'
          AND d."kbScope" = $2
        ORDER BY c.embedding <=> CAST($1 AS vector)
        LIMIT $3
      `,
      vectorLiteral,
      scope,
      dto.topK,
    );

    const hits = rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      score: Number(row.score ?? 0),
      content: row.content,
      snippet: row.contentPreview || row.content.slice(0, 200),
    }));

    return {
      query,
      scope,
      hits,
      answer:
        hits.length > 0
          ? hits
              .slice(0, 3)
              .map((item, index) => `${index + 1}. ${item.snippet}`)
              .join('\n')
          : '当前知识库未检索到相关内容。',
    };
  }

  async retrieveRelevantChunks(query: string, scope: 'company' | 'personal' = 'company', topK = 5) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const vectorLiteral = this.toVectorLiteral(this.buildEmbedding(trimmedQuery));
    const rows = await this.prisma.$queryRawUnsafe<RetrievalHitRow[]>(
      `
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS "documentTitle",
          c.content AS "content",
          c."contentPreview" AS "contentPreview",
          1 - (c.embedding <=> CAST($1 AS vector)) AS "score"
        FROM "KnowledgeDocumentChunk" c
        INNER JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        WHERE d."indexStatus" = 'ready'
          AND d."kbScope" = $2
        ORDER BY c.embedding <=> CAST($1 AS vector)
        LIMIT $3
      `,
      vectorLiteral,
      scope,
      topK,
    );

    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      score: Number(row.score ?? 0),
      content: row.content,
      snippet: row.contentPreview || row.content.slice(0, 200),
    }));
  }

  private async findDocumentOrThrow(id: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      include: knowledgeInclude,
    });

    if (!document) {
      throw new NotFoundException('知识库文档不存在');
    }

    return document;
  }

  private startIndexDocument(documentId: string) {
    void this.indexDocument(documentId).catch(async (error) => {
      const message = error instanceof Error ? error.message : '知识库索引失败';
      this.logger.error(
        `知识库索引任务异常: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: {
            parseStatus: KnowledgeDocumentParseStatus.failed,
            indexStatus: KnowledgeDocumentIndexStatus.failed,
            errorMessage: message,
          },
        });

        await this.prisma.knowledgeDocumentJob.updateMany({
          where: {
            documentId,
            status: {
              in: [KnowledgeDocumentJobStatus.pending, KnowledgeDocumentJobStatus.running],
            },
          },
          data: {
            status: KnowledgeDocumentJobStatus.failed,
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
      } catch (persistError) {
        this.logger.error(
          '知识库索引异常状态写回失败',
          persistError instanceof Error ? persistError.stack : undefined,
        );
      }
    });
  }

  private async indexDocument(documentId: string) {
    const document = await this.findDocumentOrThrow(documentId);
    const parseJob = document.jobs.find((job) => job.jobType === KnowledgeDocumentJobType.parse);
    const parseJobId = parseJob?.id;

    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        parseStatus: KnowledgeDocumentParseStatus.parsing,
        indexStatus: KnowledgeDocumentIndexStatus.indexing,
        errorMessage: null,
      },
    });

    if (parseJobId) {
      await this.prisma.knowledgeDocumentJob.update({
        where: { id: parseJobId },
        data: {
          status: KnowledgeDocumentJobStatus.running,
          startedAt: new Date(),
        },
      });
    }

    try {
      const parsedText = await this.extractDocumentText(document);
      const normalizedText = this.normalizeText(parsedText);
      const chunks = this.buildChunks(normalizedText);

      await this.prisma.knowledgeDocumentJob.updateMany({
        where: { id: parseJobId },
        data: {
          status: KnowledgeDocumentJobStatus.success,
          finishedAt: new Date(),
        },
      });

      const chunkJob = await this.prisma.knowledgeDocumentJob.create({
        data: {
          documentId,
          jobType: KnowledgeDocumentJobType.chunk,
          status: KnowledgeDocumentJobStatus.running,
          startedAt: new Date(),
        },
      });

      const chunkPayloads = chunks.map((content, index) => ({
        chunkIndex: index,
        content,
        contentPreview: content.slice(0, 200),
        charCount: content.length,
        keywords: this.extractKeywords(content),
        embeddingModel: 'local_hash_v1',
        embeddingDim: EMBEDDING_DIM,
        embedding: this.buildEmbedding(content),
      }));

      await this.prisma.knowledgeDocumentChunk.deleteMany({
        where: { documentId },
      });

      for (const chunk of chunkPayloads) {
        const vectorLiteral = this.toVectorLiteral(chunk.embedding);
        await this.prisma.$executeRawUnsafe(
          `
            INSERT INTO "KnowledgeDocumentChunk"
            (
              id,
              "documentId",
              "chunkIndex",
              content,
              "contentPreview",
              "tokenCount",
              "charCount",
              "pageNumber",
              "sectionTitle",
              keywords,
              "embeddingModel",
              "embeddingDim",
              embedding,
              "createdAt",
              "updatedAt"
            )
            VALUES
            (
              gen_random_uuid()::text,
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              NULL,
              NULL,
              $7,
              $8,
              $9,
              CAST($10 AS vector),
              NOW(),
              NOW()
            )
          `,
          documentId,
          chunk.chunkIndex,
          chunk.content,
          chunk.contentPreview,
          this.countTokens(chunk.content),
          chunk.charCount,
          chunk.keywords,
          chunk.embeddingModel,
          chunk.embeddingDim,
          vectorLiteral,
        );
      }

      await this.prisma.knowledgeDocumentJob.update({
        where: { id: chunkJob.id },
        data: {
          status: KnowledgeDocumentJobStatus.success,
          finishedAt: new Date(),
        },
      });

      await this.prisma.knowledgeDocumentJob.create({
        data: {
          documentId,
          jobType: KnowledgeDocumentJobType.embed,
          status: KnowledgeDocumentJobStatus.success,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          parseStatus: KnowledgeDocumentParseStatus.ready,
          indexStatus: KnowledgeDocumentIndexStatus.ready,
          chunkCount: chunkPayloads.length,
          charCount: normalizedText.length,
          summary: normalizedText.slice(0, 300),
          errorMessage: null,
          lastIndexedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '知识库索引失败';
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          parseStatus: KnowledgeDocumentParseStatus.failed,
          indexStatus: KnowledgeDocumentIndexStatus.failed,
          errorMessage: message,
        },
      });

      if (parseJobId) {
        await this.prisma.knowledgeDocumentJob.updateMany({
          where: { id: parseJobId, status: { not: KnowledgeDocumentJobStatus.success } },
          data: {
            status: KnowledgeDocumentJobStatus.failed,
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
      }
    }
  }

  private ensureMainCompanyUser(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可管理知识库');
    }
  }

  private serializeDocument(document: KnowledgeDocumentWithRelations) {
    return {
      id: document.id,
      scope: document.kbScope,
      title: document.title,
      fileName: document.fileName,
      fileExt: document.fileExt,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      bucket: document.bucket,
      objectKey: document.objectKey,
      storageUrl: document.storageUrl,
      parseStatus: document.parseStatus,
      indexStatus: document.indexStatus,
      chunkCount: document.chunkCount,
      charCount: document.charCount,
      language: document.language,
      summary: document.summary,
      errorMessage: document.errorMessage,
      lastIndexedAt: document.lastIndexedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      creator: document.creator,
      jobs: document.jobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        attemptCount: job.attemptCount,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
  }

  private buildTitle(fileName: string) {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return '未命名知识文档';
    }

    const dotIndex = trimmed.lastIndexOf('.');
    return dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  }

  private async extractDocumentText(document: { fileExt: string; objectKey: string }) {
    const buffer = await this.knowledgeStorageService.getKnowledgeFileBuffer(document.objectKey);
    return this.knowledgeParserService.extractText(document.fileExt, buffer);
  }

  private normalizeText(input: string) {
    return input
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private buildChunks(text: string) {
    if (!text) {
      throw new Error('文档内容为空，无法建立索引');
    }

    const paragraphs = text
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if (!current) {
        current = paragraph;
        continue;
      }

      if ((current + '\n\n' + paragraph).length <= CHUNK_TARGET_SIZE) {
        current = `${current}\n\n${paragraph}`;
        continue;
      }

      chunks.push(current);
      current = this.withOverlap(current, paragraph);
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  private withOverlap(current: string, nextParagraph: string) {
    const tail = current.slice(Math.max(0, current.length - CHUNK_OVERLAP)).trim();
    return tail ? `${tail}\n\n${nextParagraph}` : nextParagraph;
  }

  private extractKeywords(text: string) {
    const tokens = this.tokenize(text);
    return Array.from(new Set(tokens)).slice(0, 12);
  }

  private countTokens(text: string) {
    return this.tokenize(text).length;
  }

  private tokenize(text: string) {
    const latinWords = Array.from(text.toLowerCase().matchAll(/[a-z0-9]{2,}/g)).map((match) => match[0]);
    const hanChars = Array.from(text.matchAll(/[\u4e00-\u9fff]/g)).map((match) => match[0]);
    const hanBigrams: string[] = [];

    for (let index = 0; index < hanChars.length - 1; index += 1) {
      hanBigrams.push(`${hanChars[index]}${hanChars[index + 1]}`);
    }

    return [...latinWords, ...hanChars, ...hanBigrams];
  }

  private buildEmbedding(text: string) {
    const vector = new Array<number>(EMBEDDING_DIM).fill(0);
    const tokens = this.tokenize(text);

    if (tokens.length === 0) {
      return vector;
    }

    for (const token of tokens) {
      const bucket = this.hashToken(token) % EMBEDDING_DIM;
      vector[bucket] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!norm) {
      return vector;
    }

    return vector.map((value) => Number((value / norm).toFixed(6)));
  }

  private hashToken(token: string) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  private toVectorLiteral(vector: number[]) {
    return `[${vector.join(',')}]`;
  }
}

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
import { AiService } from '../ai/ai.service';
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

type KnowledgeDocumentDetail = Prisma.KnowledgeDocumentGetPayload<{
  include: typeof knowledgeInclude & {
    chunks: {
      orderBy: { chunkIndex: 'asc' };
    };
  };
}>;

type RetrievalHitRow = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  contentPreview: string | null;
  score: number;
};

export type KnowledgeRetrievalHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  score: number;
  content: string;
  snippet: string;
};

const EMBEDDING_DIM = 1024;
const CHUNK_TARGET_SIZE = 800;
const CHUNK_OVERLAP = 120;
const SMART_CHUNK_BATCH_TARGET = 5000;
const SMART_CHUNK_MAX_COUNT = 24;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeStorageService: KnowledgeStorageService,
    private readonly knowledgeParserService: KnowledgeParserService,
    private readonly aiService: AiService,
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
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        ...knowledgeInclude,
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('知识文档不存在');
    }
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
    const hits = await this.retrieveRelevantChunks(query, scope, dto.topK);

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

  async retrieveRelevantChunks(query: string, scope = 'company', topK = 5): Promise<KnowledgeRetrievalHit[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const vectorLiteral = this.toVectorLiteral(this.buildEmbedding(normalizedQuery));
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
      const chunks = await this.buildChunks(normalizedText);

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

  private serializeDocument(document: KnowledgeDocumentWithRelations | KnowledgeDocumentDetail) {
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
      chunks:
        'chunks' in document
          ? document.chunks.map((chunk) => ({
              id: chunk.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentPreview: chunk.contentPreview,
              charCount: chunk.charCount,
              tokenCount: chunk.tokenCount,
              pageNumber: chunk.pageNumber,
              sectionTitle: chunk.sectionTitle,
              keywords: chunk.keywords,
              embeddingModel: chunk.embeddingModel,
              embeddingDim: chunk.embeddingDim,
              createdAt: chunk.createdAt,
              updatedAt: chunk.updatedAt,
            }))
          : undefined,
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

  private async buildChunks(text: string) {
    if (!text) {
      throw new Error('文档内容为空，无法建立索引');
    }

    return this.buildChunksFallback(text);
  }

  private async buildChunksWithAi(text: string) {
    if (!text.trim()) {
      return [];
    }

    try {
      const paragraphs = this.splitParagraphs(text);
      const batches = this.buildSmartChunkBatches(paragraphs);
      const chunks: string[] = [];

      for (const batch of batches) {
        const response = await this.aiService.generateTextReply({
          system: this.buildKnowledgeChunkSystemPrompt(),
          user: this.buildKnowledgeChunkUserPrompt(batch),
          errorLabel: '知识库智能切片失败',
        });

        chunks.push(...this.parseSmartChunks(response.text));
      }

      return chunks;
    } catch (error) {
      this.logger.warn(
        `知识库智能切片回退到固定规则：${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      return [];
    }
  }

  private buildChunksFallback(text: string) {
    return this.recursiveCharacterSplit(text, CHUNK_TARGET_SIZE, CHUNK_OVERLAP, [
      '\n\n',
      '\n',
      '。 ',
      '。\n',
      '。',
      '！',
      '？',
      '；',
      '，',
      ' ',
      '',
    ]);
  }

  private buildKnowledgeChunkSystemPrompt() {
    return [
      '你是一个中文知识库切片助手，负责把混乱文档整理成适合语义检索的片段。',
      '输入文本可能来自 pdf、ppt、word、ocr，格式可能很乱，可能有错误换行、断句、空白、页码、标题残缺。',
      '你的目标是先识别真实文字结构，再按语义切分，不要机械按固定字数硬切。',
      '你必须先判断每段内容属于哪种结构：章节标题、小标题、正文说明、问答对、步骤流、列表项、表格字段、注意事项、案例、结论。',
      '切片边界优先服从真实结构边界，而不是字数边界。',
      `每个片段尽量控制在 ${Math.round(CHUNK_TARGET_SIZE * 0.6)} 到 ${CHUNK_TARGET_SIZE} 个中文字符以内，允许少量浮动。`,
      '优先保持一个完整语义单元：标题+说明、问答对、步骤段、同一主题说明、表格字段组不要拆开。',
      '如果 OCR 或导出文本存在错误换行，你需要自动合并连续语义行，还原自然段后再切片。',
      '如果某段非常长，可以在自然句边界、步骤边界、子标题边界处分成多个片段。',
      '不要输出重复片段，不要输出过短无意义片段，不要保留页码、孤立标题、目录噪声、页眉页脚噪声、纯装饰性编号。',
      `最多返回 ${SMART_CHUNK_MAX_COUNT} 个片段。`,
      '输出必须只返回 JSON 数组字符串，例如 ["片段1","片段2"]，不要代码块，不要解释。',
    ].join('');
  }

  private buildKnowledgeChunkUserPrompt(text: string) {
    const structuredText = this.buildStructuredChunkInput(text);
    return [
      '请把下面文本智能切分成适合知识库检索的语义片段。',
      '要求：先根据真实文字结构自动识别，再输出最终切片。',
      '执行顺序：',
      '1. 先识别标题层级、正文、列表、步骤、问答、表格字段、注意事项。',
      '2. 再把语义连续但被错误换行打散的内容自动合并。',
      '3. 再按结构边界决定切片，而不是按每一行硬切。',
      '4. 标题尽量和其下属说明放在同一片；问答对、步骤流、字段说明不要拆散。',
      '5. 对目录、页码、页眉页脚、无意义短句可直接忽略。',
      '',
      '下面文本已按行做结构提示标注，请结合内容自动识别真实结构：',
      '',
      structuredText,
    ].join('\n');
  }

  private buildStructuredChunkInput(text: string) {
    return text
      .split('\n')
      .map((line, index) => {
        const normalized = line.trim();
        if (!normalized) {
          return '';
        }

        const label = this.detectChunkLineLabel(normalized);
        return `${String(index + 1).padStart(3, '0')} [${label}] ${normalized}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  private detectChunkLineLabel(line: string) {
    if (this.isNoiseLikeLine(line)) {
      return 'NOISE';
    }
    if (this.isHeadingLikeLine(line)) {
      return 'HEADING';
    }
    if (this.isQuestionAnswerLikeLine(line)) {
      return 'QA';
    }
    if (this.isTableLikeLine(line)) {
      return 'TABLE';
    }
    if (this.isListLikeLine(line)) {
      return 'LIST';
    }
    return 'TEXT';
  }

  private isHeadingLikeLine(line: string) {
    if (line.length > 40) {
      return false;
    }

    return (
      /^第[一二三四五六七八九十0-9]+[章节部分篇条]/.test(line) ||
      /^[0-9一二三四五六七八九十]+[、.．]\S+/.test(line) ||
      /^[（(]?[0-9一二三四五六七八九十]+[)）]\S+/.test(line) ||
      /^(附录|摘要|概述|简介|背景|方案|流程|步骤|总结|结论|注意事项|常见问题|FAQ)[:：]?$/.test(line)
    );
  }

  private isQuestionAnswerLikeLine(line: string) {
    return /^(问|答|Q|A)[:：]/i.test(line);
  }

  private isListLikeLine(line: string) {
    return /^([-*•●◦▪]|[0-9]+[.、）)]|[a-zA-Z][.、)])\s*/.test(line);
  }

  private isTableLikeLine(line: string) {
    return /[|｜│]/.test(line) || /[:：]\s*\S+/.test(line);
  }

  private isNoiseLikeLine(line: string) {
    return (
      /^(第?\s*\d+\s*页|page\s*\d+)$/i.test(line) ||
      /^(目录|contents)$/i.test(line) ||
      /^[\-=_*·•]{3,}$/.test(line)
    );
  }

  private splitParagraphs(text: string) {
    return text
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private buildSmartChunkBatches(paragraphs: string[]) {
    const normalizedParagraphs = paragraphs.flatMap((paragraph) => this.splitOversizedParagraph(paragraph));
    const batches: string[] = [];
    let current = '';

    for (const paragraph of normalizedParagraphs) {
      if (!current) {
        current = paragraph;
        continue;
      }

      if ((current + '\n\n' + paragraph).length <= SMART_CHUNK_BATCH_TARGET) {
        current = `${current}\n\n${paragraph}`;
        continue;
      }

      batches.push(current);
      current = paragraph;
    }

    if (current) {
      batches.push(current);
    }

    return batches;
  }

  private splitOversizedParagraph(paragraph: string) {
    if (paragraph.length <= SMART_CHUNK_BATCH_TARGET) {
      return [paragraph];
    }

    const sentences = this.splitSentences(paragraph);

    if (sentences.length <= 1) {
      return this.splitTextByLength(paragraph, SMART_CHUNK_BATCH_TARGET);
    }

    const parts: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (!current) {
        current = sentence;
        continue;
      }

      if ((current + '\n' + sentence).length <= SMART_CHUNK_BATCH_TARGET) {
        current = `${current}\n${sentence}`;
        continue;
      }

      parts.push(current);
      current = sentence;
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  private splitTextByLength(text: string, maxLength: number) {
    return text.match(new RegExp(`.{1,${maxLength}}`, 'g')) ?? [text];
  }

  private splitSentences(text: string) {
    return text
      .split(/(?<=[。！？；!?;])/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseSmartChunks(raw: string) {
    const parsed = this.parseJsonFromText<unknown>(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === 'string' ? this.normalizeText(item) : ''))
      .filter((item) => item.length >= 40)
      .slice(0, SMART_CHUNK_MAX_COUNT);
  }

  private recursiveCharacterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    separators: string[],
  ) {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return [];
    }

    return this.mergeRecursiveSplits(
      this.recursiveSplit(normalized, chunkSize, separators),
      chunkSize,
      chunkOverlap,
    );
  }

  private recursiveSplit(text: string, chunkSize: number, separators: string[]): string[] {
    const normalized = text.trim();
    if (!normalized) {
      return [];
    }

    if (normalized.length <= chunkSize) {
      return [normalized];
    }

    const separator = separators.find((item) => item === '' || normalized.includes(item)) ?? '';
    const nextSeparators = separators.slice(Math.min(separators.indexOf(separator) + 1, separators.length));

    if (!separator) {
      return this.splitTextByLength(normalized, chunkSize).map((item) => item.trim()).filter(Boolean);
    }

    const splits = this.splitBySeparator(normalized, separator);
    const results: string[] = [];
    let pending: string[] = [];

    const flushPending = () => {
      if (pending.length === 0) {
        return;
      }

      results.push(...this.mergeBySeparator(pending, separator, chunkSize));
      pending = [];
    };

    for (const split of splits) {
      if (!split.trim()) {
        continue;
      }

      if (split.length < chunkSize) {
        pending.push(split);
        continue;
      }

      flushPending();
      results.push(...this.recursiveSplit(split, chunkSize, nextSeparators));
    }

    flushPending();
    return results.map((item) => item.trim()).filter(Boolean);
  }

  private splitBySeparator(text: string, separator: string) {
    if (!separator) {
      return text.split('');
    }

    if (separator === ' ') {
      return text
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const parts = text.split(separator);
    const splits: string[] = [];

    parts.forEach((part, index) => {
      const trimmed = part.trim();
      if (!trimmed) {
        return;
      }

      const suffix = index < parts.length - 1 ? separator : '';
      splits.push(`${trimmed}${suffix}`);
    });

    return splits;
  }

  private mergeBySeparator(splits: string[], separator: string, chunkSize: number) {
    const chunks: string[] = [];
    let current = '';

    for (const split of splits) {
      const candidate = current
        ? separator === ' '
          ? `${current} ${split}`
          : `${current}${split}`
        : split;

      if (candidate.length <= chunkSize) {
        current = candidate;
        continue;
      }

      if (current) {
        chunks.push(current.trim());
      }
      current = split;
    }

    if (current) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private mergeRecursiveSplits(splits: string[], chunkSize: number, chunkOverlap: number) {
    if (splits.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    let current = '';

    for (const split of splits) {
      if (!current) {
        current = split;
        continue;
      }

      if ((current + split).length <= chunkSize) {
        current += split;
        continue;
      }

      chunks.push(current.trim());
      current = this.buildOverlapPrefix(current, chunkOverlap) + split;
    }

    if (current) {
      chunks.push(current.trim());
    }

    return chunks.filter(Boolean);
  }

  private buildOverlapPrefix(text: string, chunkOverlap: number) {
    if (chunkOverlap <= 0) {
      return '';
    }

    return text.slice(Math.max(0, text.length - chunkOverlap)).trim();
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

  private parseJsonFromText<T>(text: string) {
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    const candidates: string[] = [normalized];
    const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]?.trim()) {
      candidates.unshift(fencedMatch[1].trim());
    }

    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      candidates.push(normalized.slice(arrayStart, arrayEnd + 1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        continue;
      }
    }

    return null;
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

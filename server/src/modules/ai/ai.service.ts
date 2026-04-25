import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialGeneratedPost, SocialPostReviewStage } from '@prisma/client';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import {
  AiModelConfigCacheService,
  type StoredModelConfig,
} from './ai-model-config-cache.service';
import { GenerateCopyDto, TextModelConfigInput } from './dto/generate-copy.dto';
import { GenerateImagesDto, ImageModelConfigInput } from './dto/generate-images.dto';
import { GenerateSocialPostDto } from './dto/generate-social-post.dto';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import {
  getProviderPreset,
  inferProviderKeyByUrl,
  resolveProviderProtocol,
  type ModelType,
  type ProviderKey,
  type ProviderProtocol,
} from './model-provider-presets';
import { TestModelConfigDto } from './dto/test-model-config.dto';

type ResolvedModelConfig = {
  enabled: boolean;
  providerKey: ProviderKey;
  protocol: ProviderProtocol;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  apiKey: string;
  modelName: string;
};

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly modelConfigCache: AiModelConfigCacheService,
  ) {}

  async generateCopy(dto: GenerateCopyDto) {
    const style = dto.style ?? 'xhs';
    const format = dto.format ?? 'text';
    const productName = dto.productName?.trim() || '产品';
    const sellingPoints = dto.sellingPoints?.trim() || '更智能/更高效';
    const audience = dto.audience?.trim() || '泛用户';
    const prompt = dto.prompt?.trim() || '';
    const styleLabel = this.pickStyleLabel(style);
    const resolvedConfig = await this.getEffectiveModelConfig('text', dto.modelConfig);

    this.ensureModelEnabled('文字模型', resolvedConfig.enabled);
    this.ensureApiKey('文字模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    try {
      const system =
        '你是一个擅长营销转化的中文内容创作助手。输出必须贴合用户输入，不要编造不存在的功能。';
      const user = [
        `请按${styleLabel}生成一条产品营销内容。`,
        prompt ? `补充提示词：${prompt}` : '',
        `产品名称：${productName}`,
        `目标人群：${audience}`,
        `核心卖点：${sellingPoints}`,
        format === 'html'
          ? '输出为简洁的HTML（仅使用h3/p/ul/li/br等基础标签）。'
          : '输出为纯文本，段落清晰。',
      ]
        .filter(Boolean)
        .join('\n');
      const content = await this.generateTextContent(resolvedConfig, {
        system,
        user,
        errorLabel: '文字模型调用失败',
      });
      if (!content) {
        throw new BadGatewayException('文字模型未返回有效内容');
      }

      if (format === 'html') {
        return {
          text: content,
          html: content,
          used: format,
          provider: resolvedConfig.providerName,
          model: resolvedConfig.modelName,
        };
      }

      return {
        text: content,
        html: `<h3>${productName}推荐</h3><p>${content.split('\n').join('<br/>')}</p>`,
        used: format,
        provider: resolvedConfig.providerName,
        model: resolvedConfig.modelName,
      };
    } catch (error) {
      this.rethrowModelError(error, '文字模型调用失败');
    }
  }

  async generateImages(dto: GenerateImagesDto) {
    const prompt = dto.prompt?.trim() || '请生成一组商品营销图片';
    const sizePreset = dto.sizePreset ?? '3_4';
    const resolution = dto.resolution ?? '1k';
    const referenceImages = (dto.referenceImages ?? []).filter(Boolean).slice(0, 3);
    const resolvedConfig = await this.getEffectiveModelConfig('image', dto.modelConfig);

    this.ensureModelEnabled('图片模型', resolvedConfig.enabled);
    this.ensureApiKey('图片模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    const urls = await this.generateImagesByProtocol(resolvedConfig, {
      prompt,
      sizePreset,
      resolution,
      referenceImages,
      count: 3,
    });

    return {
      urls,
      provider: resolvedConfig.providerName,
      model: resolvedConfig.modelName,
    };
  }

  async testModelConnection(type: string, dto: TestModelConfigDto) {
    const normalizedType = this.parseModelType(type);
    const resolvedConfig = this.resolveModelConfig(normalizedType, dto);

    this.ensureModelEnabled('模型', resolvedConfig.enabled);
    this.ensureApiKey('模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    if (normalizedType === 'text') {
      return this.testTextModelConnection(resolvedConfig);
    }

    if (normalizedType === 'video') {
      return this.testVideoModelConnection(resolvedConfig);
    }

    return this.testImageModelConnection(resolvedConfig);
  }

  async listActiveModelConfigs(user: SessionUser) {
    this.ensureMainCompanyUser(user);
    return this.modelConfigCache.getAll();
  }

  async listSavedModelConfigs(user: SessionUser) {
    this.ensureMainCompanyUser(user);
    return this.modelConfigCache.getAllSaved();
  }

  async activateModelConfig(user: SessionUser, type: string, dto: SaveModelConfigDto) {
    this.ensureMainCompanyUser(user);
    const normalizedType = this.parseModelType(type);
    const resolvedConfig = this.resolveModelConfig(normalizedType, dto);

    this.ensureApiKey('模型', resolvedConfig.apiKey);
    this.ensureBaseUrl(resolvedConfig.baseUrl);

    await this.modelConfigCache.setSaved(
      normalizedType,
      resolvedConfig.providerKey,
      this.toStoredModelConfig(resolvedConfig),
    );

    return this.modelConfigCache.set(normalizedType, this.toStoredModelConfig(resolvedConfig));
  }

  async listSocialPosts(user: SessionUser) {
    const items = await this.prisma.socialGeneratedPost.findMany({
      where: { creatorId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeSocialPost(item));
  }

  async generateSocialPost(user: SessionUser, dto: GenerateSocialPostDto) {
    const prompt = dto.prompt?.trim() || '请生成一版适合当前平台风格的社媒图文。';
    const style = dto.style ?? 'xiaohongshu';
    const sizePreset = dto.sizePreset ?? '3_4';
    const resolution = dto.resolution ?? '1k';
    const referenceImages = (dto.referenceImages ?? []).filter(Boolean).slice(0, 3);

    const [copyResult, imageResult] = await Promise.all([
      this.generateCopy({
        prompt,
        style: style === 'xiaohongshu' ? 'xhs' : style,
        format: 'text',
        modelConfig: dto.textModelConfig,
      }),
      this.generateImages({
        prompt,
        sizePreset,
        resolution,
        referenceImages,
        modelConfig: dto.imageModelConfig,
      }),
    ]);

    const created = await this.prisma.socialGeneratedPost.create({
      data: {
        creatorId: user.userId,
        title: this.buildSocialPostTitle(copyResult.text, style, prompt),
        prompt,
        body: copyResult.text,
        style,
        sizePreset,
        resolution,
        images: imageResult.urls,
        reviewStage: this.isMainCompany(user)
          ? SocialPostReviewStage.approved
          : SocialPostReviewStage.draft,
        synced: false,
      },
    });

    return this.serializeSocialPost(created);
  }

  private async getEffectiveModelConfig(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & TestModelConfigDto>,
  ) {
    const cached = await this.modelConfigCache.get(type);
    if (cached) {
      return this.resolveModelConfig(type, cached);
    }
    return this.resolveModelConfig(type, override);
  }

  private toStoredModelConfig(config: ResolvedModelConfig): StoredModelConfig {
    return {
      enabled: config.enabled,
      providerKey: config.providerKey,
      providerName: config.providerName,
      baseUrl: config.baseUrl,
      taskQueryUrlTemplate: config.taskQueryUrlTemplate,
      apiKey: config.apiKey,
      modelName: config.modelName,
    };
  }

  async submitSocialPost(user: SessionUser, id: string) {
    const existing = await this.findAccessibleSocialPost(user, id);

    if (this.isMainCompany(user)) {
      throw new ForbiddenException('主公司生成内容无需提审');
    }

    if (existing.reviewStage !== SocialPostReviewStage.draft) {
      throw new ForbiddenException('当前状态不可提审');
    }

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: { reviewStage: SocialPostReviewStage.submitted },
    });

    return this.serializeSocialPost(updated);
  }

  async markSocialPostSynced(user: SessionUser, id: string) {
    const existing = await this.findAccessibleSocialPost(user, id);

    if (existing.reviewStage !== SocialPostReviewStage.approved) {
      throw new ForbiddenException('只有审核通过后才能同步到获客');
    }

    const updated = await this.prisma.socialGeneratedPost.update({
      where: { id },
      data: { synced: true },
    });

    return this.serializeSocialPost(updated);
  }

  private pickStyleLabel(style: 'xhs' | 'douyin' | 'wechat') {
    if (style === 'douyin') return '抖音风';
    if (style === 'wechat') return '视频号风';
    return '小红书风';
  }

  private buildSocialPostTitle(
    body: string,
    style: 'xiaohongshu' | 'douyin' | 'wechat',
    prompt: string,
  ) {
    return (
      body
        .split('\n')
        .map((item) => item.trim())
        .find((item) => item.length > 0)
        ?.slice(0, 30) || `${this.pickStyleLabel(style === 'xiaohongshu' ? 'xhs' : style)}｜${prompt.slice(0, 16) || '社媒图文'}`
    );
  }

  private serializeSocialPost(item: SocialGeneratedPost) {
    return {
      id: item.id,
      title: item.title,
      createdAt: item.createdAt,
      body: item.body,
      images: item.images,
      style: item.style,
      sizePreset: item.sizePreset,
      resolution: item.resolution,
      reviewStage: item.reviewStage,
      synced: item.synced,
    };
  }

  private async findAccessibleSocialPost(user: SessionUser, id: string) {
    const item = await this.prisma.socialGeneratedPost.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('生成结果不存在');
    }

    if (item.creatorId !== user.userId) {
      throw new ForbiddenException('无权访问该生成结果');
    }

    return item;
  }

  private resolveModelConfig(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & TestModelConfigDto>,
  ): ResolvedModelConfig {
    const providerKey = this.resolveProviderKey(type, override);
    const preset = getProviderPreset(type, providerKey);
    const legacyRequestUrl =
      (override as Partial<{ requestUrl?: string }> | undefined)?.requestUrl?.trim() || '';
    const baseUrl =
      override?.baseUrl?.trim() ||
      legacyRequestUrl ||
      preset?.baseUrl ||
      '';
    return {
      enabled: override?.enabled ?? true,
      providerKey,
      protocol: resolveProviderProtocol(type, providerKey, baseUrl),
      providerName: override?.providerName?.trim() || preset?.providerName || 'Custom',
      baseUrl,
      taskQueryUrlTemplate:
        override?.taskQueryUrlTemplate?.trim() || preset?.taskQueryUrlTemplate,
      apiKey:
        override?.apiKey?.trim() ||
        this.configService.get<string>('DASHSCOPE_API_KEY') ||
        this.configService.get<string>('ALIYUN_API_KEY') ||
        '',
      modelName: override?.modelName?.trim() || preset?.defaultModelName || '',
    };
  }

  private resolveProviderKey(
    type: ModelType,
    override?: Partial<TextModelConfigInput & ImageModelConfigInput & TestModelConfigDto>,
  ): ProviderKey {
    const rawProviderKey = typeof override?.providerKey === 'string' ? override.providerKey : undefined;
    if (rawProviderKey) {
      return rawProviderKey as ProviderKey;
    }

    const url =
      override?.baseUrl ||
      (override as Partial<{ requestUrl?: string }> | undefined)?.requestUrl;
    return inferProviderKeyByUrl(url, override?.providerName);
  }

  private pickDimensions(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const factor = resolution === '4k' ? 2 : resolution === '2k' ? 1.5 : 1;
    const base =
      sizePreset === '1_1'
        ? [1024, 1024]
        : sizePreset === '4_5'
          ? [1080, 1350]
          : sizePreset === '9_16'
            ? [1080, 1920]
            : sizePreset === '16_9'
              ? [1920, 1080]
              : [1080, 1440];

    return [Math.round(base[0] * factor), Math.round(base[1] * factor)] as const;
  }

  private ensureModelEnabled(label: string, enabled: boolean) {
    if (!enabled) {
      throw new BadRequestException(`${label}未启用`);
    }
  }

  private ensureApiKey(label: string, apiKey: string) {
    if (!apiKey.trim()) {
      throw new BadRequestException(`${label}缺少 API Key`);
    }
  }

  private ensureBaseUrl(baseUrl: string) {
    if (!baseUrl.trim()) {
      throw new BadRequestException('Base URL 不能为空');
    }
  }

  private rethrowModelError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BadRequestException || error instanceof BadGatewayException) {
      throw error;
    }

    if (error instanceof Error && error.message.trim()) {
      throw new BadGatewayException(`${fallbackMessage}：${error.message}`);
    }

    throw new BadGatewayException(fallbackMessage);
  }

  private pickDashScopeSize(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const [width, height] = this.pickDimensions(sizePreset, resolution);
    return `${width}*${height}`;
  }

  private extractHttpUrls(input: unknown) {
    const out: string[] = [];
    const seen = new Set<string>();
    const visit = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string') {
        if ((node.startsWith('http://') || node.startsWith('https://')) && !seen.has(node)) {
          seen.add(node);
          out.push(node);
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const value of node) visit(value);
        return;
      }
      if (typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        for (const value of [obj.url, obj.image, obj.image_url, obj.imageUrl]) {
          visit(value);
        }
        for (const value of Object.values(obj)) {
          visit(value);
        }
      }
    };
    visit(input);
    return out;
  }

  private parseJsonSafely<T>(text: string) {
    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return { raw: text } as T;
    }
  }

  private buildUpstreamErrorMessage(prefix: string, payload: unknown, status?: number) {
    const detail = this.extractErrorMessage(payload);
    return detail ? `${prefix}（${status ?? 'upstream'}）：${detail}` : prefix;
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidates = [
      (payload as { message?: unknown }).message,
      (payload as { error?: { message?: unknown } }).error?.message,
      (payload as { error_msg?: unknown }).error_msg,
      (payload as { msg?: unknown }).msg,
      (payload as { code?: unknown }).code,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private buildTaskQueryUrl(template: string, taskId: string) {
    return template.includes('{taskId}')
      ? template.replaceAll('{taskId}', encodeURIComponent(taskId))
      : template;
  }

  private buildRequestUrl(config: ResolvedModelConfig) {
    const baseUrl = config.baseUrl.replace(/\/+$/, '');

    if (config.protocol === 'gemini_generate_content') {
      return `${baseUrl}/models/${encodeURIComponent(config.modelName)}:generateContent`;
    }

    if (config.protocol === 'openai_chat') {
      return `${baseUrl}/chat/completions`;
    }

    if (config.protocol === 'openai_image') {
      return `${baseUrl}/images/generations`;
    }

    if (config.protocol === 'dashscope_image') {
      return `${baseUrl}/text2image/image-synthesis`;
    }

    if (config.protocol === 'doubao_image') {
      return `${baseUrl}/images/generations`;
    }

    if (config.protocol === 'dashscope_video') {
      return `${baseUrl}/video-generation/video-synthesis`;
    }

    if (config.protocol === 'vidu_video') {
      return `${baseUrl}/ent/v2/text2video`;
    }

    return baseUrl;
  }

  private createJsonHeaders(
    config: ResolvedModelConfig,
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (config.protocol === 'gemini_generate_content') {
      headers['x-goog-api-key'] = config.apiKey;
      return headers;
    }

    if (config.protocol === 'vidu_video') {
      headers.Authorization = `Token ${config.apiKey}`;
      return headers;
    }

    headers.Authorization = `Bearer ${config.apiKey}`;
    return headers;
  }

  private parseDataUrl(value: string) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
    if (!match) {
      return null;
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  private pickOpenAiImageSize(sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9') {
    if (sizePreset === '1_1') return '1024x1024';
    if (sizePreset === '16_9') return '1536x1024';
    return '1024x1536';
  }

  private pickDoubaoImageSize(
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9',
    resolution: '1k' | '2k' | '4k',
  ) {
    const map1k = {
      // Doubao requires at least 3,686,400 pixels even for the lowest preset.
      '1_1': '1920x1920',
      '3_4': '1664x2216',
      '4_5': '1728x2160',
      '9_16': '1440x2560',
      '16_9': '2560x1440',
    } as const;
    const map2k = {
      '1_1': '2048x2048',
      '3_4': '1728x2304',
      '4_5': '1800x2250',
      '9_16': '1600x2848',
      '16_9': '2848x1600',
    } as const;
    const map4k = {
      '1_1': '4096x4096',
      '3_4': '3520x4704',
      '4_5': '3648x4560',
      '9_16': '3040x5504',
      '16_9': '5504x3040',
    } as const;

    if (resolution === '4k') return map4k[sizePreset];
    if (resolution === '2k') return map2k[sizePreset];
    return map1k[sizePreset];
  }

  private extractTaskId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidates = [
      (payload as { task_id?: unknown }).task_id,
      (payload as { taskId?: unknown }).taskId,
      (payload as { output?: { task_id?: unknown; taskId?: unknown } }).output?.task_id,
      (payload as { output?: { task_id?: unknown; taskId?: unknown } }).output?.taskId,
      (payload as { data?: { task_id?: unknown; taskId?: unknown } }).data?.task_id,
      (payload as { data?: { task_id?: unknown; taskId?: unknown } }).data?.taskId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  private parseModelType(type: string): ModelType {
    if (type === 'text' || type === 'image' || type === 'video') {
      return type;
    }

    throw new BadRequestException('模型类型不支持');
  }

  private isMainCompany(user: SessionUser) {
    return user.role === MAIN_COMPANY_ROLE_KEY;
  }

  private ensureMainCompanyUser(user: SessionUser) {
    if (!this.isMainCompany(user)) {
      throw new ForbiddenException('仅主公司可维护模型配置');
    }
  }

  private isWan26Model(model: string) {
    const normalized = model.toLowerCase();
    return normalized === 'wan2.6-image' || normalized.startsWith('wan2.6-');
  }

  private async generateTextContent(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    if (config.protocol === 'gemini_generate_content') {
      return this.geminiGenerateText(config, input);
    }

    return this.openAiStyleGenerateText(config, input);
  }

  private async generateImagesByProtocol(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      referenceImages: string[];
      count: number;
    },
  ) {
    if (config.protocol === 'vidu_video') {
      throw new BadRequestException('Vidu 当前仅支持视频模型，不支持图片生成');
    }

    if (config.protocol === 'openai_image') {
      if (input.referenceImages.length > 0) {
        throw new BadRequestException('当前服务商图片协议暂不支持参考图生成');
      }
      return this.openAiImageGenerate(config, input);
    }

    if (config.protocol === 'doubao_image') {
      return this.doubaoGenerateImages(config, input);
    }

    if (config.protocol === 'gemini_generate_content') {
      return this.geminiGenerateImages(config, input);
    }

    if (input.referenceImages.length > 0) {
      return this.dashscopeReferenceGenerate({
        apiKey: config.apiKey,
        model: config.modelName,
        prompt: input.prompt,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        referenceImages: input.referenceImages,
        requestUrl: this.buildRequestUrl(config),
      });
    }

    if (this.isWan26Model(config.modelName)) {
      return this.dashscopeWan26Generate({
        apiKey: config.apiKey,
        model: config.modelName,
        prompt: input.prompt,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        count: input.count,
        requestUrl: this.buildRequestUrl(config),
      });
    }

    return this.dashscopeTextToImageGenerate({
      apiKey: config.apiKey,
      model: config.modelName,
      prompt: input.prompt,
      sizePreset: input.sizePreset,
      resolution: input.resolution,
      count: input.count,
      requestUrl: this.buildRequestUrl(config),
      taskQueryUrlTemplate: config.taskQueryUrlTemplate,
    });
  }

  private async testTextModelConnection(config: ResolvedModelConfig) {
    const content = await this.generateTextContent(config, {
      user: '请回复“连接成功”。',
      errorLabel: '文字模型测试失败',
    });
    if (!content) {
      throw new BadGatewayException('文字模型测试失败：未返回有效内容');
    }

    return {
      success: true,
      message: '文字模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async testImageModelConnection(config: ResolvedModelConfig) {
    const urls = await this.generateImagesByProtocol(config, {
      prompt: '测试连接，请生成一张简单图片。',
      sizePreset: '1_1',
      resolution: config.protocol === 'doubao_image' ? '2k' : '1k',
      referenceImages: [],
      count: 1,
    });
    if (urls.length === 0) {
      throw new BadGatewayException('图片模型测试失败：未返回可识别结果');
    }

    return {
      success: true,
      message: '图片模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async testVideoModelConnection(config: ResolvedModelConfig) {
    if (config.protocol === 'vidu_video') {
      await this.viduCreateVideoTask(config, '测试连接，请创建一个简短视频任务。');
      return {
        success: true,
        message: '视频模型连接成功，已创建测试任务',
        provider: config.providerName,
        model: config.modelName,
      };
    }

    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        input: {
          prompt: '测试连接，请创建一个简短视频任务。',
        },
      }),
    });

    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('视频模型测试失败', data, response.status),
      );
    }

    const taskId = this.extractTaskId(data);
    if (taskId && config.taskQueryUrlTemplate?.trim()) {
      const queryResponse = await fetch(this.buildTaskQueryUrl(config.taskQueryUrlTemplate, taskId), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });
      const queryData = this.parseJsonSafely(await queryResponse.text());
      if (!queryResponse.ok) {
        throw new BadGatewayException(
          this.buildUpstreamErrorMessage('视频模型任务查询失败', queryData, queryResponse.status),
        );
      }
    }

    return {
      success: true,
      message: taskId ? '视频模型连接成功，已创建测试任务' : '视频模型连接成功',
      provider: config.providerName,
      model: config.modelName,
    };
  }

  private async openAiStyleGenerateText(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.user },
        ],
        temperature: 0.8,
      }),
    });

    const data = this.parseJsonSafely<{ choices?: Array<{ message?: { content?: string } }> }>(
      await response.text(),
    );
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage(input.errorLabel, data, response.status),
      );
    }

    return String(data.choices?.[0]?.message?.content ?? '').trim();
  }

  private async geminiGenerateText(
    config: ResolvedModelConfig,
    input: { system?: string; user: string; errorLabel: string },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        systemInstruction: input.system ? { parts: [{ text: input.system }] } : undefined,
        contents: [
          {
            role: 'user',
            parts: [{ text: input.user }],
          },
        ],
      }),
    });

    const data = this.parseJsonSafely<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage(input.errorLabel, data, response.status),
      );
    }

    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => String(part.text ?? '').trim())
      .filter(Boolean)
      .join('\n');
    return content.trim();
  }

  private async openAiImageGenerate(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      count: number;
    },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        prompt: input.prompt,
        n: input.count,
        size: this.pickOpenAiImageSize(input.sizePreset),
      }),
    });

    const data = this.parseJsonSafely<{
      data?: Array<{ url?: string; b64_json?: string }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.data ?? [])
      .map((item) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
      })
      .filter(Boolean);

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async doubaoGenerateImages(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
      resolution: '1k' | '2k' | '4k';
      referenceImages: string[];
      count: number;
    },
  ) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        prompt: input.prompt,
        ...(input.referenceImages.length > 0
          ? {
              image:
                input.referenceImages.length === 1
                  ? input.referenceImages[0]
                  : input.referenceImages.slice(0, 14),
            }
          : {}),
        size: this.pickDoubaoImageSize(input.sizePreset, input.resolution),
        sequential_image_generation: input.count > 1 ? 'auto' : 'disabled',
      }),
    });

    const data = this.parseJsonSafely<{
      data?: Array<{ url?: string; b64_json?: string }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.data ?? [])
      .map((item) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
      })
      .filter(Boolean)
      .slice(0, Math.max(1, input.count));

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async geminiGenerateImages(
    config: ResolvedModelConfig,
    input: {
      prompt: string;
      referenceImages: string[];
      count: number;
    },
  ) {
    const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    for (const image of input.referenceImages) {
      const parsed = this.parseDataUrl(image);
      if (parsed) {
        parts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        });
      }
    }

    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    const data = this.parseJsonSafely<{
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    }>(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型调用失败', data, response.status),
      );
    }

    const urls = (data.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => {
        const mimeType = part.inlineData?.mimeType;
        const raw = part.inlineData?.data;
        return mimeType && raw ? `data:${mimeType};base64,${raw}` : '';
      })
      .filter(Boolean)
      .slice(0, input.count);

    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回有效图片');
    }

    return urls;
  }

  private async viduCreateVideoTask(config: ResolvedModelConfig, prompt: string) {
    const response = await fetch(this.buildRequestUrl(config), {
      method: 'POST',
      headers: this.createJsonHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        prompt,
        style: 'general',
        duration: 4,
      }),
    });
    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('视频模型测试失败', data, response.status),
      );
    }

    const taskId = this.extractTaskId(data);
    if (!taskId) {
      throw new BadGatewayException('视频模型测试失败：未返回任务 ID');
    }

    return taskId;
  }

  private async dashscopeReferenceGenerate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    referenceImages: string[];
    requestUrl: string;
  }) {
    const size = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const response = await fetch(opts.requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                ...opts.referenceImages.slice(0, 3).map((image) => ({ image })),
                {
                  text: `请基于参考图生成新的商品营销图片，保留主体商品特征与整体风格一致性，并结合以下要求：${opts.prompt}`,
                },
              ],
            },
          ],
        },
        parameters: {
          n: 3,
          negative_prompt: '低清晰度，模糊，变形，多余文字，水印，logo',
          prompt_extend: true,
          watermark: false,
          size,
        },
      }),
    });

    const data = this.parseJsonSafely(await response.text());
    if (!response.ok) {
      throw new BadGatewayException(
        this.buildUpstreamErrorMessage('图片模型参考图生成失败', data, response.status),
      );
    }

    const urls = this.extractHttpUrls(data).slice(0, 3);
    if (urls.length === 0) {
      throw new BadGatewayException('图片模型未返回参考图生成结果');
    }

    return urls;
  }

  private async dashscopeWan26Generate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    count: number;
    requestUrl: string;
  }) {
    const seedBase = Math.floor(Math.random() * 2000000000);
    const preferredSize = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const fallbackSizes = ['1024*1024', preferredSize].filter(
      (value, index, array) => array.indexOf(value) === index,
    );
    const urls: string[] = [];
    let lastErrorMessage = '图片模型未返回有效图片';

    for (let i = 0; i < opts.count; i += 1) {
      for (const size of fallbackSizes) {
        const attempts: Array<{ input: unknown; parameters: Record<string, unknown> }> = [
          {
            input: {
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'text', text: opts.prompt }],
                },
              ],
            },
            parameters: { size, seed: seedBase + i },
          },
          {
            input: {
              messages: [
                {
                  role: 'user',
                  content: [{ text: opts.prompt }],
                },
              ],
            },
            parameters: { size, seed: seedBase + i },
          },
          {
            input: { prompt: opts.prompt },
            parameters: { size, seed: seedBase + i },
          },
        ];

        for (const attempt of attempts) {
          const response = await fetch(
            opts.requestUrl,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: opts.model,
                input: attempt.input,
                parameters: attempt.parameters,
              }),
            },
          );

          const data = this.parseJsonSafely(await response.text());

          if (!response.ok) {
            lastErrorMessage = this.buildUpstreamErrorMessage(
              '图片模型调用失败',
              data,
              response.status,
            );
            continue;
          }

          const candidates = this.extractHttpUrls(data);
          const imageUrl =
            candidates.find((url) => /\.(png|jpe?g|webp)(\?|$)/i.test(url)) ??
            candidates.find((url) => /aliyuncs\.com|oss-/.test(url)) ??
            candidates[0];

          if (imageUrl) {
            urls.push(imageUrl);
            break;
          }
        }

        if (urls.length >= i + 1) {
          break;
        }
      }
    }

    if (urls.length === 0) {
      throw new BadGatewayException(lastErrorMessage);
    }

    return urls;
  }

  private async dashscopeTextToImageGenerate(opts: {
    apiKey: string;
    model: string;
    prompt: string;
    sizePreset: '1_1' | '3_4' | '4_5' | '9_16' | '16_9';
    resolution: '1k' | '2k' | '4k';
    count: number;
    requestUrl: string;
    taskQueryUrlTemplate?: string;
  }) {
    const size = this.pickDashScopeSize(opts.sizePreset, opts.resolution);
    const seedBase = Math.floor(Math.random() * 2000000000);
    const taskIds: string[] = [];
    let lastErrorMessage = '图片模型未返回有效任务';

    for (let i = 0; i < opts.count; i += 1) {
      const response = await fetch(opts.requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: opts.model,
          input: {
            prompt: `高质量产品主图，商品：${opts.prompt}，干净背景，商业摄影光照，8k分辨率，杰作`,
          },
          parameters: {
            size,
            seed: seedBase + i,
          },
        }),
      });

      const data = this.parseJsonSafely<{
        output?: { task_id?: string };
      }>(await response.text());

      if (!response.ok) {
        lastErrorMessage = this.buildUpstreamErrorMessage(
          '图片模型调用失败',
          data,
          response.status,
        );
        continue;
      }

      const taskId = data.output?.task_id;
      if (taskId) {
        taskIds.push(taskId);
      } else {
        const directUrls = this.extractHttpUrls(data);
        if (directUrls.length > 0) {
          return directUrls.slice(0, opts.count);
        }
      }
    }

    if (taskIds.length === 0) {
      throw new BadGatewayException(lastErrorMessage);
    }

    if (!opts.taskQueryUrlTemplate?.trim()) {
      throw new BadGatewayException('图片模型返回了异步任务，但未配置任务查询地址模板');
    }

    const urls: string[] = [];
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (urls.length >= taskIds.length) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      for (const taskId of taskIds) {
        const response = await fetch(this.buildTaskQueryUrl(opts.taskQueryUrlTemplate, taskId), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
          },
        });
        const data = this.parseJsonSafely<{
          output?: { task_status?: string; results?: Array<{ url?: string }> };
        }>(await response.text());

        if (!response.ok) {
          lastErrorMessage = this.buildUpstreamErrorMessage(
            '图片任务查询失败',
            data,
            response.status,
          );
          continue;
        }

        if (data.output?.task_status !== 'SUCCEEDED') {
          continue;
        }

        for (const result of data.output.results ?? []) {
          const url = String(result.url ?? '');
          if (url && !urls.includes(url)) {
            urls.push(url);
          }
        }
      }
    }

    if (urls.length === 0) {
      throw new BadGatewayException(lastErrorMessage || '图片模型任务未返回图片');
    }

    return urls;
  }
}

import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  const user = { userId: 'test-user' } as never;

  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const prismaService = {} as never;

  const modelConfigCache = {
    get: jest.fn().mockResolvedValue(null),
  } as unknown as AiModelConfigCacheService;

  const modelConfig = {
    enabled: true,
    providerKey: 'openai',
    providerName: 'OpenAI Compatible',
    baseUrl: 'https://example.com/v1/chat/completions',
    apiKey: 'test-key',
    modelName: 'gpt-test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiService(configService, prismaService, modelConfigCache);
  });

  it('returns polished prompt for social post scene', async () => {
    const generateTextContent = jest
      .spyOn(service as never, 'generateTextContent')
      .mockResolvedValue('请突出封面主体、场景氛围和种草语气。');

    const result = await service.promptPolish(user, {
      prompt: '给我写一个社媒图文提示词',
      scene: 'social_post',
      modelConfig,
    });

    expect(result).toEqual({
      prompt: '请突出封面主体、场景氛围和种草语气。',
      provider: 'OpenAI Compatible',
      model: 'gpt-test',
    });
    expect(generateTextContent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: 'OpenAI Compatible',
        modelName: 'gpt-test',
      }),
      expect.objectContaining({
        errorLabel: '提示词润色失败',
      }),
    );
  });

  it('throws when prompt is empty', async () => {
    await expect(
      service.promptPolish(user, {
        prompt: '   ',
        scene: 'social_post',
        modelConfig,
      }),
    ).rejects.toThrow(new BadRequestException('提示词不能为空'));
  });

  it('throws when upstream returns empty content', async () => {
    jest.spyOn(service as never, 'generateTextContent').mockResolvedValue('   ');

    await expect(
      service.promptPolish(user, {
        prompt: '给我写一个商品详情图提示词',
        scene: 'product_image',
        modelConfig,
      }),
    ).rejects.toThrow(new BadGatewayException('提示词润色未返回有效内容'));
  });

  it('normalizes generated hashtag strings into stored tags', () => {
    const tags = (service as never)['normalizeGeneratedTags']('#智能好物 #高效工具 #智能好物');

    expect(tags).toEqual(['智能好物', '高效工具']);
  });

  it('uses Xiaohongshu soft-seeding rules in generate-copy system prompt', () => {
    const prompt = (service as never)['buildGenerateCopySystemPrompt']('social_post');

    expect(prompt).toContain('小红书软种草');
    expect(prompt).toContain('热门种草节奏');
    expect(prompt).toContain('情绪词和口语化表达');
    expect(prompt).toContain('反差/痛点/场景切入');
    expect(prompt).toContain('典型句式');
  });

  it('keeps body style unified as Xiaohongshu soft-seeding in generate-copy user prompt', () => {
    const prompt = (service as never)['buildGenerateCopyUserPrompt']({
      scene: 'social_post',
      styleLabel: '抖音',
      prompt: '突出轻巧便携',
      productName: '随行杯',
      audience: '通勤女生',
      sellingPoints: '轻便 保温 高颜值',
    });

    expect(prompt).toContain('发布平台：抖音');
    expect(prompt).toContain('正文风格统一按“小红书软种草”输出');
    expect(prompt).toContain('发布平台信息仅用于帮助你判断标签方向');
  });

  it('uses dedicated product detail system prompt for product image copy scene', () => {
    const prompt = (service as never)['buildGenerateCopySystemPrompt']('product_image');

    expect(prompt).toContain('专业电商商品文案助手');
    expect(prompt).toContain('电商详情页');
    expect(prompt).toContain('【产品整体介绍】');
    expect(prompt).toContain('如果部分参数未提供');
  });

  it('uses dedicated product detail user prompt for product image copy scene', () => {
    const prompt = (service as never)['buildGenerateCopyUserPrompt']({
      scene: 'product_image',
      styleLabel: '小红书风',
      prompt: '突出玻璃质感和桌面氛围',
      productName: '香薰蜡烛',
      audience: '居家女生',
      sellingPoints: '颜值高 氛围感强',
    });

    expect(prompt).toContain('请生成一份商品详情文案');
    expect(prompt).toContain('若部分参数缺失');
    expect(prompt).toContain('产品名称：香薰蜡烛');
    expect(prompt).toContain('严格返回 JSON');
  });

  it('uses dedicated product image system prompt only for product image scene', () => {
    const prompt = (service as never)['buildGenerateImagesPrompt']('product_image', '突出玻璃质感和细节特写');

    expect(prompt).toContain('资深电商商品视觉生成助手');
    expect(prompt).toContain('电商详情页长图');
    expect(prompt).toContain('商品原图真实还原 + 电商详情页高级展示');
    expect(prompt).toContain('用户补充要求：突出玻璃质感和细节特写');
  });

  it('keeps social post image prompt unchanged', () => {
    const prompt = (service as never)['buildGenerateImagesPrompt']('social_post', '保留原始社媒出图提示词');

    expect(prompt).toBe('保留原始社媒出图提示词');
  });
});

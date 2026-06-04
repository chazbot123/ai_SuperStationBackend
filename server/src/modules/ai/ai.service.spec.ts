import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;

  const user = {
    userId: 'user-1',
  } as never;

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

  it('treats blank prompt as invalid before calling upstream', async () => {
    jest.spyOn(service as never, 'generateTextContent').mockResolvedValue('   ');

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

  it('keeps full openai chat endpoint when baseUrl already points to chat completions', () => {
    const requestUrl = (service as never)['buildRequestUrl']({
      ...modelConfig,
      protocol: 'openai_chat',
    });

    expect(requestUrl).toBe('https://example.com/v1/chat/completions');
  });

  it('appends openai chat endpoint when baseUrl is api root', () => {
    const requestUrl = (service as never)['buildRequestUrl']({
      ...modelConfig,
      baseUrl: 'https://example.com/v1',
      protocol: 'openai_chat',
    });

    expect(requestUrl).toBe('https://example.com/v1/chat/completions');
  });

  it('retries openai-style text request without temperature when gateway returns 400', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: 'openai_error' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '连接成功' } }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const content = await (service as never)['openAiStyleGenerateText'](
      {
        ...modelConfig,
        protocol: 'openai_chat',
      },
      {
        user: '请回复“连接成功”。',
        errorLabel: '文字模型测试失败',
      },
    );

    expect(content).toBe('连接成功');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body));
    expect(firstBody.temperature).toBe(0.8);
    expect(secondBody.temperature).toBeUndefined();
  });

  it('throws upstream error after retry also fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: 'openai_error' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'model not found' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      (service as never)['openAiStyleGenerateText'](
        {
          ...modelConfig,
          protocol: 'openai_chat',
        },
        {
          user: '请回复“连接成功”。',
          errorLabel: '文字模型测试失败',
        },
      ),
    ).rejects.toThrow(new BadGatewayException('文字模型测试失败（400）：model not found'));
  });

  it('normalizes generated hashtag strings into stored tags', () => {
    const tags = (service as never)['normalizeGeneratedTags']('#智能好物 #高效工具 #智能好物');

    expect(tags).toEqual(['智能好物', '高效工具']);
  });

  it('uses Xiaohongshu soft-seeding rules in generate-copy system prompt', () => {
    const prompt = (service as never)['buildGenerateCopySystemPrompt']();

    expect(prompt).toContain('中文互联网风格图文内容');
    expect(prompt).toContain('情绪词和口语化表达');
    expect(prompt).toContain('反差/痛点/场景切入');
    expect(prompt).toContain('中文互联网常见内容句式');
    expect(prompt).toContain('不要把正文写成固定的小红书腔');
  });

  it('keeps body style unified as Xiaohongshu soft-seeding in generate-copy user prompt', () => {
    const prompt = (service as never)['buildGenerateCopyUserPrompt']({
      styleLabel: '抖音',
      prompt: '突出轻巧便携',
      productName: '随行杯',
      audience: '通勤女生',
      sellingPoints: '轻便 保温 高颜值',
    });

    expect(prompt).toContain('发布平台：抖音');
    expect(prompt).toContain('正文风格请按中文互联网内容表达生成');
    expect(prompt).toContain('结合当前发布平台微调语气、节奏与标签方向');
  });
});

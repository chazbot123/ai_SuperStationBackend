import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModelConfigCacheService } from './ai-model-config-cache.service';
import { AiService } from './ai.service';
import { resolveProviderProtocol } from './model-provider-presets';

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

  it('builds veo video payload with Gemini contents structure', () => {
    const payload = (service as never)['buildVeoVideoRequestBody']({
      prompt: '测试连接，请创建一个简短视频任务。',
      durationSeconds: 4,
      aspectRatio: '16:9',
      resolution: '720p',
    });

    expect(payload).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: '测试连接，请创建一个简短视频任务。' }],
        },
      ],
      generationConfig: {
        durationSeconds: 4,
        aspectRatio: '16:9',
        resolution: '720p',
        generateAudio: false,
      },
    });
  });

  it('tests veo video connection with contents payload', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'operations/test-task' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await (service as never)['testVideoModelConnection']({
      providerName: 'Veo Omni',
      modelName: 'gemini-veo-3.1-generate-preview-re4-r5',
      baseUrl: 'https://api.example.com/v1beta',
      apiKey: 'test-key',
      protocol: 'veo_video',
    });

    expect(result).toEqual({
      success: true,
      message: '视频模型连接成功，已创建测试任务',
      provider: 'Veo Omni',
      model: 'gemini-veo-3.1-generate-preview-re4-r5',
    });

    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: '测试连接，请创建一个简短视频任务。' }],
      },
    ]);
    expect(requestBody.generationConfig).toEqual({
      durationSeconds: 4,
      aspectRatio: '16:9',
      resolution: '720p',
      generateAudio: false,
    });
  });

  it('infers custom video provider protocol as unified gateway for sora-compatible models', () => {
    const protocol = resolveProviderProtocol(
      'video',
      'custom',
      'https://api.52hertz-palpitata.cn/v1',
      'seedance 2.0',
      'sora-2',
    );

    expect(protocol).toBe('unified_video_gateway');
  });

  it('infers veo omni provider protocol as unified gateway when base url points to gateway', () => {
    const protocol = resolveProviderProtocol(
      'video',
      'veo_omni',
      'https://api.52hertz-palpitata.cn/v1',
      'Veo Omni',
      'gemini-veo-3.1-generate-preview-ref-8s',
    );

    expect(protocol).toBe('unified_video_gateway');
  });

  it('tests unified gateway video connection with /v1/videos payload', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task_demo_1', status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task_demo_1', status: 'in_progress' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const result = await (service as never)['testVideoModelConnection']({
      providerName: 'seedance 2.0',
      modelName: 'sora-2',
      baseUrl: 'https://api.52hertz-palpitata.cn/v1',
      apiKey: 'test-key',
      protocol: 'unified_video_gateway',
    });

    expect(result).toEqual({
      success: true,
      message: '视频模型连接成功，已创建测试任务',
      provider: 'seedance 2.0',
      model: 'sora-2',
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://api.52hertz-palpitata.cn/v1/videos');

    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual({
      model: 'sora-2',
      prompt: '测试连接，请创建一个简短视频任务。',
      aspect_ratio: '16:9',
      resolution: '720p',
      seconds: '8',
    });
    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe('https://api.52hertz-palpitata.cn/v1/videos/task_demo_1');
  });

  it('allows unified gateway veo ref models to generate with reference images', async () => {
    jest.spyOn(service as never, 'getEffectiveModelConfig').mockResolvedValue({
      enabled: true,
      providerKey: 'custom',
      providerName: 'Unified Gateway',
      modelName: 'gemini-veo-3.1-generate-preview-ref-8s',
      baseUrl: 'https://api.52hertz-palpitata.cn/v1',
      apiKey: 'test-key',
      protocol: 'unified_video_gateway',
    });

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'task_veo_ref_1', status: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await service.generateVideo(user, {
      prompt: '让参考图人物在森林晨光中行走',
      referenceImages: [
        'https://example.com/character-front.png',
        'https://example.com/character-side.png',
      ],
      aspectRatio: '16:9',
      resolution: '720p',
      modelConfig,
    });

    expect(result).toEqual({
      provider: 'Unified Gateway',
      model: 'gemini-veo-3.1-generate-preview-ref-8s',
      status: 'processing',
      taskId: 'task_veo_ref_1',
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://api.52hertz-palpitata.cn/v1/videos');
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'gemini-veo-3.1-generate-preview-ref-8s',
      prompt: '让参考图人物在森林晨光中行走',
      generate_audio: false,
      size: '1280x720',
      images: [
        'https://example.com/character-front.png',
        'https://example.com/character-side.png',
      ],
    });
  });

  it('forces unified gateway veo reference video requests to 16:9 even when dto uses 9:16', async () => {
    jest.spyOn(service as never, 'getEffectiveModelConfig').mockResolvedValue({
      enabled: true,
      providerKey: 'custom',
      providerName: 'Unified Gateway',
      modelName: 'gemini-veo-3.1-generate-preview-ref-8s',
      baseUrl: 'https://api.52hertz-palpitata.cn/v1',
      apiKey: 'test-key',
      protocol: 'unified_video_gateway',
    });

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'task_veo_ref_2', status: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await service.generateVideo(user, {
      prompt: '让参考图人物在森林晨光中行走',
      referenceImages: ['https://example.com/character-front.png'],
      aspectRatio: '9:16',
      resolution: '1080p',
      modelConfig,
    });

    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'gemini-veo-3.1-generate-preview-ref-8s',
      prompt: '让参考图人物在森林晨光中行走',
      generate_audio: false,
      size: '1920x1080',
      image_url: 'https://example.com/character-front.png',
    });
  });

  it('drops mismatched google query template when veo omni actually uses unified gateway', () => {
    const resolved = (service as never)['resolveModelConfig']('video', {
      providerKey: 'veo_omni',
      providerName: 'Veo Omni',
      baseUrl: 'https://api.52hertz-palpitata.cn/v1',
      taskQueryUrlTemplate: 'https://generativelanguage.googleapis.com/v1beta/{taskId}',
      apiKey: 'test-key',
      modelName: 'gemini-veo-3.1-generate-preview-ref-8s',
    });

    expect(resolved.protocol).toBe('unified_video_gateway');
    expect(resolved.taskQueryUrlTemplate).toBeUndefined();
  });

  it('drops same-host legacy seedance query template when sora-2 actually uses unified gateway', () => {
    const resolved = (service as never)['resolveModelConfig']('video', {
      providerKey: 'seedance',
      providerName: 'Seedance 2.0',
      baseUrl: 'https://api.52hertz-palpitata.cn/v1',
      taskQueryUrlTemplate: 'https://api.52hertz-palpitata.cn/api/v3/contents/generations/tasks/{taskId}',
      apiKey: 'test-key',
      modelName: 'sora-2',
    });

    expect(resolved.protocol).toBe('unified_video_gateway');
    expect(resolved.taskQueryUrlTemplate).toBeUndefined();
  });

  it('humanizes nested model_not_found errors from unified gateway distributors', () => {
    const message = (service as never)['buildUpstreamErrorMessage'](
      '视频模型测试失败',
      {
        code: 'fail_to_fetch_task',
        message:
          '{"error":{"code":"model_not_found","message":"No available channel for model sora-2 under group SD2 (distributor) (request id: 202606050559167882073338268d9d6PTKTWhMC)","type":"new_api_error"}}',
      },
      503,
    );

    expect(message).toBe(
      '视频模型测试失败（503）：上游分组 SD2 未开通模型 sora-2 的可用通道，请联系上游开通后重试',
    );
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

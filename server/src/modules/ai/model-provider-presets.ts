export type ModelType = 'text' | 'image' | 'video';

export type ProviderKey =
  | 'qwen'
  | 'doubao'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'vidu'
  | 'custom';

export type ProviderProtocol =
  | 'openai_chat'
  | 'gemini_generate_content'
  | 'dashscope_image'
  | 'doubao_image'
  | 'openai_image'
  | 'dashscope_video'
  | 'vidu_video';

export type ProviderPreset = {
  key: ProviderKey;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  defaultModelName: string;
  protocol: ProviderProtocol;
};

export const MODEL_PROVIDER_KEYS = ['qwen', 'doubao', 'openai', 'deepseek', 'gemini', 'vidu', 'custom'] as const;

const providerPresets: Record<ModelType, Partial<Record<ProviderKey, ProviderPreset>>> = {
  text: {
    qwen: {
      key: 'qwen',
      providerName: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModelName: 'qwen-plus',
      protocol: 'openai_chat',
    },
    doubao: {
      key: 'doubao',
      providerName: 'Doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      defaultModelName: 'doubao-seed-1-6-250615',
      protocol: 'openai_chat',
    },
    openai: {
      key: 'openai',
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModelName: 'gpt-4.1-mini',
      protocol: 'openai_chat',
    },
    deepseek: {
      key: 'deepseek',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModelName: 'deepseek-v4-pro',
      protocol: 'openai_chat',
    },
    gemini: {
      key: 'gemini',
      providerName: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModelName: 'gemini-2.5-flash',
      protocol: 'gemini_generate_content',
    },
    custom: {
      key: 'custom',
      providerName: 'Custom',
      baseUrl: '',
      defaultModelName: '',
      protocol: 'openai_chat',
    },
  },
  image: {
    qwen: {
      key: 'qwen',
      providerName: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc',
      taskQueryUrlTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
      defaultModelName: 'qwen-image-max',
      protocol: 'dashscope_image',
    },
    openai: {
      key: 'openai',
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModelName: 'gpt-image-1',
      protocol: 'openai_image',
    },
    gemini: {
      key: 'gemini',
      providerName: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModelName: 'gemini-2.5-flash-image',
      protocol: 'gemini_generate_content',
    },
    doubao: {
      key: 'doubao',
      providerName: 'Doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      defaultModelName: 'doubao-seedream-5.0-lite',
      protocol: 'doubao_image',
    },
    vidu: {
      key: 'vidu',
      providerName: 'Vidu',
      baseUrl: 'https://api.vidu.cn',
      taskQueryUrlTemplate: 'https://api.vidu.cn/ent/v2/tasks/{taskId}/creations',
      defaultModelName: 'viduq1',
      protocol: 'vidu_video',
    },
    custom: {
      key: 'custom',
      providerName: 'Custom',
      baseUrl: '',
      defaultModelName: '',
      protocol: 'openai_image',
    },
  },
  video: {
    qwen: {
      key: 'qwen',
      providerName: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc',
      taskQueryUrlTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
      defaultModelName: 'wanx-video-v1',
      protocol: 'dashscope_video',
    },
    vidu: {
      key: 'vidu',
      providerName: 'Vidu',
      baseUrl: 'https://api.vidu.cn',
      taskQueryUrlTemplate: 'https://api.vidu.cn/ent/v2/tasks/{taskId}/creations',
      defaultModelName: 'viduq1',
      protocol: 'vidu_video',
    },
    custom: {
      key: 'custom',
      providerName: 'Custom',
      baseUrl: '',
      defaultModelName: '',
      protocol: 'vidu_video',
    },
  },
};

export function getProviderPreset(type: ModelType, key?: ProviderKey | null) {
  if (!key) return null;
  return providerPresets[type][key] ?? null;
}

export function inferProviderKeyByUrl(requestUrl?: string, providerName?: string): ProviderKey {
  const url = requestUrl?.toLowerCase() ?? '';
  const name = providerName?.toLowerCase() ?? '';

  if (url.includes('dashscope') || name.includes('qwen')) return 'qwen';
  if (url.includes('byteplus') || url.includes('volces') || name.includes('doubao')) return 'doubao';
  if (url.includes('openai.com') || name.includes('openai') || name.includes('gpt')) return 'openai';
  if (url.includes('deepseek.com') || name.includes('deepseek')) return 'deepseek';
  if (url.includes('generativelanguage.googleapis.com') || name.includes('gemini')) return 'gemini';
  if (url.includes('vidu.com') || url.includes('vidu.cn') || name.includes('vidu')) return 'vidu';
  return 'custom';
}

export function resolveProviderProtocol(type: ModelType, key: ProviderKey, requestUrl?: string) {
  const preset = getProviderPreset(type, key);
  if (preset && preset.protocol) {
    return preset.protocol;
  }

  const inferred = inferProviderKeyByUrl(requestUrl);
  return getProviderPreset(type, inferred)?.protocol ?? 'openai_chat';
}

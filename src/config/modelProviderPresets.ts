export type ModelType = "text" | "image" | "video";

export type ProviderKey =
  | "qwen"
  | "doubao"
  | "openai"
  | "deepseek"
  | "gemini"
  | "veo_omni"
  | "veo"
  | "seedance"
  | "vidu"
  | "custom";

export type ProviderPreset = {
  key: ProviderKey;
  label: string;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  defaultModelName: string;
};

const providerPresets: Record<ModelType, ProviderPreset[]> = {
  text: [
    {
      key: "qwen",
      label: "千问",
      providerName: "Qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultModelName: "qwen-plus",
    },
    {
      key: "doubao",
      label: "豆包",
      providerName: "Doubao",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      defaultModelName: "doubao-seed-1-6-250615",
    },
    {
      key: "openai",
      label: "GPT",
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      defaultModelName: "gpt-4.1-mini",
    },
    {
      key: "deepseek",
      label: "DeepSeek",
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModelName: "deepseek-v4-pro",
    },
    {
      key: "gemini",
      label: "Gemini",
      providerName: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      defaultModelName: "gemini-2.5-flash",
    },
    {
      key: "custom",
      label: "自定义",
      providerName: "Custom",
      baseUrl: "",
      defaultModelName: "",
    },
  ],
  image: [
    {
      key: "qwen",
      label: "千问",
      providerName: "Qwen",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
      taskQueryUrlTemplate: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      defaultModelName: "qwen-image-max",
    },
    {
      key: "openai",
      label: "GPT",
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      defaultModelName: "gpt-image-1",
    },
    {
      key: "gemini",
      label: "Gemini",
      providerName: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      defaultModelName: "gemini-2.5-flash-image",
    },
    {
      key: "doubao",
      label: "豆包",
      providerName: "Doubao",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      defaultModelName: "doubao-seedream-5.0-lite",
    },
    {
      key: "vidu",
      label: "Vidu",
      providerName: "Vidu",
      baseUrl: "https://api.vidu.cn",
      taskQueryUrlTemplate: "https://api.vidu.cn/ent/v2/tasks/{taskId}/creations",
      defaultModelName: "viduq1",
    },
    {
      key: "custom",
      label: "自定义",
      providerName: "Custom",
      baseUrl: "",
      defaultModelName: "",
    },
  ],
  video: [
    {
      key: "qwen",
      label: "千问",
      providerName: "Qwen",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
      taskQueryUrlTemplate: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
      defaultModelName: "wanx-video-v1",
    },
    {
      key: "vidu",
      label: "Vidu",
      providerName: "Vidu",
      baseUrl: "https://api.vidu.cn",
      taskQueryUrlTemplate: "https://api.vidu.cn/ent/v2/tasks/{taskId}/creations",
      defaultModelName: "viduq1",
    },
    {
      key: "veo_omni",
      label: "Veo Omni",
      providerName: "Veo Omni",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      taskQueryUrlTemplate: "https://generativelanguage.googleapis.com/v1beta/{taskId}",
      defaultModelName: "veo-3.1-fast-generate-preview",
    },
    {
      key: "veo",
      label: "Veo",
      providerName: "Veo",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      taskQueryUrlTemplate: "https://generativelanguage.googleapis.com/v1beta/{taskId}",
      defaultModelName: "veo-3.1-generate-preview",
    },
    {
      key: "seedance",
      label: "Seedance 2.0",
      providerName: "Seedance 2.0",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      taskQueryUrlTemplate: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}",
      defaultModelName: "doubao-seedance-2-0-260128",
    },
    {
      key: "custom",
      label: "自定义",
      providerName: "Custom",
      baseUrl: "",
      defaultModelName: "",
    },
  ],
};

export function getProviderPresets(type: ModelType) {
  return providerPresets[type];
}

export function getProviderPreset(type: ModelType, key: ProviderKey) {
  return providerPresets[type].find((item) => item.key === key);
}

type VideoGatewayConfigInput = {
  providerKey?: string;
  providerName?: string;
  baseUrl?: string;
  taskQueryUrlTemplate?: string;
  modelName?: string;
};

function buildUnifiedVideoGatewayCreateUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (/\/v1\/videos$/i.test(normalized) || /\/videos$/i.test(normalized)) {
    return normalized;
  }
  if (/\/v1$/i.test(normalized)) {
    return `${normalized}/videos`;
  }
  return `${normalized}/v1/videos`;
}

export function looksLikeUnifiedVideoGatewayVideoConfig(input?: VideoGatewayConfigInput) {
  const key = input?.providerKey?.toLowerCase() ?? "";
  const requestUrl = (input?.baseUrl || "").toLowerCase();
  const providerName = input?.providerName?.toLowerCase() ?? "";
  const modelName = input?.modelName?.toLowerCase() ?? "";

  const looksLikeUnifiedGateway =
    requestUrl.includes("/v1/videos") ||
    /\/v1\/?$/.test(requestUrl) ||
    modelName.startsWith("sora-") ||
    modelName.startsWith("gemini-veo-") ||
    providerName.includes("sora") ||
    providerName.includes("vip3") ||
    providerName.includes("veo");

  return looksLikeUnifiedGateway && (key === "custom" || key === "veo" || key === "veo_omni" || key === "seedance");
}

export function normalizeVideoTaskQueryUrlTemplate(input?: VideoGatewayConfigInput) {
  const normalized = input?.taskQueryUrlTemplate?.trim();
  if (!normalized) {
    return undefined;
  }
  if (!looksLikeUnifiedVideoGatewayVideoConfig(input)) {
    return normalized;
  }

  try {
    const createUrl = new URL(buildUnifiedVideoGatewayCreateUrl(input?.baseUrl ?? ""));
    const queryUrl = new URL(normalized.replace("{taskId}", "task-demo"));
    const expectedPath = `${createUrl.pathname.replace(/\/+$/, "")}/task-demo`;
    if (createUrl.host !== queryUrl.host || queryUrl.pathname !== expectedPath) {
      return undefined;
    }
    return normalized;
  } catch {
    return undefined;
  }
}

export function inferProviderKey(type: ModelType, input?: {
  providerKey?: string;
  providerName?: string;
  baseUrl?: string;
  requestUrl?: string;
  modelName?: string;
}) {
  if (input?.providerKey) {
    return input.providerKey as ProviderKey;
  }

  const requestUrl = (input?.baseUrl || input?.requestUrl || "").toLowerCase();
  const providerName = input?.providerName?.toLowerCase() ?? "";
  const modelName = input?.modelName?.toLowerCase() ?? "";

  if (providerName.includes("veo omni") || modelName.includes("veo") && modelName.includes("fast")) {
    return "veo_omni";
  }
  if (providerName === "veo" || providerName.includes("google veo") || modelName.includes("veo")) {
    return "veo";
  }
  if (providerName.includes("seedance") || modelName.includes("seedance")) {
    return "seedance";
  }

  if (requestUrl.includes("dashscope") || providerName.includes("qwen")) {
    return "qwen";
  }
  if (requestUrl.includes("byteplus") || requestUrl.includes("volces") || providerName.includes("doubao")) {
    return "doubao";
  }
  if (requestUrl.includes("openai.com") || providerName.includes("openai") || providerName.includes("gpt")) {
    return "openai";
  }
  if (requestUrl.includes("deepseek.com") || providerName.includes("deepseek")) {
    return "deepseek";
  }
  if (requestUrl.includes("generativelanguage.googleapis.com") || providerName.includes("gemini")) {
    return "gemini";
  }
  if (requestUrl.includes("vidu.com") || requestUrl.includes("vidu.cn") || providerName.includes("vidu")) {
    return "vidu";
  }

  return "custom";
}

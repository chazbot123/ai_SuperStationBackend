export type ModelType = "text" | "image" | "video";

export type ProviderKey =
  | "qwen"
  | "doubao"
  | "openai"
  | "gemini"
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
      baseUrl: "https://api.vidu.com",
      taskQueryUrlTemplate: "https://api.vidu.com/ent/v2/tasks/{taskId}/creations",
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
      baseUrl: "https://api.vidu.com",
      taskQueryUrlTemplate: "https://api.vidu.com/ent/v2/tasks/{taskId}/creations",
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
};

export function getProviderPresets(type: ModelType) {
  return providerPresets[type];
}

export function getProviderPreset(type: ModelType, key: ProviderKey) {
  return providerPresets[type].find((item) => item.key === key);
}

export function inferProviderKey(type: ModelType, input?: {
  providerKey?: string;
  providerName?: string;
  baseUrl?: string;
  requestUrl?: string;
}) {
  if (input?.providerKey) {
    return input.providerKey as ProviderKey;
  }

  const requestUrl = (input?.baseUrl || input?.requestUrl || "").toLowerCase();
  const providerName = input?.providerName?.toLowerCase() ?? "";

  if (requestUrl.includes("dashscope") || providerName.includes("qwen")) {
    return "qwen";
  }
  if (requestUrl.includes("byteplus") || requestUrl.includes("volces") || providerName.includes("doubao")) {
    return "doubao";
  }
  if (requestUrl.includes("openai.com") || providerName.includes("openai") || providerName.includes("gpt")) {
    return "openai";
  }
  if (requestUrl.includes("generativelanguage.googleapis.com") || providerName.includes("gemini")) {
    return "gemini";
  }
  if (requestUrl.includes("vidu.com") || providerName.includes("vidu")) {
    return "vidu";
  }

  return "custom";
}

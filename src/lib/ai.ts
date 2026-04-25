import { requestJson } from "@/lib/api";
import type { ModelConfig } from "@/store/modelConfigStore";

type GenerateCopyRequest = {
  prompt?: string;
  productName?: string;
  sellingPoints?: string;
  audience?: string;
  style?: "xhs" | "douyin" | "wechat";
  format?: "text" | "html";
  modelConfig: ModelConfig;
  accessToken: string;
};

type GenerateImagesRequest = {
  prompt?: string;
  sizePreset?: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution?: "1k" | "2k" | "4k";
  referenceImages?: string[];
  modelConfig: ModelConfig;
  accessToken: string;
};

type GenerateCopyResponse = {
  text: string;
  html: string;
  used: "text" | "html";
  provider: string;
  model?: string;
};

type GenerateImagesResponse = {
  urls: string[];
  provider: string;
  model?: string;
};

export type SocialPostItem = {
  id: string;
  title: string;
  createdAt: string;
  body: string;
  images: string[];
  style: "xiaohongshu" | "douyin" | "wechat";
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution: "1k" | "2k" | "4k";
  reviewStage: "draft" | "submitted" | "approved";
  synced: boolean;
};

type TestModelConnectionResponse = {
  success: boolean;
  message: string;
  provider: string;
  model?: string;
};

export type ActiveModelConfigItem = {
  type: "text" | "image" | "video";
  enabled: boolean;
  providerKey: ModelConfig["providerKey"];
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  apiKey: string;
  modelName: string;
};

export type SavedProviderModelConfigItem = ActiveModelConfigItem & {
  providerKey: ModelConfig["providerKey"];
};

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function pickModelConfigPayload(modelConfig: ModelConfig) {
  return {
    enabled: modelConfig.enabled,
    providerKey: modelConfig.providerKey,
    providerName: modelConfig.providerName,
    baseUrl: modelConfig.baseUrl,
    taskQueryUrlTemplate: modelConfig.taskQueryUrlTemplate,
    apiKey: modelConfig.apiKey,
    modelName: modelConfig.modelName,
  };
}

export async function generateAiCopy(input: GenerateCopyRequest) {
  return requestJson<GenerateCopyResponse>("/api/ai/generate-copy", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      prompt: input.prompt,
      productName: input.productName,
      sellingPoints: input.sellingPoints,
      audience: input.audience,
      style: input.style,
      format: input.format ?? "text",
      modelConfig: pickModelConfigPayload(input.modelConfig),
    }),
  });
}

export async function generateAiImages(input: GenerateImagesRequest) {
  return requestJson<GenerateImagesResponse>("/api/ai/generate-images", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      prompt: input.prompt,
      sizePreset: input.sizePreset,
      resolution: input.resolution,
      referenceImages: input.referenceImages,
      modelConfig: pickModelConfigPayload(input.modelConfig),
    }),
  });
}

export async function listSocialPosts(accessToken: string) {
  return requestJson<SocialPostItem[]>("/api/ai/social-posts", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function generateSocialPost(input: {
  prompt?: string;
  style?: "xiaohongshu" | "douyin" | "wechat";
  sizePreset?: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution?: "1k" | "2k" | "4k";
  referenceImages?: string[];
  textModelConfig: ModelConfig;
  imageModelConfig: ModelConfig;
  accessToken: string;
}) {
  return requestJson<SocialPostItem>("/api/ai/social-posts/generate", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      prompt: input.prompt,
      style: input.style,
      sizePreset: input.sizePreset,
      resolution: input.resolution,
      referenceImages: input.referenceImages,
      textModelConfig: pickModelConfigPayload(input.textModelConfig),
      imageModelConfig: pickModelConfigPayload(input.imageModelConfig),
    }),
  });
}

export async function submitSocialPost(accessToken: string, id: string) {
  return requestJson<SocialPostItem>(`/api/ai/social-posts/${id}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function markSocialPostSynced(accessToken: string, id: string) {
  return requestJson<SocialPostItem>(`/api/ai/social-posts/${id}/mark-synced`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function testModelConnection(input: {
  type: "text" | "image" | "video";
  modelConfig: ModelConfig;
  accessToken: string;
}) {
  return requestJson<TestModelConnectionResponse>(
    `/api/ai/model-configs/${input.type}/test-connection`,
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
      body: JSON.stringify(pickModelConfigPayload(input.modelConfig)),
    }
  );
}

export async function listActiveModelConfigs(accessToken: string) {
  return requestJson<ActiveModelConfigItem[]>("/api/ai/model-configs/active", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function listSavedModelConfigs(accessToken: string) {
  return requestJson<SavedProviderModelConfigItem[]>("/api/ai/model-configs/saved", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function activateModelConfig(input: {
  type: "text" | "image" | "video";
  modelConfig: ModelConfig;
  accessToken: string;
}) {
  return requestJson<ActiveModelConfigItem>(`/api/ai/model-configs/${input.type}/activate`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify(pickModelConfigPayload(input.modelConfig)),
  });
}

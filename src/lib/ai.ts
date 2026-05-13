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

type PromptPolishRequest = {
  prompt: string;
  scene: "social_post" | "product_image";
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

type GenerateVideoRequest = {
  prompt?: string;
  ttsText?: string;
  referenceImages?: string[];
  voiceId?: string;
  bgmUrl?: string;
  bgmVolume?: number;
  movementAmplitude?: "auto" | "low" | "medium" | "high";
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "360p" | "540p" | "720p" | "1080p";
  durationSeconds?: number;
  modelConfig: ModelConfig;
  accessToken: string;
};

type PolishPromptRequest = {
  text: string;
  mode?: "product_video" | "avatar_video";
  platformStyle?: "douyin" | "xiaohongshu" | "wechat_mp";
  modelConfig: ModelConfig;
  accessToken: string;
};

type GeneratePlatformMetaRequest = {
  text: string;
  mode?: "product_video" | "avatar_video";
  platformStyle?: "douyin" | "xiaohongshu" | "wechat_mp";
  modelConfig: ModelConfig;
  accessToken: string;
};

type RecommendBgmRequest = {
  text: string;
  mode?: "product_video" | "avatar_video";
  platformStyle?: "douyin" | "xiaohongshu" | "wechat_mp";
  scene?: string;
  style?: string;
  modelConfig: ModelConfig;
  accessToken: string;
};

type ExpandAvatarVideoScriptRequest = {
  prompt: string;
  targetSeconds: number;
  platformStyle?: "douyin" | "xiaohongshu" | "wechat_mp";
  scene?: string;
  style?: string;
  modelConfig: ModelConfig;
  accessToken: string;
};

type GenerateCopyResponse = {
  title: string;
  body: string;
  tags: string[];
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

type PromptPolishResponse = {
  prompt: string;
  provider: string;
  model?: string;
};

type GenerateVideoResponse = {
  status: "processing" | "success";
  taskId?: string;
  videoUrl?: string;
  provider: string;
  model?: string;
};

type ProductImageUploadResponse = {
  bucket: string;
  objectKey: string;
  url: string;
};

type PolishPromptResponse = {
  text: string;
  provider: string;
  model?: string;
};

type GeneratePlatformMetaResponse = {
  title: string;
  tags: [string, string];
  provider: string;
  model?: string;
};

type RecommendBgmResponse = {
  id: string;
  title: string;
  url: string;
  volume: number;
  provider: string;
  model?: string;
};

type ExpandAvatarVideoScriptResponse = {
  text: string;
  provider: string;
  model?: string;
  targetSeconds: number;
};

export type SocialPostItem = {
  id: string;
  title: string;
  createdAt: string;
  body: string;
  tags: string[];
  images: string[];
  downloadableImages?: boolean[];
  style: "xiaohongshu" | "douyin" | "wechat";
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution: "1k" | "2k" | "4k";
  reviewStage: "draft" | "submitted" | "approved";
  synced: boolean;
};

export type ProductImageDraftItem = {
  id: string;
  title: string;
  createdAt: string;
  body: string;
  images: string[];
  downloadableImages?: boolean[];
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution: "1k" | "2k" | "4k";
  reviewStage: "draft" | "submitted" | "approved";
  syncedToLeads: boolean;
  syncedToProducts: boolean;
};

export type VideoDraftRecord = {
  id: string;
  source: "product_video" | "avatar_video";
  title: string;
  platformStyle?: string | null;
  publishTitle?: string | null;
  publishTags: string[];
  createdAt: string;
  completedAt?: string | null;
  durationText: string;
  generatedScript: string;
  videoUrl: string;
  taskId?: string | null;
  provider?: string | null;
  model?: string | null;
  errorMessage?: string | null;
  reviewStage: "draft" | "submitted" | "approved";
  status: "ready" | "processing" | "failed";
  syncedToLeads: boolean;
};

export type ReviewMaterialSource = "social" | "product" | "video";

export type AiReviewMaterialItem = {
  id: string;
  source: ReviewMaterialSource;
  title: string;
  body: string;
  tags: string[];
  images: string[];
  downloadableImages: boolean[];
  videoUrl: string | null;
  reviewStage: "submitted" | "approved";
  submittedByName: string;
  submittedAt: string;
};

type TestModelConnectionResponse = {
  success: boolean;
  message: string;
  provider: string;
  model?: string;
};

export type VideoTaskStatusResponse = {
  taskId: string;
  status: "processing" | "success" | "failed";
  videoUrl: string | null;
  errorMessage?: string | null;
  provider: string;
  model?: string;
};

export type AvatarVideoTaskCreateResponse = {
  taskId: string;
  status: string;
  segmentCount: number;
};

export type AvatarVideoTaskStatusResponse = {
  taskId: string;
  status: string;
  segmentCount: number;
  finishedCount: number;
  failedCount: number;
  characterImageUrl: string;
  fullScript: string;
  finalVideoUrl: string | null;
  errorMessage: string | null;
  segments: Array<{
    id: string;
    sequenceOrder: number;
    scriptSegment: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    retryAt: string | null;
    segmentVideoUrl: string | null;
    errorMessage: string | null;
  }>;
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

export async function expandAvatarVideoScript(input: ExpandAvatarVideoScriptRequest) {
  return requestJson<ExpandAvatarVideoScriptResponse>("/api/ai/avatar-video-scripts/expand", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      prompt: input.prompt,
      targetSeconds: input.targetSeconds,
      platformStyle: input.platformStyle,
      scene: input.scene,
      style: input.style,
      modelConfig: pickModelConfigPayload(input.modelConfig),
    }),
  });
}

export async function generatePlatformMeta(input: GeneratePlatformMetaRequest) {
  return requestJson<GeneratePlatformMetaResponse>("/api/ai/generate-platform-meta", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      text: input.text,
      mode: input.mode,
      platformStyle: input.platformStyle,
      modelConfig: pickModelConfigPayload(input.modelConfig),
    }),
  });
}

export async function recommendBgm(input: RecommendBgmRequest) {
  return requestJson<RecommendBgmResponse>("/api/ai/recommend-bgm", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      text: input.text,
      mode: input.mode,
      platformStyle: input.platformStyle,
      scene: input.scene,
      style: input.style,
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

export async function generateAiVideo(input: GenerateVideoRequest) {
  return requestJson<GenerateVideoResponse>("/api/ai/generate-video", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      prompt: input.prompt,
      ttsText: input.ttsText,
      referenceImages: input.referenceImages,
      voiceId: input.voiceId,
      bgmUrl: input.bgmUrl,
      bgmVolume: input.bgmVolume,
      movementAmplitude: input.movementAmplitude,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
      modelConfig: pickModelConfigPayload(input.modelConfig),
    }),
  });
}

export async function getVideoTaskStatus(accessToken: string, taskId: string) {
  return requestJson<VideoTaskStatusResponse>(`/api/ai/video-tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createAvatarVideoTask(input: {
  fullScript: string;
  referenceImageDataUrl: string;
  referenceImages?: string[];
  voiceId?: string;
  backgroundLock?: boolean;
  style?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "540p" | "720p" | "1080p";
  segmentDurationSeconds?: number;
  segmentMaxChars?: number;
  accessToken: string;
}) {
  return requestJson<AvatarVideoTaskCreateResponse>("/api/ai/avatar-video-tasks", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      fullScript: input.fullScript,
      referenceImageDataUrl: input.referenceImageDataUrl,
      referenceImages: input.referenceImages,
      voiceId: input.voiceId,
      backgroundLock: input.backgroundLock,
      style: input.style,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      segmentDurationSeconds: input.segmentDurationSeconds,
      segmentMaxChars: input.segmentMaxChars,
    }),
  });
}

export async function getAvatarVideoTaskStatus(accessToken: string, taskId: string) {
  return requestJson<AvatarVideoTaskStatusResponse>(
    `/api/ai/avatar-video-tasks/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export async function retryAvatarVideoTask(accessToken: string, taskId: string) {
  return requestJson<{ taskId: string; resetCount: number }>(
    `/api/ai/avatar-video-tasks/${encodeURIComponent(taskId)}/retry`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export function polishPrompt(input: PromptPolishRequest): Promise<PromptPolishResponse>;
export function polishPrompt(input: PolishPromptRequest): Promise<PolishPromptResponse>;
export async function polishPrompt(input: PromptPolishRequest | PolishPromptRequest) {
  if ("scene" in input) {
    return requestJson<PromptPolishResponse>("/api/ai/prompt-polish", {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
      body: JSON.stringify({
        prompt: input.prompt,
        scene: input.scene,
        modelConfig: pickModelConfigPayload(input.modelConfig),
      }),
    });
  }

  return requestJson<PolishPromptResponse>("/api/ai/polish-prompt", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      text: input.text,
      mode: input.mode,
      platformStyle: input.platformStyle,
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

export async function listProductImageDrafts(accessToken: string) {
  return requestJson<ProductImageDraftItem[]>("/api/ai/product-image-drafts", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function listVideoDrafts(accessToken: string) {
  return requestJson<VideoDraftRecord[]>("/api/ai/video-drafts", {
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

export async function withdrawSocialPostReview(accessToken: string, id: string) {
  return requestJson<SocialPostItem>(`/api/ai/social-posts/${id}/withdraw`, {
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

export async function updateSocialPost(input: {
  accessToken: string;
  id: string;
  title: string;
  body: string;
  tags: string[];
  images: string[];
}) {
  return requestJson<SocialPostItem>(`/api/ai/social-posts/${input.id}`, {
    method: "PATCH",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      tags: input.tags,
      images: input.images,
    }),
  });
}

export async function removeSocialPost(accessToken: string, id: string) {
  return requestJson<{ success: true }>(`/api/ai/social-posts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createProductImageDraft(input: {
  accessToken: string;
  title: string;
  body: string;
  images: string[];
  sizePreset: "1_1" | "3_4" | "4_5" | "9_16" | "16_9";
  resolution: "1k" | "2k" | "4k";
}) {
  return requestJson<ProductImageDraftItem>("/api/ai/product-image-drafts", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      images: input.images,
      sizePreset: input.sizePreset,
      resolution: input.resolution,
    }),
  });
}

export async function createVideoDraft(input: {
  accessToken: string;
  source: VideoDraftRecord["source"];
  title: string;
  platformStyle?: string;
  publishTitle?: string;
  publishTags?: string[];
  durationText: string;
  generatedScript: string;
  videoUrl?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  errorMessage?: string;
  status?: VideoDraftRecord["status"];
  completedAt?: string;
}) {
  return requestJson<VideoDraftRecord>("/api/ai/video-drafts", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      source: input.source,
      title: input.title,
      platformStyle: input.platformStyle,
      publishTitle: input.publishTitle,
      publishTags: input.publishTags,
      durationText: input.durationText,
      generatedScript: input.generatedScript,
      videoUrl: input.videoUrl,
      taskId: input.taskId,
      provider: input.provider,
      model: input.model,
      errorMessage: input.errorMessage,
      status: input.status,
      completedAt: input.completedAt,
    }),
  });
}

export async function updateProductImageDraft(input: {
  accessToken: string;
  id: string;
  title: string;
  body: string;
  images: string[];
}) {
  return requestJson<ProductImageDraftItem>(`/api/ai/product-image-drafts/${input.id}`, {
    method: "PATCH",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      images: input.images,
    }),
  });
}

export async function updateVideoDraft(input: {
  accessToken: string;
  id: string;
  title?: string;
  platformStyle?: string;
  publishTitle?: string;
  publishTags?: string[];
  durationText?: string;
  generatedScript?: string;
  videoUrl?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  errorMessage?: string;
  status?: VideoDraftRecord["status"];
  syncedToLeads?: boolean;
  completedAt?: string;
}) {
  return requestJson<VideoDraftRecord>(`/api/ai/video-drafts/${input.id}`, {
    method: "PATCH",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      title: input.title,
      platformStyle: input.platformStyle,
      publishTitle: input.publishTitle,
      publishTags: input.publishTags,
      durationText: input.durationText,
      generatedScript: input.generatedScript,
      videoUrl: input.videoUrl,
      taskId: input.taskId,
      provider: input.provider,
      model: input.model,
      errorMessage: input.errorMessage,
      status: input.status,
      syncedToLeads: input.syncedToLeads,
      completedAt: input.completedAt,
    }),
  });
}

export async function removeVideoDraft(accessToken: string, id: string) {
  return requestJson<{ success: true }>(`/api/ai/video-drafts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function removeProductImageDraft(accessToken: string, id: string) {
  return requestJson<{ success: true }>(`/api/ai/product-image-drafts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function submitProductImageDraft(accessToken: string, id: string) {
  return requestJson<ProductImageDraftItem>(`/api/ai/product-image-drafts/${id}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function withdrawProductImageDraftReview(accessToken: string, id: string) {
  return requestJson<ProductImageDraftItem>(`/api/ai/product-image-drafts/${id}/withdraw`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function markProductImageDraftSynced(accessToken: string, id: string) {
  return requestJson<ProductImageDraftItem>(`/api/ai/product-image-drafts/${id}/mark-synced`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function markProductImageDraftProductSynced(accessToken: string, id: string) {
  return requestJson<ProductImageDraftItem>(`/api/ai/product-image-drafts/${id}/mark-product-synced`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function submitVideoDraft(accessToken: string, id: string) {
  return requestJson<VideoDraftRecord>(`/api/ai/video-drafts/${id}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function withdrawVideoDraftReview(accessToken: string, id: string) {
  return requestJson<VideoDraftRecord>(`/api/ai/video-drafts/${id}/withdraw`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function markVideoDraftSynced(accessToken: string, id: string) {
  return requestJson<VideoDraftRecord>(`/api/ai/video-drafts/${id}/mark-synced`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function uploadDraftImage(accessToken: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const payload = await requestJson<ProductImageUploadResponse>("/api/products/upload-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  return payload.url;
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

export async function listReviewMaterials(accessToken: string) {
  return requestJson<AiReviewMaterialItem[]>("/api/ai/review-materials", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function approveReviewMaterial(input: {
  accessToken: string;
  source: ReviewMaterialSource;
  id: string;
}) {
  return requestJson<AiReviewMaterialItem>(
    `/api/ai/review-materials/${encodeURIComponent(input.source)}/${encodeURIComponent(input.id)}/approve`,
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
    }
  );
}

export async function rejectReviewMaterial(input: {
  accessToken: string;
  source: ReviewMaterialSource;
  id: string;
  reason?: string;
}) {
  return requestJson<{ success: boolean }>(
    `/api/ai/review-materials/${encodeURIComponent(input.source)}/${encodeURIComponent(input.id)}/reject`,
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
      body: JSON.stringify({ reason: input.reason }),
    }
  );
}

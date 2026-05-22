import { requestJson } from "@/lib/api";

export type LeadPlatformStyle =
  | "xiaohongshu"
  | "douyin"
  | "wechat_mp"
  | "kuaishou"
  | "bilibili"
  | "wechat_official";
export type LeadContentType = "copy" | "image_text" | "video" | "product_asset";
export type LeadContentSourceType = "social" | "product" | "video" | "manual";
export type LeadContentStatus = "active" | "archived" | "deleted";
export type LeadPublishStatus = "queued" | "running" | "success" | "failed";
export type LeadPublishMode = "draft_box";
export type PublishExecutionMode = "server" | "extension";
export type PlatformAccountProvider = "extension" | "mcp" | "official_oauth";
export type PlatformAccountAuthType = "cookie" | "token";
export type PlatformAccountStatus = "saved" | "valid" | "invalid" | "disabled";
export type PlatformAccountLoginStatus = "idle" | "pending" | "authenticated" | "failed" | "cancelled";

export type PublishingContentItem = {
  id: string;
  creatorId: string;
  creatorName: string;
  sourceType: LeadContentSourceType;
  sourceId: string | null;
  title: string;
  body: string;
  tags: string[];
  contentType: LeadContentType;
  platformStyle: LeadPlatformStyle;
  coverImage: string | null;
  images: string[];
  videoUrl: string | null;
  status: LeadContentStatus;
  createdAt: string;
  updatedAt: string;
  publishJobs?: PublishingJobItem[];
};

export type PublishingJobItem = {
  id: string;
  leadContentId: string;
  createdById: string;
  platform: LeadPlatformStyle;
  provider: PlatformAccountProvider;
  platformAccountId: string;
  platformAccountName?: string;
  platformAccountDisplayName?: string | null;
  publishMode: LeadPublishMode;
  status: LeadPublishStatus;
  draftTitle: string;
  draftBody: string;
  draftTags: string[];
  draftImages: string[];
  draftVideoUrl: string | null;
  draftUrl?: string | null;
  externalDraftId?: string | null;
  externalFlowId?: string | null;
  externalStatus?: string | null;
  draftedAt?: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  leadContentTitle?: string;
};

function normalizeText(value?: string | null) {
  const next = value?.trim();
  return next ? next : undefined;
}

function isTemporaryAssetUrl(value: string) {
  return value.startsWith("data:") || value.startsWith("blob:");
}

function sanitizePersistedAssetUrl(value?: string | null) {
  const next = normalizeText(value);
  if (!next) return undefined;
  if (isTemporaryAssetUrl(next)) return undefined;
  if (next.length > 1000) return undefined;
  return next;
}

function sanitizePersistedAssetUrls(values?: string[]) {
  return (values ?? [])
    .map((item) => sanitizePersistedAssetUrl(item))
    .filter((item): item is string => Boolean(item));
}

type PublishingContentsResponse = {
  items: PublishingContentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type PublishingJobsResponse = {
  items: PublishingJobItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

export type PlatformAccountItem = {
  id: string;
  creatorId: string;
  creatorName: string;
  platform: LeadPlatformStyle;
  provider: PlatformAccountProvider;
  authType: PlatformAccountAuthType;
  accountName: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  authPayloadPreview: string;
  loginStatus: PlatformAccountLoginStatus;
  loginUrl: string | null;
  externalAccountId: string | null;
  externalGroupId: string | null;
  loginSourceLabel: string;
  status: PlatformAccountStatus;
  remark: string | null;
  lastLoginStartedAt: string | null;
  lastLoginCompletedAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformExtensionLoginSession = {
  sessionId: string;
  sessionToken: string;
  platform: LeadPlatformStyle;
  accountId: string | null;
  expiresAt: string;
  loginUrl: string;
};

export type PlatformExtensionPublishSession = {
  sessionToken: string;
  expiresAt: string;
  job: PublishingJobItem;
  accountAuthPayload: string;
  platformAccountId: string;
  platformAccountName: string;
  platformAccountDisplayName: string | null;
};

export type PlatformMcpLoginSession = {
  provider: "mcp";
  platform: LeadPlatformStyle;
  loginUrl: string;
  syncHint: string;
};

export type PlatformOfficialOauthLoginSession = {
  provider: "official_oauth";
  platform: LeadPlatformStyle;
  loginUrl: string;
  syncHint: string;
};

type PlatformAccountsResponse = {
  items: PlatformAccountItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function listPublishingContents(input: {
  accessToken: string;
  q?: string;
  status?: LeadContentStatus;
  contentType?: LeadContentType;
  sourceType?: LeadContentSourceType;
  platformStyle?: LeadPlatformStyle;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (input.q) searchParams.set("q", input.q);
  if (input.status) searchParams.set("status", input.status);
  if (input.contentType) searchParams.set("contentType", input.contentType);
  if (input.sourceType) searchParams.set("sourceType", input.sourceType);
  if (input.platformStyle) searchParams.set("platformStyle", input.platformStyle);
  searchParams.set("page", String(input.page ?? 1));
  searchParams.set("limit", String(input.limit ?? 50));

  return requestJson<PublishingContentsResponse>(`/api/publishing/contents?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function syncPublishingContent(input: {
  accessToken: string;
  sourceType: LeadContentSourceType;
  sourceId?: string;
  title: string;
  body: string;
  tags?: string[];
  contentType: LeadContentType;
  platformStyle: LeadPlatformStyle;
  coverImage?: string;
  images?: string[];
  videoUrl?: string;
}) {
  const images = sanitizePersistedAssetUrls(input.images);
  const coverImage = sanitizePersistedAssetUrl(input.coverImage) ?? images[0];
  const videoUrl = sanitizePersistedAssetUrl(input.videoUrl);

  return requestJson<PublishingContentItem>("/api/publishing/contents/sync-from-source", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      body: input.body,
      tags: input.tags,
      contentType: input.contentType,
      platformStyle: input.platformStyle,
      coverImage,
      images,
      videoUrl,
    }),
  });
}

export async function publishLeadContent(input: {
  accessToken: string;
  contentId: string;
  targets: Array<{
    platform: LeadPlatformStyle;
    platformAccountId: string;
    draftTitle?: string;
    draftBody?: string;
    draftTags?: string[];
  }>;
  executionMode?: PublishExecutionMode;
}) {
  return requestJson<{ contentId: string; jobs: PublishingJobItem[] }>(
    `/api/publishing/contents/${input.contentId}/publish`,
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
      body: JSON.stringify({
        targets: input.targets,
        executionMode: input.executionMode,
      }),
    },
  );
}

export async function startExtensionPublishJob(input: { accessToken: string; jobId: string }) {
  return requestJson<PlatformExtensionPublishSession>("/api/publishing/extension/publish-jobs/start", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({ jobId: input.jobId }),
  });
}

export async function openExtensionPlatformAccountHome(input: { accessToken: string; accountId: string }) {
  return requestJson<{
    platform: LeadPlatformStyle;
    loginUrl: string;
    authPayload: string;
  }>("/api/publishing/extension/platform-accounts/open-home", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({ accountId: input.accountId }),
  });
}

export async function syncExtensionPublishJob(input: {
  sessionToken: string;
  status: "running" | "success" | "failed";
  draftUrl?: string;
  lastError?: string;
  authPayload?: string;
  accountName?: string;
  displayName?: string;
  sourceUrl?: string;
}) {
  return requestJson<PublishingJobItem>("/api/publishing/extension/publish-jobs/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function listPublishingJobs(input: {
  accessToken: string;
  platform?: LeadPlatformStyle;
  status?: LeadPublishStatus;
  contentId?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (input.platform) searchParams.set("platform", input.platform);
  if (input.status) searchParams.set("status", input.status);
  if (input.contentId) searchParams.set("contentId", input.contentId);
  searchParams.set("page", String(input.page ?? 1));
  searchParams.set("limit", String(input.limit ?? 20));

  return requestJson<PublishingJobsResponse>(`/api/publishing/jobs?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function getPublishingJob(input: { accessToken: string; jobId: string }) {
  return requestJson<PublishingJobItem>(`/api/publishing/jobs/${input.jobId}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function retryPublishingJob(input: { accessToken: string; jobId: string }) {
  return requestJson<PublishingJobItem>(`/api/publishing/jobs/${input.jobId}/retry`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function listPlatformAccounts(input: {
  accessToken: string;
  platform?: LeadPlatformStyle;
  provider?: PlatformAccountProvider;
  status?: PlatformAccountStatus;
  loginStatus?: PlatformAccountLoginStatus;
  autoComplete?: "none" | "pending";
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (input.platform) searchParams.set("platform", input.platform);
  if (input.provider) searchParams.set("provider", input.provider);
  if (input.status) searchParams.set("status", input.status);
  if (input.loginStatus) searchParams.set("loginStatus", input.loginStatus);
  if (input.autoComplete) searchParams.set("autoComplete", input.autoComplete);
  searchParams.set("page", String(input.page ?? 1));
  searchParams.set("limit", String(input.limit ?? 20));
  const query = searchParams.toString();
  return requestJson<PlatformAccountsResponse>(`/api/publishing/platform-accounts${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function createPlatformAccount(input: {
  accessToken: string;
  platform: LeadPlatformStyle;
  authType: PlatformAccountAuthType;
  accountName: string;
  displayName?: string;
  authPayload: string;
  remark?: string;
}) {
  return requestJson<PlatformAccountItem>("/api/publishing/platform-accounts", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify(input),
  });
}

export async function startHostedPlatformLogin(input: {
  accessToken: string;
  platform: LeadPlatformStyle;
  remark?: string;
}) {
  const { accessToken, ...payload } = input;
  return requestJson<PlatformAccountItem>("/api/publishing/platform-accounts/hosted-login/start", {
    method: "POST",
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function startExtensionPlatformLogin(input: {
  accessToken: string;
  platform: LeadPlatformStyle;
  accountId?: string;
}) {
  const { accessToken, ...payload } = input;
  return requestJson<PlatformExtensionLoginSession>("/api/publishing/platform-accounts/extension-login/start", {
    method: "POST",
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function startMcpPlatformLogin(input: {
  accessToken: string;
  platform: LeadPlatformStyle;
}) {
  const { accessToken, ...payload } = input;
  return requestJson<PlatformMcpLoginSession>("/api/publishing/platform-accounts/mcp-login/start", {
    method: "POST",
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function startOfficialOauthLogin(input: {
  accessToken: string;
  platform: Extract<LeadPlatformStyle, "douyin" | "kuaishou" | "bilibili" | "wechat_official">;
  accountId?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("platform", input.platform);
  if (input.accountId) {
    searchParams.set("accountId", input.accountId);
  }
  return requestJson<PlatformOfficialOauthLoginSession>(
    `/api/publishing/platform-accounts/official-oauth/start?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );
}

export async function updatePlatformAccount(input: {
  accessToken: string;
  id: string;
  authType?: PlatformAccountAuthType;
  accountName?: string;
  displayName?: string;
  authPayload?: string;
  remark?: string;
  status?: PlatformAccountStatus;
}) {
  const { accessToken, id, ...payload } = input;
  return requestJson<PlatformAccountItem>(`/api/publishing/platform-accounts/${id}/update`, {
    method: "POST",
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deletePlatformAccount(input: { accessToken: string; id: string }) {
  return requestJson<{ id: string }>(`/api/publishing/platform-accounts/${input.id}/delete`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function deletePublishingJob(input: { accessToken: string; id: string }) {
  return requestJson<{ id: string }>(`/api/publishing/jobs/${input.id}/delete`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function validatePlatformAccount(input: { accessToken: string; id: string }) {
  return requestJson<PlatformAccountItem>(`/api/publishing/platform-accounts/${input.id}/validate`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function restartHostedPlatformLogin(input: { accessToken: string; id: string }) {
  return requestJson<PlatformAccountItem>(`/api/publishing/platform-accounts/${input.id}/hosted-login/start`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function completeHostedPlatformLogin(input: { accessToken: string; id: string }) {
  return requestJson<PlatformAccountItem>(`/api/publishing/platform-accounts/${input.id}/hosted-login/complete`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function checkHostedPlatformLogin(input: { accessToken: string; id: string }) {
  return requestJson<PlatformAccountItem>(`/api/publishing/platform-accounts/${input.id}/hosted-login/check`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function cancelHostedPlatformLogin(input: { accessToken: string; id: string }) {
  return requestJson<{ id: string; deleted?: boolean } | PlatformAccountItem>(
    `/api/publishing/platform-accounts/${input.id}/hosted-login/cancel`,
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
    },
  );
}

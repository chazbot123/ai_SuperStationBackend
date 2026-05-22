import { requestJson } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { IndustryItem, Settings } from "@/store/appStore";

function getAuthorizationHeaders() {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw new Error("登录状态已失效");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function getMySuperSiteSettings() {
  return requestJson<Settings>("/api/super-site-settings/me", {
    headers: getAuthorizationHeaders(),
  });
}

export async function updateMySuperSiteSettings(payload: Partial<Settings>) {
  return requestJson<Settings>("/api/super-site-settings/me", {
    method: "PUT",
    headers: {
      ...getAuthorizationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function uploadMySuperSiteImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const payload = await requestJson<{ url: string }>("/api/super-site-settings/me/upload-image", {
    method: "POST",
    headers: getAuthorizationHeaders(),
    body: formData,
  });

  return payload.url;
}

export async function uploadMySuperSiteVideo(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const payload = await requestJson<{ url: string }>("/api/super-site-settings/me/upload-video", {
    method: "POST",
    headers: getAuthorizationHeaders(),
    body: formData,
  });

  return payload.url;
}

type IndustryListResponse = {
  items: IndustryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type IndustryListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  sourceType?: string;
  sourceKey?: string;
  startDate?: string;
  endDate?: string;
};

function buildQueryString(query?: IndustryListQuery) {
  const searchParams = new URLSearchParams();
  if (!query) {
    return "";
  }

  if (query.page) searchParams.set("page", String(query.page));
  if (query.limit) searchParams.set("limit", String(query.limit));
  if (query.q?.trim()) searchParams.set("q", query.q.trim());
  if (query.sourceType?.trim()) searchParams.set("sourceType", query.sourceType.trim());
  if (query.sourceKey?.trim()) searchParams.set("sourceKey", query.sourceKey.trim());
  if (query.startDate?.trim()) searchParams.set("startDate", query.startDate.trim());
  if (query.endDate?.trim()) searchParams.set("endDate", query.endDate.trim());
  const text = searchParams.toString();
  return text ? `?${text}` : "";
}

export async function listMySuperSiteIndustryItems(query?: IndustryListQuery) {
  return requestJson<IndustryListResponse>(`/api/super-site-settings/me/industry-items${buildQueryString(query)}`, {
    headers: getAuthorizationHeaders(),
  });
}

export async function createMySuperSiteIndustryItem(payload: {
  title: string;
  summary?: string;
  sourceUrl?: string;
  coverImage?: string;
  publishedAt?: string;
  enabled?: boolean;
  isPinned?: boolean;
}) {
  return requestJson<IndustryItem>("/api/super-site-settings/me/industry-items", {
    method: "POST",
    headers: {
      ...getAuthorizationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function updateMySuperSiteIndustryItem(
  id: string,
  payload: {
    title?: string;
    summary?: string;
    sourceUrl?: string;
    coverImage?: string;
    publishedAt?: string;
    enabled?: boolean;
    isPinned?: boolean;
  }
) {
  return requestJson<IndustryItem>(`/api/super-site-settings/me/industry-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...getAuthorizationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteMySuperSiteIndustryItem(id: string) {
  return requestJson<{ success: true }>(`/api/super-site-settings/me/industry-items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthorizationHeaders(),
  });
}

export async function reorderMySuperSiteIndustryItems(orderedIds: string[]) {
  return requestJson<IndustryListResponse>("/api/super-site-settings/me/industry-items/reorder", {
    method: "POST",
    headers: {
      ...getAuthorizationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderedIds }),
  });
}

export async function syncMySuperSiteIndustryItems(sourceKeys?: string[]) {
  return requestJson<{ createdCount?: number; updatedCount?: number; totalFetched?: number; errors?: string[] }>(
    "/api/super-site-settings/me/industry-sync",
    {
      method: "POST",
      headers: {
        ...getAuthorizationHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sourceKeys?.length ? { sourceKeys } : {}),
    }
  );
}

export async function listPublicSuperSiteIndustryItems(userId: string, query?: IndustryListQuery) {
  return requestJson<IndustryListResponse>(
    `/api/super-site-settings/public/${encodeURIComponent(userId)}/industry-items${buildQueryString(query)}`
  );
}

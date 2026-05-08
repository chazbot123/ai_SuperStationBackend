import { requestJson } from "@/lib/api";

export type CustomerSourcePlatform =
  | "super_site"
  | "douyin"
  | "xiaohongshu"
  | "video_channel"
  | "kuaishou"
  | "gaode_map";

export type CustomerLeadItem = {
  id: string;
  name?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  remark?: string | null;
  wechatId?: string | null;
  platformName?: string | null;
  sourcePlatform: CustomerSourcePlatform;
  createdAt: string;
  updatedAt: string;
};

type ListCustomerLeadsResponse = {
  items: CustomerLeadItem[];
  pagination: {
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

export async function listCustomerLeads(input: {
  accessToken: string;
  q?: string;
  sourcePlatform?: CustomerSourcePlatform | "all";
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.sourcePlatform && input.sourcePlatform !== "all") {
    params.set("sourcePlatform", input.sourcePlatform);
  }
  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 20));

  return requestJson<ListCustomerLeadsResponse>(`/api/customer-management/leads?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function getCustomerLead(accessToken: string, id: string) {
  return requestJson<CustomerLeadItem>(`/api/customer-management/leads/${id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createCustomerLead(input: {
  accessToken: string;
  name?: string;
  phoneNumber?: string;
  address?: string;
  remark?: string;
  wechatId?: string;
  platformName?: string;
  sourcePlatform: CustomerSourcePlatform;
}) {
  return requestJson<CustomerLeadItem>("/api/customer-management/leads", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      name: input.name,
      phoneNumber: input.phoneNumber,
      address: input.address,
      remark: input.remark,
      wechatId: input.wechatId,
      platformName: input.platformName,
      sourcePlatform: input.sourcePlatform,
    }),
  });
}

export async function updateCustomerLead(input: {
  accessToken: string;
  id: string;
  name?: string;
  phoneNumber?: string;
  address?: string;
  remark?: string;
  wechatId?: string;
  platformName?: string;
  sourcePlatform?: CustomerSourcePlatform;
}) {
  return requestJson<CustomerLeadItem>(`/api/customer-management/leads/${input.id}`, {
    method: "PATCH",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      name: input.name,
      phoneNumber: input.phoneNumber,
      address: input.address,
      remark: input.remark,
      wechatId: input.wechatId,
      platformName: input.platformName,
      sourcePlatform: input.sourcePlatform,
    }),
  });
}

export async function removeCustomerLead(accessToken: string, id: string) {
  return requestJson<{ success: true }>(`/api/customer-management/leads/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

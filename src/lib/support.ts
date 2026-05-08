import { requestJson } from "@/lib/api";

export type SupportConversationStatus = "ai_chat" | "handoff_requested" | "queueing" | "human_chat" | "ended";
export type SupportMessageRole = "visitor" | "ai" | "agent" | "system";
export type SupportHandoffStatus = "pending" | "accepted" | "closed" | "cancelled";

export type SupportMessageItem = {
  id: string;
  role: SupportMessageRole;
  content: string;
  confidence?: number | null;
  sources?: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    score: number;
    snippet: string;
  }> | null;
  agentUserId?: string | null;
  createdAt: string;
};

export type SupportConversationItem = {
  id: string;
  channel: string;
  visitorSessionId: string;
  visitorName?: string | null;
  visitorContact?: string | null;
  sourcePage?: string | null;
  status: SupportConversationStatus;
  handoffRequestedAt?: string | null;
  humanTakenAt?: string | null;
  endedAt?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  assignedAgent?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  messages: SupportMessageItem[];
  latestHandoff?: {
    id: string;
    status: SupportHandoffStatus;
    queueSerial?: number | null;
    requestedAt: string;
    acceptedAt?: string | null;
    closedAt?: string | null;
    acceptedByUserId?: string | null;
  } | null;
};

type ListSupportConversationsResponse = {
  items: SupportConversationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

export type SupportQueueStatus = {
  conversationId: string;
  status: SupportConversationStatus;
  queueNumber: number;
  assignedAgent?: {
    id: string;
    displayName: string;
  } | null;
  latestHandoff?: {
    id: string;
    status: SupportHandoffStatus;
    queueSerial?: number | null;
  } | null;
};

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function listSupportConversations(input: {
  accessToken: string;
  q?: string;
  status?: SupportConversationStatus | "all";
  onlyWaitingHandoff?: boolean;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.onlyWaitingHandoff) params.set("onlyWaitingHandoff", "true");
  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 20));

  return requestJson<ListSupportConversationsResponse>(`/api/support/conversations?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
}

export async function getSupportConversation(accessToken: string, conversationId: string) {
  return requestJson<SupportConversationItem>(`/api/support/conversations/${conversationId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function takeSupportConversation(input: {
  accessToken: string;
  conversationId: string;
  note?: string;
}) {
  return requestJson<SupportConversationItem>(`/api/support/conversations/${input.conversationId}/take`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      note: input.note,
    }),
  });
}

export async function replySupportConversation(input: {
  accessToken: string;
  conversationId: string;
  message: string;
}) {
  return requestJson<SupportConversationItem>(`/api/support/conversations/${input.conversationId}/reply`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      message: input.message,
    }),
  });
}

export async function closeSupportConversation(input: {
  accessToken: string;
  conversationId: string;
  note?: string;
}) {
  return requestJson<SupportConversationItem>(`/api/support/conversations/${input.conversationId}/close`, {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      note: input.note,
    }),
  });
}

export async function createOrResumeSupportSession(input: {
  visitorSessionId: string;
  visitorName?: string;
  visitorContact?: string;
  sourcePage?: string;
}) {
  return requestJson<SupportConversationItem>("/api/support/public/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function getPublicSupportSession(conversationId: string) {
  return requestJson<SupportConversationItem>(`/api/support/public/sessions/${conversationId}`);
}

export async function sendPublicSupportMessage(input: {
  conversationId: string;
  message: string;
}) {
  return requestJson<SupportConversationItem>(`/api/support/public/sessions/${input.conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: input.message,
    }),
  });
}

export async function requestPublicSupportHandoff(input: {
  conversationId: string;
  note?: string;
}) {
  return requestJson<SupportConversationItem & { queueNumber?: number }>(
    `/api/support/public/sessions/${input.conversationId}/handoff`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        note: input.note,
      }),
    },
  );
}

export async function getPublicSupportQueueStatus(conversationId: string) {
  return requestJson<SupportQueueStatus>(`/api/support/public/sessions/${conversationId}/queue`);
}

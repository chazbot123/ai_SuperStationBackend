import { requestJson } from "@/lib/api";

export type KnowledgeDocumentJobItem = {
  id: string;
  jobType: "parse" | "chunk" | "embed" | "reindex";
  status: "pending" | "running" | "success" | "failed";
  attemptCount: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocumentItem = {
  id: string;
  scope: "company" | "tenant" | "global" | string;
  title: string;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  objectKey: string;
  storageUrl?: string | null;
  parseStatus: "pending" | "parsing" | "chunking" | "embedding" | "ready" | "failed";
  indexStatus: "pending" | "indexing" | "ready" | "failed";
  chunkCount: number;
  charCount: number;
  language?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
  lastIndexedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  jobs: KnowledgeDocumentJobItem[];
};

export type KnowledgeRetrievalHitItem = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  score: number;
  content: string;
  snippet: string;
};

export type KnowledgeRetrievalResponse = {
  query: string;
  scope: "company" | "tenant" | "global" | string;
  answer: string;
  hits: KnowledgeRetrievalHitItem[];
};

type KnowledgeDocumentListResponse = {
  items: KnowledgeDocumentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function listKnowledgeDocuments(input: {
  accessToken: string;
  q?: string;
  indexStatus?: "pending" | "indexing" | "ready" | "failed";
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }
  if (input.indexStatus) {
    params.set("indexStatus", input.indexStatus);
  }
  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 20));

  return requestJson<KnowledgeDocumentListResponse>(`/api/knowledge/documents?${params.toString()}`, {
    headers: getAuthHeaders(input.accessToken),
  });
}

export async function getKnowledgeDocument(accessToken: string, id: string) {
  return requestJson<KnowledgeDocumentItem>(`/api/knowledge/documents/${id}`, {
    headers: getAuthHeaders(accessToken),
  });
}

export async function removeKnowledgeDocument(accessToken: string, id: string) {
  return requestJson<{ success: true }>(`/api/knowledge/documents/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(accessToken),
  });
}

export async function uploadKnowledgeDocument(input: {
  accessToken: string;
  file: File;
  title?: string;
  scope?: "company" | "tenant" | "global";
}) {
  const formData = new FormData();
  formData.append("file", input.file);
  if (input.title?.trim()) {
    formData.append("title", input.title.trim());
  }
  if (input.scope) {
    formData.append("scope", input.scope);
  }

  const response = await fetch("/api/knowledge/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: formData,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as KnowledgeDocumentItem | { message?: string | string[] }) : null;

  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data ? data.message : "上传失败";
    if (typeof message === "string" && message.trim()) {
      throw new Error(message);
    }
    if (Array.isArray(message)) {
      throw new Error(message.filter((item): item is string => typeof item === "string" && item.trim().length > 0).join("；") || "上传失败");
    }
    throw new Error("上传失败");
  }

  return data as KnowledgeDocumentItem;
}

export async function searchKnowledgeRetrieval(input: {
  accessToken: string;
  query: string;
  scope?: "company" | "tenant" | "global";
  topK?: number;
}) {
  return requestJson<KnowledgeRetrievalResponse>("/api/knowledge/retrieval/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      scope: input.scope ?? "company",
      topK: input.topK ?? 5,
    }),
  });
}

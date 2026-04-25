export type RoleKey = string;

export type PageKey =
  | "dashboard"
  | "studio"
  | "publishing"
  | "products"
  | "assets"
  | "videos"
  | "support"
  | "personalization"
  | "agents"
  | "rules"
  | "reviews"
  | "rbac";

export type AgentStatus = "active" | "disabled";
export type KeywordReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  companyName?: string | null;
  roleKey: RoleKey;
  agentId?: string | null;
}

export interface AgentL1 {
  id: string;
  code: string;
  name: string;
  status: AgentStatus;
  ruleId: string | null;
  createdAt: string;
}

export interface KeywordRule {
  id: string;
  name: string;
  minCount: number | null;
  maxCount: number | null;
  minLen: number | null;
  maxLen: number | null;
  dedupeRequired: boolean;
  sensitiveFilterEnabled: boolean;
  submitRateLimitPerDay: number | null;
  createdAt: string;
}

export interface KeywordSubmission {
  id: string;
  displayId: string;
  agentId: string;
  status: KeywordReviewStatus;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface KeywordItem {
  id: string;
  submissionId: string;
  keyword: string;
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
  roleKey: RoleKey;
  agentId?: string;
  status: "active" | "disabled";
  createdAt: string;
}

export interface Role {
  key: RoleKey;
  name: string;
  description: string;
  isSystem: boolean;
}

export type PermissionMatrix = Record<string, Partial<Record<PageKey, boolean>>>;

import type { SupportConversationStatus, SupportMessageRole } from "@/lib/support";

export function getSupportStatusLabel(status: SupportConversationStatus) {
  if (status === "ai_chat") return "AI托管中";
  if (status === "handoff_requested") return "人工待处理";
  if (status === "queueing") return "人工待处理";
  if (status === "human_chat") return "人工处理中";
  return "已结束";
}

export function getSupportStatusVariant(status: SupportConversationStatus) {
  if (status === "ai_chat") return "blue" as const;
  if (status === "handoff_requested") return "red" as const;
  if (status === "queueing") return "red" as const;
  if (status === "human_chat") return "green" as const;
  return "gray" as const;
}

export function getSupportMessageRoleLabel(role: SupportMessageRole) {
  if (role === "visitor") return "访客";
  if (role === "ai") return "AI";
  if (role === "agent") return "人工";
  return "系统";
}

export function getSupportMessageBubbleClass(role: SupportMessageRole) {
  if (role === "visitor") return "bg-white/10 text-zinc-100";
  if (role === "ai") return "bg-blue-500/10 text-blue-100";
  if (role === "agent") return "bg-emerald-500/10 text-emerald-100";
  return "bg-amber-500/10 text-amber-100";
}

export function getSupportMessageAlign(role: SupportMessageRole) {
  if (role === "visitor" || role === "system") return "justify-start";
  return "justify-end";
}

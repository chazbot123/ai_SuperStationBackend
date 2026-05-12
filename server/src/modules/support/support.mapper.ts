import type { Prisma } from '@prisma/client';

export const supportConversationInclude = {
  assignedAgent: {
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
    },
  },
  messages: {
    orderBy: { createdAt: 'asc' },
  },
  handoffs: {
    orderBy: { requestedAt: 'desc' },
  },
} satisfies Prisma.SupportConversationInclude;

export type SupportConversationWithRelations = Prisma.SupportConversationGetPayload<{
  include: typeof supportConversationInclude;
}>;

export function serializeSupportConversation(item: SupportConversationWithRelations) {
  const latestHandoff = item.handoffs[0] ?? null;

  return {
    id: item.id,
    channel: item.channel,
    visitorSessionId: item.visitorSessionId,
    visitorName: item.visitorName,
    visitorContact: item.visitorContact,
    sourcePage: item.sourcePage,
    status: item.status,
    handoffRequestedAt: item.handoffRequestedAt?.toISOString() ?? null,
    humanTakenAt: item.humanTakenAt?.toISOString() ?? null,
    endedAt: item.endedAt?.toISOString() ?? null,
    lastMessageAt: item.lastMessageAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    assignedAgent: item.assignedAgent
      ? {
          id: item.assignedAgent.id,
          username: item.assignedAgent.username,
          displayName: item.assignedAgent.displayName,
          role: item.assignedAgent.role,
        }
      : null,
    messages: item.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      confidence: message.confidence,
      sources: message.sourcesJson,
      agentUserId: message.agentUserId,
      createdAt: message.createdAt.toISOString(),
    })),
    latestHandoff: latestHandoff
      ? {
          id: latestHandoff.id,
          status: latestHandoff.status,
          queueSerial: latestHandoff.queueSerial,
          requestedAt: latestHandoff.requestedAt.toISOString(),
          acceptedAt: latestHandoff.acceptedAt?.toISOString() ?? null,
          closedAt: latestHandoff.closedAt?.toISOString() ?? null,
          acceptedByUserId: latestHandoff.acceptedByUserId,
        }
      : null,
  };
}

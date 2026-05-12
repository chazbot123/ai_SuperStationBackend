import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupportConversationStatus,
  SupportHandoffStatus,
  SupportMessageRole,
} from '@prisma/client';
import type { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CloseSupportConversationDto } from './dto/close-support-conversation.dto';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import { ListSupportConversationsQueryDto } from './dto/list-support-conversations-query.dto';
import { ReplySupportConversationDto } from './dto/reply-support-conversation.dto';
import { RequestSupportHandoffDto } from './dto/request-support-handoff.dto';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import { TakeSupportConversationDto } from './dto/take-support-conversation.dto';
import {
  serializeSupportConversation,
  supportConversationInclude,
  type SupportConversationWithRelations,
} from './support.mapper';
import { SupportAiService } from './support-ai.service';

const SUPPORT_AUTO_END_MINUTES = 3;
const SUPPORT_ENDED_HANDOFF_KEEP = 10;
const DEFAULT_PUBLIC_SUPPORT_OWNER_USER_ID = 'cmotrwinc0000n4u9e265uccn';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supportAiService: SupportAiService,
  ) {}

  async createOrResumePublicSession(dto: CreateSupportSessionDto) {
    await this.cleanupExpiredSupportConversations();

    const visitorSessionId = dto.visitorSessionId.trim();
    if (!visitorSessionId) {
      throw new BadRequestException('访客会话标识不能为空');
    }

    const existing = await this.prisma.supportConversation.findFirst({
      where: {
        visitorSessionId,
        status: {
          in: [
            SupportConversationStatus.ai_chat,
            SupportConversationStatus.handoff_requested,
            SupportConversationStatus.queueing,
            SupportConversationStatus.human_chat,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: supportConversationInclude,
    });

    if (existing) {
      const updated = await this.prisma.supportConversation.update({
        where: { id: existing.id },
        data: {
          visitorName: dto.visitorName?.trim() || existing.visitorName,
          visitorContact: dto.visitorContact?.trim() || existing.visitorContact,
          sourcePage: dto.sourcePage?.trim() || existing.sourcePage,
        },
        include: supportConversationInclude,
      });
      return serializeSupportConversation(updated);
    }

    const created = await this.prisma.supportConversation.create({
      data: {
        visitorSessionId,
        visitorName: dto.visitorName?.trim() || null,
        visitorContact: dto.visitorContact?.trim() || null,
        sourcePage: dto.sourcePage?.trim() || null,
        status: SupportConversationStatus.ai_chat,
      },
      include: supportConversationInclude,
    });

    return serializeSupportConversation(created);
  }

  async getPublicSession(conversationId: string) {
    await this.cleanupExpiredSupportConversations();
    const conversation = await this.findConversationOrThrow(conversationId);
    return serializeSupportConversation(conversation);
  }

  async sendPublicMessage(conversationId: string, dto: SendSupportMessageDto) {
    await this.cleanupExpiredSupportConversations();
    const conversation = await this.findConversationOrThrow(conversationId);
    const content = dto.message.trim();
    if (!content) {
      throw new BadRequestException('消息不能为空');
    }
    if (conversation.status === SupportConversationStatus.ended) {
      throw new BadRequestException('会话已结束，不能继续发送消息');
    }

    const currentConversation = await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          conversationId,
          role: SupportMessageRole.visitor,
          content,
        },
      });

      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
        },
      });

      const current = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!current) {
        throw new NotFoundException('客服会话不存在');
      }

      return current;
    });

    if (currentConversation.status !== SupportConversationStatus.ai_chat) {
      return serializeSupportConversation(currentConversation);
    }

    const handoffKeywordMatched = this.supportAiService.hasHandoffIntent(content);
    if (this.supportAiService.shouldRequestHandoff(content)) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.enqueueHandoff(tx, conversationId);

        await tx.supportMessage.create({
          data: {
            conversationId,
            role: SupportMessageRole.system,
            content: '已根据访客消息自动转人工，当前进入人工待处理。',
          },
        });

        const finalConversation = await tx.supportConversation.findUnique({
          where: { id: conversationId },
          include: supportConversationInclude,
        });

        if (!finalConversation) {
          throw new NotFoundException('客服会话不存在');
        }

        return finalConversation;
      });

      return serializeSupportConversation(updated);
    }

    if (handoffKeywordMatched) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.supportMessage.create({
          data: {
            conversationId,
            role: SupportMessageRole.system,
            content:
              '人工客服当前不在服务时间内。人工客服服务时间为北京时间 09:00-12:00、14:00-18:00，您可以先留言问题，待人工客服在线后再跟进处理。',
          },
        });

        await tx.supportConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: new Date(),
          },
        });

        const finalConversation = await tx.supportConversation.findUnique({
          where: { id: conversationId },
          include: supportConversationInclude,
        });

        if (!finalConversation) {
          throw new NotFoundException('客服会话不存在');
        }

        return finalConversation;
      });

      return serializeSupportConversation(updated);
    }

    let aiMessagePayload:
      | {
          role: SupportMessageRole;
          content: string;
          confidence: number;
          sourcesJson: Prisma.InputJsonValue;
        }
      | {
          role: SupportMessageRole;
          content: string;
          confidence?: undefined;
          sourcesJson?: undefined;
        };

    try {
      const aiReply = await this.supportAiService.generateReply(
        content,
        DEFAULT_PUBLIC_SUPPORT_OWNER_USER_ID,
      );
      aiMessagePayload = {
        role: SupportMessageRole.ai,
        content: aiReply.answer,
        confidence: aiReply.confidence,
        sourcesJson: aiReply.sources as Prisma.InputJsonValue,
      };
    } catch (error) {
      this.logger.error(
        `AI 托管回复失败，conversationId=${conversationId}`,
        error instanceof Error ? error.stack : undefined,
      );
      aiMessagePayload = {
        role: SupportMessageRole.system,
        content: 'AI 客服暂时未能生成回复，请稍后重试或直接转人工客服。',
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const latestConversation = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!latestConversation) {
        throw new NotFoundException('客服会话不存在');
      }

      if (latestConversation.status === SupportConversationStatus.ai_chat) {
        await tx.supportMessage.create({
          data: {
            conversationId,
            role: aiMessagePayload.role,
            content: aiMessagePayload.content,
            confidence: aiMessagePayload.confidence,
            sourcesJson: aiMessagePayload.sourcesJson,
          },
        });

        await tx.supportConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: new Date(),
          },
        });
      }

      const finalConversation = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!finalConversation) {
        throw new NotFoundException('客服会话不存在');
      }

      return finalConversation;
    });

    return serializeSupportConversation(updated);
  }

  async requestPublicHandoff(conversationId: string, dto: RequestSupportHandoffDto) {
    await this.cleanupExpiredSupportConversations();
    const conversation = await this.findConversationOrThrow(conversationId);
    if (conversation.status === SupportConversationStatus.ended) {
      throw new BadRequestException('会话已结束，不能申请转人工');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.enqueueHandoff(tx, conversationId);

      await tx.supportMessage.create({
        data: {
          conversationId,
          role: SupportMessageRole.system,
          content: dto.note?.trim()
            ? `访客申请转人工：${dto.note.trim()}`
            : '访客申请转人工，当前进入排队中。',
        },
      });

      const current = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!current) {
        throw new NotFoundException('客服会话不存在');
      }

      return current;
    });

    const pendingAhead = await this.prisma.supportHandoff.count({
      where: {
        status: SupportHandoffStatus.pending,
        requestedAt: {
          lt: updated.handoffs[0]?.requestedAt ?? new Date(),
        },
      },
    });

    return {
      ...serializeSupportConversation(updated),
      queueNumber: pendingAhead + 1,
    };
  }

  async getPublicQueueStatus(conversationId: string) {
    await this.cleanupExpiredSupportConversations();
    const conversation = await this.findConversationOrThrow(conversationId);
    const latestHandoff = conversation.handoffs[0] ?? null;

    let queueNumber = 0;
    if (latestHandoff?.status === SupportHandoffStatus.pending) {
      queueNumber =
        (await this.prisma.supportHandoff.count({
          where: {
            status: SupportHandoffStatus.pending,
            requestedAt: { lt: latestHandoff.requestedAt },
          },
        })) + 1;
    }

    return {
      conversationId: conversation.id,
      status: conversation.status,
      queueNumber,
      assignedAgent: conversation.assignedAgent
        ? {
            id: conversation.assignedAgent.id,
            displayName: conversation.assignedAgent.displayName,
          }
        : null,
      latestHandoff: latestHandoff
        ? {
            id: latestHandoff.id,
            status: latestHandoff.status,
            queueSerial: latestHandoff.queueSerial,
          }
        : null,
    };
  }

  async listAdminConversations(user: SessionUser, query: ListSupportConversationsQueryDto) {
    this.ensureMainCompanyUser(user);
    await this.cleanupExpiredSupportConversations();

    const trimmedQuery = query.q?.trim();
    const where: Prisma.SupportConversationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.onlyWaitingHandoff
        ? {
            status: {
              in: [SupportConversationStatus.handoff_requested, SupportConversationStatus.queueing],
            },
          }
        : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { visitorSessionId: { contains: trimmedQuery, mode: 'insensitive' } },
              { visitorName: { contains: trimmedQuery, mode: 'insensitive' } },
              { visitorContact: { contains: trimmedQuery, mode: 'insensitive' } },
              { sourcePage: { contains: trimmedQuery, mode: 'insensitive' } },
              {
                messages: {
                  some: {
                    content: { contains: trimmedQuery, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supportConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: supportConversationInclude,
      }),
      this.prisma.supportConversation.count({ where }),
    ]);

    return {
      items: items.map((item) => serializeSupportConversation(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  async getAdminConversation(user: SessionUser, conversationId: string) {
    this.ensureMainCompanyUser(user);
    await this.cleanupExpiredSupportConversations();
    return serializeSupportConversation(await this.findConversationOrThrow(conversationId));
  }

  async takeAdminConversation(user: SessionUser, conversationId: string, dto: TakeSupportConversationDto) {
    this.ensureMainCompanyUser(user);
    await this.cleanupExpiredSupportConversations();
    const conversation = await this.findConversationOrThrow(conversationId);
    if (conversation.status === SupportConversationStatus.ended) {
      throw new BadRequestException('会话已结束，不能再接线');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const pendingHandoff = await tx.supportHandoff.findFirst({
        where: {
          conversationId,
          status: SupportHandoffStatus.pending,
        },
        orderBy: { requestedAt: 'desc' },
      });

      if (pendingHandoff) {
        await tx.supportHandoff.update({
          where: { id: pendingHandoff.id },
          data: {
            status: SupportHandoffStatus.accepted,
            acceptedAt: new Date(),
            acceptedByUserId: user.userId,
          },
        });
      }

      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          assignedAgentId: user.userId,
          status: SupportConversationStatus.human_chat,
          humanTakenAt: new Date(),
          lastMessageAt: new Date(),
        },
      });

      await tx.supportMessage.create({
        data: {
          conversationId,
          role: SupportMessageRole.system,
          content: dto.note?.trim()
            ? `人工客服已接线：${dto.note.trim()}`
            : '人工客服已接线，当前进入人工处理。',
          agentUserId: user.userId,
        },
      });

      const current = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!current) {
        throw new NotFoundException('客服会话不存在');
      }

      return current;
    });

    return serializeSupportConversation(updated);
  }

  async replyAdminConversation(user: SessionUser, conversationId: string, dto: ReplySupportConversationDto) {
    this.ensureMainCompanyUser(user);
    await this.cleanupExpiredSupportConversations();
    const content = dto.message.trim();
    if (!content) {
      throw new BadRequestException('回复内容不能为空');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!conversation) {
        throw new NotFoundException('客服会话不存在');
      }
      if (conversation.status === SupportConversationStatus.ended) {
        throw new BadRequestException('会话已结束，不能继续回复');
      }

      await tx.supportMessage.create({
        data: {
          conversationId,
          role: SupportMessageRole.agent,
          content,
          agentUserId: user.userId,
        },
      });

      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          assignedAgentId: conversation.assignedAgentId ?? user.userId,
          status: SupportConversationStatus.human_chat,
          lastMessageAt: new Date(),
        },
      });

      const current = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!current) {
        throw new NotFoundException('客服会话不存在');
      }

      return current;
    });

    return serializeSupportConversation(updated);
  }

  async closeAdminConversation(user: SessionUser, conversationId: string, dto: CloseSupportConversationDto) {
    this.ensureMainCompanyUser(user);
    await this.cleanupExpiredSupportConversations();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          status: SupportConversationStatus.ended,
          endedAt: new Date(),
          lastMessageAt: new Date(),
        },
      });

      await tx.supportHandoff.updateMany({
        where: {
          conversationId,
          status: {
            in: [SupportHandoffStatus.pending, SupportHandoffStatus.accepted],
          },
        },
        data: {
          status: SupportHandoffStatus.closed,
          closedAt: new Date(),
        },
      });

      await tx.supportMessage.create({
        data: {
          conversationId,
          role: SupportMessageRole.system,
          content: dto.note?.trim() ? `会话已结束：${dto.note.trim()}` : '会话已结束。',
          agentUserId: user.userId,
        },
      });

      const current = await tx.supportConversation.findUnique({
        where: { id: conversationId },
        include: supportConversationInclude,
      });

      if (!current) {
        throw new NotFoundException('客服会话不存在');
      }

      return current;
    });

    return serializeSupportConversation(updated);
  }

  private async findConversationOrThrow(conversationId: string): Promise<SupportConversationWithRelations> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      include: supportConversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException('客服会话不存在');
    }

    return conversation;
  }

  private async cleanupExpiredSupportConversations() {
    const inactiveBefore = new Date(Date.now() - SUPPORT_AUTO_END_MINUTES * 60 * 1000);

    await this.prisma.supportConversation.updateMany({
      where: {
        status: {
          not: SupportConversationStatus.ended,
        },
        lastMessageAt: {
          lt: inactiveBefore,
        },
      },
      data: {
        status: SupportConversationStatus.ended,
        endedAt: new Date(),
      },
    });

    const endedWithoutHandoff = await this.prisma.supportConversation.findMany({
      select: { id: true },
      where: {
        status: SupportConversationStatus.ended,
        handoffs: {
          none: {},
        },
      },
    });

    if (endedWithoutHandoff.length > 0) {
      await this.prisma.supportConversation.deleteMany({
        where: {
          id: {
            in: endedWithoutHandoff.map((item) => item.id),
          },
        },
      });
    }

    const endedWithHandoff = await this.prisma.supportConversation.findMany({
      select: { id: true },
      where: {
        status: SupportConversationStatus.ended,
        handoffs: {
          some: {},
        },
      },
      orderBy: [{ endedAt: 'desc' }, { lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: SUPPORT_ENDED_HANDOFF_KEEP,
    });

    if (endedWithHandoff.length === 0) {
      return;
    }

    await this.prisma.supportConversation.deleteMany({
      where: {
        id: {
          in: endedWithHandoff.map((item) => item.id),
        },
      },
    });
  }

  private async enqueueHandoff(tx: Prisma.TransactionClient, conversationId: string) {
    const lastPending = await tx.supportHandoff.findFirst({
      where: {
        conversationId,
        status: {
          in: [SupportHandoffStatus.pending, SupportHandoffStatus.accepted],
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (!lastPending) {
      const pendingCount = await tx.supportHandoff.count({
        where: { status: SupportHandoffStatus.pending },
      });

      await tx.supportHandoff.create({
        data: {
          conversationId,
          status: SupportHandoffStatus.pending,
          queueSerial: pendingCount + 1,
        },
      });
    }

    await tx.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: SupportConversationStatus.queueing,
        handoffRequestedAt: new Date(),
        lastMessageAt: new Date(),
      },
    });
  }

  private ensureMainCompanyUser(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司账号可访问 AI 客服后台');
    }
  }
}

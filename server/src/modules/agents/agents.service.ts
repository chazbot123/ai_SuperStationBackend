import { AgentStatus, Prisma } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: SessionUser, query: ListAgentsQueryDto) {
    const where = this.buildWhere(user, query);
    const [items, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.agent.count({ where }),
    ]);

    return {
      items,
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async create(user: SessionUser, dto: CreateAgentDto) {
    await this.ensureMainCompany(user);

    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.agent.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('代理编号已存在');
    }

    return this.prisma.agent.create({
      data: {
        code,
        name: dto.name.trim(),
        ruleId: dto.ruleId?.trim() || null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async getById(user: SessionUser, id: string) {
    const agent = await this.findAccessibleAgent(user, id);
    return this.findAgentWithUser(agent.id);
  }

  async update(user: SessionUser, id: string, dto: UpdateAgentDto) {
    await this.ensureMainCompany(user);
    await this.ensureAgentExists(id);

    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined
          ? { status: dto.status as AgentStatus }
          : {}),
        ...(dto.ruleId !== undefined ? { ruleId: dto.ruleId.trim() || null } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  private buildWhere(user: SessionUser, query: ListAgentsQueryDto): Prisma.AgentWhereInput {
    const trimmedQuery = query.q?.trim();
    const baseWhere: Prisma.AgentWhereInput = {
      ...(query.status ? { status: query.status as AgentStatus } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { code: { contains: trimmedQuery, mode: 'insensitive' } },
              { name: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (user.role === MAIN_COMPANY_ROLE_KEY) {
      return baseWhere;
    }

    return {
      ...baseWhere,
      userId: user.userId,
    };
  }

  private async findAccessibleAgent(user: SessionUser, id: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });

    if (!agent) {
      throw new NotFoundException('代理不存在');
    }

    if (user.role !== MAIN_COMPANY_ROLE_KEY && agent.userId !== user.userId) {
      throw new ForbiddenException('无权访问该代理');
    }

    return agent;
  }

  private async ensureAgentExists(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!agent) {
      throw new NotFoundException('代理不存在');
    }
  }

  private async findAgentWithUser(id: string) {
    return this.prisma.agent.findUniqueOrThrow({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  private async ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可操作代理');
    }
  }
}

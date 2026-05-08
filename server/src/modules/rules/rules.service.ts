import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListRulesQueryDto) {
    const trimmedQuery = query.q?.trim();
    const where: Prisma.RuleWhereInput = trimmedQuery
      ? {
          name: {
            contains: trimmedQuery,
            mode: 'insensitive',
          },
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.rule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.rule.count({ where }),
    ]);

    return {
      items,
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async create(user: SessionUser, dto: CreateRuleDto) {
    this.ensureMainCompany(user);
    this.validateRange(dto.minCount, dto.maxCount, '关键词数量');
    this.validateRange(dto.minLen, dto.maxLen, '关键词长度');

    const name = dto.name.trim();
    const existing = await this.prisma.rule.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('规则名称已存在');
    }

    return this.prisma.rule.create({
      data: {
        name,
        minCount: dto.minCount ?? null,
        maxCount: dto.maxCount ?? null,
        minLen: dto.minLen ?? null,
        maxLen: dto.maxLen ?? null,
        dedupeRequired: dto.dedupeRequired,
        sensitiveFilterEnabled: dto.sensitiveFilterEnabled,
        submitRateLimitPerDay: dto.submitRateLimitPerDay ?? null,
      },
    });
  }

  async getById(id: string) {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException('规则不存在');
    }
    return rule;
  }

  async update(user: SessionUser, id: string, dto: UpdateRuleDto) {
    this.ensureMainCompany(user);
    const existing = await this.prisma.rule.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('规则不存在');
    }

    const nextMinCount = dto.minCount ?? existing.minCount;
    const nextMaxCount = dto.maxCount ?? existing.maxCount;
    const nextMinLen = dto.minLen ?? existing.minLen;
    const nextMaxLen = dto.maxLen ?? existing.maxLen;

    this.validateRange(nextMinCount, nextMaxCount, '关键词数量');
    this.validateRange(nextMinLen, nextMaxLen, '关键词长度');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.prisma.rule.findFirst({
        where: {
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('规则名称已存在');
      }
    }

    return this.prisma.rule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.minCount !== undefined ? { minCount: dto.minCount } : {}),
        ...(dto.maxCount !== undefined ? { maxCount: dto.maxCount } : {}),
        ...(dto.minLen !== undefined ? { minLen: dto.minLen } : {}),
        ...(dto.maxLen !== undefined ? { maxLen: dto.maxLen } : {}),
        ...(dto.dedupeRequired !== undefined
          ? { dedupeRequired: dto.dedupeRequired }
          : {}),
        ...(dto.sensitiveFilterEnabled !== undefined
          ? { sensitiveFilterEnabled: dto.sensitiveFilterEnabled }
          : {}),
        ...(dto.submitRateLimitPerDay !== undefined
          ? { submitRateLimitPerDay: dto.submitRateLimitPerDay }
          : {}),
      },
    });
  }

  private ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可操作规则');
    }
  }

  private validateRange(min: number | null | undefined, max: number | null | undefined, label: string) {
    if (min != null && max != null && min > max) {
      throw new ConflictException(`${label}最小值不能大于最大值`);
    }
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreateCustomerLeadDto } from './dto/create-customer-lead.dto';
import { ListCustomerLeadsQueryDto } from './dto/list-customer-leads-query.dto';
import { UpdateCustomerLeadDto } from './dto/update-customer-lead.dto';

@Injectable()
export class CustomerManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: SessionUser, query: ListCustomerLeadsQueryDto) {
    this.ensureMainCompany(user);

    const trimmedQuery = query.q?.trim();
    const where: Prisma.CustomerLeadWhereInput = {
      ...(query.sourcePlatform ? { sourcePlatform: query.sourcePlatform } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { name: { contains: trimmedQuery, mode: 'insensitive' } },
              { phoneNumber: { contains: trimmedQuery, mode: 'insensitive' } },
              { address: { contains: trimmedQuery, mode: 'insensitive' } },
              { remark: { contains: trimmedQuery, mode: 'insensitive' } },
              { wechatId: { contains: trimmedQuery, mode: 'insensitive' } },
              { platformName: { contains: trimmedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customerLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.customerLead.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };
  }

  async create(user: SessionUser, dto: CreateCustomerLeadDto) {
    this.ensureMainCompany(user);

    return this.prisma.customerLead.create({
      data: {
        name: this.normalizeNullable(dto.name),
        phoneNumber: this.normalizeNullable(dto.phoneNumber),
        address: this.normalizeNullable(dto.address),
        remark: this.normalizeNullable(dto.remark),
        wechatId: this.normalizeNullable(dto.wechatId),
        platformName: this.normalizeNullable(dto.platformName),
        sourcePlatform: dto.sourcePlatform,
      },
    });
  }

  async getById(user: SessionUser, id: string) {
    this.ensureMainCompany(user);
    return this.findOrThrow(id);
  }

  async update(user: SessionUser, id: string, dto: UpdateCustomerLeadDto) {
    this.ensureMainCompany(user);
    await this.findOrThrow(id);

    return this.prisma.customerLead.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: this.normalizeNullable(dto.name) } : {}),
        ...(dto.phoneNumber !== undefined
          ? { phoneNumber: this.normalizeNullable(dto.phoneNumber) }
          : {}),
        ...(dto.address !== undefined ? { address: this.normalizeNullable(dto.address) } : {}),
        ...(dto.remark !== undefined ? { remark: this.normalizeNullable(dto.remark) } : {}),
        ...(dto.wechatId !== undefined ? { wechatId: this.normalizeNullable(dto.wechatId) } : {}),
        ...(dto.platformName !== undefined
          ? { platformName: this.normalizeNullable(dto.platformName) }
          : {}),
        ...(dto.sourcePlatform !== undefined ? { sourcePlatform: dto.sourcePlatform } : {}),
      },
    });
  }

  async remove(user: SessionUser, id: string) {
    this.ensureMainCompany(user);
    await this.findOrThrow(id);
    await this.prisma.customerLead.delete({ where: { id } });
    return { success: true };
  }

  private async findOrThrow(id: string) {
    const item = await this.prisma.customerLead.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException('客户信息不存在');
    }

    return item;
  }

  private ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可管理客户信息');
    }
  }

  private normalizeNullable(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAIN_COMPANY_ROLE_KEY } from '../rbac/rbac.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: SessionUser, query: ListUsersQueryDto) {
    this.ensureMainCompany(user);

    const trimmedQuery = query.q?.trim();
    const where: Prisma.UserWhereInput = trimmedQuery
      ? {
          OR: [
            { username: { contains: trimmedQuery, mode: 'insensitive' } },
            { displayName: { contains: trimmedQuery, mode: 'insensitive' } },
            { companyName: { contains: trimmedQuery, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          companyName: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async create(user: SessionUser, dto: CreateUserDto) {
    this.ensureMainCompany(user);
    await this.ensureRoleExists(dto.role.trim());

    const username = dto.username.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    return this.prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        displayName: dto.displayName.trim(),
        companyName: dto.companyName?.trim() || null,
        role: dto.role.trim(),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        companyName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getById(currentUser: SessionUser, id: string) {
    this.ensureSelfOrMainCompany(currentUser, id);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        companyName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async update(currentUser: SessionUser, id: string, dto: UpdateUserDto) {
    await this.ensureUserExists(id);
    if (dto.role !== undefined) {
      await this.ensureRoleExists(dto.role.trim());
    }
    this.ensureUpdateAllowed(currentUser, id, dto);

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        : undefined;

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.companyName !== undefined
          ? { companyName: dto.companyName.trim() || null }
          : {}),
        ...(dto.role !== undefined ? { role: dto.role.trim() } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        companyName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (passwordHash !== undefined) {
      await this.prisma.userSession.updateMany({
        where: {
          userId: id,
          status: SessionStatus.active,
        },
        data: {
          status: SessionStatus.revoked,
          revokedAt: new Date(),
        },
      });
    }

    return updatedUser;
  }

  async remove(user: SessionUser, id: string) {
    this.ensureMainCompany(user);
    await this.ensureUserExists(id);
    await this.prisma.userSession.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
  }

  private async ensureRoleExists(roleKey: string) {
    const role = await this.prisma.rbacRole.findUnique({
      where: { key: roleKey },
      select: { key: true },
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }
  }

  private ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可管理用户');
    }
  }

  private ensureSelfOrMainCompany(currentUser: SessionUser, targetUserId: string) {
    if (
      currentUser.role !== MAIN_COMPANY_ROLE_KEY &&
      currentUser.userId !== targetUserId
    ) {
      throw new ForbiddenException('仅可查看自己的账号信息');
    }
  }

  private ensureUpdateAllowed(
    currentUser: SessionUser,
    targetUserId: string,
    dto: UpdateUserDto,
  ) {
    if (currentUser.role === MAIN_COMPANY_ROLE_KEY) {
      return;
    }

    if (currentUser.userId !== targetUserId) {
      throw new ForbiddenException('仅可修改自己的密码');
    }

    if (
      dto.password === undefined ||
      dto.displayName !== undefined ||
      dto.companyName !== undefined ||
      dto.role !== undefined
    ) {
      throw new ForbiddenException('非主公司账号仅可通过个人改密修改自己的密码');
    }
  }
}

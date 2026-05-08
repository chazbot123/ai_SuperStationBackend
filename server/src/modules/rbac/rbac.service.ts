import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildEmptyPermissionMap,
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_ROLES,
  MAIN_COMPANY_ROLE_KEY,
} from './rbac.constants';
import {
  RbacPageKey,
  UpdatePermissionMatrixDto,
} from './dto/update-permission-matrix.dto';
import { RBAC_PAGE_KEYS } from './dto/update-permission-matrix.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getRbac() {
    await this.ensureSeeded();

    const [roles, permissions] = await Promise.all([
      this.prisma.rbacRole.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.rbacPagePermission.findMany({
        orderBy: [{ roleKey: 'asc' }, { pageKey: 'asc' }],
      }),
    ]);

    const permissionMatrix = roles.reduce(
      (matrix, roleKey) => {
        matrix[roleKey.key] = buildEmptyPermissionMap();
        return matrix;
      },
      {} as Record<string, Record<RbacPageKey, boolean>>,
    );

    for (const permission of permissions) {
      if (!permissionMatrix[permission.roleKey]) {
        permissionMatrix[permission.roleKey] = buildEmptyPermissionMap();
      }
      permissionMatrix[permission.roleKey][permission.pageKey] = permission.allowed;
    }

    return {
      roles: roles.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      })),
      permissionMatrix,
    };
  }

  async createRole(user: SessionUser, dto: CreateRoleDto) {
    this.ensureMainCompany(user);
    await this.ensureSeeded();

    const key = dto.key.trim();
    const existingRole = await this.prisma.rbacRole.findUnique({
      where: { key },
      select: { key: true },
    });

    if (existingRole) {
      throw new ConflictException('角色键已存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rbacRole.create({
        data: {
          key,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          isSystem: false,
        },
      });

      for (const pageKey of RBAC_PAGE_KEYS) {
        await tx.rbacPagePermission.create({
          data: {
            roleKey: key,
            pageKey,
            allowed: false,
          },
        });
      }
    });

    return this.getRbac();
  }

  async updateRole(user: SessionUser, key: string, dto: UpdateRoleDto) {
    this.ensureMainCompany(user);
    await this.ensureSeeded();

    const existingRole = await this.prisma.rbacRole.findUnique({
      where: { key },
      select: { key: true, isSystem: true },
    });

    if (!existingRole) {
      throw new NotFoundException('角色不存在');
    }

    const nextName = dto.name?.trim();
    const nextDescription = dto.description?.trim();

    if (!nextName && nextDescription === undefined) {
      return this.getRbac();
    }

    await this.prisma.rbacRole.update({
      where: { key },
      data: {
        ...(nextName ? { name: nextName } : {}),
        ...(nextDescription !== undefined ? { description: nextDescription } : {}),
      },
    });

    return this.getRbac();
  }

  async removeRole(user: SessionUser, key: string) {
    this.ensureMainCompany(user);
    await this.ensureSeeded();

    if (key === MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('主公司角色不允许删除');
    }

    const role = await this.prisma.rbacRole.findUnique({
      where: { key },
      select: { key: true },
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    const assignedUserCount = await this.prisma.user.count({
      where: { role: key },
    });

    if (assignedUserCount > 0) {
      throw new ForbiddenException('该角色仍被用户使用，无法删除');
    }

    await this.prisma.rbacRole.delete({
      where: { key },
    });

    return this.getRbac();
  }

  async updatePermission(user: SessionUser, dto: UpdatePermissionMatrixDto) {
    this.ensureMainCompany(user);
    await this.ensureSeeded();

    const roleKeys = [...new Set(dto.items.map((item) => item.roleKey.trim()))];
    const roles = await this.prisma.rbacRole.findMany({
      where: { key: { in: roleKeys } },
      select: { key: true },
    });
    const existingRoleKeys = new Set(roles.map((role) => role.key));

    for (const roleKey of roleKeys) {
      if (!existingRoleKeys.has(roleKey)) {
        throw new NotFoundException(`角色不存在: ${roleKey}`);
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.rbacPagePermission.upsert({
          where: {
            roleKey_pageKey: {
              roleKey: item.roleKey.trim(),
              pageKey: item.pageKey,
            },
          },
          update: { allowed: item.allowed },
          create: {
            roleKey: item.roleKey.trim(),
            pageKey: item.pageKey,
            allowed: item.allowed,
          },
        }),
      ),
    );

    return this.getRbac();
  }

  private ensureMainCompany(user: SessionUser) {
    if (user.role !== MAIN_COMPANY_ROLE_KEY) {
      throw new ForbiddenException('仅主公司可管理角色与权限');
    }
  }

  private async ensureSeeded() {
    const defaultRoleKeys = DEFAULT_ROLES.map((role) => role.key);
    const expectedRoleCount = defaultRoleKeys.length;
    const expectedPermissionCount = expectedRoleCount * RBAC_PAGE_KEYS.length;

    const [existingRoleCount, existingPermissionCount] = await Promise.all([
      this.prisma.rbacRole.count({
        where: {
          key: { in: defaultRoleKeys },
        },
      }),
      this.prisma.rbacPagePermission.count({
        where: {
          roleKey: { in: defaultRoleKeys },
        },
      }),
    ]);

    // Default RBAC data already exists, so skip the heavy seed transaction.
    if (
      existingRoleCount === expectedRoleCount &&
      existingPermissionCount === expectedPermissionCount
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const role of DEFAULT_ROLES) {
        await tx.rbacRole.upsert({
          where: { key: role.key },
          update: {
            isSystem: true,
          },
          create: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
          },
        });
      }

      for (const role of DEFAULT_ROLES) {
        for (const pageKey of RBAC_PAGE_KEYS) {
          await tx.rbacPagePermission.upsert({
            where: {
              roleKey_pageKey: {
                roleKey: role.key,
                pageKey,
              },
            },
            update: {},
            create: {
              roleKey: role.key,
              pageKey,
              allowed: DEFAULT_PERMISSION_MATRIX[role.key][pageKey],
            },
          });
        }
      }
    });
  }
}

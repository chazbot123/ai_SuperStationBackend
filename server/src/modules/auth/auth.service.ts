import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SessionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await this.verifyPassword(
      user.id,
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const deviceLimit = Number(this.configService.get('SESSION_DEVICE_LIMIT') ?? 2);
    const activeSessions = await this.prisma.userSession.findMany({
      where: {
        userId: user.id,
        status: SessionStatus.active,
      },
      orderBy: {
        loggedInAt: 'asc',
      },
    });

    let squeezedSessionId: string | null = null;

    if (activeSessions.length >= deviceLimit) {
      const oldestSession = activeSessions[0];
      squeezedSessionId = oldestSession.id;
      await this.prisma.userSession.update({
        where: { id: oldestSession.id },
        data: {
          status: SessionStatus.squeezed,
          revokedAt: new Date(),
        },
      });
    }

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        status: SessionStatus.active,
        replacedById: null,
      },
    });

    if (squeezedSessionId) {
      await this.prisma.userSession.update({
        where: { id: squeezedSessionId },
        data: { replacedById: session.id },
      });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      sessionId: session.id,
      deviceId: session.deviceId,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        companyName: user.companyName,
        role: user.role,
      },
      session: {
        id: session.id,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        loggedInAt: session.loggedInAt,
        status: session.status,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        companyName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        agentBinding: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return {
      ...user,
      agentId: user.agentBinding?.id ?? null,
      agentBinding: undefined,
    };
  }

  async listSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { loggedInAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        status: true,
        loggedInAt: true,
        revokedAt: true,
        replacedById: true,
      },
    });
  }

  async logout(userId: string, sessionId: string) {
    await this.ensureSessionOwner(userId, sessionId);
    await this.revokeSession(sessionId);
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const isOldPasswordValid = await this.verifyPassword(
      user.id,
      user.passwordHash,
      dto.oldPassword,
    );

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('旧密码错误');
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new ForbiddenException('新密码不能与旧密码相同');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
      },
    });

    await this.prisma.userSession.updateMany({
      where: {
        userId,
        status: SessionStatus.active,
      },
      data: {
        status: SessionStatus.revoked,
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async validateSession(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        status: SessionStatus.active,
      },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('登录状态已失效');
    }
  }

  private async ensureSessionOwner(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    return session;
  }

  private async revokeSession(sessionId: string) {
    await this.prisma.userSession.updateMany({
      where: {
        id: sessionId,
        status: SessionStatus.active,
      },
      data: {
        status: SessionStatus.revoked,
        revokedAt: new Date(),
      },
    });
  }

  private async verifyPassword(
    userId: string,
    storedPasswordHash: string,
    password: string,
  ) {
    if (await bcrypt.compare(password, storedPasswordHash)) {
      return true;
    }

    if (storedPasswordHash !== password) {
      return false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
    });

    return true;
  }
}
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'change_me_jwt_secret',
    });
  }

  async validate(payload: {
    sub: string;
    username: string;
    role: SessionUser['role'];
    sessionId: string;
    deviceId: string;
  }): Promise<SessionUser> {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        status: 'active',
      },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('登录状态已失效');
    }

    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
    };
  }
}
import { Body, Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StartOfficialOauthLoginDto } from './dto/start-official-oauth-login.dto';
import { PublishingService } from './publishing.service';

@Controller('publishing/platform-accounts/official-oauth')
export class PublishingOauthController {
  constructor(private readonly publishingService: PublishingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('start')
  startOfficialOauthLogin(
    @Req() req: { user: SessionUser },
    @Query() dto: StartOfficialOauthLoginDto,
  ) {
    return this.publishingService.startOfficialOauthLogin(req.user, dto);
  }

  @Get('callback')
  async completeOfficialOauthLogin(
    @Query('platform') platform: string,
    @Query('code') code: string,
    @Query('auth_code') authCode: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const redirectUrl = await this.publishingService.completeOfficialOauthLogin({
      platform,
      code: code || authCode,
      state,
    });
    return res.redirect(redirectUrl);
  }
}

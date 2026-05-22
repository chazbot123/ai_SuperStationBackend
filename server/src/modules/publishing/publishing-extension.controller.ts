import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StartExtensionPublishJobDto } from './dto/start-extension-publish-job.dto';
import { GetExtensionPublishAuthDto } from './dto/get-extension-publish-auth.dto';
import { OpenPlatformAccountHomeDto } from './dto/open-platform-account-home.dto';
import { SyncExtensionPublishJobDto } from './dto/sync-extension-publish-job.dto';
import { SyncPlatformExtensionLoginDto } from './dto/sync-platform-extension-login.dto';
import { PublishingService } from './publishing.service';

@Controller('publishing')
export class PublishingExtensionController {
  constructor(private readonly publishingService: PublishingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('extension/publish-jobs/start')
  startExtensionPublishJob(
    @Req() req: { user: SessionUser },
    @Body() dto: StartExtensionPublishJobDto,
  ) {
    return this.publishingService.startExtensionPublishJob(req.user, dto);
  }

  @Post('extension/publish-jobs/auth')
  getExtensionPublishAuth(@Body() dto: GetExtensionPublishAuthDto) {
    return this.publishingService.getExtensionPublishAuth(dto.sessionToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('extension/platform-accounts/open-home')
  openPlatformAccountHome(
    @Req() req: { user: SessionUser },
    @Body() dto: OpenPlatformAccountHomeDto,
  ) {
    return this.publishingService.openPlatformAccountHome(req.user, dto.accountId);
  }

  @Post('extension/publish-jobs/sync')
  syncExtensionPublishJob(@Body() dto: SyncExtensionPublishJobDto) {
    return this.publishingService.syncExtensionPublishJob(dto);
  }

  @Post('platform-accounts/extension-login/sync')
  syncPlatformLogin(@Body() dto: SyncPlatformExtensionLoginDto) {
    return this.publishingService.syncPlatformExtensionLogin(dto);
  }
}

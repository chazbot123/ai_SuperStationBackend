import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SessionUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StartExtensionPublishJobDto } from './dto/start-extension-publish-job.dto';
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

  @Post('extension/publish-jobs/sync')
  syncExtensionPublishJob(@Body() dto: SyncExtensionPublishJobDto) {
    return this.publishingService.syncExtensionPublishJob(dto);
  }

  @Post('platform-accounts/extension-login/sync')
  syncPlatformLogin(@Body() dto: SyncPlatformExtensionLoginDto) {
    return this.publishingService.syncPlatformExtensionLogin(dto);
  }
}

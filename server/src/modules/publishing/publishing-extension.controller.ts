import { Body, Controller, Get, NotFoundException, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
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

  @Get('extension/platform-login-helper/download')
  async downloadPlatformLoginHelper(@Res() res: Response) {
    const serverRoot = process.cwd();
    const extensionDir = join(serverRoot, '..', 'scripts', 'browser-extension', 'platform-login-helper');
    const guidePath = join(serverRoot, '..', 'docs', 'browser-extension-platform-login.md');

    const extensionStat = await stat(extensionDir).catch(() => null);
    if (!extensionStat?.isDirectory()) {
      throw new NotFoundException('浏览器扩展目录不存在');
    }

    const zip = new JSZip();
    await this.addDirectoryToZip(zip, extensionDir, extensionDir);

    const guideContent = await readFile(guidePath, 'utf8').catch(() => null);
    if (guideContent) {
      zip.file('README.md', guideContent);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ai-superweb-platform-login-helper.zip"',
    );
    res.setHeader('Content-Length', String(zipBuffer.length));
    return res.send(zipBuffer);
  }

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

  private async addDirectoryToZip(zip: JSZip, directory: string, rootDirectory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.addDirectoryToZip(zip, fullPath, rootDirectory);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const fileContent = await readFile(fullPath);
      const archivePath = relative(rootDirectory, fullPath).replace(/\\/g, '/');
      zip.file(archivePath, fileContent);
    }
  }
}

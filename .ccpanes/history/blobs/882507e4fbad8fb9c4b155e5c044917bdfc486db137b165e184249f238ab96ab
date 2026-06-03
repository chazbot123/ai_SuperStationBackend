import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createBitBrowserHttpApi } from '../bitbrowser/bitbrowser.http-api';
import { PublishingBitBrowserService } from './publishing-bitbrowser.service';

@Controller('bitbrowser')
export class PublishingBitBrowserController {
  private readonly localClientZipPath = this.resolveLocalClientZipPath();

  constructor(
    private readonly publishingBitBrowserService: PublishingBitBrowserService,
  ) {}

  @Get('health')
  getHealth(@Res() res: Response) {
    const api = this.createApi();
    return res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        routes: api.listRoutes(),
      },
    });
  }

  @Get('local-client/download')
  async downloadLocalClient(@Res() res: Response) {
    if (!existsSync(this.localClientZipPath)) {
      throw new NotFoundException('本地客户端安装包不存在，请先构建客户端');
    }
    const [fileBuffer, fileStat] = await Promise.all([
      readFile(this.localClientZipPath),
      stat(this.localClientZipPath),
    ]);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(fileStat.size));
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="AI-SuperWeb-Local-Agent.zip"',
    );
    return res.end(fileBuffer);
  }

  @Post('owners')
  createOwner(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/owners', body, res);
  }

  @Post('platform-accounts')
  registerPlatformAccount(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/platform-accounts', body, res);
  }

  @Post('runtime/open-session')
  openRuntimeSession(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/runtime/open-session', body, res);
  }

  @Post('runtime/close-session')
  closeRuntimeSession(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/runtime/close-session', body, res);
  }

  @Post('runtime/get-session')
  getRuntimeSession(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/runtime/get-session', body, res);
  }

  @Post('runtime/list-commands')
  listRuntimeCommands(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/runtime/list-commands', body, res);
  }

  @Post('extension/ready')
  registerExtensionReady(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/ready', body, res);
  }

  @Post('extension/page-ready-bind')
  bindRuntimeByPageReady(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/page-ready-bind', body, res);
  }

  @Post('extension/heartbeat')
  heartbeat(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/heartbeat', body, res);
  }

  @Post('extension/queue-login-prepare')
  queueLoginPrepare(@Body() body: unknown, @Res() res: Response) {
    return this.forward(
      'POST',
      '/api/bitbrowser/extension/queue-login-prepare',
      body,
      res,
    );
  }

  @Post('extension/queue-login-execute')
  queueLoginExecute(@Body() body: unknown, @Res() res: Response) {
    return this.forward(
      'POST',
      '/api/bitbrowser/extension/queue-login-execute',
      body,
      res,
    );
  }

  @Post('extension/queue-publish')
  queuePublish(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/queue-publish', body, res);
  }

  @Post('extension/pull-command')
  pullCommand(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/pull-command', body, res);
  }

  @Post('extension/ack-command')
  ackCommand(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/ack-command', body, res);
  }

  @Post('extension/complete-command')
  completeCommand(@Body() body: unknown, @Res() res: Response) {
    return this.forward(
      'POST',
      '/api/bitbrowser/extension/complete-command',
      body,
      res,
    );
  }

  @Post('extension/fail-command')
  failCommand(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/extension/fail-command', body, res);
  }

  @Post('debug/event')
  writeDebugEvent(@Body() body: unknown, @Res() res: Response) {
    return this.forward('POST', '/api/bitbrowser/debug/event', body, res);
  }

  private createApi() {
    return createBitBrowserHttpApi(
      this.publishingBitBrowserService.getBridgeFacade(),
    );
  }

  private resolveLocalClientZipPath() {
    const fileRelativePath = join(
      __dirname,
      '..',
      '..',
      '..',
      '.runtime',
      'downloads',
      'AI-SuperWeb-Local-Agent.zip',
    );
    return resolve(fileRelativePath);
  }

  private async forward(
    method: string,
    path: string,
    body: unknown,
    res: Response,
  ) {
    const response = await this.createApi().handle({
      method,
      path,
      body,
    });

    for (const [key, value] of Object.entries(response.headers ?? {})) {
      res.setHeader(key, value);
    }

    return res.status(response.status).json(response.body);
  }
}

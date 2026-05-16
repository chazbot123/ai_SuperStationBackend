import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { ConflictException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadPublishPlatform } from '@prisma/client';
import { BrowserContext, Frame, Locator, Page, chromium } from 'playwright-core';
import { createWorker } from 'tesseract.js';

type HostedBrowserSession = {
  context: BrowserContext;
  sessionPath: string;
};

type PlatformLoginResult = {
  authPayload: string;
  accountName: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
};

type AccountProfile = {
  accountName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
};

type PlatformDraftSaveInput = {
  accountId: string;
  sessionPath: string;
  platform: LeadPublishPlatform;
  jobId: string;
  authPayload?: string | null;
  title: string;
  body: string;
  tags: string[];
  images: string[];
  videoUrl: string | null;
};

type PlatformDraftSaveResult = {
  draftUrl: string;
  authPayload?: string;
  accountName?: string;
  displayName?: string | null;
};

type PageActionWaitOptions = {
  successHints: string[];
  failureHints?: string[];
  timeoutMs?: number;
  timeoutErrorMessage: string;
};

type HumanizedEditorOptions = {
  humanizedMode?: 'default' | 'kuaishou-fast';
  perCharDelay?: number;
};

type LocatorContext = Page | Frame;

type FillBehaviorOptions = {
  preferHumanType?: boolean;
  perCharDelay?: number;
};

@Injectable()
export class PlatformLoginBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PlatformLoginBrowserService.name);
  private readonly sessions = new Map<string, HostedBrowserSession>();

  constructor(private readonly configService: ConfigService) {}

  async launchLoginPage(input: {
    accountId: string;
    platform: LeadPublishPlatform;
    sessionPath: string;
  }) {
    await this.closeSession(input.accountId);
    this.ensureDirectory(input.sessionPath);

    const context = await this.launchBrowserContext(input.sessionPath, {
      preferVisible: true,
      purpose: 'login',
    });

    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(this.getPlatformLoginUrl(input.platform), {
        waitUntil: 'domcontentloaded',
      });
      await page.bringToFront();

      this.sessions.set(input.accountId, {
        context,
        sessionPath: input.sessionPath,
      });

      return {
        loginUrl: page.url(),
        sessionPath: input.sessionPath,
      };
    } catch (error) {
      await context.close().catch(() => undefined);
      throw error;
    }
  }

  async collectLoginResult(input: {
    accountId: string;
    sessionPath: string;
    platform: LeadPublishPlatform;
    authPayload?: string | null;
    loginUrl?: string | null;
    fallbackAccountName?: string;
  }): Promise<PlatformLoginResult> {
    return this.withReadableContext(input, async ({ context, page }) => {
      await this.ensureLoginPageReady(page, input.platform, input.loginUrl);
      const currentUrl = page.url();

      const cookies = await context.cookies();
      const cookiePairs = cookies
        .filter((item) => item.name.trim() && item.value.trim())
        .map((item) => `${item.name}=${item.value}`);

      if (cookiePairs.length === 0) {
        throw new ConflictException('未读取到登录 Cookie，请先在浏览器完成登录');
      }

      const profile = this.assertAuthenticatedProfile(
        await this.readAccountProfile(page, input.platform, input.fallbackAccountName),
        input.platform,
        currentUrl,
      );

      return {
        authPayload: cookiePairs.join('; '),
        accountName: profile.accountName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        followerCount: profile.followerCount,
      };
    });
  }

  async closeSession(accountId: string) {
    const session = this.sessions.get(accountId);
    if (!session) {
      return;
    }

    this.sessions.delete(accountId);
    await session.context.close();
  }

  async publish(input: PlatformDraftSaveInput): Promise<PlatformDraftSaveResult> {
    const uploadFiles = await this.prepareUploadFiles(input);
    try {
      return await this.withReadableContext(
        {
          ...input,
          visible: true,
        },
        async ({ page }) => {
          const recoveredAuth = await this.ensurePublishPageReady(
            page,
            input.platform,
            Boolean(input.videoUrl),
          );

          switch (input.platform) {
            case LeadPublishPlatform.xiaohongshu:
              if (input.videoUrl) {
                await this.publishXiaohongshuVideoPost(page, input, uploadFiles);
              } else {
                await this.publishXiaohongshuImagePost(page, input, uploadFiles);
              }
              break;
            case LeadPublishPlatform.douyin:
              await this.publishDouyinContent(page, input, uploadFiles);
              break;
            case LeadPublishPlatform.wechat_mp:
              if (input.videoUrl) {
                await this.publishWechatMpVideoPost(page, input, uploadFiles);
              } else {
                await this.publishWechatMpImagePost(page, input, uploadFiles);
              }
              break;
            case LeadPublishPlatform.kuaishou:
              if (input.videoUrl) {
                await this.publishKuaishouVideoPost(page, input, uploadFiles);
              } else {
                await this.publishKuaishouImagePost(page, input, uploadFiles);
              }
              break;
            default:
              throw new ConflictException('当前平台暂不支持自动发布');
          }

          return {
            draftUrl: page.url(),
            ...recoveredAuth,
          };
        },
      );
    } finally {
      await this.cleanupUploadFiles(input.jobId);
    }
  }

  getPlatformLoginUrl(platform: LeadPublishPlatform) {
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return 'https://creator.xiaohongshu.com/login';
      case LeadPublishPlatform.douyin:
        return 'https://creator.douyin.com/';
      case LeadPublishPlatform.wechat_mp:
        return 'https://channels.weixin.qq.com/';
      case LeadPublishPlatform.kuaishou:
        return 'https://cp.kuaishou.com/profile';
      default:
        return 'https://www.google.com/';
    }
  }

  getSessionPath(accountId: string) {
    const configuredRoot = this.configService
      .get<string>('PUBLISHING_BROWSER_SESSION_ROOT')
      ?.trim();
    const rootPath =
      configuredRoot || join(process.cwd(), '.runtime', 'publishing-platform-sessions');
    this.ensureDirectory(rootPath);
    return join(rootPath, accountId);
  }

  getPublishAssetPath(jobId: string) {
    const rootPath = join(process.cwd(), '.runtime', 'publishing-job-assets', jobId);
    this.ensureDirectory(rootPath);
    return rootPath;
  }

  async onModuleDestroy() {
    const closing = Array.from(this.sessions.keys()).map((accountId) =>
      this.closeSession(accountId),
    );
    await Promise.allSettled(closing);
  }

  private resolveExecutablePath() {
    const configuredPath = this.configService
      .get<string>('PUBLISHING_BROWSER_EXECUTABLE_PATH')
      ?.trim();
    if (configuredPath) {
      return configuredPath;
    }

    const candidates =
      process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : process.platform === 'darwin'
          ? [
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            ]
          : [
              '/usr/bin/google-chrome',
              '/usr/bin/google-chrome-stable',
              '/usr/bin/microsoft-edge',
              '/usr/bin/chromium',
            ];

    const executablePath = candidates.find((candidate) => existsSync(candidate));
    if (!executablePath) {
      throw new ConflictException(
        '未找到可用浏览器，请先安装 Chrome / Edge，或配置 PUBLISHING_BROWSER_EXECUTABLE_PATH',
      );
    }

    return executablePath;
  }

  private async launchBrowserContext(
    sessionPath: string,
    options: { preferVisible: boolean; purpose: 'login' | 'publish' | 'read' },
  ) {
    const headless = this.resolveHeadlessMode(options.preferVisible, options.purpose);

    try {
      return await chromium.launchPersistentContext(sessionPath, {
        headless,
        executablePath: this.resolveExecutablePath(),
      });
    } catch (error) {
      throw this.buildBrowserLaunchError(error, options.purpose, headless);
    }
  }

  private resolveHeadlessMode(preferVisible: boolean, purpose: 'login' | 'publish' | 'read') {
    const configuredHeadless = this.configService
      .get<string>('PUBLISHING_BROWSER_HEADLESS')
      ?.trim()
      .toLowerCase();

    if (configuredHeadless === 'true' || configuredHeadless === '1' || configuredHeadless === 'yes') {
      return true;
    }

    if (configuredHeadless === 'false' || configuredHeadless === '0' || configuredHeadless === 'no') {
      return false;
    }

    if (!preferVisible) {
      return true;
    }

    if (this.canLaunchVisibleBrowser()) {
      return false;
    }

    if (purpose === 'login') {
      throw new ConflictException(
        '当前服务器未配置桌面显示环境，无法打开平台登录浏览器。请安装 Xvfb/桌面环境，或在有图形界面的机器上运行后端服务。',
      );
    }

    this.logger.warn(`[publishing-browser] visible browser unavailable, fallback to headless purpose=${purpose}`);
    return true;
  }

  private canLaunchVisibleBrowser() {
    if (process.platform !== 'linux') {
      return true;
    }

    return Boolean(process.env.DISPLAY?.trim() || process.env.WAYLAND_DISPLAY?.trim());
  }

  private buildBrowserLaunchError(
    error: unknown,
    purpose: 'login' | 'publish' | 'read',
    headless: boolean,
  ) {
    if (error instanceof ConflictException) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error ?? '');
    const missingDisplay =
      /Missing X server|Looks like you launched a headed browser|no XServer|\$DISPLAY|The platform failed to initialize/i.test(
        message,
      );

    if (missingDisplay && !headless) {
      if (purpose === 'login') {
        return new ConflictException(
          '当前服务器未配置桌面显示环境，无法打开平台登录浏览器。请安装 Xvfb/桌面环境，或在有图形界面的机器上运行后端服务。',
        );
      }

      return new ConflictException(
        '当前服务器未配置桌面显示环境，浏览器无法以可视模式启动。请安装 Xvfb/桌面环境，或配置 PUBLISHING_BROWSER_HEADLESS=true。',
      );
    }

    return new ConflictException(`浏览器启动失败：${message || 'unknown_error'}`);
  }

  private async withReadableContext<T>(
    input: {
      accountId: string;
      sessionPath: string;
      platform: LeadPublishPlatform;
      authPayload?: string | null;
      loginUrl?: string | null;
      fallbackAccountName?: string;
      visible?: boolean;
    },
    reader: (value: { context: BrowserContext; page: Page }) => Promise<T>,
  ) {
    const activeSession = this.sessions.get(input.accountId);
    if (activeSession) {
      try {
        const page = await this.getOrCreatePage(activeSession.context);
        if (input.visible) {
          await page.bringToFront().catch(() => undefined);
        }
        return await reader({ context: activeSession.context, page });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Target page, context or browser has been closed')) {
          throw error;
        }

        this.sessions.delete(input.accountId);
        await activeSession.context.close().catch(() => undefined);
      }
    }

    this.ensureDirectory(input.sessionPath);
    const headless = this.resolveHeadlessMode(Boolean(input.visible), input.visible ? 'publish' : 'read');
    const keepContextOpen = Boolean(input.visible && !headless);
    const context = await this.launchBrowserContext(input.sessionPath, {
      preferVisible: Boolean(input.visible),
      purpose: input.visible ? 'publish' : 'read',
    });

    try {
      await this.applyAuthPayloadToContext(context, input.platform, input.authPayload);
      const page = await this.getOrCreatePage(context);
      if (input.visible && !headless) {
        await page.bringToFront().catch(() => undefined);
      }
      if (keepContextOpen) {
        this.sessions.set(input.accountId, {
          context,
          sessionPath: input.sessionPath,
        });
      }
      return await reader({ context, page });
    } finally {
      if (!keepContextOpen) {
        await context.close().catch(() => undefined);
      }
    }
  }

  private getActivePage(context: BrowserContext) {
    return context.pages().find((page) => !page.isClosed()) ?? context.pages()[0];
  }

  private async getOrCreatePage(context: BrowserContext) {
    return this.getActivePage(context) ?? (await context.newPage());
  }

  private async ensureLoginPageReady(
    page: Page,
    platform: LeadPublishPlatform,
    loginUrl?: string | null,
  ) {
    const targetUrl = loginUrl?.trim() || this.getPlatformLoginUrl(platform);
    const currentUrl = page.url();

    if (!currentUrl || currentUrl === 'about:blank') {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
  }

  private async applyAuthPayloadToContext(
    context: BrowserContext,
    platform: LeadPublishPlatform,
    authPayload?: string | null,
  ) {
    const parsedCookies = this.parseCookieHeader(authPayload);
    if (parsedCookies.length === 0) {
      return;
    }

    const cookiesToAdd = this.buildPlatformCookiesForInjection(parsedCookies, platform);

    if (cookiesToAdd.length === 0) {
      return;
    }

    await context.addCookies(cookiesToAdd).catch(() => undefined);
  }

  private buildPlatformCookiesForInjection(
    cookies: Array<{ name: string; value: string; path: string }>,
    platform: LeadPublishPlatform,
  ) {
    const publishUrl = this.getPlatformPublishUrl(platform, false);
    const targets =
      platform === LeadPublishPlatform.kuaishou
        ? [
            { kind: 'url' as const, value: publishUrl },
            { kind: 'domain' as const, value: 'cp.kuaishou.com' },
            { kind: 'domain' as const, value: 'passport.kuaishou.com' },
            { kind: 'domain' as const, value: '.kuaishou.com' },
          ]
        : [{ kind: 'url' as const, value: publishUrl }];

    const mapped = targets.flatMap((target) =>
      cookies.map((cookie) =>
        target.kind === 'url'
          ? {
              ...cookie,
              url: target.value,
            }
          : {
              ...cookie,
              domain: target.value,
            },
      ),
    );

    const deduplicated = new Map<string, (typeof mapped)[number]>();
    for (const item of mapped) {
      const scope = 'domain' in item ? `domain:${item.domain}` : `url:${item.url}`;
      deduplicated.set(`${scope}|${item.path}|${item.name}`, item);
    }

    return Array.from(deduplicated.values());
  }

  private parseCookieHeader(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      return [];
    }

    return normalized
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separatorIndex = item.indexOf('=');
        if (separatorIndex <= 0) {
          return null;
        }

        const name = item.slice(0, separatorIndex).trim();
        const cookieValue = item.slice(separatorIndex + 1).trim();
        if (!name || !cookieValue) {
          return null;
        }

        return {
          name,
          value: cookieValue,
          path: '/',
        };
      })
      .filter(
        (
          item,
        ): item is {
          name: string;
          value: string;
          path: string;
        } => Boolean(item),
      );
  }

  private getPlatformPublishUrl(platform: LeadPublishPlatform, hasVideo: boolean) {
    switch (platform) {
      case LeadPublishPlatform.xiaohongshu:
        return 'https://creator.xiaohongshu.com/';
      case LeadPublishPlatform.douyin:
        return hasVideo
          ? 'https://creator.douyin.com/creator-micro/content/upload'
          : 'https://creator.douyin.com/creator-micro/content/publish';
      case LeadPublishPlatform.wechat_mp:
        return 'https://channels.weixin.qq.com/platform';
      case LeadPublishPlatform.kuaishou:
        return 'https://cp.kuaishou.com/profile';
      default:
        return this.getPlatformLoginUrl(platform);
    }
  }

  private async ensurePublishPageReady(
    page: Page,
    platform: LeadPublishPlatform,
    hasVideo: boolean,
  ): Promise<Pick<PlatformDraftSaveResult, 'authPayload' | 'accountName' | 'displayName'> | null> {
    const targetUrl = this.getPlatformPublishUrl(platform, hasVideo);
    if (!page.url() || page.url() === 'about:blank') {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    } else if (!page.url().startsWith(targetUrl)) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    const recoveredAuth = this.isLoginPageUrl(page.url(), platform)
      ? await this.waitForPublishLoginRecovery(page, platform, hasVideo)
      : null;
    this.assertNotOnLoginPageDuringPublish(page, platform);

    if (platform === LeadPublishPlatform.xiaohongshu) {
      await this.clickFirst(page, ['text=发布笔记', 'text=去发布', 'text=创建笔记']).catch(() => undefined);
    }
    if (platform === LeadPublishPlatform.wechat_mp) {
      await this.clickFirst(
        page,
        hasVideo
          ? ['text=发表视频', 'text=发表内容', 'text=发表']
          : [
              'xpath=/html/body/div[1]/div/div[2]/div[2]/div/wujie-app//html/body/div[1]/div/div/div[2]/div/div/div[1]/div[2]/div[2]/div/div/div/div[2]/div/div[2]/div/button',
              'text=发表图文',
              'text=发表内容',
              'text=发表',
            ],
      ).catch(() => undefined);
    }

    return recoveredAuth;
  }

  private assertNotOnLoginPageDuringPublish(page: Page, platform: LeadPublishPlatform) {
    if (this.isLoginPageUrl(page.url(), platform)) {
      throw new ConflictException('当前平台账号登录已失效，请重新登录后再发布');
    }
  }

  private isLoginPageUrl(url: string, platform: LeadPublishPlatform) {
    const normalizedUrl = (url || '').toLowerCase();
    const loginUrlKeywords = ['login', 'signin', 'passport', 'oauth', 'scan', 'qrcode'];
    const looksLikeKuaishouLoginPage =
      platform === LeadPublishPlatform.kuaishou &&
      (normalizedUrl.includes('passport.kuaishou.com') ||
        normalizedUrl.includes('login.kuaishou.com'));
    const looksLikeGenericLoginPage = loginUrlKeywords.some((keyword) =>
      normalizedUrl.includes(keyword),
    );

    return looksLikeKuaishouLoginPage || looksLikeGenericLoginPage;
  }

  private async waitForPublishLoginRecovery(
    page: Page,
    platform: LeadPublishPlatform,
    hasVideo: boolean,
  ): Promise<Pick<PlatformDraftSaveResult, 'authPayload' | 'accountName' | 'displayName'>> {
    const recoveryTimeoutMs = 180000;
    const startedAt = Date.now();
    const loginUrl = this.getPlatformLoginUrl(platform);
    const targetUrl = this.getPlatformPublishUrl(platform, hasVideo);

    if (!page.url() || !page.url().startsWith(loginUrl)) {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }

    await page.bringToFront().catch(() => undefined);
    this.logger.warn(
      `[publishing-browser] publish requires re-login platform=${platform}, waiting for manual login`,
    );

    while (Date.now() - startedAt < recoveryTimeoutMs) {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);

      const currentUrl = page.url();
      if (this.isLoginPageUrl(currentUrl, platform)) {
        await page.waitForTimeout(1500).catch(() => undefined);
        continue;
      }

      try {
        const profile = this.assertAuthenticatedProfile(
          await this.readAccountProfile(page, platform),
          platform,
          currentUrl,
        );
        const authPayload = await this.collectContextCookies(page.context());

        if (!currentUrl.startsWith(targetUrl)) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
          await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
        }

        return {
          authPayload,
          accountName: profile.accountName,
          displayName: profile.displayName,
        };
      } catch {
        await page.waitForTimeout(1500).catch(() => undefined);
      }
    }

    throw new ConflictException('当前平台账号需要重新登录，请在浏览器中完成登录后再重新发布');
  }

  private async collectContextCookies(context: BrowserContext) {
    const cookies = await context.cookies();
    const cookiePairs = cookies
      .filter((item) => item.name.trim() && item.value.trim())
      .map((item) => `${item.name}=${item.value}`);

    if (cookiePairs.length === 0) {
      throw new ConflictException('未读取到登录 Cookie，请先在浏览器完成登录');
    }

    return cookiePairs.join('; ');
  }

  private async publishXiaohongshuImagePost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    const xiaohongshuEditorSelectors = [
      'div.tiptap.ProseMirror',
      'div[role="textbox"]',
      'div[contenteditable="true"]',
      '[class*="editor"] [contenteditable="true"]',
    ];
    await this.enterXiaohongshuImagePublish(page);
    await this.uploadFiles(page, uploadFiles, 'image', [
      'input[type="file"][accept*="image/png"]',
      'input[type="file"][accept*="image/jpeg"]',
      'input[type="file"][accept*="image/*"]',
      'input[accept*="image/png"]',
      'input[accept*="image/jpeg"]',
      'input[accept*="image/*"]',
    ]);
    await this.waitForUploadSettled(page);
    await this.fillFirst(page, [
      'div.input input.d-text',
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[type="text"]',
    ], input.title, {
      perCharDelay: 130,
    }).catch(() => undefined);
    const editor = await this.fillEditor(page, xiaohongshuEditorSelectors, input.body, {
      perCharDelay: 120,
    }).catch(() => null);
    await this.appendPlainTagsAfterBody(page, editor, input.tags);
    await this.clickXiaohongshuPublish(page);
    await this.waitForActionFinished(page, {
      successHints: ['发布成功', '笔记发布成功', '审核中', '发布中'],
      failureHints: ['发布失败', '请完善', '请先上传', '请填写标题'],
      timeoutErrorMessage: '未识别到小红书发布成功状态，请确认页面是否仍停留在发布页',
    });
    return;
    await this.fillFirst(page, [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[type="text"]',
    ], input.title);
    await this.fillEditor(page, [
      'textarea[placeholder*="正文"]',
      'div[contenteditable="true"]',
      '[class*="editor"] [contenteditable="true"]',
    ], input.body);
    await this.clickFirst(page, ['text=保存草稿', 'text=存草稿']);
    await this.waitForActionFinished(page, {
      successHints: ['草稿已保存', '保存成功'],
      timeoutErrorMessage: '未识别到草稿保存成功提示，请确认已完成上传并停留在发布页',
    });
  }

  private async publishXiaohongshuVideoPost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    const xiaohongshuEditorSelectors = [
      'div.tiptap.ProseMirror',
      'div[role="textbox"]',
      'div[contenteditable="true"]',
      '[class*="editor"] [contenteditable="true"]',
    ];
    await this.enterXiaohongshuVideoPublish(page);
    await this.uploadFiles(page, uploadFiles, 'video');
    await this.waitForUploadSettled(page);
    await this.fillFirst(
      page,
      [
        'div.input input.d-text',
        'input[placeholder*="标题"]',
        'textarea[placeholder*="标题"]',
        'input[type="text"]',
      ],
      input.title,
      {
        perCharDelay: 130,
      },
    ).catch(() => undefined);
    const editor = await this.fillEditor(page, xiaohongshuEditorSelectors, input.body, {
      perCharDelay: 120,
    }).catch(() => null);
    await this.appendPlainTagsAfterBody(page, editor, input.tags);
    await this.clickXiaohongshuPublish(page);
    await this.waitForActionFinished(page, {
      successHints: ['发布成功', '笔记发布成功', '审核中', '发布中'],
      failureHints: ['发布失败', '请完善', '请先上传', '请填写标题'],
      timeoutErrorMessage: '未识别到小红书视频发布成功状态，请确认页面是否仍停留在发布页',
    });
  }

  private async publishDouyinContent(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    let douyinBody = input.body;
    this.logger.log(`[douyin-publish] start job=${input.jobId} video=${Boolean(input.videoUrl)} tags=${input.tags.length}`);
    await this.prepareDouyinPublishMode(page, Boolean(input.videoUrl));
    if (!input.videoUrl) {
      await this.openDouyinImageUpload(page).catch(() => undefined);
    }
    try {
      await this.uploadFiles(
        page,
        uploadFiles,
        input.videoUrl ? 'video' : 'image',
        input.videoUrl
          ? undefined
          : [
              'input[type="file"][accept*="image/png"]',
              'input[type="file"][accept*="image/jpeg"]',
              'input[type="file"][accept*="image/webp"]',
              'input[type="file"][accept*="image/*"]',
              'input[accept*="image/png"]',
              'input[accept*="image/jpeg"]',
              'input[accept*="image/webp"]',
              'input[accept*="image/*"]',
              'input[type="file"][multiple]',
            ],
        input.videoUrl ? true : false,
      );
    } catch (error) {
      if (input.videoUrl) {
        throw error;
      }
      await this.prepareDouyinPublishMode(page, false);
      await this.openDouyinImageUpload(page).catch(() => undefined);
      await this.uploadFiles(page, uploadFiles, 'image', [
        'input[type="file"][accept*="image/png"]',
        'input[type="file"][accept*="image/jpeg"]',
        'input[type="file"][accept*="image/webp"]',
        'input[type="file"][accept*="image/*"]',
        'input[accept*="image/png"]',
        'input[accept*="image/jpeg"]',
        'input[accept*="image/webp"]',
        'input[accept*="image/*"]',
        'input[type="file"][multiple]',
        'input[type="file"]',
      ]);
    }
    this.logger.log(`[douyin-publish] upload-finished job=${input.jobId}`);
    await this.waitForDouyinUploadSettled(page, Boolean(input.videoUrl));
    this.logger.log(`[douyin-publish] upload-settled job=${input.jobId}`);
    const normalizedTitle = input.title.trim();
    if (normalizedTitle) {
      const filledTitle = await this.fillFirst(
        page,
        [
          'input[placeholder="添加作品标题"]',
          'input[placeholder*="作品标题"]',
          'textarea[placeholder*="作品标题"]',
          'input.semi-input[placeholder*="添加作品标题"]',
          'input[placeholder*="添加标题"]',
          'input[placeholder*="标题"]',
          'textarea[placeholder*="标题"]',
          'input[maxlength]',
        ],
        normalizedTitle,
      )
        .then(() => true)
        .catch((error) => {
          if (error instanceof ConflictException) {
            this.logger.warn('[douyin-title] title input not found, fallback to editor first line');
            return false;
          }
          throw error;
        });

      if (!filledTitle) {
        douyinBody = input.body.trim()
          ? `${normalizedTitle}\n${input.body.trim()}`
          : normalizedTitle;
      }
    }

    const editor = await this.fillDouyinDescription(page, douyinBody);
    this.logger.log(`[douyin-publish] description-filled job=${input.jobId}`);
    await this.appendDouyinTopicsAfterBody(page, editor, input.tags);
    this.logger.log(`[douyin-publish] topics-finished job=${input.jobId}`);
    await this.selectDouyinNoDeclaration(page);
    this.logger.log(`[douyin-publish] declaration-selected job=${input.jobId}`);
    const publishButton = await this.findAndHighlightFirst(page, [
      'button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw',
      'button:has-text("发布")',
      '.primary-cECiOJ:has-text("发布")',
      'text=发布',
    ]);
    await page.waitForTimeout(800);
    await this.humanClick(publishButton);
    this.logger.log(`[douyin-publish] publish-clicked job=${input.jobId}`);
    await this.waitForDouyinPublishFinished(page);
  }

  private async publishWechatMpImagePost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    if (input.videoUrl) {
      throw new ConflictException('当前视频号自动发布仅支持图文作品');
    }

    await this.enterWechatMpImagePublish(page);
    const workContext = await this.getWechatMpEditorContext(page);
    const bodyWithTags = [input.body.trim(), this.buildPlainTagText(input.tags)]
      .filter(Boolean)
      .join('\n')
      .trim();

    await this.fillWechatMpTitle(workContext, input.title);
    await this.humanPauseFast(workContext, 420, 780);
    await this.fillWechatMpDescription(workContext, bodyWithTags);
    await this.humanPauseFast(workContext, 520, 920);

    const uploadTrigger = await this.findFirstLocator(
      workContext,
      [
        '.upload-content',
        '.upload-content .center',
        '.upload-content .upload-tip',
        'div.post-upload-wrap .ant-upload.ant-upload-drag',
        'span.ant-upload.ant-upload-btn',
        'div.ant-upload.ant-upload-drag',
        'text=发布图片动态，可上传最多18张图片，单张不超过20MB，支持常见图片格式。',
        'text=发布图片动态',
        'text=可上传最多18张图片',
        'text=支持常见图片格式',
        'xpath=//div[contains(., "发布图片动态") and contains(., "可上传最多18张图片")]',
        'button:has-text("上传图片")',
        'button:has-text("上传照片")',
        'button:has-text("上传")',
        '[role="button"]:has-text("上传图片")',
        '[role="button"]:has-text("上传照片")',
        '[role="button"]:has-text("上传")',
      ],
      true,
    );
    if (uploadTrigger) {
      await this.humanClickWechatSlow(uploadTrigger).catch(() => undefined);
      await this.humanPauseFast(workContext, 420, 760);
    }

    await this.uploadFiles(
      workContext,
      uploadFiles,
      'image',
      [
        '.upload-content input[type="file"][accept*="image"]',
        '.upload-content input[accept*="image"]',
        'div.post-upload-wrap input[type="file"][accept*="image"]',
        '.ant-upload input[type="file"][accept*="image"]',
        'input[type="file"][accept*="image/png"]',
        'input[type="file"][accept*="image/jpeg"]',
        'input[type="file"][accept*="image/webp"]',
        'input[type="file"][accept*="image/*"]',
        'input[accept*="image/png"]',
        'input[accept*="image/jpeg"]',
        'input[accept*="image/webp"]',
        'input[accept*="image/*"]',
      ],
      false,
    );
    await this.waitForWechatMpUploadSettled(workContext);
    await this.ensureWechatMpNoMusic(workContext);

    const publishButton = await this.findAndHighlightFirst(workContext, [
      'div.form-btns button.weui-desktop-btn_primary:has-text("发表")',
      'button.weui-desktop-btn_primary:has-text("发表")',
      'button.weui-desktop-btn:has-text("发表")',
      'button:has-text("发表")',
      'xpath=//button[normalize-space()="发表"]',
      '[role="button"]:has-text("发表")',
      'button:has-text("发布")',
      '[role="button"]:has-text("发布")',
      'text=发表',
      'text=发布',
    ]);
    await workContext.waitForTimeout(1200);
    await this.humanClickWechatSlow(publishButton);
    await this.waitForWechatMpPublishFinished(page, workContext);
  }

  private async publishWechatMpVideoPost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    await this.enterWechatMpVideoPublish(page);
    const workContext = await this.getWechatMpVideoEditorContext(page);
    const bodyWithTags = [input.body.trim(), this.buildPlainTagText(input.tags)]
      .filter(Boolean)
      .join('\n')
      .trim();

    await this.fillWechatMpDescription(workContext, bodyWithTags);
    await this.humanPauseFast(workContext, 520, 920);

    const uploadTrigger = await this.findFirstLocator(
      workContext,
      [
        '.upload-content',
        '.upload-content .center',
        '.upload-content .upload-tip',
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'div:has-text("上传视频")',
        'text=上传视频',
        'button:has-text("重新上传")',
        '[role="button"]:has-text("重新上传")',
        'text=重新上传',
      ],
      true,
    );
    if (uploadTrigger) {
      const uploadedByChooser = await this.tryUploadWithFileChooser(page, uploadTrigger, uploadFiles).catch(
        () => false,
      );
      if (!uploadedByChooser) {
        await this.humanClickWechatSlow(uploadTrigger).catch(() => undefined);
        await this.humanPauseFast(page, 420, 760);
      }
    }

    await this.uploadFiles(
      workContext,
      uploadFiles,
      'video',
      [
        'input[type="file"][accept*="video/mp4"]',
        'input[type="file"][accept*="video/"]',
        'input[type="file"][accept*="video"]',
        'input[accept*="video/mp4"]',
        'input[accept*="video/"]',
        'input[accept*="video"]',
        'input[type="file"][name*="video"]',
      ],
      true,
    ).catch(async () => {
      await this.uploadFiles(
        page,
        uploadFiles,
        'video',
        [
          'input[type="file"][accept*="video/mp4"]',
          'input[type="file"][accept*="video/"]',
          'input[type="file"][accept*="video"]',
          'input[accept*="video/mp4"]',
          'input[accept*="video/"]',
          'input[accept*="video"]',
          'input[type="file"][name*="video"]',
        ],
        true,
      );
    });
    await this.waitForWechatMpVideoUploadSettled(workContext);
    await this.ensureWechatMpNoMusic(workContext);

    const publishButton = await this.findAndHighlightFirst(workContext, [
      'div.form-btns button.weui-desktop-btn_primary:has-text("发表")',
      'button.weui-desktop-btn_primary:has-text("发表")',
      'button.weui-desktop-btn:has-text("发表")',
      'button:has-text("发表")',
      'xpath=//button[normalize-space()="发表"]',
      '[role="button"]:has-text("发表")',
      'button:has-text("发布")',
      '[role="button"]:has-text("发布")',
      'text=发表',
      'text=发布',
    ]);
    await workContext.waitForTimeout(1200);
    await this.humanClickWechatSlow(publishButton);
    await this.waitForWechatMpPublishFinished(page, workContext);
  }

  /*
  private async publishKuaishouImagePost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    if (input.videoUrl) {
      throw new ConflictException('褰撳墠蹇墜鑷姩鍙戝竷浠呮敮鎸佸浘鏂囦綔鍝?);
    }

    await this.enterKuaishouImagePublish(page);
    await this.clickFirst(page, [
      'button._upload-btn_ysbff_57',
      'button:has-text("涓婁紶鍥剧墖")',
      'text=涓婁紶鍥剧墖',
    ]).catch(() => undefined);
    await this.uploadFiles(page, uploadFiles, 'image', [
      'input[type="file"][accept*="image/png"]',
      'input[type="file"][accept*="image/jpeg"]',
      'input[type="file"][accept*="image/webp"]',
      'input[type="file"][accept*="image/*"]',
      'input[accept*="image/png"]',
      'input[accept*="image/jpeg"]',
      'input[accept*="image/webp"]',
      'input[accept*="image/*"]',
    ]);
    await this.waitForUploadSettled(page);
    await this.fillEditor(page, [
      'div._edit-desc-container_eho7l_43',
      'div[contenteditable="true"][class*="edit-desc"]',
      'textarea[placeholder*="@鐢ㄦ埛"]',
      'textarea[placeholder*="#璇濋"]',
      'textarea[placeholder*="娣诲姞鎻忚堪"]',
      'textarea[placeholder*="浣滃搧鎻忚堪"]',
      'textarea[placeholder*="浣滃搧鏂囨"]',
      'textarea[placeholder*="鎻忚堪"]',
      '[class*="editor"] [contenteditable="true"]',
      'div[contenteditable="true"]',
    ], input.body);

    const publishButton = await this.findAndHighlightFirst(page, [
      'div._button_3a3lq_1._button-primary_3a3lq_60:has-text("鍙戝竷")',
      'button:has-text("鍙戝竷")',
      'div[role="button"]:has-text("鍙戝竷")',
      'text=鍙戝竷',
    ]);
    await page.waitForTimeout(800);
    await this.humanClick(publishButton);
    await this.waitForActionFinished(page, {
      successHints: ['鍙戝竷鎴愬姛', '浣滃搧鍙戝竷鎴愬姛', '鍙戝竷瀹屾垚', '瀹℃牳涓?, '宸插彂甯?],
      failureHints: ['鍙戝竷澶辫触', '涓婁紶澶辫触', '璇峰厛涓婁紶', '璇峰畬鍠?, '璇峰～鍐欏唴瀹?],
      timeoutErrorMessage: '鏈瘑鍒埌蹇墜鍙戝竷鎴愬姛鎴栬繘鍏ュ彂甯冪粨鏋滈〉锛岃纭椤甸潰鐘舵€?',
    });
    return;

    await this.uploadFiles(page, uploadFiles, input.videoUrl ? 'video' : 'image');
    await this.waitForUploadSettled(page);
    await this.fillFirst(page, [
      'input[placeholder*="作品标题"]',
      'input[placeholder*="添加标题"]',
      'textarea[placeholder*="作品标题"]',
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[type="text"]',
    ], input.title);
    await this.fillEditor(page, [
      'textarea[placeholder*="添加描述"]',
      'textarea[placeholder*="作品描述"]',
      'textarea[placeholder*="作品文案"]',
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="作品"]',
      '[class*="editor"] [contenteditable="true"]',
      'div[contenteditable="true"]',
    ], input.body);
    await this.clickFirst(page, [
      'text=保存草稿',
      'text=保存到草稿箱',
      'text=存草稿',
    ]);
    await this.waitForActionFinished(page, {
      successHints: ['草稿已保存', '保存成功', '已保存到草稿箱'],
      failureHints: ['保存失败', '上传失败', '请先上传', '请完善'],
      timeoutErrorMessage: '未识别到草稿保存成功提示，请确认已完成上传并停留在发布页',
    });
  }

  */
  private async publishKuaishouImagePost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    this.logger.log(`[kuaishou-publish] start job=${input.jobId} imageCount=${uploadFiles.length}`);
    await this.enterKuaishouImagePublish(page);
    await this.assertKuaishouLoginStillValid(page);
    this.logger.log(`[kuaishou-publish] entered-image-page job=${input.jobId} url=${page.url()}`);

    const uploadTrigger = await this.findFirstLocator(
      page,
      [
        'button._upload-btn_ysbff_57',
        'button:has-text("上传图片")',
        '[role="button"]:has-text("上传图片")',
        'div:has-text("上传图片")',
        'text=上传图片',
        'button[class*="upload"]',
        '[role="button"][class*="upload"]',
      ],
      true,
    );
    if (uploadTrigger) {
      await this.humanClick(uploadTrigger).catch(() => undefined);
      await this.humanPauseFast(page, 220, 420);
    }
    await this.assertKuaishouLoginStillValid(page);

    const uploadedByChooser = uploadTrigger
      ? await this.tryUploadWithFileChooser(page, uploadTrigger, uploadFiles).catch(() => false)
      : false;

    if (!uploadedByChooser) {
      await this.uploadFiles(page, uploadFiles, 'image', [
        'input[type="file"][accept*="image/png"]',
        'input[type="file"][accept*="image/jpeg"]',
        'input[type="file"][accept*="image/webp"]',
        'input[type="file"][accept*="image/*"]',
        'input[accept*="image/png"]',
        'input[accept*="image/jpeg"]',
        'input[accept*="image/webp"]',
        'input[accept*="image/*"]',
      ]);
    }
    this.logger.log(`[kuaishou-publish] upload-finished job=${input.jobId}`);
    await this.waitForUploadSettled(page);
    this.logger.log(`[kuaishou-publish] upload-settled job=${input.jobId}`);
    await this.fillKuaishouDescription(page, input.title, input.body, input.tags);
    this.logger.log(`[kuaishou-publish] description-filled job=${input.jobId}`);
    await this.clickKuaishouPublish(page);
    this.logger.log(`[kuaishou-publish] publish-clicked job=${input.jobId}`);
    await this.waitForActionFinished(page, {
      successHints: ['发布成功', '作品发布成功', '发布完成', '审核中', '正在审核', '已发布'],
      failureHints: ['发布失败', '上传失败', '请先上传', '请完善', '请填写内容'],
      timeoutErrorMessage: '未识别到快手发布成功状态，请确认页面是否仍停留在发布页。',
    });
    this.logger.log(`[kuaishou-publish] finished job=${input.jobId} url=${page.url()}`);
  }

  private async publishKuaishouVideoPost(
    page: Page,
    input: PlatformDraftSaveInput,
    uploadFiles: string[],
  ) {
    await this.enterKuaishouVideoPublish(page);
    await this.assertKuaishouLoginStillValid(page);
    const uploadTrigger = await this.findFirstLocator(
      page,
      [
        'button._upload-btn_1j3uy_87',
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'div:has-text("上传视频")',
        'text=上传视频',
      ],
      true,
    );
    if (uploadTrigger) {
      await this.humanClick(uploadTrigger).catch(() => undefined);
      await this.humanPauseFast(page, 220, 420);
    }
    await this.assertKuaishouLoginStillValid(page);

    const uploadSelectors = [
      'input[type="file"][accept*="video/mp4"]',
      'input[type="file"][accept*="video/"]',
      'input[type="file"][accept*="video"]',
      'input[accept*="video/mp4"]',
      'input[accept*="video/"]',
      'input[accept*="video"]',
      '[class*="upload"] input[type="file"]',
      '[class*="upload"] input[accept*="video"]',
      'input[type="file"]',
    ];
    const uploadedByChooser = uploadTrigger
      ? await this.tryUploadWithFileChooser(page, uploadTrigger, uploadFiles)
      : false;

    if (!uploadedByChooser) {
      await this.uploadFiles(page, uploadFiles, 'video', uploadSelectors, true);
    }
    await this.waitForUploadSettled(page);
    await this.fillKuaishouDescription(page, input.title, input.body, input.tags);
    await this.clickKuaishouPublish(page);
    await this.waitForActionFinished(page, {
      successHints: ['发布成功', '作品发布成功', '发布完成', '审核中', '正在审核', '已发布'],
      failureHints: ['发布失败', '上传失败', '请先上传', '请完善', '请填写内容'],
      timeoutErrorMessage: '未识别到快手视频发布成功状态，请确认页面是否仍停留在发布页。',
    });
  }

  private async assertKuaishouLoginStillValid(page: Page) {
    const expiredPrompt = await this.findFirstLocator(
      page,
      [
        'text=您的登录状态已过期',
        'text=点击确定重新登录',
        'text=您的登录状态已过期，点击确定重新登录',
      ],
      false,
    );
    if (expiredPrompt) {
      throw new ConflictException('快手登录已失效，请重新登录后再发布');
    }
  }

  private async isKuaishouImageEditorReady(page: Page) {
    return Boolean(
      await this.findFirstLocator(
        page,
        [
          'button:has-text("上传图片")',
          '[role="button"]:has-text("上传图片")',
          'div:has-text("上传图片")',
          'text=上传图片',
          'input[type="file"][accept*="image/png"]',
          'input[type="file"][accept*="image/jpeg"]',
          'input[type="file"][accept*="image/webp"]',
          'input[type="file"][accept*="image/*"]',
          'input[accept*="image/png"]',
          'input[accept*="image/jpeg"]',
          'input[accept*="image/webp"]',
          'input[accept*="image/*"]',
        ],
        false,
      ),
    );
  }

  private async isKuaishouVideoEditorReady(page: Page) {
    return Boolean(
      await this.findFirstLocator(
        page,
        [
          'button:has-text("上传视频")',
          '[role="button"]:has-text("上传视频")',
          'div:has-text("上传视频")',
          'text=上传视频',
          'input[type="file"][accept*="video/mp4"]',
          'input[type="file"][accept*="video/"]',
          'input[type="file"][accept*="video"]',
          'input[accept*="video/mp4"]',
          'input[accept*="video/"]',
          'input[accept*="video"]',
          'div#work-description-edit',
          'div[contenteditable="true"]#work-description-edit',
        ],
        false,
      ),
    );
  }

  private async enterKuaishouImagePublish(page: Page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    if (await this.isKuaishouImageEditorReady(page)) {
      return;
    }

    if (!page.url().includes('/profile')) {
      await page.goto('https://cp.kuaishou.com/profile', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(1500);
    }

    if (await this.isKuaishouImageEditorReady(page)) {
      return;
    }

    await this.clickFirst(page, [
      'button:has-text("发布作品")',
      '[role="button"]:has-text("发布作品")',
      'div:has-text("发布作品")',
      'text=发布作品',
    ]).catch(() => undefined);
    await page.waitForTimeout(500);

    await this.clickFirst(page, [
      'div.item:has-text("发布图文")',
      'div[class*="item"]:has-text("发布图文")',
      'button:has-text("发布图文")',
      '[role="button"]:has-text("发布图文")',
      'div:has-text("发布图文")',
      'text=发布图文',
    ]).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    if (await this.isKuaishouImageEditorReady(page)) {
      return;
    }

    await page.goto('https://cp.kuaishou.com/article/publish/video?tabType=1', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await this.clickFirst(page, [
      'button:has-text("发布图文")',
      '[role="tab"]:has-text("发布图文")',
      '[role="button"]:has-text("发布图文")',
      'div:has-text("发布图文")',
      'text=发布图文',
      'button:has-text("图文")',
      'text=图文',
    ]).catch(() => undefined);
    await page.waitForTimeout(1200);
    if (await this.isKuaishouImageEditorReady(page)) {
      return;
    }

    throw new ConflictException('未进入快手图文发布页');
  }

  private async enterKuaishouVideoPublish(page: Page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    if (await this.isKuaishouVideoEditorReady(page)) {
      return;
    }

    if (!page.url().includes('/profile')) {
      await page.goto('https://cp.kuaishou.com/profile', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(1500);
    }

    if (await this.isKuaishouVideoEditorReady(page)) {
      return;
    }

    await this.clickFirst(page, [
      'button:has-text("发布作品")',
      '[role="button"]:has-text("发布作品")',
      'div:has-text("发布作品")',
      'text=发布作品',
    ]).catch(() => undefined);
    await page.waitForTimeout(500);

    await this.clickFirst(page, [
      'div.item:has-text("发布视频")',
      'div[class*="item"]:has-text("发布视频")',
      'button:has-text("发布视频")',
      '[role="button"]:has-text("发布视频")',
      'div:has-text("发布视频")',
      'text=发布视频',
    ]).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    if (await this.isKuaishouVideoEditorReady(page)) {
      return;
    }

    await page.goto('https://cp.kuaishou.com/article/publish/video?tabType=1', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    if (await this.isKuaishouVideoEditorReady(page)) {
      return;
    }

    await this.clickFirst(page, [
      'button:has-text("发布视频")',
      '[role="tab"]:has-text("发布视频")',
      '[role="button"]:has-text("发布视频")',
      'div:has-text("发布视频")',
      'text=发布视频',
      'button:has-text("视频")',
      'text=视频',
    ]).catch(() => undefined);
    await page.waitForTimeout(1200);
    if (await this.isKuaishouVideoEditorReady(page)) {
      return;
    }

    throw new ConflictException('未进入快手视频发布页');
  }

  private async uploadFiles(
    page: LocatorContext,
    filePaths: string[],
    preferredType?: 'image' | 'video',
    preferredSelectors?: string[],
    allowGenericFileInput = true,
  ) {
    if (filePaths.length === 0) {
      throw new ConflictException('当前内容没有可上传的图片或视频素材');
    }

    const selectors = [
      ...(preferredSelectors ?? []),
      preferredType === 'image'
        ? [
            'input[type="file"][accept*="image"]',
            'input[accept*="image"]',
            ...(allowGenericFileInput ? ['input[type="file"]'] : []),
          ]
        : preferredType === 'video'
          ? [
              'input[type="file"][accept*="video"]',
              'input[accept*="video"]',
              ...(allowGenericFileInput ? ['input[type="file"]'] : []),
            ]
          : [
              ...(allowGenericFileInput ? ['input[type="file"]'] : []),
              'input[accept*="image"]',
              'input[accept*="video"]',
            ],
    ].flat();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      for (const selector of selectors) {
        const matched = page.locator(selector);
        const count = await matched.count().catch(() => 0);
        for (let index = 0; index < count; index += 1) {
          const locator = matched.nth(index);
          try {
            await locator.setInputFiles(filePaths, { timeout: 5000 });
            return;
          } catch {
            continue;
          }
        }
      }

      if (attempt < 3) {
        await page.waitForTimeout(400);
      }
    }

    const debugInputs = await this.readFileInputDebugInfo(page);
    this.logger.warn(
      `[upload-files] type=${preferredType ?? 'any'} selectors=${JSON.stringify(
        selectors,
      )} candidates=${JSON.stringify(debugInputs)}`,
    );

    throw new ConflictException('未找到平台上传控件');
  }

  private async tryUploadWithFileChooser(page: Page, trigger: Locator, filePaths: string[]) {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await this.humanClickFast(trigger).catch(() => undefined);
    const chooser = await chooserPromise;
    if (!chooser) {
      await this.humanPauseFast(page, 120, 240);
      return false;
    }

    await chooser.setFiles(filePaths);
    await this.humanPauseFast(page, 180, 320);
    return true;
  }

  private async readFileInputDebugInfo(page: LocatorContext) {
    const locator = page.locator('input[type="file"]');
    const count = await locator.count().catch(() => 0);
    const snapshots: Array<{
      accept: string;
      className: string;
      disabled: boolean;
      hidden: boolean;
      multiple: boolean;
    }> = [];

    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const item = locator.nth(index);
      const snapshot = await item
        .evaluate((node) => ({
          accept: (node.getAttribute('accept') || '').trim(),
          className: (node.getAttribute('class') || '').trim(),
          disabled: Boolean((node as HTMLInputElement).disabled),
          hidden:
            (node as HTMLInputElement).hidden ||
            (node as HTMLInputElement).type === 'hidden' ||
            window.getComputedStyle(node).display === 'none' ||
            window.getComputedStyle(node).visibility === 'hidden',
          multiple: Boolean((node as HTMLInputElement).multiple),
        }))
        .catch(() => null);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  private async prepareDouyinPublishMode(page: Page, hasVideo: boolean) {
    const currentUrl = page.url();
    if (!hasVideo) {
      if (currentUrl.includes('/content/publish')) {
        await this.clickFirst(page, ['text=高清发布']).catch(() => undefined);
        await page.waitForTimeout(1500);
      }

      await this.clickFirst(page, [
        'text=发布图文',
        'button:has-text("发布图文")',
        '[role="tab"]:has-text("发布图文")',
        'text=图文',
      ]).catch(() => undefined);
      await page.waitForTimeout(1500);
      try {
        await this.ensureDouyinImageModeReady(page);
      } catch {
        await page.goto('https://creator.douyin.com/creator-micro/content/publish', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.waitForTimeout(1500);
        await this.clickFirst(page, ['text=高清发布']).catch(() => undefined);
        await page.waitForTimeout(1200);
        await this.clickFirst(page, [
          'text=发布图文',
          'button:has-text("发布图文")',
          '[role="tab"]:has-text("发布图文")',
          'text=图文',
        ]).catch(() => undefined);
        await page.waitForTimeout(1500);
        await this.ensureDouyinImageModeReady(page);
      }
      return;
    }

    if (currentUrl.includes('/content/publish')) {
      await this.clickFirst(page, ['text=高清发布']).catch(() => undefined);
      await page.waitForTimeout(1500);
    }

    await this.clickFirst(page, ['text=发布视频']).catch(() => undefined);
    await page.waitForTimeout(1000);
    const ready = await page
      .waitForSelector('input[type="file"][accept*="video"]', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      await page.goto('https://creator.douyin.com/creator-micro/content/upload', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(1500);
      await page
        .waitForSelector('input[type="file"][accept*="video"]', { timeout: 8000 })
        .catch(() => undefined);
    }
  }

  private async ensureDouyinImageModeReady(page: Page) {
    const ready = await this.findFirstLocator(
      page,
      [
        'button:has-text("上传图文")',
        'text=上传图文',
        'input[type="file"][accept*="image"]',
        'input[placeholder="添加作品标题"]',
        'div[contenteditable="true"][data-placeholder="添加作品描述..."]',
      ],
      false,
    );
    if (ready) {
      return;
    }

    throw new ConflictException('未进入抖音图文发布模式');
  }

  private async fillFirst(
    page: Page,
    selectors: string[],
    value: string,
    options?: FillBehaviorOptions,
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const locator = await this.findFirstLocator(page, selectors, true);
    if (locator) {
      await this.humanType(locator, normalized, {
        clearExisting: true,
        perCharDelay: options?.perCharDelay ?? 90,
      });
      return;
    }

    throw new ConflictException('未找到标题输入框');
  }

  private async fillEditor(
    page: Page,
    selectors: string[],
    value: string,
    options?: HumanizedEditorOptions,
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const locator = await this.findFirstLocator(page, selectors, true);
    if (locator) {
      if (options?.humanizedMode === 'kuaishou-fast') {
        await this.humanTypeFast(locator, normalized, { clearExisting: true });
      } else {
        await this.humanType(locator, normalized, {
          clearExisting: true,
          perCharDelay: options?.perCharDelay ?? 90,
        });
      }
      return locator;
    }

    throw new ConflictException('未找到正文输入框');
  }

  private async fillDouyinDescription(page: Page, value: string) {
    const douyinEditorSelectors = [
      'div.zone-container[contenteditable="true"][data-placeholder="添加作品描述..."]',
      'div[contenteditable="true"][data-placeholder="添加作品描述..."]',
      'div.zone-container[contenteditable="true"][data-placeholder*="描述"]',
      'div.zone-container[contenteditable="true"][data-placeholder*="作品"]',
      'div.zone-container [contenteditable="true"]',
      '[data-e2e*="publish"] [contenteditable="true"]',
      '[data-e2e*="content"] [contenteditable="true"]',
      '[data-e2e*="publish"] textarea',
      '[data-e2e*="content"] textarea',
      'div[role="textbox"]',
      'textarea[placeholder*="作品简介"]',
      'textarea[placeholder*="添加简介"]',
      'textarea[placeholder*="添加描述"]',
      'textarea[placeholder*="作品"]',
      'textarea[placeholder*="描述"]',
      'div[contenteditable="true"][data-placeholder*="作品"]',
      'div[contenteditable="true"][data-placeholder*="描述"]',
      '[class*="DraftEditor"] [contenteditable="true"]',
      '[class*="editor-kit"] [contenteditable="true"]',
      'div[contenteditable="plaintext-only"]',
      'div[contenteditable="true"]',
    ];
    const douyinEditorTriggerSelectors = [
      'div.zone-container:has-text("添加作品描述")',
      'div.zone-container:has-text("添加作品简介")',
      'div:has-text("添加作品描述...")',
      'div:has-text("添加作品描述")',
      'div:has-text("添加作品简介")',
      'div:has-text("作品描述")',
      'div:has-text("作品简介")',
      'text=添加作品描述',
      'text=添加作品简介',
      'text=作品描述',
      'text=作品简介',
    ];
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const locator =
        (await this.findFirstLocator(page, douyinEditorSelectors, true)) ??
        (await this.findFirstLocator(page, douyinEditorSelectors, false));
      if (locator) {
        await this.fillDouyinDescriptionValue(page, locator, normalized);
        return locator;
      }

      const trigger = await this.findFirstLocator(page, douyinEditorTriggerSelectors, true);
      if (trigger) {
        await this.humanClick(trigger).catch(() => undefined);
        await page.waitForTimeout(400);
        const activatedLocator =
          (await this.findFirstLocator(page, douyinEditorSelectors, true)) ??
          (await this.findFirstLocator(page, douyinEditorSelectors, false));
        if (activatedLocator) {
          await this.fillDouyinDescriptionValue(page, activatedLocator, normalized);
          return activatedLocator;
        }
      }

      await page.waitForTimeout(600);
    }

    const pageText = (await this.readPageText(page)).slice(0, 240);
    this.logger.warn(`[douyin-editor] description editor not found current=${page.url()} body=${pageText}`);
    throw new ConflictException('未找到正文输入框');
  }

  private async fillDouyinDescriptionValue(page: Page, locator: Locator, value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 5000, force: true, delay: 80 }).catch(() => undefined);
    await this.humanClick(locator).catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.press('Backspace').catch(() => undefined);
    await page.keyboard.type(normalized, { delay: 85 }).catch(() => undefined);
    await page.waitForTimeout(300);

    if (await this.hasDouyinDescriptionText(page, normalized)) {
      return;
    }

    const refreshedLocator = await this.findFirstLocator(page, [
      'div.zone-container[contenteditable="true"][data-placeholder="添加作品描述..."]',
      'div[contenteditable="true"][data-placeholder="添加作品描述..."]',
      'div.zone-container[contenteditable="true"][data-placeholder*="描述"]',
      'div.zone-container[contenteditable="true"][data-placeholder*="作品"]',
      'div.zone-container [contenteditable="true"]',
      '[data-e2e*="publish"] [contenteditable="true"]',
      '[data-e2e*="content"] [contenteditable="true"]',
      '[data-e2e*="publish"] textarea',
      '[data-e2e*="content"] textarea',
      'div[role="textbox"]',
      'textarea[placeholder*="作品简介"]',
      'textarea[placeholder*="添加简介"]',
      'textarea[placeholder*="添加描述"]',
      'textarea[placeholder*="作品"]',
      'textarea[placeholder*="描述"]',
      'div[contenteditable="true"][data-placeholder*="作品"]',
      'div[contenteditable="true"][data-placeholder*="描述"]',
      '[class*="DraftEditor"] [contenteditable="true"]',
      '[class*="editor-kit"] [contenteditable="true"]',
      'div[contenteditable="plaintext-only"]',
      'div[contenteditable="true"]',
    ], false);

    if (!refreshedLocator) {
      throw new ConflictException('未找到正文输入框');
    }

    await refreshedLocator.click({ timeout: 5000, force: true, delay: 80 }).catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.press('Backspace').catch(() => undefined);
    await page.keyboard.type(normalized, { delay: 60 }).catch(() => undefined);
    await page.waitForTimeout(300);

    if (await this.hasDouyinDescriptionText(page, normalized)) {
      return;
    }

    throw new ConflictException('未找到正文输入框');
  }

  private async hasDouyinDescriptionText(page: Page, value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return true;
    }

    const excerpt = normalized.slice(0, Math.min(24, normalized.length));
    const pageText = (await this.readPageText(page)).replace(/\s+/g, ' ').trim();
    return pageText.includes(excerpt);
  }

  private async fillInputValue(
    page: LocatorContext,
    selectors: string[],
    value: string,
    errorMessage: string,
    options?: FillBehaviorOptions,
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const locator = await this.findFirstLocator(page, selectors, true);
    if (!locator) {
      throw new ConflictException(errorMessage);
    }

    if (options?.preferHumanType) {
      await this.humanType(locator, normalized, {
        clearExisting: true,
        perCharDelay: options.perCharDelay ?? 90,
      });
      const typedValue = await locator.inputValue().catch(() => '');
      if (typedValue.trim() === normalized) {
        await locator.dispatchEvent('blur').catch(() => undefined);
        return;
      }
    }

    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 5000, delay: 80 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.evaluate((node, text) => {
      const element = node as HTMLInputElement | HTMLTextAreaElement;
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, String(text));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }, normalized);

    const currentValue = await locator.inputValue().catch(() => '');
    if (currentValue.trim() === normalized) {
      return;
    }

    await this.humanType(locator, normalized, {
      clearExisting: true,
      perCharDelay: options?.perCharDelay ?? 90,
    });
  }

  private async fillRichTextValue(
    page: LocatorContext,
    selectors: string[],
    value: string,
    errorMessage: string,
    options?: FillBehaviorOptions,
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const locator = await this.findFirstLocator(page, selectors, true);
    if (!locator) {
      throw new ConflictException(errorMessage);
    }

    if (options?.preferHumanType) {
      await this.humanType(locator, normalized, {
        clearExisting: true,
        perCharDelay: options.perCharDelay ?? 90,
      });
      const typedValue = await locator
        .evaluate((node) => {
          if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
            return node.value;
          }
          return node.textContent ?? '';
        })
        .catch(() => '');
      if (typedValue.replace(/\s+/g, ' ').trim().includes(normalized.replace(/\s+/g, ' ').trim())) {
        await locator.dispatchEvent('blur').catch(() => undefined);
        return;
      }
    }

    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 5000, delay: 80 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.evaluate((node, text) => {
      const normalizedText = String(text);
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
        const prototype =
          node instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        descriptor?.set?.call(node, normalizedText);
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
        node.dispatchEvent(new Event('blur', { bubbles: true }));
        return;
      }

      if (node instanceof HTMLElement) {
        node.focus();
        node.textContent = normalizedText;
        node.dispatchEvent(new InputEvent('input', { bubbles: true, data: normalizedText }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
        node.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, normalized);

    const currentValue = await locator
      .evaluate((node) => {
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
          return node.value;
        }
        return node.textContent ?? '';
      })
      .catch(() => '');
    if (currentValue.replace(/\s+/g, ' ').trim().includes(normalized.replace(/\s+/g, ' ').trim())) {
      return;
    }

    await this.humanType(locator, normalized, {
      clearExisting: true,
      perCharDelay: options?.perCharDelay ?? 90,
    });
  }

  private async clickKuaishouPublish(page: Page) {
    const publishButton = await this.findAndHighlightFirst(page, [
      'div._button_3a3lq_1._button-primary_3a3lq_60',
      'button:has-text("发布")',
      'div[role="button"]:has-text("发布")',
      'div:has-text("发布")',
      'text=发布',
    ]);
    await page.waitForTimeout(420);
    await this.humanClick(publishButton);
    await this.humanPauseFast(page, 280, 520);
  }

  private async fillKuaishouDescription(page: Page, title: string, body: string, tags: string[]) {
    const editor = await this.findAndHighlightFirst(page, [
      'div#work-description-edit',
      'div._description_eho7l_59#work-description-edit',
      'div[contenteditable="true"]#work-description-edit',
      'div[contenteditable="true"][placeholder*="添加合适的话题"]',
      'div[contenteditable="true"]',
    ]);

    await this.humanPauseFast(page, 180, 320);
    await this.humanClick(editor).catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.press('Backspace').catch(() => undefined);
    await this.humanPauseFast(page, 160, 280);

    const normalizedTitle = title.trim();
    if (normalizedTitle) {
      await page.keyboard.type(normalizedTitle, { delay: 90 }).catch(() => undefined);
    }

    await page.keyboard.press('Enter').catch(() => undefined);
    await this.humanPauseFast(page, 220, 420);

    const normalizedBody = body.trim();
    if (normalizedBody) {
      await page.keyboard.type(normalizedBody, { delay: 90 }).catch(() => undefined);
    }

    const normalizedTags = Array.from(new Set(tags.map((item) => item.replace(/^#+/, '').trim()).filter(Boolean)));
    for (const tag of normalizedTags) {
      await page.keyboard.press('Enter').catch(() => undefined);
      await this.humanPauseFast(page, 180, 320);
      await page.keyboard.type(`#${tag}`, { delay: 95 }).catch(() => undefined);
      await this.humanPauseFast(page, 420, 760);
      await this.clickKuaishouTagCandidate(page, tag);
      await this.humanPauseFast(page, 320, 620);
    }
  }

  private async clickKuaishouTagCandidate(page: Page, tag: string) {
    const matcher = new RegExp(this.escapeRegExp(tag), 'i');
    const candidateGroups = [
      page.locator('span._at-tag-name_eho7l_222'),
      page.locator('span[class*="at-tag-name"]'),
      page.locator('[class*="tag"] span'),
      page.locator('[role="option"]'),
    ];

    for (const group of candidateGroups) {
      const applied = await this.clickFirstVisibleMatchingText(group, matcher, ['上传', '发布']);
      if (applied) {
        return true;
      }
    }

    return false;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async appendDouyinTopicsAfterBody(page: Page, editor: Locator | null, tags: string[]) {
    const normalizedTags = tags
      .map((item) => item.replace(/^#+/, '').trim())
      .filter(Boolean);

    if (normalizedTags.length === 0 || !editor) {
      return;
    }

    const topicButton = await this.findFirstLocator(page, [
      'div:has-text("#添加话题")',
      '[class*="toolbar-button"]:has-text("#添加话题")',
      'text=#添加话题',
    ], true);

    if (!topicButton) {
      return;
    }

    await this.moveCursorToTagLine(page, undefined, editor);

    for (const tag of normalizedTags) {
      this.logger.log(`[douyin-topic] start tag=${tag}`);
      await this.humanClick(editor).catch(() => undefined);
      await page.keyboard.press('Control+End').catch(() => undefined);
      await page.waitForTimeout(100);
      await this.humanClick(topicButton).catch(() => undefined);
      this.logger.log(`[douyin-topic] topic-button-clicked tag=${tag}`);
      await page.waitForTimeout(300);
      await page.keyboard.type(tag, { delay: 60 }).catch(() => undefined);
      this.logger.log(`[douyin-topic] typed tag=${tag}`);
      await page.waitForTimeout(400);
      const applied = await this.clickDouyinTopicOption(page, editor, tag);
      if (applied) {
        this.logger.log(`[douyin-topic] applied tag=${tag}`);
        await this.finalizeDouyinTagInput(page, editor);
      } else {
        this.logger.warn(`[douyin-topic] fallback-plain tag=${tag}`);
        await this.fallbackAppendPlainTag(page, editor, tag);
      }
      await page.waitForTimeout(300);
    }
  }

  private async appendPlainTagsAfterBody(page: Page, editor: Locator | null, tags: string[]) {
    const normalizedTags = Array.from(
      new Set(tags.map((item) => item.replace(/^#+/, '').trim()).filter(Boolean)),
    );
    if (normalizedTags.length === 0 || !editor) {
      return;
    }

    await this.moveCursorToTagLine(page, undefined, editor);
    await this.humanClickSlow(editor).catch(() => undefined);
    await page.keyboard
      .type(
        normalizedTags.map((tag) => `#${tag}`).join(' '),
        { delay: 105 },
      )
      .catch(() => undefined);
  }

  private buildPlainTagText(tags: string[]) {
    return Array.from(new Set(tags.map((item) => item.replace(/^#+/, '').trim()).filter(Boolean)))
      .map((tag) => `#${tag}`)
      .join(' ');
  }

  private async enterXiaohongshuImagePublish(page: Page) {
    if (page.url().includes('/publish/publish')) {
      return;
    }

    await page.waitForTimeout(2000);

    try {
      await this.clickFirstSlow(page, [
        'div.publish-card:has-text("发布图文笔记")',
        'div.home-card-wrapper .publish-card:has-text("发布图文笔记")',
        'div.group-list .publish-card:has-text("发布图文笔记")',
        'text=发布图文笔记',
        'button:has-text("发布笔记")',
        'text=发布笔记',
      ]);
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      return;
    } catch {
      const bodyText = ((await page.locator('body').textContent().catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
      this.logger.warn(
        `[xiaohongshu-entry] homepage card not found, fallback to direct publish url current=${page.url()} body=${bodyText}`,
      );
    }

    await page.goto(
      'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true',
      {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      },
    );
    await page.waitForTimeout(1800);
    return;

    await this.clickFirst(page, [
      'div.publish-card:has-text("发布图文笔记")',
      'text=发布图文笔记',
      'button:has-text("发布笔记")',
      'text=发布笔记',
    ]);
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
  }

  private async enterXiaohongshuVideoPublish(page: Page) {
    if (page.url().includes('/publish/publish') && page.url().includes('target=video')) {
      return;
    }

    await page.waitForTimeout(2000);

    try {
      await this.clickFirstSlow(page, [
        'div.publish-card:has-text("发布视频笔记")',
        'div.home-card-wrapper .publish-card:has-text("发布视频笔记")',
        'text=发布视频笔记',
        'text=发布视频',
      ]);
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      return;
    } catch {
      // fall back to direct publish url
    }

    await page.goto(
      'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video&openFilePicker=true',
      {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      },
    );
    await page.waitForTimeout(1800);
  }

  private async enterWechatMpImagePublish(page: Page) {
    await page.goto('https://channels.weixin.qq.com/platform', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1300);

    const workContext = await this.getWechatMpEditorContext(page);
    try {
      await this.clickFirstWechatSlow(page, [
        'a:has-text("内容管理")',
        '.finder-ui-desktop-menu__name:has-text("内容管理")',
        'span:has-text("内容管理")',
        'text=内容管理',
      ]);
    } catch (_error) {
      // If the submenu is already expanded, continue directly.
    }
    await page.waitForTimeout(1200);
    await this.clickFirstWechatSlow(page, [
      'a.finder-ui-desktop-menu__link:has-text("图文")',
      '.finder-ui-desktop-menu__name:has-text("图文")',
      'span:has-text("图文")',
      'text=图文',
    ]);
    await page.waitForTimeout(1200);

    const ready = await this.findFirstLocator(
      workContext,
      [
        'input.weui-desktop-form__input[placeholder="填写标题, 22个字符内"]',
        'div.post-desc-box div.input-editor[contenteditable]',
        'div.input-editor[contenteditable][data-placeholder="添加描述"]',
        '.upload-content',
        '.upload-content .center',
        'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表")',
        'button:has-text("发表")',
        'div.post-upload-wrap .ant-upload.ant-upload-drag',
        'span.ant-upload.ant-upload-btn',
        'div.ant-upload.ant-upload-drag',
        'text=发布图片动态',
        'text=可上传最多18张图片',
      ],
      true,
    );
    if (ready) {
      return;
    }

    await this.clickFirstWechatSlow(page, [
      'button[type="button"].weui-desktop-btn.weui-desktop-btn_primary:has-text("发表图文")',
      'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表图文")',
      'button[type="button"]:has-text("发表图文")',
      'text=发表图文',
      'text=发布图文',
      'text=图片和文字',
      'text=图文',
    ]);
    await page.waitForTimeout(1800);

    const refreshedWorkContext = await this.getWechatMpEditorContext(page);
    const finalReady = await this.findFirstLocator(
      refreshedWorkContext,
      [
        'input.weui-desktop-form__input[placeholder="填写标题, 22个字符内"]',
        'div.post-desc-box div.input-editor[contenteditable]',
        'div.input-editor[contenteditable][data-placeholder="添加描述"]',
        '.upload-content',
        '.upload-content .center',
        'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表")',
        'button:has-text("发表")',
        'text=发布图片动态',
        'text=可上传最多18张图片',
      ],
      true,
    );
    if (!finalReady) {
      throw new ConflictException('未进入视频号图文发布页面');
    }
  }

  private async enterWechatMpVideoPublish(page: Page) {
    await page.goto('https://channels.weixin.qq.com/platform', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1300);

    try {
      await this.clickFirstWechatSlow(page, [
        'a:has-text("内容管理")',
        '.finder-ui-desktop-menu__name:has-text("内容管理")',
        'span:has-text("内容管理")',
        'text=内容管理',
      ]);
    } catch (_error) {
      // If the submenu is already expanded, continue directly.
    }
    await page.waitForTimeout(1200);
    await this.clickFirstWechatSlow(page, [
      'a.finder-ui-desktop-menu__link:has-text("视频")',
      '.finder-ui-desktop-menu__name:has-text("视频")',
      'span:has-text("视频")',
      'text=视频',
    ]);
    await page.waitForTimeout(1200);

    const workContext = await this.getWechatMpVideoEditorContext(page);
    const ready = await this.findFirstLocator(
      workContext,
      [
        '.upload-content',
        '.upload-content .center',
        'div.post-desc-box div.input-editor[contenteditable]',
        'div.input-editor[contenteditable][data-placeholder="添加描述"]',
        '[contenteditable][data-placeholder="添加描述"]',
        'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表")',
        'button:has-text("发表")',
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'text=上传视频',
        'button:has-text("重新上传")',
        '[role="button"]:has-text("重新上传")',
        'text=重新上传',
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'input[type="file"][accept*="video"]',
        'input[accept*="video"]',
        'input[placeholder*="标题"]',
        'textarea[placeholder*="描述"]',
        'div[contenteditable][data-placeholder*="描述"]',
        'text=添加描述',
        'text=填写标题',
      ],
      false,
    );
    if (!ready) {
      await this.clickFirstWechatSlow(page, [
        'button[type="button"].weui-desktop-btn.weui-desktop-btn_primary:has-text("发表视频")',
        'button[type="button"].weui-desktop-btn.weui-desktop-btn_primary:has-text("发表内容")',
        'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表视频")',
        'button[type="button"]:has-text("发表视频")',
        'text=发表视频',
        'text=发布视频',
        'text=发表内容',
        'text=发表',
      ]);
      await page.waitForTimeout(1800);
    }

    const refreshedWorkContext = await this.getWechatMpVideoEditorContext(page);
    const finallyReady = await this.findFirstLocator(
      refreshedWorkContext,
      [
        '.upload-content',
        '.upload-content .center',
        'div.post-desc-box div.input-editor[contenteditable]',
        'div.input-editor[contenteditable][data-placeholder="添加描述"]',
        '[contenteditable][data-placeholder="添加描述"]',
        'button.weui-desktop-btn.weui-desktop-btn_primary:has-text("发表")',
        'button:has-text("发表")',
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'text=上传视频',
        'button:has-text("重新上传")',
        '[role="button"]:has-text("重新上传")',
        'text=重新上传',
        'input[type="file"][accept*="video"]',
        'input[accept*="video"]',
        'textarea[placeholder*="描述"]',
        'div[contenteditable][data-placeholder*="描述"]',
        'text=添加描述',
      ],
      false,
    );
    if (!finallyReady) {
      throw new ConflictException('未进入视频号视频发布页面');
    }
  }

  private async getWechatMpEditorContext(page: Page) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8000) {
      const matchedFrame = page
        .frames()
        .find((frame) => frame.url().includes('/micro/content/post/finderNewLifeCreate'));
      if (matchedFrame) {
        const pageText = await this.readPageText(matchedFrame);
        if (
          pageText.includes('图文标题') ||
          pageText.includes('图文描述') ||
          pageText.includes('发布图片动态')
        ) {
          return matchedFrame;
        }
      }

      await page.waitForTimeout(250);
    }

    return page;
  }

  private async getWechatMpVideoEditorContext(page: Page) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8000) {
      const matchedFrame = page
        .frames()
        .find(
          (frame) =>
            frame.url().includes('/platform/post/create') ||
            frame.url().includes('channels.weixin.qq.com'),
        );
      if (matchedFrame) {
        const pageText = await this.readPageText(matchedFrame);
        if (
          pageText.includes('添加描述') ||
          pageText.includes('填写标题') ||
          pageText.includes('发表视频') ||
          pageText.includes('上传视频') ||
          pageText.includes('重新上传')
        ) {
          return matchedFrame;
        }
      }

      const pageText = await this.readPageText(page);
      if (
        pageText.includes('添加描述') ||
        pageText.includes('填写标题') ||
        pageText.includes('发表视频') ||
        pageText.includes('上传视频') ||
        pageText.includes('重新上传')
      ) {
        return page;
      }

      await page.waitForTimeout(250);
    }

    return page;
  }

  private async fillWechatMpTitle(page: LocatorContext, value: string) {
    await this.fillInputValue(
      page,
      [
        'input.weui-desktop-form__input[placeholder="填写标题, 22个字符内"]',
        'xpath=//input[contains(@class,"weui-desktop-form__input") and @placeholder="填写标题, 22个字符内"]',
        'input[placeholder="填写标题，22个字符内"]',
        'textarea[placeholder="填写标题，22个字符内"]',
        'input[placeholder*="标题"]',
        'textarea[placeholder*="标题"]',
        'input[placeholder*="填写标题"]',
        'textarea[placeholder*="填写标题"]',
        'input[type="text"]',
      ],
      value,
      '未找到视频号标题输入框',
      {
        preferHumanType: true,
        perCharDelay: 155,
      },
    );
  }

  private async fillWechatMpDescription(page: LocatorContext, value: string) {
    await this.fillRichTextValue(
      page,
      [
        'div.post-desc-box div.input-editor[contenteditable]',
        'div.input-editor[contenteditable][data-placeholder="添加描述"]',
        'xpath=//div[contains(@class,"input-editor") and @data-placeholder="添加描述"]',
        '[contenteditable][data-placeholder="添加描述"]',
        'textarea[placeholder="添加描述"]',
        'div.input-editor[contenteditable][data-placeholder="添加描述, 1000个字符内"]',
        'xpath=//div[contains(@class,"post-desc-box")]//div[contains(@class,"input-editor") and @contenteditable=""]',
        'xpath=//div[contains(@class,"input-editor") and @data-placeholder="添加描述, 1000个字符内"]',
        '[contenteditable][data-placeholder="添加描述, 1000个字符内"]',
        'textarea[placeholder="添加描述, 1000个字符内"]',
        'textarea[placeholder="添加描述，1000个字符内"]',
        'div[contenteditable][data-placeholder*="描述"]',
        'div[contenteditable][data-placeholder*="正文"]',
        'textarea[placeholder*="描述"]',
        'textarea[placeholder*="文案"]',
        'textarea[placeholder*="内容"]',
        'div[contenteditable]',
      ],
      value,
      '未找到视频号描述输入框',
      {
        preferHumanType: true,
        perCharDelay: 145,
      },
    );
  }

  private async ensureWechatMpNoMusic(page: LocatorContext) {
    const noMusicButton = await this.findFirstLocator(
      page,
      [
        'text=不添加音乐',
        'button:has-text("不添加音乐")',
        '.form-item:has-text("音乐") text=不添加音乐',
        '.form-item:has-text("音乐") button:has-text("不添加音乐")',
      ],
      true,
    );
    if (!noMusicButton) {
      return;
    }

    await this.humanPauseFast(page, 380, 720);
    await this.humanClickWechatSlow(noMusicButton).catch(() => undefined);
    await this.humanPauseFast(page, 380, 720);
  }

  private async clickXiaohongshuPublish(page: Page) {
    await page
      .evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' as ScrollBehavior });
      })
      .catch(() => undefined);
    await page.waitForTimeout(600);

    const publishButton = await this.findAndHighlightFirst(page, [
      'button.ce-btn.bg-red',
      'button.bg-red:has-text("发布")',
      'button.ce-btn:has-text("发布")',
      'button.d-button:has-text("发布")',
      'div.publish-page-publish-btn button:has-text("发布")',
      'button:has-text("发布")',
      'text=发布',
    ]);
    await this.humanClickSlow(publishButton);
  }

  private async clickDouyinTopicOption(page: Page, editor: Locator, tag: string) {
    const normalizedTag = tag.replace(/^#+/, '').trim();
    this.logger.log(`[douyin-topic] try-enter tag=${normalizedTag}`);
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(200);
    if (await this.hasAppliedDouyinTopic(page, editor, normalizedTag)) {
      this.logger.log(`[douyin-topic] enter-applied tag=${normalizedTag}`);
      return true;
    }

    this.logger.log(`[douyin-topic] try-first-candidate tag=${normalizedTag}`);
    await page.keyboard.press('ArrowDown').catch(() => undefined);
    await page.waitForTimeout(120);
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(300);
    if (await this.hasAppliedDouyinTopic(page, editor, normalizedTag)) {
      this.logger.log(`[douyin-topic] first-candidate-applied tag=${normalizedTag}`);
      return true;
    }

    this.logger.log(`[douyin-topic] try-second-enter tag=${normalizedTag}`);
    await page.keyboard.press('ArrowDown').catch(() => undefined);
    await page.waitForTimeout(120);
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(300);
    return this.hasAppliedDouyinTopic(page, editor, normalizedTag);
  }

  private async clickFirstVisibleDouyinTopicCandidate(page: Page) {
    const topicNameGroups = [
      page.locator('.mention-suggest-mount-dom .tag-dVUDkJ'),
      page.locator('.mention-suggest-mount-dom [class*="tag-hash-view-name"]'),
      page.locator('.mention-suggest-mount-dom [class*="tag-hash"]'),
      page.locator('.mention-suggest-mount-dom [role="option"]'),
    ];

    for (const group of topicNameGroups) {
      const count = await group.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = group.nth(index);
        const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text) {
          continue;
        }

        const isVisible = await candidate.isVisible().catch(() => false);
        if (!isVisible) {
          continue;
        }

        await this.humanClick(candidate).catch(async () => {
          const clickableParent = candidate
            .locator('xpath=ancestor-or-self::div[contains(@class,"tag-dVUDkJ")][1]')
            .first();
          if (await clickableParent.count().catch(() => 0)) {
            await this.humanClick(clickableParent).catch(() => undefined);
          }
        });
        return true;
      }
    }

    return false;
  }

  private async clickFirstVisibleMatchingText(
    locator: Locator,
    matcher: RegExp,
    excludedTexts: string[] = [],
  ) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!text || excludedTexts.some((item) => text.includes(item)) || !matcher.test(text)) {
        continue;
      }

      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }

      await this.humanClick(candidate).catch(async () => {
        const clickableParent = candidate.locator('xpath=ancestor-or-self::div[contains(@class,"tag-dVUDkJ")][1]').first();
        if (await clickableParent.count().catch(() => 0)) {
          await this.humanClick(clickableParent).catch(() => undefined);
        }
      });
      return true;
    }

    return false;
  }

  private async moveCursorToTagLine(
    page: Page,
    selectors?: string[],
    locator?: Locator,
  ) {
    const editor = locator ?? (selectors ? await this.findFirstLocator(page, selectors, true) : null);
    if (!editor) {
      return;
    }

    await this.humanClick(editor).catch(() => undefined);
    await page.keyboard.press('Control+End').catch(() => undefined);
    await page.waitForTimeout(120);
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(120);
  }

  private async finalizeDouyinTagInput(page: Page, editor: Locator) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(120);
    await this.humanClick(editor).catch(() => undefined);
    await page.keyboard.press('Control+End').catch(() => undefined);
    await page.waitForTimeout(100);
  }

  private async fallbackAppendPlainTag(page: Page, editor: Locator, tag: string) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(120);
    await this.humanClick(editor).catch(() => undefined);
    await page.keyboard.press('Control+End').catch(() => undefined);
    await page.keyboard.type(`#${tag} `, { delay: 60 }).catch(() => undefined);
    this.logger.warn(`[douyin-topic] fallback to plain tag for tag=${tag}`);
  }

  private async hasAppliedDouyinTopic(page: Page, editor: Locator, tag: string) {
    if (await this.editorContainsTag(editor, tag)) {
      return true;
    }

    const appliedTopicLocators = [
      page.locator('.zone-container [class*="tag-hash"]:not(.mention-suggest-mount-dom *)'),
      page.locator('[class*="editor"] [class*="tag-hash"]:not(.mention-suggest-mount-dom *)'),
      page.locator('[data-e2e*="content"] [class*="tag"]:not(.mention-suggest-mount-dom *)'),
      page.locator('[class*="content"] [class*="topic"]:not(.mention-suggest-mount-dom *)'),
    ];

    for (const locator of appliedTopicLocators) {
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const text = ((await locator.nth(index).textContent().catch(() => '')) || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.includes(tag) || text.includes(`#${tag}`)) {
          return true;
        }
      }
    }

    return false;
  }

  private async editorContainsTag(editor: Locator, tag: string) {
    const currentValue = ((await editor.textContent({ timeout: 800 }).catch(() => '')) || '');
    const normalizedText = currentValue.replace(/\s+/g, ' ').trim();
    return normalizedText.includes(tag) || normalizedText.includes(`#${tag}`);
  }

  private async clickFirst(page: LocatorContext, selectors: string[]) {
    const locator = await this.findFirstLocator(page, selectors, true);
    if (locator) {
      await this.humanClick(locator);
      return;
    }
    throw new ConflictException('未找到目标操作按钮');
  }

  private async clickFirstSlow(page: LocatorContext, selectors: string[]) {
    const locator = await this.findFirstLocator(page, selectors, true);
    if (locator) {
      await this.humanClickSlow(locator);
      return;
    }
    throw new ConflictException('未找到目标操作按钮');
  }

  private async clickFirstWechatSlow(page: LocatorContext, selectors: string[]) {
    const locator = await this.findFirstLocator(page, selectors, true);
    if (locator) {
      await this.humanClickWechatSlow(locator);
      return;
    }
    throw new ConflictException('未找到目标操作按钮');
  }

  private async findAndHighlightFirst(page: LocatorContext, selectors: string[]) {
    const locator = await this.findFirstLocator(page, selectors, true);
    if (!locator) {
      throw new ConflictException('未找到目标操作按钮');
    }

    await locator.evaluate((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.scrollIntoView({ block: 'center', inline: 'center' });
      const previousOutline = node.style.outline;
      node.style.outline = '3px solid #fe2c55';
      setTimeout(() => {
        node.style.outline = previousOutline;
      }, 3000);
    }).catch(() => undefined);

    return locator;
  }

  private async waitForUploadSettled(page: Page) {
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  }

  private async openDouyinImageUpload(page: Page) {
    await this.clickFirst(page, [
      'button:has-text("上传图文")',
      '.container-drag-upload-tL99XD button',
      '[role="button"]:has-text("上传图文")',
      'text=上传图文',
      'text=上传图片',
    ]);
    await page.waitForTimeout(800);
  }

  private async waitForDouyinUploadSettled(page: Page, hasVideo: boolean) {
    const timeoutMs = hasVideo ? 45000 : 25000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pageText = await this.readPageText(page);
      const matchedFailure = ['上传失败', '上传出错', '上传异常', '重新上传失败', '请重新上传'].find(
        (hint) => pageText.includes(hint),
      );
      if (matchedFailure) {
        throw new ConflictException(`保存草稿失败：${matchedFailure}`);
      }

      const previewReady = await this.findFirstLocator(
        page,
        hasVideo
          ? [
              'video',
              '[class*="video"] video',
              '[class*="upload"] video',
              'button:has-text("重新上传")',
              '[role="button"]:has-text("重新上传")',
              'text=重新上传',
            ]
          : [
              'img',
              '[class*="upload"] img',
              '[class*="preview"] img',
              '[style*="background-image"]',
              'button:has-text("重新上传")',
              '[role="button"]:has-text("重新上传")',
              'text=重新上传',
            ],
        true,
      );
      if (previewReady) {
        return;
      }

      const stillUploading = ['上传中', '处理中', '转码中', '上传进度', '%'].some((hint) =>
        pageText.includes(hint),
      );
      const placeholderGone = hasVideo
        ? !pageText.includes('上传视频') || pageText.includes('添加作品标题') || pageText.includes('添加作品描述')
        : !pageText.includes('上传图文') || pageText.includes('添加作品标题') || pageText.includes('添加作品描述');

      if (!stillUploading && placeholderGone) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    throw new ConflictException(hasVideo ? '未识别到抖音视频上传完成状态' : '未识别到抖音图文上传完成状态');
  }

  private async waitForWechatMpUploadSettled(page: LocatorContext) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20000) {
      const pageText = await this.readPageText(page);
      const matchedFailure = ['上传失败', '上传出错', '上传异常', '重新上传'].find((hint) =>
        pageText.includes(hint),
      );
      if (matchedFailure) {
        throw new ConflictException(`保存草稿失败：${matchedFailure}`);
      }

      const previewReady = await this.findFirstLocator(
        page,
        [
          '.material img',
          '.post-upload-wrap img',
          '.material [style*="background-image"]',
          '.ant-upload-list img',
        ],
        true,
      );
      if (previewReady) {
        return;
      }

      const uploadPlaceholderGone =
        !pageText.includes('发布图片动态，可上传最多18张图片，单张不超过20MB，支持常见图片格式。') &&
        !pageText.includes('可上传最多18张图片');
      if (uploadPlaceholderGone) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(2500);
  }

  private async waitForWechatMpVideoUploadSettled(page: LocatorContext) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
      const pageText = await this.readPageText(page);
      const matchedFailure = ['上传失败', '上传出错', '上传异常', '重新上传失败', '请重新上传'].find(
        (hint) => pageText.includes(hint),
      );
      if (matchedFailure) {
        throw new ConflictException(`保存草稿失败：${matchedFailure}`);
      }

      const previewReady = await this.findFirstLocator(
        page,
        [
          'video',
          '.post-video video',
          '.material video',
          '.upload-content video',
          '.upload-content .upload-file-item',
          '.upload-content [class*="upload-file"]',
          '.finder-video video',
          '[class*="video"] video',
          'button:has-text("重新上传")',
          '[role="button"]:has-text("重新上传")',
          'text=重新上传',
        ],
        true,
      );
      if (previewReady) {
        return;
      }

      const uploading = ['上传中', '转码中', '处理中', '上传进度', '%'].some((hint) =>
        pageText.includes(hint),
      );
      const placeholderGone =
        (!pageText.includes('上传视频') && !pageText.includes('上传时长8小时内')) ||
        pageText.includes('重新上传') ||
        pageText.includes('填写标题') ||
        pageText.includes('添加描述');

      if (!uploading && placeholderGone) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    throw new ConflictException('未识别到视频号视频上传完成状态，请确认页面是否仍停留在上传页');
  }

  private async humanClick(locator: Locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.hover({ timeout: 3000 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.click({ timeout: 5000, delay: 80 }).catch(async () => {
      await locator.click({ timeout: 5000, force: true, delay: 80 });
    });
  }

  private async humanClickSlow(locator: Locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.hover({ timeout: 4000 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.click({
      timeout: 6500,
      delay: this.getRandomDelay(150, 280),
    }).catch(async () => {
      await locator.click({
        timeout: 6500,
        force: true,
        delay: this.getRandomDelay(150, 280),
      });
    });
  }

  private async humanClickWechatSlow(locator: Locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.hover({ timeout: 4500 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.click({
      timeout: 7000,
      delay: this.getRandomDelay(220, 420),
    }).catch(async () => {
      await locator.click({
        timeout: 7000,
        force: true,
        delay: this.getRandomDelay(220, 420),
      });
    });
  }

  private getRandomDelay(minMs: number, maxMs: number) {
    const lower = Math.min(minMs, maxMs);
    const upper = Math.max(minMs, maxMs);
    return Math.floor(lower + Math.random() * (upper - lower + 1));
  }

  private async humanPauseFast(page: LocatorContext, minMs = 70, maxMs = 220) {
    await page.waitForTimeout(this.getRandomDelay(minMs, maxMs));
  }

  private async humanClickFast(locator: Locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.hover({ timeout: 2500 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);
    await locator.click({
      timeout: 4500,
      delay: this.getRandomDelay(32, 76),
    }).catch(async () => {
      await locator.click({
        timeout: 4500,
        force: true,
        delay: this.getRandomDelay(32, 76),
      });
    });
  }

  private async humanType(
    locator: Locator,
    value: string,
    options?: { clearExisting?: boolean; perCharDelay?: number },
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const perCharDelay = options?.perCharDelay ?? 45;
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 3000, delay: 60 }).catch(() => undefined);
    await locator.focus().catch(() => undefined);

    if (options?.clearExisting) {
      await this.humanClear(locator);
    }

    const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'input' || tagName === 'textarea') {
      await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
        await locator.fill(normalized, { timeout: 5000 });
      });
      return;
    }

    await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
      await locator.evaluate((node, text) => {
        if (node instanceof HTMLElement) {
          node.focus();
          node.innerText = String(text);
          node.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(text) }));
        }
      }, normalized);
    });
  }

  private async humanTypeFast(
    locator: Locator,
    value: string,
    options?: { clearExisting?: boolean; perCharDelay?: number },
  ) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const perCharDelay = options?.perCharDelay ?? this.getRandomDelay(18, 34);
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.hover({ timeout: 2500 }).catch(() => undefined);
    await locator.click({ timeout: 2800, delay: this.getRandomDelay(24, 48) }).catch(() => undefined);
    await locator.focus().catch(() => undefined);

    if (options?.clearExisting) {
      await this.humanClear(locator);
    }

    const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'input' || tagName === 'textarea') {
      await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
        await locator.fill(normalized, { timeout: 5000 });
      });
      return;
    }

    await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
      await locator.evaluate((node, text) => {
        if (node instanceof HTMLElement) {
          node.focus();
          node.innerText = String(text);
          node.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(text) }));
        }
      }, normalized);
    });
  }

  private async humanClear(locator: Locator) {
    await locator.press('Control+A').catch(() => undefined);
    await locator.press('Backspace').catch(() => undefined);
    await locator.press('Delete').catch(() => undefined);
  }

  private async waitForActionFinished(page: Page, options: PageActionWaitOptions) {
    const timeoutMs = options.timeoutMs ?? 15000;
    const failureHints = options.failureHints ?? [];
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pageText = await this.readPageText(page);
      const matchedFailureHint = failureHints.find((hint) => pageText.includes(hint));
      if (matchedFailureHint) {
        throw new ConflictException(`保存草稿失败：${matchedFailureHint}`);
      }

      const matchedSuccessHint = options.successHints.find((hint) => pageText.includes(hint));
      if (matchedSuccessHint) {
        return;
      }

      if (
        options.successHints.some((hint) => ['发布成功', '作品发布成功', '发布完成', '审核中', '正在审核', '已发布'].includes(hint)) &&
        this.isPublishResultPage(page.url())
      ) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    throw new ConflictException(options.timeoutErrorMessage);
  }

  private async waitForDouyinPublishFinished(page: Page) {
    const timeoutMs = 30000;
    const successHints = ['发布成功', '作品发布成功', '发布完成', '审核中', '正在审核', '已发布', '作品管理'];
    const failureHints = ['发布失败', '请完善内容', '请先上传', '请先添加', '上传失败', '校验失败'];
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pageText = await this.readPageText(page);
      const matchedFailure = failureHints.find((hint) => pageText.includes(hint));
      if (matchedFailure) {
        throw new ConflictException(`保存草稿失败：${matchedFailure}`);
      }

      const matchedSuccess = successHints.find((hint) => pageText.includes(hint));
      if (matchedSuccess || this.isDouyinPublishResultPage(page.url())) {
        return;
      }

      await page.waitForTimeout(1000);
    }

    throw new ConflictException('未识别到抖音发布成功或进入结果页，请确认页面状态');
  }

  private async selectDouyinNoDeclaration(page: Page) {
    const declarationSelect = await this.findFirstLocator(
      page,
      [
        'div.selectBox-buZRzi',
        '[class*="selectBox"]:has-text("请选择自主声明")',
        '[class*="selectText"]:has-text("请选择自主声明")',
        'text=请选择自主声明',
      ],
      true,
    );
    if (!declarationSelect) {
      return;
    }

    await this.humanClick(declarationSelect).catch(() => undefined);
    await page.waitForTimeout(300);

    const noDeclarationOption = await this.findFirstLocator(
      page,
      [
        'label.semi-radio:has-text("无需添加自主声明")',
        'label:has-text("无需添加自主声明")',
        '[class*="semi-radio"]:has-text("无需添加自主声明")',
        'text=无需添加自主声明',
      ],
      true,
    );
    if (!noDeclarationOption) {
      return;
    }

    await this.humanClick(noDeclarationOption).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  private isPublishResultPage(currentUrl: string) {
    if (this.isWechatMpPublishResultPage(currentUrl)) {
      return true;
    }

    return ['/content/manage', '/content/article', '/content?', '/profile', '/article/manage'].some((item) =>
      currentUrl.includes(item),
    );
  }

  private isDouyinPublishResultPage(currentUrl: string) {
    return ['/creator-micro/content/manage', '/creator-micro/content/post', '/creator-micro/content?'].some(
      (item) => currentUrl.includes(item),
    );
  }

  private isWechatMpPublishResultPage(currentUrl: string) {
    if (!currentUrl.includes('channels.weixin.qq.com/platform/post/')) {
      return false;
    }

    return !currentUrl.includes('/platform/post/finderNewLifeCreate');
  }

  private isWechatMpMicroPublishResultPage(currentUrl: string) {
    if (!currentUrl.includes('channels.weixin.qq.com/micro/content/post/')) {
      return false;
    }

    return !currentUrl.includes('/micro/content/post/finderNewLifeCreate');
  }

  private async waitForWechatMpPublishFinished(page: Page, workContext: LocatorContext) {
    const timeoutMs = 20000;
    const successHints = ['发表成功', '发布成功', '已发表', '审核中', '发表完成', '发表中', '处理中'];
    const failureHints = ['发表失败', '发布失败', '上传失败', '请先上传', '请完善', '请填写', '校验失败'];
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pageText = await this.readPageText(workContext);
      const matchedFailure = failureHints.find((hint) => pageText.includes(hint));
      if (matchedFailure) {
        throw new ConflictException(`保存草稿失败：${matchedFailure}`);
      }

      const matchedSuccess = successHints.find((hint) => pageText.includes(hint));
      if (matchedSuccess) {
        return;
      }

      if (
        this.isWechatMpPublishResultPage(page.url()) ||
        this.isWechatMpMicroPublishResultPage(workContext.url())
      ) {
        return;
      }

      await workContext.waitForTimeout(1000);
    }

    throw new ConflictException('未识别到视频号发布成功状态，请确认页面是否仍停留在发布页');
  }

  private async findFirstLocator(page: LocatorContext, selectors: string[], visibleOnly: boolean) {
    for (const selector of selectors) {
      const matched = page.locator(selector);
      const count = await matched.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const locator = matched.nth(index);
        if (!visibleOnly) {
          return locator;
        }
        if (await locator.isVisible().catch(() => false)) {
          return locator;
        }
      }
    }

    return null;
  }

  private async prepareUploadFiles(input: PlatformDraftSaveInput) {
    const assetRoot = this.getPublishAssetPath(input.jobId);
    await mkdir(assetRoot, { recursive: true });

    const targets = input.videoUrl ? [input.videoUrl] : input.images;
    const savedFiles: string[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      const sourceUrl = targets[index];
      const filePath = await this.downloadAsset(sourceUrl, assetRoot, index);
      savedFiles.push(filePath);
    }

    return savedFiles;
  }

  private async cleanupUploadFiles(jobId: string) {
    await rm(this.getPublishAssetPath(jobId), { recursive: true, force: true }).catch(() => undefined);
  }

  private async downloadAsset(sourceUrl: string, targetDir: string, index: number) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new ConflictException(`素材下载失败：${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const urlExtension = extname(new URL(sourceUrl).pathname);
    const fileExtension = urlExtension || this.getExtensionFromContentType(contentType);
    const fileName = `${String(index + 1).padStart(2, '0')}${fileExtension || '.bin'}`;
    const targetPath = join(targetDir, basename(fileName));
    await writeFile(targetPath, buffer);
    return targetPath;
  }

  private getExtensionFromContentType(contentType: string) {
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('jpeg')) return '.jpg';
    if (contentType.includes('jpg')) return '.jpg';
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('mp4')) return '.mp4';
    if (contentType.includes('mov')) return '.mov';
    return '';
  }

  private async readAccountProfile(
    page: Page,
    platform: LeadPublishPlatform,
    fallbackAccountName?: string,
  ) {
    const selectorMap: Record<LeadPublishPlatform, string[]> = {
      [LeadPublishPlatform.xiaohongshu]: [
        '.account-name',
        'div.account-name',
        'div.account-name[data-v-bf295dc2]',
        '[class*="avatar"] ~ div',
        '[class*="user-name"]',
        '[class*="username"]',
        '[class*="name"]',
        '[class*="avatar"] + span',
      ],
      [LeadPublishPlatform.douyin]: [
        'div.name-_lSSDc',
        '[class*="semi-avatar"] ~ div',
        '[class*="user-name"]',
        '[class*="creator-name"]',
        '[class*="nickname"]',
        '[class*="account"] [class*="name"]',
        '[data-e2e*="user-name"]',
      ],
      [LeadPublishPlatform.wechat_mp]: [
        'h2.finder-nickname',
        '.finder-nickname',
        '[class*="finder-nickname"]',
        '[class*="avatar"] ~ div',
        '.weui-desktop-account__info-name',
        '.account_meta_primary',
        '.finder_account_name',
        '.weui-desktop-layout__topbar [class*="name"]',
        '[class*="finder"] [class*="name"]',
        '[class*="account"] [class*="name"]',
        '[class*="avatar"] + div',
        '.type-info',
      ],
      [LeadPublishPlatform.kuaishou]: [
        'div.user-info-name',
        '[class*="avatar"] ~ div',
        '[class*="user-name"]',
        '[class*="account-name"]',
        '[class*="nickname"]',
        '[class*="profile"] [class*="name"]',
      ],
      [LeadPublishPlatform.bilibili]: [],
      [LeadPublishPlatform.wechat_official]: [],
    };

    const directProfile = await this.readDirectProfile(page, platform);
    const profileCardText =
      directProfile.accountName || directProfile.displayName
        ? null
        : await this.readProfileCardText(page, platform);
    const profileCard = profileCardText
      ? this.extractProfileFromPageText(profileCardText, platform)
      : this.emptyProfile();
    const pageText = await this.readPageText(page);
    const pageTextProfile = this.extractProfileFromPageText(pageText, platform);
    const safeFallbackAccountName = this.isPendingPlaceholder(fallbackAccountName)
      ? null
      : fallbackAccountName;
    const ocrProfile =
      (directProfile.accountName && directProfile.displayName) ||
      (profileCard.accountName && profileCard.displayName) ||
      (pageTextProfile.accountName && pageTextProfile.displayName)
        ? this.emptyProfile()
        : await this.extractProfileFromScreenshot(page, platform);
    const displayName =
      directProfile.displayName ||
      profileCard.displayName ||
      ocrProfile.displayName ||
      pageTextProfile.displayName ||
      (await this.readFirstMatchedText(page, selectorMap[platform]));
    const titleText = this.normalizeProfileText(await page.title().catch(() => '')) || '';
    const inferredName =
      directProfile.accountName ||
      profileCard.accountName ||
      ocrProfile.accountName ||
      pageTextProfile.accountName ||
      displayName ||
      this.extractNameFromTitle(titleText, platform) ||
      safeFallbackAccountName ||
      '';

    this.logger.log(
      `[platform-login-profile] platform=${platform} card=${JSON.stringify(
        profileCardText,
      )} direct=${JSON.stringify(directProfile)} page=${JSON.stringify(pageText.slice(0, 240))} result=${JSON.stringify({
        accountName: inferredName,
        displayName:
          displayName ||
          directProfile.displayName ||
          profileCard.displayName ||
          pageTextProfile.displayName ||
          (this.isPendingPlaceholder(inferredName) ? null : inferredName) ||
          null,
      })}`,
    );

    return {
      accountName: inferredName,
      displayName:
        displayName ||
        directProfile.displayName ||
        profileCard.displayName ||
        pageTextProfile.displayName ||
        (this.isPendingPlaceholder(inferredName) ? null : inferredName) ||
        null,
      avatarUrl: directProfile.avatarUrl || null,
      followerCount: directProfile.followerCount ?? null,
    };
  }

  private async readProfileCardText(page: Page, platform: LeadPublishPlatform) {
    const directProfile = await this.readDirectProfile(page, platform);
    if (directProfile.accountName || directProfile.displayName) {
      return [
        directProfile.displayName,
        directProfile.accountName ? `视频号ID: ${directProfile.accountName}` : null,
      ]
        .filter(Boolean)
        .join(' ');
    }

    const scannedBlock = await this.scanTopProfileBlocks(page, platform);
    if (scannedBlock) {
      return scannedBlock;
    }

    const anchors: Record<LeadPublishPlatform, string[]> = {
      [LeadPublishPlatform.xiaohongshu]: ['小红书号'],
      [LeadPublishPlatform.douyin]: ['抖音号'],
      [LeadPublishPlatform.wechat_mp]: ['视频号ID', '视频号'],
      [LeadPublishPlatform.kuaishou]: ['快手号'],
      [LeadPublishPlatform.bilibili]: [],
      [LeadPublishPlatform.wechat_official]: [],
    };

    for (const anchorText of anchors[platform]) {
      try {
        const locator = page.locator(`text=${anchorText}`).first();
        const blockText = this.normalizeProfileText(
          await locator.evaluate((node, anchor) => {
            let current: HTMLElement | null =
              node instanceof HTMLElement ? node : node.parentElement;
            while (current) {
              const text = (current.innerText || current.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
              if (text.includes(String(anchor)) && text.length >= 8 && text.length <= 240) {
                return text;
              }
              current = current.parentElement;
            }
            return null;
          }, anchorText),
        );
        if (blockText) {
          return blockText;
        }
      } catch {
        // Ignore missing anchor text and continue trying other profile hints.
      }
    }

    return null;
  }

  private async readDirectProfile(page: Page, platform: LeadPublishPlatform): Promise<AccountProfile> {
    try {
      const profile = await page.evaluate((currentPlatform) => {
        const normalize = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();
        const parseCount = (value?: string | null) => {
          const normalized = normalize(value).replace(/[,，]/g, '');
          const match = normalized.match(/(\d+(?:\.\d+)?)(万|w|W|k|K)?/);
          if (!match) return null;
          const base = Number(match[1]);
          if (Number.isNaN(base)) return null;
          const unit = match[2];
          if (unit === '万' || unit === 'w' || unit === 'W') return Math.round(base * 10000);
          if (unit === 'k' || unit === 'K') return Math.round(base * 1000);
          return Math.round(base);
        };
        const findMetricCountByLabel = (label: string) => {
          const labelNodes = Array.from(document.querySelectorAll<HTMLElement>('span, div, p'));
          for (const node of labelNodes) {
            const text = normalize(node.innerText || node.textContent);
            if (!text || !text.includes(label) || text.length > 40) {
              continue;
            }
            const containers = [node.parentElement, node.parentElement?.parentElement, node.closest('li, div, section, article')].filter(Boolean);
            for (const container of containers) {
              const scopedMetric = normalize(
                container?.querySelector<HTMLElement>(
                  '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
                )?.innerText ||
                  container?.querySelector<HTMLElement>(
                    '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
                  )?.textContent,
              );
              const parsedScopedMetric = parseCount(scopedMetric);
              if (parsedScopedMetric !== null) {
                return parsedScopedMetric;
              }
            }
          }

          const metricContainers = Array.from(document.querySelectorAll<HTMLElement>('div, li, section, article'));
          for (const container of metricContainers) {
            const text = normalize(container.innerText || container.textContent);
            if (!text || !text.includes(label) || text.length > 160) {
              continue;
            }
            const scopedMetric = normalize(
              container.querySelector<HTMLElement>(
                '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
              )?.innerText ||
                container.querySelector<HTMLElement>(
                  '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
                )?.textContent,
            );
            const parsedScopedMetric = parseCount(scopedMetric);
            if (parsedScopedMetric !== null) {
              return parsedScopedMetric;
            }
          }
          return null;
        };
        const findDivByText = (keyword: string) =>
          Array.from(document.querySelectorAll<HTMLElement>('div, span, p'))
            .find((node) => normalize(node.innerText || node.textContent).includes(keyword));

        if (currentPlatform === 'xiaohongshu') {
          const nameNode = document.querySelector<HTMLElement>('.account-name');
          const accountIdNode = findDivByText('小红书账号') || findDivByText('小红书号');
          const avatarNode = document.querySelector<HTMLImageElement>(
            'img[src*="img.xiaohongshu.com/avatar"], img[src*="/avatar/"], .avatar img, [class*="avatar"] img',
          );
          const followerNode = Array.from(document.querySelectorAll<HTMLElement>('span, div, p')).find((node) =>
            normalize(node.innerText || node.textContent).includes('粉丝'),
          );
          const followerText =
            normalize(
              followerNode?.parentElement?.querySelector<HTMLElement>('.numerical, [class*="numerical"]')
                ?.innerText ||
                followerNode?.parentElement?.querySelector<HTMLElement>('.numerical, [class*="numerical"]')
                  ?.textContent,
            ) ||
            normalize(followerNode?.innerText || followerNode?.textContent);
          const displayName = normalize(nameNode?.innerText || nameNode?.textContent);
          const accountIdText = normalize(accountIdNode?.innerText || accountIdNode?.textContent);
          const accountName =
            accountIdText.match(/小红书(?:账号|号)\s*[:：]?\s*([A-Za-z0-9_-]+)/)?.[1]?.trim() || '';
          const avatarUrl = normalize(avatarNode?.getAttribute('src') || avatarNode?.src);
          const followerCount = parseCount(followerText);
          return displayName || accountName || avatarUrl || followerCount !== null
            ? {
                displayName: displayName || null,
                accountName: accountName || null,
                avatarUrl: avatarUrl || null,
                followerCount,
              }
            : null;
        }

        if (currentPlatform === 'wechat_mp') {
          const nicknameNode = document.querySelector<HTMLElement>('h2.finder-nickname');
          const avatarNode = document.querySelector<HTMLImageElement>(
            'img.avatar, img[src*="wx.qlogo.cn/finderhead/"], [class*="finder"] img.avatar, [class*="finder"] [class*="avatar"] img',
          );
          const getXPathText = (xpath: string) => {
            const result = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue;
            if (!(result instanceof HTMLElement)) {
              return '';
            }
            return normalize(result.innerText || result.textContent);
          };
          const extractVideoChannelId = (value?: string | null) =>
            normalize(value)?.match(/视频号ID\s*[:：]?\s*([A-Za-z0-9_-]+)/)?.[1]?.trim() || '';
          const findVideoChannelIdFromNodes = () => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>('div, span, p, h2, h3'));
            for (const node of nodes) {
              const text = normalize(node.innerText || node.textContent);
              if (!text || !text.includes('视频号ID')) {
                continue;
              }

              const directId = extractVideoChannelId(text);
              if (directId) {
                return { accountId: directId, rawText: text };
              }

              let parent: HTMLElement | null = node.parentElement;
              while (parent) {
                const parentText = normalize(parent.innerText || parent.textContent);
                if (!parentText) {
                  parent = parent.parentElement;
                  continue;
                }
                const parentId = extractVideoChannelId(parentText);
                if (parentId) {
                  return { accountId: parentId, rawText: parentText };
                }
                parent = parent.parentElement;
              }
            }

            return { accountId: '', rawText: '' };
          };
          const followerNode = Array.from(document.querySelectorAll<HTMLElement>('span, div, p')).find((node) =>
            normalize(node.innerText || node.textContent).includes('粉丝'),
          );
          const followerText =
            normalize(
              followerNode?.parentElement?.querySelector<HTMLElement>(
                '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
              )?.innerText ||
                followerNode?.parentElement?.querySelector<HTMLElement>(
                  '.finder-info-num, [class*="finder-info-num"], .numerical, [class*="numerical"]',
                )?.textContent,
            ) ||
            normalize(followerNode?.innerText || followerNode?.textContent);
          const avatarUrl = normalize(avatarNode?.getAttribute('src') || avatarNode?.src);
          const followerCount = findMetricCountByLabel('粉丝') ?? parseCount(followerText);

          const displayName =
            normalize(nicknameNode?.innerText || nicknameNode?.textContent) ||
            getXPathText(
            '/html/body/div[1]/div/div[2]/div[2]/div/div[2]/div[1]/div[1]/div/div/div/h2',
            );
          const accountIdXPathText = getXPathText(
            '/html/body/div[1]/div/div[2]/div[2]/div/div[2]/div[1]/div[1]/div/div/div/div[2]/div[1]/span[2]',
          );
          const accountIdXPathBlock = getXPathText(
            '/html/body/div[1]/div/div[2]/div[2]/div/div[2]/div[1]/div[1]/div/div/div/div[2]/div[1]',
          );
          const accountIdFromXPath =
            extractVideoChannelId(accountIdXPathText) ||
            extractVideoChannelId(accountIdXPathBlock) ||
            normalize(accountIdXPathText);
          const accountIdFromNodes = findVideoChannelIdFromNodes();
          const accountIdText = accountIdFromXPath || accountIdFromNodes.accountId;

          if (displayName || accountIdText || avatarUrl || followerCount !== null) {
            return {
              displayName: displayName || null,
              accountName: accountIdText || null,
              avatarUrl: avatarUrl || null,
              followerCount,
            };
          }

          const idNode = findDivByText('视频号ID') || findDivByText('视频号 Id') || findDivByText('视频号ID:');
          if (!idNode) {
            return avatarUrl || followerCount !== null
              ? {
                  displayName: displayName || null,
                  accountName: accountIdText || null,
                  avatarUrl: avatarUrl || null,
                  followerCount,
                }
              : null;
          }

          let container: HTMLElement | null = idNode;
          while (container) {
            const text = normalize(container.innerText || container.textContent);
            if (
              text.includes('视频号ID') &&
              text.length >= 10 &&
              text.length <= 240 &&
              container.getBoundingClientRect().top < 360
            ) {
              const childTexts = Array.from(container.querySelectorAll<HTMLElement>('div, span, p'))
                .map((node) => normalize(node.innerText || node.textContent))
                .filter(Boolean);
              const displayNameFromCard =
                childTexts.find(
                  (item) =>
                    !item.includes('视频号ID') &&
                    !item.includes('视频号认证') &&
                    !item.includes('被赞') &&
                    !item.includes('关注') &&
                    !item.includes('粉丝') &&
                    !item.includes('播放'),
                ) || '';
              const accountName = extractVideoChannelId(text);
              if (
                displayNameFromCard ||
                accountName ||
                displayName ||
                accountIdText ||
                avatarUrl ||
                followerCount !== null
              ) {
                return {
                  displayName: displayNameFromCard || displayName || null,
                  accountName: accountName || accountIdText || null,
                  avatarUrl: avatarUrl || null,
                  followerCount,
                };
              }
            }
            container = container.parentElement;
          }
        }

        return null;
      }, platform);

      return {
        accountName: this.normalizeProfileText(profile?.accountName),
        displayName: this.normalizeProfileText(profile?.displayName),
        avatarUrl: this.normalizeProfileText(profile?.avatarUrl),
        followerCount:
          typeof profile?.followerCount === 'number' && Number.isFinite(profile.followerCount)
            ? profile.followerCount
            : null,
      };
    } catch (error) {
      this.logger.warn(
        `[platform-login-direct-profile] platform=${platform} failed=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.emptyProfile();
    }
  }

  private async scanTopProfileBlocks(page: Page, platform: LeadPublishPlatform) {
    const anchors: Record<LeadPublishPlatform, string[]> = {
      [LeadPublishPlatform.xiaohongshu]: ['小红书号', '粉丝', '获赞与收藏'],
      [LeadPublishPlatform.douyin]: ['抖音号', '获赞', '粉丝'],
      [LeadPublishPlatform.wechat_mp]: ['视频号ID', '视频号认证', '被赞', '关注'],
      [LeadPublishPlatform.kuaishou]: ['快手号', '获赞', '粉丝'],
      [LeadPublishPlatform.bilibili]: [],
      [LeadPublishPlatform.wechat_official]: [],
    };

    try {
      const candidates = await page.evaluate((anchorTexts) => {
        type Candidate = {
          text: string;
          score: number;
          top: number;
          left: number;
          width: number;
          height: number;
        };
        const allElements = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
        return allElements
          .map((element): Candidate | null => {
            const rect = element.getBoundingClientRect();
            const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || rect.top < 0 || rect.top > 360 || rect.left > 720 || rect.width < 120 || rect.height < 40) {
              return null;
            }
            if (text.length < 8 || text.length > 280) {
              return null;
            }
            const score = anchorTexts.reduce((sum, anchor) => sum + (text.includes(anchor) ? 2 : 0), 0);
            const avatarBonus =
              element.querySelector('img, [style*="background-image"], [class*="avatar"]') ? 2 : 0;
            const idBonus = /(小红书号|抖音号|视频号ID|视频号|快手号)/.test(text) ? 3 : 0;
            const statBonus = /(粉丝|获赞|关注|被赞|收藏)/.test(text) ? 1 : 0;
            const totalScore = score + avatarBonus + idBonus + statBonus;
            if (totalScore <= 0) {
              return null;
            }
            return {
              text,
              score: totalScore,
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };
          })
          .filter((item): item is Candidate => item !== null)
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            if (a.top !== b.top) {
              return a.top - b.top;
            }
            return a.left - b.left;
          })
          .slice(0, 5);
      }, anchors[platform]);

      const best = candidates[0]?.text || null;
      if (best) {
        this.logger.log(
          `[platform-login-profile-scan] platform=${platform} candidates=${JSON.stringify(candidates.map((item) => item.text))}`,
        );
      }
      return this.normalizeProfileText(best);
    } catch (error) {
      this.logger.warn(
        `[platform-login-profile-scan] platform=${platform} failed=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private async readPageText(page: LocatorContext) {
    try {
      const text = await page.locator('body').innerText({ timeout: 2000 });
      return this.normalizeProfileText(text) || '';
    } catch {
      return '';
    }
  }

  private async extractProfileFromScreenshot(page: Page, platform: LeadPublishPlatform) {
    try {
      const viewport =
        page.viewportSize() ||
        (await page.evaluate(() => ({
          width: window.innerWidth || document.documentElement.clientWidth || 1280,
          height: window.innerHeight || document.documentElement.clientHeight || 720,
        })));
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: Math.min(980, Math.max(320, viewport.width)),
          height: Math.min(320, Math.max(180, viewport.height)),
        },
      });
      const worker = await createWorker('chi_sim+eng');
      try {
        const result = await worker.recognize(screenshot);
        const ocrText = this.normalizeProfileText(result.data.text ?? '') || '';
        return this.extractProfileFromPageText(ocrText, platform);
      } finally {
        await worker.terminate();
      }
    } catch {
      return { accountName: null, displayName: null };
    }
  }

  private async readFirstMatchedText(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        const text = this.normalizeProfileText(await locator.textContent({ timeout: 1200 }));
        if (text) {
          return text;
        }
      } catch {
        // Ignore unmatched selectors and try the next candidate.
      }
    }

    return null;
  }

  private extractNameFromTitle(title: string, platform: LeadPublishPlatform) {
    if (!title) {
      return null;
    }

    const separators = [' - ', '_', '|', '｜', '—', '–'];
    for (const separator of separators) {
      const parts = title
        .split(separator)
        .map((item) => this.normalizeProfileText(item))
        .filter((item): item is string => Boolean(item));
      const candidate = parts.find((item) => !this.looksLikePlatformLabel(item, platform));
      if (candidate) {
        return candidate;
      }
    }

    return this.looksLikePlatformLabel(title, platform) ? null : title;
  }

  private extractProfileFromPageText(text: string, platform: LeadPublishPlatform) {
    if (!text) {
      return { accountName: null, displayName: null };
    }

    const compactText = text.replace(/\s+/g, ' ').trim();
    const matchers: Record<
      LeadPublishPlatform,
      Array<{ account: RegExp; display?: RegExp }>
    > = {
      [LeadPublishPlatform.douyin]: [
        {
          account: /抖音号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /([^\s]{1,40})\s+抖音号\s*[:：]?\s*[A-Za-z0-9_-]+/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+获赞\s*\d+\s+关注\s*\d+\s+粉丝\s*\d+/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+获赞\s*\d+\s+关注\s*\d+\s+粉丝\s*\d+/i,
        },
      ],
      [LeadPublishPlatform.wechat_mp]: [
        {
          account: /视频号ID\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /([^\s]{1,40})\s+视频号认证/i,
        },
        {
          account:
            /([^\s]{1,40})\s+视频号认证[\s\S]{0,80}?视频号ID\s*[:：]?\s*([A-Za-z0-9_-]{4,})/i,
          display: /([^\s]{1,40})\s+视频号认证[\s\S]{0,80}?视频号ID\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i,
        },
        {
          account: /视频号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /视频号名称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /视频号ID\s*[:：]?\s*([A-Za-z0-9_-]+)[\s\S]{0,80}?被赞\s*\d+\s+关注\s*\d+/i,
          display: /([^\s]{1,40})\s+视频号认证[\s\S]{0,40}?视频号ID\s*[:：]?\s*[A-Za-z0-9_-]+/i,
        },
      ],
      [LeadPublishPlatform.xiaohongshu]: [
        {
          account: /小红书(?:号|账号)\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /昵称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /([^\s]{1,40})\s+小红书(?:号|账号)\s*[:：]?\s*([A-Za-z0-9_-]{4,})/i,
          display: /([^\s]{1,40})\s+小红书(?:号|账号)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+(?:粉丝|获赞|收藏)/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+(?:粉丝|获赞|收藏)/i,
        },
      ],
      [LeadPublishPlatform.kuaishou]: [
        {
          account: /快手号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /昵称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+(?:获赞|关注|粉丝)/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+(?:获赞|关注|粉丝)/i,
        },
      ],
      [LeadPublishPlatform.bilibili]: [],
      [LeadPublishPlatform.wechat_official]: [],
    };

    for (const matcher of matchers[platform]) {
      const accountMatch = compactText.match(matcher.account);
      const accountName = this.normalizeProfileText(
        accountMatch?.[2] || accountMatch?.[1] || null,
      );
      const displayName = matcher.display
        ? this.normalizeProfileText(compactText.match(matcher.display)?.[1] || null)
        : null;
      if (accountName || displayName) {
        return {
          accountName,
          displayName: displayName && !this.looksLikePlatformLabel(displayName, platform)
            ? displayName
            : null,
        };
      }
    }

    return { accountName: null, displayName: null };
  }

  private assertAuthenticatedProfile(
    profile: AccountProfile,
    platform: LeadPublishPlatform,
    currentUrl: string,
  ) {
    const accountId = this.normalizeProfileText(profile.accountName);
    const displayName = this.normalizeProfileText(profile.displayName);
    const identifiers = [accountId, displayName].filter((item): item is string => Boolean(item));
    if (identifiers.length === 0) {
      throw new ConflictException('尚未识别到登录后的真实账号信息，请先完成登录并停留在账号后台首页');
    }

    if (identifiers.some((item) => this.isPendingPlaceholder(item))) {
      throw new ConflictException('当前仍是登录中占位状态，请先完成平台登录');
    }

    if (identifiers.every((item) => this.looksLikePlatformLabel(item, platform))) {
      throw new ConflictException('当前页面仍未进入账号后台，请完成登录后停留在后台首页');
    }

    const normalizedUrl = currentUrl.toLowerCase();
    const loginUrlKeywords = ['login', 'signin', 'passport', 'oauth', 'scan', 'qrcode'];
    if (loginUrlKeywords.some((keyword) => normalizedUrl.includes(keyword))) {
      throw new ConflictException('当前仍在登录页，请完成登录后再自动回收');
    }

    const resolvedAccountName = accountId || displayName;
    if (!resolvedAccountName) {
      throw new ConflictException('尚未识别到登录后的真实账号信息，请先完成登录并停留在账号后台首页');
    }
    const resolvedDisplayName = displayName || accountId || null;
    return {
      accountName: resolvedAccountName,
      displayName: resolvedDisplayName,
      avatarUrl: profile.avatarUrl ?? null,
      followerCount: profile.followerCount ?? null,
    };
  }

  private looksLikePlatformLabel(value: string, platform: LeadPublishPlatform) {
    const normalized = value.toLowerCase();
    const labels: Record<LeadPublishPlatform, string[]> = {
      [LeadPublishPlatform.xiaohongshu]: ['小红书', 'xiaohongshu', '创作服务平台'],
      [LeadPublishPlatform.douyin]: ['抖音', 'douyin', '创作者平台'],
      [LeadPublishPlatform.wechat_mp]: ['视频号', '视频号助手', 'channels', 'wechat'],
      [LeadPublishPlatform.kuaishou]: ['快手', 'kuaishou'],
      [LeadPublishPlatform.bilibili]: ['哔哩哔哩', 'bilibili', 'b站'],
      [LeadPublishPlatform.wechat_official]: ['微信公众号', '公众号', 'mp.weixin'],
    };
    return labels[platform].some((label) => normalized.includes(label.toLowerCase()));
  }

  private normalizeProfileText(value: string | null | undefined) {
    const next = value?.replace(/\s+/g, ' ').trim();
    return next || null;
  }

  private emptyProfile(): AccountProfile {
    return {
      accountName: null,
      displayName: null,
      avatarUrl: null,
      followerCount: null,
    };
  }

  private isPendingPlaceholder(value: string | null | undefined) {
    const normalized = value?.trim().toLowerCase();
    return Boolean(normalized && normalized.startsWith('pending_'));
  }

  private ensureDirectory(targetPath: string) {
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }
  }
}

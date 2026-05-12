import { ConfigService } from '@nestjs/config';
import { LeadPublishPlatform } from '@prisma/client';
import { chromium } from 'playwright-core';
import { PlatformLoginBrowserService } from './platform-login-browser.service';

describe('PlatformLoginBrowserService', () => {
  let service: PlatformLoginBrowserService;
  const originalPlatform = process.platform;
  const originalDisplay = process.env.DISPLAY;
  const originalWaylandDisplay = process.env.WAYLAND_DISPLAY;

  beforeEach(() => {
    service = new PlatformLoginBrowserService({
      get: jest.fn(),
    } as unknown as ConfigService);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    process.env.DISPLAY = originalDisplay;
    process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
    jest.restoreAllMocks();
  });

  it('dispatches Xiaohongshu publish jobs through a dedicated browser flow', async () => {
    jest
      .spyOn(service as never, 'prepareUploadFiles')
      .mockResolvedValue(['D:/tmp/test.jpg']);
    jest.spyOn(service as never, 'cleanupUploadFiles').mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'withReadableContext')
      .mockImplementation(async (_input, reader) =>
        reader({
          context: {} as never,
          page: {
            url: () => 'https://creator.xiaohongshu.com/publish/publish',
          } as never,
        }),
      );
    jest.spyOn(service as never, 'ensurePublishPageReady').mockResolvedValue(undefined);

    const publishXiaohongshuImagePost = jest
      .spyOn(service as never, 'publishXiaohongshuImagePost')
      .mockResolvedValue(undefined);

    const result = await service.publish({
      accountId: 'account-id',
      sessionPath: 'D:/tmp/session',
      platform: LeadPublishPlatform.xiaohongshu,
      jobId: 'job-id',
      title: '标题',
      body: '正文',
      tags: ['露营'],
      images: ['https://example.com/1.jpg'],
      videoUrl: null,
    });

    expect(publishXiaohongshuImagePost).toHaveBeenCalled();
    expect(result.draftUrl).toBe('https://creator.xiaohongshu.com/publish/publish');
  });

  it('returns a readable error when login requires a visible browser on Linux without display', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    await expect(
      service.launchLoginPage({
        accountId: 'account-id',
        platform: LeadPublishPlatform.douyin,
        sessionPath: 'D:/tmp/session',
      }),
    ).rejects.toThrow('当前服务器未配置桌面显示环境，无法打开平台登录浏览器');
  });

  it('falls back to headless mode for publish flows on Linux without display', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    const context = {
      pages: jest.fn().mockReturnValue([]),
      newPage: jest.fn().mockResolvedValue({
        url: jest.fn().mockReturnValue('https://creator.douyin.com/creator-micro/content/publish'),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(service as never, 'resolveExecutablePath').mockReturnValue('/usr/bin/google-chrome');
    const launchPersistentContext = jest
      .spyOn(chromium, 'launchPersistentContext')
      .mockResolvedValue(context as never);

    await (service as never)['withReadableContext'](
      {
        accountId: 'account-id',
        sessionPath: 'D:/tmp/session',
        platform: LeadPublishPlatform.douyin,
        visible: true,
      },
      async () => 'ok',
    );

    expect(launchPersistentContext).toHaveBeenCalledWith(
      'D:/tmp/session',
      expect.objectContaining({
        headless: true,
      }),
    );
  });

  it('dispatches Kuaishou image publish jobs through a dedicated browser flow', async () => {
    jest
      .spyOn(service as never, 'prepareUploadFiles')
      .mockResolvedValue(['D:/tmp/test.jpg']);
    jest.spyOn(service as never, 'cleanupUploadFiles').mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'withReadableContext')
      .mockImplementation(async (_input, reader) =>
        reader({
          context: {} as never,
          page: {
            url: () => 'https://cp.kuaishou.com/article/publish/video?tabType=2',
          } as never,
        }),
      );
    jest.spyOn(service as never, 'ensurePublishPageReady').mockResolvedValue(undefined);

    const publishKuaishouImagePost = jest
      .spyOn(service as never, 'publishKuaishouImagePost')
      .mockResolvedValue(undefined);

    const result = await service.publish({
      accountId: 'account-id',
      sessionPath: 'D:/tmp/session',
      platform: LeadPublishPlatform.kuaishou,
      jobId: 'job-id',
      title: '鏍囬',
      body: '姝ｆ枃\n#闇茶惀',
      tags: ['闇茶惀'],
      images: ['https://example.com/1.jpg'],
      videoUrl: null,
    });

    expect(publishKuaishouImagePost).toHaveBeenCalled();
    expect(result.draftUrl).toBe('https://cp.kuaishou.com/article/publish/video?tabType=2');
  });

  it('dispatches Wechat publish jobs through a dedicated browser flow', async () => {
    jest
      .spyOn(service as never, 'prepareUploadFiles')
      .mockResolvedValue(['D:/tmp/test.jpg']);
    jest.spyOn(service as never, 'cleanupUploadFiles').mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'withReadableContext')
      .mockImplementation(async (_input, reader) =>
        reader({
          context: {} as never,
          page: {
            url: () => 'https://channels.weixin.qq.com/platform/post/finderNewLifeCreate',
          } as never,
        }),
      );
    jest.spyOn(service as never, 'ensurePublishPageReady').mockResolvedValue(undefined);

    const publishWechatMpImagePost = jest
      .spyOn(service as never, 'publishWechatMpImagePost')
      .mockResolvedValue(undefined);

    const result = await service.publish({
      accountId: 'account-id',
      sessionPath: 'D:/tmp/session',
      platform: LeadPublishPlatform.wechat_mp,
      jobId: 'job-id',
      title: '标题',
      body: '正文',
      tags: ['露营'],
      images: ['https://example.com/1.jpg'],
      videoUrl: null,
    });

    expect(publishWechatMpImagePost).toHaveBeenCalled();
    expect(result.draftUrl).toBe('https://channels.weixin.qq.com/platform/post/finderNewLifeCreate');
  });

  it('enters the direct Wechat image publish url when not already on the create page', async () => {
    const page = {
      url: jest.fn().mockReturnValue('https://channels.weixin.qq.com/platform/home'),
      goto: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service as never, 'findFirstLocator').mockResolvedValue({} as never);

    await (service as never)['enterWechatMpImagePublish'](page);

    expect(page.goto).toHaveBeenCalledWith(
      'https://channels.weixin.qq.com/platform/post/finderNewLifeCreate',
      expect.objectContaining({
        waitUntil: 'domcontentloaded',
      }),
    );
  });

  it('treats Wechat post pages except the create page as publish result pages', () => {
    expect(
      (service as never)['isPublishResultPage'](
        'https://channels.weixin.qq.com/platform/post/list?tab=publish',
      ),
    ).toBe(true);
    expect(
      (service as never)['isPublishResultPage'](
        'https://channels.weixin.qq.com/platform/post/finderNewLifeCreate',
      ),
    ).toBe(false);
  });

  it('clicks the first visible Xiaohongshu topic candidate', async () => {
    const hiddenCandidate = {
      isVisible: jest.fn().mockResolvedValue(false),
      textContent: jest.fn().mockResolvedValue('隐藏候选'),
    };
    const visibleCandidate = {
      isVisible: jest.fn().mockResolvedValue(true),
      textContent: jest.fn().mockResolvedValue('#露营 1234'),
    };

    const locator = {
      count: jest.fn().mockResolvedValue(2),
      nth: jest.fn((index: number) => (index === 0 ? hiddenCandidate : visibleCandidate)),
    };

    const page = {
      locator: jest.fn().mockReturnValue(locator),
    };

    const humanClick = jest.spyOn(service as never, 'humanClick').mockResolvedValue(undefined);

    const result = await (service as never)['clickFirstVisibleXiaohongshuTopicCandidate'](page);

    expect(result).toBe(true);
    expect(humanClick).toHaveBeenCalledWith(visibleCandidate);
  });

  it('waits for Xiaohongshu login recovery instead of failing immediately on the login page', async () => {
    const page = {
      url: jest.fn().mockReturnValue('https://creator.xiaohongshu.com/login'),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn().mockResolvedValue(undefined),
    };
    const waitForPublishLoginRecovery = jest
      .spyOn(service as never, 'waitForPublishLoginRecovery')
      .mockResolvedValue({
        authPayload: 'a=1',
        accountName: 'demo_account',
        displayName: 'Demo Account',
      });
    jest
      .spyOn(service as never, 'isLoginPageUrl')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    await expect(
      (service as never)['ensurePublishPageReady'](page, LeadPublishPlatform.xiaohongshu, false),
    ).resolves.toEqual({
      authPayload: 'a=1',
      accountName: 'demo_account',
      displayName: 'Demo Account',
    });
    expect(waitForPublishLoginRecovery).toHaveBeenCalledWith(
      page,
      LeadPublishPlatform.xiaohongshu,
      false,
    );
  });

  it('does not treat the Kuaishou publish page as a login page', async () => {
    const page = {
      url: jest.fn().mockReturnValue('https://cp.kuaishou.com/article/publish/video?tabType=2'),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service as never, 'clickFirst').mockRejectedValue(new Error('skip'));

    await expect(
      (service as never)['ensurePublishPageReady'](page, LeadPublishPlatform.kuaishou, false),
    ).resolves.toBeNull();
  });

  it('falls back to the direct Xiaohongshu image publish url when the homepage card is not found', async () => {
    const page = {
      url: jest.fn().mockReturnValue('https://creator.xiaohongshu.com/new/home'),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        textContent: jest.fn().mockResolvedValue('发布图文笔记 发布视频笔记'),
      }),
    };

    jest
      .spyOn(service as never, 'clickFirst')
      .mockRejectedValue(new Error('未找到目标操作按钮'));

    await (service as never)['enterXiaohongshuImagePublish'](page);

    expect(page.goto).toHaveBeenCalledWith(
      'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true',
      expect.objectContaining({
        waitUntil: 'domcontentloaded',
      }),
    );
  });

  it('appends Xiaohongshu tags on a new line and converts them through the topic flow', async () => {
    const editor = {};
    const page = {
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined),
        type: jest.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    jest
      .spyOn(service as never, 'findAndHighlightFirst')
      .mockResolvedValue(editor);
    const humanClick = jest.spyOn(service as never, 'humanClick').mockResolvedValue(undefined);
    const clickTopicCandidate = jest
      .spyOn(service as never, 'clickFirstVisibleXiaohongshuTopicCandidate')
      .mockResolvedValue(true);

    await (service as never)['tryAppendXiaohongshuTopics'](page, ['露营']);

    expect(page.keyboard.press).toHaveBeenCalledWith('Control+End');
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    expect(page.keyboard.type).toHaveBeenCalledWith('#露营', { delay: 60 });
    expect(clickTopicCandidate).toHaveBeenCalledWith(page, '露营');
    expect(humanClick).toHaveBeenCalledWith(editor);
  });

  it('moves Douyin tags onto a new line and converts them one by one through topic suggestions', async () => {
    const editor = {};
    const topicButton = {
      click: jest.fn().mockResolvedValue(undefined),
    };
    const page = {
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined),
        type: jest.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const findFirstLocator = jest
      .spyOn(service as never, 'findFirstLocator')
      .mockResolvedValueOnce(topicButton);
    const humanClick = jest.spyOn(service as never, 'humanClick').mockResolvedValue(undefined);
    const clickDouyinTopicOption = jest
      .spyOn(service as never, 'clickDouyinTopicOption')
      .mockResolvedValue(true);
    const finalizeDouyinTagInput = jest
      .spyOn(service as never, 'finalizeDouyinTagInput')
      .mockResolvedValue(undefined);

    await (service as never)['appendDouyinTopicsAfterBody'](page, editor, ['露营', '相机']);

    expect(findFirstLocator).toHaveBeenCalled();
    expect(page.keyboard.press).toHaveBeenCalledWith('Control+End');
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    expect(page.keyboard.type).toHaveBeenNthCalledWith(1, '露营', { delay: 60 });
    expect(page.keyboard.type).toHaveBeenNthCalledWith(2, '相机', { delay: 60 });
    expect(clickDouyinTopicOption).toHaveBeenNthCalledWith(1, page, editor, '露营');
    expect(clickDouyinTopicOption).toHaveBeenNthCalledWith(2, page, editor, '相机');
    expect(finalizeDouyinTagInput).toHaveBeenCalledTimes(2);
    expect(humanClick).toHaveBeenCalledWith(editor);
    expect(humanClick).toHaveBeenCalledWith(topicButton);
  });

  it('clicks the first visible Douyin topic candidate by default', async () => {
    const hiddenCandidate = {
      textContent: jest.fn().mockResolvedValue('隐藏候选'),
      isVisible: jest.fn().mockResolvedValue(false),
      locator: jest.fn(),
    };
    const firstVisibleCandidate = {
      textContent: jest.fn().mockResolvedValue('平台推荐标签'),
      isVisible: jest.fn().mockResolvedValue(true),
      locator: jest.fn(),
    };
    const locator = {
      count: jest.fn().mockResolvedValue(2),
      nth: jest.fn((index: number) => (index === 0 ? hiddenCandidate : firstVisibleCandidate)),
    };
    const page = {
      locator: jest.fn().mockReturnValue(locator),
      keyboard: {
        press: jest.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };
    const editor = {};

    const humanClick = jest.spyOn(service as never, 'humanClick').mockResolvedValue(undefined);
    jest.spyOn(service as never, 'hasAppliedDouyinTopic').mockResolvedValue(true);

    const result = await (service as never)['clickDouyinTopicOption'](page, editor, '露营');

    expect(result).toBe(true);
    expect(humanClick).toHaveBeenCalledWith(firstVisibleCandidate);
  });
  it('uses Kuaishou fast humanized typing when filling the image post editor', async () => {
    const editor = {};
    const page = {};

    jest.spyOn(service as never, 'findFirstLocator').mockResolvedValue(editor);
    const humanTypeFast = jest
      .spyOn(service as never, 'humanTypeFast')
      .mockResolvedValue(undefined);

    await (service as never)['fillEditor'](
      page,
      ['div[contenteditable="true"]'],
      '濮濓絾鏋僜n#闂囪尪鎯€',
      { humanizedMode: 'kuaishou-fast' },
    );

    expect(humanTypeFast).toHaveBeenCalledWith(editor, '濮濓絾鏋僜n#闂囪尪鎯€', {
      clearExisting: true,
    });
  });

  it('uses Kuaishou fast humanized clicking for the publish button', async () => {
    const publishButton = {};
    const page = {
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service as never, 'findAndHighlightFirst').mockResolvedValue(publishButton);
    const humanClickFast = jest
      .spyOn(service as never, 'humanClickFast')
      .mockResolvedValue(undefined);
    jest.spyOn(service as never, 'waitForActionFinished').mockResolvedValue(undefined);

    await (service as never)['clickKuaishouPublish'](page);

    expect(page.waitForTimeout).toHaveBeenCalledWith(320);
    expect(humanClickFast).toHaveBeenCalledWith(publishButton);
  });

  it('uploads through the native file chooser when the Kuaishou upload button opens one', async () => {
    const chooser = {
      setFiles: jest.fn().mockResolvedValue(undefined),
    };
    const trigger = {};
    const page = {
      waitForEvent: jest.fn().mockResolvedValue(chooser),
    };

    jest.spyOn(service as never, 'humanClickFast').mockResolvedValue(undefined);
    jest.spyOn(service as never, 'humanPauseFast').mockResolvedValue(undefined);

    const result = await (service as never)['tryUploadWithFileChooser'](page, trigger, [
      'D:/tmp/test.mp4',
    ]);

    expect(result).toBe(true);
    expect(page.waitForEvent).toHaveBeenCalledWith('filechooser', { timeout: 2500 });
    expect(chooser.setFiles).toHaveBeenCalledWith(['D:/tmp/test.mp4']);
  });
});

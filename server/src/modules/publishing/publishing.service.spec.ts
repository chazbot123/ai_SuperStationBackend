import {
  LeadContentStatus,
  LeadPublishPlatform,
  LeadPublishStatus,
  PlatformAccountLoginStatus,
  PlatformAccountStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PublishingService } from './publishing.service';

describe('PublishingService draft payloads', () => {
  let service: PublishingService;

  beforeEach(() => {
    service = new PublishingService(
      {} as never,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('supports Xiaohongshu as an auto-publish platform', () => {
    expect(
      (service as never)['isAutoPublishPlatformSupported'](LeadPublishPlatform.xiaohongshu),
    ).toBe(true);
  });

  it('supports Kuaishou as an auto-publish platform', () => {
    expect(
      (service as never)['isAutoPublishPlatformSupported'](LeadPublishPlatform.kuaishou),
    ).toBe(true);
  });

  it('supports Wechat Channels as an auto-publish platform', () => {
    expect(
      (service as never)['isAutoPublishPlatformSupported'](LeadPublishPlatform.wechat_mp),
    ).toBe(true);
  });

  it('builds AiToEarn MCP login url with platform query', async () => {
    service = new PublishingService(
      {} as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'AITOEARN_CONNECT_CHANNEL_URL') {
            return 'https://aitoearn.cn/zh-CN/accounts?role=creator';
          }
          return undefined;
        }),
      } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.startMcpPlatformLogin({ userId: 'u1' } as never, {
      platform: 'douyin',
    });

    expect(result).toMatchObject({
      provider: 'mcp',
      platform: LeadPublishPlatform.douyin,
    });
    expect(result.loginUrl).toContain('aitoearn.cn/zh-CN/accounts');
    expect(result.loginUrl).toContain('role=creator');
    expect(result.loginUrl).toContain('from=ai-superweb');
    expect(result.syncHint).toContain('AiToEarn 官方当前会先进入频道管理');
  });

  it('builds Bilibili official OAuth url with gourl callback', () => {
    service = new PublishingService(
      {} as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            BILIBILI_OPEN_CLIENT_ID: 'bili_client_id',
            BILIBILI_OPEN_CLIENT_SECRET: 'bili_client_secret',
            BILIBILI_OPEN_SCOPE: 'USER_INFO',
            PLATFORM_OAUTH_APP_BASE_URL: 'https://app.example.com',
          };
          return values[key];
        }),
      } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const url = (service as never)['buildOfficialOauthAuthorizeUrl'](
      LeadPublishPlatform.bilibili,
      'state_123',
    );

    expect(url).toContain('https://account.bilibili.com/pc/account-pc/auth/oauth?');
    expect(url).toContain('client_id=bili_client_id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state_123');
    expect(url).toContain(encodeURIComponent('https://app.example.com/api/publishing/platform-accounts/official-oauth/callback?platform=bilibili'));
  });

  it('builds Wechat Official authorize url with pre auth code', () => {
    service = new PublishingService(
      {} as never,
      {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            WECHAT_OPEN_COMPONENT_APP_ID: 'wx_component_appid',
            WECHAT_OPEN_COMPONENT_APP_SECRET: 'wx_component_secret',
            WECHAT_OPEN_AUTH_TYPE: '1',
            WECHAT_OPEN_PRE_AUTH_CODE: 'pre_auth_code_123',
            WECHAT_OPEN_BIZ_APP_ID: 'wx_authorizer_appid',
            PLATFORM_OAUTH_APP_BASE_URL: 'https://app.example.com',
          };
          return values[key];
        }),
      } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const url = (service as never)['buildOfficialOauthAuthorizeUrl'](
      LeadPublishPlatform.wechat_official,
      'state_ignored',
    );

    expect(url).toContain('https://mp.weixin.qq.com/cgi-bin/componentloginpage?');
    expect(url).toContain('component_appid=wx_component_appid');
    expect(url).toContain('pre_auth_code=pre_auth_code_123');
    expect(url).toContain('auth_type=1');
    expect(url).toContain('biz_appid=wx_authorizer_appid');
    expect(url).toContain(
      encodeURIComponent(
        'https://app.example.com/api/publishing/platform-accounts/official-oauth/callback?platform=wechat_official&state=state_ignored',
      ),
    );
  });

  it('removes raw hashtag text from Xiaohongshu draft body and keeps draft tags separate', () => {
    const payload = (service as never)['buildPublishDraftPayload'](
      {
        title: '鏍囬',
        body: '姝ｆ枃鍐呭 #闇茶惀 #鐩告満',
        tags: ['闇茶惀', '鐩告満'],
        images: ['https://example.com/1.jpg'],
        videoUrl: null,
      },
      LeadPublishPlatform.xiaohongshu,
    );

    expect(payload.body).toBe('姝ｆ枃鍐呭');
    expect(payload.tags).toEqual(['闇茶惀', '鐩告満']);
  });

  it('keeps Douyin body plain and unchanged by the Xiaohongshu support change', () => {
    const payload = (service as never)['buildPublishDraftPayload'](
      {
        title: '鏍囬',
        body: '姝ｆ枃鍐呭 #闇茶惀',
        tags: ['闇茶惀'],
        images: [],
        videoUrl: null,
      },
      LeadPublishPlatform.douyin,
    );

    expect(payload.body).toBe('姝ｆ枃鍐呭');
    expect(payload.tags).toEqual(['闇茶惀']);
  });

  it('keeps Kuaishou hashtags in the draft body so the publish form can submit tags inline', () => {
    const payload = (service as never)['buildPublishDraftPayload'](
      {
        title: '鏍囬',
        body: '姝ｆ枃 #闇茶惀',
        tags: ['闇茶惀'],
        images: ['https://example.com/1.jpg'],
        videoUrl: null,
      },
      LeadPublishPlatform.kuaishou,
    );

    expect(payload.body).toBe('姝ｆ枃\n#闇茶惀');
    expect(payload.tags).toEqual(['#闇茶惀']);
  });

  it('appends hashtags for Wechat Channels body and keeps draft tags in hashtag format', () => {
    const payload = (service as never)['buildPublishDraftPayload'](
      {
        title: '鏍囬',
        body: '姝ｆ枃 #闇茶惀 #鐩告満',
        tags: ['#闇茶惀', '鐩告満'],
        images: ['https://example.com/1.jpg'],
        videoUrl: null,
      },
      LeadPublishPlatform.wechat_mp,
    );

    expect(payload.body).toBe('姝ｆ枃\n#闇茶惀 #鐩告満');
    expect(payload.tags).toEqual(['#闇茶惀', '#鐩告満']);
  });

  it('marks the platform account as expired when publish fails because login has expired', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'job-1',
      platform: LeadPublishPlatform.xiaohongshu,
      platformAccountId: 'account-1',
      draftTitle: '鏍囬',
      draftBody: '姝ｆ枃',
      draftTags: ['闇茶惀'],
      draftImages: ['https://example.com/1.jpg'],
      draftVideoUrl: null,
      platformAccount: {
        id: 'account-1',
        platform: LeadPublishPlatform.xiaohongshu,
        accountName: '725947261',
        displayName: 'kobe',
        authPayloadEncrypted: 'encrypted-old',
        browserSessionPath: 'D:/tmp/session',
        status: PlatformAccountStatus.valid,
        loginStatus: PlatformAccountLoginStatus.authenticated,
      },
    });
    const leadPublishJobUpdate = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'job-1',
        status: LeadPublishStatus.failed,
        lastError: '当前平台账号登录已失效，请重新登录后再发布',
      });
    const leadPlatformAccountUpdate = jest.fn().mockResolvedValue(undefined);
    const publish = jest.fn().mockRejectedValue(
      new Error('当前平台账号登录已失效，请重新登录后再发布'),
    );

    service = new PublishingService(
      {
        leadPublishJob: {
          findUnique,
          update: leadPublishJobUpdate,
        },
        leadPlatformAccount: {
          update: leadPlatformAccountUpdate,
        },
      } as never,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {
        publish,
        getSessionPath: jest.fn().mockReturnValue('D:/tmp/session'),
      } as never,
    );

    jest.spyOn(service as never, 'decryptAuthPayload').mockReturnValue('sid=expired_cookie');

    await (service as never)['executeDraftSave']('job-1');

    expect(leadPlatformAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        status: PlatformAccountStatus.invalid,
        loginStatus: PlatformAccountLoginStatus.failed,
        lastError: '当前平台账号登录已失效，请重新登录后再发布',
      },
    });
  });

  it('refreshes the platform account auth payload after publish login recovery succeeds', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'job-1',
      platform: LeadPublishPlatform.xiaohongshu,
      platformAccountId: 'account-1',
      draftTitle: '标题',
      draftBody: '正文',
      draftTags: ['露营'],
      draftImages: ['https://example.com/1.jpg'],
      draftVideoUrl: null,
      platformAccount: {
        id: 'account-1',
        platform: LeadPublishPlatform.xiaohongshu,
        accountName: 'old_account',
        displayName: 'Old Account',
        authPayloadEncrypted: 'encrypted-old',
        browserSessionPath: 'D:/tmp/session',
        status: PlatformAccountStatus.valid,
        loginStatus: PlatformAccountLoginStatus.authenticated,
      },
    });
    const leadPublishJobUpdate = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'job-1',
        status: LeadPublishStatus.success,
        draftUrl: 'https://creator.xiaohongshu.com/publish/success',
      });
    const leadPlatformAccountUpdate = jest.fn().mockResolvedValue(undefined);
    const publish = jest.fn().mockResolvedValue({
      draftUrl: 'https://creator.xiaohongshu.com/publish/success',
      authPayload: 'sid=fresh_cookie',
      accountName: 'fresh_account',
      displayName: 'Fresh Account',
    });

    service = new PublishingService(
      {
        leadPublishJob: {
          findUnique,
          update: leadPublishJobUpdate,
        },
        leadPlatformAccount: {
          update: leadPlatformAccountUpdate,
        },
      } as never,
      { get: jest.fn().mockReturnValue('unit-test-secret') } as unknown as ConfigService,
      {} as never,
      {} as never,
      {
        publish,
        getSessionPath: jest.fn().mockReturnValue('D:/tmp/session'),
      } as never,
    );

    jest.spyOn(service as never, 'decryptAuthPayload').mockReturnValue('sid=old_cookie');

    await (service as never)['executeDraftSave']('job-1');

    expect(leadPlatformAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: expect.objectContaining({
        accountName: 'fresh_account',
        displayName: 'Fresh Account',
        status: PlatformAccountStatus.valid,
        loginStatus: PlatformAccountLoginStatus.authenticated,
        lastError: null,
      }),
    });
  });

  it('lists platform accounts without auto-completing pending sessions by default', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'account-1',
        creatorId: 'user-1',
        creator: { displayName: 'Demo User' },
        platform: LeadPublishPlatform.douyin,
        authType: 'cookie',
        accountName: 'demo_account',
        displayName: 'Demo Account',
        authPayloadPreview: 'demo***',
        loginStatus: PlatformAccountLoginStatus.pending,
        loginUrl: null,
        status: PlatformAccountStatus.saved,
        remark: null,
        lastLoginStartedAt: null,
        lastLoginCompletedAt: null,
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);

    service = new PublishingService(
      {
        leadPlatformAccount: {
          findMany,
          count,
        },
      } as never,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const tryAutoCompleteSpy = jest
      .spyOn(service as never, 'tryAutoCompletePlatformLogin')
      .mockResolvedValue(undefined as never);

    const result = await service.listPlatformAccounts({ userId: 'user-1', role: 'employee' } as never, {
      page: 1,
      limit: 20,
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    expect(count).toHaveBeenCalled();
    expect(tryAutoCompleteSpy).not.toHaveBeenCalled();
    expect(result.pagination.limit).toBe(20);
  });

  it('restores authenticated status when platform account validation passes', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'account-1',
      creatorId: 'user-1',
      creator: { displayName: 'Demo User' },
      platform: LeadPublishPlatform.kuaishou,
      authType: 'cookie',
      accountName: 'chaz',
      displayName: 'chaz',
      authPayloadEncrypted: 'encrypted-value',
      authPayloadPreview: 'did=***1234',
      loginStatus: PlatformAccountLoginStatus.failed,
      loginUrl: 'https://cp.kuaishou.com/profile',
      status: PlatformAccountStatus.invalid,
      remark: null,
      lastLoginStartedAt: null,
      lastLoginCompletedAt: null,
      lastValidatedAt: null,
      lastError: '当前平台账号登录已失效，请重新登录后再发布',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    });
    const update = jest.fn().mockResolvedValue({
      id: 'account-1',
      creatorId: 'user-1',
      creator: { displayName: 'Demo User' },
      platform: LeadPublishPlatform.kuaishou,
      authType: 'cookie',
      accountName: 'chaz',
      displayName: 'chaz',
      authPayloadPreview: 'did=***1234',
      loginStatus: PlatformAccountLoginStatus.authenticated,
      loginUrl: 'https://cp.kuaishou.com/profile',
      status: PlatformAccountStatus.valid,
      remark: null,
      lastLoginStartedAt: null,
      lastLoginCompletedAt: null,
      lastValidatedAt: new Date('2026-04-30T00:00:00.000Z'),
      lastError: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    });
    const collectLoginResult = jest.fn().mockResolvedValue({
      authPayload: 'did=1234567890; token=abcdef',
      accountName: 'chaz',
      displayName: 'chaz',
    });

    service = new PublishingService(
      {
        leadPlatformAccount: {
          findUnique,
          update,
        },
      } as never,
      { get: jest.fn().mockReturnValue('unit-test-secret') } as unknown as ConfigService,
      {} as never,
      {} as never,
      {
        collectLoginResult,
        getSessionPath: jest.fn().mockReturnValue('D:/tmp/session'),
      } as never,
    );

    jest.spyOn(service as never, 'decryptAuthPayload').mockReturnValue('did=1234567890; token=abcdef');

    await service.validatePlatformAccount({ userId: 'user-1', role: 'employee' } as never, 'account-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: expect.objectContaining({
        status: PlatformAccountStatus.valid,
        loginStatus: PlatformAccountLoginStatus.authenticated,
        lastError: null,
      }),
      include: expect.anything(),
    });
  });

  it('paginates publish jobs', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'job-1',
        leadContentId: 'content-1',
        createdById: 'user-1',
        platform: LeadPublishPlatform.douyin,
        platformAccountId: 'account-1',
        publishMode: 'draft_box',
        status: LeadPublishStatus.success,
        draftTitle: 'title',
        draftBody: 'body',
        draftTags: [],
        draftImages: [],
        draftVideoUrl: null,
        draftUrl: null,
        draftedAt: null,
        lastError: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        leadContent: {
          id: 'content-1',
          title: 'Lead title',
          creatorId: 'user-1',
        },
        platformAccount: {
          id: 'account-1',
          platform: LeadPublishPlatform.douyin,
          accountName: 'demo_account',
          displayName: 'Demo Account',
          browserSessionPath: null,
          status: PlatformAccountStatus.valid,
          loginStatus: PlatformAccountLoginStatus.authenticated,
        },
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);

    service = new PublishingService(
      {
        leadPublishJob: {
          findMany,
          count,
        },
      } as never,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listJobs({ userId: 'user-1', role: 'employee' } as never, {
      page: 1,
      limit: 20,
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    expect(result.pagination.limit).toBe(20);
    expect(result.pagination.total).toBe(1);
  });

  it('lists lead contents without embedding publishJobs by default', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'content-1',
        creatorId: 'user-1',
        sourceType: 'manual',
        sourceId: null,
        title: 'Lead title',
        body: 'Lead body',
        tags: ['tag-1'],
        contentType: 'image_text',
        platformStyle: LeadPublishPlatform.douyin,
        coverImage: null,
        images: [],
        videoUrl: null,
        status: LeadContentStatus.active,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        creator: {
          id: 'user-1',
          username: 'demo',
          displayName: 'Demo User',
          role: 'employee',
        },
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);

    service = new PublishingService(
      {
        leadContent: {
          findMany,
          count,
        },
      } as never,
      { get: jest.fn() } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listContents({ userId: 'user-1', role: 'employee' } as never, {
      page: 1,
      limit: 20,
      status: 'active',
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    expect(result.pagination.limit).toBe(20);
    expect(result.items[0].publishJobs).toBeUndefined();
  });
});

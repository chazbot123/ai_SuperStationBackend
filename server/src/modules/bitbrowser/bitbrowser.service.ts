import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BitBrowserBindingRepository,
  BitBrowserRuntimeProvider,
  PreparedBitBrowserRuntime,
} from './bitbrowser.contracts';
import type {
  AcquireProfileLockInput,
  BindBitBrowserProfileInput,
  BitBrowserBrowserCreatePayload,
  CreateBitBrowserProfileInput,
  CreateBusinessOwnerInput,
  OwnerRuntimeContext,
  PlatformType,
  PrepareOwnerRuntimeInput,
  RegisterPlatformAccountInput,
  ReleaseProfileLockInput,
} from './bitbrowser.types';

export class BitBrowserOwnershipError extends Error {}

export class BitBrowserLockConflictError extends Error {}

async function reportDouyinLoginDebug(
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>,
) {
  let url = 'http://127.0.0.1:7777/event';
  let sessionId = 'douyin-login-page';
  try {
    const envText = readFileSync(
      resolve(process.cwd(), '..', '.dbg', 'douyin-login-page.env'),
      'utf8',
    );
    url = envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() ?? url;
    sessionId =
      envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() ?? sessionId;
  } catch {}

  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}

export class BitBrowserProfileService {
  constructor(
    private readonly repository: BitBrowserBindingRepository,
    private readonly runtimeProvider: BitBrowserRuntimeProvider,
  ) {}

  async createOwner(input: CreateBusinessOwnerInput) {
    return this.repository.createOwner(input);
  }

  async bindProfile(input: BindBitBrowserProfileInput) {
    await this.assertOwnerExists(input.creatorId, input.ownerId);
    return this.repository.bindProfile(input);
  }

  async registerPlatformAccount(input: RegisterPlatformAccountInput) {
    await this.assertOwnerExists(input.creatorId, input.ownerId);

    const profileBinding = await this.findProfileBindingById(
      input.creatorId,
      input.profileBindingId,
    );
    if (!profileBinding) {
      throw new BitBrowserOwnershipError(
        `业务主体 ${input.ownerId} 尚未绑定平台账号 ${input.accountId || input.accountName} 的 BitBrowser Profile`,
      );
    }

    if (
      profileBinding.ownerId !== input.ownerId ||
      profileBinding.platform !== input.platform ||
      profileBinding.bindingMode !== 'dedicated_by_account'
    ) {
      throw new BitBrowserOwnershipError(
        `平台账号绑定的 Profile ${input.profileBindingId} 不属于业务主体 ${input.ownerId}`,
      );
    }

    return this.repository.registerPlatformAccount(input);
  }

  async prepareOwnerRuntime(
    input: PrepareOwnerRuntimeInput,
  ): Promise<PreparedBitBrowserRuntime> {
    return this.prepareOwnerRuntimeWithRecovery(input, true);
  }

  private async prepareOwnerRuntimeWithRecovery(
    input: PrepareOwnerRuntimeInput,
    canRecreateMissingProfile: boolean,
  ): Promise<PreparedBitBrowserRuntime> {
    const context = await this.buildRuntimeContext(input);
    try {
      const runtime = await this.runtimeProvider.openProfile(context.profileBinding);

      await this.repository.touchProfileBinding(
        input.creatorId,
        context.profileBinding.id,
        new Date().toISOString(),
      );

      return { runtime, context };
    } catch (error) {
      await this.repository.releaseProfileLock({
        creatorId: input.creatorId,
        taskId: input.taskId,
      });
      if (canRecreateMissingProfile && this.isMissingProfileError(error)) {
        const rebuiltProfile = await this.runtimeProvider.createProfile(
          {
            creatorId: input.creatorId,
            ownerId: context.owner.id,
            profileName: context.profileBinding.profileName,
            proxyConfig: context.profileBinding.proxyConfig,
            browserConfig: context.profileBinding.browserConfig ?? undefined,
          },
          this.buildBrowserCreatePayload(context.owner.name, {
            creatorId: input.creatorId,
            ownerId: context.owner.id,
            profileName: context.profileBinding.profileName,
            proxyConfig: context.profileBinding.proxyConfig,
            browserConfig: context.profileBinding.browserConfig ?? undefined,
          }),
        );
        await this.repository.bindProfile({
          creatorId: input.creatorId,
          ownerId: context.owner.id,
          platform: context.profileBinding.platform,
          accountId: context.profileBinding.accountId,
          accountName: context.profileBinding.accountName,
          profileId: rebuiltProfile.profileId,
          profileName: rebuiltProfile.profileName,
          proxyConfig: context.profileBinding.proxyConfig,
          browserConfig: rebuiltProfile.browserConfig,
        });
        // #region debug-point B:missing-profile-rebuilt
        fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"douyin-login-no-reaction",runId:"post-fix",hypothesisId:"B",location:"server/src/modules/bitbrowser/bitbrowser.service.ts:prepareOwnerRuntime:missing-profile-rebuilt",msg:"[DEBUG] missing profile rebuilt",data:{oldProfileId:context.profileBinding.profileId,newProfileId:rebuiltProfile.profileId,ownerId:context.owner.id,taskId:input.taskId},ts:Date.now()})}).catch(()=>undefined);
        // #endregion
        return this.prepareOwnerRuntimeWithRecovery(input, false);
      }
      // #region debug-point B:prepare-runtime-failed-lock-released
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"douyin-login-no-reaction",runId:"post-fix",hypothesisId:"B",location:"server/src/modules/bitbrowser/bitbrowser.service.ts:prepareOwnerRuntime:lock-released-on-error",msg:"[DEBUG] runtime prepare failed and lock released",data:{profileBindingId:context.profileBinding.id,profileId:context.profileBinding.profileId,taskId:input.taskId,error:error instanceof Error ? error.message : String(error)},ts:Date.now()})}).catch(()=>undefined);
      // #endregion
      throw error;
    }
  }

  async releaseOwnerRuntime(input: ReleaseProfileLockInput) {
    await this.repository.releaseProfileLock(input);
  }

  async listOwnerAccounts(creatorId: string, ownerId: string) {
    await this.assertOwnerExists(creatorId, ownerId);
    return this.repository.listPlatformAccountsByOwner(creatorId, ownerId);
  }

  private async buildRuntimeContext(
    input: PrepareOwnerRuntimeInput,
  ): Promise<OwnerRuntimeContext> {
    const owner = await this.assertOwnerExists(input.creatorId, input.ownerId);
    if (!input.platformAccountId?.trim()) {
      throw new BitBrowserOwnershipError('BitBrowser runtime 必须绑定具体平台账号');
    }
    const platformAccount =
      (await this.repository.listPlatformAccountsByOwner(
        input.creatorId,
        input.ownerId,
      )).find(
        (item) =>
          item.platform === input.platform &&
          (item.id === input.platformAccountId ||
            item.accountId === input.platformAccountId),
      ) ?? null;
    if (!platformAccount) {
      throw new BitBrowserOwnershipError(
        `业务主体 ${input.ownerId} 未找到平台账号 ${input.platformAccountId}`,
      );
    }

    const platformAccountKey =
      (platformAccount.accountId || '').trim() ||
      (input.platformAccountId || '').trim() ||
      platformAccount.id;
    const profileBinding = await this.repository.getProfileBindingByPlatformAccount(
      input.creatorId,
      input.ownerId,
      input.platform,
      platformAccountKey,
      platformAccount.accountName,
    );
    if (!profileBinding) {
      throw new BitBrowserOwnershipError(
        `平台账号 ${input.platformAccountId} 未绑定 BitBrowser Profile`,
      );
    }

    const lock = await this.acquireExclusiveProfileLock({
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      profileBindingId: profileBinding.id,
      taskId: input.taskId,
      reason: input.reason,
      expiresAt: input.expiresAt,
    });

    return {
      owner,
      profileBinding,
      platformAccount,
      lock,
    };
  }

  private async acquireExclusiveProfileLock(input: AcquireProfileLockInput) {
    const resolvedProfileBinding = input.profileBindingId
      ? await this.findProfileBindingById(input.creatorId, input.profileBindingId)
      : null;
    if (!resolvedProfileBinding) {
      throw new BitBrowserOwnershipError(
        `业务主体 ${input.ownerId} 未找到可用的平台账号专属 BitBrowser Profile`,
      );
    }

    let activeLock = await this.repository.getProfileLock(resolvedProfileBinding.id);
    if (activeLock) {
      const expiresAt = Date.parse(activeLock.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        await this.repository.releaseProfileLock({
          creatorId: input.creatorId,
          taskId: activeLock.lockedByTaskId,
        });
        // #region debug-point B:expired-lock-released
        fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"douyin-login-no-reaction",runId:"post-fix",hypothesisId:"B",location:"server/src/modules/bitbrowser/bitbrowser.service.ts:acquireExclusiveProfileLock:expired-lock-released",msg:"[DEBUG] expired profile lock released",data:{profileBindingId:resolvedProfileBinding.id,profileId:resolvedProfileBinding.profileId,lockedByTaskId:activeLock.lockedByTaskId,expiredAt:activeLock.expiresAt},ts:Date.now()})}).catch(()=>undefined);
        // #endregion
        activeLock = null;
      }
    }
    if (activeLock && activeLock.lockedByTaskId !== input.taskId) {
      throw new BitBrowserLockConflictError(
        `Profile ${resolvedProfileBinding.profileId} 当前正被任务 ${activeLock.lockedByTaskId} 占用`,
      );
    }

    return this.repository.acquireProfileLock({
      ...input,
      profileBindingId: resolvedProfileBinding.id,
    });
  }

  private async findProfileBindingById(creatorId: string, profileBindingId: string) {
    return this.repository.getProfileBindingById(creatorId, profileBindingId);
  }

  private async assertOwnerExists(creatorId: string, ownerId: string) {
    const owner = await this.repository.getOwnerById(creatorId, ownerId);
    if (!owner) {
      throw new BitBrowserOwnershipError(`业务主体 ${ownerId} 不存在`);
    }
    return owner;
  }

  private isMissingProfileError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('BitBrowser profile') && message.includes('不存在');
  }

  private buildBrowserCreatePayload(
    ownerName: string,
    input: CreateBitBrowserProfileInput,
  ): BitBrowserBrowserCreatePayload {
    const basePayload = input.browserConfig ?? {};

    return {
      proxyMethod: 2,
      proxyType: 'noproxy',
      syncExtensions: true,
      syncUserExtensions: true,
      browserFingerPrint: {
        coreProduct: 'chrome',
        coreVersion: '130',
        ostype: 'PC',
        os: 'Win32',
        osVersion: '11,10',
        ...(basePayload.browserFingerPrint ?? {}),
      },
      ...basePayload,
      name: input.profileName || basePayload.name || `${ownerName} 账号环境`,
    };
  }
}

export function buildProfileTaskId(ownerId: string, platform: PlatformType) {
  return `bitbrowser-profile:${ownerId}:${platform}:${Date.now()}`;
}

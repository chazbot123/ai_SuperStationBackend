import type {
  BitBrowserBindingRepository,
  BitBrowserRuntimeProvider,
} from './bitbrowser.contracts';
import type {
  AcquireProfileLockInput,
  BindBitBrowserProfileInput,
  BitBrowserBrowserCreatePayload,
  BitBrowserCreateProfileResult,
  CreateBitBrowserProfileInput,
  BitBrowserOpenProfileResult,
  BrowserProfileBinding,
  BusinessOwner,
  CreateRuntimeCommandInput,
  CreateRuntimeSessionInput,
  CreateBusinessOwnerInput,
  PlatformAccountBinding,
  ProfileRuntimeLock,
  RegisterExtensionHandshakeInput,
  RegisterPlatformAccountInput,
  ReleaseProfileLockInput,
  PlatformType,
  RuntimeCommand,
  RuntimeSession,
  UpdateRuntimeCommandStatusInput,
  UpdateRuntimeSessionStatusInput,
} from './bitbrowser.types';
import {
  BITBROWSER_PROVIDER,
  PROFILE_BINDING_MODE_DEDICATED_BY_ACCOUNT,
} from './bitbrowser.types';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAccountKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function isSameAccountBinding(
  item: {
    platform: PlatformType | null;
    accountId: string | null;
    accountName: string | null;
  },
  target: {
    platform: PlatformType;
    accountId?: string | null;
    accountName?: string | null;
  },
) {
  if (item.platform !== target.platform) {
    return false;
  }
  const itemAccountId = normalizeAccountKey(item.accountId);
  const targetAccountId = normalizeAccountKey(target.accountId);
  if (itemAccountId && targetAccountId) {
    return itemAccountId === targetAccountId;
  }
  return normalizeAccountKey(item.accountName) === normalizeAccountKey(target.accountName);
}

export class InMemoryBitBrowserBindingRepository
  implements BitBrowserBindingRepository
{
  private readonly owners = new Map<string, BusinessOwner>();
  private readonly profileBindings = new Map<string, BrowserProfileBinding>();
  private readonly platformAccounts = new Map<string, PlatformAccountBinding>();
  private readonly locks = new Map<string, ProfileRuntimeLock>();
  private readonly runtimeSessions = new Map<string, RuntimeSession>();
  private readonly runtimeCommands = new Map<string, RuntimeCommand>();

  async createOwner(input: CreateBusinessOwnerInput): Promise<BusinessOwner> {
    const timestamp = nowIso();
    const owner: BusinessOwner = {
      id: createId('owner'),
      creatorId: input.creatorId,
      name: input.name,
      code: input.code,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.owners.set(owner.id, owner);
    return owner;
  }

  async getOwnerById(creatorId: string, ownerId: string) {
    const owner = this.owners.get(ownerId) ?? null;
    if (!owner || owner.creatorId !== creatorId) {
      return null;
    }
    return owner;
  }

  async listOwners(creatorId: string) {
    return Array.from(this.owners.values()).filter(
      (item) => item.creatorId === creatorId,
    );
  }

  async bindProfile(input: BindBitBrowserProfileInput) {
    const timestamp = nowIso();
    const existing = Array.from(this.profileBindings.values()).find(
      (item) => {
        if (item.creatorId !== input.creatorId || item.ownerId !== input.ownerId) {
          return false;
        }
        if (!input.platform) {
          return !item.platform;
        }
        return isSameAccountBinding(item, {
          platform: input.platform,
          accountId: input.accountId,
          accountName: input.accountName,
        });
      },
    );
    const binding: BrowserProfileBinding = {
      id: existing?.id ?? createId('profile'),
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      platform: input.platform ?? existing?.platform ?? null,
      accountId: input.accountId ?? existing?.accountId ?? null,
      accountName: input.accountName ?? existing?.accountName ?? null,
      provider: BITBROWSER_PROVIDER,
      profileId: input.profileId,
      profileName: input.profileName,
      bindingMode: PROFILE_BINDING_MODE_DEDICATED_BY_ACCOUNT,
      proxyConfig: input.proxyConfig ?? null,
      browserConfig: input.browserConfig ?? existing?.browserConfig ?? null,
      status: 'active',
      lastUsedAt: existing?.lastUsedAt ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.profileBindings.set(binding.id, binding);
    return binding;
  }

  async getProfileBindingByPlatformAccount(
    creatorId: string,
    ownerId: string,
    platform: PlatformType,
    accountId?: string | null,
    accountName?: string | null,
  ) {
    return (
      Array.from(this.profileBindings.values()).find(
        (item) =>
          item.creatorId === creatorId &&
          item.ownerId === ownerId &&
          !!item.platform &&
          isSameAccountBinding(item, { platform, accountId, accountName }),
      ) ?? null
    );
  }

  async touchProfileBinding(
    creatorId: string,
    profileBindingId: string,
    usedAt: string,
  ) {
    const binding = this.profileBindings.get(profileBindingId);
    if (!binding || binding.creatorId !== creatorId) {
      return;
    }
    this.profileBindings.set(profileBindingId, {
      ...binding,
      lastUsedAt: usedAt,
      updatedAt: usedAt,
    });
  }

  async registerPlatformAccount(input: RegisterPlatformAccountInput) {
    const timestamp = nowIso();
    const existing = Array.from(this.platformAccounts.values()).find(
      (item) =>
        item.creatorId === input.creatorId &&
        item.ownerId === input.ownerId &&
        isSameAccountBinding(item, input),
    );
    const account: PlatformAccountBinding = {
      id: existing?.id ?? createId('account'),
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      profileBindingId: input.profileBindingId,
      platform: input.platform,
      accountName: input.accountName,
      accountId: input.accountId ?? null,
      authPayloadRef: input.authPayloadRef ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.platformAccounts.set(account.id, account);
    return account;
  }

  async listPlatformAccountsByOwner(creatorId: string, ownerId: string) {
    return Array.from(this.platformAccounts.values()).filter(
      (item) => item.creatorId === creatorId && item.ownerId === ownerId,
    );
  }

  async acquireProfileLock(input: AcquireProfileLockInput) {
    const profileBinding = input.profileBindingId
      ? this.profileBindings.get(input.profileBindingId) ?? null
      : null;
    if (!profileBinding) {
      throw new Error(`owner ${input.ownerId} has no dedicated profile binding`);
    }
    const lock: ProfileRuntimeLock = {
      profileBindingId: profileBinding.id,
      lockedByTaskId: input.taskId,
      reason: input.reason,
      lockedAt: nowIso(),
      expiresAt: input.expiresAt,
    };
    this.locks.set(profileBinding.id, lock);
    return lock;
  }

  async getProfileLock(profileBindingId: string) {
    return this.locks.get(profileBindingId) ?? null;
  }

  async releaseProfileLock(input: ReleaseProfileLockInput) {
    for (const [profileBindingId, lock] of this.locks.entries()) {
      if (lock.lockedByTaskId === input.taskId) {
        this.locks.delete(profileBindingId);
        break;
      }
    }
  }

  async createRuntimeSession(input: CreateRuntimeSessionInput) {
    const timestamp = nowIso();
    const session: RuntimeSession = {
      id: createId('runtime'),
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      platformAccountId: input.platformAccountId ?? null,
      profileBindingId: input.profileBindingId,
      profileId: input.profileId,
      platform: input.platform,
      taskId: input.taskId,
      reason: input.reason,
      status: 'awaiting_extension',
      debugUrl: input.debugUrl,
      wsEndpoint: input.wsEndpoint ?? null,
      extensionInstanceId: null,
      extensionVersion: null,
      tabId: null,
      pageUrl: null,
      handshakeAt: null,
      lastHeartbeatAt: null,
      expiresAt: input.expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runtimeSessions.set(session.id, session);
    return session;
  }

  async getRuntimeSessionById(runtimeSessionId: string) {
    return this.runtimeSessions.get(runtimeSessionId) ?? null;
  }

  async listRuntimeSessions() {
    return Array.from(this.runtimeSessions.values());
  }

  async listRuntimeSessionsByProfileBindingId(profileBindingId: string) {
    return Array.from(this.runtimeSessions.values()).filter(
      (item) => item.profileBindingId === profileBindingId,
    );
  }

  async registerExtensionHandshake(input: RegisterExtensionHandshakeInput) {
    const session = this.runtimeSessions.get(input.runtimeSessionId);
    if (!session) {
      throw new Error(`runtime session ${input.runtimeSessionId} not found`);
    }

    const timestamp = input.handshakeAt ?? nowIso();
    const updated: RuntimeSession = {
      ...session,
      status: 'ready',
      extensionInstanceId: input.extensionInstanceId,
      extensionVersion: input.extensionVersion ?? null,
      tabId: input.tabId,
      pageUrl: input.pageUrl,
      handshakeAt: timestamp,
      lastHeartbeatAt: timestamp,
      updatedAt: timestamp,
    };
    this.runtimeSessions.set(updated.id, updated);
    return updated;
  }

  async updateRuntimeSessionStatus(input: UpdateRuntimeSessionStatusInput) {
    const session = this.runtimeSessions.get(input.runtimeSessionId);
    if (!session) {
      throw new Error(`runtime session ${input.runtimeSessionId} not found`);
    }

    const updated: RuntimeSession = {
      ...session,
      status: input.status,
      pageUrl: input.pageUrl === undefined ? session.pageUrl : input.pageUrl,
      lastHeartbeatAt: input.heartbeatAt ?? session.lastHeartbeatAt,
      updatedAt: nowIso(),
    };
    this.runtimeSessions.set(updated.id, updated);
    return updated;
  }

  async createRuntimeCommand(input: CreateRuntimeCommandInput) {
    const timestamp = nowIso();
    const command: RuntimeCommand = {
      id: createId('cmd'),
      runtimeSessionId: input.runtimeSessionId,
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      platform: input.platform,
      taskId: input.taskId,
      type: input.type,
      status: 'queued',
      payload: input.payload,
      resultPayload: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runtimeCommands.set(command.id, command);
    return command;
  }

  async listRuntimeCommandsBySessionId(runtimeSessionId: string) {
    return Array.from(this.runtimeCommands.values()).filter(
      (item) => item.runtimeSessionId === runtimeSessionId,
    );
  }

  async updateRuntimeCommandStatus(input: UpdateRuntimeCommandStatusInput) {
    const command = this.runtimeCommands.get(input.runtimeCommandId);
    if (!command) {
      throw new Error(`runtime command ${input.runtimeCommandId} not found`);
    }

    const updated: RuntimeCommand = {
      ...command,
      status: input.status,
      resultPayload:
        input.resultPayload === undefined
          ? command.resultPayload
          : input.resultPayload,
      errorMessage:
        input.errorMessage === undefined
          ? command.errorMessage
          : input.errorMessage,
      updatedAt: nowIso(),
    };
    this.runtimeCommands.set(updated.id, updated);
    return updated;
  }
}

export class StubBitBrowserRuntimeProvider implements BitBrowserRuntimeProvider {
  async createProfile(
    input: CreateBitBrowserProfileInput,
    payload: BitBrowserBrowserCreatePayload,
  ): Promise<BitBrowserCreateProfileResult> {
    return {
      profileId: `stub_profile_${Math.random().toString(36).slice(2, 10)}`,
      profileName: input.profileName,
      browserConfig: payload,
    };
  }

  async openProfile(
    binding: BrowserProfileBinding,
  ): Promise<BitBrowserOpenProfileResult> {
    return {
      profileId: binding.profileId,
      debugUrl: `http://127.0.0.1:54345/profile/${binding.profileId}`,
      wsEndpoint: `ws://127.0.0.1:54345/devtools/browser/${binding.profileId}`,
    };
  }

  async closeProfile(_binding: BrowserProfileBinding): Promise<void> {
    return;
  }

  async openPlatformHome(
    binding: BrowserProfileBinding,
    platform: PlatformType,
    runtime?: BitBrowserOpenProfileResult,
  ): Promise<void> {
    void binding;
    void platform;
    void runtime;
  }
}

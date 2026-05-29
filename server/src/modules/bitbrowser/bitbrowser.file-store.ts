import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  BitBrowserBindingRepository,
} from './bitbrowser.contracts';
import {
  createEmptyBitBrowserStore,
  DEFAULT_BITBROWSER_STORAGE_FILE,
  type BitBrowserStoreSnapshot,
} from './bitbrowser.persistence';
import type {
  AcquireProfileLockInput,
  BindBitBrowserProfileInput,
  BrowserProfileBinding,
  BusinessOwner,
  CreateRuntimeCommandInput,
  CreateRuntimeSessionInput,
  CreateBusinessOwnerInput,
  PlatformAccountBinding,
  PlatformType,
  ProfileRuntimeLock,
  RegisterExtensionHandshakeInput,
  RegisterPlatformAccountInput,
  ReleaseProfileLockInput,
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

function debugCharCodes(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  return Array.from(value)
    .slice(0, 8)
    .map((char) => char.charCodeAt(0));
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

export class FileBitBrowserBindingRepository
  implements BitBrowserBindingRepository
{
  private readonly storageFilePath: string;
  private storeWriteQueue: Promise<void> = Promise.resolve();

  constructor(storageFilePath = resolve(DEFAULT_BITBROWSER_STORAGE_FILE)) {
    this.storageFilePath = storageFilePath;
  }

  async createOwner(input: CreateBusinessOwnerInput): Promise<BusinessOwner> {
    return this.updateStore((store) => {
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
      store.owners.push(owner);
      return owner;
    });
  }

  async getOwnerById(
    creatorId: string,
    ownerId: string,
  ): Promise<BusinessOwner | null> {
    const store = await this.readStore();
    return (
      store.owners.find(
        (item) => item.creatorId === creatorId && item.id === ownerId,
      ) ?? null
    );
  }

  async listOwners(creatorId: string): Promise<BusinessOwner[]> {
    const store = await this.readStore();
    return store.owners.filter((item) => item.creatorId === creatorId);
  }

  async bindProfile(
    input: BindBitBrowserProfileInput,
  ): Promise<BrowserProfileBinding> {
    // #region debug-point D:file-store-bind-profile
    await reportDouyinLoginDebug(
      'D',
      'bitbrowser.file-store:bindProfile:input',
      'bindProfile input received',
      {
        creatorId: input.creatorId,
        ownerId: input.ownerId,
        profileId: input.profileId,
        profileName: input.profileName,
        profileNameCodes: debugCharCodes(input.profileName),
      },
    );
    // #endregion
    return this.updateStore((store) => {
      const timestamp = nowIso();
      const existing = store.profileBindings.find(
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

      store.profileBindings = store.profileBindings.filter(
        (item) => item.id !== binding.id,
      );
      store.profileBindings.push(binding);
      return binding;
    });
  }

  async getProfileBindingByPlatformAccount(
    creatorId: string,
    ownerId: string,
    platform: PlatformType,
    accountId?: string | null,
    accountName?: string | null,
  ): Promise<BrowserProfileBinding | null> {
    const store = await this.readStore();
    return (
      store.profileBindings.find(
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
  ): Promise<void> {
    await this.updateStore((store) => {
      store.profileBindings = store.profileBindings.map((item) =>
        item.id === profileBindingId && item.creatorId === creatorId
          ? { ...item, lastUsedAt: usedAt, updatedAt: usedAt }
          : item,
      );
      return undefined;
    });
  }

  async registerPlatformAccount(
    input: RegisterPlatformAccountInput,
  ): Promise<PlatformAccountBinding> {
    return this.updateStore((store) => {
      const timestamp = nowIso();
      const existing = store.platformAccounts.find(
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

      store.platformAccounts = store.platformAccounts.filter(
        (item) => item.id !== account.id,
      );
      store.platformAccounts.push(account);
      return account;
    });
  }

  async listPlatformAccountsByOwner(
    creatorId: string,
    ownerId: string,
  ): Promise<PlatformAccountBinding[]> {
    const store = await this.readStore();
    return store.platformAccounts.filter(
      (item) => item.creatorId === creatorId && item.ownerId === ownerId,
    );
  }

  async deleteProfileBindingResourcesByProfileId(
    creatorId: string,
    profileId: string,
  ): Promise<void> {
    await this.updateStore((store) => {
      const profileBindingIds = store.profileBindings
        .filter((item) => item.creatorId === creatorId && item.profileId === profileId)
        .map((item) => item.id);
      if (!profileBindingIds.length) {
        return undefined;
      }
      const runtimeSessionIds = store.runtimeSessions
        .filter((item) => profileBindingIds.includes(item.profileBindingId))
        .map((item) => item.id);

      store.runtimeCommands = store.runtimeCommands.filter(
        (item) => !runtimeSessionIds.includes(item.runtimeSessionId),
      );
      store.runtimeSessions = store.runtimeSessions.filter(
        (item) => !runtimeSessionIds.includes(item.id),
      );
      store.locks = store.locks.filter(
        (item) => !profileBindingIds.includes(item.profileBindingId),
      );
      store.platformAccounts = store.platformAccounts.filter(
        (item) => !profileBindingIds.includes(item.profileBindingId),
      );
      store.profileBindings = store.profileBindings.filter(
        (item) => !(item.creatorId === creatorId && profileBindingIds.includes(item.id)),
      );
      return undefined;
    });
  }

  async acquireProfileLock(
    input: AcquireProfileLockInput,
  ): Promise<ProfileRuntimeLock> {
    return this.updateStore((store) => {
      const profileBinding = input.profileBindingId
        ? store.profileBindings.find(
            (item) =>
              item.creatorId === input.creatorId && item.id === input.profileBindingId,
          )
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
      store.locks = store.locks.filter(
        (item) => item.profileBindingId !== profileBinding.id,
      );
      store.locks.push(lock);
      return lock;
    });
  }

  async getProfileLock(
    profileBindingId: string,
  ): Promise<ProfileRuntimeLock | null> {
    const store = await this.readStore();
    return (
      store.locks.find((item) => item.profileBindingId === profileBindingId) ??
      null
    );
  }

  async releaseProfileLock(input: ReleaseProfileLockInput): Promise<void> {
    await this.updateStore((store) => {
      store.locks = store.locks.filter(
        (item) => item.lockedByTaskId !== input.taskId,
      );
      return undefined;
    });
  }

  async createRuntimeSession(
    input: CreateRuntimeSessionInput,
  ): Promise<RuntimeSession> {
    return this.updateStore((store) => {
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
      store.runtimeSessions.push(session);
      return session;
    });
  }

  async getRuntimeSessionById(runtimeSessionId: string): Promise<RuntimeSession | null> {
    const store = await this.readStore();
    return (
      store.runtimeSessions.find((item) => item.id === runtimeSessionId) ?? null
    );
  }

  async listRuntimeSessions(): Promise<RuntimeSession[]> {
    const store = await this.readStore();
    return [...store.runtimeSessions];
  }

  async listRuntimeSessionsByProfileBindingId(
    profileBindingId: string,
  ): Promise<RuntimeSession[]> {
    const store = await this.readStore();
    return store.runtimeSessions.filter(
      (item) => item.profileBindingId === profileBindingId,
    );
  }

  async registerExtensionHandshake(
    input: RegisterExtensionHandshakeInput,
  ): Promise<RuntimeSession> {
    return this.updateStore((store) => {
      const session = store.runtimeSessions.find(
        (item) => item.id === input.runtimeSessionId,
      );
      if (!session) {
        throw new Error(`runtime session ${input.runtimeSessionId} not found`);
      }

      const updated: RuntimeSession = {
        ...session,
        status: 'ready',
        extensionInstanceId: input.extensionInstanceId,
        extensionVersion: input.extensionVersion ?? null,
        tabId: input.tabId,
        pageUrl: input.pageUrl,
        handshakeAt: input.handshakeAt ?? nowIso(),
        lastHeartbeatAt: input.handshakeAt ?? nowIso(),
        updatedAt: nowIso(),
      };
      store.runtimeSessions = store.runtimeSessions.map((item) =>
        item.id === updated.id ? updated : item,
      );
      return updated;
    });
  }

  async updateRuntimeSessionStatus(
    input: UpdateRuntimeSessionStatusInput,
  ): Promise<RuntimeSession> {
    return this.updateStore((store) => {
      const session = store.runtimeSessions.find(
        (item) => item.id === input.runtimeSessionId,
      );
      if (!session) {
        throw new Error(`runtime session ${input.runtimeSessionId} not found`);
      }

      const timestamp = nowIso();
      const updated: RuntimeSession = {
        ...session,
        status: input.status,
        pageUrl:
          input.pageUrl === undefined ? session.pageUrl : input.pageUrl,
        lastHeartbeatAt: input.heartbeatAt ?? session.lastHeartbeatAt,
        updatedAt: timestamp,
      };
      store.runtimeSessions = store.runtimeSessions.map((item) =>
        item.id === updated.id ? updated : item,
      );
      return updated;
    });
  }

  async createRuntimeCommand(
    input: CreateRuntimeCommandInput,
  ): Promise<RuntimeCommand> {
    return this.updateStore((store) => {
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
      store.runtimeCommands.push(command);
      return command;
    });
  }

  async listRuntimeCommandsBySessionId(
    runtimeSessionId: string,
  ): Promise<RuntimeCommand[]> {
    const store = await this.readStore();
    return store.runtimeCommands.filter(
      (item) => item.runtimeSessionId === runtimeSessionId,
    );
  }

  async updateRuntimeCommandStatus(
    input: UpdateRuntimeCommandStatusInput,
  ): Promise<RuntimeCommand> {
    return this.updateStore((store) => {
      const command = store.runtimeCommands.find(
        (item) => item.id === input.runtimeCommandId,
      );
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
      store.runtimeCommands = store.runtimeCommands.map((item) =>
        item.id === updated.id ? updated : item,
      );
      return updated;
    });
  }

  private async readStore(): Promise<BitBrowserStoreSnapshot> {
    await this.ensureStoreFile();
    const raw = await readFile(this.storageFilePath, 'utf8');
    const parsed = this.tryParseStore(raw);
    if (parsed) {
      return parsed;
    }

    const recoveredRaw = this.extractFirstTopLevelJsonObject(raw);
    const recovered = recoveredRaw ? this.tryParseStore(recoveredRaw) : null;
    if (!recovered) {
      throw new Error(`BitBrowser store file is corrupted: ${this.storageFilePath}`);
    }

    await this.writeStore(recovered);
    return recovered;
  }

  private async updateStore<T>(
    updater: (store: BitBrowserStoreSnapshot) => T,
  ): Promise<T> {
    return this.runExclusiveStoreWrite(async () => {
      const store = await this.readStore();
      const result = updater(store);
      await this.writeStore(store);
      return result;
    });
  }

  private async ensureStoreFile() {
    await mkdir(dirname(this.storageFilePath), { recursive: true });
    try {
      await readFile(this.storageFilePath, 'utf8');
    } catch {
      await this.writeStore(createEmptyBitBrowserStore());
    }
  }

  private async writeStore(store: BitBrowserStoreSnapshot) {
    await mkdir(dirname(this.storageFilePath), { recursive: true });
    const tempPath = `${this.storageFilePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
    await rename(tempPath, this.storageFilePath);
  }

  private async runExclusiveStoreWrite<T>(operation: () => Promise<T>): Promise<T> {
    const operationPromise = this.storeWriteQueue.catch(() => undefined).then(operation);
    this.storeWriteQueue = operationPromise.then(() => undefined, () => undefined);
    return operationPromise;
  }

  private tryParseStore(raw: string): BitBrowserStoreSnapshot | null {
    try {
      const parsed = JSON.parse(raw) as Partial<BitBrowserStoreSnapshot>;
      const empty = createEmptyBitBrowserStore();
      return {
        ...empty,
        ...parsed,
        owners: Array.isArray(parsed.owners) ? parsed.owners : empty.owners,
        profileBindings: Array.isArray(parsed.profileBindings)
          ? parsed.profileBindings
          : empty.profileBindings,
        platformAccounts: Array.isArray(parsed.platformAccounts)
          ? parsed.platformAccounts
          : empty.platformAccounts,
        locks: Array.isArray(parsed.locks) ? parsed.locks : empty.locks,
        runtimeSessions: Array.isArray(parsed.runtimeSessions)
          ? parsed.runtimeSessions
          : empty.runtimeSessions,
        runtimeCommands: Array.isArray(parsed.runtimeCommands)
          ? parsed.runtimeCommands
          : empty.runtimeCommands,
      };
    } catch {
      return null;
    }
  }

  private extractFirstTopLevelJsonObject(raw: string): string | null {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;

    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if (!started) {
        if (/\s/.test(char)) {
          continue;
        }
        if (char !== '{') {
          return null;
        }
        started = true;
        depth = 1;
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
        continue;
      }
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(0, index + 1);
        }
      }
    }

    return null;
  }
}

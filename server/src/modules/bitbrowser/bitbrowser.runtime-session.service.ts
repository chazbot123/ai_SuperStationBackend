import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BitBrowserBindingRepository } from './bitbrowser.contracts';
import { BitBrowserProfileService } from './bitbrowser.service';
import type {
  CreateRuntimeCommandInput,
  PlatformType,
  PrepareOwnerRuntimeInput,
  RegisterExtensionHandshakeInput,
  RuntimeCommand,
  RuntimeSession,
  RuntimeSessionStatus,
  UpdateRuntimeCommandStatusInput,
} from './bitbrowser.types';

export class BitBrowserRuntimeSessionError extends Error {}

export class BitBrowserRuntimeSessionNotReadyError extends BitBrowserRuntimeSessionError {}

export interface OpenRuntimeSessionResult {
  session: RuntimeSession;
  context: Awaited<ReturnType<BitBrowserProfileService['prepareOwnerRuntime']>>['context'];
  runtime: Awaited<ReturnType<BitBrowserProfileService['prepareOwnerRuntime']>>['runtime'];
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

export class BitBrowserRuntimeSessionService {
  constructor(
    private readonly repository: BitBrowserBindingRepository,
    private readonly profileService: BitBrowserProfileService,
  ) {}

  async openRuntimeSession(
    input: PrepareOwnerRuntimeInput,
  ): Promise<OpenRuntimeSessionResult> {
    // #region debug-point E:open-runtime-session-input
    await reportDouyinLoginDebug(
      'E',
      'bitbrowser.runtime-session.service:openRuntimeSession:input',
      'openRuntimeSession called',
      {
        creatorId: input.creatorId,
        ownerId: input.ownerId,
        platformAccountId: input.platformAccountId ?? null,
        platform: input.platform,
        reason: input.reason,
        taskId: input.taskId,
      },
    );
    // #endregion
    const prepared = await this.profileService.prepareOwnerRuntime(input);
    const session = await this.repository.createRuntimeSession({
      creatorId: input.creatorId,
      ownerId: input.ownerId,
      platformAccountId: input.platformAccountId ?? null,
      profileBindingId: prepared.context.profileBinding.id,
      profileId: prepared.context.profileBinding.profileId,
      platform: input.platform,
      taskId: input.taskId,
      reason: input.reason,
      debugUrl: prepared.runtime.debugUrl,
      wsEndpoint: prepared.runtime.wsEndpoint ?? null,
      expiresAt: input.expiresAt,
    });

    // #region debug-point B:open-runtime-session-created
    await reportDouyinLoginDebug(
      'B',
      'bitbrowser.runtime-session.service:openRuntimeSession:created',
      'runtime session created',
      {
        runtimeSessionId: session.id,
        profileBindingId: prepared.context.profileBinding.id,
        profileId: prepared.context.profileBinding.profileId,
        profileName: prepared.context.profileBinding.profileName,
        platform: session.platform,
        debugUrl: prepared.runtime.debugUrl,
        wsEndpoint: prepared.runtime.wsEndpoint,
      },
    );
    // #endregion

    return {
      session,
      context: prepared.context,
      runtime: prepared.runtime,
    };
  }

  async registerExtensionReady(input: RegisterExtensionHandshakeInput) {
    // #region debug-point C:extension-ready
    await reportDouyinLoginDebug(
      'C',
      'bitbrowser.runtime-session.service:registerExtensionReady',
      'extension ready received',
      {
        runtimeSessionId: input.runtimeSessionId,
        extensionInstanceId: input.extensionInstanceId,
        tabId: input.tabId,
        pageUrl: input.pageUrl,
        extensionVersion: input.extensionVersion,
      },
    );
    // #endregion
    return this.repository.registerExtensionHandshake(input);
  }

  async markHeartbeat(runtimeSessionId: string, pageUrl?: string | null) {
    return this.repository.updateRuntimeSessionStatus({
      runtimeSessionId,
      status: 'ready',
      pageUrl,
      heartbeatAt: new Date().toISOString(),
    });
  }

  async markSessionStatus(
    runtimeSessionId: string,
    status: RuntimeSessionStatus,
    pageUrl?: string | null,
  ) {
    return this.repository.updateRuntimeSessionStatus({
      runtimeSessionId,
      status,
      pageUrl,
      heartbeatAt:
        status === 'ready' || status === 'running'
          ? new Date().toISOString()
          : undefined,
    });
  }

  async queueCommand(input: CreateRuntimeCommandInput): Promise<RuntimeCommand> {
    const session = await this.assertSessionReady(input.runtimeSessionId);
    return this.repository.createRuntimeCommand({
      ...input,
      platform: session.platform,
      taskId: session.taskId,
      creatorId: session.creatorId,
      ownerId: session.ownerId,
    });
  }

  async dispatchCommand(runtimeCommandId: string) {
    return this.repository.updateRuntimeCommandStatus({
      runtimeCommandId,
      status: 'dispatched',
    });
  }

  async ackCommand(runtimeCommandId: string) {
    return this.repository.updateRuntimeCommandStatus({
      runtimeCommandId,
      status: 'acked',
    });
  }

  async completeCommand(
    runtimeCommandId: string,
    resultPayload?: Record<string, unknown> | null,
  ) {
    return this.repository.updateRuntimeCommandStatus({
      runtimeCommandId,
      status: 'completed',
      resultPayload: resultPayload ?? null,
    });
  }

  async failCommand(runtimeCommandId: string, errorMessage: string) {
    return this.repository.updateRuntimeCommandStatus({
      runtimeCommandId,
      status: 'failed',
      errorMessage,
    });
  }

  async listSessionCommands(runtimeSessionId: string) {
    return this.repository.listRuntimeCommandsBySessionId(runtimeSessionId);
  }

  async getRuntimeSession(runtimeSessionId: string) {
    return this.repository.getRuntimeSessionById(runtimeSessionId);
  }

  async findLatestAwaitingExtensionSession(platform: PlatformType) {
    const normalizedPlatform = String(platform || '').trim().toLowerCase();
    if (!normalizedPlatform) {
      return null;
    }

    const sessions = await this.repository.listRuntimeSessions();
    return (
      sessions
        .filter((item) => {
          if (item.status !== 'awaiting_extension') {
            return false;
          }
          return String(item.platform || '').trim().toLowerCase() === normalizedPlatform;
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    );
  }

  async closeRuntimeSession(runtimeSessionId: string, status: 'completed' | 'failed' | 'closed') {
    const session = await this.repository.getRuntimeSessionById(runtimeSessionId);
    if (!session) {
      throw new BitBrowserRuntimeSessionError(
        `runtime session ${runtimeSessionId} 不存在`,
      );
    }

    const updated = await this.repository.updateRuntimeSessionStatus({
      runtimeSessionId,
      status,
    });

    await this.profileService.releaseOwnerRuntime({
      creatorId: session.creatorId,
      taskId: session.taskId,
    });

    return updated;
  }

  async updateCommandStatus(input: UpdateRuntimeCommandStatusInput) {
    return this.repository.updateRuntimeCommandStatus(input);
  }

  private async assertSessionReady(runtimeSessionId: string) {
    const session = await this.repository.getRuntimeSessionById(runtimeSessionId);
    if (!session) {
      throw new BitBrowserRuntimeSessionError(
        `runtime session ${runtimeSessionId} 不存在`,
      );
    }

    if (!session.extensionInstanceId || session.tabId === null) {
      throw new BitBrowserRuntimeSessionNotReadyError(
        `runtime session ${runtimeSessionId} 尚未完成扩展握手`,
      );
    }

    return session;
  }
}

import { BitBrowserRuntimeSessionNotReadyError, BitBrowserRuntimeSessionService } from './bitbrowser.runtime-session.service';
import type {
  AckRuntimeCommandPayload,
  CompleteRuntimeCommandPayload,
  ExtensionBridgeReadyState,
  ExtensionHeartbeatPayload,
  ExtensionPageReadyBindPayload,
  ExtensionPageReadyBindResult,
  ExtensionReadyPayload,
  FailRuntimeCommandPayload,
  PullRuntimeCommandPayload,
  QueueKeepAliveCollectCommandPayload,
  QueueLoginCommandPayload,
  QueuePublishCommandPayload,
  RuntimeCommandEnvelope,
} from './bitbrowser.extension-bridge.types';

export class BitBrowserExtensionBridgeError extends Error {}

export class BitBrowserExtensionBridgeService {
  constructor(
    private readonly runtimeSessionService: BitBrowserRuntimeSessionService,
  ) {}

  async registerReady(payload: ExtensionReadyPayload): Promise<ExtensionBridgeReadyState> {
    const session = await this.runtimeSessionService.registerExtensionReady({
      runtimeSessionId: payload.runtimeSessionId,
      extensionInstanceId: payload.extensionInstanceId,
      tabId: payload.tabId,
      pageUrl: payload.pageUrl,
      extensionVersion: payload.extensionVersion ?? null,
    });

    return {
      session,
      hasActiveHandshake: Boolean(session.extensionInstanceId && session.tabId !== null),
    };
  }

  async heartbeat(payload: ExtensionHeartbeatPayload): Promise<ExtensionBridgeReadyState> {
    const session = await this.runtimeSessionService.markHeartbeat(
      payload.runtimeSessionId,
      payload.pageUrl,
    );

    return {
      session,
      hasActiveHandshake: Boolean(session.extensionInstanceId && session.tabId !== null),
    };
  }

  async bindRuntimeByPageReady(
    payload: ExtensionPageReadyBindPayload,
  ): Promise<ExtensionPageReadyBindResult> {
    const session = await this.runtimeSessionService.findLatestAwaitingExtensionSession(
      payload.platform,
    );
    if (!session) {
      throw new BitBrowserExtensionBridgeError(
        `未找到可绑定的 runtime，会话平台=${payload.platform}`,
      );
    }

    const extensionInstanceId =
      String(payload.extensionInstanceId || '').trim() ||
      `page-ready-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const readySession = await this.runtimeSessionService.registerExtensionReady({
      runtimeSessionId: session.id,
      extensionInstanceId,
      tabId: payload.tabId,
      pageUrl: payload.pageUrl,
      extensionVersion: payload.extensionVersion ?? null,
    });

    return {
      runtimeSessionId: readySession.id,
      matchedBy: 'page_ready_latest',
      session: readySession,
      hasActiveHandshake: Boolean(
        readySession.extensionInstanceId && readySession.tabId !== null,
      ),
    };
  }

  async queueLoginPrepare(payload: QueueLoginCommandPayload) {
    return this.runtimeSessionService.queueCommand({
      runtimeSessionId: payload.runtimeSessionId,
      creatorId: '',
      ownerId: '',
      platform: '',
      taskId: '',
      type: 'LOGIN_PREPARE',
      payload: payload.payload ?? {},
    });
  }

  async queueLoginExecute(payload: QueueLoginCommandPayload) {
    return this.runtimeSessionService.queueCommand({
      runtimeSessionId: payload.runtimeSessionId,
      creatorId: '',
      ownerId: '',
      platform: '',
      taskId: '',
      type: 'LOGIN_EXECUTE',
      payload: payload.payload ?? {},
    });
  }

  async queuePublishCommand(payload: QueuePublishCommandPayload) {
    return this.runtimeSessionService.queueCommand({
      runtimeSessionId: payload.runtimeSessionId,
      creatorId: '',
      ownerId: '',
      platform: '',
      taskId: '',
      type: payload.type ?? 'PUBLISH_EXECUTE',
      payload: payload.payload,
    });
  }

  async queueKeepAliveCollect(payload: QueueKeepAliveCollectCommandPayload) {
    return this.runtimeSessionService.queueCommand({
      runtimeSessionId: payload.runtimeSessionId,
      creatorId: '',
      ownerId: '',
      platform: '',
      taskId: '',
      type: payload.type ?? 'KEEPALIVE_COLLECT',
      payload: payload.payload ?? {},
    });
  }

  async pullNextCommand(
    payload: PullRuntimeCommandPayload,
  ): Promise<RuntimeCommandEnvelope | null> {
    const session = await this.runtimeSessionService.getRuntimeSession(
      payload.runtimeSessionId,
    );
    if (!session) {
      throw new BitBrowserExtensionBridgeError(
        `runtime session ${payload.runtimeSessionId} 不存在`,
      );
    }

    const commands = await this.runtimeSessionService.listSessionCommands(
      payload.runtimeSessionId,
    );
    const nextCommand = commands
      .filter((item) => item.status === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!nextCommand) {
      return null;
    }

    try {
      await this.runtimeSessionService.markSessionStatus(
        payload.runtimeSessionId,
        'running',
      );
      const dispatched = await this.runtimeSessionService.dispatchCommand(nextCommand.id);
      return {
        runtimeSessionId: payload.runtimeSessionId,
        command: dispatched,
      };
    } catch (error) {
      if (error instanceof BitBrowserRuntimeSessionNotReadyError) {
        throw new BitBrowserExtensionBridgeError(error.message);
      }
      throw error;
    }
  }

  async ackCommand(payload: AckRuntimeCommandPayload) {
    await this.assertCommandBelongsToSession(
      payload.runtimeSessionId,
      payload.runtimeCommandId,
    );
    return this.runtimeSessionService.ackCommand(payload.runtimeCommandId);
  }

  async completeCommand(payload: CompleteRuntimeCommandPayload) {
    await this.assertCommandBelongsToSession(
      payload.runtimeSessionId,
      payload.runtimeCommandId,
    );
    const command = await this.runtimeSessionService.completeCommand(
      payload.runtimeCommandId,
      payload.resultPayload ?? null,
    );
    await this.runtimeSessionService.markSessionStatus(
      payload.runtimeSessionId,
      'ready',
    );
    return command;
  }

  async failCommand(payload: FailRuntimeCommandPayload) {
    await this.assertCommandBelongsToSession(
      payload.runtimeSessionId,
      payload.runtimeCommandId,
    );
    const command = await this.runtimeSessionService.failCommand(
      payload.runtimeCommandId,
      payload.errorMessage,
    );
    await this.runtimeSessionService.markSessionStatus(
      payload.runtimeSessionId,
      'failed',
    );
    return command;
  }

  private async assertCommandBelongsToSession(
    runtimeSessionId: string,
    runtimeCommandId: string,
  ) {
    const commands = await this.runtimeSessionService.listSessionCommands(
      runtimeSessionId,
    );
    const command = commands.find((item) => item.id === runtimeCommandId);
    if (!command) {
      throw new BitBrowserExtensionBridgeError(
        `runtime command ${runtimeCommandId} 不属于会话 ${runtimeSessionId}`,
      );
    }

    return command;
  }
}

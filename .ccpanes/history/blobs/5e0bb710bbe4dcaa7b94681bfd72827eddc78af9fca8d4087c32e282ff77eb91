import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BitBrowserRuntimeFacade } from './bitbrowser.bootstrap';
import type {
  AckRuntimeCommandPayload,
  CompleteRuntimeCommandPayload,
  ExtensionHeartbeatPayload,
  ExtensionPageReadyBindPayload,
  ExtensionReadyPayload,
  FailRuntimeCommandPayload,
  PullRuntimeCommandPayload,
  QueueLoginCommandPayload,
  QueuePublishCommandPayload,
} from './bitbrowser.extension-bridge.types';
import type {
  BitBrowserHttpErrorResponse,
  BitBrowserHttpRequest,
  BitBrowserHttpResponse,
  BitBrowserHttpSuccessResponse,
} from './bitbrowser.http-api.types';
import type {
  CreateBusinessOwnerInput,
  PrepareOwnerRuntimeInput,
  RegisterPlatformAccountInput,
  ReleaseProfileLockInput,
} from './bitbrowser.types';

type ResponseBody<T = unknown> =
  | BitBrowserHttpSuccessResponse<T>
  | BitBrowserHttpErrorResponse;

export class BitBrowserHttpController {
  constructor(private readonly facade: BitBrowserRuntimeFacade) {}

  async createOwner(
    request: BitBrowserHttpRequest<CreateBusinessOwnerInput>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const owner = await this.facade.service.createOwner(this.requireBody(request));
    return this.ok(owner, 201);
  }

  async registerPlatformAccount(
    request: BitBrowserHttpRequest<RegisterPlatformAccountInput>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const account = await this.facade.service.registerPlatformAccount(
      this.requireBody(request),
    );
    return this.ok(account, 201);
  }

  async openRuntimeSession(
    request: BitBrowserHttpRequest<PrepareOwnerRuntimeInput>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const opened = await this.facade.runtimeSessionService.openRuntimeSession(
      this.requireBody(request),
    );
    return this.ok(opened, 201);
  }

  async closeRuntimeSession(
    request: BitBrowserHttpRequest<
      ReleaseProfileLockInput & {
        runtimeSessionId: string;
        status?: 'completed' | 'failed' | 'closed';
      }
    >,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const body = this.requireBody(request);
    const result = await this.facade.runtimeSessionService.closeRuntimeSession(
      body.runtimeSessionId,
      body.status ?? 'closed',
    );
    return this.ok(result);
  }

  async registerExtensionReady(
    request: BitBrowserHttpRequest<ExtensionReadyPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.registerReady(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async pageReadyBind(
    request: BitBrowserHttpRequest<ExtensionPageReadyBindPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.bindRuntimeByPageReady(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async heartbeat(
    request: BitBrowserHttpRequest<ExtensionHeartbeatPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.heartbeat(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async queueLoginPrepare(
    request: BitBrowserHttpRequest<QueueLoginCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.queueLoginPrepare(
      this.requireBody(request),
    );
    return this.ok(result, 201);
  }

  async queueLoginExecute(
    request: BitBrowserHttpRequest<QueueLoginCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.queueLoginExecute(
      this.requireBody(request),
    );
    return this.ok(result, 201);
  }

  async queuePublishCommand(
    request: BitBrowserHttpRequest<QueuePublishCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.queuePublishCommand(
      this.requireBody(request),
    );
    return this.ok(result, 201);
  }

  async pullNextCommand(
    request: BitBrowserHttpRequest<PullRuntimeCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.pullNextCommand(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async ackCommand(
    request: BitBrowserHttpRequest<AckRuntimeCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.ackCommand(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async completeCommand(
    request: BitBrowserHttpRequest<CompleteRuntimeCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.completeCommand(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async failCommand(
    request: BitBrowserHttpRequest<FailRuntimeCommandPayload>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const result = await this.facade.extensionBridgeService.failCommand(
      this.requireBody(request),
    );
    return this.ok(result);
  }

  async writeDebugEvent(
    request: BitBrowserHttpRequest<Record<string, unknown>>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const body = this.requireBody(request);
    const payload = {
      sessionId: String(body.sessionId || 'douyin-handshake-fail'),
      runId: String(body.runId || 'pre-fix'),
      hypothesisId: String(body.hypothesisId || 'unknown'),
      location: String(body.location || 'unknown'),
      msg: String(body.msg || ''),
      data:
        body.data && typeof body.data === 'object'
          ? (body.data as Record<string, unknown>)
          : {},
      ts: typeof body.ts === 'number' ? body.ts : Date.now(),
    };
    const filePath = resolve(
      process.cwd(),
      '.runtime',
      'bitbrowser',
      'debug-handshake.ndjson',
    );
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
    return this.ok({ written: true, filePath }, 201);
  }

  async getRuntimeSession(
    request: BitBrowserHttpRequest<{ runtimeSessionId: string }>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const body = this.requireBody(request);
    const session = await this.facade.runtimeSessionService.getRuntimeSession(
      body.runtimeSessionId,
    );
    return this.ok(session);
  }

  async listSessionCommands(
    request: BitBrowserHttpRequest<{ runtimeSessionId: string }>,
  ): Promise<BitBrowserHttpResponse<ResponseBody>> {
    const body = this.requireBody(request);
    const commands = await this.facade.runtimeSessionService.listSessionCommands(
      body.runtimeSessionId,
    );
    return this.ok(commands);
  }

  error(error: unknown, status = 400): BitBrowserHttpResponse<ResponseBody> {
    return {
      status,
      body: {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      },
    };
  }

  private ok<T>(data: T, status = 200): BitBrowserHttpResponse<ResponseBody<T>> {
    return {
      status,
      body: {
        success: true,
        data,
      },
    };
  }

  private requireBody<T>(request: BitBrowserHttpRequest<T>) {
    if (!request.body) {
      throw new Error('request body is required');
    }
    return request.body;
  }
}

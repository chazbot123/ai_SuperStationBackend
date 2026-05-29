import type { BitBrowserRuntimeFacade } from './bitbrowser.bootstrap';
import { BitBrowserHttpController } from './bitbrowser.http-controller';
import type {
  BitBrowserHttpRequest,
  BitBrowserHttpResponse,
} from './bitbrowser.http-api.types';

type RouteHandler = (
  request: BitBrowserHttpRequest<any>,
) => Promise<BitBrowserHttpResponse>;

function createRouteKey(method: string, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

export class BitBrowserHttpApi {
  private readonly controller: BitBrowserHttpController;
  private readonly routes: Map<string, RouteHandler>;

  constructor(facade: BitBrowserRuntimeFacade) {
    this.controller = new BitBrowserHttpController(facade);
    this.routes = this.createRoutes();
  }

  async handle(request: BitBrowserHttpRequest<any>): Promise<BitBrowserHttpResponse> {
    const route = this.routes.get(
      createRouteKey(request.method, this.normalizePath(request.path)),
    );

    if (!route) {
      return {
        status: 404,
        body: {
          success: false,
          error: `route not found: ${request.method.toUpperCase()} ${request.path}`,
        },
      };
    };

    try {
      return await route(request);
    } catch (error) {
      return this.controller.error(error);
    }
  }

  listRoutes() {
    return Array.from(this.routes.keys());
  }

  private createRoutes() {
    const routes = new Map<string, RouteHandler>();

    routes.set(
      createRouteKey('POST', '/api/bitbrowser/owners'),
      (request) => this.controller.createOwner(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/platform-accounts'),
      (request) => this.controller.registerPlatformAccount(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/runtime/open-session'),
      (request) => this.controller.openRuntimeSession(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/runtime/close-session'),
      (request) => this.controller.closeRuntimeSession(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/runtime/get-session'),
      (request) => this.controller.getRuntimeSession(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/runtime/list-commands'),
      (request) => this.controller.listSessionCommands(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/ready'),
      (request) => this.controller.registerExtensionReady(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/page-ready-bind'),
      (request) => this.controller.pageReadyBind(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/heartbeat'),
      (request) => this.controller.heartbeat(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/queue-login-prepare'),
      (request) => this.controller.queueLoginPrepare(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/queue-login-execute'),
      (request) => this.controller.queueLoginExecute(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/queue-publish'),
      (request) => this.controller.queuePublishCommand(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/pull-command'),
      (request) => this.controller.pullNextCommand(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/ack-command'),
      (request) => this.controller.ackCommand(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/complete-command'),
      (request) => this.controller.completeCommand(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/extension/fail-command'),
      (request) => this.controller.failCommand(request),
    );
    routes.set(
      createRouteKey('POST', '/api/bitbrowser/debug/event'),
      (request) => this.controller.writeDebugEvent(request),
    );

    return routes;
  }

  private normalizePath(path: string) {
    if (!path) {
      return '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
  }
}

export function createBitBrowserHttpApi(facade: BitBrowserRuntimeFacade) {
  return new BitBrowserHttpApi(facade);
}

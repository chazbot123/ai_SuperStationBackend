import { FileBitBrowserBindingRepository } from './bitbrowser.file-store';
import {
  BitBrowserGatewayClient,
  type BitBrowserGatewayConfig,
} from './bitbrowser.gateway';
import { BitBrowserExtensionBridgeService } from './bitbrowser.extension-bridge.service';
import { BitBrowserRuntimeSessionService } from './bitbrowser.runtime-session.service';
import { buildProfileTaskId, BitBrowserProfileService } from './bitbrowser.service';
import type { PlatformType, ProfileLockReason } from './bitbrowser.types';

export interface FileBackedBitBrowserModuleOptions {
  storageFilePath?: string;
  gateway: BitBrowserGatewayConfig;
}

export interface BitBrowserRuntimeFacade {
  service: BitBrowserProfileService;
  runtimeSessionService: BitBrowserRuntimeSessionService;
  extensionBridgeService: BitBrowserExtensionBridgeService;
  prepare(
    creatorId: string,
    ownerId: string,
    platform: PlatformType,
    reason: ProfileLockReason,
    expiresAt: string,
  ): ReturnType<BitBrowserProfileService['prepareOwnerRuntime']>;
}

export function createFileBackedBitBrowserModule(
  options: FileBackedBitBrowserModuleOptions,
): BitBrowserRuntimeFacade {
  const repository = new FileBitBrowserBindingRepository(options.storageFilePath);
  const runtimeProvider = new BitBrowserGatewayClient(options.gateway);
  const service = new BitBrowserProfileService(repository, runtimeProvider);
  const runtimeSessionService = new BitBrowserRuntimeSessionService(
    repository,
    service,
  );
  const extensionBridgeService = new BitBrowserExtensionBridgeService(
    runtimeSessionService,
  );

  return {
    service,
    runtimeSessionService,
    extensionBridgeService,
    prepare(creatorId, ownerId, platform, reason, expiresAt) {
      return service.prepareOwnerRuntime({
        creatorId,
        ownerId,
        platform,
        reason,
        expiresAt,
        taskId: buildProfileTaskId(ownerId, platform),
      });
    },
  };
}

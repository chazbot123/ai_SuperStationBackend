import type {
  BrowserProfileBinding,
  BusinessOwner,
  PlatformAccountBinding,
  ProfileRuntimeLock,
  RuntimeCommand,
  RuntimeSession,
} from './bitbrowser.types';

export const BITBROWSER_STORAGE_VERSION = 1;
export const DEFAULT_BITBROWSER_STORAGE_FILE =
  'server/src/modules/bitbrowser/bitbrowser.store.json';

export interface BitBrowserStoreSnapshot {
  version: number;
  owners: BusinessOwner[];
  profileBindings: BrowserProfileBinding[];
  platformAccounts: PlatformAccountBinding[];
  locks: ProfileRuntimeLock[];
  runtimeSessions: RuntimeSession[];
  runtimeCommands: RuntimeCommand[];
}

export function createEmptyBitBrowserStore(): BitBrowserStoreSnapshot {
  return {
    version: BITBROWSER_STORAGE_VERSION,
    owners: [],
    profileBindings: [],
    platformAccounts: [],
    locks: [],
    runtimeSessions: [],
    runtimeCommands: [],
  };
}

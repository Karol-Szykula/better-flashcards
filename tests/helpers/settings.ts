import { ISettings } from "src/conf/settings";

export function createSettings(overrides: Partial<ISettings> = {}): ISettings {
  return {
    ankiConnectPermission: false,
    ignoredDirectories: "",
    lastSyncRev: 0,
    fieldMappings: {},
    deckImportSnapshots: {},
    noteLifecycle: {},
    ...overrides,
  };
}

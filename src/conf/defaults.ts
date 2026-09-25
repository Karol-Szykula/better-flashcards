import type { ISettings } from "src/conf/settings";

export const defaultSettings = (): ISettings => ({
  ankiConnectPermission: false,
  deckImportSnapshots: {},
  fieldMappings: {},
  ignoredDirectories: "",
  lastSyncRev: 0,
  noteLifecycle: {},
});

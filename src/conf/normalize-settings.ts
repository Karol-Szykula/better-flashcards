import type { DeckImportSnapshot, ISettings } from "src/conf/settings";
import { defaultSettings } from "src/conf/defaults";
import { isRecord } from "src/conf/guards";

function normalizedRecord<T>(value: unknown): Record<string, T> {
  return isRecord(value) ? (value as Record<string, T>) : {};
}

export function normalizeSettings(stored: unknown): ISettings {
  if (!isRecord(stored)) {
    return { ...defaultSettings() };
  }
  return {
    ankiConnectPermission:
      typeof stored["ankiConnectPermission"] === "boolean"
        ? stored["ankiConnectPermission"]
        : defaultSettings().ankiConnectPermission,
    deckImportSnapshots: normalizedRecord<DeckImportSnapshot>(
      stored["deckImportSnapshots"],
    ),
    fieldMappings: normalizedRecord<Record<string, string>>(
      stored["fieldMappings"],
    ),
    ignoredDirectories:
      typeof stored["ignoredDirectories"] === "string"
        ? stored["ignoredDirectories"]
        : defaultSettings().ignoredDirectories,
    lastSyncRev:
      typeof stored["lastSyncRev"] === "number"
        ? stored["lastSyncRev"]
        : defaultSettings().lastSyncRev,
    noteLifecycle: normalizedRecord(stored["noteLifecycle"]),
  };
}

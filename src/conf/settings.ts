import type { FieldMapping } from "src/entities/field-mapping";
import type { NoteLifecycleRecord } from "src/services/note-lifecycle";

export interface DeckImportSnapshot {
  deckName: string;
  fieldMappings: Record<string, FieldMapping>;
  importedAt: number;
}

export interface ISettings {
  ankiConnectPermission: boolean;
  deckImportSnapshots: Record<string, DeckImportSnapshot>;
  fieldMappings: Record<string, Record<string, string>>;
  ignoredDirectories: string;
  lastSyncRev: number;
  noteLifecycle: Record<number, NoteLifecycleRecord>;
}

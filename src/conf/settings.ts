import type { FieldMapping } from "src/services/import";

export interface DeckImportSnapshot {
  deckName: string;
  fieldMappings: Record<string, FieldMapping>;
  flashcardsTag: string;
  importedAt: number;
}

export interface ISettings {
  ankiConnectPermission: boolean;
  codeHighlightSupport: boolean;
  contextAwareMode: boolean;
  contextSeparator: string;
  deck: string;
  deckImportSnapshots: Record<string, DeckImportSnapshot>;
  defaultAnkiTag: string;
  fieldMappings: Record<string, Record<string, string>>;
  flashcardsTag: string;
  folderBasedDeck: boolean;
  ignoredDirectories: string;
  inlineID: boolean;
  inlineSeparator: string;
  inlineSeparatorReverse: string;
  lastSyncRev: number;
  sourceSupport: boolean;
  syncedNoteHashes: Record<number, string>;
  syncedNoteMods: Record<number, number>;
}

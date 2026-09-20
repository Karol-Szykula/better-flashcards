export interface ISettings {
  ankiConnectPermission: boolean;
  codeHighlightSupport: boolean;
  contextAwareMode: boolean;
  contextSeparator: string;
  deck: string;
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

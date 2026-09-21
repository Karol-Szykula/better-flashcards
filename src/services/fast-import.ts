import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/card";
import type { DeckImportSnapshot, ISettings } from "src/conf/settings";
import {
  collectVaultNoteIndex,
  type VaultNoteIndex,
} from "src/services/vault";
import { executeImport, fetchDeckNotes } from "src/services/import";
import {
  computeContentHash,
  createFlashcardFencePattern,
  readYamlFlashcards,
} from "src/services/yaml-flashcard";
import { parseFlashcardForm } from "src/gui/flashcard-form/parser";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";

export interface FastImportDeckReport {
  deckName: string;
  missing: number;
  overwrittenDiverged: number;
  refreshed: number;
  upToDate: number;
}

export interface FastImportReport {
  decks: FastImportDeckReport[];
  deleted: number;
  purgedRecords: number;
}

function emptyDeckReport(deckName: string): FastImportDeckReport {
  return {
    deckName,
    missing: 0,
    overwrittenDiverged: 0,
    refreshed: 0,
    upToDate: 0,
  };
}

function isNoteTracked(settings: ISettings, noteId: number): boolean {
  return (
    settings.syncedNoteMods?.[noteId] !== undefined &&
    settings.syncedNoteHashes?.[noteId] !== undefined
  );
}

async function findIndexedNoteBlock(
  vault: Vault,
  index: VaultNoteIndex,
  noteId: number,
  yaml: YamlEngine
) {
  const path = index.get(noteId);
  if (!path) {
    return null;
  }
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return null;
  }
  const cards = await readYamlFlashcards(vault, file, yaml);
  return cards.find((card) => card.id === noteId) ?? null;
}

async function refreshDeckNotes(
  anki: Anki,
  vault: Vault,
  settings: ISettings,
  snapshot: DeckImportSnapshot,
  notes: AnkiNoteInfo[],
  index: VaultNoteIndex,
  yaml: YamlEngine
): Promise<FastImportDeckReport> {
  const counts = emptyDeckReport(snapshot.deckName);
  const eligible: AnkiNoteInfo[] = [];
  const decisions: Record<number, boolean> = {};
  const divergedIds = new Set<number>();
  for (const note of notes) {
    if (!isNoteTracked(settings, note.noteId)) {
      continue;
    }
    const block = await findIndexedNoteBlock(vault, index, note.noteId, yaml);
    if (!block) {
      counts.missing += 1;
      continue;
    }
    const currentHash = await computeContentHash(
      block.front,
      block.back,
      block.tags
    );
    const vaultChanged =
      currentHash !== settings.syncedNoteHashes[note.noteId];
    const ankiChanged =
      (note.mod ?? 0) > (settings.syncedNoteMods[note.noteId] ?? 0);
    if (!vaultChanged && !ankiChanged) {
      counts.upToDate += 1;
      continue;
    }
    if (vaultChanged) {
      divergedIds.add(note.noteId);
    }
    eligible.push(note);
    decisions[note.noteId] = true;
  }
  settings.deckImportSnapshots[snapshot.deckName] = {
    ...snapshot,
    importedAt: Date.now(),
  };
  if (eligible.length === 0) {
    return counts;
  }
  const report = await executeImport(
    anki,
    vault,
    {
      decisions,
      deckName: snapshot.deckName,
      fieldMappings: snapshot.fieldMappings,
      flashcardsTag: snapshot.flashcardsTag,
      notes: eligible,
      targetFolder: "",
      vaultNoteIndex: index,
    },
    yaml
  );
  settings.syncedNoteMods = {
    ...settings.syncedNoteMods,
    ...report.syncedNotes,
  };
  settings.syncedNoteHashes = {
    ...settings.syncedNoteHashes,
    ...report.syncedHashes,
  };
  const importedMods = Object.values(report.syncedNotes);
  if (importedMods.length > 0) {
    settings.lastSyncRev = Math.max(
      settings.lastSyncRev ?? 0,
      ...importedMods
    );
  }
  settings.deckImportSnapshots[snapshot.deckName] = {
    ...snapshot,
    importedAt: Date.now(),
  };
  counts.overwrittenDiverged = divergedIds.size;
  counts.refreshed = eligible.length - divergedIds.size;
  return counts;
}

async function removeNoteFromFile(
  vault: Vault,
  path: string,
  noteId: number,
  yaml: YamlEngine
): Promise<boolean> {
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return false;
  }
  const content = await vault.read(file);
  const pattern = createFlashcardFencePattern();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    let block;
    try {
      block = parseFlashcardForm(match[1], yaml);
    } catch {
      continue;
    }
    if (block.id !== noteId) {
      continue;
    }
    const updated = (
      content.slice(0, match.index) + content.slice(match.index + match[0].length)
    ).replace(/\n{3,}/g, "\n\n");
    if (updated.trim() === "") {
      await vault.delete(file);
    } else {
      await vault.modify(file, updated);
    }
    return true;
  }
  return false;
}

async function purgeDeletedNotes(
  vault: Vault,
  settings: ISettings,
  liveIds: Set<number>,
  index: VaultNoteIndex,
  yaml: YamlEngine
): Promise<{ deleted: number; purgedRecords: number }> {
  let deleted = 0;
  let purgedRecords = 0;
  const mods = settings.syncedNoteMods ?? {};
  for (const key of Object.keys(mods)) {
    const noteId = Number(key);
    if (liveIds.has(noteId)) {
      continue;
    }
    const path = index.get(noteId);
    if (path) {
      const removed = await removeNoteFromFile(vault, path, noteId, yaml);
      if (removed) {
        deleted += 1;
      }
    }
    if (settings.syncedNoteMods) {
      delete settings.syncedNoteMods[noteId];
    }
    if (settings.syncedNoteHashes) {
      delete settings.syncedNoteHashes[noteId];
    }
    purgedRecords += 1;
  }
  return { deleted, purgedRecords };
}

export async function executeFastImport(
  anki: Anki,
  vault: Vault,
  settings: ISettings,
  yaml: YamlEngine = obsidianYamlEngine
): Promise<FastImportReport> {
  const snapshots = settings.deckImportSnapshots ?? {};
  const deckNames = Object.keys(snapshots);
  if (deckNames.length === 0) {
    throw new Error("No wizard import yet. Run Import deck from Anki first.");
  }
  const index = await collectVaultNoteIndex(vault, settings);
  const liveIds = new Set<number>();
  const decks: FastImportDeckReport[] = [];
  for (const deckName of deckNames) {
    const notes = await fetchDeckNotes(anki, deckName);
    for (const note of notes) {
      liveIds.add(note.noteId);
    }
    decks.push(
      await refreshDeckNotes(
        anki,
        vault,
        settings,
        snapshots[deckName],
        notes,
        index,
        yaml
      )
    );
  }
  const purged = await purgeDeletedNotes(vault, settings, liveIds, index, yaml);
  return {
    decks,
    deleted: purged.deleted,
    purgedRecords: purged.purgedRecords,
  };
}

export function formatFastImportReport(report: FastImportReport): string {
  let refreshed = 0;
  let diverged = 0;
  let upToDate = 0;
  let missing = 0;
  const lines: string[] = [];
  for (const deck of report.decks) {
    refreshed += deck.refreshed;
    diverged += deck.overwrittenDiverged;
    upToDate += deck.upToDate;
    missing += deck.missing;
    lines.push(
      `${deck.deckName}: ${deck.refreshed} refreshed, ` +
        `${deck.overwrittenDiverged} overwritten, ` +
        `${deck.upToDate} up to date, ${deck.missing} missing`
    );
  }
  return (
    `Fast import: ${refreshed} refreshed, ${diverged} overwritten, ` +
    `${upToDate} up to date, ${missing} missing, ${report.deleted} deleted\n` +
    lines.join("\n")
  );
}

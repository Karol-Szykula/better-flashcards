import type { TFile } from "obsidian";
import type { Vault } from "obsidian";
import type { AnkiNote, AnkiNoteInfo } from "src/entities/anki-note";
import type { ISettings } from "src/conf/settings";
import type { Anki } from "src/services/anki";
import { assureModels } from "src/services/anki-models";
import { ankiContentHash, blockContentHash } from "src/services/note-hash";
import {
  buildCreatedNote,
  buildPushedNote,
  mediaFileCount,
  pushNotesToAnki,
  recordSyncedBaselines,
  uploadNoteMedia,
  type PushedNote,
  type SyncedBaseline,
} from "src/services/note-push";
import {
  classifyNoteLifecycle,
  syncedCleanRecord,
  transitionNoteLifecycle,
  type NoteLifecycleRecord,
  type NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import type { NotePack } from "src/services/note-packs";
import { packForModel } from "src/services/note-packs";
import { decisionActFor, isInScope } from "src/services/sync-decision";
import { deckForPath, isIgnoredPath } from "src/services/vault";
import { parseNoteForm } from "src/services/note-parser";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";
import {
  createNoteFencePattern,
  serializeYamlNote,
  type YamlNote,
} from "src/services/yaml-note";

const notesInfoChunkSize = 50;

export interface ExportReport {
  created: number;
  enrolled: number;
  mediaFiles: number;
  skippedConflicts: number;
  skippedDeleted: number;
  skippedForSync: number;
  skippedModelMismatch: number;
  skippedUnmapped: number;
  unchanged: number;
  updated: number;
}

interface BlockLocation {
  block: YamlNote;
  deckName: string;
  end: number;
  file: TFile;
  start: number;
}

async function scanBlocks(
  vault: Vault,
  ignoredDirectories: string,
  yaml: YamlEngine,
): Promise<BlockLocation[]> {
  const locations: BlockLocation[] = [];
  for (const file of vault.getMarkdownFiles()) {
    if (isIgnoredPath(file.path, ignoredDirectories)) {
      continue;
    }
    const content = await vault.read(file);
    const deckName = deckForPath(file.path);
    const pattern = createNoteFencePattern();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      try {
        locations.push({
          block: parseNoteForm(match[1] ?? "", yaml),
          deckName,
          end: pattern.lastIndex,
          file,
          start: match.index,
        });
      } catch {
        continue;
      }
    }
  }
  return locations;
}

async function fetchNotesById(
  anki: Anki,
  noteIds: number[],
): Promise<Map<number, AnkiNoteInfo>> {
  const byId = new Map<number, AnkiNoteInfo>();
  for (let index = 0; index < noteIds.length; index += notesInfoChunkSize) {
    const chunk = await anki.getNotes(
      noteIds.slice(index, index + notesInfoChunkSize),
    );
    for (const note of chunk) {
      byId.set(note.noteId, note);
    }
  }
  return byId;
}

async function ensureDecks(anki: Anki, deckNames: string[]): Promise<void> {
  const known = new Set(await anki.getDeckNames());
  for (const deckName of deckNames) {
    if (known.has(deckName)) {
      continue;
    }
    await anki.createDeck(deckName);
    known.add(deckName);
  }
}

async function writeBackIds(
  vault: Vault,
  assignments: { location: BlockLocation; noteId: number }[],
  yaml: YamlEngine,
): Promise<void> {
  const byFile = new Map<
    TFile,
    { location: BlockLocation; noteId: number }[]
  >();
  for (const assignment of assignments) {
    const group = byFile.get(assignment.location.file) ?? [];
    group.push(assignment);
    byFile.set(assignment.location.file, group);
  }
  for (const [file, group] of byFile) {
    const content = await vault.read(file);
    let rewritten = content;
    for (const { location, noteId } of [...group].sort(
      (first, second) => second.location.start - first.location.start,
    )) {
      const block = serializeYamlNote({ ...location.block, id: noteId }, yaml);
      rewritten =
        rewritten.slice(0, location.start) +
        block +
        rewritten.slice(location.end);
    }
    await vault.modify(file, rewritten);
  }
}

function emptyExportReport(): ExportReport {
  return {
    created: 0,
    enrolled: 0,
    mediaFiles: 0,
    skippedConflicts: 0,
    skippedDeleted: 0,
    skippedForSync: 0,
    skippedModelMismatch: 0,
    skippedUnmapped: 0,
    unchanged: 0,
    updated: 0,
  };
}

interface IdAssignment {
  location: BlockLocation;
  noteId: number;
}

interface CreateCandidate {
  hash: string;
  location: BlockLocation;
  note: AnkiNote;
}

interface ExportPlan {
  creates: CreateCandidate[];
  idWrites: IdAssignment[];
  pushes: PushedNote[];
  report: ExportReport;
  synced: SyncedBaseline[];
}

type PackResolver = (modelName: string) => Promise<NotePack | undefined>;

function indexedBlockIds(locations: BlockLocation[]): number[] {
  return [
    ...new Set(
      locations
        .map((location) => location.block.id)
        .filter((id): id is number => id !== undefined),
    ),
  ];
}

function packResolverFor(vault: Vault): PackResolver {
  const cache = new Map<string, NotePack | undefined>();
  return async (modelName) => {
    if (!cache.has(modelName)) {
      cache.set(modelName, await packForModel(vault, modelName));
    }
    return cache.get(modelName);
  };
}

async function lifecycleStatusForBlock(
  location: BlockLocation,
  anki: AnkiNoteInfo | undefined,
  record: NoteLifecycleRecord | undefined,
): Promise<NoteLifecycleStatus> {
  return classifyNoteLifecycle({
    anki,
    block: {
      id: location.block.id,
      hash: await blockContentHash(location.block),
    },
    record,
  });
}

function countSkip(report: ExportReport, status: NoteLifecycleStatus): void {
  if (status === "vaultOnly.ankiDeleted" || status === "orphaned") {
    report.skippedDeleted += 1;
    return;
  }
  if (status === "synced.ankiNewer" || status === "synced.diverged") {
    report.skippedForSync += 1;
  }
}

async function enrollLinkedBlock(
  settings: ISettings,
  location: BlockLocation,
  anki: AnkiNoteInfo,
  pack: NotePack,
  report: ExportReport,
): Promise<void> {
  const fromAnki = await ankiContentHash(anki, pack.mapping);
  const fromVault = await blockContentHash(location.block);
  settings.noteLifecycle[anki.noteId] = syncedCleanRecord(
    anki.mod ?? 0,
    fromAnki === fromVault ? fromVault : fromAnki,
    Date.now(),
  );
  report.enrolled += 1;
}

interface BlockPlanContext {
  ankiNotes: Map<number, AnkiNoteInfo>;
  packFor: PackResolver;
  settings: ISettings;
  vault: Vault;
}

async function planBlock(
  context: BlockPlanContext,
  location: BlockLocation,
  plan: ExportPlan,
): Promise<void> {
  const anki = context.ankiNotes.get(location.block.id ?? -1);
  const record =
    location.block.id === undefined
      ? undefined
      : context.settings.noteLifecycle[location.block.id];
  const status = await lifecycleStatusForBlock(location, anki, record);
  const act = decisionActFor("export", status);
  if (!isInScope(act)) {
    countSkip(plan.report, status);
    return;
  }
  transitionNoteLifecycle(status, act);
  const pack = await context.packFor(location.block.model);
  if (pack === undefined) {
    plan.report.skippedUnmapped += 1;
    return;
  }
  if (act === "ENROLL" && anki !== undefined) {
    await enrollLinkedBlock(
      context.settings,
      location,
      anki,
      pack,
      plan.report,
    );
  }
  if (act === "CHECK") {
    plan.report.unchanged += 1;
    return;
  }
  if ((act === "PUSH" || act === "FORCE_PUSH") && anki !== undefined) {
    plan.pushes.push(
      await buildPushedNote(context.vault, location, pack, anki),
    );
    return;
  }
  if (act === "EXPORT") {
    const created = await buildCreatedNote(context.vault, location, pack);
    plan.creates.push({ location, ...created });
  }
}

async function planExport(
  anki: Anki,
  vault: Vault,
  settings: ISettings,
  locations: BlockLocation[],
): Promise<ExportPlan> {
  const plan: ExportPlan = {
    creates: [],
    idWrites: [],
    pushes: [],
    report: emptyExportReport(),
    synced: [],
  };
  const context: BlockPlanContext = {
    ankiNotes: await fetchNotesById(anki, indexedBlockIds(locations)),
    packFor: packResolverFor(vault),
    settings,
    vault,
  };
  for (const location of locations) {
    await planBlock(context, location, plan);
  }
  plan.report.mediaFiles = mediaFileCount(plannedNotes(plan));
  return plan;
}

function plannedNotes(plan: ExportPlan): AnkiNote[] {
  return [
    ...plan.creates.map((candidate) => candidate.note),
    ...plan.pushes.map((candidate) => candidate.note),
  ];
}

async function uploadPlannedMedia(anki: Anki, plan: ExportPlan): Promise<void> {
  await uploadNoteMedia(anki, plannedNotes(plan));
}

function decksForCreates(plan: ExportPlan): string[] {
  return [...new Set(plan.creates.map((candidate) => candidate.note.deckName))];
}

function modelsForCreates(plan: ExportPlan): string[] {
  return [
    ...new Set(plan.creates.map((candidate) => candidate.note.modelName)),
  ];
}

async function assurePlannedModels(
  anki: Anki,
  plan: ExportPlan,
): Promise<void> {
  const assurance = await assureModels(anki, modelsForCreates(plan));
  if (assurance.mismatched.length === 0) {
    return;
  }
  const mismatched = new Set(
    assurance.mismatched.map((mismatch) => mismatch.modelName),
  );
  const kept = plan.creates.filter(
    (candidate) => !mismatched.has(candidate.note.modelName),
  );
  plan.report.skippedModelMismatch += plan.creates.length - kept.length;
  plan.creates = kept;
}

async function createPlannedNotes(anki: Anki, plan: ExportPlan): Promise<void> {
  if (plan.creates.length === 0) {
    return;
  }
  await ensureDecks(anki, decksForCreates(plan));
  const noteIds = await anki.addNotes(
    plan.creates.map((candidate) => candidate.note),
  );
  plan.creates.forEach((candidate, index) => {
    const noteId = noteIds[index];
    if (noteId === undefined || noteId < 0) {
      plan.report.skippedConflicts += 1;
      return;
    }
    plan.report.created += 1;
    plan.idWrites.push({ location: candidate.location, noteId });
    plan.synced.push({ hash: candidate.hash, noteId });
  });
}

async function pushPlannedNotes(anki: Anki, plan: ExportPlan): Promise<void> {
  await pushNotesToAnki(anki, plan.pushes);
  for (const { hash, source } of plan.pushes) {
    plan.report.updated += 1;
    plan.synced.push({ hash, noteId: source.noteId });
  }
}

export async function executeExport(
  anki: Anki,
  vault: Vault,
  settings: ISettings,
  ignoredDirectories: string,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<ExportReport> {
  const locations = await scanBlocks(vault, ignoredDirectories, yaml);
  const plan = await planExport(anki, vault, settings, locations);
  await assurePlannedModels(anki, plan);
  await uploadPlannedMedia(anki, plan);
  await createPlannedNotes(anki, plan);
  await pushPlannedNotes(anki, plan);
  await recordSyncedBaselines(anki, settings, plan.synced);
  await writeBackIds(vault, plan.idWrites, yaml);
  return plan.report;
}

export function formatExportReport(report: ExportReport): string {
  return (
    `Export: ${report.created} created, ${report.updated} updated, ` +
    `${report.enrolled} enrolled, ${report.unchanged} unchanged, ` +
    `${report.mediaFiles} media files, ${report.skippedConflicts} skipped as conflicts, ` +
    `${report.skippedDeleted} skipped as deleted, ` +
    `${report.skippedForSync} left to Sync, ` +
    `${report.skippedModelMismatch} skipped on model mismatch, ` +
    `${report.skippedUnmapped} skipped without pack`
  );
}

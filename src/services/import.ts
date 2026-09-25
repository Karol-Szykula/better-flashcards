import * as showdown from "showdown";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import type { FieldMapping, FieldTarget } from "src/entities/field-mapping";
import { ankiFieldNames } from "src/conf/constants";
import type { VaultNoteIndex } from "src/services/vault";
import {
  ensureFolderExists,
  extractYamlNoteIds,
  findVaultNoteBlock,
} from "src/services/vault";
import { importDeckMedia, rewriteMediaReferences } from "src/services/media";
import type { MediaPathMap } from "src/services/media";
import { packForModel, type NotePack } from "src/services/note-packs";
import {
  classifyNoteLifecycle,
  importActFor,
  transitionNoteLifecycle,
  type NoteLifecycleRecord,
  type NoteLifecycleStatus,
  type NotePreviewStatus,
} from "src/services/note-lifecycle";
import {
  computeContentHash,
  serializeYamlNote,
  yamlNoteFileName,
} from "src/services/yaml-note";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";
import {
  basicModelName,
  basicOptionalReversedModelName,
  basicReversedModelName,
  basicTypingModelName,
  clozeModelName,
} from "src/conf/constants";

export interface DeckModel {
  fields: string[];
  modelName: string;
  sampleValues: Record<string, string>;
}

const knownModelBases = [
  basicModelName,
  basicReversedModelName,
  basicOptionalReversedModelName,
  basicTypingModelName,
  clozeModelName,
];

const discoverySampleSize = 100;
const notesChunkSize = 100;

function stripHtml(input: string): string {
  return input
    .replace(/<\/?(p|div|li|ul|ol|br|h[1-6]|tr|table|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>\n]{0,500}>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function stripMarkdown(input: string): string {
  return input
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^[ \t]*(?:[-*]|>[ \t]*|\d+\.)[ \t]+/gm, "")
    .replace(/([*_`#])/g, "")
    .replace(/!\[([^\]\n]{0,500})\]\(([^)\n]{0,2000})\)/g, "$1")
    .replace(/\[([^\]\n]{0,500})\]\(([^)\n]{0,2000})\)/g, "$1");
}

export interface ClassifiedNote {
  isInVaultIndex: boolean;
  note: AnkiNoteInfo;
  previewStatus: NotePreviewStatus;
  vaultPath?: string;
}

export interface NoteSyncState {
  fallbackRev: number;
  syncedMods: Record<number, number>;
}

function noteSyncRev(sync: NoteSyncState, noteId: number): number {
  return sync.syncedMods[noteId] ?? sync.fallbackRev;
}

export function isNoteUpdatedSince(
  note: AnkiNoteInfo,
  sync: NoteSyncState,
): boolean {
  return (note.mod ?? 0) > noteSyncRev(sync, note.noteId);
}

export function normalizeNoteText(input: string): string {
  return stripMarkdown(stripHtml(input)).replace(/\s+/g, " ").trim();
}

export async function fetchDeckNotes(
  anki: Anki,
  deckName: string,
  onChunk?: (fetched: number, total: number) => void,
): Promise<AnkiNoteInfo[]> {
  const safeDeckName = deckName.replace(/"/g, "");
  const noteIds = await anki.findNotes(`deck:"${safeDeckName}"`);
  const notes: AnkiNoteInfo[] = [];
  for (let i = 0; i < noteIds.length; i += notesChunkSize) {
    const chunk = await anki.getNotes(noteIds.slice(i, i + notesChunkSize));
    notes.push(...chunk);
    onChunk?.(notes.length, noteIds.length);
  }
  return notes;
}

const markdownConverter = new showdown.Converter();

function extractMediaFilenames(htmlFields: string[]): string[] {
  const media: string[] = [];
  const combined = htmlFields.join("\n");
  const imagePattern = /<img[^>]*src="([^"]+)"[^>]*>/g;
  const soundPattern = /\[sound:([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(combined)) !== null) {
    const image = match[1];
    if (image !== undefined && !media.includes(image)) {
      media.push(image);
    }
  }
  while ((match = soundPattern.exec(combined)) !== null) {
    const sound = match[1];
    if (sound !== undefined && !media.includes(sound)) {
      media.push(sound);
    }
  }
  return media;
}

function listMarkerFor(indent: string): string {
  return indent.length <= 1 ? "- " : `${indent}- `;
}

function cleanConvertedMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p)[^>]*>/gi, "\n")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/^( *)\\- /gm, listMarkerFor)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mappedFieldValue(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
  target: FieldTarget,
): string {
  const field = Object.keys(mapping).find((name) => mapping[name] === target);
  const html = field ? (note.fields[field]?.value ?? "") : "";
  return cleanConvertedMarkdown(markdownConverter.makeMarkdown(html));
}

function noteMediaFilenames(note: AnkiNoteInfo): string[] {
  return extractMediaFilenames(
    Object.values(note.fields).map((field) => field.value),
  );
}

export function isKnownModel(modelName: string): boolean {
  return knownModelBases.some(
    (base) => modelName === base || modelName.startsWith(base),
  );
}

function deckSearchQuery(deckName: string): string {
  const safeDeckName = deckName.replace(/"/g, "");
  return `deck:"${safeDeckName}"`;
}

async function fetchDiscoverySample(
  anki: Anki,
  deckName: string,
): Promise<AnkiNoteInfo[]> {
  const noteIds = await anki.findNotes(deckSearchQuery(deckName));
  return anki.getNotes(noteIds.slice(0, discoverySampleSize));
}

function mergeNoteFields(model: DeckModel, note: AnkiNoteInfo) {
  for (const [field, content] of Object.entries(note.fields)) {
    if (!model.fields.includes(field)) {
      model.fields.push(field);
    }
    if (!(field in model.sampleValues)) {
      model.sampleValues[field] = content.value;
    }
  }
}

function groupNotesByModel(notes: AnkiNoteInfo[]): DeckModel[] {
  const models = new Map<string, DeckModel>();
  for (const note of notes) {
    const modelName = note.modelName ?? "Unknown";
    if (!models.has(modelName)) {
      models.set(modelName, { modelName, fields: [], sampleValues: {} });
    }
    const model = models.get(modelName);
    if (model !== undefined) {
      mergeNoteFields(model, note);
    }
  }
  return [...models.values()];
}

export async function discoverDeckModels(
  anki: Anki,
  deckName: string,
): Promise<DeckModel[]> {
  const notes = await fetchDiscoverySample(anki, deckName);
  return groupNotesByModel(notes);
}

export function deckFolder(deckName: string, targetFolder: string): string {
  const deckPath = deckName.split("::").join("/");
  return targetFolder ? `${targetFolder}/${deckPath}` : deckPath;
}

function markdownFileName(title: string): { stem: string; extension: string } {
  const stem = title.endsWith(".md") ? title.slice(0, -".md".length) : title;
  return { stem: stem || "note", extension: ".md" };
}

function joinFolder(folder: string, baseName: string): string {
  return folder ? `${folder}/${baseName}` : baseName;
}

function yamlNoteIdInContent(content: string, noteId: number): boolean {
  return extractYamlNoteIds(content).includes(noteId);
}

async function resolveExistingNotePath(
  vault: Vault,
  vaultNoteIndex: VaultNoteIndex | undefined,
  noteId: number,
  takenPaths: Set<string>,
): Promise<string | null> {
  const indexedPath = vaultNoteIndex?.get(noteId);
  if (!indexedPath || takenPaths.has(indexedPath)) {
    return null;
  }
  const existing = await vault.getAbstractFileByPath(indexedPath);
  if (!(existing instanceof TFile)) {
    return null;
  }
  const content = await vault.read(existing);
  if (!yamlNoteIdInContent(content, noteId)) {
    return null;
  }
  takenPaths.add(indexedPath);
  return indexedPath;
}

function parentFolderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

async function resolveRenameTargetPath(
  vault: Vault,
  desiredPath: string,
  takenPaths: Set<string>,
  selfPath: string,
): Promise<string> {
  const dotIndex = desiredPath.lastIndexOf(".");
  const stem = desiredPath.slice(0, dotIndex);
  const extension = desiredPath.slice(dotIndex);
  let candidate = desiredPath;
  let suffix = 0;
  for (;;) {
    if (!takenPaths.has(candidate)) {
      const existing = await vault.getAbstractFileByPath(candidate);
      if (!existing || existing.path === selfPath) {
        break;
      }
    }
    suffix += 1;
    candidate = `${stem}-${suffix}${extension}`;
  }
  takenPaths.add(candidate);
  return candidate;
}

async function renameIndexedNoteFile(
  vault: Vault,
  indexedPath: string,
  freshFileName: string,
  takenPaths: Set<string>,
): Promise<{ file: TFile; path: string } | null> {
  const indexedFile = await vault.getAbstractFileByPath(indexedPath);
  if (!(indexedFile instanceof TFile)) {
    return null;
  }
  const parent = parentFolderOf(indexedPath);
  const desiredPath = parent ? `${parent}/${freshFileName}` : freshFileName;
  if (desiredPath === indexedPath) {
    return { file: indexedFile, path: indexedPath };
  }
  const targetPath = await resolveRenameTargetPath(
    vault,
    desiredPath,
    takenPaths,
    indexedPath,
  );
  await vault.rename(indexedFile, targetPath);
  takenPaths.delete(indexedPath);
  takenPaths.add(targetPath);
  return { file: indexedFile, path: targetPath };
}

async function resolveNoteFilePath(
  vault: Vault,
  folder: string,
  title: string,
  noteId: number,
  takenPaths: Set<string>,
): Promise<string> {
  const { stem, extension } = markdownFileName(title);
  let candidate = joinFolder(folder, `${stem}${extension}`);
  let suffix = 0;
  for (;;) {
    if (!takenPaths.has(candidate)) {
      const existing = await vault.getAbstractFileByPath(candidate);
      if (!existing) {
        break;
      }
      if (existing instanceof TFile) {
        const content = await vault.read(existing);
        if (yamlNoteIdInContent(content, noteId)) {
          break;
        }
      }
    }
    suffix += 1;
    candidate = joinFolder(folder, `${stem}-${suffix}${extension}`);
  }
  takenPaths.add(candidate);
  return candidate;
}

export interface ExecuteImportRequest {
  ankiWinsNoteIds?: number[];
  decisions: Record<number, boolean>;
  deckName: string;
  fieldMappings: Record<string, FieldMapping>;
  isCancelled?: () => boolean;
  noteLifecycle: Record<number, NoteLifecycleRecord>;
  notes: AnkiNoteInfo[];
  onProgress?: (processed: number, total: number) => void;
  targetFolder: string;
  vaultNoteIndex?: VaultNoteIndex;
}

export interface ImportExecutionReport {
  cancelled: boolean;
  created: number;
  forced: number;
  mediaFiles: number;
  overwritten: number;
  skipped: number;
  skippedLeftToSync: number;
  skippedNewerInVault: number;
  skippedUnmapped: number;
  syncedHashes: Record<number, string>;
  syncedNotes: Record<number, number>;
}

interface YamlNoteFields {
  back: string;
  front: string;
  tags: string;
}

export function buildYamlNoteFields(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
): YamlNoteFields | null {
  const front = mappedFieldValue(note, mapping, ankiFieldNames.front);
  const back = mappedFieldValue(note, mapping, ankiFieldNames.back);
  const text = mappedFieldValue(note, mapping, ankiFieldNames.text);
  const extra = mappedFieldValue(note, mapping, ankiFieldNames.extra);
  const tags = note.tags.join(" ");
  if (front && back) {
    return { back, front, tags };
  }
  if (text) {
    return { back: extra, front: text, tags };
  }
  if (front) {
    return { back: "", front, tags };
  }
  return null;
}

function rebuildYamlNoteFields(
  item: { note: AnkiNoteInfo },
  request: ExecuteImportRequest,
  importedPaths: MediaPathMap,
): YamlNoteFields {
  const mapping = request.fieldMappings[item.note.modelName ?? "Unknown"] ?? {};
  const rewrittenFields = Object.fromEntries(
    Object.entries(item.note.fields).map(([name, field]) => [
      name,
      { value: rewriteMediaReferences(field.value, importedPaths) },
    ]),
  );
  const rebuilt = buildYamlNoteFields(
    { ...item.note, fields: rewrittenFields },
    mapping,
  );
  if (rebuilt) {
    return rebuilt;
  }
  return { back: "", front: "", tags: item.note.tags.join(" ") };
}

interface PlannedImport {
  mapping: FieldMapping;
  media: string[];
  note: AnkiNoteInfo;
}

interface ImportDecision {
  forced: number;
  importable: AnkiNoteInfo[];
  skippedLeftToSync: number;
  skippedNewerInVault: number;
}

interface NoteTarget {
  existingFile: TFile | null;
  targetPath: string;
}

type PackResolver = (note: AnkiNoteInfo) => Promise<NotePack | undefined>;

function packResolver(vault: Vault): PackResolver {
  const cache = new Map<string, NotePack | undefined>();
  return async (note) => {
    const modelName = note.modelName ?? "Unknown";
    if (!cache.has(modelName)) {
      cache.set(modelName, await packForModel(vault, modelName));
    }
    return cache.get(modelName);
  };
}

async function packableNotes(
  selected: AnkiNoteInfo[],
  packFor: PackResolver,
): Promise<{ packable: AnkiNoteInfo[]; skippedUnmapped: number }> {
  const packable: AnkiNoteInfo[] = [];
  let skippedUnmapped = 0;
  for (const note of selected) {
    if (await packFor(note)) {
      packable.push(note);
    } else {
      skippedUnmapped += 1;
    }
  }
  return { packable, skippedUnmapped };
}

async function statusForImport(
  vault: Vault,
  request: ExecuteImportRequest,
  note: AnkiNoteInfo,
  yaml: YamlEngine,
): Promise<NoteLifecycleStatus> {
  const block = request.vaultNoteIndex
    ? await findVaultNoteBlock(vault, request.vaultNoteIndex, note.noteId, yaml)
    : null;
  return classifyNoteLifecycle({
    anki: note,
    block:
      block === null
        ? undefined
        : {
            id: block.id,
            hash: await computeContentHash(
              block.front,
              block.back,
              block.tags,
              block.model,
            ),
          },
    record: request.noteLifecycle[note.noteId],
  });
}

function countAsLeftToSync(
  status: NoteLifecycleStatus,
  decision: ImportDecision,
): void {
  if (status === "ankiOnly.fileDeleted") {
    decision.skippedLeftToSync += 1;
    return;
  }
  if (status === "synced.vaultNewer" || status === "synced.diverged") {
    decision.skippedNewerInVault += 1;
  }
}

async function importDecision(
  packable: AnkiNoteInfo[],
  request: ExecuteImportRequest,
  vault: Vault,
  yaml: YamlEngine,
): Promise<ImportDecision> {
  const ankiWinsNoteIds = new Set(request.ankiWinsNoteIds ?? []);
  const decision: ImportDecision = {
    forced: 0,
    importable: [],
    skippedLeftToSync: 0,
    skippedNewerInVault: 0,
  };
  for (const note of packable) {
    const status = await statusForImport(vault, request, note, yaml);
    const isForced = ankiWinsNoteIds.has(note.noteId);
    const act = importActFor(status, isForced);
    if (act === undefined) {
      countAsLeftToSync(status, decision);
      continue;
    }
    transitionNoteLifecycle(status, act);
    if (isForced && importActFor(status) === undefined) {
      decision.forced += 1;
    }
    decision.importable.push(note);
  }
  return decision;
}

function plannedImports(
  importable: AnkiNoteInfo[],
  request: ExecuteImportRequest,
): PlannedImport[] {
  return importable.map((note) => ({
    mapping: request.fieldMappings[note.modelName ?? "Unknown"] ?? {},
    media: noteMediaFilenames(note),
    note,
  }));
}

function mediaNames(planned: PlannedImport[]): string[] {
  return [...new Set(planned.flatMap((item) => item.media))];
}

async function freshFilePath(
  vault: Vault,
  request: ExecuteImportRequest,
  folder: string,
  item: PlannedImport,
  front: string,
  takenPaths: Set<string>,
): Promise<NoteTarget> {
  const freshFileName = yamlNoteFileName(
    request.deckName,
    front,
    item.note.noteId,
  );
  const indexedPath = await resolveExistingNotePath(
    vault,
    request.vaultNoteIndex,
    item.note.noteId,
    takenPaths,
  );
  if (indexedPath !== null) {
    const renamed = await renameIndexedNoteFile(
      vault,
      indexedPath,
      freshFileName,
      takenPaths,
    );
    if (renamed !== null) {
      return { existingFile: renamed.file, targetPath: renamed.path };
    }
  }
  const targetPath = await resolveNoteFilePath(
    vault,
    folder,
    freshFileName,
    item.note.noteId,
    takenPaths,
  );
  const existing = await vault.getAbstractFileByPath(targetPath);
  return {
    existingFile: existing instanceof TFile ? existing : null,
    targetPath,
  };
}

async function serializedNote(
  item: PlannedImport,
  fields: YamlNoteFields,
  yaml: YamlEngine,
): Promise<{ content: string; hash: string }> {
  const model = item.note.modelName ?? "Unknown";
  return {
    content: serializeYamlNote(
      {
        back: fields.back,
        extra: {},
        front: fields.front,
        id: item.note.noteId,
        model,
        tags: fields.tags,
      },
      yaml,
    ),
    hash: await computeContentHash(
      fields.front,
      fields.back,
      fields.tags,
      model,
    ),
  };
}

async function writeImportedNote(
  vault: Vault,
  request: ExecuteImportRequest,
  folder: string,
  item: PlannedImport,
  importedPaths: Record<string, string>,
  takenPaths: Set<string>,
  yaml: YamlEngine,
): Promise<{ hash: string; isNewFile: boolean }> {
  const fields = rebuildYamlNoteFields(item, request, importedPaths);
  const { content, hash } = await serializedNote(item, fields, yaml);
  const { existingFile, targetPath } = await freshFilePath(
    vault,
    request,
    folder,
    item,
    fields.front,
    takenPaths,
  );
  if (existingFile !== null) {
    await vault.modify(existingFile, content);
    return { hash, isNewFile: false };
  }
  await vault.create(targetPath, content);
  return { hash, isNewFile: true };
}

async function writeImportedNotes(
  vault: Vault,
  request: ExecuteImportRequest,
  folder: string,
  planned: PlannedImport[],
  importedPaths: Record<string, string>,
  report: ImportExecutionReport,
  yaml: YamlEngine,
): Promise<void> {
  const takenPaths = new Set<string>();
  let processed = 0;
  for (const item of planned) {
    if (request.isCancelled?.()) {
      report.cancelled = true;
      return;
    }
    const { hash, isNewFile } = await writeImportedNote(
      vault,
      request,
      folder,
      item,
      importedPaths,
      takenPaths,
      yaml,
    );
    if (isNewFile) {
      report.created += 1;
    } else {
      report.overwritten += 1;
    }
    report.syncedNotes[item.note.noteId] = item.note.mod ?? 0;
    report.syncedHashes[item.note.noteId] = hash;
    processed += 1;
    request.onProgress?.(processed, planned.length);
  }
}

export async function executeImport(
  anki: Anki,
  vault: Vault,
  request: ExecuteImportRequest,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<ImportExecutionReport> {
  const selected = request.notes.filter(
    (note) => request.decisions[note.noteId] ?? false,
  );
  const { packable, skippedUnmapped } = await packableNotes(
    selected,
    packResolver(vault),
  );
  const decision = await importDecision(packable, request, vault, yaml);
  const planned = plannedImports(decision.importable, request);
  const importedPaths = await importDeckMedia(
    anki,
    vault,
    request.deckName,
    mediaNames(planned),
  );
  const folder = deckFolder(request.deckName, request.targetFolder);
  await ensureFolderExists(vault, folder);
  const report: ImportExecutionReport = {
    cancelled: false,
    created: 0,
    forced: decision.forced,
    mediaFiles: Object.keys(importedPaths).length,
    overwritten: 0,
    skipped: request.notes.length - selected.length,
    skippedLeftToSync: decision.skippedLeftToSync,
    skippedNewerInVault: decision.skippedNewerInVault,
    skippedUnmapped,
    syncedHashes: {},
    syncedNotes: {},
  };
  await writeImportedNotes(
    vault,
    request,
    folder,
    planned,
    importedPaths,
    report,
    yaml,
  );
  return report;
}

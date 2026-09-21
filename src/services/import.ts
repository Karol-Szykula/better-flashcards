import * as showdown from "showdown";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import { AnkiNoteInfo } from "src/entities/card";
import { ankiFieldNames } from "src/conf/constants";
import type { VaultNoteIndex } from "src/services/vault";
import { ensureFolderExists, extractYamlNoteIds } from "src/services/vault";
import { importDeckMedia, rewriteMediaReferences } from "src/services/media";
import type { MediaPathMap } from "src/services/media";
import {
  computeContentHash,
  serializeYamlFlashcard,
  yamlNoteFileName,
} from "src/services/yaml-flashcard";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";
import {
  basicModelName,
  basicReversedModelName,
  clozeModelName,
  spacedModelName,
} from "src/conf/constants";

export const fieldTargets = [
  ankiFieldNames.front,
  ankiFieldNames.back,
  ankiFieldNames.text,
  ankiFieldNames.extra,
  ankiFieldNames.prompt,
  ankiFieldNames.source,
  "Skip",
] as const;

export type FieldTarget = (typeof fieldTargets)[number];

export type FieldMapping = Record<string, FieldTarget>;

export interface DeckModel {
  fields: string[];
  modelName: string;
  sampleValues: Record<string, string>;
}

const knownModelBases = [
  basicModelName,
  basicReversedModelName,
  clozeModelName,
  spacedModelName,
];

const discoverySampleSize = 100;
const notesChunkSize = 100;

function stripHtml(input: string): string {
  return input
    .replace(/<\/?(p|div|li|ul|ol|br|h[1-6]|tr|table|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function stripMarkdown(input: string): string {
  return input
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/^\s*([-*]|>\s*|\d+\.)\s+/gm, "")
    .replace(/([*_`#])/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

export type NoteImportStatus = "new" | "updated" | "imported";

export interface ClassifiedNote {
  note: AnkiNoteInfo;
  status: NoteImportStatus;
  vaultPath?: string;
}

export interface NoteSyncState {
  fallbackRev: number;
  syncedMods: Record<number, number>;
}

export function noteSyncRev(
  sync: NoteSyncState,
  noteId: number
): number {
  return sync.syncedMods[noteId] ?? sync.fallbackRev;
}

export function isNoteUpdatedSince(
  note: AnkiNoteInfo,
  sync: NoteSyncState
): boolean {
  return (note.mod ?? 0) > noteSyncRev(sync, note.noteId);
}

export function classifyDeckNotes(
  notes: AnkiNoteInfo[],
  vaultNoteIndex: VaultNoteIndex,
  sync: NoteSyncState = { fallbackRev: 0, syncedMods: {} }
): ClassifiedNote[] {
  return notes.map((note) => {
    const vaultPath = vaultNoteIndex.get(note.noteId);
    if (vaultPath === undefined) {
      return { note, status: "new" };
    }
    if (isNoteUpdatedSince(note, sync)) {
      return { note, status: "updated", vaultPath };
    }
    return { note, status: "imported", vaultPath };
  });
}

export function normalizeCardText(input: string): string {
  return stripMarkdown(stripHtml(input)).replace(/\s+/g, " ").trim();
}

export async function fetchDeckNotes(
  anki: Anki,
  deckName: string,
  onChunk?: (fetched: number, total: number) => void
): Promise<AnkiNoteInfo[]> {
  const safeDeckName = deckName.replace(/"/g, "");
  const noteIds = await anki.findNotes(`deck:"${safeDeckName}"`);
  const notes: AnkiNoteInfo[] = [];
  for (let i = 0; i < noteIds.length; i += notesChunkSize) {
    const chunk = await anki.getCards(noteIds.slice(i, i + notesChunkSize));
    notes.push(...chunk);
    onChunk?.(notes.length, noteIds.length);
  }
  return notes;
}

export interface BuiltNoteMarkdown {
  markdown: string;
  media: string[];
}

const markdownConverter = new showdown.Converter();

function extractMediaFilenames(htmlFields: string[]): string[] {
  const media: string[] = [];
  const combined = htmlFields.join("\n");
  const imagePattern = /<img[^>]*src="([^"]+)"[^>]*>/g;
  const soundPattern = /\[sound:([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(combined)) !== null) {
    if (!media.includes(match[1])) {
      media.push(match[1]);
    }
  }
  while ((match = soundPattern.exec(combined)) !== null) {
    if (!media.includes(match[1])) {
      media.push(match[1]);
    }
  }
  return media;
}

function ankiClozeToObsidian(text: string): string {
  return text.replace(/\{\{c\d+::([\s\S]*?)\}\}/g, "==$1==");
}

function unescapeListMarker(line: string, indent: string): string {
  return indent.length <= 1 ? "- " : `${indent}- `;
}

function cleanConvertedMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p)[^>]*>/gi, "\n")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/^( *)\\- /gm, unescapeListMarker)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mappedFieldValue(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
  target: FieldTarget
): string {
  const field = Object.keys(mapping).find((name) => mapping[name] === target);
  const html = field ? note.fields[field]?.value ?? "" : "";
  return cleanConvertedMarkdown(markdownConverter.makeMarkdown(html));
}

function noteMediaFilenames(note: AnkiNoteInfo): string[] {
  return extractMediaFilenames(
    Object.values(note.fields).map((field) => field.value)
  );
}

function noteTagSuffix(tags: string[]): string {
  return tags.map((tag) => ` #${tag.replace(/::/g, "/")}`).join("");
}

function buildInlineMarkdown(
  front: string,
  back: string,
  tagSuffix: string
): string {
  return `${front} :: ${back}${tagSuffix}\n`;
}

function buildClozeMarkdown(
  text: string,
  extra: string,
  tagSuffix: string
): string {
  const cloze = ankiClozeToObsidian(text);
  const body = extra ? `${cloze}\n${extra}` : cloze;
  return `${body}${tagSuffix}\n`;
}

function buildSpacedMarkdown(
  prompt: string,
  flashcardsTag: string,
  tagSuffix: string
): string {
  return `${prompt} #${flashcardsTag}-spaced${tagSuffix}\n`;
}

function buildFallbackMarkdown(
  front: string,
  flashcardsTag: string,
  tagSuffix: string
): string {
  return `${front}\n#${flashcardsTag}${tagSuffix}\n\n`;
}

export function buildNoteMarkdown(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
  flashcardsTag: string
): BuiltNoteMarkdown {
  const front = mappedFieldValue(note, mapping, ankiFieldNames.front);
  const back = mappedFieldValue(note, mapping, ankiFieldNames.back);
  const text = mappedFieldValue(note, mapping, ankiFieldNames.text);
  const extra = mappedFieldValue(note, mapping, ankiFieldNames.extra);
  const prompt = mappedFieldValue(note, mapping, ankiFieldNames.prompt);
  const media = noteMediaFilenames(note);
  const tagSuffix = noteTagSuffix(note.tags);
  if (front && back) {
    return { markdown: buildInlineMarkdown(front, back, tagSuffix), media };
  }
  if (text) {
    return { markdown: buildClozeMarkdown(text, extra, tagSuffix), media };
  }
  if (prompt) {
    return {
      markdown: buildSpacedMarkdown(prompt, flashcardsTag, tagSuffix),
      media,
    };
  }
  if (front) {
    return {
      markdown: buildFallbackMarkdown(front, flashcardsTag, tagSuffix),
      media,
    };
  }
  return { markdown: "", media };
}

export function isKnownModel(modelName: string): boolean {
  return knownModelBases.some(
    (base) => modelName === base || modelName.startsWith(base)
  );
}

export function presetFieldMapping(fields: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  for (const field of fields) {
    mapping[field] = fieldTargets.find((target) => target === field) ?? "Skip";
  }
  return mapping;
}

export function resolveFieldMapping(
  fields: string[],
  savedMapping: Record<string, string> | undefined
): FieldMapping {
  const mapping = presetFieldMapping(fields);
  for (const [field, target] of Object.entries(savedMapping ?? {})) {
    if ((fieldTargets as readonly string[]).includes(target)) {
      mapping[field] = target as FieldTarget;
    }
  }
  return mapping;
}

export function mergeFieldMappings(
  stored: Record<string, Record<string, string>>,
  incoming: Record<string, FieldMapping>
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = { ...stored };
  for (const [modelName, mapping] of Object.entries(incoming)) {
    merged[modelName] = { ...(merged[modelName] ?? {}), ...mapping };
  }
  return merged;
}

function deckSearchQuery(deckName: string): string {
  const safeDeckName = deckName.replace(/"/g, "");
  return `deck:"${safeDeckName}"`;
}

async function fetchDiscoverySample(
  anki: Anki,
  deckName: string
): Promise<AnkiNoteInfo[]> {
  const noteIds = await anki.findNotes(deckSearchQuery(deckName));
  return anki.getCards(noteIds.slice(0, discoverySampleSize));
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
    mergeNoteFields(models.get(modelName)!, note);
  }
  return [...models.values()];
}

export async function discoverDeckModels(
  anki: Anki,
  deckName: string
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
  takenPaths: Set<string>
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
  selfPath: string
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
  takenPaths: Set<string>
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
    indexedPath
  );
  await vault.rename(indexedFile, targetPath);
  takenPaths.delete(indexedPath);
  takenPaths.add(targetPath);
  return { file: indexedFile, path: targetPath };
}

export async function resolveNoteFilePath(
  vault: Vault,
  folder: string,
  title: string,
  noteId: number,
  takenPaths: Set<string>
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
  decisions: Record<number, boolean>;
  deckName: string;
  fieldMappings: Record<string, FieldMapping>;
  flashcardsTag: string;
  isCancelled?: () => boolean;
  notes: AnkiNoteInfo[];
  onProgress?: (processed: number, total: number) => void;
  targetFolder: string;
  vaultNoteIndex?: VaultNoteIndex;
}

export interface ImportExecutionReport {
  cancelled: boolean;
  created: number;
  mediaFiles: number;
  overwritten: number;
  skipped: number;
  syncedHashes: Record<number, string>;
  syncedNotes: Record<number, number>;
}

interface YamlCardFields {
  back: string;
  front: string;
  tags: string;
}

function buildYamlCardFields(
  note: AnkiNoteInfo,
  mapping: FieldMapping
): YamlCardFields | null {
  const front = mappedFieldValue(note, mapping, ankiFieldNames.front);
  const back = mappedFieldValue(note, mapping, ankiFieldNames.back);
  const text = mappedFieldValue(note, mapping, ankiFieldNames.text);
  const extra = mappedFieldValue(note, mapping, ankiFieldNames.extra);
  const prompt = mappedFieldValue(note, mapping, ankiFieldNames.prompt);
  const tags = note.tags.join(" ");
  if (front && back) {
    return { back, front, tags };
  }
  if (text) {
    return { back: extra, front: text, tags };
  }
  if (prompt) {
    return { back: "", front: prompt, tags };
  }
  if (front) {
    return { back: "", front, tags };
  }
  return null;
}

function rebuildYamlCardFields(
  item: { note: AnkiNoteInfo; markdown: string; media: string[] },
  request: ExecuteImportRequest,
  importedPaths: MediaPathMap
): YamlCardFields {
  const mapping = request.fieldMappings[item.note.modelName ?? "Unknown"] ?? {};
  const rewrittenFields = Object.fromEntries(
    Object.entries(item.note.fields).map(([name, field]) => [
      name,
      { value: rewriteMediaReferences(field.value, importedPaths) },
    ])
  );
  const rebuilt = buildYamlCardFields(
    { ...item.note, fields: rewrittenFields },
    mapping
  );
  if (rebuilt) {
    return rebuilt;
  }
  return { back: "", front: "", tags: item.note.tags.join(" ") };
}

export async function executeImport(
  anki: Anki,
  vault: Vault,
  request: ExecuteImportRequest,
  yaml: YamlEngine = obsidianYamlEngine
): Promise<ImportExecutionReport> {
  const selected = request.notes.filter(
    (note) => request.decisions[note.noteId] ?? false
  );
  const built = selected.map((note) => ({
    note,
    mapping: request.fieldMappings[note.modelName ?? "Unknown"] ?? {},
    markdown: "",
    media: [] as string[],
  }));
  for (const item of built) {
    const result = buildNoteMarkdown(
      item.note,
      item.mapping,
      request.flashcardsTag
    );
    item.markdown = result.markdown;
    item.media = result.media;
  }
  const allMedia = [...new Set(built.flatMap((item) => item.media))];
  const importedPaths = await importDeckMedia(
    anki,
    vault,
    request.deckName,
    allMedia
  );
  const folder = deckFolder(request.deckName, request.targetFolder);
  const takenPaths = new Set<string>();
  await ensureFolderExists(vault, folder);
  const report: ImportExecutionReport = {
    created: 0,
    overwritten: 0,
    skipped: request.notes.length - selected.length,
    mediaFiles: Object.keys(importedPaths).length,
    cancelled: false,
    syncedHashes: {},
    syncedNotes: {},
  };
  let processed = 0;
  for (const item of built) {
    if (request.isCancelled?.()) {
      report.cancelled = true;
      break;
    }
    const fields = rebuildYamlCardFields(item, request, importedPaths);
    const hash = await computeContentHash(
      fields.front,
      fields.back,
      fields.tags
    );
    const content = serializeYamlFlashcard(
      {
        back: fields.back,
        extra: { model: item.note.modelName ?? "Unknown" },
        front: fields.front,
        id: item.note.noteId,
        tags: fields.tags,
      },
      yaml
    );
    const freshFileName = yamlNoteFileName(
      request.deckName,
      fields.front,
      item.note.noteId
    );
    const indexedPath = await resolveExistingNotePath(
      vault,
      request.vaultNoteIndex,
      item.note.noteId,
      takenPaths
    );
    let targetPath: string;
    let existingFile: TFile | null = null;
    if (indexedPath) {
      const renamed = await renameIndexedNoteFile(
        vault,
        indexedPath,
        freshFileName,
        takenPaths
      );
      if (renamed) {
        targetPath = renamed.path;
        existingFile = renamed.file;
      } else {
        targetPath = await resolveNoteFilePath(
          vault,
          folder,
          freshFileName,
          item.note.noteId,
          takenPaths
        );
      }
    } else {
      targetPath = await resolveNoteFilePath(
        vault,
        folder,
        freshFileName,
        item.note.noteId,
        takenPaths
      );
      const existing = await vault.getAbstractFileByPath(targetPath);
      if (existing instanceof TFile) {
        existingFile = existing;
      }
    }
    if (existingFile) {
      await vault.modify(existingFile, content);
      report.overwritten += 1;
    } else {
      await vault.create(targetPath, content);
      report.created += 1;
    }
    report.syncedNotes[item.note.noteId] = item.note.mod ?? 0;
    report.syncedHashes[item.note.noteId] = hash;
    processed += 1;
    request.onProgress?.(processed, built.length);
  }
  return report;
}

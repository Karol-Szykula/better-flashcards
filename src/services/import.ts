import * as showdown from "showdown";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import { AnkiNoteInfo } from "src/entities/card";
import { ankiFieldNames } from "src/conf/constants";
import type { VaultNoteIndex } from "src/services/vault";
import { ensureFolderExists } from "src/services/vault";
import { importDeckMedia, rewriteMediaReferences } from "src/services/media";
import type { MediaPathMap } from "src/services/media";
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

export type NoteImportStatus = "new" | "conflict";

export interface ClassifiedNote {
  note: AnkiNoteInfo;
  status: NoteImportStatus;
  vaultPath?: string;
}

export function classifyDeckNotes(
  notes: AnkiNoteInfo[],
  vaultNoteIndex: VaultNoteIndex
): ClassifiedNote[] {
  return notes.map((note) => {
    const vaultPath = vaultNoteIndex.get(note.noteId);
    if (vaultPath === undefined) {
      return { note, status: "new" };
    }
    return { note, status: "conflict", vaultPath };
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

function mappedFieldValue(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
  target: FieldTarget
): string {
  const field = Object.keys(mapping).find((name) => mapping[name] === target);
  const html = field ? note.fields[field]?.value ?? "" : "";
  return markdownConverter.makeMarkdown(html).trim();
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

export function noteTitle(note: AnkiNoteInfo): string {
  const firstValue = Object.values(note.fields)[0]?.value ?? "";
  const text = normalizeCardText(firstValue);
  const sanitized = text.replace(/[/\\:*?"<>|]/g, "-").trim();
  return sanitized.slice(0, 100) || `note-${note.noteId}`;
}

export function deckFolder(deckName: string, targetFolder: string): string {
  const deckPath = deckName.split("::").join("/");
  return targetFolder ? `${targetFolder}/${deckPath}` : deckPath;
}

function splitFileStem(title: string): { stem: string; extension: string } {
  const dotIndex = title.lastIndexOf(".");
  const stem = dotIndex > 0 ? title.slice(0, dotIndex) : title;
  const extension = dotIndex > 0 ? title.slice(dotIndex) : "";
  return { stem: stem || "note", extension: extension || ".md" };
}

function joinFolder(folder: string, baseName: string): string {
  return folder ? `${folder}/${baseName}` : baseName;
}

export async function resolveNoteFilePath(
  vault: Vault,
  folder: string,
  title: string,
  noteId: number,
  takenPaths: Set<string>
): Promise<string> {
  const { stem, extension } = splitFileStem(title);
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
        if (content.includes(`^${noteId}`)) {
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
}

export interface ImportExecutionReport {
  cancelled: boolean;
  created: number;
  lastSyncRev: number;
  mediaFiles: number;
  overwritten: number;
  skipped: number;
}

export async function executeImport(
  anki: Anki,
  vault: Vault,
  request: ExecuteImportRequest
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
    lastSyncRev: 0,
  };
  let processed = 0;
  for (const item of built) {
    if (request.isCancelled?.()) {
      report.cancelled = true;
      break;
    }
    const targetPath = await resolveNoteFilePath(
      vault,
      folder,
      noteTitle(item.note),
      item.note.noteId,
      takenPaths
    );
    const content = appendNoteId(
      rebuildWithMedia(item, request, importedPaths),
      item.note
    );
    const existing = await vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      await vault.modify(existing, content);
      report.overwritten += 1;
    } else {
      await vault.create(targetPath, content);
      report.created += 1;
    }
    report.lastSyncRev = Math.max(report.lastSyncRev, item.note.mod ?? 0);
    processed += 1;
    request.onProgress?.(processed, built.length);
  }
  return report;
}

function appendNoteId(markdown: string, note: AnkiNoteInfo): string {
  const rewritten = markdown.trim();
  return `${rewritten}\n\n^${note.noteId}\n`;
}

function rebuildWithMedia(
  item: { note: AnkiNoteInfo; markdown: string; media: string[] },
  request: ExecuteImportRequest,
  importedPaths: MediaPathMap
): string {
  const mapping = request.fieldMappings[item.note.modelName ?? "Unknown"] ?? {};
  const rewrittenFields = Object.fromEntries(
    Object.entries(item.note.fields).map(([name, field]) => [
      name,
      { value: rewriteMediaReferences(field.value, importedPaths) },
    ])
  );
  const rebuilt = buildNoteMarkdown(
    { ...item.note, fields: rewrittenFields },
    mapping,
    request.flashcardsTag
  );
  return rebuilt.markdown;
}

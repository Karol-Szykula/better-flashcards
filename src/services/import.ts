import * as showdown from "showdown";
import { Anki } from "src/services/anki";
import { AnkiNoteInfo } from "src/entities/card";
import { ankiFieldNames } from "src/conf/constants";
import type { VaultNoteIndex } from "src/services/vault";
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

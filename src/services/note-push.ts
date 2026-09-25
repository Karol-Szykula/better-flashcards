import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { ankiFieldNames } from "src/conf/constants";
import type { ISettings } from "src/conf/settings";
import type { AnkiNote, AnkiNoteInfo } from "src/entities/anki-note";
import { CustomMappedNote } from "src/entities/custom-mapped-note";
import type { Anki } from "src/services/anki";
import type { FieldTarget } from "src/entities/field-mapping";
import { encodeBase64 } from "src/services/media";
import { blockContentHash } from "src/services/note-hash";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import type { NotePack } from "src/services/note-packs";
import type { YamlNote } from "src/services/yaml-note";

const audioExtensions = ["flac", "m4a", "mp3", "ogg", "opus", "wav"];

const notesInfoChunkSize = 50;

export interface PushTarget {
  block: YamlNote;
  deckName: string;
  file: TFile;
}

export interface PushedNote {
  hash: string;
  note: AnkiNote;
  source: AnkiNoteInfo;
}

function valueForTarget(target: FieldTarget, block: YamlNote): string {
  switch (target) {
    case ankiFieldNames.front:
    case ankiFieldNames.text:
      return block.front;
    case ankiFieldNames.back:
    case ankiFieldNames.extra:
      return block.back;
    default:
      return "";
  }
}

function ankiFieldsFor(
  block: YamlNote,
  pack: NotePack,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [field, target] of Object.entries(pack.mapping)) {
    fields[field] = valueForTarget(target, block);
  }
  return fields;
}

function noteTags(tags: string): string[] {
  return tags.split(/\s+/).filter((tag) => tag.length > 0);
}

function fileNameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function isAudio(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  const extension = dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
  return audioExtensions.includes(extension);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parentFolderOf(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  return slash < 0 ? "" : filePath.slice(0, slash);
}

function resolveReferenceFile(
  vault: Vault,
  file: TFile,
  reference: string,
): TFile | null {
  const direct = vault.getAbstractFileByPath(reference);
  if (direct instanceof TFile) {
    return direct;
  }
  const folder = parentFolderOf(file.path);
  const relative = folder ? `${folder}/${reference}` : reference;
  const beside = vault.getAbstractFileByPath(relative);
  if (beside instanceof TFile) {
    return beside;
  }
  const name = fileNameOf(reference);
  return vault.getFiles().find((candidate) => candidate.name === name) ?? null;
}

async function applyVaultMedia(
  vault: Vault,
  file: TFile,
  text: string,
  mediaNames: string[],
  encoded: string[],
): Promise<string> {
  const pattern = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  const referenced = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const reference = match[1];
    if (reference !== undefined) {
      referenced.add(reference);
    }
  }
  let rewritten = text;
  for (const reference of referenced) {
    const media = resolveReferenceFile(vault, file, reference);
    if (media === null) {
      continue;
    }
    const filename = fileNameOf(reference);
    if (!mediaNames.includes(filename)) {
      mediaNames.push(filename);
      encoded.push(encodeBase64(await vault.readBinary(media)));
    }
    const tag = isAudio(filename)
      ? `[sound:${filename}]`
      : `<img src="${filename}">`;
    rewritten = rewritten
      .split(`![[${reference}]]`)
      .join(tag)
      .replace(
        new RegExp(`!\\[\\[${escapePattern(reference)}\\|[^\\]]*\\]\\]`, "g"),
        tag,
      );
  }
  return rewritten;
}

async function mediaAwareBlock(
  vault: Vault,
  target: PushTarget,
): Promise<{ block: YamlNote; encoded: string[]; mediaNames: string[] }> {
  const mediaNames: string[] = [];
  const encoded: string[] = [];
  const front = await applyVaultMedia(
    vault,
    target.file,
    target.block.front,
    mediaNames,
    encoded,
  );
  const back = await applyVaultMedia(
    vault,
    target.file,
    target.block.back,
    mediaNames,
    encoded,
  );
  return {
    block: { ...target.block, back, front },
    encoded,
    mediaNames,
  };
}

export async function buildPushedNote(
  vault: Vault,
  target: PushTarget,
  pack: NotePack,
  source: AnkiNoteInfo,
): Promise<PushedNote> {
  const media = await mediaAwareBlock(vault, target);
  const note = new CustomMappedNote(
    source.noteId,
    target.deckName,
    ankiFieldsFor(media.block, pack),
    false,
    noteTags(target.block.tags),
    media.mediaNames,
    pack.modelName,
  );
  note.mediaBase64Encoded = media.encoded;
  note.oldTags = source.tags;
  return { hash: await blockContentHash(target.block), note, source };
}

export async function buildCreatedNote(
  vault: Vault,
  target: PushTarget,
  pack: NotePack,
): Promise<{ hash: string; note: AnkiNote }> {
  const media = await mediaAwareBlock(vault, target);
  const note = new CustomMappedNote(
    -1,
    target.deckName,
    ankiFieldsFor(media.block, pack),
    false,
    noteTags(target.block.tags),
    media.mediaNames,
    pack.modelName,
  );
  note.mediaBase64Encoded = media.encoded;
  return { hash: await blockContentHash(target.block), note };
}

function notesByDeck(pushed: PushedNote[]): Map<string, PushedNote[]> {
  const byDeck = new Map<string, PushedNote[]>();
  for (const item of pushed) {
    const deckName = item.note.deckName;
    byDeck.set(deckName, [...(byDeck.get(deckName) ?? []), item]);
  }
  return byDeck;
}

export async function uploadNoteMedia(
  anki: Anki,
  notes: AnkiNote[],
): Promise<void> {
  const withMedia = notes.filter((note) => note.getMedias().length > 0);
  if (withMedia.length === 0) {
    return;
  }
  await anki.storeMediaFiles(withMedia);
}

export async function pushNotesToAnki(
  anki: Anki,
  pushed: PushedNote[],
): Promise<void> {
  if (pushed.length === 0) {
    return;
  }
  await uploadNoteMedia(
    anki,
    pushed.map((item) => item.note),
  );
  for (const group of notesByDeck(pushed).values()) {
    await anki.updateNotes(group.map((item) => item.note));
  }
}

export interface SyncedBaseline {
  hash: string;
  noteId: number;
}

export async function recordSyncedBaselines(
  anki: Anki,
  settings: ISettings,
  baselines: SyncedBaseline[],
): Promise<void> {
  if (baselines.length === 0) {
    return;
  }
  const fresh = await fetchNotesById(
    anki,
    baselines.map((baseline) => baseline.noteId),
  );
  for (const baseline of baselines) {
    settings.noteLifecycle[baseline.noteId] = syncedCleanRecord(
      fresh.get(baseline.noteId)?.mod ?? 0,
      baseline.hash,
      Date.now(),
    );
  }
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

export function mediaFileCount(notes: AnkiNote[]): number {
  return notes.reduce(
    (total, note) => total + note.mediaBase64Encoded.length,
    0,
  );
}

export function isAnkiNewer(source: AnkiNoteInfo, file: TFile): boolean {
  return (source.mod ?? 0) * 1000 > file.stat.mtime;
}

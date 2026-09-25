import type { TFile, Vault } from "obsidian";
import { noteFormLanguage } from "src/conf/constants";
import { parseNoteForm, serializeNoteForm } from "src/services/note-parser";
import type { NoteFormData } from "src/entities/note-form-data";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";
import { trimDashes } from "src/utils";

export type YamlNote = NoteFormData;

export function createNoteFencePattern(): RegExp {
  return /```note-form[^\n]*\n([\s\S]*?)\n```/g;
}

const maxFileNamePartBytes = 200;

function sanitizeFileNamePart(part: string): string {
  return trimDashes(part.replace(/[^\p{L}\p{N}]+/gu, "-"));
}

function stripMediaReferences(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[([^\]\n]{0,500})\]\(([^)\n]{0,2000})\)/g, "$1")
    .replace(/\[([^\]\n]{0,500})\]\(([^)\n]{0,2000})\)/g, "$1");
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>\n]{0,500}>/g, "");
}

function stripClozeMarkers(text: string): string {
  return text.replace(/\{\{c\d+::((?:(?!\}\})[\s\S])*)\}\}/g, "$1");
}

function utf8CharLength(code: number): number {
  if (code < 0x80) {
    return 1;
  }
  if (code < 0x800) {
    return 2;
  }
  if (code < 0x10000) {
    return 3;
  }
  return 4;
}

function truncateToBytes(input: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  while (end < input.length) {
    const code = input.codePointAt(end) ?? 0;
    const length = utf8CharLength(code);
    if (bytes + length > maxBytes) {
      break;
    }
    bytes += length;
    end += code > 0xffff ? 2 : 1;
  }
  return input.slice(0, end);
}

function extractYamlNoteBlocks(content: string): string[] {
  const blocks: string[] = [];
  const fencePattern = createNoteFencePattern();
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

export function parseYamlNotes(
  content: string,
  yaml: YamlEngine = obsidianYamlEngine,
): YamlNote[] {
  const notes: YamlNote[] = [];
  for (const block of extractYamlNoteBlocks(content)) {
    try {
      notes.push(parseNoteForm(block, yaml));
    } catch {
      continue;
    }
  }
  return notes;
}

function utf8Encode(input: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    let code = input.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < input.length) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

export async function computeContentHash(
  front: string,
  back: string,
  tags: string,
  model: string,
): Promise<string> {
  const bytes = utf8Encode(`${front}\n${back}\n${tags}\n${model}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function serializeYamlNote(
  note: YamlNote,
  yaml: YamlEngine = obsidianYamlEngine,
): string {
  const body = serializeNoteForm(note, yaml);
  return `\`\`\`${noteFormLanguage}\n${body}\n\`\`\``;
}

export function yamlNoteFileName(
  deckName: string,
  front: string,
  noteId: number,
): string {
  const cleaned = truncateToBytes(
    sanitizeFileNamePart(
      stripHtmlTags(stripClozeMarkers(stripMediaReferences(front))),
    ),
    maxFileNamePartBytes,
  );
  const stem = trimDashes(cleaned) || sanitizeFileNamePart(deckName) || "note";
  return `${stem}-${noteId}.md`;
}

export async function readYamlNotes(
  vault: Vault,
  file: TFile,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<YamlNote[]> {
  const content = await vault.read(file);
  return parseYamlNotes(content, yaml);
}

import type { TFile, Vault } from "obsidian";
import { flashcardFormLanguage } from "src/conf/constants";
import {
  parseFlashcardForm,
  serializeFlashcardForm,
} from "src/gui/flashcard-form/parser";
import type { FlashcardFormData } from "src/gui/flashcard-form/types";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";

export type YamlFlashcard = FlashcardFormData;

export function createFlashcardFencePattern(): RegExp {
  return /```flashcard-form[^\n]*\n([\s\S]*?)\n```/g;
}

function sanitizeFileNamePart(part: string): string {
  return part
    .split("::")
    .join("-")
    .replace(/[/\\:*?"<>|]/g, "-")
    .trim();
}

export function extractYamlFlashcardBlocks(content: string): string[] {
  const blocks: string[] = [];
  const fencePattern = createFlashcardFencePattern();
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

export function parseYamlFlashcards(
  content: string,
  yaml: YamlEngine = obsidianYamlEngine
): YamlFlashcard[] {
  const cards: YamlFlashcard[] = [];
  for (const block of extractYamlFlashcardBlocks(content)) {
    try {
      cards.push(parseFlashcardForm(block, yaml));
    } catch {
      continue;
    }
  }
  return cards;
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
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export async function computeContentHash(
  front: string,
  back: string,
  tags: string
): Promise<string> {
  const bytes = utf8Encode(`${front}\n${back}\n${tags}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function serializeYamlFlashcard(
  card: YamlFlashcard,
  yaml: YamlEngine = obsidianYamlEngine
): string {
  const body = serializeFlashcardForm(card, yaml);
  return `\`\`\`${flashcardFormLanguage}\n${body}\n\`\`\``;
}

export function yamlNoteFileName(
  deckName: string,
  tags: string[],
  noteId: number
): string {
  const deckPart = sanitizeFileNamePart(deckName) || "note";
  const tagParts = tags
    .map((tag) => sanitizeFileNamePart(tag))
    .filter((part) => part.length > 0);
  return `${[deckPart, ...tagParts].join("-")}-${noteId}.md`;
}

export async function readYamlFlashcards(
  vault: Vault,
  file: TFile,
  yaml: YamlEngine = obsidianYamlEngine
): Promise<YamlFlashcard[]> {
  const content = await vault.read(file);
  return parseYamlFlashcards(content, yaml);
}

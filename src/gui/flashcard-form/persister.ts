import { TFile } from "obsidian";
import type {
  MarkdownPostProcessorContext,
  Vault,
} from "obsidian";
import { serializeFlashcardForm } from "src/gui/flashcard-form/parser";
import type { FlashcardFormData } from "src/gui/flashcard-form/types";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";

export interface FlashcardFormSection {
  lineEnd: number;
  lineStart: number;
  sourcePath: string;
}

export function readFlashcardFormSection(
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement
): FlashcardFormSection | null {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    return null;
  }
  return {
    lineEnd: info.lineEnd,
    lineStart: info.lineStart,
    sourcePath: ctx.sourcePath,
  };
}

async function readSectionLines(
  vault: Vault,
  section: FlashcardFormSection
): Promise<string[] | null> {
  const file = vault.getAbstractFileByPath(section.sourcePath);
  if (!(file instanceof TFile)) {
    return null;
  }
  const content = await vault.read(file);
  return content.split("\n");
}

export async function readFlashcardFormBlock(
  vault: Vault,
  section: FlashcardFormSection
): Promise<string | null> {
  const lines = await readSectionLines(vault, section);
  if (!lines) {
    return null;
  }
  return lines.slice(section.lineStart, section.lineEnd + 1).join("\n");
}

export async function replaceFlashcardFormSection(
  vault: Vault,
  section: FlashcardFormSection,
  data: FlashcardFormData,
  yaml: YamlEngine = obsidianYamlEngine
): Promise<boolean> {
  const lines = await readSectionLines(vault, section);
  if (!lines) {
    return false;
  }
  const file = vault.getAbstractFileByPath(section.sourcePath);
  if (!(file instanceof TFile)) {
    return false;
  }
  const updated = [
    ...lines.slice(0, section.lineStart),
    ...serializeFlashcardForm(data, yaml).split("\n"),
    ...lines.slice(section.lineEnd + 1),
  ].join("\n");
  await vault.modify(file, updated);
  return true;
}

export async function saveFlashcardFormEdit(
  vault: Vault,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  expectedSource: string,
  data: FlashcardFormData,
  yaml: YamlEngine = obsidianYamlEngine
): Promise<string | null> {
  const section = readFlashcardFormSection(ctx, el);
  if (!section) {
    return null;
  }
  const current = await readFlashcardFormBlock(vault, section);
  if (current === null || current !== expectedSource) {
    return null;
  }
  const serialized = serializeFlashcardForm(data, yaml);
  if (serialized === expectedSource) {
    return serialized;
  }
  const replaced = await replaceFlashcardFormSection(vault, section, data, yaml);
  return replaced ? serialized : null;
}

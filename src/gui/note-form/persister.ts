import { TFile } from "obsidian";
import type { MarkdownPostProcessorContext, Vault } from "obsidian";
import { serializeNoteForm } from "src/services/note-parser";
import type { NoteFormData } from "src/entities/note-form-data";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";

export interface NoteFormSection {
  lineEnd: number;
  lineStart: number;
  sourcePath: string;
}

function readNoteFormSection(
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
): NoteFormSection | null {
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
  section: NoteFormSection,
): Promise<string[] | null> {
  const file = vault.getAbstractFileByPath(section.sourcePath);
  if (!(file instanceof TFile)) {
    return null;
  }
  const content = await vault.read(file);
  return content.split("\n");
}

async function readNoteFormBlock(
  vault: Vault,
  section: NoteFormSection,
): Promise<string | null> {
  const lines = await readSectionLines(vault, section);
  if (!lines) {
    return null;
  }
  return lines.slice(section.lineStart, section.lineEnd + 1).join("\n");
}

export async function replaceNoteFormSection(
  vault: Vault,
  section: NoteFormSection,
  data: NoteFormData,
  yaml: YamlEngine = obsidianYamlEngine,
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
    ...serializeNoteForm(data, yaml).split("\n"),
    ...lines.slice(section.lineEnd + 1),
  ].join("\n");
  await vault.modify(file, updated);
  return true;
}

export async function saveNoteFormEdit(
  vault: Vault,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  expectedSource: string,
  data: NoteFormData,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<string | null> {
  const section = readNoteFormSection(ctx, el);
  if (!section) {
    return null;
  }
  const current = await readNoteFormBlock(vault, section);
  if (current === null || current !== expectedSource) {
    return null;
  }
  const serialized = serializeNoteForm(data, yaml);
  if (serialized === expectedSource) {
    return serialized;
  }
  const replaced = await replaceNoteFormSection(vault, section, data, yaml);
  return replaced ? serialized : null;
}

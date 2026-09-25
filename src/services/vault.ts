import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { readYamlNotes } from "src/services/yaml-note";
import { createNoteFencePattern } from "src/services/yaml-note";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";
import type { YamlNote } from "src/services/yaml-note";

export type VaultNoteIndex = Map<number, string>;

export const defaultDeckName = "Default";

export function isIgnoredPath(
  filePath: string,
  ignoredDirectories: string,
): boolean {
  return ignoredDirectories
    .split(",")
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0)
    .some(
      (directory) =>
        filePath.startsWith(`${directory}/`) ||
        filePath.startsWith(`${directory}\\`),
    );
}

export function deckForPath(filePath: string): string {
  const folders = filePath.split("/").slice(0, -1);
  return folders.length === 0 ? defaultDeckName : folders.join("::");
}

export function noteFileAt(
  vault: Vault,
  index: VaultNoteIndex,
  noteId: number,
): TFile | null {
  const path = index.get(noteId);
  if (path === undefined) {
    return null;
  }
  const file = vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

const noteIdPattern =
  /(?:^|[,{\n])[ \t]*(?:['"]id['"]|id)[ \t]*:[ \t]*['"]?(\d+)['"]?/gm;

export function extractYamlNoteIds(content: string): number[] {
  const ids: number[] = [];
  const fencePattern = createNoteFencePattern();
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    ids.push(...idsInNoteFormBlock(match[1] ?? ""));
  }
  return ids;
}

function idsInNoteFormBlock(block: string): number[] {
  const ids: number[] = [];
  noteIdPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = noteIdPattern.exec(block)) !== null) {
    ids.push(Number(match[1]));
  }
  return ids;
}

export function extractFileNoteIndex(
  content: string,
  filePath: string,
  vaultNoteIndex: VaultNoteIndex,
): void {
  for (const noteId of extractYamlNoteIds(content)) {
    vaultNoteIndex.set(noteId, filePath);
  }
}

export async function collectVaultNoteIndex(
  vault: Vault,
): Promise<VaultNoteIndex> {
  const vaultNoteIndex: VaultNoteIndex = new Map<number, string>();
  const files: TFile[] = vault.getMarkdownFiles();
  for (const file of files) {
    const content = await vault.cachedRead(file);
    extractFileNoteIndex(content, file.path, vaultNoteIndex);
  }
  return vaultNoteIndex;
}

export async function findVaultNoteBlock(
  vault: Vault,
  index: VaultNoteIndex,
  noteId: number,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<YamlNote | null> {
  const path = index.get(noteId);
  if (!path) {
    return null;
  }
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return null;
  }
  const notes = await readYamlNotes(vault, file, yaml);
  return notes.find((note) => note.id === noteId) ?? null;
}

export async function ensureFolderExists(
  vault: Vault,
  folderPath: string,
): Promise<void> {
  if (!folderPath) {
    return;
  }
  const parts = folderPath.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (await vault.getAbstractFileByPath(current)) {
      continue;
    }
    try {
      await vault.createFolder(current);
    } catch {
      return;
    }
  }
}

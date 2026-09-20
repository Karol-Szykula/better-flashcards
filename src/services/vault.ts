import type { TFile, Vault } from "obsidian";
import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import type { ISettings } from "src/conf/settings";

export type VaultNoteIndex = Map<number, string>;

const yamlIdPattern = /^id:\s*(\d+)\s*$/gm;

export function extractYamlNoteIds(content: string): number[] {
  const ids: number[] = [];
  yamlIdPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = yamlIdPattern.exec(content)) !== null) {
    ids.push(Number(match[1]));
  }
  return ids;
}

export function extractFileNoteIndex(
  parser: Parser,
  content: string,
  filePath: string,
  vaultNoteIndex: VaultNoteIndex
): void {
  for (const block of parser.getAnkiIDsBlocks(content)) {
    vaultNoteIndex.set(Number(block[1]), filePath);
  }
  for (const noteId of extractYamlNoteIds(content)) {
    vaultNoteIndex.set(noteId, filePath);
  }
}

export async function collectVaultNoteIndex(
  vault: Vault,
  settings: ISettings
): Promise<VaultNoteIndex> {
  const vaultNoteIndex: VaultNoteIndex = new Map<number, string>();
  const parser = new Parser(new Regex(settings), settings);
  const files: TFile[] = vault.getMarkdownFiles();
  for (const file of files) {
    const content = await vault.cachedRead(file);
    extractFileNoteIndex(parser, content, file.path, vaultNoteIndex);
  }
  return vaultNoteIndex;
}

export async function ensureFolderExists(
  vault: Vault,
  folderPath: string
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

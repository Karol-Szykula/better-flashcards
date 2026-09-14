import type { TFile, Vault } from "obsidian";
import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import type { ISettings } from "src/conf/settings";

export type VaultNoteIndex = Map<number, string>;

export function extractFileNoteIndex(
  parser: Parser,
  content: string,
  filePath: string,
  vaultNoteIndex: VaultNoteIndex
): void {
  for (const block of parser.getAnkiIDsBlocks(content)) {
    vaultNoteIndex.set(Number(block[1]), filePath);
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

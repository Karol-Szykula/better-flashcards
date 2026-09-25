import type { Vault } from "obsidian";
import type { ISettings } from "src/conf/settings";
import {
  collectVaultNoteIndex,
  findVaultNoteBlock,
  isIgnoredPath,
  type VaultNoteIndex,
} from "src/services/vault";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";

export interface PurgeLedgerReport {
  forgotten: number;
  kept: number;
  outOfScope: number;
  unreadable: number;
}

type RecordVerdict = "forgotten" | "kept" | "outOfScope" | "unreadable";

async function recordVerdict(
  vault: Vault,
  index: VaultNoteIndex,
  noteId: number,
  ignoredDirectories: string,
  yaml: YamlEngine,
): Promise<RecordVerdict> {
  const path = index.get(noteId);
  if (path === undefined) {
    return "forgotten";
  }
  if (isIgnoredPath(path, ignoredDirectories)) {
    return "outOfScope";
  }
  const block = await findVaultNoteBlock(vault, index, noteId, yaml);
  return block === null ? "unreadable" : "kept";
}

export async function forgetRecordsWithoutFiles(
  vault: Vault,
  settings: ISettings,
  yaml: YamlEngine = obsidianYamlEngine,
): Promise<PurgeLedgerReport> {
  const index = await collectVaultNoteIndex(vault);
  const records = settings.noteLifecycle;
  const forgotten: number[] = [];
  let kept = 0;
  let outOfScope = 0;
  let unreadable = 0;
  for (const key of Object.keys(records)) {
    const verdict = await recordVerdict(
      vault,
      index,
      Number(key),
      settings.ignoredDirectories,
      yaml,
    );
    if (verdict === "kept") {
      kept += 1;
    } else if (verdict === "outOfScope") {
      outOfScope += 1;
    } else if (verdict === "unreadable") {
      unreadable += 1;
    } else {
      forgotten.push(Number(key));
    }
  }
  settings.noteLifecycle = Object.fromEntries(
    Object.entries(records).filter(
      ([noteId]) => !forgotten.includes(Number(noteId)),
    ),
  );
  return {
    forgotten: forgotten.length,
    kept,
    outOfScope,
    unreadable,
  };
}

export function formatPurgeLedgerReport(report: PurgeLedgerReport): string {
  const outOfScope =
    report.outOfScope > 0 ? `, ${report.outOfScope} in ignored folders` : "";
  const unreadable =
    report.unreadable > 0 ? `, ${report.unreadable} unreadable` : "";
  return `Ledger: forgot ${report.forgotten} records (the import wizard will offer the ones Anki still has as new), kept ${report.kept}${outOfScope}${unreadable}.`;
}

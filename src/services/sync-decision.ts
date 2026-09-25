import type {
  NoteLifecycleEvent,
  NoteLifecycleStatus,
} from "src/services/note-lifecycle";

export const OUT_OF_SCOPE = "OUT_OF_SCOPE";

export const SYNC_COMMANDS = ["export", "import", "sync"] as const;

export type SyncCommand = (typeof SYNC_COMMANDS)[number];

type SyncCommandOwner = SyncCommand | "purge" | "wizard";

export type SyncDecisionAct = NoteLifecycleEvent | typeof OUT_OF_SCOPE;

export type OutcomeKind =
  "conflict" | "create" | "missing" | "quiet" | "skip" | "overwrite";

export interface SyncDecisionRow {
  act: SyncDecisionAct;
  forcedAct?: SyncDecisionAct;
  forcedOutcome?: string;
  kind: OutcomeKind;
  owner: SyncCommandOwner;
  rationale: string;
}

const enrolsSameFile =
  "Has an id but no record: enrols it, rewrites the same file.";

const staleRecord = "Only a stale record left: Purge ledger forgets it.";

const decisions: Record<
  SyncCommand,
  Record<NoteLifecycleStatus, SyncDecisionRow>
> = {
  import: {
    "ankiOnly.neverImported": {
      act: "IMPORT",
      kind: "create",
      owner: "import",
      rationale: "Anki only: creates the file.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      forcedAct: "RESURRECT",
      forcedOutcome: "Anki wins: re-creates the file you deleted.",
      kind: "missing",
      owner: "sync",
      rationale: "File gone: Sync decides, Anki wins re-creates it.",
    },
    "synced.clean": {
      act: "CHECK",
      forcedOutcome: "Anki wins: rewrites the same content.",
      kind: "quiet",
      owner: "sync",
      rationale: "Both sides match: rewrites nothing.",
    },
    "synced.ankiNewer": {
      act: "PULL",
      kind: "overwrite",
      owner: "sync",
      rationale: "Newer in Anki: overwrites your file.",
    },
    "synced.vaultNewer": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PULL",
      forcedOutcome: "Anki wins: overwrites your newer edits.",
      kind: "skip",
      owner: "sync",
      rationale: "Newer in Obsidian: skipped, use Sync.",
    },
    "synced.diverged": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PULL",
      forcedOutcome: "Anki wins: overwrites your newer edits.",
      kind: "conflict",
      owner: "sync",
      rationale: "Edited in both: newest wins on Sync.",
    },
    "linked.unenrolled": {
      act: "ENROLL",
      kind: "quiet",
      owner: "wizard",
      rationale: enrolsSameFile,
    },
    "vaultOnly.unexported": {
      act: OUT_OF_SCOPE,
      kind: "create",
      owner: "export",
      rationale: "Vault only: the export wizard creates it.",
    },
    "vaultOnly.unenrolled": {
      act: "ENROLL",
      kind: "quiet",
      owner: "wizard",
      rationale: enrolsSameFile,
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "sync",
      rationale: "Gone from Anki: Sync deletes the file.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "purge",
      rationale: staleRecord,
    },
  },
  export: {
    "ankiOnly.neverImported": {
      act: OUT_OF_SCOPE,
      kind: "create",
      owner: "import",
      rationale: "Anki only: the import wizard brings it in.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "sync",
      rationale: "File gone: Sync decides, nothing to push.",
    },
    "synced.clean": {
      act: "CHECK",
      kind: "quiet",
      owner: "sync",
      rationale: "Both sides match: nothing to write.",
    },
    "synced.ankiNewer": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PUSH",
      forcedOutcome: "Obsidian wins: overwrites Anki.",
      kind: "skip",
      owner: "sync",
      rationale: "Newer in Anki: skipped, use Sync.",
    },
    "synced.vaultNewer": {
      act: "PUSH",
      kind: "overwrite",
      owner: "export",
      rationale: "Newer in Obsidian: pushes to Anki.",
    },
    "synced.diverged": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PUSH",
      forcedOutcome: "Obsidian wins: overwrites Anki.",
      kind: "conflict",
      owner: "sync",
      rationale: "Edited in both: skipped, use Sync.",
    },
    "linked.unenrolled": {
      act: "ENROLL",
      kind: "quiet",
      owner: "wizard",
      rationale: "Has an id but no record: enrols it, writes nothing.",
    },
    "vaultOnly.unexported": {
      act: "EXPORT",
      kind: "create",
      owner: "export",
      rationale: "Vault only: creates the Anki note, writes the id back.",
    },
    "vaultOnly.unenrolled": {
      act: "ENROLL",
      kind: "quiet",
      owner: "wizard",
      rationale: "Has an id but no record: enrols it, writes nothing.",
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      forcedAct: "EXPORT",
      forcedOutcome: "Obsidian wins: re-creates it in Anki.",
      kind: "missing",
      owner: "sync",
      rationale: "Gone from Anki: Sync applies the deletion.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "purge",
      rationale: staleRecord,
    },
  },
  sync: {
    "ankiOnly.neverImported": {
      act: OUT_OF_SCOPE,
      kind: "create",
      owner: "import",
      rationale: "Untracked Anki note: counted as needing import.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "sync",
      rationale:
        "No file: the purge path handles it outside this table, the tombstone rule arrives with UC-30.",
    },
    "synced.clean": {
      act: "CHECK",
      kind: "quiet",
      owner: "sync",
      rationale: "Both sides match: nothing to do.",
    },
    "synced.ankiNewer": {
      act: "PULL",
      kind: "overwrite",
      owner: "sync",
      rationale: "Newer in Anki: refreshes the vault file.",
    },
    "synced.vaultNewer": {
      act: "PUSH",
      kind: "overwrite",
      owner: "sync",
      rationale: "Newer in Obsidian: pushes to Anki.",
    },
    "synced.diverged": {
      act: "RESOLVE_NEWEST",
      kind: "conflict",
      owner: "sync",
      rationale: "Edited in both: the newer side wins.",
    },
    "linked.unenrolled": {
      act: OUT_OF_SCOPE,
      kind: "quiet",
      owner: "wizard",
      rationale: "Enrolling is the wizards' job.",
    },
    "vaultOnly.unexported": {
      act: OUT_OF_SCOPE,
      kind: "create",
      owner: "export",
      rationale: "Vault only: the export wizard creates it.",
    },
    "vaultOnly.unenrolled": {
      act: OUT_OF_SCOPE,
      kind: "quiet",
      owner: "wizard",
      rationale: "Enrolling is the wizards' job.",
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "sync",
      rationale:
        "Gone from Anki: the purge path handles it, DELETE_FILE arrives with UC-31.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
      kind: "missing",
      owner: "purge",
      rationale: staleRecord,
    },
  },
};

export function isInScope(act: SyncDecisionAct): act is NoteLifecycleEvent {
  return act !== OUT_OF_SCOPE;
}

export function syncDecisionFor(
  command: SyncCommand,
  status: NoteLifecycleStatus,
): SyncDecisionRow {
  return decisions[command][status];
}

export function decisionActFor(
  command: SyncCommand,
  status: NoteLifecycleStatus,
  isForced = false,
): SyncDecisionAct {
  const row = decisions[command][status];
  if (isForced && row.forcedAct !== undefined) {
    return row.forcedAct;
  }
  return row.act;
}

const forceLabels: Record<SyncCommand, string> = {
  export: "Obsidian wins",
  import: "Anki wins",
  sync: "no force",
};

function whyOf(row: SyncDecisionRow): string {
  return row.forcedOutcome === undefined
    ? row.rationale
    : `${row.rationale} Forced: ${row.forcedOutcome}`;
}

export function syncDecisionTableMarkdown(): string {
  const sections: string[] = [];
  for (const command of SYNC_COMMANDS) {
    const rows = Object.entries(decisions[command]).map(
      ([status, row]) =>
        `| \`${status}\` | \`${row.kind}\` | \`${row.act}\` | \`${row.forcedAct ?? "-"}\` | \`${row.owner}\` | ${whyOf(row)} |`,
    );
    sections.push(
      [
        `## ${command} (force: ${forceLabels[command]})`,
        "",
        "| state | kind | default | forced | owner | why |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

import type {
  NoteLifecycleEvent,
  NoteLifecycleStatus,
} from "src/services/note-lifecycle";

export const OUT_OF_SCOPE = "OUT_OF_SCOPE";

export const SYNC_COMMANDS = ["export", "import", "sync"] as const;

export type SyncCommand = (typeof SYNC_COMMANDS)[number];

type SyncCommandOwner = SyncCommand | "purge" | "wizard";

export type SyncDecisionAct = NoteLifecycleEvent | typeof OUT_OF_SCOPE;

export interface SyncDecisionRow {
  act: SyncDecisionAct;
  forcedAct?: SyncDecisionAct;
  owner: SyncCommandOwner;
  rationale: string;
}

const wizardEnrolment =
  "The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*.";

const staleRecord =
  "Nothing in Anki, nothing in the vault, only a stale record: Purge ledger forgets it, no command acts on the note.";

const decisions: Record<
  SyncCommand,
  Record<NoteLifecycleStatus, SyncDecisionRow>
> = {
  import: {
    "ankiOnly.neverImported": {
      act: "IMPORT",
      owner: "import",
      rationale:
        "Only Anki has it and the vault never had it: write the file and enrol the note.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      forcedAct: "RESURRECT",
      owner: "sync",
      rationale:
        "The file is gone and Sync owns the rule (resurrect iff Anki is newer); the wizard never resurrects on its own, and only Anki wins re-creates the file.",
    },
    "synced.clean": {
      act: "CHECK",
      owner: "sync",
      rationale:
        "Both sides match the record: the wizard writes nothing and says which file already carries the note.",
    },
    "synced.ankiNewer": {
      act: "PULL",
      owner: "sync",
      rationale: "Anki is newer: refresh the vault file with Anki's version.",
    },
    "synced.vaultNewer": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PULL",
      owner: "sync",
      rationale:
        "Obsidian is newer: import never overwrites a newer edit - the user forces this one note or Sync decides.",
    },
    "synced.diverged": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PULL",
      owner: "sync",
      rationale:
        "Edited in both places: import never resolves a conflict by clocks - the user forces it or Sync takes the newest.",
    },
    "linked.unenrolled": {
      act: "ENROLL",
      owner: "wizard",
      rationale: wizardEnrolment,
    },
    "vaultOnly.unexported": {
      act: OUT_OF_SCOPE,
      owner: "export",
      rationale:
        "Only the vault has it and Anki has never seen it: the export wizard creates it.",
    },
    "vaultOnly.unenrolled": {
      act: "ENROLL",
      owner: "wizard",
      rationale: wizardEnrolment,
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      owner: "sync",
      rationale:
        "The note is gone from Anki: Sync applies the deletion; Obsidian wins re-creates it in the export wizard.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
      owner: "purge",
      rationale: staleRecord,
    },
  },
  export: {
    "ankiOnly.neverImported": {
      act: OUT_OF_SCOPE,
      owner: "import",
      rationale:
        "Only Anki has it: the import wizard brings it into the vault.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      owner: "sync",
      rationale:
        "The vault file is gone: Sync owns the deletion rule and the export has nothing to push.",
    },
    "synced.clean": {
      act: "CHECK",
      owner: "sync",
      rationale: "Both sides match the record: nothing is written to Anki.",
    },
    "synced.ankiNewer": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PUSH",
      owner: "sync",
      rationale:
        "Anki is newer: export never overwrites it - the user forces it or Sync pulls.",
    },
    "synced.vaultNewer": {
      act: "PUSH",
      owner: "export",
      rationale:
        "Obsidian is newer: push the change to Anki and store the new baseline.",
    },
    "synced.diverged": {
      act: OUT_OF_SCOPE,
      forcedAct: "FORCE_PUSH",
      owner: "sync",
      rationale:
        "Edited in both places: export does not guess - Obsidian wins forces it, Sync takes the newest.",
    },
    "linked.unenrolled": {
      act: "ENROLL",
      owner: "wizard",
      rationale: wizardEnrolment,
    },
    "vaultOnly.unexported": {
      act: "EXPORT",
      owner: "export",
      rationale:
        "Only the vault has it: create the Anki note and write the new id back into the block.",
    },
    "vaultOnly.unenrolled": {
      act: "ENROLL",
      owner: "wizard",
      rationale: wizardEnrolment,
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      forcedAct: "EXPORT",
      owner: "sync",
      rationale:
        "The note was deleted in Anki: Sync applies the deletion, Obsidian wins re-creates it on demand.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
      owner: "purge",
      rationale: staleRecord,
    },
  },
  sync: {
    "ankiOnly.neverImported": {
      act: OUT_OF_SCOPE,
      owner: "import",
      rationale:
        "An untracked Anki note is counted as needing import; Sync only touches tracked notes.",
    },
    "ankiOnly.fileDeleted": {
      act: OUT_OF_SCOPE,
      owner: "sync",
      rationale:
        "A tracked note with no file: the purge path handles it outside the resolver today, the tombstone rule arrives with UC-30.",
    },
    "synced.clean": {
      act: "CHECK",
      owner: "sync",
      rationale: "Both sides match the record: nothing to do.",
    },
    "synced.ankiNewer": {
      act: "PULL",
      owner: "sync",
      rationale: "Anki is newer: refresh the vault file.",
    },
    "synced.vaultNewer": {
      act: "PUSH",
      owner: "sync",
      rationale: "Obsidian is newer: push to Anki.",
    },
    "synced.diverged": {
      act: "RESOLVE_NEWEST",
      owner: "sync",
      rationale:
        "Edited in both: the newer side wins (Anki mod against file mtime), ties are reported.",
    },
    "linked.unenrolled": {
      act: OUT_OF_SCOPE,
      owner: "wizard",
      rationale:
        "Enrolling is the wizards' job; Sync counts these as needing import.",
    },
    "vaultOnly.unexported": {
      act: OUT_OF_SCOPE,
      owner: "export",
      rationale: "Only the vault has it: the export wizard creates it.",
    },
    "vaultOnly.unenrolled": {
      act: OUT_OF_SCOPE,
      owner: "wizard",
      rationale: "A block with an id and no record: the wizards enrol it.",
    },
    "vaultOnly.ankiDeleted": {
      act: OUT_OF_SCOPE,
      owner: "sync",
      rationale:
        "The note is gone from Anki: the deletion is applied by the purge path today, DELETE_FILE arrives with UC-31.",
    },
    orphaned: {
      act: OUT_OF_SCOPE,
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

export function syncDecisionTableMarkdown(): string {
  const sections: string[] = [];
  for (const command of SYNC_COMMANDS) {
    const rows = Object.entries(decisions[command]).map(
      ([status, row]) =>
        `| \`${status}\` | \`${row.act}\` | \`${row.forcedAct ?? "-"}\` | \`${row.owner}\` | ${row.rationale} |`,
    );
    sections.push(
      [
        `## ${command} (force: ${forceLabels[command]})`,
        "",
        "| state | default | forced | owner | why |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

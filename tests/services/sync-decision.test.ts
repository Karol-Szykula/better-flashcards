import { readFileSync } from "fs";
import {
  NOTE_LIFECYCLE_EVENTS,
  NOTE_LIFECYCLE_STATUSES,
  transitionNoteLifecycle,
  type NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import {
  decisionActFor,
  isInScope,
  OUT_OF_SCOPE,
  SYNC_COMMANDS,
  syncDecisionFor,
  syncDecisionTableMarkdown,
  type SyncCommand,
  type SyncDecisionAct,
} from "src/services/sync-decision";

type Case = [
  command: SyncCommand,
  status: NoteLifecycleStatus,
  defaultAct: SyncDecisionAct,
  forcedAct?: SyncDecisionAct,
];

const cases: Case[] = [
  ["import", "ankiOnly.neverImported", "IMPORT"],
  ["import", "ankiOnly.fileDeleted", OUT_OF_SCOPE, "RESURRECT"],
  ["import", "synced.clean", "CHECK"],
  ["import", "synced.ankiNewer", "PULL"],
  ["import", "synced.vaultNewer", OUT_OF_SCOPE, "FORCE_PULL"],
  ["import", "synced.diverged", OUT_OF_SCOPE, "FORCE_PULL"],
  ["import", "linked.unenrolled", "ENROLL"],
  ["import", "vaultOnly.unexported", OUT_OF_SCOPE],
  ["import", "vaultOnly.unenrolled", "ENROLL"],
  ["import", "vaultOnly.ankiDeleted", OUT_OF_SCOPE],
  ["import", "orphaned", OUT_OF_SCOPE],
  ["export", "ankiOnly.neverImported", OUT_OF_SCOPE],
  ["export", "ankiOnly.fileDeleted", OUT_OF_SCOPE],
  ["export", "synced.clean", "CHECK"],
  ["export", "synced.ankiNewer", OUT_OF_SCOPE, "FORCE_PUSH"],
  ["export", "synced.vaultNewer", "PUSH"],
  ["export", "synced.diverged", OUT_OF_SCOPE, "FORCE_PUSH"],
  ["export", "linked.unenrolled", "ENROLL"],
  ["export", "vaultOnly.unexported", "EXPORT"],
  ["export", "vaultOnly.unenrolled", "ENROLL"],
  ["export", "vaultOnly.ankiDeleted", OUT_OF_SCOPE, "EXPORT"],
  ["export", "orphaned", OUT_OF_SCOPE],
  ["sync", "ankiOnly.neverImported", OUT_OF_SCOPE],
  ["sync", "ankiOnly.fileDeleted", OUT_OF_SCOPE],
  ["sync", "synced.clean", "CHECK"],
  ["sync", "synced.ankiNewer", "PULL"],
  ["sync", "synced.vaultNewer", "PUSH"],
  ["sync", "synced.diverged", "RESOLVE_NEWEST"],
  ["sync", "linked.unenrolled", OUT_OF_SCOPE],
  ["sync", "vaultOnly.unexported", OUT_OF_SCOPE],
  ["sync", "vaultOnly.unenrolled", OUT_OF_SCOPE],
  ["sync", "vaultOnly.ankiDeleted", OUT_OF_SCOPE],
  ["sync", "orphaned", OUT_OF_SCOPE],
];

const defaultCases: Array<[SyncCommand, NoteLifecycleStatus, SyncDecisionAct]> =
  cases.map(([command, status, defaultAct]) => [command, status, defaultAct]);

const forcedCases: Array<[SyncCommand, NoteLifecycleStatus, SyncDecisionAct]> =
  cases.map(([command, status, defaultAct, forcedAct]) => [
    command,
    status,
    forcedAct ?? defaultAct,
  ]);

describe("decisionActFor", () => {
  test.each(defaultCases)(
    "given %2$p when %1$p runs it returns %3$p",
    (command, status, expected) => {
      expect(decisionActFor(command, status)).toBe(expected);
    },
  );

  test.each(forcedCases)(
    "given %2$p when %1$p runs it with its force it returns %3$p",
    (command, status, expected) => {
      expect(decisionActFor(command, status, true)).toBe(expected);
    },
  );
});

const confinement: Record<SyncCommand, readonly SyncDecisionAct[]> = {
  export: ["EXPORT", "PUSH", "FORCE_PUSH", "ENROLL", "CHECK", OUT_OF_SCOPE],
  import: [
    "IMPORT",
    "PULL",
    "FORCE_PULL",
    "RESURRECT",
    "ENROLL",
    "CHECK",
    OUT_OF_SCOPE,
  ],
  sync: ["PULL", "PUSH", "RESOLVE_NEWEST", "ENROLL", "CHECK", OUT_OF_SCOPE],
};

describe("the decision table is total", () => {
  test("given every command and status when a row is read then it has an act, an owner and a rationale", () => {
    for (const command of SYNC_COMMANDS) {
      for (const status of NOTE_LIFECYCLE_STATUSES) {
        const row = syncDecisionFor(command, status);
        expect(row.act).toBeDefined();
        expect(row.owner).toBeDefined();
        expect(row.rationale.length).toBeGreaterThan(0);
      }
    }
  });

  test("given every command and status when the act is resolved then it is a lifecycle event or out of scope", () => {
    for (const command of SYNC_COMMANDS) {
      for (const status of NOTE_LIFECYCLE_STATUSES) {
        for (const act of [
          decisionActFor(command, status),
          decisionActFor(command, status, true),
        ]) {
          const known =
            act === OUT_OF_SCOPE ||
            (NOTE_LIFECYCLE_EVENTS as readonly string[]).includes(act);
          expect(known).toBe(true);
        }
      }
    }
  });

  test("given a row that acts when resolved then the act is legal in that state", () => {
    for (const command of SYNC_COMMANDS) {
      for (const status of NOTE_LIFECYCLE_STATUSES) {
        for (const act of [
          decisionActFor(command, status),
          decisionActFor(command, status, true),
        ]) {
          if (isInScope(act)) {
            expect(() => transitionNoteLifecycle(status, act)).not.toThrow();
          }
        }
      }
    }
  });

  test("given a wizard row that is out of scope when read then another command owns the note", () => {
    for (const command of ["export", "import"] as const) {
      for (const status of NOTE_LIFECYCLE_STATUSES) {
        const row = syncDecisionFor(command, status);
        if (row.act === OUT_OF_SCOPE) {
          expect(row.owner).not.toBe(command);
        }
      }
    }
  });

  test("given a Sync row that is out of scope when read then the owner is a known command or the purge", () => {
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      const row = syncDecisionFor("sync", status);
      expect(["export", "import", "purge", "sync", "wizard"]).toContain(
        row.owner,
      );
    }
  });

  test("given the two states Sync owns without a row then the rationale names the missing producer", () => {
    for (const status of [
      "ankiOnly.fileDeleted",
      "vaultOnly.ankiDeleted",
    ] as const) {
      const row = syncDecisionFor("sync", status);
      expect(row.act).toBe(OUT_OF_SCOPE);
      expect(row.owner).toBe("sync");
      expect(row.rationale).toMatch(/UC-3[01]/);
    }
  });
});

describe("command confinement", () => {
  test("given every row when read then the act stays inside the command's set", () => {
    for (const command of SYNC_COMMANDS) {
      const allowed = confinement[command];
      for (const status of NOTE_LIFECYCLE_STATUSES) {
        const row = syncDecisionFor(command, status);
        for (const act of [row.act, row.forcedAct]) {
          if (act !== undefined) {
            expect(allowed).toContain(act);
          }
        }
      }
    }
  });

  test("given the import command when it resolves then it never writes to Anki", () => {
    const writing = ["EXPORT", "PUSH", "FORCE_PUSH"];
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      for (const act of [
        decisionActFor("import", status),
        decisionActFor("import", status, true),
      ]) {
        expect(writing).not.toContain(act);
      }
    }
  });

  test("given the export command when it resolves then it never pulls into the vault", () => {
    const pulling = ["PULL", "FORCE_PULL", "IMPORT", "RESURRECT"];
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      for (const act of [
        decisionActFor("export", status),
        decisionActFor("export", status, true),
      ]) {
        expect(pulling).not.toContain(act);
      }
    }
  });
});

describe("syncDecisionTableMarkdown", () => {
  test("given the sync decision table doc when generated then it matches the table", () => {
    // given
    const doc = readFileSync("docs/sync-decision-table.md", "utf8");

    // when
    const table = syncDecisionTableMarkdown();

    // then
    expect(doc).toContain(table);
  });
});

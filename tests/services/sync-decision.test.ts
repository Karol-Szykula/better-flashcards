import { readFileSync } from "fs";
import type { NoteLifecycleStatus } from "src/services/note-lifecycle";
import {
  decisionActFor,
  OUT_OF_SCOPE,
  syncDecisionTableMarkdown,
  type SyncDecisionAct,
} from "src/services/sync-decision";

const importCases: Array<
  [NoteLifecycleStatus, SyncDecisionAct, SyncDecisionAct]
> = [
  ["ankiOnly.neverImported", "IMPORT", "IMPORT"],
  ["ankiOnly.fileDeleted", OUT_OF_SCOPE, "RESURRECT"],
  ["synced.clean", "CHECK", "CHECK"],
  ["synced.ankiNewer", "PULL", "PULL"],
  ["synced.vaultNewer", OUT_OF_SCOPE, "FORCE_PULL"],
  ["synced.diverged", OUT_OF_SCOPE, "FORCE_PULL"],
  ["linked.unenrolled", "ENROLL", "ENROLL"],
  ["vaultOnly.unexported", OUT_OF_SCOPE, OUT_OF_SCOPE],
  ["vaultOnly.unenrolled", "ENROLL", "ENROLL"],
  ["vaultOnly.ankiDeleted", OUT_OF_SCOPE, OUT_OF_SCOPE],
  ["orphaned", OUT_OF_SCOPE, OUT_OF_SCOPE],
];

const exportCases: Array<
  [NoteLifecycleStatus, SyncDecisionAct, SyncDecisionAct]
> = [
  ["ankiOnly.neverImported", OUT_OF_SCOPE, OUT_OF_SCOPE],
  ["ankiOnly.fileDeleted", OUT_OF_SCOPE, OUT_OF_SCOPE],
  ["synced.clean", "CHECK", "CHECK"],
  ["synced.ankiNewer", OUT_OF_SCOPE, "FORCE_PUSH"],
  ["synced.vaultNewer", "PUSH", "PUSH"],
  ["synced.diverged", OUT_OF_SCOPE, "FORCE_PUSH"],
  ["linked.unenrolled", "ENROLL", "ENROLL"],
  ["vaultOnly.unexported", "EXPORT", "EXPORT"],
  ["vaultOnly.unenrolled", "ENROLL", "ENROLL"],
  ["vaultOnly.ankiDeleted", OUT_OF_SCOPE, "EXPORT"],
  ["orphaned", OUT_OF_SCOPE, OUT_OF_SCOPE],
];

const syncCases: Array<[NoteLifecycleStatus, SyncDecisionAct]> = [
  ["ankiOnly.neverImported", OUT_OF_SCOPE],
  ["ankiOnly.fileDeleted", OUT_OF_SCOPE],
  ["synced.clean", "CHECK"],
  ["synced.ankiNewer", "PULL"],
  ["synced.vaultNewer", "PUSH"],
  ["synced.diverged", "RESOLVE_NEWEST"],
  ["linked.unenrolled", OUT_OF_SCOPE],
  ["vaultOnly.unexported", OUT_OF_SCOPE],
  ["vaultOnly.unenrolled", OUT_OF_SCOPE],
  ["vaultOnly.ankiDeleted", OUT_OF_SCOPE],
  ["orphaned", OUT_OF_SCOPE],
];

describe("decisionActFor", () => {
  test.each(importCases)(
    "given %p when importing then %p and with Anki wins %p",
    (status, expected, expectedForced) => {
      expect(decisionActFor("import", status)).toBe(expected);
      expect(decisionActFor("import", status, true)).toBe(expectedForced);
    },
  );

  test.each(exportCases)(
    "given %p when exporting then %p and with Obsidian wins %p",
    (status, expected, expectedForced) => {
      expect(decisionActFor("export", status)).toBe(expected);
      expect(decisionActFor("export", status, true)).toBe(expectedForced);
    },
  );

  test.each(syncCases)("given %p when syncing then %p", (status, expected) => {
    expect(decisionActFor("sync", status)).toBe(expected);
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

import { getSimplePaths } from "@xstate/graph";
import { readFileSync } from "fs";
import { createActor } from "xstate";
import {
  NOTE_LIFECYCLE_EVENTS,
  NOTE_LIFECYCLE_STATUSES,
  classifyNoteLifecycle,
  exportActFor,
  importActFor,
  isForceDecisive,
  isImportSelectedByDefault,
  noteLifecycleMachine,
  noteLifecycleMermaid,
  notePreviewStatusFor,
  resolveMissingFile,
  snapshotForStatus,
  syncActFor,
  statusOfSnapshot,
  transitionNoteLifecycle,
  type NoteLifecycleEvent,
  type NoteLifecycleStatus,
  type NotePreviewStatus,
} from "src/services/note-lifecycle";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import type { NoteLifecycleRecord } from "src/services/note-lifecycle";

function ankiNote(noteId: number, mod: number): AnkiNoteInfo {
  return {
    cards: [7],
    fields: { Front: { value: "Q" } },
    mod,
    noteId,
    tags: [],
  };
}

function vaultBlock(id: number | undefined, hash: string) {
  return { id, hash };
}

function syncRecord(mod: number, hash: string): NoteLifecycleRecord {
  return {
    lastHash: hash,
    lastMod: mod,
    status: "synced.clean",
    updatedAt: 0,
    v: 1,
  };
}

const definedTransitions: Array<
  [NoteLifecycleStatus, NoteLifecycleEvent, NoteLifecycleStatus]
> = [
  ["ankiOnly.neverImported", "IMPORT", "synced.clean"],
  ["ankiOnly.neverImported", "SKIP", "ankiOnly.neverImported"],
  ["ankiOnly.fileDeleted", "RESURRECT", "synced.ankiNewer"],
  ["ankiOnly.fileDeleted", "PURGE", "orphaned"],
  ["synced.clean", "CHECK", "synced.clean"],
  ["synced.ankiNewer", "PULL", "synced.clean"],
  ["synced.ankiNewer", "FORCE_PUSH", "synced.clean"],
  ["synced.vaultNewer", "PUSH", "synced.clean"],
  ["synced.vaultNewer", "FORCE_PULL", "synced.clean"],
  ["synced.vaultNewer", "RESOLVE_NEWEST", "synced.clean"],
  ["synced.diverged", "FORCE_PULL", "synced.clean"],
  ["synced.diverged", "FORCE_PUSH", "synced.clean"],
  ["synced.diverged", "RESOLVE_NEWEST", "synced.clean"],
  ["linked.unenrolled", "ENROLL", "synced.clean"],
  ["vaultOnly.unexported", "EXPORT", "synced.clean"],
  ["vaultOnly.unenrolled", "ENROLL", "synced.clean"],
  ["vaultOnly.ankiDeleted", "EXPORT", "synced.clean"],
  ["vaultOnly.ankiDeleted", "DELETE_FILE", "orphaned"],
  ["orphaned", "PURGE", "orphaned"],
];

const definedPairs = new Set(
  definedTransitions.map(([status, event]) => `${status}|${event}`),
);

describe("transitionNoteLifecycle", () => {
  test.each(definedTransitions)(
    "given %p when %p then moves to %p",
    (status, event, expected) => {
      // when
      const next = transitionNoteLifecycle(status, event);

      // then
      expect(next).toBe(expected);
    },
  );

  test("given every status and event pair when transitioned then only defined moves succeed", () => {
    // given
    const rejected: Array<[NoteLifecycleStatus, NoteLifecycleEvent]> = [];
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      for (const event of NOTE_LIFECYCLE_EVENTS) {
        if (!definedPairs.has(`${status}|${event}`)) {
          rejected.push([status, event]);
        }
      }
    }

    // then
    expect(rejected.length).toBeGreaterThan(0);
    for (const [status, event] of rejected) {
      expect(() => transitionNoteLifecycle(status, event)).toThrow();
    }
  });

  test("given an unknown status when transitioned then throws", () => {
    expect(() =>
      transitionNoteLifecycle("nope" as NoteLifecycleStatus, "CHECK"),
    ).toThrow();
  });
});

describe("classifyNoteLifecycle", () => {
  test("given an anki note without block or record when classified then never imported", () => {
    expect(classifyNoteLifecycle({ anki: ankiNote(1, 100) })).toBe(
      "ankiOnly.neverImported",
    );
  });

  test("given an anki note with a record but no block when classified then file deleted", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 100),
        record: syncRecord(90, "h"),
      }),
    ).toBe("ankiOnly.fileDeleted");
  });

  test("given matching mod and hash when classified then clean", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 100),
        block: vaultBlock(1, "h"),
        record: syncRecord(100, "h"),
      }),
    ).toBe("synced.clean");
  });

  test("given only anki newer when classified then anki newer", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 200),
        block: vaultBlock(1, "h"),
        record: syncRecord(100, "h"),
      }),
    ).toBe("synced.ankiNewer");
  });

  test("given only vault newer when classified then vault newer", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 100),
        block: vaultBlock(1, "changed"),
        record: syncRecord(100, "h"),
      }),
    ).toBe("synced.vaultNewer");
  });

  test("given both newer when classified then diverged", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 200),
        block: vaultBlock(1, "changed"),
        record: syncRecord(100, "h"),
      }),
    ).toBe("synced.diverged");
  });

  test("given an id link without record when classified then unenrolled", () => {
    expect(
      classifyNoteLifecycle({
        anki: ankiNote(1, 100),
        block: vaultBlock(1, "h"),
      }),
    ).toBe("linked.unenrolled");
  });

  test("given a vault block with id but no anki or record when classified then vault unenrolled", () => {
    expect(classifyNoteLifecycle({ block: vaultBlock(9, "h") })).toBe(
      "vaultOnly.unenrolled",
    );
  });

  test("given a vault block without id when classified then unexported", () => {
    expect(classifyNoteLifecycle({ block: vaultBlock(undefined, "h") })).toBe(
      "vaultOnly.unexported",
    );
  });

  test("given a vault block with record but no anki when classified then anki deleted", () => {
    expect(
      classifyNoteLifecycle({
        block: vaultBlock(9, "h"),
        record: syncRecord(100, "h"),
      }),
    ).toBe("vaultOnly.ankiDeleted");
  });

  test("given only a stale record when classified then orphaned", () => {
    expect(classifyNoteLifecycle({ record: syncRecord(100, "h") })).toBe(
      "orphaned",
    );
  });

  test("given nothing when classified then throws", () => {
    expect(() => classifyNoteLifecycle({})).toThrow();
  });
});

describe("noteLifecycleMermaid", () => {
  test("given the synchronization doc when generated then it matches the table", () => {
    // given
    const doc = readFileSync("docs/synchronization.md", "utf8");

    // when
    const diagram = noteLifecycleMermaid();

    // then
    expect(doc).toContain(`\`\`\`mermaid\n${diagram}\n\`\`\``);
  });
});

describe("importActFor", () => {
  test.each([
    ["ankiOnly.neverImported", "IMPORT"],
    ["synced.clean", "CHECK"],
    ["synced.ankiNewer", "PULL"],
    ["linked.unenrolled", "ENROLL"],
    ["vaultOnly.unenrolled", "ENROLL"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p when resolved then returns %p",
    (status, expected) => {
      expect(importActFor(status)).toBe(expected);
    },
  );

  test.each(["synced.vaultNewer", "synced.diverged"] as NoteLifecycleStatus[])(
    "given %p without force when resolved then leaves the note alone",
    (status) => {
      expect(importActFor(status)).toBeUndefined();
    },
  );

  test.each([
    ["synced.vaultNewer", "FORCE_PULL"],
    ["synced.diverged", "FORCE_PULL"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p with force when resolved then returns %p",
    (status, expected) => {
      expect(importActFor(status, true)).toBe(expected);
    },
  );

  test("given a note without a file with force when resolved then resurrects it", () => {
    // given
    const status: NoteLifecycleStatus = "ankiOnly.fileDeleted";

    // when
    const act = importActFor(status, true);

    // then
    expect(act).toBe("RESURRECT");
  });

  test.each([
    ["ankiOnly.neverImported", "IMPORT"],
    ["synced.clean", "CHECK"],
    ["synced.ankiNewer", "PULL"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p with force when resolved then the default act %p stands",
    (status, expected) => {
      expect(importActFor(status, true)).toBe(expected);
    },
  );

  test.each([
    "ankiOnly.fileDeleted",
    "vaultOnly.unexported",
    "vaultOnly.ankiDeleted",
    "orphaned",
  ] as NoteLifecycleStatus[])(
    "given %p when resolved then leaves the note alone",
    (status) => {
      expect(importActFor(status)).toBeUndefined();
    },
  );
});

describe("syncActFor", () => {
  test.each([
    ["synced.clean", "CHECK"],
    ["synced.ankiNewer", "PULL"],
    ["synced.vaultNewer", "PUSH"],
    ["synced.diverged", "RESOLVE_NEWEST"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p when resolved then returns %p",
    (status, expected) => {
      expect(syncActFor(status)).toBe(expected);
    },
  );

  test.each([
    "ankiOnly.fileDeleted",
    "ankiOnly.neverImported",
    "linked.unenrolled",
    "vaultOnly.unexported",
    "vaultOnly.ankiDeleted",
    "orphaned",
  ] as NoteLifecycleStatus[])(
    "given %p when resolved then leaves the note to the user or Sync",
    (status) => {
      expect(syncActFor(status)).toBeUndefined();
    },
  );
});

describe("FORCE_PULL transitions", () => {
  test.each(["synced.vaultNewer", "synced.diverged"] as NoteLifecycleStatus[])(
    "given %p when forced then lands clean",
    (status) => {
      expect(transitionNoteLifecycle(status, "FORCE_PULL")).toBe(
        "synced.clean",
      );
    },
  );

  test.each(["synced.clean", "synced.ankiNewer"] as NoteLifecycleStatus[])(
    "given %p when forced then throws",
    (status) => {
      expect(() => transitionNoteLifecycle(status, "FORCE_PULL")).toThrow();
    },
  );
});

describe("exportActFor", () => {
  test.each([
    ["vaultOnly.unexported", "EXPORT"],
    ["linked.unenrolled", "ENROLL"],
    ["vaultOnly.unenrolled", "ENROLL"],
    ["synced.vaultNewer", "PUSH"],
    ["synced.clean", "CHECK"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p when resolved then returns %p",
    (status, expected) => {
      expect(exportActFor(status)).toBe(expected);
    },
  );

  test.each([
    "synced.ankiNewer",
    "synced.diverged",
    "vaultOnly.ankiDeleted",
    "ankiOnly.neverImported",
    "ankiOnly.fileDeleted",
    "orphaned",
  ] as NoteLifecycleStatus[])(
    "given %p without Obsidian wins when resolved then leaves it to Sync",
    (status) => {
      expect(exportActFor(status)).toBeUndefined();
    },
  );

  test.each([
    ["synced.ankiNewer", "FORCE_PUSH"],
    ["synced.diverged", "FORCE_PUSH"],
    ["vaultOnly.ankiDeleted", "EXPORT"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p with Obsidian wins when resolved then returns %p",
    (status, expected) => {
      expect(exportActFor(status, true)).toBe(expected);
    },
  );

  test.each([
    ["synced.vaultNewer", "PUSH"],
    ["synced.clean", "CHECK"],
    ["vaultOnly.unexported", "EXPORT"],
  ] as Array<[NoteLifecycleStatus, NoteLifecycleEvent]>)(
    "given %p with Obsidian wins when resolved then the default act %p stands",
    (status, expected) => {
      expect(exportActFor(status, true)).toBe(expected);
    },
  );
});

describe("FORCE_PUSH transitions", () => {
  test.each(["synced.ankiNewer", "synced.diverged"] as NoteLifecycleStatus[])(
    "given %p when Obsidian wins then lands clean",
    (status) => {
      expect(transitionNoteLifecycle(status, "FORCE_PUSH")).toBe(
        "synced.clean",
      );
    },
  );

  test.each(["synced.clean", "synced.vaultNewer"] as NoteLifecycleStatus[])(
    "given %p when Obsidian wins then throws",
    (status) => {
      expect(() => transitionNoteLifecycle(status, "FORCE_PUSH")).toThrow();
    },
  );
});

describe("resolveMissingFile", () => {
  test("given anki newer than the record when resolved then resurrects", () => {
    expect(resolveMissingFile(200, 100)).toBe("RESURRECT");
  });

  test("given anki not newer than the record when resolved then purges", () => {
    expect(resolveMissingFile(100, 100)).toBe("PURGE");
    expect(resolveMissingFile(50, 100)).toBe("PURGE");
  });
});

describe("notePreviewStatusFor", () => {
  test.each([
    ["ankiOnly.neverImported", "new"],
    ["ankiOnly.fileDeleted", "noFile"],
    ["linked.unenrolled", "new"],
    ["vaultOnly.unenrolled", "new"],
    ["vaultOnly.unexported", "new"],
    ["vaultOnly.ankiDeleted", "new"],
    ["orphaned", "new"],
    ["synced.clean", "upToDate"],
    ["synced.ankiNewer", "newerInAnki"],
    ["synced.vaultNewer", "newerInVault"],
    ["synced.diverged", "diverged"],
  ] as Array<[NoteLifecycleStatus, string]>)(
    "given %p when viewed in the wizard then shows %p",
    (status, expected) => {
      expect(notePreviewStatusFor(status)).toBe(expected);
    },
  );
});

describe("isImportSelectedByDefault", () => {
  test.each([
    ["new", true],
    ["newerInAnki", true],
    ["newerInVault", false],
    ["diverged", false],
    ["noFile", false],
    ["upToDate", false],
  ] as Array<[string, boolean]>)(
    "given %p when the preview opens then selected is %p",
    (status, expected) => {
      expect(isImportSelectedByDefault(status as NotePreviewStatus)).toBe(
        expected,
      );
    },
  );
});

describe("isForceDecisive", () => {
  test.each([
    ["noFile", true],
    ["newerInVault", true],
    ["diverged", true],
    ["new", false],
    ["newerInAnki", false],
    ["upToDate", false],
  ] as Array<[string, boolean]>)(
    "given %p when the user forces it then the outcome changes is %p",
    (status, expected) => {
      expect(isForceDecisive(status as NotePreviewStatus)).toBe(expected);
    },
  );
});

describe("noteLifecycleMachine", () => {
  test("given every defined move when run through the machine then agrees with the table", () => {
    for (const [status, event, expected] of definedTransitions) {
      // given
      const actor = createActor(noteLifecycleMachine, {
        snapshot: noteLifecycleMachine.getPersistedSnapshot(
          snapshotForStatus(status),
        ),
      });
      actor.start();

      // when
      actor.send({ type: event });

      // then
      expect(statusOfSnapshot(actor.getSnapshot())).toBe(expected);
      actor.stop();
    }
  });

  test("given every status when explored from it then all simple paths execute through the wrapper", () => {
    for (const start of NOTE_LIFECYCLE_STATUSES) {
      // given
      const paths = getSimplePaths(noteLifecycleMachine, {
        fromState: snapshotForStatus(start),
      });
      expect(paths.length).toBeGreaterThan(0);

      // when
      for (const path of paths) {
        let current = start;
        for (const step of path.steps) {
          if (step.event.type.startsWith("xstate.")) {
            continue;
          }
          current = transitionNoteLifecycle(
            current,
            step.event.type as NoteLifecycleEvent,
          );
        }

        // then
        expect(current).toBe(statusOfSnapshot(path.state));
      }
    }
  });
});

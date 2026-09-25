import {
  NOTE_LIFECYCLE_EVENTS,
  NOTE_LIFECYCLE_STATUSES,
  transitionNoteLifecycle,
  type NoteLifecycleEvent,
  type NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import {
  decisionActFor,
  isInScope,
  SYNC_COMMANDS,
} from "src/services/sync-decision";

const unreachableInTheTable: Record<string, string> = {
  "ankiOnly.neverImported SKIP":
    "no command sends SKIP: a note the command leaves alone keeps its state without an event",
  "ankiOnly.fileDeleted PURGE":
    "Purge ledger forgets the record outside the resolver, so no row emits it; UC-25l documents the action",
  "orphaned PURGE":
    "the purge path in Sync forgets the record outside the resolver; UC-25l documents the action",
  "vaultOnly.ankiDeleted DELETE_FILE":
    "no producer exists: Sync does not handle this state yet, UC-31 adds the action",
};

function emittedEvents(): Set<string> {
  const emitted = new Set<string>();
  for (const command of SYNC_COMMANDS) {
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      for (const act of [
        decisionActFor(command, status),
        decisionActFor(command, status, true),
      ]) {
        if (isInScope(act)) {
          emitted.add(act);
        }
      }
    }
  }
  return emitted;
}

function machineAllows(
  status: NoteLifecycleStatus,
  event: NoteLifecycleEvent,
): boolean {
  try {
    transitionNoteLifecycle(status, event);
    return true;
  } catch {
    return false;
  }
}

describe("machine reachability", () => {
  test("given every state of the machine when asked then only the documented events have no row", () => {
    const emitted = emittedEvents();
    const unreachable: string[] = [];
    for (const status of NOTE_LIFECYCLE_STATUSES) {
      for (const event of NOTE_LIFECYCLE_EVENTS) {
        if (machineAllows(status, event) && !emitted.has(event)) {
          unreachable.push(`${status} ${event}`);
        }
      }
    }
    expect(unreachable.sort()).toEqual(
      Object.keys(unreachableInTheTable).sort(),
    );
  });

  test("given the documented events with no row when read then each carries a reason", () => {
    for (const reason of Object.values(unreachableInTheTable)) {
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

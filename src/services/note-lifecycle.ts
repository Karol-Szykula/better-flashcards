import { createMachine, type StateValue } from "xstate";
import type { AnkiNoteInfo } from "src/entities/anki-note";

export const NOTE_LIFECYCLE_STATUSES = [
  "ankiOnly.neverImported",
  "ankiOnly.fileDeleted",
  "synced.clean",
  "synced.ankiNewer",
  "synced.vaultNewer",
  "synced.diverged",
  "linked.unenrolled",
  "vaultOnly.unexported",
  "vaultOnly.unenrolled",
  "vaultOnly.ankiDeleted",
  "orphaned",
] as const;

export type NoteLifecycleStatus = (typeof NOTE_LIFECYCLE_STATUSES)[number];

export const NOTE_LIFECYCLE_EVENTS = [
  "IMPORT",
  "EXPORT",
  "PULL",
  "PUSH",
  "FORCE_PULL",
  "FORCE_PUSH",
  "RESOLVE_NEWEST",
  "ENROLL",
  "RESURRECT",
  "DELETE_FILE",
  "PURGE",
  "SKIP",
  "CHECK",
] as const;

export type NoteLifecycleEvent = (typeof NOTE_LIFECYCLE_EVENTS)[number];

type TransitionTable = Record<
  NoteLifecycleStatus,
  Partial<Record<NoteLifecycleEvent, NoteLifecycleStatus>>
>;

/**
 * Single source of truth for allowed operations per state.
 * The xstate machine below is derived from this table, never edited directly.
 */
const lifecycleTransitions: TransitionTable = {
  "ankiOnly.neverImported": {
    IMPORT: "synced.clean",
    SKIP: "ankiOnly.neverImported",
  },
  "ankiOnly.fileDeleted": {
    RESURRECT: "synced.ankiNewer",
    PURGE: "orphaned",
  },
  "synced.clean": { CHECK: "synced.clean" },
  "synced.ankiNewer": {
    PULL: "synced.clean",
    FORCE_PUSH: "synced.clean",
  },
  "synced.vaultNewer": {
    PUSH: "synced.clean",
    FORCE_PULL: "synced.clean",
    RESOLVE_NEWEST: "synced.clean",
  },
  "synced.diverged": {
    FORCE_PULL: "synced.clean",
    FORCE_PUSH: "synced.clean",
    RESOLVE_NEWEST: "synced.clean",
  },
  "linked.unenrolled": { ENROLL: "synced.clean" },
  "vaultOnly.unexported": { EXPORT: "synced.clean" },
  "vaultOnly.unenrolled": { ENROLL: "synced.clean" },
  "vaultOnly.ankiDeleted": {
    DELETE_FILE: "orphaned",
    EXPORT: "synced.clean",
  },
  orphaned: { PURGE: "orphaned" },
};

const knownEvents = new Set<string>(NOTE_LIFECYCLE_EVENTS);

export function transitionNoteLifecycle(
  status: NoteLifecycleStatus,
  event: NoteLifecycleEvent,
): NoteLifecycleStatus {
  const moves = lifecycleTransitions[status];
  if (!knownEvents.has(event)) {
    throw new Error(`Unknown lifecycle event: ${event}`);
  }
  const next = moves[event];
  if (next === undefined) {
    throw new Error(`Event ${event} is not allowed in ${status}`);
  }
  return next;
}

const machineId = "noteLifecycle";

function regionOf(status: NoteLifecycleStatus): string {
  const dot = status.indexOf(".");
  return dot === -1 ? status : status.slice(0, dot);
}

function leafOf(status: NoteLifecycleStatus): string | undefined {
  const dot = status.indexOf(".");
  return dot === -1 ? undefined : status.slice(dot + 1);
}

function targetOf(target: NoteLifecycleStatus): string {
  return `#${machineId}.${target}`;
}

interface LeafConfig {
  on: Record<string, string>;
}

interface RegionConfig {
  initial?: string;
  on?: Record<string, string>;
  states?: Record<string, LeafConfig>;
}

function regionConfig(
  region: string,
  leaves: NoteLifecycleStatus[],
): RegionConfig {
  const movesOf = (status: NoteLifecycleStatus): Record<string, string> => {
    const moves: Record<string, string> = {};
    for (const [event, target] of Object.entries(
      lifecycleTransitions[status],
    )) {
      moves[event] = targetOf(target);
    }
    return moves;
  };
  const single = leaves.length === 1 ? leaves[0] : undefined;
  if (single !== undefined && leafOf(single) === undefined) {
    return { on: movesOf(single) };
  }
  const states: Record<string, LeafConfig> = {};
  for (const status of leaves) {
    states[leafOf(status) ?? region] = { on: movesOf(status) };
  }
  const firstLeaf = leaves[0];
  return {
    initial:
      (firstLeaf === undefined ? undefined : leafOf(firstLeaf)) ?? region,
    states,
  };
}

function machineStates(): Record<string, RegionConfig> {
  const grouped = new Map<string, NoteLifecycleStatus[]>();
  for (const status of NOTE_LIFECYCLE_STATUSES) {
    const region = regionOf(status);
    grouped.set(region, [...(grouped.get(region) ?? []), status]);
  }
  const states: Record<string, RegionConfig> = {};
  for (const [region, leaves] of grouped) {
    states[region] = regionConfig(region, leaves);
  }
  return states;
}

export const noteLifecycleMachine = createMachine({
  id: machineId,
  initial: "synced",
  states: machineStates(),
});

function toStateValue(status: NoteLifecycleStatus): StateValue {
  const dot = status.indexOf(".");
  if (dot === -1) {
    return { [status]: {} };
  }
  return { [status.slice(0, dot)]: status.slice(dot + 1) };
}

export function snapshotForStatus(status: NoteLifecycleStatus) {
  return noteLifecycleMachine.resolveState({ value: toStateValue(status) });
}

const knownStatuses = new Set<string>(NOTE_LIFECYCLE_STATUSES);

export function statusOfSnapshot(snapshot: {
  value: StateValue;
}): NoteLifecycleStatus {
  const value = snapshot.value;
  const status =
    typeof value === "string"
      ? value
      : (() => {
          const entries = Object.entries(value);
          if (entries.length !== 1) {
            throw new Error(
              `Unexpected machine value: ${JSON.stringify(value)}`,
            );
          }
          const [entryName, leaf] = entries[0] ?? [];
          return `${entryName ?? "?"}.${typeof leaf === "string" ? leaf : JSON.stringify(leaf)}`;
        })();
  if (!knownStatuses.has(status)) {
    throw new Error(`Unknown lifecycle status: ${status}`);
  }
  return status as NoteLifecycleStatus;
}

export interface NoteLifecycleRecord {
  lastHash: string;
  lastMod: number;
  status: NoteLifecycleStatus;
  updatedAt: number;
  v: number;
}

const noteLifecycleRecordVersion = 1;

export function syncedCleanRecord(
  lastMod: number,
  lastHash: string,
  updatedAt: number = Date.now(),
): NoteLifecycleRecord {
  return {
    lastHash,
    lastMod,
    status: "synced.clean",
    updatedAt,
    v: noteLifecycleRecordVersion,
  };
}

export interface LifecycleInputs {
  anki?: AnkiNoteInfo;
  block?: { id?: number; hash: string };
  record?: NoteLifecycleRecord;
}

export function classifyNoteLifecycle(
  inputs: LifecycleInputs,
): NoteLifecycleStatus {
  const { anki, block, record } = inputs;
  if (anki === undefined) {
    if (block === undefined) {
      if (record === undefined) {
        throw new Error(
          "Nothing to classify: no anki note, vault block or record",
        );
      }
      return "orphaned";
    }
    if (record === undefined) {
      return block.id === undefined
        ? "vaultOnly.unexported"
        : "vaultOnly.unenrolled";
    }
    return "vaultOnly.ankiDeleted";
  }
  if (block === undefined) {
    if (record === undefined) {
      return "ankiOnly.neverImported";
    }
    return "ankiOnly.fileDeleted";
  }
  if (record === undefined) {
    return "linked.unenrolled";
  }
  const vaultDirty = block.hash !== record.lastHash;
  const ankiDirty = (anki.mod ?? 0) > record.lastMod;
  if (vaultDirty && ankiDirty) {
    return "synced.diverged";
  }
  if (ankiDirty) {
    return "synced.ankiNewer";
  }
  if (vaultDirty) {
    return "synced.vaultNewer";
  }
  return "synced.clean";
}

export function resolveMissingFile(
  ankiMod: number | undefined,
  recordLastMod: number,
): "RESURRECT" | "PURGE" {
  return (ankiMod ?? 0) > recordLastMod ? "RESURRECT" : "PURGE";
}

export type NotePreviewStatus =
  "new" | "newerInAnki" | "newerInVault" | "diverged" | "noFile" | "upToDate";

/**
 * What the import wizard will do with a note, from the user's point of view:
 * the direction of the change and the consequence of importing it.
 */
export function notePreviewStatusFor(
  status: NoteLifecycleStatus,
): NotePreviewStatus {
  switch (status) {
    case "synced.clean":
      return "upToDate";
    case "synced.ankiNewer":
      return "newerInAnki";
    case "synced.vaultNewer":
      return "newerInVault";
    case "synced.diverged":
      return "diverged";
    case "ankiOnly.fileDeleted":
      return "noFile";
    default:
      return "new";
  }
}

/** The import wizard writes the file for these unless the user changes it. */
export function isImportSelectedByDefault(status: NotePreviewStatus): boolean {
  return status === "new" || status === "newerInAnki";
}

/**
 * True when "Anki wins" changes the outcome: the default would have skipped
 * the note or written something else. False when the default already takes
 * Anki's version, or when forcing would only rewrite identical content.
 */
export function isForceDecisive(status: NotePreviewStatus): boolean {
  return (
    status === "noFile" || status === "newerInVault" || status === "diverged"
  );
}

export function noteLifecycleMermaid(): string {
  const idOf = (status: string): string => status.replace(".", "_");
  const lines = ["stateDiagram-v2"];
  for (const status of NOTE_LIFECYCLE_STATUSES) {
    lines.push(`  ${idOf(status)}["${status}"]`);
  }
  for (const status of NOTE_LIFECYCLE_STATUSES) {
    for (const [event, target] of Object.entries(
      lifecycleTransitions[status],
    )) {
      lines.push(`  ${idOf(status)} --> ${idOf(target)}: ${event}`);
    }
  }
  return lines.join("\n");
}

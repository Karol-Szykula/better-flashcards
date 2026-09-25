import type { NoteLifecycleStatus } from "src/services/note-lifecycle";

const bannerByStatus: Partial<Record<NoteLifecycleStatus, string>> = {
  "synced.diverged":
    "Edited in both Anki and Obsidian — the newest version wins on sync.",
  "vaultOnly.ankiDeleted":
    "Deleted in Anki — sync will remove this note from the vault.",
};

export function bannerForStatus(
  status: NoteLifecycleStatus | undefined,
): string | undefined {
  if (status === undefined) {
    return undefined;
  }
  return bannerByStatus[status];
}

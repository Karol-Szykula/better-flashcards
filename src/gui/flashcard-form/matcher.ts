import type { AnkiNoteInfo } from "src/entities/card";

export type FlashcardFormMatch =
  | { kind: "id"; noteId: number }
  | { kind: "hash"; noteId: number }
  | { kind: "new" };

export function matchFlashcardForm(
  formId: number | undefined,
  formHash: string,
  notes: AnkiNoteInfo[],
  hashes: Record<number, string>
): FlashcardFormMatch {
  if (formId !== undefined && notes.some((note) => note.noteId === formId)) {
    return { kind: "id", noteId: formId };
  }
  const hashedNoteId = notes
    .map((note) => note.noteId)
    .find((noteId) => hashes[noteId] === formHash);
  if (hashedNoteId !== undefined) {
    return { kind: "hash", noteId: hashedNoteId };
  }
  return { kind: "new" };
}

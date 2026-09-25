import { useCallback, useState } from "react";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import type { NoteLifecycleStatus } from "src/services/note-lifecycle";

export interface DeckPreview {
  deckNotes: AnkiNoteInfo[];
  handleNotesLoaded: (
    notes: AnkiNoteInfo[],
    statuses: Record<number, NoteLifecycleStatus>,
  ) => void;
  previewStatuses: Record<number, NoteLifecycleStatus>;
}

export function useDeckPreview(): DeckPreview {
  const [deckNotes, setDeckNotes] = useState<AnkiNoteInfo[]>([]);
  const [previewStatuses, setPreviewStatuses] = useState<
    Record<number, NoteLifecycleStatus>
  >({});

  const handleNotesLoaded = useCallback(
    (notes: AnkiNoteInfo[], statuses: Record<number, NoteLifecycleStatus>) => {
      setDeckNotes(notes);
      setPreviewStatuses(statuses);
    },
    [],
  );

  return {
    deckNotes,
    handleNotesLoaded,
    previewStatuses,
  };
}

import { useEffect, useMemo, useState, type JSX } from "react";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/card";
import type { VaultNoteIndex } from "src/services/vault";
import type { NoteSyncState } from "src/services/import";
import {
  classifyDeckNotes,
  fetchDeckNotes,
  normalizeCardText,
} from "src/services/import";
import type {
  ClassifiedNote,
  NoteImportStatus,
} from "src/services/import";
import {
  cardsPreviewClasses,
  commonWizardClasses,
  mergeClasses,
} from "src/gui/import-wizard/classes";
import { List } from "src/gui/import-wizard/list/List";
import { ListRow } from "src/gui/import-wizard/list/ListRow";

export interface CardsPreviewProps {
  anki: Anki;
  cardsSelectedToImport: Record<number, boolean>;
  className?: string;
  currentPage: number;
  deckName: string;
  onCardsSelectedToImportChange: (cardsSelectedToImport: Record<number, boolean>) => void;
  onNotesLoaded: (notes: AnkiNoteInfo[]) => void;
  onPageChange: (page: number) => void;
  onTotalPagesChange: (totalPages: number) => void;
  syncState: NoteSyncState;
  totalPages: number;
  vaultNoteIndex: VaultNoteIndex;
}

const previewPageSize = 100;

function noteSummary(note: AnkiNoteInfo): string {
  const front = note.fields["Front"]?.value;
  const firstField = Object.values(note.fields)[0]?.value ?? "";
  return normalizeCardText(front ?? firstField).slice(0, 80);
}

function previewRowRank(item: ClassifiedNote): number {
  return item.status === "imported" ? 1 : 0;
}

function previewBadgeClass(status: NoteImportStatus): string {
  if (status === "new") {
    return cardsPreviewClasses.previewBadgeNew;
  }
  if (status === "updated") {
    return cardsPreviewClasses.previewBadgeUpdated;
  }
  return cardsPreviewClasses.previewBadgeImported;
}

function previewBadgeText(item: ClassifiedNote): string {
  if (item.status === "new") {
    return " new";
  }
  if (item.status === "updated") {
    return " updated";
  }
  return ` imported (${item.vaultPath ?? "?"})`;
}

export function CardsPreview({
  anki,
  currentPage,
  deckName,
  onPageChange,
  onTotalPagesChange,
  syncState,
  vaultNoteIndex,
  cardsSelectedToImport,
  onCardsSelectedToImportChange,
  onNotesLoaded,
  className,
}: CardsPreviewProps): JSX.Element {
  const rootClassName = mergeClasses(commonWizardClasses.pageView, className);
  const [rawNotes, setRawNotes] = useState<AnkiNoteInfo[] | null>(null);
  const [progress, setProgress] = useState("");
  const [loadError, setLoadError] = useState("");
  const page = currentPage;
  const setPage = onPageChange;

  const loadPreviewNotes = () => {
    let cancelled = false;
    setRawNotes(null);
    setPage(0);
    void (async () => {
      try {
        const notes = await fetchDeckNotes(anki, deckName, (fetched, total) => {
          if (!cancelled) {
            setProgress(`Loading notes… ${fetched}/${total}`);
          }
        });
        if (!cancelled) {
          setRawNotes(notes);
          onNotesLoaded(notes);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Error: could not load notes.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  };

  useEffect(loadPreviewNotes, [anki, deckName]);

  const classified = useMemo(() => {
    if (!rawNotes) {
      return null;
    }
    const notes = classifyDeckNotes(rawNotes, vaultNoteIndex, syncState);
    return notes.sort(
      (first, second) => previewRowRank(first) - previewRowRank(second)
    );
  }, [rawNotes, vaultNoteIndex, syncState]);

  const applyDefaultCardsSelectedToImport = () => {
    if (!classified) {
      return;
    }
    if (classified.some((item) => !(item.note.noteId in cardsSelectedToImport))) {
      const merged = { ...cardsSelectedToImport };
      for (const item of classified) {
        if (!(item.note.noteId in merged)) {
          merged[item.note.noteId] = item.status !== "imported";
        }
      }
      onCardsSelectedToImportChange(merged);
    }
  };

  useEffect(applyDefaultCardsSelectedToImport, [classified, cardsSelectedToImport, onCardsSelectedToImportChange]);

  useEffect(() => {
    if (classified) {
      const pageCount = Math.max(1, Math.ceil(classified.length / previewPageSize));
      onTotalPagesChange(pageCount);
    }
  }, [classified, onTotalPagesChange]);

  if (loadError) {
    return (
      <div className={rootClassName}>
        <p>{loadError}</p>
      </div>
    );
  }
  if (!classified) {
    return (
      <div className={rootClassName}>
        <p>{progress || "Loading notes…"}</p>
      </div>
    );
  }
  const cardsSelectedToImportCount = Object.values(cardsSelectedToImport).filter(Boolean).length;
  const pageNotes = classified.slice(
    page * previewPageSize,
    page * previewPageSize + previewPageSize
  );
  return (
    <div className={rootClassName}>
      <p>
        Cards to import: {cardsSelectedToImportCount}/{classified.length}.
      </p>
      <List columns={["Select", "Card"]} columnWidths="auto 1fr">
        {pageNotes.map((item) => (
          <ListRow
            cells={[
              <input
                checked={cardsSelectedToImport[item.note.noteId] ?? false}
                disabled={item.status === "imported"}
                key="select"
                onChange={(event) =>
                  onCardsSelectedToImportChange({
                    ...cardsSelectedToImport,
                    [item.note.noteId]: event.target.checked,
                  })
                }
                type="checkbox"
              />,
              <label key="card">
                <span>{noteSummary(item.note)}</span>
                <span
                  className={mergeClasses(
                    cardsPreviewClasses.previewBadge,
                    previewBadgeClass(item.status)
                  )}
                >
                  {previewBadgeText(item)}
                </span>
              </label>,
            ]}
            className={mergeClasses(
              cardsPreviewClasses.previewRow,
              item.status === "imported"
                ? cardsPreviewClasses.previewRowImported
                : undefined
            )}
            key={item.note.noteId}
          />
        ))}
      </List>
    </div>
  );
}

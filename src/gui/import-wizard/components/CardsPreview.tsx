import { useEffect, useMemo, useState, type JSX } from "react";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/card";
import type { VaultNoteIndex } from "src/services/vault";
import {
  classifyDeckNotes,
  fetchDeckNotes,
  normalizeCardText,
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
  deckName: string;
  onCardsSelectedToImportChange: (cardsSelectedToImport: Record<number, boolean>) => void;
  vaultNoteIndex: VaultNoteIndex;
}

const previewPageSize = 100;

function noteSummary(note: AnkiNoteInfo): string {
  const front = note.fields["Front"]?.value;
  const firstField = Object.values(note.fields)[0]?.value ?? "";
  return normalizeCardText(front ?? firstField).slice(0, 80);
}

function ankiModified(mod: number | undefined): string {
  return mod ? new Date(mod * 1000).toLocaleString() : "unknown";
}

export function CardsPreview({
  anki,
  deckName,
  vaultNoteIndex,
  cardsSelectedToImport,
  onCardsSelectedToImportChange,
  className,
}: CardsPreviewProps): JSX.Element {
  const rootClassName = mergeClasses(commonWizardClasses.pageView, className);
  const [rawNotes, setRawNotes] = useState<AnkiNoteInfo[] | null>(null);
  const [progress, setProgress] = useState("");
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadPreviewNotes = () => {
    let cancelled = false;
    setRawNotes(null);
    setPage(0);
    setExpandedId(null);
    void (async () => {
      try {
        const notes = await fetchDeckNotes(anki, deckName, (fetched, total) => {
          if (!cancelled) {
            setProgress(`Loading notes… ${fetched}/${total}`);
          }
        });
        if (!cancelled) {
          setRawNotes(notes);
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

  const classified = useMemo(
    () => (rawNotes ? classifyDeckNotes(rawNotes, vaultNoteIndex) : null),
    [rawNotes, vaultNoteIndex]
  );

  const applyDefaultCardsSelectedToImport = () => {
    if (!classified) {
      return;
    }
    if (classified.some((item) => !(item.note.noteId in cardsSelectedToImport))) {
      const merged = { ...cardsSelectedToImport };
      for (const item of classified) {
        if (!(item.note.noteId in merged)) {
          merged[item.note.noteId] = item.status === "new";
        }
      }
      onCardsSelectedToImportChange(merged);
    }
  };

  useEffect(applyDefaultCardsSelectedToImport, [classified, cardsSelectedToImport, onCardsSelectedToImportChange]);

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
  const pageCount = Math.max(1, Math.ceil(classified.length / previewPageSize));
  const pageNotes = classified.slice(
    page * previewPageSize,
    page * previewPageSize + previewPageSize
  );
  const expandedItem =
    expandedId === null
      ? undefined
      : classified.find((item) => item.note.noteId === expandedId);
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
                key="select"
                onChange={(event) =>
                  onCardsSelectedToImportChange({
                    ...cardsSelectedToImport,
                    [item.note.noteId]: event.target.checked,
                  })
                }
                type="checkbox"
              />,
              <label
                key="card"
                onClick={() =>
                  setExpandedId(
                    expandedId === item.note.noteId ? null : item.note.noteId
                  )
                }
              >
                <span>{noteSummary(item.note)}</span>
                <span
                  className={mergeClasses(
                    cardsPreviewClasses.previewBadge,
                    item.status === "new"
                      ? cardsPreviewClasses.previewBadgeNew
                      : cardsPreviewClasses.previewBadgeConflict
                  )}
                >
                  {item.status === "new"
                    ? " new"
                    : ` conflict (${item.vaultPath ?? "?"})`}
                </span>
              </label>,
            ]}
            className={cardsPreviewClasses.previewRow}
            key={item.note.noteId}
          />
        ))}
      </List>
      {expandedItem && (
        <div className={cardsPreviewClasses.previewDetails}>
          <p>Anki modified: {ankiModified(expandedItem.note.mod)}</p>
          {Object.entries(expandedItem.note.fields).map(([name, content]) => (
            <div key={name}>
              <strong>{name}: </strong>
              <span>{normalizeCardText(content.value).slice(0, 200)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={cardsPreviewClasses.previewPagination}>
        <span>
          Page {page + 1}/{pageCount}
        </span>
        {page > 0 && (
          <button onClick={() => setPage(page - 1)}>← Prev</button>
        )}
        {page < pageCount - 1 && (
          <button onClick={() => setPage(page + 1)}>Next →</button>
        )}
      </div>
    </div>
  );
}

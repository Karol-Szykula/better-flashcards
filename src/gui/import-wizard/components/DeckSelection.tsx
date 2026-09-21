import { useEffect, useState, type JSX } from "react";
import type { Anki } from "src/services/anki";
import type { VaultNoteIndex } from "src/services/vault";
import type { NoteSyncState } from "src/services/import";
import { fetchDeckNotes, isNoteUpdatedSince } from "src/services/import";
import {
  commonWizardClasses,
  deckSelectionClasses,
  mergeClasses,
} from "src/gui/import-wizard/classes";
import { List } from "src/gui/import-wizard/list/List";
import { LabeledControl, ListRow } from "src/gui/import-wizard/list/ListRow";

export interface DeckSelectionProps {
  anki: Anki;
  className?: string;
  onSelectDeckName: (deckName: string) => void;
  selectedDeckName: string;
  syncState: NoteSyncState;
  vaultNoteIndex: VaultNoteIndex;
}

interface DeckWithNotes {
  deckName: string;
  noteIds: number[];
  updatedCount: number | null;
}

function deckSearchQuery(deckName: string): string {
  return `deck:"${deckName.replace(/"/g, "")}"`;
}

function countImportedNotes(
  noteIds: number[],
  vaultNoteIndex: VaultNoteIndex
): number {
  return noteIds.filter((id) => vaultNoteIndex.has(id)).length;
}

function isDeckFullyImported(
  noteIds: number[],
  importedCount: number
): boolean {
  return noteIds.length > 0 && importedCount === noteIds.length;
}

function isDeckEmpty(noteIds: number[]): boolean {
  return noteIds.length === 0;
}

function deckRowTooltip(
  isFullyImported: boolean,
  isEmptyDeck: boolean
): string | undefined {
  if (isFullyImported) {
    return "Already in Obsidian";
  }
  if (isEmptyDeck) {
    return "Empty deck";
  }
  return undefined;
}

function splitDeckHierarchy(deckName: string): {
  depth: number;
  shortName: string;
} {
  const hierarchy = deckName.split("::");
  return {
    depth: hierarchy.length - 1,
    shortName: hierarchy[hierarchy.length - 1],
  };
}

async function fetchDecksWithNotes(
  anki: Anki,
  vaultNoteIndex: VaultNoteIndex,
  syncState: NoteSyncState
): Promise<DeckWithNotes[]> {
  const deckNames = await anki.getDeckNames();
  const decksWithNotes = await Promise.all(
    deckNames.map(async (deckName) => {
      const noteIds = await anki.findNotes(deckSearchQuery(deckName));
      return {
        deckName,
        noteIds,
        updatedCount: await countUpdatedNotes(
          anki,
          deckName,
          noteIds,
          vaultNoteIndex,
          syncState
        ),
      };
    })
  );
  return decksWithNotes.filter(
    ({ deckName, noteIds }) => !isEmptyDefaultDeck(deckName, noteIds)
  );
}

async function countUpdatedNotes(
  anki: Anki,
  deckName: string,
  noteIds: number[],
  vaultNoteIndex: VaultNoteIndex,
  syncState: NoteSyncState
): Promise<number | null> {
  if (countImportedNotes(noteIds, vaultNoteIndex) !== noteIds.length) {
    return null;
  }
  if (isDeckEmpty(noteIds)) {
    return null;
  }
  try {
    const notes = await fetchDeckNotes(anki, deckName);
    return notes.filter((note) => isNoteUpdatedSince(note, syncState)).length;
  } catch {
    return null;
  }
}

function isEmptyDefaultDeck(deckName: string, noteIds: number[]): boolean {
  return deckName === "Default" && noteIds.length === 0;
}

export function DeckSelection({
  anki,
  syncState,
  vaultNoteIndex,
  selectedDeckName,
  onSelectDeckName,
  className,
}: DeckSelectionProps): JSX.Element {
  const [decks, setDecks] = useState<DeckWithNotes[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadDeckList = () => {
    let isCancelled = false;
    void (async () => {
      try {
        const decksWithNotes = await fetchDecksWithNotes(
          anki,
          vaultNoteIndex,
          syncState
        );
        if (!isCancelled) {
          setDecks(decksWithNotes);
        }
      } catch {
        if (!isCancelled) {
          setLoadError(
            "Error: Anki must be open with AnkiConnect installed."
          );
        }
      }
    })();
    return () => {
      isCancelled = true;
    };
  };

  useEffect(loadDeckList, [anki, vaultNoteIndex, syncState]);

  const rootClassName = mergeClasses(commonWizardClasses.pageView, className);
  const listColumns = ["Deck", "Imported"];

  if (loadError) {
    return (
      <div className={rootClassName}>
        <p>{loadError}</p>
      </div>
    );
  }
  if (decks === null) {
    return (
      <div className={rootClassName}>
        <p>Connecting to Anki…</p>
      </div>
    );
  }
  if (!decks.length) {
    return (
      <div className={rootClassName}>
        <p>No decks found in Anki.</p>
      </div>
    );
  }
  return (
    <div className={rootClassName}>
      <p>Select a deck to import:</p>
      <List columns={listColumns} columnWidths="1fr auto" dividers="bottom">
        {decks.map(({ deckName, noteIds, updatedCount }) => {
          const importedCount = countImportedNotes(noteIds, vaultNoteIndex);
          const upToDateCount =
            updatedCount === null ? importedCount : noteIds.length - updatedCount;
          const isFullyImported = isDeckFullyImported(noteIds, upToDateCount);
          const isEmptyDeck = isDeckEmpty(noteIds);
          const isDisabled = isEmptyDeck;
          const { depth, shortName } = splitDeckHierarchy(deckName);
          const tooltip = deckRowTooltip(isFullyImported, isEmptyDeck);
          const deckRowCells = [
            <LabeledControl
              control={
                <input
                  checked={deckName === selectedDeckName}
                  className={deckSelectionClasses.deckRadio}
                  disabled={isDisabled}
                  name="flashcards-import-wizard-modal-deck"
                  onChange={() => onSelectDeckName(deckName)}
                  title={tooltip}
                  type="radio"
                  value={deckName}
                />
              }
              controlLabel={shortName}
              disabled={isDisabled}
              key="select"
              label={
                <span className={deckSelectionClasses.deckLabelText}>
                  {shortName}
                </span>
              }
              tooltip={tooltip}
            />,
            <span key="count">
              {upToDateCount}/{noteIds.length}
            </span>,
          ];
          return (
            <ListRow
              cells={deckRowCells}
              className={mergeClasses(
                deckSelectionClasses.deckRow,
                isDisabled ? deckSelectionClasses.deckRowDisabled : undefined
              )}
              disabled={isDisabled}
              key={deckName}
              onSelect={() => onSelectDeckName(deckName)}
              style={{
                paddingLeft: `calc(${depth} * var(--flashcards-import-wizard-modal__row-indent) + 0.25rem)`,
              }}
            />
          );
        })}
      </List>
    </div>
  );
}

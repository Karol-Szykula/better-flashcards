import { useEffect, useState, type JSX } from "react";
import { mergeClasses } from "src/gui/classes";
import { startAsyncLoad } from "src/gui/import-wizard/start-async-load";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import type { Vault } from "obsidian";
import type { VaultNoteIndex } from "src/services/vault";
import { findVaultNoteBlock } from "src/services/vault";
import {
  classifyNoteLifecycle,
  notePreviewStatusFor,
} from "src/services/note-lifecycle";
import type {
  NoteLifecycleEvent,
  NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import { decisionActFor, syncDecisionFor } from "src/services/sync-decision";
import type { SyncDecisionRow } from "src/services/sync-decision";
import type { NoteLifecycleRecord } from "src/services/note-lifecycle";
import { computeContentHash } from "src/services/yaml-note";
import { fetchDeckNotes, normalizeNoteText } from "src/services/import";
import type { ClassifiedNote } from "src/services/import";
import type { NotePreviewStatus } from "src/services/note-lifecycle";
import {
  notesPreviewClasses,
  commonWizardClasses,
} from "src/gui/import-wizard/classes";
import { List } from "src/gui/import-wizard/list/List";
import { ListRow } from "src/gui/import-wizard/list/ListRow";

export interface NotesPreviewProps {
  readonly anki: Anki;
  readonly className?: string;
  readonly currentPage: number;
  readonly deckName: string;
  readonly forcedNoteIds: Record<number, boolean>;
  readonly noteLifecycle: Record<number, NoteLifecycleRecord>;
  readonly notesSelectedToImport: Record<number, boolean>;
  readonly onForcedNoteIdsChange: (
    forcedNoteIds: Record<number, boolean>,
  ) => void;
  readonly onNotesLoaded: (
    notes: AnkiNoteInfo[],
    statuses: Record<number, NoteLifecycleStatus>,
  ) => void;
  readonly onNotesSelectedToImportChange: (
    notesSelectedToImport: Record<number, boolean>,
  ) => void;
  readonly onPageChange: (page: number) => void;
  readonly onTotalPagesChange: (totalPages: number) => void;
  readonly totalPages: number;
  readonly vault: Vault;
  readonly vaultNoteIndex: VaultNoteIndex;
}

const previewPageSize = 100;

function noteSummary(note: AnkiNoteInfo): string {
  const front = note.fields["Front"]?.value;
  const firstField = Object.values(note.fields)[0]?.value ?? "";
  return normalizeNoteText(front ?? firstField).slice(0, 80);
}

const previewRowOrder: NotePreviewStatus[] = [
  "new",
  "newerInAnki",
  "newerInVault",
  "diverged",
  "noFile",
  "upToDate",
];

function previewRowRank(item: ClassifiedNote): number {
  return previewRowOrder.indexOf(item.previewStatus);
}

function importRow(item: ClassifiedNote): SyncDecisionRow {
  return syncDecisionFor("import", item.status);
}

const importWriteActs: readonly NoteLifecycleEvent[] = [
  "ENROLL",
  "FORCE_PULL",
  "IMPORT",
  "PULL",
  "RESURRECT",
];

function isImportSelectedByDefault(status: NoteLifecycleStatus): boolean {
  return importWriteActs.includes(
    decisionActFor("import", status) as NoteLifecycleEvent,
  );
}

function previewBadgeClass(item: ClassifiedNote): string {
  const { kind } = importRow(item);
  if (kind === "create") {
    return notesPreviewClasses.previewBadgeNew;
  }
  if (kind === "quiet") {
    return notesPreviewClasses.previewBadgeImported;
  }
  if (kind === "skip" || kind === "conflict") {
    return notesPreviewClasses.previewBadgeSkipped;
  }
  if (kind === "overwrite") {
    return notesPreviewClasses.previewBadgeOverwrite;
  }
  return notesPreviewClasses.previewBadgeImported;
}

function previewBadgeOutcome(item: ClassifiedNote): string {
  const row = importRow(item);
  if (item.previewStatus === "noFile") {
    return item.isInVaultIndex
      ? "No file: no readable note-form block for this id, Sync decides."
      : "No file: this id is nowhere in the vault, Sync decides.";
  }
  if (item.previewStatus === "upToDate") {
    return `${row.rationale} (${item.vaultPath ?? "?"})`;
  }
  return row.rationale;
}

function previewBadgeText(item: ClassifiedNote, isForced: boolean): string {
  const row = importRow(item);
  if (isForced && row.forcedOutcome !== undefined) {
    return row.forcedOutcome;
  }
  return previewBadgeOutcome(item);
}

function forceAriaLabel(item: ClassifiedNote): string {
  const { forcedOutcome } = importRow(item);
  return (
    forcedOutcome ??
    "Anki wins: overwrite what is in Obsidian with Anki's version"
  );
}

function countNotes(count: number): string {
  return count === 1 ? "1 note" : `${count} notes`;
}

const previewReasonText: Record<NotePreviewStatus, string> = {
  diverged: "edited in both places",
  new: "not imported yet",
  newerInAnki: "with a newer version in Anki",
  newerInVault: "with newer Obsidian edits",
  noFile: "with no file in Obsidian",
  upToDate: "already up to date",
};

function selectionNotice(notes: ClassifiedNote[]): string {
  const reasons: string[] = [];
  for (const status of previewRowOrder) {
    const count = notes.filter((item) => item.previewStatus === status).length;
    if (count > 0) {
      reasons.push(`${countNotes(count)} ${previewReasonText[status]}`);
    }
  }
  return `Nothing is selected yet: ${reasons.join(", ")}. The button above takes Anki's version of every remaining note.`;
}

function resurrectionWarning(count: number): string {
  return `This re-creates ${countNotes(count)} you deleted in Obsidian.`;
}

interface NoteRowProps {
  readonly className?: string;
  readonly forcedNoteIds: Record<number, boolean>;
  readonly item: ClassifiedNote;
  readonly notesSelectedToImport: Record<number, boolean>;
  readonly onForcedChange: (noteId: number, isForced: boolean) => void;
  readonly onSelectedChange: (
    selected: Record<number, boolean>,
    noteId: number,
    isSelected: boolean,
  ) => void;
}

function NoteRow({
  className,
  forcedNoteIds,
  item,
  notesSelectedToImport,
  onForcedChange,
  onSelectedChange,
}: NoteRowProps): JSX.Element {
  const noteId = item.note.noteId;
  return (
    <ListRow
      cells={[
        <span key="select">
          <input
            checked={notesSelectedToImport[noteId] ?? false}
            disabled={!isImportSelectedByDefault(item.status)}
            key="select"
            onChange={(event) =>
              onSelectedChange(
                notesSelectedToImport,
                noteId,
                event.target.checked,
              )
            }
            type="checkbox"
          />
          <label>
            <input
              aria-label={forceAriaLabel(item)}
              checked={forcedNoteIds[noteId] ?? false}
              key="force"
              onChange={(event) => onForcedChange(noteId, event.target.checked)}
              type="checkbox"
            />
            Anki wins
          </label>
        </span>,
        <label key="card">
          <span>{noteSummary(item.note)}</span>
          <span
            className={mergeClasses(
              notesPreviewClasses.previewBadge,
              previewBadgeClass(item),
            )}
          >
            {previewBadgeText(item, forcedNoteIds[noteId] ?? false)}
          </span>
        </label>,
      ]}
      className={mergeClasses(
        className,
        notesPreviewClasses.previewRow,
        item.previewStatus === "upToDate"
          ? notesPreviewClasses.previewRowImported
          : undefined,
      )}
      key={noteId}
    />
  );
}

export function NotesPreview({
  anki,
  currentPage,
  deckName,
  forcedNoteIds,
  noteLifecycle,
  onPageChange,
  onTotalPagesChange,
  vault,
  vaultNoteIndex,
  notesSelectedToImport,
  onForcedNoteIdsChange,
  onNotesSelectedToImportChange,
  onNotesLoaded,
  className,
}: NotesPreviewProps): JSX.Element {
  const rootClassName = mergeClasses(commonWizardClasses.pageView, className);
  const [rawNotes, setRawNotes] = useState<AnkiNoteInfo[] | null>(null);
  const [classified, setClassified] = useState<ClassifiedNote[] | null>(null);
  const [progress, setProgress] = useState("");
  const [loadError, setLoadError] = useState("");
  const page = currentPage;
  const setPage = onPageChange;

  const loadPreviewNotes = (): (() => void) => {
    setRawNotes(null);
    setPage(0);
    return startAsyncLoad(async (isLive) => {
      try {
        const notes = await fetchDeckNotes(anki, deckName, (fetched, total) => {
          if (isLive()) {
            setProgress(`Loading notes… ${fetched}/${total}`);
          }
        });
        if (isLive()) {
          setRawNotes(notes);
        }
      } catch {
        if (isLive()) {
          setLoadError("Error: could not load notes.");
        }
      }
    });
  };

  useEffect(loadPreviewNotes, [anki, deckName]);

  const loadClassifiedNotes = () => {
    setClassified(null);
    return startAsyncLoad(async (isLive) => {
      if (!rawNotes) {
        return;
      }
      const items: ClassifiedNote[] = [];
      for (const note of rawNotes) {
        const isInVaultIndex = vaultNoteIndex.has(note.noteId);
        const block = isInVaultIndex
          ? await findVaultNoteBlock(vault, vaultNoteIndex, note.noteId)
          : null;
        const status = classifyNoteLifecycle({
          anki: note,
          block: block
            ? {
                id: block.id,
                hash: await computeContentHash(
                  block.front,
                  block.back,
                  block.tags,
                  block.model,
                ),
              }
            : undefined,
          record: noteLifecycle[note.noteId],
        });
        items.push({
          isInVaultIndex,
          note,
          previewStatus: notePreviewStatusFor(status),
          status,
          vaultPath: vaultNoteIndex.get(note.noteId),
        });
      }
      if (isLive()) {
        const ordered = [...items].sort(
          (first, second) => previewRowRank(first) - previewRowRank(second),
        );
        setClassified(ordered);
        onNotesLoaded(
          items.map((item) => item.note),
          Object.fromEntries(
            items.map((item) => [item.note.noteId, item.status]),
          ),
        );
      }
    });
  };

  useEffect(loadClassifiedNotes, [
    rawNotes,
    vault,
    vaultNoteIndex,
    noteLifecycle,
  ]);

  const applyDefaultNotesSelectedToImport = () => {
    if (!classified) {
      return;
    }
    if (
      classified.some((item) => !(item.note.noteId in notesSelectedToImport))
    ) {
      const merged = { ...notesSelectedToImport };
      for (const item of classified) {
        if (!(item.note.noteId in merged)) {
          merged[item.note.noteId] = isImportSelectedByDefault(item.status);
        }
      }
      onNotesSelectedToImportChange(merged);
    }
  };

  useEffect(applyDefaultNotesSelectedToImport, [
    classified,
    notesSelectedToImport,
    onNotesSelectedToImportChange,
  ]);

  useEffect(() => {
    if (classified) {
      const pageCount = Math.max(
        1,
        Math.ceil(classified.length / previewPageSize),
      );
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
  const notesSelectedToImportCount = Object.values(
    notesSelectedToImport,
  ).filter(Boolean).length;
  const pageNotes = classified.slice(
    page * previewPageSize,
    page * previewPageSize + previewPageSize,
  );
  const notesLeftToDecide = classified.filter(
    (item) =>
      !isImportSelectedByDefault(item.status) &&
      !forcedNoteIds[item.note.noteId],
  );
  const notesToResurrect = notesLeftToDecide.filter(
    (item) => item.previewStatus === "noFile",
  ).length;
  const isNothingSelected = notesSelectedToImportCount === 0;

  const selectNote = (
    selected: Record<number, boolean>,
    noteId: number,
    isSelected: boolean,
  ): void => {
    onNotesSelectedToImportChange({ ...selected, [noteId]: isSelected });
  };

  const toggleForced = (noteId: number, isForced: boolean): void => {
    onForcedNoteIdsChange({ ...forcedNoteIds, [noteId]: isForced });
    onNotesSelectedToImportChange({
      ...notesSelectedToImport,
      [noteId]: isForced,
    });
  };

  const useAnkiForEveryNote = (): void => {
    const forced = { ...forcedNoteIds };
    const selected = { ...notesSelectedToImport };
    for (const item of notesLeftToDecide) {
      forced[item.note.noteId] = true;
      selected[item.note.noteId] = true;
    }
    onForcedNoteIdsChange(forced);
    onNotesSelectedToImportChange(selected);
  };

  return (
    <div className={rootClassName}>
      <p>
        Cards to import: {notesSelectedToImportCount}/{classified.length}.
      </p>
      {isNothingSelected && (
        <p className={notesPreviewClasses.noticeText}>
          {selectionNotice(classified)}
        </p>
      )}
      {notesLeftToDecide.length > 0 && (
        <button onClick={useAnkiForEveryNote} type="button">
          {`Use Anki's version for all (${notesLeftToDecide.length})`}
        </button>
      )}
      {notesToResurrect > 0 && (
        <p className={notesPreviewClasses.noticeText}>
          {resurrectionWarning(notesToResurrect)}
        </p>
      )}
      <List columns={["Select", "Card"]} columnWidths="auto 1fr">
        {pageNotes.map((item) => (
          <NoteRow
            forcedNoteIds={forcedNoteIds}
            item={item}
            key={item.note.noteId}
            notesSelectedToImport={notesSelectedToImport}
            onForcedChange={toggleForced}
            onSelectedChange={selectNote}
          />
        ))}
      </List>
    </div>
  );
}

import { useEffect, useRef, useState, type JSX } from "react";
import { mergeClasses } from "src/gui/classes";
import type { Vault } from "obsidian";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import type {
  NoteLifecycleRecord,
  NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import type { FieldMapping as FieldMap } from "src/entities/field-mapping";
import type { VaultNoteIndex } from "src/services/vault";
import {
  executeImport,
  fetchNotesByIds,
  type ImportExecutionReport,
} from "src/services/import";
import { commonWizardClasses } from "src/gui/import-wizard/classes";

export interface ImportExecutionProps {
  readonly anki: Anki;
  readonly className?: string;
  readonly deckName: string;
  readonly fieldMappings: Record<string, FieldMap>;
  readonly forcedNoteIds: Record<number, boolean>;
  readonly noteLifecycle: Record<number, NoteLifecycleRecord>;
  readonly notes: AnkiNoteInfo[];
  readonly notesSelectedToImport: Record<number, boolean>;
  readonly onFinish: (report: ImportExecutionReport) => void;
  readonly previewStatuses?: Record<number, NoteLifecycleStatus>;
  readonly vault: Vault;
  readonly vaultNoteIndex?: VaultNoteIndex;
}

type ExecutionPhase = "running" | "done" | "failed";

export function ImportExecution({
  anki,
  notesSelectedToImport,
  className,
  deckName,
  fieldMappings,
  forcedNoteIds,
  noteLifecycle,
  notes,
  onFinish,
  previewStatuses,
  vault,
  vaultNoteIndex,
}: ImportExecutionProps): JSX.Element {
  const [phase, setPhase] = useState<ExecutionPhase>("running");
  const [progress, setProgress] = useState("");
  const [failure, setFailure] = useState("");
  const [report, setReport] = useState<ImportExecutionReport | null>(null);
  const importStarted = useRef(false);

  const runImport = async () => {
    setPhase("running");
    setFailure("");
    try {
      const freshNotes = await fetchNotesByIds(
        anki,
        notes
          .filter((note) => notesSelectedToImport[note.noteId] ?? false)
          .map((note) => note.noteId),
      );
      const finished = await executeImport(anki, vault, {
        freshNotes,
        previewStatuses,
        ankiWinsNoteIds: Object.entries(forcedNoteIds)
          .filter(([, isForced]) => isForced)
          .map(([noteId]) => Number(noteId)),
        decisions: notesSelectedToImport,
        deckName,
        fieldMappings,
        noteLifecycle,
        notes,
        onProgress: (processed, total) => {
          setProgress(`Importing… ${processed}/${total}`);
        },
        targetFolder: "",
        vaultNoteIndex,
      });
      setReport(finished);
      setPhase("done");
      onFinish(finished);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Unknown import error.",
      );
      setPhase("failed");
    }
  };

  const startImportOnce = () => {
    if (importStarted.current) {
      return;
    }
    importStarted.current = true;
    void runImport();
  };

  useEffect(startImportOnce, []);

  return (
    <div className={mergeClasses(commonWizardClasses.pageView, className)}>
      {phase === "running" && <p>{progress || "Importing…"}</p>}
      {phase === "failed" && <p>Import failed: {failure}</p>}
      {phase === "done" && report && (
        <p>
          Created: {report.created}, overwritten: {report.overwritten}, skipped:{" "}
          {report.skipped}, media files: {report.mediaFiles}
          {report.skippedUnmapped > 0
            ? `, skipped without pack: ${report.skippedUnmapped}`
            : ""}
          {report.mediaNotImported > 0
            ? `, media not imported: ${report.mediaNotImported}`
            : ""}
          {report.changedSincePreview > 0
            ? `, ${report.changedSincePreview} changed since the preview`
            : ""}
          {report.vanishedFromDeck > 0
            ? `, ${report.vanishedFromDeck} no longer in the deck`
            : ""}
          {report.forced > 0 ? `, forced: ${report.forced}` : ""}
          {report.skippedNewerInVault > 0
            ? `, skipped (newer in Obsidian): ${report.skippedNewerInVault}`
            : ""}
          {report.skippedLeftToSync > 0
            ? `, left to Sync (no file): ${report.skippedLeftToSync}`
            : ""}
          {report.cancelled ? " (cancelled)" : ""}.
        </p>
      )}
    </div>
  );
}

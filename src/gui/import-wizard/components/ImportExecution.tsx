import { useRef, useState, type JSX } from "react";
import { TFolder } from "obsidian";
import type { Vault } from "obsidian";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/card";
import type { FieldMapping as FieldMap } from "src/services/import";
import {
  executeImport,
  type ImportExecutionReport,
} from "src/services/import";
import {
  commonWizardClasses,
  mergeClasses,
} from "src/gui/import-wizard/classes";

export interface ImportExecutionProps {
  anki: Anki;
  cardsSelectedToImport: Record<number, boolean>;
  className?: string;
  deckName: string;
  fieldMappings: Record<string, FieldMap>;
  flashcardsTag: string;
  notes: AnkiNoteInfo[];
  onFinish: (report: ImportExecutionReport) => void;
  vault: Vault;
}

type ExecutionPhase = "idle" | "running" | "done";

export function ImportExecution({
  anki,
  cardsSelectedToImport,
  className,
  deckName,
  fieldMappings,
  flashcardsTag,
  notes,
  onFinish,
  vault,
}: ImportExecutionProps): JSX.Element {
  const [folder, setFolder] = useState("");
  const [phase, setPhase] = useState<ExecutionPhase>("idle");
  const [progress, setProgress] = useState("");
  const [failure, setFailure] = useState("");
  const [report, setReport] = useState<ImportExecutionReport | null>(null);
  const cancelRequested = useRef(false);

  const folders = vault
    .getAllLoadedFiles()
    .filter(
      (file): file is TFolder =>
        file instanceof TFolder && file.path !== "/" && file.path !== ""
    )
    .map((foundFolder) => foundFolder.path);

  const selectedCount = notes.filter(
    (note) => cardsSelectedToImport[note.noteId] ?? false
  ).length;

  const runImport = async () => {
    setPhase("running");
    setFailure("");
    cancelRequested.current = false;
    try {
      const finished = await executeImport(anki, vault, {
        decisions: cardsSelectedToImport,
        deckName,
        fieldMappings,
        flashcardsTag,
        isCancelled: () => cancelRequested.current,
        notes,
        onProgress: (processed, total) => {
          setProgress(`Importing… ${processed}/${total}`);
        },
        targetFolder: folder,
      });
      setReport(finished);
      setPhase("done");
      onFinish(finished);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Unknown import error."
      );
      setPhase("idle");
    }
  };

  const cancelImport = () => {
    cancelRequested.current = true;
  };

  return (
    <div className={mergeClasses(commonWizardClasses.pageView, className)}>
      {phase === "idle" && (
        <>
          <p>
            Import {selectedCount} selected cards from &quot;{deckName}&quot;
            into:
          </p>
          <select
            onChange={(event) => setFolder(event.target.value)}
            value={folder}
          >
            <option value="">/</option>
            {folders.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
          <button onClick={() => void runImport()}>Import</button>
          {failure && <p>Import failed: {failure}</p>}
        </>
      )}
      {phase === "running" && (
        <>
          <p>{progress || "Importing…"}</p>
          <button onClick={cancelImport}>Cancel import</button>
        </>
      )}
      {phase === "done" && report && (
        <>
          <p>
            Created: {report.created}, overwritten: {report.overwritten},
            skipped: {report.skipped}, media files: {report.mediaFiles}
            {report.cancelled ? " (cancelled)" : ""}.
          </p>
          <button onClick={() => setPhase("idle")}>Import again</button>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type JSX } from "react";
import type { Vault } from "obsidian";
import type { Anki } from "src/services/anki";
import type { AnkiNoteInfo } from "src/entities/card";
import type { FieldMapping as FieldMap } from "src/services/import";
import type { VaultNoteIndex } from "src/services/vault";
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
  vaultNoteIndex?: VaultNoteIndex;
}

type ExecutionPhase = "running" | "done" | "failed";

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
      const finished = await executeImport(anki, vault, {
        decisions: cardsSelectedToImport,
        deckName,
        fieldMappings,
        flashcardsTag,
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
        error instanceof Error ? error.message : "Unknown import error."
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
          Created: {report.created}, overwritten: {report.overwritten},
          skipped: {report.skipped}, media files: {report.mediaFiles}
          {report.cancelled ? " (cancelled)" : ""}.
        </p>
      )}
    </div>
  );
}

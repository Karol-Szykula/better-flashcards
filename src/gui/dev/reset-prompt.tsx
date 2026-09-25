import type { JSX } from "react";
import { mergeClasses } from "src/gui/classes";

const devResetClasses = {
  actions: "flashcards-dev-reset__actions",
  confirmButton: "flashcards-dev-reset__confirm-button",
  prompt: "flashcards-dev-reset",
  warning: "flashcards-dev-reset__warning",
} as const;

export interface ResetPromptProps {
  readonly className?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ResetPrompt({
  className,
  onCancel,
  onConfirm,
}: ResetPromptProps): JSX.Element {
  return (
    <div className={mergeClasses(devResetClasses.prompt, className)}>
      <p className={devResetClasses.warning}>
        The plugin forgets every link to Anki: note records, deck snapshots,
        field mappings and saved note packs. Your notes in the vault and Anki
        itself stay untouched, but the next import will offer your existing
        notes as new and re-exporting will create duplicates in Anki.
      </p>
      <div className={devResetClasses.actions}>
        <button onClick={onCancel}>Cancel</button>
        <button className={devResetClasses.confirmButton} onClick={onConfirm}>
          Reset everything
        </button>
      </div>
    </div>
  );
}

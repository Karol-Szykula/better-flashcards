import { useState, type JSX } from "react";
import {
  flashcardFormClasses,
  mergeClasses,
} from "src/gui/flashcard-form/classes";
import type {
  FlashcardFormData,
  FlashcardFormEdit,
} from "src/gui/flashcard-form/types";

export const missingIdPlaceholder = "Auto (on sync)";

export interface FlashcardFormProps {
  className?: string;
  data: FlashcardFormData;
  onEdit: (edit: FlashcardFormEdit) => void;
}

export function FlashcardForm({
  className,
  data,
  onEdit,
}: FlashcardFormProps): JSX.Element {
  const [back, setBack] = useState(data.back);
  const [front, setFront] = useState(data.front);
  const [tags, setTags] = useState(data.tags);

  function reportEdit(): void {
    onEdit({ back, front, tags });
  }

  return (
    <div className={mergeClasses(flashcardFormClasses.form, className)}>
      <div className={flashcardFormClasses.field}>
        <label
          className={flashcardFormClasses.label}
          htmlFor="flashcard-form-front"
        >
          Front
        </label>
        <textarea
          className={flashcardFormClasses.input}
          id="flashcard-form-front"
          onBlur={reportEdit}
          onChange={(event) => setFront(event.target.value)}
          rows={3}
          value={front}
        />
      </div>
      <div className={flashcardFormClasses.field}>
        <label
          className={flashcardFormClasses.label}
          htmlFor="flashcard-form-back"
        >
          Back
        </label>
        <textarea
          className={flashcardFormClasses.input}
          id="flashcard-form-back"
          onBlur={reportEdit}
          onChange={(event) => setBack(event.target.value)}
          rows={3}
          value={back}
        />
      </div>
      <div className={flashcardFormClasses.field}>
        <label
          className={flashcardFormClasses.label}
          htmlFor="flashcard-form-tags"
        >
          Tags
        </label>
        <input
          className={flashcardFormClasses.input}
          id="flashcard-form-tags"
          onBlur={reportEdit}
          onChange={(event) => setTags(event.target.value)}
          type="text"
          value={tags}
        />
      </div>
      <div className={flashcardFormClasses.field}>
        <label className={flashcardFormClasses.label} htmlFor="flashcard-form-id">
          ID
        </label>
        <input
          className={`${flashcardFormClasses.input} ${flashcardFormClasses.inputReadonly}`}
          id="flashcard-form-id"
          readOnly
          type="text"
          value={data.id === undefined ? missingIdPlaceholder : data.id}
        />
      </div>
    </div>
  );
}

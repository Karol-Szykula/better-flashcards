import { useState, type JSX } from "react";
import { mergeClasses } from "src/gui/classes";
import { noteFormClasses } from "src/gui/note-form/classes";
import type { NoteShape } from "src/entities/note-shapes";
import type { NoteFormData, NoteFormEdit } from "src/entities/note-form-data";

export interface NoteFormFieldsProps {
  readonly className?: string;
  readonly data: NoteFormData;
  readonly onEdit: (edit: NoteFormEdit) => void;
  readonly shape: NoteShape;
}

export function NoteFormFields({
  className,
  data,
  onEdit,
  shape,
}: NoteFormFieldsProps): JSX.Element {
  const [primary, setPrimary] = useState(data.front);
  const [secondary, setSecondary] = useState(data.back);
  const [tags, setTags] = useState(data.tags);

  function reportEdit(): void {
    onEdit({ back: secondary, front: primary, tags });
  }

  return (
    <div className={mergeClasses(noteFormClasses.form, className)}>
      <div className={noteFormClasses.field}>
        <label
          className={noteFormClasses.label}
          htmlFor={`note-form-${shape.primaryKey}`}
        >
          {shape.primaryLabel}
        </label>
        <textarea
          className={noteFormClasses.input}
          id={`note-form-${shape.primaryKey}`}
          onBlur={reportEdit}
          onChange={(event) => setPrimary(event.target.value)}
          rows={3}
          value={primary}
        />
      </div>
      <div className={noteFormClasses.field}>
        <label
          className={noteFormClasses.label}
          htmlFor={`note-form-${shape.secondaryKey}`}
        >
          {shape.secondaryLabel}
        </label>
        <textarea
          className={noteFormClasses.input}
          id={`note-form-${shape.secondaryKey}`}
          onBlur={reportEdit}
          onChange={(event) => setSecondary(event.target.value)}
          rows={3}
          value={secondary}
        />
      </div>
      <div className={noteFormClasses.field}>
        <label className={noteFormClasses.label} htmlFor="note-form-tags">
          Tags
        </label>
        <input
          className={noteFormClasses.input}
          id="note-form-tags"
          onBlur={reportEdit}
          onChange={(event) => setTags(event.target.value)}
          type="text"
          value={tags}
        />
      </div>
    </div>
  );
}

import type { JSX } from "react";
import { basicModelName } from "src/conf/constants";
import { NoteFormFields } from "src/gui/note-form/NoteFormFields";
import { noteShapeFor } from "src/entities/note-shapes";
import type { NoteFormData, NoteFormEdit } from "src/entities/note-form-data";

const basicShape = noteShapeFor(basicModelName);

export interface BasicNoteFormProps {
  readonly className?: string;
  readonly data: NoteFormData;
  readonly onEdit: (edit: NoteFormEdit) => void;
}

export function BasicNoteForm({
  className,
  data,
  onEdit,
}: BasicNoteFormProps): JSX.Element {
  return (
    <NoteFormFields
      className={className}
      data={data}
      onEdit={onEdit}
      shape={basicShape}
    />
  );
}

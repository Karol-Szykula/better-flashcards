import type { JSX } from "react";
import { clozeModelName } from "src/conf/constants";
import { NoteFormFields } from "src/gui/note-form/NoteFormFields";
import { noteShapeFor } from "src/entities/note-shapes";
import type { NoteFormData, NoteFormEdit } from "src/entities/note-form-data";

const clozeShape = noteShapeFor(clozeModelName);

export interface ClozeNoteFormProps {
  readonly className?: string;
  readonly data: NoteFormData;
  readonly onEdit: (edit: NoteFormEdit) => void;
}

export function ClozeNoteForm({
  className,
  data,
  onEdit,
}: ClozeNoteFormProps): JSX.Element {
  return (
    <NoteFormFields
      className={className}
      data={data}
      onEdit={onEdit}
      shape={clozeShape}
    />
  );
}

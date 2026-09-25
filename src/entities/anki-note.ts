import { arraysEqual } from "src/utils";
import { noteShapeFor, type NoteShape } from "src/entities/note-shapes";

export type AnkiNotePayload = {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  id?: number;
};

export type AnkiNoteInfo = {
  noteId: number;
  deckName?: string;
  modelName?: string;
  mod?: number;
  fields: Record<string, { value: string }>;
  tags: string[];
  cards?: number[];
};

export abstract class AnkiNote {
  noteId: number;
  deckName: string;
  fields: Record<string, string>;
  reversed: boolean;
  tags: string[];
  mediaNames: string[];
  mediaBase64Encoded: string[];
  oldTags: string[];
  modelName: string;

  constructor(
    noteId: number,
    deckName: string,
    fields: Record<string, string>,
    reversed: boolean,
    tags: string[],
    mediaNames: string[],
  ) {
    this.noteId = noteId;
    this.deckName = deckName;
    this.fields = fields;
    this.reversed = reversed;
    this.tags = tags;
    this.mediaNames = mediaNames;
    this.mediaBase64Encoded = [];
    this.oldTags = [];
    this.modelName = "";
  }

  abstract toPayload(update: boolean): AnkiNotePayload;

  public getFormTemplate(): NoteShape {
    return noteShapeFor(this.modelName);
  }

  public getMedias(): object[] {
    const medias: object[] = [];
    this.mediaBase64Encoded.forEach((data, index) => {
      medias.push({
        filename: this.mediaNames[index],
        data: data,
      });
    });

    return medias;
  }
}

export function noteFieldsMatch(
  local: AnkiNote,
  remote: AnkiNoteInfo,
): boolean {
  const fields: Array<[string, { value: string }]> = Object.entries(
    remote.fields,
  );
  // This is the case of a switch from a model to another one. It cannot be handeled
  if (fields.length !== Object.entries(local.fields).length) {
    return true;
  }

  for (const field of fields) {
    const fieldName = field[0];
    if (field[1].value !== local.fields[fieldName]) {
      return false;
    }
  }

  return arraysEqual(remote.tags, local.tags);
}

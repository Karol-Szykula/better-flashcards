import { AnkiNote, type AnkiNotePayload } from "src/entities/anki-note";

export class CustomMappedNote extends AnkiNote {
  constructor(
    noteId = -1,
    deckName: string,
    fields: Record<string, string>,
    reversed: boolean,
    tags: string[] = [],
    mediaNames: string[] = [],
    modelName: string,
  ) {
    super(noteId, deckName, fields, reversed, tags, mediaNames);
    this.modelName = modelName;
  }

  public toPayload(update = false): AnkiNotePayload {
    const payload: AnkiNotePayload = {
      deckName: this.deckName,
      modelName: this.modelName,
      fields: this.fields,
      tags: this.tags,
    };

    if (update) {
      payload["id"] = this.noteId;
    }

    return payload;
  }
}

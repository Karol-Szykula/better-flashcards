import type {
  AnkiNote,
  AnkiNoteInfo,
  AnkiNotePayload,
} from "src/entities/anki-note";
import { ankiFieldNames } from "src/conf/constants";
import { logger } from "src/services/logger";
import { defaultDeckName } from "src/services/vault";
import { describeUnknown, toError } from "src/utils";

export type AnkiActionRequest = {
  action: string;
  params: unknown;
};

export interface AnkiModelDefinition {
  cardTemplates: Array<{ Name: string; Front: string; Back: string }>;
  css: string;
  inOrderFields: string[];
  isCloze: boolean;
  modelName: string;
}

export interface ModelSnapshot {
  fieldsByModel: Record<string, string[]>;
  modelNames: string[];
}

function isResultEnvelope(value: unknown): value is {
  error: unknown;
  result: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    "error" in value
  );
}

/**
 * A multi response is a list of the individual action responses, and Anki
 * mixes shapes: a bare result for some actions, a {result, error} envelope
 * for others. Unwrap both and turn a nested error into a rejection.
 */
function unwrapMultiResult(result: unknown, index: number): unknown {
  if (!isResultEnvelope(result)) {
    return result;
  }
  if (result.error !== null && result.error !== undefined) {
    throw new Error(
      `Anki action ${index} failed: ${describeUnknown(result.error)}`,
    );
  }
  return result.result;
}

export class Anki {
  public async createDeck(deckName: string): Promise<number> {
    return this.invoke<number>("createDeck", 6, { deck: deckName });
  }

  public async storeMediaFiles(notes: AnkiNote[]) {
    const actions: AnkiActionRequest[] = [];

    for (const note of notes) {
      for (const media of note.getMedias()) {
        actions.push({
          action: "storeMediaFile",
          params: media,
        });
      }
    }

    if (actions.length) {
      return this.invoke<unknown>("multi", 6, { actions: actions });
    } else {
      return {};
    }
  }

  public async retrieveMediaFile(filename: string): Promise<string | null> {
    return await this.invoke<string | null>("retrieveMediaFile", 6, {
      filename,
    });
  }

  public async addNotes(notes: AnkiNote[]): Promise<number[]> {
    const payloads: AnkiNotePayload[] = [];
    notes.forEach((note) => payloads.push(note.toPayload(false)));

    try {
      return await this.invokeAllowPartial("addNotes", 6, { notes: payloads });
    } catch (batchErr) {
      logger.warn(
        "batch addNotes failed, falling back to one-at-a-time",
        batchErr,
      );
      const ids: number[] = [];
      for (const note of notes) {
        try {
          const result = await this.invokeAllowPartial("addNotes", 6, {
            notes: [note],
          });
          ids.push(result[0] ?? -1);
        } catch (e) {
          logger.warn("single addNote failed", e);
          ids.push(-1);
        }
      }
      return ids;
    }
  }

  private invokeAllowPartial(
    action: string,
    version = 6,
    params: Record<string, unknown> = {},
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener("error", () =>
        reject(new Error("failed to issue request")),
      );
      xhr.addEventListener("load", () => {
        try {
          const parsed: unknown = JSON.parse(xhr.responseText);
          const response: { error: unknown; result: unknown } =
            isResultEnvelope(parsed) ? parsed : { error: null, result: parsed };
          if (response.error) {
            if (Array.isArray(response.error)) {
              response.error.forEach((error: unknown, index: number) => {
                if (error !== null) {
                  const notes = params["notes"] as
                    AnkiNotePayload[] | undefined;
                  const noteName =
                    notes?.[index]?.fields[ankiFieldNames.front] ??
                    notes?.[index]?.fields[ankiFieldNames.text] ??
                    "unknown";
                  logger.warn(
                    `addNote failed for "${noteName}": ${describeUnknown(error)}`,
                  );
                }
              });
            } else {
              logger.warn(`addNotes error: ${describeUnknown(response.error)}`);
            }
            if (Array.isArray(response.result)) {
              resolve(response.result as number[]);
              return;
            }
            throw new Error(describeUnknown(response.error));
          }
          resolve(response.result as number[]);
        } catch (error) {
          reject(toError(error));
        }
      });
      xhr.open("POST", "http://127.0.0.1:8765");
      xhr.send(JSON.stringify({ action, version, params }));
    });
  }

  /**
   * Given the new notes with an optional deck name, it updates all the notes on Anki.
   *
   * Be aware of https://github.com/FooSoft/anki-connect/issues/82. If the Browse pane is opened on Anki,
   * the update does not change all the notes.
   * @param notes the new notes.
   * @param deckName the new deck name.
   */
  public async updateNotes(notes: AnkiNote[]): Promise<unknown> {
    let updateActions: AnkiActionRequest[] = [];

    // Unfortunately https://github.com/FooSoft/anki-connect/issues/183
    // This means that the delta from the current tags on Anki and the generated one should be added/removed
    // That's what the current approach does, but in the future if the API it is made more consistent
    //  then mergeTags(...) is not needed anymore
    const ids: number[] = [];

    for (const note of notes) {
      updateActions.push({
        action: "updateNoteFields",
        params: {
          note: note.toPayload(true),
        },
      });

      updateActions = updateActions.concat(
        this.mergeTags(note.oldTags, note.tags, note.noteId),
      );
      ids.push(note.noteId);
    }

    // Update deck
    updateActions.push({
      action: "changeDeck",
      params: {
        cards: ids,
        deck: notes[0]?.deckName ?? defaultDeckName,
      },
    });

    return this.invoke<unknown>("multi", 6, { actions: updateActions });
  }

  public async changeDeck(ids: number[], deckName: string) {
    return await this.invoke<unknown>("changeDeck", 6, {
      cards: ids,
      deck: deckName,
    });
  }

  public async getDeckNames(): Promise<string[]> {
    return await this.invoke<string[]>("deckNames", 6);
  }

  public async findNotes(query: string): Promise<number[]> {
    return await this.invoke<number[]>("findNotes", 6, { query });
  }

  public async cardsInfo(ids: number[]): Promise<Array<{ deckName: string }>> {
    return await this.invoke<Array<{ deckName: string }>>("cardsInfo", 6, {
      cards: ids,
    });
  }

  public async getNotes(ids: number[]): Promise<AnkiNoteInfo[]> {
    return await this.invoke<AnkiNoteInfo[]>("notesInfo", 6, { notes: ids });
  }

  public async modelNames(): Promise<string[]> {
    return await this.invoke<string[]>("modelNames", 6);
  }

  public async modelFieldNames(modelName: string): Promise<string[]> {
    return await this.invoke<string[]>("modelFieldNames", 6, { modelName });
  }

  public async modelNamesWithFields(
    modelNames: string[],
  ): Promise<ModelSnapshot> {
    const actions: AnkiActionRequest[] = [
      { action: "modelNames", params: {} },
      ...modelNames.map((modelName) => ({
        action: "modelFieldNames",
        params: { modelName },
      })),
    ];
    const results = await this.invokeMulti(actions);
    const allNames = results[0] as string[];
    const fieldsByModel: Record<string, string[]> = {};
    modelNames.forEach((modelName, index) => {
      if (allNames.includes(modelName)) {
        fieldsByModel[modelName] = results[index + 1] as string[];
      }
    });
    return { fieldsByModel, modelNames: allNames };
  }

  public async createModels(
    definitions: AnkiModelDefinition[],
  ): Promise<unknown> {
    if (definitions.length === 0) {
      return null;
    }
    const actions: AnkiActionRequest[] = definitions.map((definition) => ({
      action: "createModel",
      params: {
        modelName: definition.modelName,
        inOrderFields: definition.inOrderFields,
        css: definition.css,
        isCloze: definition.isCloze,
        cardTemplates: definition.cardTemplates,
      },
    }));
    return await this.invokeMulti(actions);
  }

  private async invokeMulti(actions: AnkiActionRequest[]): Promise<unknown[]> {
    const results = await this.invoke<unknown[]>("multi", 6, { actions });
    return results.map((result, index) => unwrapMultiResult(result, index));
  }

  public async ping(): Promise<boolean> {
    return (await this.invoke<number>("version", 6)) === 6;
  }

  private mergeTags(oldTags: string[], newTags: string[], noteId: number) {
    const actions = [];

    // Find tags to Add
    for (const tag of newTags) {
      const index = oldTags.indexOf(tag);
      if (index > -1) {
        oldTags.splice(index, 1);
      } else {
        actions.push({
          action: "addTags",
          params: {
            notes: [noteId],
            tags: tag,
          },
        });
      }
    }

    // All Tags to delete
    for (const tag of oldTags) {
      actions.push({
        action: "removeTags",
        params: {
          notes: [noteId],
          tags: tag,
        },
      });
    }

    return actions;
  }

  private invoke<T>(
    action: string,
    version = 6,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener("error", () =>
        reject(new Error("failed to issue request")),
      );
      xhr.addEventListener("load", () => {
        try {
          const parsed: unknown = JSON.parse(xhr.responseText);
          if (!isResultEnvelope(parsed)) {
            throw new Error("response is not an AnkiConnect envelope");
          }
          if (Object.getOwnPropertyNames(parsed).length != 2) {
            throw new Error("response has an unexpected number of fields");
          }
          if (parsed.error) {
            throw new Error(describeUnknown(parsed.error));
          }
          resolve(parsed.result as T);
        } catch (error) {
          reject(toError(error));
        }
      });

      xhr.open("POST", "http://127.0.0.1:8765");
      xhr.send(JSON.stringify({ action, version, params }));
    });
  }

  public async requestPermission() {
    return this.invoke<{ permission: string }>("requestPermission", 6);
  }
}

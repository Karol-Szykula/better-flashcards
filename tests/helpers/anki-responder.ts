import type { AnkiNoteInfo } from "src/entities/anki-note";
import { AnkiConnectMock } from "../mocks/anki-connect";

interface AnkiRequestRecord {
  action: string;
  params: Record<string, unknown>;
}

interface AnkiResponderState {
  nextNoteId: number;
  notes: AnkiNoteInfo[];
  requests: AnkiRequestRecord[];
  writtenMod: number;
}

interface AnkiResponderOptions {
  knownModels?: Record<string, string[]>;
  notes?: AnkiNoteInfo[];
  nextNoteId?: number;
  writtenMod?: number;
}

interface AnkiMultiAction {
  action: string;
  params: Record<string, unknown>;
}

export interface AnkiResponder {
  readonly state: AnkiResponderState;
  createdModels(): string[];
  multiActions(action?: string): AnkiMultiAction[];
  requestActionsFor(action: string): AnkiMultiAction[];
  respondWith(options?: AnkiResponderOptions): void;
}

interface NotePayload {
  deckName: string;
  fields: Record<string, string>;
  id?: number;
  modelName: string;
  tags: string[];
}

const defaultModels: Record<string, string[]> = {
  Basic: ["Front", "Back"],
  Cloze: ["Text", "Back Extra"],
};

const defaultNextNoteId = 1_500_000;
const defaultWrittenMod = 500;

function fieldsOf(
  flat: Record<string, string>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(flat).map(([name, value]) => [name, { value }]),
  );
}

export function ankiResponder(): AnkiResponder {
  const state: AnkiResponderState = {
    nextNoteId: defaultNextNoteId,
    notes: [],
    requests: [],
    writtenMod: defaultWrittenMod,
  };

  const existingNote = (noteId: number): AnkiNoteInfo | undefined =>
    state.notes.find((note) => note.noteId === noteId);

  const answersMulti = (
    actions: AnkiMultiAction[],
    knownModels: Record<string, string[]>,
  ): unknown[] =>
    actions.map((action) => {
      if (action.action === "modelNames") {
        return Object.keys(knownModels);
      }
      if (action.action === "modelFieldNames") {
        return knownModels[action.params["modelName"] as string] ?? [];
      }
      if (action.action === "createModel") {
        return { name: action.params["modelName"] };
      }
      if (action.action === "updateNoteFields") {
        const payload = action.params["note"] as NotePayload;
        const note = existingNote(payload.id ?? -1);
        if (note !== undefined) {
          note.fields = fieldsOf(payload.fields);
          note.mod = state.writtenMod;
        }
        return null;
      }
      return null;
    });

  const createdNotes = (payloads: NotePayload[]): number[] =>
    payloads.map((payload) => {
      const noteId = state.nextNoteId;
      state.nextNoteId += 1;
      state.notes.push({
        fields: fieldsOf(payload.fields),
        mod: state.writtenMod,
        modelName: payload.modelName,
        noteId,
        tags: payload.tags,
      });
      return noteId;
    });

  const createdModels = (): string[] =>
    multiActions("createModel").map(
      (action) => action.params["modelName"] as string,
    );

  const multiActions = (action?: string): AnkiMultiAction[] => {
    const every = state.requests
      .filter((request) => request.action === "multi")
      .flatMap((request) => request.params["actions"] as AnkiMultiAction[]);
    return action === undefined
      ? every
      : every.filter((candidate) => candidate.action === action);
  };

  const requestActionsFor = (action: string): AnkiMultiAction[] => {
    const request = state.requests.find(
      (candidate) =>
        candidate.action === "multi" &&
        (candidate.params["actions"] as AnkiMultiAction[]).some(
          (sub) => sub.action === action,
        ),
    );
    return request === undefined
      ? []
      : (request.params["actions"] as AnkiMultiAction[]);
  };

  const respondWith = (options: AnkiResponderOptions = {}): void => {
    const knownModels = options.knownModels ?? defaultModels;
    state.nextNoteId = options.nextNoteId ?? defaultNextNoteId;
    state.notes = [...(options.notes ?? [])];
    state.requests = [];
    state.writtenMod = options.writtenMod ?? defaultWrittenMod;
    AnkiConnectMock.setResponder((request) => {
      state.requests.push({
        action: request.action,
        params: request.params as Record<string, unknown>,
      });
      if (request.action === "multi") {
        return {
          result: answersMulti(
            request.params["actions"] as AnkiMultiAction[],
            knownModels,
          ),
          error: null,
        };
      }
      if (request.action === "findNotes") {
        return {
          result: state.notes.map((note) => note.noteId),
          error: null,
        };
      }
      if (request.action === "notesInfo") {
        const ids = (request.params as { notes: number[] }).notes;
        return {
          result: state.notes.filter((note) => ids.includes(note.noteId)),
          error: null,
        };
      }
      if (request.action === "addNotes") {
        return {
          result: createdNotes(
            (request.params as { notes: NotePayload[] }).notes,
          ),
          error: null,
        };
      }
      return { result: null, error: null };
    });
  };

  return {
    state,
    createdModels,
    multiActions,
    requestActionsFor,
    respondWith,
  };
}

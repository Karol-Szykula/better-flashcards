import { Anki } from "src/services/anki";
import type { AnkiModelDefinition } from "src/services/anki";
import { BasicNote } from "src/entities/basic-note";
import { AnkiConnectMock } from "../mocks/anki-connect";
import type { AnkiConnectRequest } from "../mocks/anki-connect";
import { required } from "../helpers/required";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

interface SubAction {
  action: string;
  params: Record<string, unknown>;
}

const ankiConnectVersion = 6;

function multiRequests(): AnkiConnectRequest[] {
  return AnkiConnectMock.requests.filter((r) => r.action === "multi");
}

function subActionsOf(request: AnkiConnectRequest): SubAction[] {
  expect(request.version).toBe(ankiConnectVersion);
  return request.params["actions"] as SubAction[];
}

/** Actions of the only multi request - fails when there isn't exactly one. */
function multiSubActions(): SubAction[] {
  const found = multiRequests();
  expect(found).toHaveLength(1);
  return subActionsOf(required(found[0], "request"));
}

function createNote(): BasicNote {
  return new BasicNote(
    5,
    "Test deck",
    { Front: "Question", Back: "Answer" },
    false,
    ["b", "c"],
  );
}

function multiActions(): { action: string; modelName?: string }[] {
  return multiSubActions().map((sub) => ({
    action: sub.action,
    modelName: sub.params["modelName"] as string | undefined,
  }));
}

describe("Anki - connection", () => {
  test("given version 6 reported when pinged then returns true", async () => {
    // given
    const reportedVersion = ankiConnectVersion;
    AnkiConnectMock.respondWith(reportedVersion);

    // when
    const connected = await new Anki().ping();

    // then
    expect(connected).toBe(true);
    expect(AnkiConnectMock.requests).toHaveLength(1);
    expect(required(AnkiConnectMock.requests[0], "request").action).toBe(
      "version",
    );
  });

  test("given a different version reported when pinged then returns false", async () => {
    // given
    const unsupportedVersion = 5;
    AnkiConnectMock.respondWith(unsupportedVersion);

    // when
    const connected = await new Anki().ping();

    // then
    expect(connected).toBe(false);
  });

  test("given unreachable Anki when pinged then rejects", async () => {
    // given
    AnkiConnectMock.setConnectionDown(true);

    // when
    const ping = new Anki().ping();

    // then
    await expect(ping).rejects.toThrow();
  });

  test("given a malformed response when invoked then rejects", async () => {
    // given
    const malformedResponse = { result: 6 };
    AnkiConnectMock.setResponder(() => malformedResponse);

    // when
    const ping = new Anki().ping();

    // then
    await expect(ping).rejects.toThrow();
  });

  test("given an error response when invoked then rejects with it", async () => {
    // given
    const ankiErrorResponse: Record<string, unknown> = {
      result: null,
      error: "boom",
    };
    AnkiConnectMock.setResponder(() => ankiErrorResponse);

    // when
    const ping = new Anki().ping();

    // then
    await expect(ping).rejects.toThrow("boom");
  });

  test("given granted permission when requested then forwards it", async () => {
    // given
    const grantedPermission = { permission: "granted" };
    AnkiConnectMock.respondWith(grantedPermission);

    // when
    const permission = await new Anki().requestPermission();

    // then
    expect(permission).toEqual(grantedPermission);
    expect(required(AnkiConnectMock.requests[0], "request").action).toBe(
      "requestPermission",
    );
  });
});

describe("Anki - decks and notes lookup", () => {
  test("given a deck list when requested then returns it", async () => {
    // given
    const deckList = ["Default", "Languages"];
    AnkiConnectMock.respondWith(deckList);

    // when
    const decks = await new Anki().getDeckNames();

    // then
    expect(decks).toEqual(deckList);
    expect(AnkiConnectMock.requests[0]).toMatchObject({ action: "deckNames" });
  });

  test("given a deck query when searched then sends it and returns ids", async () => {
    // given
    const deckQuery = "deck:Default";
    const foundNoteIds = [11, 22];
    AnkiConnectMock.respondWith(foundNoteIds);

    // when
    const noteIds = await new Anki().findNotes(deckQuery);

    // then
    expect(noteIds).toEqual(foundNoteIds);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "findNotes",
      params: { query: deckQuery },
    });
  });

  test("given note ids when requested then asks notesInfo and returns them", async () => {
    // given
    const requestedNoteIds = [1, 2];
    const notesInfo = [{ noteId: 1 }];
    AnkiConnectMock.respondWith(notesInfo);

    // when
    const cards = await new Anki().getNotes(requestedNoteIds);

    // then
    expect(cards).toEqual(notesInfo);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "notesInfo",
      params: { notes: requestedNoteIds },
    });
  });

  test("given model names when requested then asks modelNames", async () => {
    // given
    const modelNames = ["Basic", "Cloze"];
    AnkiConnectMock.respondWith(modelNames);

    // when
    const names = await new Anki().modelNames();

    // then
    expect(names).toEqual(modelNames);
    expect(AnkiConnectMock.requests[0]).toMatchObject({ action: "modelNames" });
  });

  test("given a model name when its fields are requested then asks modelFieldNames", async () => {
    // given
    const fields = ["Text", "Back Extra"];
    AnkiConnectMock.respondWith(fields);

    // when
    const result = await new Anki().modelFieldNames("Cloze");

    // then
    expect(result).toEqual(fields);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "modelFieldNames",
      params: { modelName: "Cloze" },
    });
  });

  test("given several models when fields are requested in one batch then uses a single multi with raw results", async () => {
    // given
    const wanted = ["Basic", "Cloze"];
    AnkiConnectMock.respondWith([
      ["Basic", "Cloze", "Luka"],
      ["Front", "Back"],
      { result: ["Text", "Back Extra"], error: null },
    ]);

    // when
    const snapshot = await new Anki().modelNamesWithFields(wanted);

    // then
    expect(snapshot).toEqual({
      fieldsByModel: {
        Basic: ["Front", "Back"],
        Cloze: ["Text", "Back Extra"],
      },
      modelNames: ["Basic", "Cloze", "Luka"],
    });
    expect(multiActions()).toEqual([
      { action: "modelNames" },
      { action: "modelFieldNames", modelName: "Basic" },
      { action: "modelFieldNames", modelName: "Cloze" },
    ]);
  });

  test("given a failing action inside a multi batch when read then rejects with its error", async () => {
    // given
    AnkiConnectMock.respondWith([
      ["Basic"],
      { result: null, error: "model not found" },
    ]);

    // when
    const run = new Anki().modelNamesWithFields(["Basic"]);

    // then
    await expect(run).rejects.toThrow("model not found");
  });

  test("given several missing models when created then sends one multi with all createModel actions", async () => {
    // given
    const definitions = [
      {
        modelName: "Basic",
        inOrderFields: ["Front", "Back"],
        css: "css",
        isCloze: false,
        cardTemplates: [],
      },
      {
        modelName: "Cloze",
        inOrderFields: ["Text", "Back Extra"],
        css: "css",
        isCloze: true,
        cardTemplates: [],
      },
    ];
    AnkiConnectMock.respondWith([{ result: {}, error: null }]);

    // when
    await new Anki().createModels(definitions);

    // then
    expect(multiActions()).toEqual([
      { action: "createModel", modelName: "Basic" },
      { action: "createModel", modelName: "Cloze" },
    ]);
  });

  test("given no models to create when created then sends nothing", async () => {
    // given
    const definitions: AnkiModelDefinition[] = [];

    // when
    await new Anki().createModels(definitions);

    // then
    expect(AnkiConnectMock.requests).toHaveLength(0);
  });

  test("given card ids when requested then asks cardsInfo", async () => {
    // given
    const requestedCardIds = [3];
    AnkiConnectMock.respondWith([]);

    // when
    await new Anki().cardsInfo(requestedCardIds);

    // then
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "cardsInfo",
      params: { cards: requestedCardIds },
    });
  });

  test("given a deck name when created then sends it and returns the id", async () => {
    // given
    const newDeckName = "Languages";
    const newDeckId = 42;
    AnkiConnectMock.respondWith(newDeckId);

    // when
    const deckId = await new Anki().createDeck(newDeckName);

    // then
    expect(deckId).toEqual(newDeckId);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "createDeck",
      params: { deck: newDeckName },
    });
  });

  test("given card ids and a deck when moved then sends them and returns null", async () => {
    // given
    const movedCardIds = [5, 6];
    const targetDeck = "Languages";
    AnkiConnectMock.respondWith(null);

    // when
    const result = await new Anki().changeDeck(movedCardIds, targetDeck);

    // then
    expect(result).toBeNull();
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "changeDeck",
      params: { cards: movedCardIds, deck: targetDeck },
    });
  });
});

describe("Anki - media", () => {
  test("given a filename when retrieved then sends it and returns content", async () => {
    // given
    const mediaContent = "ZGF0YQ==";
    const mediaFilename = "image.png";
    AnkiConnectMock.respondWith(mediaContent);

    // when
    const content = await new Anki().retrieveMediaFile(mediaFilename);

    // then
    expect(content).toEqual(mediaContent);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "retrieveMediaFile",
      params: { filename: mediaFilename },
    });
  });

  test("given no media when stored then skips the request", async () => {
    // when
    const stored = await new Anki().storeMediaFiles([createNote()]);

    // then
    expect(stored).toEqual({});
    expect(AnkiConnectMock.requests).toHaveLength(0);
  });

  test("given card media when stored then sends one store action per file", async () => {
    // given
    const mediaFilename = "image.png";
    const mediaContent = "ZGF0YQ==";
    const storeResults: unknown[] = [null];
    AnkiConnectMock.respondWith(storeResults);
    const note = createNote();
    note.mediaNames = [mediaFilename];
    note.mediaBase64Encoded = [mediaContent];

    // when
    const stored = await new Anki().storeMediaFiles([note]);

    // then
    expect(stored).toEqual(storeResults);
    const actions = multiSubActions();
    expect(actions).toEqual([
      {
        action: "storeMediaFile",
        params: { filename: mediaFilename, data: mediaContent },
      },
    ]);
  });
});

describe("Anki - addNotes", () => {
  test("given a working batch when added then resolves the note ids", async () => {
    // given
    const createdNoteIds = [101, 102];
    AnkiConnectMock.respondWith(createdNoteIds);

    const newNotes = [createNote(), createNote()];

    // when
    const ids = await new Anki().addNotes(newNotes);

    // then
    expect(ids).toEqual(createdNoteIds);
    expect(AnkiConnectMock.requests).toHaveLength(1);
    const request = required(AnkiConnectMock.requests[0], "request");
    expect(request.action).toBe("addNotes");
    const notes = request.params["notes"] as Array<Record<string, unknown>>;
    expect(notes).toHaveLength(createdNoteIds.length);
  });

  test("given per-note errors when added then still resolves the result array", async () => {
    // given
    const partialResponse: Record<string, unknown> = {
      result: [null, 102],
      error: ["duplicate", null],
    };
    AnkiConnectMock.setResponder(() => partialResponse);

    const newNotes = [createNote(), createNote()];

    // when
    const ids = await new Anki().addNotes(newNotes);

    // then
    expect(ids).toEqual([null, 102]);
    expect(AnkiConnectMock.requests).toHaveLength(1);
  });

  test("given a failed batch when added then falls back to one note at a time", async () => {
    // given
    const batchError = "batch failed";
    const singleNoteId = 777;
    AnkiConnectMock.setResponder((request) => {
      const notes = request.params["notes"] as unknown[];
      if (notes.length > 1) {
        return { result: null, error: batchError };
      }
      return { result: [singleNoteId], error: null };
    });

    const newNotes = [createNote(), createNote()];

    // when
    const ids = await new Anki().addNotes(newNotes);

    // then
    expect(ids).toEqual([singleNoteId, singleNoteId]);
    expect(AnkiConnectMock.requests).toHaveLength(3);
    for (const single of AnkiConnectMock.requests.slice(1)) {
      expect((single.params["notes"] as unknown[]).length).toBe(1);
    }
  });

  test("given failing singles when added then resolves failure sentinels", async () => {
    // given
    const alwaysFailingResponse: Record<string, unknown> = {
      result: null,
      error: "boom",
    };
    AnkiConnectMock.setResponder(() => alwaysFailingResponse);

    const newNotes = [createNote(), createNote()];

    // when
    const ids = await new Anki().addNotes(newNotes);

    // then
    expect(ids).toEqual([-1, -1]);
  });
});

describe("Anki - updateNotes", () => {
  test("given changed tags when updated then updates fields merges tags and moves the deck", async () => {
    // given
    AnkiConnectMock.respondWith([null, null, null, null]);
    const note = createNote();
    const tagsInAnki = ["a", "b"];
    const tagsInObsidian = ["b", "c"];
    const addedTag = "c";
    const removedTag = "a";
    note.oldTags = tagsInAnki;
    note.tags = tagsInObsidian;

    // when
    await new Anki().updateNotes([note]);

    // then
    const actions = multiSubActions();
    expect(actions.map((a) => a.action)).toEqual([
      "updateNoteFields",
      "addTags",
      "removeTags",
      "changeDeck",
    ]);
    const payload = required(actions[0], "action").params["note"] as Record<
      string,
      unknown
    >;
    expect(payload["id"]).toBe(note.noteId);
    expect(required(actions[1], "action").params).toMatchObject({
      notes: [note.noteId],
      tags: addedTag,
    });
    expect(required(actions[2], "action").params).toMatchObject({
      notes: [note.noteId],
      tags: removedTag,
    });
    expect(required(actions[3], "action").params).toMatchObject({
      cards: [note.noteId],
      deck: note.deckName,
    });
  });
});

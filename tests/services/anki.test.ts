import { Anki } from "src/services/anki";
import { Flashcard } from "src/entities/flashcard";
import {
  basicModelName,
  basicReversedModelName,
  clozeModelName,
  codeDeckExtension,
  sourceDeckExtension,
  spacedModelName,
} from "src/conf/constants";
import { AnkiConnectMock } from "../mocks/anki-connect";
import type { AnkiConnectRequest } from "../mocks/anki-connect";

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
  return subActionsOf(found[0]);
}

/** Actions of the last multi request - for flows with several requests. */
function lastMultiSubActions(): SubAction[] {
  const found = multiRequests();
  expect(found.length).toBeGreaterThan(0);
  return subActionsOf(found[found.length - 1]);
}

function createCard(): Flashcard {
  return new Flashcard(
    5,
    "Test deck",
    "original content",
    { Front: "Question", Back: "Answer" },
    false,
    0,
    10,
    ["b", "c"],
    false,
    [],
    false,
  );
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
    expect(AnkiConnectMock.requests[0].action).toBe("version");
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
    expect(AnkiConnectMock.requests[0].action).toBe("requestPermission");
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
    const cards = await new Anki().getCards(requestedNoteIds);

    // then
    expect(cards).toEqual(notesInfo);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "notesInfo",
      params: { notes: requestedNoteIds },
    });
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

  test("given note ids when deleted then asks deleteNotes", async () => {
    // given
    const deletedNoteIds = [4];
    AnkiConnectMock.respondWith(null);

    // when
    await new Anki().deleteCards(deletedNoteIds);

    // then
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "deleteNotes",
      params: { notes: deletedNoteIds },
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

describe("Anki - models", () => {
  const modelCreationResults: unknown[] = [null, null, null, null];
  const expectedModelNames = [
    basicModelName,
    basicReversedModelName,
    clozeModelName,
    spacedModelName,
  ];

  test("given no options when models created then builds four base models", async () => {
    // given
    AnkiConnectMock.respondWith(modelCreationResults);

    // when
    const created = await new Anki().createModels(false, false);

    // then
    expect(created).toEqual(modelCreationResults);
    const actions = multiSubActions();
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.action)).toEqual([
      "createModel",
      "createModel",
      "createModel",
      "createModel",
    ]);
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    expect(names).toEqual(expectedModelNames);
  });

  test("given sourceSupport when models created then adds the Source field", async () => {
    // given
    AnkiConnectMock.respondWith(modelCreationResults);

    // when
    const created = await new Anki().createModels(true, false);

    // then
    expect(created).toEqual(modelCreationResults);
    const actions = multiSubActions();
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    for (const name of names) {
      expect(name).toContain(sourceDeckExtension);
    }
    const fields = actions[0].params["inOrderFields"] as string[];
    expect(fields).toContain("Source");
  });

  test("given codeHighlightSupport when models created then doubles the models", async () => {
    // given
    const doubledResults = new Array(8).fill(null);
    AnkiConnectMock.respondWith(doubledResults);

    // when
    const created = await new Anki().createModels(false, true);

    // then
    expect(created).toEqual(doubledResults);
    const actions = multiSubActions();
    expect(actions).toHaveLength(8);
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    expect(names.slice(4).every((n) => n.includes(codeDeckExtension))).toBe(
      true,
    );
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
    const stored = await new Anki().storeMediaFiles([createCard()]);

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
    const card = createCard();
    card.mediaNames = [mediaFilename];
    card.mediaBase64Encoded = [mediaContent];

    // when
    const stored = await new Anki().storeMediaFiles([card]);

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

  test("given existing highlight files when checked then does nothing", async () => {
    // given
    AnkiConnectMock.respondWith("file-content");

    // when
    const stored = await new Anki().storeCodeHighlightMedias();

    // then
    expect(stored).toBeUndefined();
    expect(AnkiConnectMock.requests).toHaveLength(1);
    expect(AnkiConnectMock.requests[0].action).toBe("retrieveMediaFile");
  });

  test("given missing highlight files when checked then stores the three files", async () => {
    // given
    const highlightStoreResults: unknown[] = [null, null, null];
    const expectedHighlightFiles = [
      "_highlight.js",
      "_highlightInit.js",
      "_highlight.css",
    ];
    AnkiConnectMock.setResponder((request) =>
      request.action === "retrieveMediaFile"
        ? { result: null, error: null }
        : { result: highlightStoreResults, error: null },
    );

    // when
    const stored = await new Anki().storeCodeHighlightMedias();

    // then
    expect(stored).toEqual(highlightStoreResults);
    expect(AnkiConnectMock.requests).toHaveLength(2);
    const actions = lastMultiSubActions();
    expect(actions.map((a) => a.action)).toEqual([
      "storeMediaFile",
      "storeMediaFile",
      "storeMediaFile",
    ]);
    const filenames = actions.map(
      (a) => (a.params as Record<string, string>)["filename"],
    );
    expect(filenames).toEqual(expectedHighlightFiles);
  });
});

describe("Anki - addCards", () => {
  test("given a working batch when added then resolves the note ids", async () => {
    // given
    const createdNoteIds = [101, 102];
    AnkiConnectMock.respondWith(createdNoteIds);

    const newCards = [createCard(), createCard()];

    // when
    const ids = await new Anki().addCards(newCards);

    // then
    expect(ids).toEqual(createdNoteIds);
    expect(AnkiConnectMock.requests).toHaveLength(1);
    const request = AnkiConnectMock.requests[0];
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

    const newCards = [createCard(), createCard()];

    // when
    const ids = await new Anki().addCards(newCards);

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

    const newCards = [createCard(), createCard()];

    // when
    const ids = await new Anki().addCards(newCards);

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

    const newCards = [createCard(), createCard()];

    // when
    const ids = await new Anki().addCards(newCards);

    // then
    expect(ids).toEqual([-1, -1]);
  });
});

describe("Anki - updateCards", () => {
  test("given changed tags when updated then updates fields merges tags and moves the deck", async () => {
    // given
    AnkiConnectMock.respondWith([null, null, null, null]);
    const card = createCard();
    const tagsInAnki = ["a", "b"];
    const tagsInObsidian = ["b", "c"];
    const addedTag = "c";
    const removedTag = "a";
    card.oldTags = tagsInAnki;
    card.tags = tagsInObsidian;

    // when
    await new Anki().updateCards([card]);

    // then
    const actions = multiSubActions();
    expect(actions.map((a) => a.action)).toEqual([
      "updateNoteFields",
      "addTags",
      "removeTags",
      "changeDeck",
    ]);
    const note = actions[0].params["note"] as Record<string, unknown>;
    expect(note["id"]).toBe(card.id);
    expect(actions[1].params).toMatchObject({
      notes: [card.id],
      tags: addedTag,
    });
    expect(actions[2].params).toMatchObject({
      notes: [card.id],
      tags: removedTag,
    });
    expect(actions[3].params).toMatchObject({
      cards: [card.id],
      deck: card.deckName,
    });
  });
});

/**
 * The mock must behave like AnkiConnect: an action it does not support is
 * answered with "unsupported action", so no test can quietly rely on an action
 * that was removed upstream. The list holds the officially supported actions
 * this plugin uses; add one when the plugin starts using another.
 */
import { AnkiConnectMock, supportedAnkiActions } from "./anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function respondFor(request: { action: string }): {
  error: unknown;
  result: unknown;
} {
  return request.action === "modelNames"
    ? { error: null, result: ["Basic"] }
    : { error: null, result: ["Front", "Back"] };
}

describe("AnkiConnectMock", () => {
  test("given an action AnkiConnect does not support when requested then answers unsupported", () => {
    // given
    AnkiConnectMock.setResponder(respondFor);

    // when
    const response = AnkiConnectMock.answer({
      action: "modelNamesAndFieldNames",
      params: {},
      version: 6,
    });

    // then
    expect(response).toEqual({ error: "unsupported action", result: null });
  });

  test("given a supported action when requested then passes it to the responder", () => {
    // given
    AnkiConnectMock.setResponder(respondFor);

    // when
    const response = AnkiConnectMock.answer({
      action: "modelNames",
      params: {},
      version: 6,
    });

    // then
    expect(response).toEqual({ error: null, result: ["Basic"] });
  });

  test("given the list of supported actions when inspected then it holds the documented ones we use", () => {
    // given
    const expected = [
      "addNotes",
      "addTags",
      "cardsInfo",
      "changeDeck",
      "createDeck",
      "createModel",
      "deckNames",
      "deleteNotes",
      "findNotes",
      "modelFieldNames",
      "modelNames",
      "multi",
      "notesInfo",
      "removeTags",
      "requestPermission",
      "retrieveMediaFile",
      "storeMediaFile",
      "updateNoteFields",
      "version",
    ];

    // when
    const supported = [...supportedAnkiActions].sort();

    // then
    expect(supported).toEqual(expected);
  });
});

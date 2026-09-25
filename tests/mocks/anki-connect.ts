/**
 * Mock of the browser XMLHttpRequest tailored to AnkiConnect.
 *
 * The Anki service (src/services/anki.ts) talks to AnkiConnect with raw
 * XMLHttpRequest, which does not exist in the jest node environment.
 * This mock records every outgoing request and answers with a programmed
 * responder, so service methods can be tested without a running Anki.
 */

export interface AnkiConnectRequest {
  action: string;
  params: Record<string, unknown>;
  version: number;
}

export type AnkiResponder = (
  request: AnkiConnectRequest,
) => Record<string, unknown>;

/**
 * Officially supported AnkiConnect actions this plugin uses. Anki answers
 * "unsupported action" for everything else, so the mock does too - otherwise a
 * test could pass against an action that no longer exists in AnkiConnect
 * (modelNamesAndFieldNames was one, removed upstream, and it broke Export).
 */
export const supportedAnkiActions: ReadonlySet<string> = new Set([
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
]);

const requests: AnkiConnectRequest[] = [];
let responder: AnkiResponder = () => ({ result: null, error: null });
let connectionDown = false;

class MockXMLHttpRequest {
  public responseText = "";
  public method = "";
  public url = "";
  private listeners: Record<string, Array<() => void>> = {};

  public addEventListener(type: string, listener: () => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  public open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  public send(body: string): void {
    const request = JSON.parse(body) as AnkiConnectRequest;
    requests.push(request);
    if (connectionDown) {
      this.dispatch("error");
      return;
    }
    this.responseText = JSON.stringify(AnkiConnectMock.answer(request));
    this.dispatch("load");
  }

  private dispatch(type: string): void {
    for (const listener of this.listeners[type] ?? []) {
      listener();
    }
  }
}

/**
 * Single entry point to the mock. Import this object in tests and call
 * its methods - e.g. `AnkiConnectMock.respondWith(6)` - so it is always
 * clear which collaborator a call belongs to.
 */
export const AnkiConnectMock = {
  /** Installs the mock as global XMLHttpRequest. */
  install(): void {
    Object.assign(globalThis, { XMLHttpRequest: MockXMLHttpRequest });
  },

  /** Clears recorded requests and restores the default responder. */
  reset(): void {
    requests.length = 0;
    responder = () => ({ result: null, error: null });
    connectionDown = false;
  },

  /** Answers a request the way AnkiConnect would, honouring the action list. */
  answer(request: AnkiConnectRequest): Record<string, unknown> {
    if (!supportedAnkiActions.has(request.action)) {
      return { error: "unsupported action", result: null };
    }
    return responder(request);
  },

  /** Sets a custom responder for upcoming requests. */
  setResponder(next: AnkiResponder): void {
    responder = next;
  },

  /** Answers every upcoming request with the same result/error pair. */
  respondWith(result: unknown, error: unknown = null): void {
    responder = () => ({ result, error });
  },

  /** Simulates Anki being unreachable (triggers the xhr "error" event). */
  setConnectionDown(down: boolean): void {
    connectionDown = down;
  },

  /** All requests recorded since the last reset, in order. */
  get requests(): AnkiConnectRequest[] {
    return requests;
  },
};

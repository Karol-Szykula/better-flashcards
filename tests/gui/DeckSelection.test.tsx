/**
 * @jest-environment jsdom
 *
 * User-perspective tests for wizard page 1: deck list rendering,
 * imported badges, disabled state and selection callback.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Anki } from "src/services/anki";
import { DeckSelection } from "src/gui/import-wizard/components/DeckSelection";
import { AnkiConnectMock } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function respondWithDecks(noteIds: number[] = [11, 22]) {
  AnkiConnectMock.setResponder((request) => {
    switch (request.action) {
      case "deckNames":
        return { result: ["Languages", "Medicine", "Empty"], error: null };
      case "findNotes": {
        const params = request.params as Record<string, unknown>;
        const query = params["query"] as string;
        if (query.includes("Empty")) {
          return { result: [], error: null };
        }
        return { result: noteIds, error: null };
      }
      default:
        return { result: null, error: null };
    }
  });
}

function respondWithDeckNotes(deckCards: Record<string, number[]>) {
  AnkiConnectMock.setResponder((request) => {
    switch (request.action) {
      case "deckNames":
        return { result: Object.keys(deckCards), error: null };
      case "findNotes": {
        const params = request.params as Record<string, unknown>;
        const query = params["query"] as string;
        const deckName = Object.keys(deckCards).find((name) =>
          query.includes(name)
        );
        return { result: deckName ? deckCards[deckName] : [], error: null };
      }
      default:
        return { result: null, error: null };
    }
  });
}

function renderDeckSelection(vaultNoteIndex = new Map<number, string>()) {
  const onSelectDeckName = jest.fn();
  render(
    <DeckSelection
      anki={new Anki()}
      onSelectDeckName={onSelectDeckName}
      selectedDeckName=""
      vaultNoteIndex={vaultNoteIndex}
    />
  );
  return { onSelectDeckName };
}

describe("DeckSelection", () => {
  test("given decks in Anki when the list renders then shows names with counters", async () => {
    // given
    respondWithDecks();
    renderDeckSelection();

    // when
    const languages = await screen.findByText("Languages");
    const medicine = await screen.findByText("Medicine");
    const counters = await screen.findAllByText("0/2");

    // then
    expect(languages).toBeInTheDocument();
    expect(medicine).toBeInTheDocument();
    expect(counters).toHaveLength(2);
  });

  test("given fully imported decks when the list renders then disables them with a tooltip", async () => {
    // given
    respondWithDecks();
    renderDeckSelection(
      new Map([
        [11, "Note.md"],
        [22, "Note.md"],
      ])
    );

    // when
    const radio = await screen.findByRole("radio", { name: /Languages/ });
    const counters = await screen.findAllByText("2/2");

    // then
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute("title", "Already in Obsidian");
    expect(counters).toHaveLength(2);
  });

  test("given a deck list when a radio is clicked then notifies with the deck name", async () => {
    // given
    respondWithDecks();
    const user = userEvent.setup();
    const { onSelectDeckName } = renderDeckSelection();
    const radio = await screen.findByRole("radio", { name: /Medicine/ });

    // when
    await user.click(radio);

    // then
    expect(onSelectDeckName).toHaveBeenCalledTimes(1);
    expect(onSelectDeckName).toHaveBeenCalledWith("Medicine");
  });

  test("given unreachable Anki when the list loads then shows an error", async () => {
    // given
    AnkiConnectMock.setConnectionDown(true);
    renderDeckSelection();

    // when
    const error = await screen.findByText(/Anki must be open/);

    // then
    expect(error).toBeInTheDocument();
  });

  test("given a selectable deck when rendered then marks the radio as clickable", async () => {
    // given
    respondWithDecks();
    renderDeckSelection();

    // when
    const radio = await screen.findByRole("radio", { name: /Languages/ });

    // then
    expect(radio).toHaveClass("flashcards-import-wizard-modal__deck-radio");
  });

  test("given an empty deck when rendered then greys it out without a label element", async () => {
    // given
    respondWithDecks();
    renderDeckSelection();

    // when
    const radio = await screen.findByRole("radio", { name: /Empty/ });

    // then
    expect(radio).toBeDisabled();
    expect(
      radio.closest("div.flashcards-import-wizard-modal__list-row")
    ).toHaveClass("flashcards-import-wizard-modal__deck-row--disabled");
    expect(radio.closest("label")).toBeNull();
    expect(
      radio.closest("span.flashcards-import-wizard-modal__labeled-control--disabled")
    ).not.toBeNull();
  });

  test("given no label association when rendered then keeps the accessible name", async () => {
    // given
    respondWithDecks();
    renderDeckSelection();

    // when
    const radio = await screen.findByRole("radio", { name: /Empty/ });

    // then
    expect(radio).toHaveAttribute("aria-label", "Empty");
  });

  test("given a selectable deck when rendered then keeps a clickable label", async () => {
    // given
    respondWithDecks();
    renderDeckSelection();

    // when
    const radio = await screen.findByRole("radio", { name: /Languages/ });

    // then
    expect(radio.closest("label")).not.toBeNull();
    expect(radio.closest("label")).not.toHaveClass(
      "flashcards-import-wizard-modal__labeled-control--disabled"
    );
  });

  test("given an empty Default deck when the list renders then hides it", async () => {
    // given
    respondWithDeckNotes({ Default: [], Languages: [11] });
    renderDeckSelection();

    // when
    const languages = await screen.findByText("Languages");

    // then
    expect(languages).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  test("given a non-empty Default deck when the list renders then shows it", async () => {
    // given
    respondWithDeckNotes({ Default: [11], Languages: [22] });
    renderDeckSelection();

    // when
    const defaultDeck = await screen.findByText("Default");
    const counters = await screen.findAllByText("0/1");

    // then
    expect(defaultDeck).toBeInTheDocument();
    expect(counters).toHaveLength(2);
  });
});

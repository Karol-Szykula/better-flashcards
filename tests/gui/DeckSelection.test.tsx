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
        return { result: ["Languages", "Medicine"], error: null };
      case "findNotes":
        return { result: noteIds, error: null };
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
  test("renders decks with imported counters", async () => {
    respondWithDecks();
    renderDeckSelection();

    expect(await screen.findByText("Languages")).toBeInTheDocument();
    expect(await screen.findByText("Medicine")).toBeInTheDocument();
    expect(await screen.findAllByText("0/2")).toHaveLength(2);
  });

  test("disables fully imported decks with a tooltip", async () => {
    respondWithDecks();
    renderDeckSelection(
      new Map([
        [11, "Note.md"],
        [22, "Note.md"],
      ])
    );

    const radio = await screen.findByRole("radio", { name: /Languages/ });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute("title", "Already in Obsidian");
    expect(await screen.findAllByText("2/2")).toHaveLength(2);
  });

  test("notifies about the selected deck on click", async () => {
    respondWithDecks();
    const user = userEvent.setup();
    const { onSelectDeckName } = renderDeckSelection();

    await user.click(await screen.findByRole("radio", { name: /Medicine/ }));

    expect(onSelectDeckName).toHaveBeenCalledTimes(1);
    expect(onSelectDeckName).toHaveBeenCalledWith("Medicine");
  });

  test("shows an error when Anki is unreachable", async () => {
    AnkiConnectMock.setConnectionDown(true);
    renderDeckSelection();

    expect(
      await screen.findByText(/Anki must be open/)
    ).toBeInTheDocument();
  });
});

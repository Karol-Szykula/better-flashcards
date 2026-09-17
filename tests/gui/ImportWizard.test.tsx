/**
 * @jest-environment jsdom
 *
 * Integration tests for the ImportWizard first page: real in-memory vault
 * plus mocked AnkiConnect, asserting the composed DeckSelection view,
 * page indicator labels and footer button states.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { ImportWizard } from "src/gui/import-wizard/ImportWizard";
import { createSettings } from "../helpers/settings";
import { AnkiConnectMock } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

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

function renderWizard(files: Record<string, string> = {}) {
  const app = App.createConfigured__({ files });
  const onCancel = jest.fn();
  const saveSettings = jest.fn(async (): Promise<void> => undefined);
  render(
    <ImportWizard
      onCancel={onCancel}
      saveSettings={saveSettings}
      settings={createSettings()}
      vault={app.vault as unknown as ObsidianVault}
    />
  );
  return { onCancel };
}

describe("ImportWizard - first page", () => {
  const importedNoteFileName = "Note.md";
  const importedNoteId = 1111111111111;
  const importedNoteContent = `Q :: A\n^${importedNoteId}\n`;
  const secondImportedNoteFileName = "Other.md";
  const secondImportedNoteId = 2222222222222;
  const secondImportedNoteContent = `Q :: B\n^${secondImportedNoteId}\n`;

  test("given a deck in Anki when the wizard opens then shows all page indicator labels", async () => {
    // given
    respondWithDeckNotes({ Languages: [1111111111111] });
    renderWizard();

    // when
    const deck = await screen.findByText("Deck");
    const fields = await screen.findByText("Fields");
    const cards = await screen.findByText("Cards");
    const save = await screen.findByText("Save");

    // then
    expect(deck).toBeInTheDocument();
    expect(fields).toBeInTheDocument();
    expect(cards).toBeInTheDocument();
    expect(save).toBeInTheDocument();
  });

  test("given one of two notes already imported when the list renders then shows the 1/2 counter", async () => {
    // given
    respondWithDeckNotes({ Languages: [importedNoteId, secondImportedNoteId] });
    renderWizard({ [importedNoteFileName]: importedNoteContent });

    // when
    const counter = await screen.findByText("1/2");

    // then
    expect(await screen.findByText("Languages")).toBeInTheDocument();
    expect(counter).toBeInTheDocument();
  });

  test("given no deck selected when the page loads then Next is disabled until a deck is chosen", async () => {
    // given
    respondWithDeckNotes({ Languages: [1111111111111] });
    renderWizard();
    const user = userEvent.setup();

    // when
    const nextBefore = await screen.findByRole("button", { name: /Next/ });

    // then
    expect(nextBefore).toBeDisabled();

    // when
    await user.click(await screen.findByRole("radio", { name: /Languages/ }));
    const nextAfter = await screen.findByRole("button", { name: /Next/ });

    // then
    expect(nextAfter).not.toBeDisabled();
  });

  test("given all notes already imported when the list renders then the deck is greyed out and disabled", async () => {
    // given
    respondWithDeckNotes({ Languages: [importedNoteId, secondImportedNoteId] });
    renderWizard({
      [importedNoteFileName]: importedNoteContent,
      [secondImportedNoteFileName]: secondImportedNoteContent,
    });

    // when
    const radio = await screen.findByRole("radio", { name: /Languages/ });

    // then
    expect(radio).toBeDisabled();
    expect(await screen.findByText("2/2")).toBeInTheDocument();
  });

  test("given the first page when rendered then shows Cancel without Back and when Cancel is clicked then notifies", async () => {
    // given
    respondWithDeckNotes({ Languages: [1111111111111] });
    const { onCancel } = renderWizard();
    const user = userEvent.setup();

    // when
    const cancel = await screen.findByRole("button", { name: "Cancel" });

    // then
    expect(
      screen.queryByRole("button", { name: /Back/ })
    ).not.toBeInTheDocument();

    // when
    await user.click(cancel);

    // then
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

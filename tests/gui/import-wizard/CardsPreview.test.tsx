/**
 * @jest-environment jsdom
 *
 * User-perspective tests for wizard page 3: unchanged imported rows
 * render greyed out and unselectable, while new and updated rows
 * are selected by default.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen } from "@testing-library/react";
import { Anki } from "src/services/anki";
import { CardsPreview } from "src/gui/import-wizard/components/CardsPreview";
import { AnkiConnectMock } from "../../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function previewNote(noteId: number, mod: number, front: string) {
  return {
    noteId,
    mod,
    modelName: "Basic",
    fields: { Front: { value: `<p>${front}</p>` } },
    tags: [] as string[],
    cards: [7],
  };
}

function respondWithPreviewNotes() {
  AnkiConnectMock.setResponder((request) => {
    if (request.action === "findNotes") {
      return { result: [101, 102, 103], error: null };
    }
    if (request.action === "notesInfo") {
      return {
        result: [
          previewNote(101, 100, "Imported card"),
          previewNote(102, 200, "Updated card"),
          previewNote(103, 300, "Fresh card"),
        ],
        error: null,
      };
    }
    return { result: null, error: null };
  });
}

function renderPreview() {
  const onCardsSelectedToImportChange = jest.fn();
  const onNotesLoaded = jest.fn();
  const onPageChange = jest.fn();
  const onTotalPagesChange = jest.fn();
  render(
    <CardsPreview
      anki={new Anki()}
      cardsSelectedToImport={{}}
      currentPage={0}
      deckName="Languages"
      onCardsSelectedToImportChange={onCardsSelectedToImportChange}
      onNotesLoaded={onNotesLoaded}
      onPageChange={onPageChange}
      onTotalPagesChange={onTotalPagesChange}
      syncState={{ fallbackRev: 0, syncedMods: { 101: 100, 102: 100 } }}
      totalPages={1}
      vaultNoteIndex={
        new Map([
          [101, "Languages-101.md"],
          [102, "Languages-102.md"],
        ])
      }
    />
  );
  return { onCardsSelectedToImportChange, onPageChange, onTotalPagesChange };
}

describe("CardsPreview", () => {
  test("given an unchanged imported note when preview renders then greys it out and disables selection", async () => {
    // given
    respondWithPreviewNotes();
    renderPreview();

    // when
    const boxes = await screen.findAllByRole("checkbox");
    const importedSummary = await screen.findByText("Imported card");
    const updatedSummary = await screen.findByText("Updated card");

    // then
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).not.toBeDisabled();
    expect(boxes[1]).not.toBeDisabled();
    expect(boxes[2]).toBeDisabled();
    expect(boxes[2]).not.toBeChecked();
    expect(
      importedSummary.closest(
        "div.flashcards-import-wizard-modal__preview-row--imported"
      )
    ).not.toBeNull();
    expect(
      updatedSummary.closest(
        "div.flashcards-import-wizard-modal__preview-row--imported"
      )
    ).toBeNull();
  });

  test("given updated and new notes when preview renders then selects them by default", async () => {
    // given
    respondWithPreviewNotes();
    const { onCardsSelectedToImportChange } = renderPreview();

    // when
    await screen.findAllByRole("checkbox");

    // then
    expect(onCardsSelectedToImportChange).toHaveBeenCalledWith({
      101: false,
      102: true,
      103: true,
    });
  });

  test("given an imported note first when preview renders then lists it after new and updated notes", async () => {
    // given
    respondWithPreviewNotes();
    renderPreview();

    // when
    const summaries = await screen.findAllByText(/card$/);

    // then
    expect(summaries.map((summary) => summary.textContent)).toEqual([
      "Updated card",
      "Fresh card",
      "Imported card",
    ]);
  });
});

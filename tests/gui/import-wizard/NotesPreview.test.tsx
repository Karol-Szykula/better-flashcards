/**
 * @jest-environment jsdom
 *
 * User-perspective tests for wizard page 3: every row states the direction of
 * the change and what will happen, only notes that will really be written are
 * selected, and every row offers "Anki wins" - a per-note force that takes
 * Anki's version no matter the state, in bulk or for one note.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Anki } from "src/services/anki";
import { NotesPreview } from "src/gui/import-wizard/components/NotesPreview";
import type { Vault as ObsidianVault } from "obsidian";
import { App } from "obsidian-test-mocks/obsidian";
import { computeContentHash } from "src/services/yaml-note";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import type { NoteLifecycleRecord } from "src/services/note-lifecycle";
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

type PreviewNote = ReturnType<typeof previewNote>;

interface PreviewScenario {
  files: Record<string, string>;
  forcedNoteIds?: Record<number, boolean>;
  noteLifecycle: Record<number, NoteLifecycleRecord>;
  notes: PreviewNote[];
  vaultNoteIndex: Map<number, string>;
}

function previewNotes(): PreviewNote[] {
  return [
    previewNote(101, 100, "Up to date card"),
    previewNote(102, 200, "Anki newer card"),
    previewNote(103, 300, "Fresh card"),
    previewNote(104, 100, "Vault newer card"),
    previewNote(105, 500, "Both changed card"),
    previewNote(106, 100, "Missing file card"),
  ];
}

function respondWithNotes(notes: PreviewNote[]): void {
  AnkiConnectMock.setResponder((request) => {
    if (request.action === "findNotes") {
      return { result: notes.map((note) => note.noteId), error: null };
    }
    if (request.action === "notesInfo") {
      return { result: notes, error: null };
    }
    return { result: null, error: null };
  });
}

function respondWithPreviewNotes(): void {
  respondWithNotes(previewNotes());
}

function noteBlock(front: string, back: string, id: number): string {
  return [
    "```note-form",
    `front: ${front}`,
    `back: ${back}`,
    'tags: ""',
    `id: ${id}`,
    "```",
  ].join("\n");
}

async function previewRecords(): Promise<Record<number, NoteLifecycleRecord>> {
  return {
    101: syncedCleanRecord(
      100,
      await computeContentHash("Up to date card", "B", "", "Basic"),
      0,
    ),
    102: syncedCleanRecord(
      100,
      await computeContentHash("Anki newer card", "B", "", "Basic"),
      0,
    ),
    104: syncedCleanRecord(
      100,
      await computeContentHash("Anki side text", "B", "", "Basic"),
      0,
    ),
    105: syncedCleanRecord(100, "stale", 0),
    106: syncedCleanRecord(100, "stale", 0),
  };
}

async function defaultPreviewScenario(): Promise<PreviewScenario> {
  return {
    files: {
      "Up to date-101.md": `${noteBlock("Up to date card", "B", 101)}\n`,
      "Anki newer-102.md": `${noteBlock("Anki newer card", "B", 102)}\n`,
      "Vault newer-104.md": `${noteBlock("Vault newer card", "B", 104)}\n`,
      "Both changed-105.md": `${noteBlock("Both changed card", "B", 105)}\n`,
    },
    noteLifecycle: await previewRecords(),
    notes: previewNotes(),
    vaultNoteIndex: new Map([
      [101, "Up to date-101.md"],
      [102, "Anki newer-102.md"],
      [104, "Vault newer-104.md"],
      [105, "Both changed-105.md"],
    ]),
  };
}

async function renderPreview(scenarioOverride?: PreviewScenario) {
  const scenario = scenarioOverride ?? (await defaultPreviewScenario());
  const onNotesSelectedToImportChange = jest.fn();
  const onForcedNoteIdsChange = jest.fn();
  const onNotesLoaded = jest.fn();
  const onPageChange = jest.fn();
  const onTotalPagesChange = jest.fn();
  const app = App.createConfigured__({
    files: scenario.files,
  });
  const vault = app.vault as unknown as ObsidianVault;
  render(
    <NotesPreview
      anki={new Anki()}
      currentPage={0}
      deckName="Languages"
      forcedNoteIds={scenario.forcedNoteIds ?? {}}
      noteLifecycle={scenario.noteLifecycle}
      notesSelectedToImport={{}}
      onForcedNoteIdsChange={onForcedNoteIdsChange}
      onNotesLoaded={onNotesLoaded}
      onNotesSelectedToImportChange={onNotesSelectedToImportChange}
      onPageChange={onPageChange}
      onTotalPagesChange={onTotalPagesChange}
      totalPages={1}
      vault={vault}
      vaultNoteIndex={scenario.vaultNoteIndex}
    />,
  );
  return {
    onForcedNoteIdsChange,
    onNotesSelectedToImportChange,
    onPageChange,
    onTotalPagesChange,
  };
}

function previewRow(summaryText: string): HTMLElement {
  const summary = screen.getByText(summaryText);
  const row = summary.closest(
    "div.flashcards-import-wizard-modal__preview-row",
  );
  if (row === null) {
    throw new Error(`No preview row found for ${summaryText}`);
  }
  return row as HTMLElement;
}

describe("NotesPreview", () => {
  test("given an unchanged imported note when preview renders then greys it out and disables selection", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const upToDate = await screen.findByText("Up to date card");
    const boxes = screen.getAllByRole("checkbox", { name: "" });

    // then
    expect(upToDate).not.toBeNull();
    expect(
      upToDate.closest(
        "div.flashcards-import-wizard-modal__preview-row--imported",
      ),
    ).not.toBeNull();
    expect(boxes.filter((box) => box.hasAttribute("disabled"))).toHaveLength(4);
  });

  test("given a vault-newer note when preview renders then says the vault is newer and leaves it unselected", async () => {
    // given
    respondWithPreviewNotes();
    const { onNotesSelectedToImportChange } = await renderPreview();

    // when
    await screen.findByText(/newer in Obsidian/i);

    // then
    expect(onNotesSelectedToImportChange).toHaveBeenCalledWith({
      101: false,
      102: true,
      103: true,
      104: false,
      105: false,
      106: false,
    });
  });

  test("given an anki-newer note when preview renders then warns that the file will be overwritten", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const warning = await screen.findByText(
      /newer in Anki.*overwrites your file/i,
    );

    // then
    expect(warning).not.toBeNull();
  });

  test("given a note Anki has never seen when the preview renders then the row says it creates a file", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const badge = await screen.findByText(/new.*creates a file/i);

    // then
    expect(badge).toBeInTheDocument();
  });

  test("given a note edited in both places when the preview renders then the row says Sync decides by newest", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const badge = await screen.findByText(
      /edited in both.*newest wins on sync/i,
    );

    // then
    expect(badge).toBeInTheDocument();
  });

  test("given a note already imported and unchanged when the preview renders then the row names the file it lives in", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const badge = await screen.findByText(/up to date.*Up to date-101\.md/i);

    // then
    expect(badge).toBeInTheDocument();
  });

  test("given a note without a file when preview renders then leaves it to Sync", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const leftToSync = await screen.findByText(/no file.*Sync decides/i);

    // then
    expect(leftToSync).not.toBeNull();
  });

  test("given a note whose id is nowhere in the vault when the preview renders then the row says so", async () => {
    // given
    const notes = [previewNote(201, 100, "Forgotten card")];
    respondWithNotes(notes);
    const scenario: PreviewScenario = {
      files: {},
      noteLifecycle: { 201: syncedCleanRecord(100, "stale", 0) },
      notes,
      vaultNoteIndex: new Map(),
    };
    await renderPreview(scenario);

    // when
    const badge = await screen.findByText(/no file.*nowhere in the vault/i);

    // then
    expect(badge).toBeInTheDocument();
  });

  test("given a file with no readable block for the id when the preview renders then the row says the block is unreadable", async () => {
    // given
    const notes = [previewNote(202, 100, "Unreadable card")];
    respondWithNotes(notes);
    const scenario: PreviewScenario = {
      files: { "Languages/Other-202.md": "plain text without a block\n" },
      noteLifecycle: { 202: syncedCleanRecord(100, "stale", 0) },
      notes,
      vaultNoteIndex: new Map([[202, "Languages/Other-202.md"]]),
    };
    await renderPreview(scenario);

    // when
    const badge = await screen.findByText(
      /no file.*no readable note-form block/i,
    );

    // then
    expect(badge).toBeInTheDocument();
  });

  test("given only notes without files when preview renders then it points at the bulk force and names the resurrection", async () => {
    // given
    const notes = [previewNote(201, 100, "Forgotten card")];
    respondWithNotes(notes);
    const scenario: PreviewScenario = {
      files: {},
      noteLifecycle: { 201: syncedCleanRecord(100, "stale", 0) },
      notes,
      vaultNoteIndex: new Map(),
    };
    await renderPreview(scenario);

    // when
    const hint = await screen.findByText(/nothing is selected/i);

    // then
    expect(hint.textContent).toMatch(/1 note with no file in Obsidian/i);
    expect(
      screen.getByText(/re-creates 1 note you deleted in Obsidian/i),
    ).toBeInTheDocument();
  });

  test("given a note without a file when the preview renders then Anki wins is offered", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    await screen.findByText("Missing file card");
    const toggle = within(previewRow("Missing file card")).getByRole(
      "checkbox",
      {
        name: /re-create the file you deleted/i,
      },
    );

    // then
    expect(toggle).toBeInTheDocument();
  });

  test("given a forced note without a file when the preview renders then the row says the file comes back", async () => {
    // given
    const notes = [previewNote(201, 100, "Forgotten card")];
    respondWithNotes(notes);
    const scenario: PreviewScenario = {
      files: {},
      forcedNoteIds: { 201: true },
      noteLifecycle: { 201: syncedCleanRecord(100, "stale", 0) },
      notes,
      vaultNoteIndex: new Map(),
    };
    await renderPreview(scenario);

    // when
    const row = await screen.findByText(/Anki wins.*re-creates the file/i);

    // then
    expect(row).toBeInTheDocument();
  });

  test("given a vault-newer note when Anki wins is clicked then it is forced and selected", async () => {
    // given
    respondWithPreviewNotes();
    const { onForcedNoteIdsChange, onNotesSelectedToImportChange } =
      await renderPreview();
    await screen.findByText("Vault newer card");

    // when
    await userEvent.setup().click(
      within(previewRow("Vault newer card")).getByRole("checkbox", {
        name: /Anki wins: overwrite/i,
      }),
    );

    // then
    expect(onForcedNoteIdsChange).toHaveBeenCalledWith({ 104: true });
    expect(onNotesSelectedToImportChange).toHaveBeenCalledWith(
      expect.objectContaining({ 104: true }),
    );
  });

  test("given notes left undecided when the bulk force is used then every one is forced", async () => {
    // given
    respondWithPreviewNotes();
    const { onForcedNoteIdsChange, onNotesSelectedToImportChange } =
      await renderPreview();
    const useAnkiForAll = await screen.findByRole("button", {
      name: /use anki's version for all \(4\)/i,
    });

    // when
    await userEvent.setup().click(useAnkiForAll);

    // then
    expect(onForcedNoteIdsChange).toHaveBeenCalledWith({
      101: true,
      104: true,
      105: true,
      106: true,
    });
    expect(onNotesSelectedToImportChange).toHaveBeenCalledWith(
      expect.objectContaining({ 101: true, 104: true, 105: true, 106: true }),
    );
  });

  test("given every note state when preview renders then lists actionable notes first", async () => {
    // given
    respondWithPreviewNotes();
    await renderPreview();

    // when
    const summaries = await screen.findAllByText(/card$/);

    // then
    expect(summaries.map((summary) => summary.textContent)).toEqual([
      "Fresh card",
      "Anki newer card",
      "Vault newer card",
      "Both changed card",
      "Missing file card",
      "Up to date card",
    ]);
  });
});

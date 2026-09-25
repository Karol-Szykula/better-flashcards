/**
 * @jest-environment jsdom
 *
 * User-perspective tests for the import execution page: automatic run
 * on open with progress and final report, without any buttons.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen } from "@testing-library/react";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { Anki } from "src/services/anki";
import { ImportExecution } from "src/gui/import-wizard/components/ImportExecution";
import type { ImportExecutionReport } from "src/services/import";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import type {
  NoteLifecycleRecord,
  NoteLifecycleStatus,
} from "src/services/note-lifecycle";
import { AnkiConnectMock } from "../../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function basicNote(noteId: number, mod: number) {
  return {
    noteId,
    mod,
    modelName: "Basic",
    fields: {
      Front: { value: "<p>What is 2+2?</p>" },
      Back: { value: "<p>4</p>" },
    },
    tags: [] as string[],
    cards: [7],
  };
}

const deckNotes = [basicNote(101, 100), basicNote(102, 200)];

function respondWithDeckNotes(
  known: ReturnType<typeof basicNote>[] = deckNotes,
) {
  AnkiConnectMock.setResponder((request) => {
    if (request.action === "notesInfo") {
      const params = request.params as { notes: number[] };
      return {
        result: known.filter((note) => params.notes.includes(note.noteId)),
        error: null,
      };
    }
    if (request.action === "cardsInfo") {
      const params = request.params as { cards: number[] };
      return {
        result: params.cards.map((cardId) => ({ cardId, deckName: "" })),
        error: null,
      };
    }
    return { result: null, error: null };
  });
}

function renderExecution(
  options: {
    files?: Record<string, string>;
    forcedNoteIds?: Record<number, boolean>;
    noteLifecycle?: Record<number, NoteLifecycleRecord>;
    previewStatuses?: Record<number, NoteLifecycleStatus>;
    vaultNoteIndex?: Map<number, string>;
  } = {},
) {
  const app = App.createConfigured__({ files: options.files ?? {} });
  const onFinish = jest.fn();
  render(
    <ImportExecution
      anki={new Anki()}
      deckName="Languages"
      fieldMappings={{ Basic: { Front: "Front", Back: "Back" } }}
      forcedNoteIds={options.forcedNoteIds ?? {}}
      noteLifecycle={options.noteLifecycle ?? {}}
      notes={deckNotes}
      notesSelectedToImport={{ 101: true, 102: false }}
      onFinish={onFinish}
      previewStatuses={options.previewStatuses}
      vault={app.vault as unknown as ObsidianVault}
      vaultNoteIndex={options.vaultNoteIndex}
    />,
  );
  return { app, onFinish };
}

describe("ImportExecution", () => {
  test("given notes to import when opened then runs the import and reports counts without any buttons", async () => {
    // given
    respondWithDeckNotes();
    const { onFinish } = renderExecution();

    // when
    const report = await screen.findByText(/Created: 1/);

    // then
    expect(report).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const finished: ImportExecutionReport = onFinish.mock.calls[0][0];
    expect(finished).toMatchObject({
      created: 1,
      skipped: 1,
      cancelled: false,
      syncedNotes: { 101: 100 },
    });
  });

  test("given a forced note when executed then reports how many notes were overwritten deliberately", async () => {
    // given
    respondWithDeckNotes();
    const files = {
      "Languages/What-is-2-2-101.md":
        '```note-form\n{\n"front": "Mine",\n"back": "4",\n"tags": "",\n"id": 101\n}\n```\n',
    };
    const noteLifecycle: Record<number, NoteLifecycleRecord> = {
      101: syncedCleanRecord(100, "stale", 0),
    };
    renderExecution({
      files,
      forcedNoteIds: { 101: true },
      noteLifecycle,
      vaultNoteIndex: new Map([[101, "Languages/What-is-2-2-101.md"]]),
    });

    // when
    const report = await screen.findByText(/forced: 1/);

    // then
    expect(report).toBeInTheDocument();
  });

  test("given a failing write when opened then shows the error and notifies nothing", async () => {
    // given
    respondWithDeckNotes();
    const { app, onFinish } = renderExecution();
    const failure = new Error("ENOENT: no such file or directory");
    jest.spyOn(app.vault, "create").mockRejectedValueOnce(failure);

    // when
    const message = await screen.findByText(/Import failed: ENOENT/);

    // then
    expect(message).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  test("given a note the preview listed when the fresh read no longer has it then the report says how many are gone", async () => {
    // given
    respondWithDeckNotes([basicNote(102, 200)]);
    const { onFinish } = renderExecution();

    // when
    const report = await screen.findByText(/1 no longer in the deck/);

    // then
    expect(report).toBeInTheDocument();
    const finished: ImportExecutionReport = onFinish.mock.calls[0][0];
    expect(finished).toMatchObject({ created: 0, vanishedFromDeck: 1 });
  });

  test("given a note the preview called new in Anki when the fresh read finds an edited vault file then the report says how many changed since the preview", async () => {
    // given
    respondWithDeckNotes([basicNote(101, 500)]);
    const files = {
      "Languages/What-is-2-2-101.md":
        '```note-form\n{"front": "Mine", "back": "4", "id": 101}\n```\n',
    };
    renderExecution({
      files,
      noteLifecycle: { 101: syncedCleanRecord(100, "hash-of-the-old-text") },
      previewStatuses: { 101: "synced.ankiNewer" },
      vaultNoteIndex: new Map([[101, "Languages/What-is-2-2-101.md"]]),
    });

    // when
    const report = await screen.findByText(/1 changed since the preview/);

    // then
    expect(report).toBeInTheDocument();
  });
});

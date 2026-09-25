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
import type { NoteLifecycleRecord } from "src/services/note-lifecycle";
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

function renderExecution(
  options: {
    files?: Record<string, string>;
    forcedNoteIds?: Record<number, boolean>;
    noteLifecycle?: Record<number, NoteLifecycleRecord>;
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
      notes={[basicNote(101, 100), basicNote(102, 200)]}
      notesSelectedToImport={{ 101: true, 102: false }}
      onFinish={onFinish}
      vault={app.vault as unknown as ObsidianVault}
      vaultNoteIndex={options.vaultNoteIndex}
    />,
  );
  return { app, onFinish };
}

describe("ImportExecution", () => {
  test("given notes to import when opened then runs the import and reports counts without any buttons", async () => {
    // given
    AnkiConnectMock.setResponder(() => ({ result: null, error: null }));
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
    AnkiConnectMock.setResponder(() => ({ result: null, error: null }));
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
    AnkiConnectMock.setResponder(() => ({ result: null, error: null }));
    const { app, onFinish } = renderExecution();
    const failure = new Error("ENOENT: no such file or directory");
    jest.spyOn(app.vault, "create").mockRejectedValueOnce(failure);

    // when
    const message = await screen.findByText(/Import failed: ENOENT/);

    // then
    expect(message).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

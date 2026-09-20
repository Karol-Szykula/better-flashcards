/**
 * @jest-environment jsdom
 *
 * User-perspective tests for the import execution page: folder choice,
 * run with progress and final report.
 */
import "obsidian-test-mocks/jest-setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { Anki } from "src/services/anki";
import { ImportExecution } from "src/gui/import-wizard/components/ImportExecution";
import type { ImportExecutionReport } from "src/services/import";
import { createSettings } from "../helpers/settings";
import { AnkiConnectMock } from "../mocks/anki-connect";

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

function renderExecution() {
  const app = App.createConfigured__({ files: {} });
  const onFinish = jest.fn();
  const settings = createSettings();
  render(
    <ImportExecution
      anki={new Anki()}
      cardsSelectedToImport={{ 101: true, 102: false }}
      deckName="Languages"
      fieldMappings={{ Basic: { Front: "Front", Back: "Back" } }}
      flashcardsTag={settings.flashcardsTag}
      notes={[basicNote(101, 100), basicNote(102, 200)]}
      onFinish={onFinish}
      vault={app.vault as unknown as ObsidianVault}
    />
  );
  return { app, onFinish };
}

describe("ImportExecution", () => {
  test("given notes to import when opened then offers folder choice and import", async () => {
    // given
    renderExecution();

    // when
    const folderSelect = await screen.findByRole("combobox");
    const importButton = await screen.findByRole("button", {
      name: "Import",
    });

    // then
    expect(folderSelect).toBeInTheDocument();
    expect(importButton).toBeInTheDocument();
  });

  test("given vault folders when opened then lists them without the root duplicate", async () => {
    // given
    const app = App.createConfigured__({ files: { "Sub/Note.md": "x\n" } });
    const onFinish = jest.fn();
    render(
      <ImportExecution
        anki={new Anki()}
        cardsSelectedToImport={{}}
        deckName="Languages"
        fieldMappings={{}}
        flashcardsTag="card"
        notes={[]}
        onFinish={onFinish}
        vault={app.vault as unknown as ObsidianVault}
      />
    );

    // when
    const options = await screen.findAllByRole("option");

    // then
    expect(options.map((option) => option.textContent)).toEqual([
      "/",
      "Sub",
    ]);
  });

  test("given a run when finished then reports counts and notifies", async () => {
    // given
    AnkiConnectMock.setResponder(() => ({ result: null, error: null }));
    const { onFinish } = renderExecution();
    const user = userEvent.setup();

    // when
    await user.click(await screen.findByRole("button", { name: "Import" }));
    const report = await screen.findByText(/Created: 1/);

    // then
    expect(report).toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const finished: ImportExecutionReport = onFinish.mock.calls[0][0];
    expect(finished).toMatchObject({
      created: 1,
      skipped: 1,
      cancelled: false,
      syncedNotes: { 101: 100 },
    });
  });

  test("given a failing write when run then shows the error and returns to idle", async () => {
    // given
    AnkiConnectMock.setResponder(() => ({ result: null, error: null }));
    const { app, onFinish } = renderExecution();
    const failure = new Error("ENOENT: no such file or directory");
    jest.spyOn(app.vault, "create").mockRejectedValueOnce(failure);
    const user = userEvent.setup();

    // when
    await user.click(await screen.findByRole("button", { name: "Import" }));
    const message = await screen.findByText(/Import failed: ENOENT/);

    // then
    expect(message).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Import" })
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { TFile as ObsidianTFile, Vault as ObsidianVault } from "obsidian";
import {
  forgetRecordsWithoutFiles,
  formatPurgeLedgerReport,
  type PurgeLedgerReport,
} from "src/services/ledger";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import type { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { jsonEngine } from "../helpers/json-engine";

function formBlock(front: string, id: number): string {
  return [
    "```note-form",
    "{",
    `"front": "${front}",`,
    '"back": "A",',
    `"tags": "",`,
    `"id": ${id}`,
    "}",
    "```",
  ].join("\n");
}

function brokenBlock(id: number): string {
  return [
    "```note-form",
    "{",
    '"front": "Broken",',
    '"back": "A"',
    `"tags": "",`,
    `"id": ${id}`,
    "}",
    "```",
  ].join("\n");
}

async function purgeWith(
  files: Record<string, string>,
  noteIds: number[],
): Promise<{ report: PurgeLedgerReport; settings: ISettings }> {
  const app = App.createConfigured__({ files });
  const noteLifecycle: ISettings["noteLifecycle"] = {};
  for (const noteId of noteIds) {
    noteLifecycle[noteId] = syncedCleanRecord(100, "hash", 0);
  }
  const settings = createSettings({ noteLifecycle });
  const report = await forgetRecordsWithoutFiles(
    app.vault as unknown as ObsidianVault,
    settings,
    jsonEngine,
  );
  return { report, settings };
}

async function readAllFiles(
  vault: ObsidianVault,
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const file of vault.getMarkdownFiles()) {
    contents[file.path] = await vault.read(file as unknown as ObsidianTFile);
  }
  return contents;
}

describe("forgetRecordsWithoutFiles", () => {
  test("given a record whose file is gone when the ledger is purged then it is forgotten", async () => {
    // given
    const files: Record<string, string> = {};

    // when
    const { report, settings } = await purgeWith(files, [201]);

    // then
    expect(report).toMatchObject({ forgotten: 1, kept: 0 });
    expect(settings.noteLifecycle).toEqual({});
  });

  test("given a record whose block is gone from a living file when the ledger is purged then it is forgotten", async () => {
    // given
    const files = { "Languages/Other-203.md": `${formBlock("Kept", 203)}\n` };

    // when
    const { report, settings } = await purgeWith(files, [202, 203]);

    // then
    expect(report).toMatchObject({ forgotten: 1, kept: 1 });
    expect(Object.keys(settings.noteLifecycle)).toEqual(["203"]);
  });

  test("given a record whose note exists when the ledger is purged then it is kept", async () => {
    // given
    const files = { "Languages/Kept-301.md": `${formBlock("Kept", 301)}\n` };

    // when
    const { report, settings } = await purgeWith(files, [301]);

    // then
    expect(report).toMatchObject({ forgotten: 0, kept: 1 });
    expect(Object.keys(settings.noteLifecycle)).toEqual(["301"]);
  });

  test("given a record whose block cannot be read when the ledger is purged then it is kept and counted as unreadable", async () => {
    // given
    const files = { "Languages/Broken-601.md": `${brokenBlock(601)}\n` };

    // when
    const { report, settings } = await purgeWith(files, [601]);

    // then
    expect(report).toMatchObject({ forgotten: 0, unreadable: 1 });
    expect(Object.keys(settings.noteLifecycle)).toEqual(["601"]);
  });

  test("given records and files when the ledger is purged then no file is created, deleted or modified", async () => {
    // given
    const app = App.createConfigured__({
      files: {
        "Languages/Kept-301.md": `${formBlock("Kept", 301)}\n`,
        "Languages/Plain.md": "plain notes without a block\n",
      },
    });
    const settings = createSettings({
      noteLifecycle: {
        201: syncedCleanRecord(100, "hash", 0),
        301: syncedCleanRecord(100, "hash", 0),
      },
    });
    const vault = app.vault as unknown as ObsidianVault;
    const before = await readAllFiles(vault);

    // when
    await forgetRecordsWithoutFiles(vault, settings, jsonEngine);

    // then
    expect(await readAllFiles(vault)).toEqual(before);
  });

  test("given a record inside an ignored directory when the ledger is purged then it is kept and counted as out of scope", async () => {
    // given
    const app = App.createConfigured__({
      files: { "Archive/Kept-501.md": `${formBlock("Kept", 501)}\n` },
    });
    const settings = createSettings({
      ignoredDirectories: "Archive",
      noteLifecycle: { 501: syncedCleanRecord(100, "hash", 0) },
    });

    // when
    const report = await forgetRecordsWithoutFiles(
      app.vault as unknown as ObsidianVault,
      settings,
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ forgotten: 0, outOfScope: 1 });
    expect(Object.keys(settings.noteLifecycle)).toEqual(["501"]);
  });
});

describe("formatPurgeLedgerReport", () => {
  test("given forgotten records when formatted then says how many and what the wizard can import again", () => {
    // given
    const report = {
      forgotten: 12,
      kept: 28,
      outOfScope: 3,
      unreadable: 1,
    };

    // when
    const text = formatPurgeLedgerReport(report);

    // then
    expect(text).toBe(
      "Ledger: forgot 12 records (the import wizard will offer the ones Anki still has as new), kept 28, 3 in ignored folders, 1 unreadable.",
    );
  });
});

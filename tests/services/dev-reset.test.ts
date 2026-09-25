/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { defaultSettings } from "src/conf/defaults";
import type { DeckImportSnapshot } from "src/conf/settings";
import { loadPack, notePackVersion, savePack } from "src/services/note-packs";
import type { NotePack } from "src/services/note-packs";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import { formatResetReport, resetPluginData } from "src/services/dev-reset";
import { createSettings } from "../helpers/settings";

function mockVault(files: Record<string, string> = {}): ObsidianVault {
  const app = App.createConfigured__({ files });
  return app.vault as unknown as ObsidianVault;
}

function languagesSnapshot(): DeckImportSnapshot {
  return {
    deckName: "Languages",
    fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
    importedAt: 1,
  };
}

function customPack(): NotePack {
  return {
    packVersion: notePackVersion,
    modelName: "My Model",
    mapping: { Question: "Front" },
    formTemplate: {
      layout: "basic",
      model: "My Model",
      primaryKey: "front",
      primaryLabel: "Front",
      secondaryKey: "back",
      secondaryLabel: "Back",
    },
  };
}

describe("resetPluginData", () => {
  test("given settings with records, snapshots and field mappings when reset then every setting is back to its default", async () => {
    // given
    const settings = createSettings({
      ankiConnectPermission: true,
      deckImportSnapshots: { Languages: languagesSnapshot() },
      fieldMappings: { Basic: { Front: "Front" } },
      ignoredDirectories: "Archive",
      lastSyncRev: 7,
      noteLifecycle: { 101: syncedCleanRecord(1, "hash-101") },
    });

    // when
    await resetPluginData(mockVault(), settings);

    // then
    expect(settings).toEqual(defaultSettings());
  });

  test("given a saved custom note pack when reset then the pack is gone", async () => {
    // given
    const vault = mockVault();
    const pack = customPack();
    await savePack(vault, pack);

    // when
    await resetPluginData(vault, createSettings());

    // then
    const loaded = await loadPack(vault, "My Model");
    expect(loaded).toBeUndefined();
  });

  test("given markdown notes in the vault when reset then no note file is touched", async () => {
    // given
    const noteContent = "# Anatomy\n\n```note-form\nfront: Heart\n```\n";
    const vault = mockVault({ "Notes/Anatomy.md": noteContent });

    // when
    await resetPluginData(
      vault,
      createSettings({
        noteLifecycle: { 101: syncedCleanRecord(1, "hash-101") },
      }),
    );

    // then
    const files = vault.getMarkdownFiles().map((file) => file.path);
    expect(files).toEqual(["Notes/Anatomy.md"]);
    const content = await vault.read(vault.getMarkdownFiles()[0] as never);
    expect(content).toBe(noteContent);
  });

  test("given a vault with no saved packs when reset then the report counts zero packs", async () => {
    // when
    const report = await resetPluginData(mockVault(), createSettings());

    // then
    expect(report).toEqual({
      deckImportSnapshots: 0,
      fieldMappings: 0,
      noteLifecycle: 0,
      packs: 0,
    });
  });

  test("given loaded plugin data when reset then the report counts what it cleared", async () => {
    // given
    const vault = mockVault();
    await savePack(vault, customPack());
    const settings = createSettings({
      deckImportSnapshots: { Languages: languagesSnapshot() },
      fieldMappings: { Basic: { Front: "Front" } },
      noteLifecycle: {
        101: syncedCleanRecord(1, "hash-101"),
        102: syncedCleanRecord(2, "hash-102"),
      },
    });

    // when
    const report = await resetPluginData(vault, settings);

    // then
    expect(report).toEqual({
      deckImportSnapshots: 1,
      fieldMappings: 1,
      noteLifecycle: 2,
      packs: 1,
    });
  });
});

describe("formatResetReport", () => {
  test("given a reset report when formatted then every cleared thing is named", () => {
    // given
    const report = {
      deckImportSnapshots: 3,
      fieldMappings: 4,
      noteLifecycle: 12,
      packs: 5,
    };

    // when
    const message = formatResetReport(report);

    // then
    expect(message).toContain("12 note records");
    expect(message).toContain("3 deck snapshots");
    expect(message).toContain("4 field mappings");
    expect(message).toContain("5 note packs");
  });

  test("given a reset report when formatted then it says Anki and the notes are untouched", () => {
    // given
    const report = {
      deckImportSnapshots: 0,
      fieldMappings: 0,
      noteLifecycle: 0,
      packs: 0,
    };

    // when
    const message = formatResetReport(report);

    // then
    expect(message).toContain("Anki");
    expect(message).toContain("untouched");
  });
});

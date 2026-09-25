/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import {
  builtInPackFor,
  loadPack,
  notePackVersion,
  packForModel,
  savePack,
  type NotePack,
} from "src/services/note-packs";

function mockVault(): ObsidianVault {
  const app = App.createConfigured__({ files: {} });
  return app.vault as unknown as ObsidianVault;
}

describe("builtInPackFor", () => {
  test("given each text built-in when resolved then returns a pack with auto mapping", async () => {
    // given
    const models = [
      "Basic",
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ];

    // when
    const packs = models.map((model) => builtInPackFor(model));

    // then
    expect(packs).toHaveLength(5);
    for (const pack of packs) {
      expect(pack?.packVersion).toBe(notePackVersion);
    }
    expect(builtInPackFor("Cloze")?.mapping).toEqual({
      Text: "Text",
      "Back Extra": "Extra",
    });
    expect(builtInPackFor("Cloze")?.formTemplate.layout).toBe("cloze");
  });

  test("given the optional reversed model when resolved then skips add reverse", async () => {
    // when
    const pack = builtInPackFor("Basic (optional reversed card)");

    // then
    expect(pack?.mapping).toEqual({
      Front: "Front",
      Back: "Back",
      "Add Reverse": "Skip",
    });
  });

  test("given an unknown model when resolved then returns nothing", async () => {
    // when
    const pack = builtInPackFor("Custom Model");

    // then
    expect(pack).toBeUndefined();
  });
});

describe("savePack and loadPack", () => {
  test("given a custom pack when saved and loaded then round-trips", async () => {
    // given
    const vault = mockVault();
    const pack: NotePack = {
      packVersion: notePackVersion,
      modelName: "My Model",
      mapping: { Question: "Front", Answer: "Back", Hint: "Skip" },
      formTemplate: {
        layout: "basic",
        model: "My Model",
        primaryKey: "front",
        primaryLabel: "Front",
        secondaryKey: "back",
        secondaryLabel: "Back",
      },
    };

    // when
    await savePack(vault, pack);
    const loaded = await loadPack(vault, "My Model");

    // then
    expect(loaded).toEqual(pack);
  });

  test("given a vault blind to dot paths when saved then still writes through the adapter", async () => {
    // given
    const app = App.createConfigured__({ files: {} });
    const vault = app.vault as unknown as ObsidianVault;
    vault.create = jest.fn(async () => {
      throw new Error("vault API cannot see .obsidian paths");
    });
    vault.getAbstractFileByPath = jest.fn(() => null);
    const pack: NotePack = {
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

    // when
    await savePack(vault, pack);

    // then
    expect(vault.create).not.toHaveBeenCalled();
    const loaded = await loadPack(vault, "My Model");
    expect(loaded).toEqual(pack);
  });

  test("given no pack file when loaded then returns nothing", async () => {
    // when
    const loaded = await loadPack(mockVault(), "Missing Model");

    // then
    expect(loaded).toBeUndefined();
  });

  test("given a corrupt pack file when loaded then returns nothing", async () => {
    // given
    const app = App.createConfigured__({
      files: {
        ".obsidian/plugins/better-flashcards/packs/My-Model.json":
          "not json{{{",
      },
    });
    const vault = app.vault as unknown as ObsidianVault;

    // when
    const loaded = await loadPack(vault, "My Model");

    // then
    expect(loaded).toBeUndefined();
  });
});

describe("packForModel", () => {
  test("given a built-in model when resolved then returns it without touching the vault", async () => {
    // when
    const pack = await packForModel(mockVault(), "Basic");

    // then
    expect(pack?.modelName).toBe("Basic");
  });

  test("given a saved custom model when resolved then loads it from the vault", async () => {
    // given
    const vault = mockVault();
    await savePack(vault, {
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
    });

    // when
    const pack = await packForModel(vault, "My Model");

    // then
    expect(pack?.mapping).toEqual({ Question: "Front" });
  });
});

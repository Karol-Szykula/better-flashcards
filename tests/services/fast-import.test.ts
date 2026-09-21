/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import type { AnkiNoteInfo } from "src/entities/card";
import { Anki } from "src/services/anki";
import { computeContentHash } from "src/services/yaml-flashcard";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";
import {
  executeFastImport,
  formatFastImportReport,
  type FastImportReport,
} from "src/services/fast-import";
import type { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { AnkiConnectMock } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function basicAnkiNote(
  noteId: number,
  mod: number,
  front = "Q",
  back = "A"
): AnkiNoteInfo {
  return {
    cards: [7],
    fields: {
      Back: { value: `<p>${back}</p>` },
      Front: { value: `<p>${front}</p>` },
    },
    mod,
    modelName: "Basic",
    noteId,
    tags: [],
  };
}

function formBlock(front: string, back: string, id: number | null): string {
  const lines = [
    "```flashcard-form",
    "{",
    `"front": "${front}",`,
    `"back": "${back}",`,
    `"tags": "math"${id === null ? "" : ","}`,
  ];
  if (id !== null) {
    lines.push(`"id": ${id}`);
  }
  lines.push("}", "```");
  return lines.join("\n");
}

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

function respondWithDecks(decks: Record<string, AnkiNoteInfo[]>): void {
  AnkiConnectMock.setResponder((request) => {
    if (request.action === "findNotes") {
      const params = request.params as Record<string, unknown>;
      const query = params["query"] as string;
      const deckName = Object.keys(decks).find((name) =>
        query.includes(`"${name}"`)
      );
      const notes = deckName ? decks[deckName] : [];
      return { result: notes.map((note) => note.noteId), error: null };
    }
    if (request.action === "notesInfo") {
      const params = request.params as Record<string, unknown>;
      const ids = params["notes"] as number[];
      const all = Object.values(decks).flat();
      return {
        result: all.filter((note) => ids.includes(note.noteId)),
        error: null,
      };
    }
    return { result: null, error: null };
  });
}

function snapshotSettings(
  deckName: string,
  synced: Record<number, { back: string; front: string; mod: number }>
): Promise<ISettings> {
  const syncedNoteMods: Record<number, number> = {};
  const syncedNoteHashes: Record<number, string> = {};
  for (const [id, record] of Object.entries(synced)) {
    const noteId = Number(id);
    syncedNoteMods[noteId] = record.mod;
    syncedNoteHashes[noteId] = "pending";
  }
  const settings = createSettings({
    deckImportSnapshots: {
      [deckName]: {
        deckName,
        fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
        flashcardsTag: "card",
        importedAt: 0,
      },
    },
    syncedNoteHashes,
    syncedNoteMods,
  });
  const hashed = Object.entries(synced).map(async ([id, record]) => {
    syncedNoteHashes[Number(id)] = await computeContentHash(
      record.front,
      record.back,
      "math"
    );
  });
  return Promise.all(hashed).then(() => settings);
}

function vaultWith(files: Record<string, string>): ObsidianVault {
  const app = App.createConfigured__({ files });
  return app.vault as unknown as ObsidianVault;
}

async function readPath(vault: ObsidianVault, path: string): Promise<string> {
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    throw new Error(`${path} not found in mock vault`);
  }
  return vault.read(file);
}

describe("executeFastImport", () => {
  test("given no snapshots when executed then asks for the wizard first", async () => {
    // given
    const vault = vaultWith({});
    const settings = createSettings();
    respondWithDecks({});

    // when
    const run = executeFastImport(new Anki(), vault, settings, jsonEngine);

    // then
    await expect(run).rejects.toThrow("wizard");
  });

  test("given unchanged notes when executed then counts them up to date", async () => {
    // given
    const content = formBlock("Q", "A", 101);
    const vault = vaultWith({ "Languages/Q-101.md": `${content}\n` });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.decks).toHaveLength(1);
    expect(report.decks[0]).toMatchObject({
      deckName: "Languages",
      missing: 0,
      overwrittenDiverged: 0,
      refreshed: 0,
      upToDate: 1,
    });
    const reread = await readPath(vault, "Languages/Q-101.md");
    expect(reread).toBe(`${content}\n`);
  });

  test("given an anki-side change when executed then refreshes the file", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 200, "Q2")] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.decks[0]).toMatchObject({ refreshed: 1, upToDate: 0 });
    const reread = await readPath(vault, "Languages/Q2-101.md");
    expect(reread).toContain('"front":"Q2"');
    expect(settings.syncedNoteMods[101]).toBe(200);
  });

  test("given an obsidian-side change when executed then overwrites and counts diverged", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.decks[0]).toMatchObject({
      overwrittenDiverged: 1,
      refreshed: 0,
    });
    const reread = await readPath(vault, "Languages/Q-101.md");
    expect(reread).toContain('"front":"Q"');
  });

  test("given a missing file when executed then skips without recreating", async () => {
    // given
    const vault = vaultWith({});
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.decks[0]).toMatchObject({ missing: 1, refreshed: 0 });
    expect(vault.getMarkdownFiles()).toHaveLength(0);
  });

  test("given a note deleted in anki when executed then deletes its file and purges records", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
      "Languages/Q-102.md": `${formBlock("Q", "A", 102)}\n`,
    });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
      102: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(102, 100)] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.deleted).toBe(1);
    expect(report.purgedRecords).toBe(1);
    expect(vault.getAbstractFileByPath("Languages/Q-101.md")).toBeNull();
    expect(settings.syncedNoteMods[101]).toBeUndefined();
    expect(settings.syncedNoteHashes[101]).toBeUndefined();
    expect(settings.syncedNoteMods[102]).toBe(100);
  });

  test("given a deleted note sharing a file when executed then strips only its block", async () => {
    // given
    const shared = [
      "# Notes",
      formBlock("Q", "A", 101),
      formBlock("Q", "A", 102),
      "After",
    ].join("\n");
    const vault = vaultWith({ "Shared.md": `${shared}\n` });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
      102: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(102, 100)] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.deleted).toBe(1);
    const reread = await readPath(vault, "Shared.md");
    expect(reread).toContain("# Notes");
    expect(reread).toContain("After");
    expect(reread).not.toContain('"id": 101');
    expect(reread).toContain('"id": 102');
  });

  test("given a never-imported note when executed then ignores it", async () => {
    // given
    const vault = vaultWith({});
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({
      Languages: [basicAnkiNote(101, 100), basicAnkiNote(103, 100)],
    });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.decks[0]).toMatchObject({
      missing: 1,
      refreshed: 0,
      upToDate: 0,
    });
    expect(vault.getMarkdownFiles()).toHaveLength(0);
  });

  test("given a note moved between decks when executed then refreshes instead of deleting", async () => {
    // given
    const vault = vaultWith({
      "Cards/Old-101.md": `${formBlock("Old", "A", 101)}\n`,
    });
    const base = await snapshotSettings("Alpha", {
      101: { back: "A", front: "Old", mod: 100 },
    });
    const settings = createSettings({
      ...base,
      deckImportSnapshots: {
        ...base.deckImportSnapshots,
        Beta: {
          deckName: "Beta",
          fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
          flashcardsTag: "card",
          importedAt: 0,
        },
      },
    });
    respondWithDecks({ Alpha: [], Beta: [basicAnkiNote(101, 200, "New")] });

    // when
    const report: FastImportReport = await executeFastImport(
      new Anki(),
      vault,
      settings,
      jsonEngine
    );

    // then
    expect(report.deleted).toBe(0);
    const beta = report.decks.find((deck) => deck.deckName === "Beta");
    expect(beta).toMatchObject({ refreshed: 1 });
    const reread = await readPath(vault, "Cards/New-101.md");
    expect(reread).toContain('"front":"New"');
  });

  test("given a run when executed then refreshes the snapshot timestamp", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    await executeFastImport(new Anki(), vault, settings, jsonEngine);

    // then
    expect(settings.deckImportSnapshots["Languages"].importedAt).toBeGreaterThan(
      0
    );
  });
});

describe("formatFastImportReport", () => {
  test("given a report when formatted then summarizes totals and decks", async () => {
    // given
    const report: FastImportReport = {
      decks: [
        {
          deckName: "Languages",
          missing: 1,
          overwrittenDiverged: 2,
          refreshed: 3,
          upToDate: 4,
        },
      ],
      deleted: 5,
      purgedRecords: 6,
    };

    // when
    const text = formatFastImportReport(report);

    // then
    expect(text).toContain(
      "Fast import: 3 refreshed, 2 overwritten, 4 up to date, 1 missing, 5 deleted"
    );
    expect(text).toContain("Languages");
  });
});

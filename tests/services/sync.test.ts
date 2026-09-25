/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import type { AnkiNoteInfo } from "src/entities/anki-note";
import { Anki } from "src/services/anki";
import { computeContentHash } from "src/services/yaml-note";
import {
  executeSync,
  fillMissingBlockIds,
  formatSyncReport,
  type SyncReport,
} from "src/services/sync";
import type { ISettings } from "src/conf/settings";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import { createSettings } from "../helpers/settings";
import { AnkiConnectMock } from "../mocks/anki-connect";
import { required } from "../helpers/required";
import { jsonEngine } from "../helpers/json-engine";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

function basicAnkiNote(
  noteId: number,
  mod: number,
  front = "Q",
  back = "A",
  tags: string[] = [],
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
    tags,
  };
}

function formBlock(front: string, back: string, id: number | null): string {
  const lines = [
    "```note-form",
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

interface RecordedRequest {
  action: string;
  params: Record<string, unknown>;
}

let recordedRequests: RecordedRequest[];

function respondWithDecks(decks: Record<string, AnkiNoteInfo[]>): void {
  const deckOfCard = (cardId: number): string | undefined =>
    Object.entries(decks).find(([, notes]) =>
      notes.some((note) => note.cards?.includes(cardId)),
    )?.[0];
  recordedRequests = [];
  AnkiConnectMock.setResponder((request) => {
    recordedRequests.push({
      action: request.action,
      params: request.params as Record<string, unknown>,
    });
    if (request.action === "findNotes") {
      const params = request.params as Record<string, unknown>;
      const query = params["query"] as string;
      const deckName = Object.keys(decks).find((name) =>
        query.includes(`"${name}"`),
      );
      const notes =
        (deckName === undefined ? undefined : decks[deckName]) ?? [];
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
    if (request.action === "cardsInfo") {
      const params = request.params as Record<string, unknown>;
      const ids = params["cards"] as number[];
      return {
        result: ids.map((cardId) => ({
          cardId,
          deckName: deckOfCard(cardId) ?? "",
        })),
        error: null,
      };
    }
    return { result: null, error: null };
  });
}

function snapshotSettings(
  deckName: string,
  synced: Record<number, { back: string; front: string; mod: number }>,
): Promise<ISettings> {
  const noteLifecycle: ISettings["noteLifecycle"] = {};
  for (const [id, record] of Object.entries(synced)) {
    const noteId = Number(id);
    noteLifecycle[noteId] = syncedCleanRecord(record.mod, "pending", 0);
  }
  const settings = createSettings({
    deckImportSnapshots: {
      [deckName]: {
        deckName,
        fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
        importedAt: 0,
      },
    },
    noteLifecycle,
  });
  const hashed = Object.entries(synced).map(async ([id, record]) => {
    required(noteLifecycle[Number(id)], "record").lastHash =
      await computeContentHash(record.front, record.back, "math", "Basic");
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

describe("executeSync", () => {
  test("given no snapshots when executed then asks for the wizard first", async () => {
    // given
    const vault = vaultWith({});
    const settings = createSettings();
    respondWithDecks({});

    // when
    const run = executeSync(new Anki(), vault, settings, jsonEngine);

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
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks).toHaveLength(1);
    expect(report.decks[0]).toMatchObject({
      deckName: "Languages",
      missing: 0,
      pushed: 0,
      refreshed: 0,
      upToDate: 1,
    });
    const reread = await readPath(vault, "Languages/Q-101.md");
    expect(reread).toBe(`${content}\n`);
  });

  test("given an unchanged note without a pack when executed then skips it as unmapped", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = createSettings({
      deckImportSnapshots: {
        Languages: {
          deckName: "Languages",
          fieldMappings: { "My Model": { Question: "Front", Answer: "Back" } },
          importedAt: 0,
        },
      },
    });
    settings.noteLifecycle[101] = syncedCleanRecord(
      100,
      await computeContentHash("Q", "A", "math", "My Model"),
      0,
    );
    respondWithDecks({
      Languages: [
        {
          ...basicAnkiNote(101, 100),
          modelName: "My Model",
          fields: {
            Question: { value: "<p>Q</p>" },
            Answer: { value: "<p>A</p>" },
          },
        },
      ],
    });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks[0]).toMatchObject({ skippedUnmapped: 1, refreshed: 0 });
  });

  test("given an untracked note with an id-linked block when executed then enrolls it", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = createSettings({
      deckImportSnapshots: {
        Languages: {
          deckName: "Languages",
          fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
          importedAt: 0,
        },
      },
    });
    respondWithDecks({
      Languages: [basicAnkiNote(101, 100, "Q", "A", ["math"])],
    });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.enrolled).toBe(1);
    expect(report.decks[0]).toMatchObject({ upToDate: 1 });
    expect(settings.noteLifecycle[101]?.status).toBe("synced.clean");
    expect(settings.noteLifecycle[101]?.lastMod).toBe(100);
  });

  test("given an untracked note whose block differs from Anki when executed then surfaces the difference", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = createSettings({
      deckImportSnapshots: {
        Languages: {
          deckName: "Languages",
          fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
          importedAt: 0,
        },
      },
    });
    respondWithDecks({
      Languages: [basicAnkiNote(101, 100, "Q", "A", ["math"])],
    });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.enrolled).toBe(1);
    expect(report.decks[0]).toMatchObject({
      pushed: 1,
      upToDate: 0,
    });
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(
      `${formBlock("Mine", "A", 101)}\n`,
    );
  });

  test("given an untracked note without any block when executed then still skips it", async () => {
    // given
    const vault = vaultWith({});
    const settings = createSettings({
      deckImportSnapshots: {
        Languages: {
          deckName: "Languages",
          fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
          importedAt: 0,
        },
      },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.enrolled).toBe(0);
    expect(settings.noteLifecycle[101]).toBeUndefined();
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
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks[0]).toMatchObject({ refreshed: 1, upToDate: 0 });
    const reread = await readPath(vault, "Languages/Q2-101.md");
    expect(reread).toContain('"front":"Q2"');
    expect(settings.noteLifecycle[101]?.lastMod).toBe(200);
    expect(settings.noteLifecycle[101]?.status).toBe("synced.clean");
  });

  test("given an obsidian-side change when executed then pushes it to Anki", async () => {
    // given
    const before = `${formBlock("Mine", "A", 101)}\n`;
    const vault = vaultWith({ "Languages/Q-101.md": before });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks[0]).toMatchObject({ pushed: 1, refreshed: 0 });
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(before);
    const updateRequest = recordedRequests.find(
      (request) => request.action === "multi",
    );
    const actions = updateRequest?.params["actions"] as {
      action: string;
    }[];
    expect(actions.map((action) => action.action)).toContain(
      "updateNoteFields",
    );
  });

  test("given a diverged note edited last in Anki when executed then pulls it", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    const ankiNewer = Math.floor(Date.now() / 1000) + 3600;
    respondWithDecks({ Languages: [basicAnkiNote(101, ankiNewer, "Q2")] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks[0]).toMatchObject({ pushed: 0, refreshed: 1 });
    const reread = await readPath(vault, "Languages/Q2-101.md");
    expect(reread).toContain('"front":"Q2"');
  });

  test("given a diverged note edited last in the vault when executed then pushes it", async () => {
    // given
    const before = `${formBlock("Mine", "A", 101)}\n`;
    const vault = vaultWith({ "Languages/Q-101.md": before });
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 200, "Q2")] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.decks[0]).toMatchObject({ pushed: 1, refreshed: 0 });
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(before);
  });

  test("given a missing file when executed then skips without recreating", async () => {
    // given
    const vault = vaultWith({});
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [basicAnkiNote(101, 100)] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
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
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.deleted).toBe(1);
    expect(report.purgedRecords).toBe(1);
    expect(vault.getAbstractFileByPath("Languages/Q-101.md")).toBeNull();
    expect(settings.noteLifecycle[101]).toBeUndefined();
    expect(settings.noteLifecycle[102]?.lastMod).toBe(100);
  });

  test("given an unreadable block when its note is gone then the record is forgotten and the block is kept", async () => {
    // given
    const brokenBlock = [
      "```note-form",
      "{",
      '"front": "Q",',
      '"back": "A"',
      '"tags": "",',
      '"id": 101',
      "}",
      "```",
    ].join("\n");
    const vault = vaultWith({ "Languages/Q-101.md": `${brokenBlock}\n` });
    const before = await readPath(vault, "Languages/Q-101.md");
    const settings = await snapshotSettings("Languages", {
      101: { back: "A", front: "Q", mod: 100 },
    });
    respondWithDecks({ Languages: [] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.deleted).toBe(0);
    expect(report.purgedRecords).toBe(1);
    expect(settings.noteLifecycle[101]).toBeUndefined();
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(before);
  });

  test("given a record in a deck outside the snapshots when executed then keeps it and its block", async () => {
    // given
    const before = `${formBlock("Q", "A", 101)}\n`;
    const vault = vaultWith({ "Other/Q-101.md": before });
    const settings = createSettings({
      deckImportSnapshots: {
        Grammar: {
          deckName: "Grammar",
          fieldMappings: { Basic: { Back: "Back", Front: "Front" } },
          importedAt: 0,
        },
      },
      noteLifecycle: {
        101: syncedCleanRecord(
          100,
          await computeContentHash("Q", "A", "math", "Basic"),
          0,
        ),
      },
    });
    respondWithDecks({
      Grammar: [basicAnkiNote(202, 100, "Q", "A", ["math"])],
      Other: [basicAnkiNote(101, 100, "Q", "A", ["math"])],
    });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
    );

    // then
    expect(report.deleted).toBe(0);
    expect(report.purgedRecords).toBe(0);
    expect(settings.noteLifecycle[101]).toBeDefined();
    expect(await readPath(vault, "Other/Q-101.md")).toBe(before);
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
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
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
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
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
          importedAt: 0,
        },
      },
    });
    respondWithDecks({ Alpha: [], Beta: [basicAnkiNote(101, 200, "New")] });

    // when
    const report: SyncReport = await executeSync(
      new Anki(),
      vault,
      settings,
      jsonEngine,
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
    await executeSync(new Anki(), vault, settings, jsonEngine);

    // then
    expect(
      required(settings.deckImportSnapshots["Languages"], "snapshot")
        .importedAt,
    ).toBeGreaterThan(0);
  });
});

describe("fillMissingBlockIds", () => {
  test("given an id-less block matching a known hash when filled then writes the id back", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    settings.noteLifecycle[101] = syncedCleanRecord(
      100,
      await computeContentHash("Q", "A", "math", "Basic"),
      0,
    );

    // when
    const filled = await fillMissingBlockIds(vault, settings, jsonEngine);

    // then
    expect(filled).toBe(1);
    const reread = await readPath(vault, "Languages/Q-101.md");
    expect(reread).toContain('"id":101');
  });

  test("given an id-less block without a known hash when filled then leaves it alone", async () => {
    // given
    const before = `${formBlock("Q", "A", null)}\n`;
    const vault = vaultWith({ "Languages/Q-101.md": before });
    const settings = createSettings();

    // when
    const filled = await fillMissingBlockIds(vault, settings, jsonEngine);

    // then
    expect(filled).toBe(0);
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(before);
  });

  test("given two id-less blocks matching one hash when filled then fills only the first", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", null)}\n${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    settings.noteLifecycle[101] = syncedCleanRecord(
      100,
      await computeContentHash("Q", "A", "math", "Basic"),
      0,
    );

    // when
    const filled = await fillMissingBlockIds(vault, settings, jsonEngine);

    // then
    expect(filled).toBe(1);
    const reread = await readPath(vault, "Languages/Q-101.md");
    expect(reread.match(/"id":101/g)).toHaveLength(1);
  });
});

describe("formatSyncReport", () => {
  test("given a report when formatted then summarizes totals and decks", async () => {
    // given
    const report: SyncReport = {
      decks: [
        {
          deckName: "Languages",
          missing: 1,
          pushed: 2,
          refreshed: 3,
          skippedUnmapped: 0,
          upToDate: 4,
        },
      ],
      deleted: 5,
      enrolled: 7,
      purgedRecords: 6,
    };

    // when
    const text = formatSyncReport(report);

    // then
    expect(text).toContain(
      "Sync: 3 refreshed, 2 pushed, 4 up to date, 1 missing, 5 deleted, " +
        "6 records forgotten, 7 enrolled, 0 skipped without pack",
    );
    expect(text).toContain("Languages");
  });
});

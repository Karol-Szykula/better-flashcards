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
import {
  executeExport,
  formatExportReport,
  type ExportReport,
} from "src/services/export";
import { computeContentHash } from "src/services/yaml-note";
import { syncedCleanRecord } from "src/services/note-lifecycle";
import type { ISettings } from "src/conf/settings";
import { ankiResponder } from "../helpers/anki-responder";
import { createSettings } from "../helpers/settings";
import { AnkiConnectMock } from "../mocks/anki-connect";
import { required } from "../helpers/required";
import { jsonEngine } from "../helpers/json-engine";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

const responder = ankiResponder();
const state = responder.state;

function respondWithAnki(
  notes: AnkiNoteInfo[] = [],
  knownModels: Record<string, string[]> = {
    Basic: ["Front", "Back"],
    Cloze: ["Text", "Back Extra"],
  },
): void {
  responder.respondWith({ knownModels, notes });
}

function formBlock(front: string, back: string, id: number | null): string {
  const lines = [
    "```note-form",
    "{",
    `"front": "${front}",`,
    `"back": "${back}",`,
    '"tags": "math"',
  ];
  if (id !== null) {
    lines[lines.length - 1] = '"tags": "math",';
    lines.push(`"id": ${id}`);
  }
  lines.push("}", "```");
  return lines.join("\n");
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

function ankiNote(
  noteId: number,
  mod: number,
  front = "Q",
  back = "A",
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
    tags: ["math"],
  };
}

async function settingsWithRecord(
  noteId: number,
  mod: number,
  front: string,
  back: string,
): Promise<ISettings> {
  const settings = createSettings();
  settings.noteLifecycle[noteId] = syncedCleanRecord(
    mod,
    await computeContentHash(front, back, "math", "Basic"),
    0,
  );
  return settings;
}

describe("executeExport", () => {
  test("given an id-less block when executed then creates the note and writes its id back", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    respondWithAnki();

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "templates",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(1);
    const reread = await readPath(vault, "Languages/Q.md");
    expect(reread).toContain('"id":1500000');
    expect(settings.noteLifecycle[1_500_000]).toMatchObject({
      lastHash: await computeContentHash("Q", "A", "math", "Basic"),
      lastMod: 500,
      status: "synced.clean",
    });
  });

  test("given an id-less block in the vault root when executed then creates it in the default deck", async () => {
    // given
    const vault = vaultWith({ "Q.md": `${formBlock("Q", "A", null)}\n` });
    const settings = createSettings();
    respondWithAnki();

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(1);
    const addRequest = state.requests.find(
      (request) => request.action === "addNotes",
    );
    const payloads = required(
      addRequest?.params["notes"] as { deckName: string }[],
      "addNotes payload",
    );
    expect(required(payloads[0], "payload").deckName).toBe("Default");
  });

  test("given a block in an ignored directory when executed then skips it", async () => {
    // given
    const vault = vaultWith({
      "templates/Q.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    respondWithAnki();

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "templates",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(0);
  });

  test("given a synced-clean block when executed then leaves it alone", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 100)]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(1);
  });

  test("given a diverged block when executed then leaves it to Sync", async () => {
    // given
    const before = `${formBlock("Mine", "A", 101)}\n`;
    const vault = vaultWith({ "Languages/Q-101.md": before });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 200, "Q2")]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.updated).toBe(0);
    expect(report.skippedForSync).toBe(1);
    expect(await readPath(vault, "Languages/Q-101.md")).toBe(before);
  });

  test("given a diverged block edited last in Anki when executed then skips it with a report", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    const ankiNewer = Math.floor(Date.now() / 1000) + 3600;
    respondWithAnki([ankiNote(101, ankiNewer, "Q2")]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.skippedForSync).toBe(1);
    expect(report.updated).toBe(0);
  });

  test("given an anki-newer block when executed then skips it with a report", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 200, "Q2")]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.skippedForSync).toBe(1);
  });

  test("given a vault-newer block when executed then updates Anki and records the sync", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 100)]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.updated).toBe(1);
    const actions = responder.requestActionsFor("updateNoteFields");
    expect(actions.map((action) => action.action)).toContain(
      "updateNoteFields",
    );
    expect(actions.map((action) => action.action)).toContain("changeDeck");
    expect(settings.noteLifecycle[101]?.status).toBe("synced.clean");
    expect(settings.noteLifecycle[101]?.lastHash).toBe(
      await computeContentHash("Mine", "A", "math", "Basic"),
    );
  });

  test("given two vault-newer blocks in different decks when executed then updates each deck separately", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
      "Grammar/Q-202.md": `${formBlock("Yours", "B", 202)}\n`,
    });
    const settings = createSettings();
    settings.noteLifecycle[101] = syncedCleanRecord(
      100,
      await computeContentHash("Q", "A", "math", "Basic"),
      0,
    );
    settings.noteLifecycle[202] = syncedCleanRecord(
      100,
      await computeContentHash("Q", "B", "math", "Basic"),
      0,
    );
    respondWithAnki([ankiNote(101, 100), ankiNote(202, 100, "Q", "B")]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.updated).toBe(2);
    const deckNames = state.requests
      .flatMap((request) =>
        request.action === "multi"
          ? (request.params["actions"] as {
              action: string;
              params: { deck: string };
            }[])
          : [],
      )
      .filter((action) => action.action === "changeDeck")
      .map((action) => action.params.deck);
    expect(deckNames.sort()).toEqual(["Grammar", "Languages"]);
  });

  test("given a block whose Anki note is gone when executed then skips it as deleted", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.skippedDeleted).toBe(1);
  });

  test("given a block with an image when executed then uploads the media and rewrites the reference", async () => {
    // given
    const imageBlock = formBlock("![[pic.png]]", "A", null);
    const vault = vaultWith({ "Languages/Q.md": `${imageBlock}\n` });
    await vault.createBinary(
      "Languages/pic.png",
      new Uint8Array([1, 2, 3]).buffer,
    );
    const settings = createSettings();
    respondWithAnki();

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.mediaFiles).toBe(1);
    const actions = responder.multiActions("storeMediaFile") as {
      action: string;
      params: { filename: string };
    }[];
    expect(required(actions[0], "action").params.filename).toBe("pic.png");
    const addRequest = state.requests.find(
      (request) => request.action === "addNotes",
    );
    const payloads = required(
      addRequest?.params["notes"] as {
        fields: Record<string, string>;
      }[],
      "addNotes payload",
    );
    expect(required(payloads[0], "payload").fields["Front"]).toContain(
      '<img src="pic.png">',
    );
  });

  test("given a custom model without a pack when executed then skips it with a report", async () => {
    // given
    const custom = formBlock("Q", "A", null).replace('"front"', '"Question"');
    const withModel = custom.replace("}", ',"model":"My Model"}');
    const vault = vaultWith({ "Languages/Q.md": `${withModel}\n` });
    const settings = createSettings();
    respondWithAnki();

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.skippedUnmapped).toBe(1);
  });

  test("given an id-linked untracked block when executed then enrolls it", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = createSettings();
    respondWithAnki([ankiNote(101, 100)]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.enrolled).toBe(1);
    expect(settings.noteLifecycle[101]?.status).toBe("synced.clean");
  });
});

describe("round trip without ping-pong", () => {
  test("given a note exported a moment ago when exported again then leaves it clean", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    respondWithAnki();
    const anki = new Anki();
    await executeExport(anki, vault, settings, "", jsonEngine);

    // when
    const second: ExportReport = await executeExport(
      anki,
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(second).toMatchObject({
      created: 0,
      skippedConflicts: 0,
      unchanged: 1,
      updated: 0,
    });
    expect(
      state.requests.filter((request) => request.action === "addNotes"),
    ).toHaveLength(1);
  });

  test("given a vault change pushed to Anki when exported again then leaves it clean", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Mine", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 100)]);
    const anki = new Anki();
    await executeExport(anki, vault, settings, "", jsonEngine);

    // when
    const second: ExportReport = await executeExport(
      anki,
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(second).toMatchObject({
      skippedConflicts: 0,
      unchanged: 1,
      updated: 0,
    });
  });

  test("given a create whose model is missing when exported then only that model is created", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    respondWithAnki([], { Cloze: ["Text", "Back Extra"] });

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(1);
    expect(responder.createdModels()).toEqual(["Basic"]);
  });

  test("given a create whose model has different fields when exported then the note is dropped and counted", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q.md": `${formBlock("Q", "A", null)}\n`,
    });
    const settings = createSettings();
    respondWithAnki([], { Basic: ["Question", "Answer"] });

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report.created).toBe(0);
    expect(report.skippedModelMismatch).toBe(1);
    expect(responder.createdModels()).toEqual([]);
  });

  test("given a note imported from Anki when exported then leaves it clean", async () => {
    // given
    const vault = vaultWith({
      "Languages/Q-101.md": `${formBlock("Q", "A", 101)}\n`,
    });
    const settings = await settingsWithRecord(101, 100, "Q", "A");
    respondWithAnki([ankiNote(101, 100)]);

    // when
    const report: ExportReport = await executeExport(
      new Anki(),
      vault,
      settings,
      "",
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({
      created: 0,
      skippedConflicts: 0,
      unchanged: 1,
    });
  });
});

describe("executeExport with an unreadable block", () => {
  test("given a broken note-form fence when exported then the report counts it as unreadable", async () => {
    // given
    const brokenBlock = [
      "```note-form",
      "{",
      '"front": "Broken",',
      '"back": "A"',
      '"tags": "",',
      "}",
      "```",
    ].join("\n");
    respondWithAnki();
    const vault = vaultWith({
      "Languages/Broken.md": `${brokenBlock}\n`,
      "Languages/Fine.md": `${formBlock("What is 2+2?", "4", null)}\n`,
    });

    // when
    const report = await executeExport(
      new Anki(),
      vault,
      createSettings(),
      "",
      jsonEngine,
    );

    // then
    expect(report.skippedUnreadable).toBe(1);
    expect(report.created).toBe(1);
  });

  test("given a report with an unreadable block when formatted then it names the count", () => {
    // given
    const report: ExportReport = {
      created: 1,
      enrolled: 0,
      mediaFiles: 0,
      skippedConflicts: 0,
      skippedDeleted: 0,
      skippedForSync: 0,
      skippedModelMismatch: 0,
      skippedUnmapped: 0,
      skippedUnreadable: 1,
      unchanged: 0,
      updated: 0,
    };

    // when
    const text = formatExportReport(report);

    // then
    expect(text).toContain("1 skipped unreadable");
  });
});

describe("formatExportReport", () => {
  test("given a report when formatted then summarizes the totals", () => {
    // given
    const report: ExportReport = {
      created: 3,
      enrolled: 1,
      mediaFiles: 2,
      skippedConflicts: 3,
      skippedDeleted: 4,
      skippedForSync: 8,
      skippedModelMismatch: 9,
      skippedUnmapped: 5,
      skippedUnreadable: 4,
      unchanged: 6,
      updated: 7,
    };

    // when
    const text = formatExportReport(report);

    // then
    expect(text).toBe(
      "Export: 3 created, 7 updated, 1 enrolled, 6 unchanged, " +
        "2 media files, 3 skipped as conflicts, " +
        "4 skipped as deleted, 8 left to Sync, " +
        "9 skipped on model mismatch, 5 skipped without pack, " +
        "4 skipped unreadable",
    );
  });
});

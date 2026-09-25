/**
 * @jest-environment jsdom
 *
 * Field values convert HTML through showdown, which needs window.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { TFile as ObsidianTFile, Vault as ObsidianVault } from "obsidian";
import { Anki } from "src/services/anki";
import { setActiveDocument } from "../mocks/obsidian";
import { basicModelName } from "src/conf/constants";
import type { ExecuteImportRequest } from "src/services/import";
import type { FieldMapping } from "src/entities/field-mapping";
import {
  deckFolder,
  discoverDeckModels,
  executeImport,
  fetchDeckNotes,
  isKnownModel,
  normalizeNoteText,
} from "src/services/import";
import { AnkiConnectMock } from "../mocks/anki-connect";
import { required } from "../helpers/required";
import { jsonEngine } from "../helpers/json-engine";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
  setActiveDocument();
});

describe("isKnownModel", () => {
  test("given a plugin model when checked then recognizes it", async () => {
    // when
    const known = isKnownModel(basicModelName);

    // then
    expect(known).toBe(true);
  });

  test("given a plugin model with extensions when checked then recognizes it", async () => {
    // when
    const known = isKnownModel(`${basicModelName} with source`);

    // then
    expect(known).toBe(true);
  });

  test("given a foreign model when checked then rejects it", async () => {
    // when
    const known = isKnownModel("Custom Language Model");

    // then
    expect(known).toBe(false);
  });

  test("given all text built-ins when checked then recognizes each", async () => {
    // given
    const models = [
      "Basic",
      "Basic (and reversed card)",
      "Basic (optional reversed card)",
      "Basic (type in the answer)",
      "Cloze",
    ];

    // when
    const known = models.map((model) => isKnownModel(model));

    // then
    expect(known).toEqual([true, true, true, true, true]);
  });
});

describe("discoverDeckModels", () => {
  const deckName = "Languages";

  function respondWithNotes(notes: unknown[]) {
    AnkiConnectMock.setResponder((request) => {
      switch (request.action) {
        case "findNotes":
          return { result: [1, 2, 3], error: null };
        case "notesInfo":
          return { result: notes, error: null };
        default:
          return { result: null, error: null };
      }
    });
  }

  test("given notes of two models when discovered then groups fields by model", async () => {
    // given
    respondWithNotes([
      {
        noteId: 1,
        modelName: "Basic",
        fields: { Front: { value: "q1" }, Back: { value: "a1" } },
      },
      {
        noteId: 2,
        modelName: "Basic",
        fields: { Front: { value: "q2" }, Back: { value: "a2" } },
      },
      {
        noteId: 3,
        modelName: "Cloze-ish",
        fields: { Text: { value: "t" }, Extra: { value: "e" } },
      },
    ]);

    // when
    const models = await discoverDeckModels(new Anki(), deckName);

    // then
    expect(models).toEqual([
      {
        modelName: "Basic",
        fields: ["Front", "Back"],
        sampleValues: { Front: "q1", Back: "a1" },
      },
      {
        modelName: "Cloze-ish",
        fields: ["Text", "Extra"],
        sampleValues: { Text: "t", Extra: "e" },
      },
    ]);
    const findNotes = AnkiConnectMock.requests.find(
      (r) => r.action === "findNotes",
    );
    expect(findNotes?.params).toMatchObject({
      query: `deck:"${deckName}"`,
    });
  });

  test("given a note without a model when discovered then labels it Unknown", async () => {
    // given
    respondWithNotes([{ noteId: 1, fields: { Front: { value: "q" } } }]);

    // when
    const models = await discoverDeckModels(new Anki(), deckName);

    // then
    expect(models).toEqual([
      { modelName: "Unknown", fields: ["Front"], sampleValues: { Front: "q" } },
    ]);
  });
});

describe("normalizeNoteText", () => {
  test.each([
    ["<p>What is <b>2+2</b>?</p>", "What is **2+2**?"],
    ["<ul><li>a</li><li>b</li></ul>", "- a\n- b"],
    ["a &gt; b", "a > b"],
    ["a   b\nc", "a b c"],
    ["<div><p>x</p></div>", "x"],
    ["<p><code>f(x)</code></p>", "`f(x)`"],
  ])(
    "given same content in both formats when normalized then treats as equal: %p vs %p",
    (anki, obsidian) => {
      // when
      const normalizedAnki = normalizeNoteText(anki);
      const normalizedObsidian = normalizeNoteText(obsidian);

      // then
      expect(normalizedAnki).toBe(normalizedObsidian);
    },
  );

  test.each([
    ["4", "5"],
    ["Hello", "Hello world"],
    ["cat", "Cat"],
    ["<p>a</p>", "<p>a b</p>"],
  ])(
    "given different content when normalized then treats as different: %p vs %p",
    (anki, obsidian) => {
      // when
      const normalizedAnki = normalizeNoteText(anki);
      const normalizedObsidian = normalizeNoteText(obsidian);

      // then
      expect(normalizedAnki).not.toBe(normalizedObsidian);
    },
  );
});

describe("fetchDeckNotes", () => {
  test("given 250 notes when fetched then splits into chunks and reports progress", async () => {
    // given
    const totalNotes = 250;
    const progress: Array<[number, number]> = [];
    AnkiConnectMock.setResponder((request) => {
      switch (request.action) {
        case "findNotes":
          return {
            result: Array.from({ length: totalNotes }, (_, i) => i + 1),
            error: null,
          };
        case "notesInfo": {
          const ids = request.params["notes"] as number[];
          return {
            result: ids.map((id) => ({
              noteId: id,
              fields: {},
              tags: [] as string[],
            })),
            error: null,
          };
        }
        default:
          return { result: null, error: null };
      }
    });

    // when
    const notes = await fetchDeckNotes(
      new Anki(),
      "Languages",
      (fetched, total) => {
        progress.push([fetched, total]);
      },
    );

    // then
    expect(notes).toHaveLength(totalNotes);
    expect(required(notes[0], "note").noteId).toBe(1);
    expect(required(notes[totalNotes - 1], "note").noteId).toBe(totalNotes);
    const infoCalls = AnkiConnectMock.requests.filter(
      (r) => r.action === "notesInfo",
    );
    expect(infoCalls).toHaveLength(3);
    expect(progress).toEqual([
      [100, totalNotes],
      [200, totalNotes],
      [250, totalNotes],
    ]);
  });
});

describe("deckFolder", () => {
  test("given a plain deck without target when resolved then returns the deck folder", async () => {
    // when
    const folder = deckFolder("Languages", "");

    // then
    expect(folder).toBe("Languages");
  });

  test("given a nested deck with target when resolved then nests both", async () => {
    // when
    const folder = deckFolder("Medicine::Anatomy", "Import");

    // then
    expect(folder).toBe("Import/Medicine/Anatomy");
  });
});

function basicMapping(): FieldMapping {
  return { Front: "Front", Back: "Back" };
}

describe("executeImport", () => {
  function basicImportNote(noteId: number, mod: number) {
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

  function executeWith(files: Record<string, string>) {
    const app = App.createConfigured__({ files });
    AnkiConnectMock.setResponder((request) => {
      if (request.action === "retrieveMediaFile") {
        return { result: "ZGF0YQ==", error: null };
      }
      return { result: null, error: null };
    });
    return { app, vault: app.vault as unknown as ObsidianVault };
  }

  test("given selected notes when executed then creates files with ids and reports", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(101, 100), basicImportNote(102, 200)];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true, 102: false },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({
      created: 1,
      overwritten: 0,
      skipped: 1,
      cancelled: false,
      syncedNotes: { 101: 100 },
    });
    expect(report.syncedHashes[101]).toMatch(/^[0-9a-f]{64}$/);
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/What-is-2-2-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("```note-form");
    expect(written).toContain('"id":101');
  });

  test("given a missing deck folder when executed then creates the folder first", async () => {
    // given
    const { app, vault } = executeWith({});
    const createFolder = jest.spyOn(app.vault, "createFolder");
    const notes = [basicImportNote(101, 100)];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(createFolder).toHaveBeenCalledWith("Languages");
  });

  test("given an existing file when executed then overwrites it", async () => {
    // given
    const { vault } = executeWith({
      "Languages/What-is-2-2-101.md":
        "stale content\n```note-form\nfront: stale\nid: 101\n```\n",
    });
    const notes = [basicImportNote(101, 100)];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 0, overwritten: 1 });
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/What-is-2-2-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).not.toContain("stale content");
    expect(written).toContain('"id":101');
  });

  test("given a renamed front when executed then renames the file to match the content", async () => {
    // given
    const { vault } = executeWith({
      "Languages/Old-front-101.md":
        "```note-form\nfront: Old front\nid: 101\n```\n",
    });
    const notes = [
      {
        ...basicImportNote(101, 200),
        fields: {
          Front: { value: "<p>New front</p>" },
          Back: { value: "<p>4</p>" },
        },
      },
    ];
    const vaultNoteIndex = new Map([[101, "Languages/Old-front-101.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 0, overwritten: 1 });
    expect(
      vault.getAbstractFileByPath("Languages/Old-front-101.md"),
    ).toBeNull();
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/New-front-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("New front");
    expect(written).toContain('"id":101');
  });

  test("given a taken new name when executed then renames with a suffix", async () => {
    // given
    const { vault } = executeWith({
      "Languages/Old-front-101.md":
        "```note-form\nfront: Old front\nid: 101\n```\n",
      "Languages/New-front-101.md": "someone else's notes\n",
    });
    const notes = [
      {
        ...basicImportNote(101, 200),
        fields: {
          Front: { value: "<p>New front</p>" },
          Back: { value: "<p>4</p>" },
        },
      },
    ];
    const vaultNoteIndex = new Map([[101, "Languages/Old-front-101.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 0, overwritten: 1 });
    const untouched = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/New-front-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(untouched).toBe("someone else's notes\n");
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/New-front-101-1.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("New front");
  });

  test("given a stale index entry when executed then writes a fresh file instead", async () => {
    // given
    const { vault } = executeWith({
      "Languages/Old-front-101.md": "unrelated notes without an id\n",
    });
    const notes = [
      {
        ...basicImportNote(101, 200),
        fields: {
          Front: { value: "<p>New front</p>" },
          Back: { value: "<p>4</p>" },
        },
      },
    ];
    const vaultNoteIndex = new Map([[101, "Languages/Old-front-101.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 1, overwritten: 0 });
    const untouched = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Old-front-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(untouched).toBe("unrelated notes without an id\n");
    expect(
      vault.getAbstractFileByPath("Languages/New-front-101.md"),
    ).not.toBeNull();
  });

  test("given identical fields when executed then writes separate files per note", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(101, 100), basicImportNote(102, 100)];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true, 102: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(
      vault.getAbstractFileByPath("Languages/What-is-2-2-101.md"),
    ).not.toBeNull();
    expect(
      vault.getAbstractFileByPath("Languages/What-is-2-2-102.md"),
    ).not.toBeNull();
  });

  test("given note tags when executed then names the file by front and note id", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        ...basicImportNote(101, 100),
        tags: ["endings", "basics"],
      },
    ];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const created = vault.getMarkdownFiles().map((file) => file.path);
    expect(created).toEqual(["Languages/What-is-2-2-101.md"]);
  });

  test("given dotted field text when executed then names the file by front and note id", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 104,
        mod: 60,
        modelName: "Basic",
        fields: {
          Front: { value: "<p>They caught the thief...</p>" },
          Back: { value: "<p>thief</p>" },
        },
        tags: [] as string[],
        cards: [9],
      },
    ];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 104: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const created = vault.getMarkdownFiles().map((file) => file.path);
    expect(created).toEqual(["Languages/They-caught-the-thief-104.md"]);
  });

  test("given media references when executed then imports media and rewrites references", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 103,
        mod: 50,
        modelName: "Basic",
        fields: {
          Front: { value: '<p>Look <img src="a.png"></p>' },
          Back: { value: "<p>Answer</p>" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 103: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report.mediaFiles).toBe(1);
    expect(
      vault.getAbstractFileByPath("Languages/attachments/a.png"),
    ).not.toBeNull();
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Look-103.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("![[Languages/attachments/a.png]]");
  });

  test("given a foreign file at the target path when executed then suffixes instead of overwriting", async () => {
    // given
    const { vault } = executeWith({
      "Languages/What-is-2-2-101.md": "someone else's notes\n",
    });
    const notes = [basicImportNote(101, 100)];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 1, overwritten: 0 });
    const untouched = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/What-is-2-2-101.md",
      ) as unknown as ObsidianTFile,
    );
    expect(untouched).toBe("someone else's notes\n");
    expect(
      vault.getAbstractFileByPath("Languages/What-is-2-2-101-1.md"),
    ).not.toBeNull();
  });

  test("given div-wrapped html when executed then writes plain text fields", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 105,
        mod: 70,
        modelName: "Basic",
        fields: {
          Front: { value: "<div>What is 2+2?</div>" },
          Back: { value: "<p>4</p>" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 105: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/What-is-2-2-105.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("What is 2+2?");
    expect(written).not.toContain("<div>");
  });

  test("given line breaks and comments when executed then writes cleaned fields", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 106,
        mod: 70,
        modelName: "Basic",
        fields: {
          Front: { value: "<p>Question</p>" },
          Back: { value: "Answer:<br>\n\n- item\n\n<!-- -->" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 106: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Question-106.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("Answer:");
    expect(written).toContain("- item");
    expect(written).not.toContain("<br>");
    expect(written).not.toContain("<!--");
  });

  test("given only skipped fields when executed then writes a file with empty fields", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(107, 70)];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 107: true },
        fieldMappings: { Basic: { Front: "Skip", Back: "Skip" } },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Languages-107.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain('"front":""');
    expect(written).toContain('"back":""');
  });

  test("given a sound reference when executed then imports the sound file", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 108,
        mod: 70,
        modelName: "Basic",
        fields: {
          Front: { value: "<p>Question</p>" },
          Back: { value: "<p>Hear [sound:b.mp3]</p>" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 108: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report.mediaFiles).toBe(1);
    expect(
      vault.getAbstractFileByPath("Languages/attachments/b.mp3"),
    ).not.toBeNull();
  });

  test("given a cloze note when executed then writes native cloze keys", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 109,
        mod: 80,
        modelName: "Cloze",
        fields: {
          Text: { value: "<p>Paris is {{c1::France}}</p>" },
          Extra: { value: "<p>Capital</p>" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 109: true },
        fieldMappings: { Cloze: { Text: "Text", Extra: "Extra" } },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Paris-is-France-109.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain('"text":"Paris is {{c1::France}}"');
    expect(written).toContain('"back_extra":"Capital"');
    expect(written).toContain('"model":"Cloze"');
    expect(written).not.toContain('"front"');
  });

  test("given a selected note without a pack when executed then skips it as unmapped", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [
      {
        noteId: 110,
        mod: 90,
        modelName: "My Model",
        fields: {
          Question: { value: "<p>Q</p>" },
          Answer: { value: "<p>A</p>" },
        },
        tags: [] as string[],
        cards: [7],
      },
    ];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 110: true },
        fieldMappings: { "My Model": { Question: "Front", Answer: "Back" } },
        targetFolder: "",
        noteLifecycle: {},
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 0, skippedUnmapped: 1 });
    expect(vault.getMarkdownFiles()).toHaveLength(0);
  });

  test("given a note whose vault file is gone when executed then leaves it to Sync and reports it", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(111, 200)];
    const vaultNoteIndex = new Map([[111, "Languages/Old-111.md"]]);
    const noteLifecycle: ExecuteImportRequest["noteLifecycle"] = {
      111: {
        lastHash: "stale",
        lastMod: 100,
        status: "synced.clean",
        updatedAt: 0,
        v: 1,
      },
    };

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        decisions: { 111: true },
        fieldMappings: { Basic: basicMapping() },
        noteLifecycle,
        notes,
        targetFolder: "",
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 0, skippedLeftToSync: 1 });
    expect(vault.getMarkdownFiles()).toHaveLength(0);
    expect(noteLifecycle[111]).toBeDefined();
  });

  test("given a note whose vault file is gone with force when executed then re-creates the file", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(111, 200)];
    const vaultNoteIndex = new Map([[111, "Languages/Old-111.md"]]);
    const noteLifecycle: ExecuteImportRequest["noteLifecycle"] = {
      111: {
        lastHash: "stale",
        lastMod: 100,
        status: "synced.clean",
        updatedAt: 0,
        v: 1,
      },
    };

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        ankiWinsNoteIds: [111],
        decisions: { 111: true },
        fieldMappings: { Basic: basicMapping() },
        noteLifecycle,
        notes,
        targetFolder: "",
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({
      created: 1,
      forced: 1,
      skippedLeftToSync: 0,
    });
    expect(vault.getMarkdownFiles()).toHaveLength(1);
  });

  test("given a forced note that would be imported anyway when executed then it is not counted as forced", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(112, 200)];

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        ankiWinsNoteIds: [112],
        decisions: { 112: true },
        fieldMappings: { Basic: basicMapping() },
        noteLifecycle: {},
        notes,
        targetFolder: "",
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ created: 1, forced: 0 });
  });

  test("given a vault-newer note without force when executed then leaves the file alone", async () => {
    // given
    const before =
      '```note-form\n{\n"front": "Mine",\n"back": "A",\n"tags": "",\n"id": 111\n}\n```\n';
    const { vault } = executeWith({ "Languages/What-is-2-2-111.md": before });
    const notes = [basicImportNote(111, 100)];
    const vaultNoteIndex = new Map([[111, "Languages/What-is-2-2-111.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 111: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {
          111: {
            lastHash: "stale",
            lastMod: 100,
            status: "synced.clean",
            updatedAt: 0,
            v: 1,
          },
        },
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ overwritten: 0, skippedNewerInVault: 1 });
    expect(
      await vault.read(
        vault.getAbstractFileByPath(
          "Languages/What-is-2-2-111.md",
        ) as unknown as ObsidianTFile,
      ),
    ).toBe(before);
  });

  test("given a vault-newer note with force when executed then overwrites with anki content", async () => {
    // given
    const { vault } = executeWith({
      "Languages/What-is-2-2-111.md":
        '```note-form\n{\n"front": "Mine",\n"back": "A",\n"tags": "",\n"id": 111\n}\n```\n',
    });
    const notes = [basicImportNote(111, 100)];
    const vaultNoteIndex = new Map([[111, "Languages/What-is-2-2-111.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        ankiWinsNoteIds: [111],
        notes,
        decisions: { 111: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {
          111: {
            lastHash: "stale",
            lastMod: 100,
            status: "synced.clean",
            updatedAt: 0,
            v: 1,
          },
        },
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({
      forced: 1,
      overwritten: 1,
      skippedNewerInVault: 0,
    });
    const written = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/What-is-2-2-111.md",
      ) as unknown as ObsidianTFile,
    );
    expect(written).toContain("What is 2+2?");
  });

  test("given a diverged note without force when executed then leaves the file alone", async () => {
    // given
    const before =
      '```note-form\n{\n"front": "Mine",\n"back": "A",\n"tags": "",\n"id": 111\n}\n```\n';
    const { vault } = executeWith({ "Languages/What-is-2-2-111.md": before });
    const notes = [basicImportNote(111, 200)];
    const vaultNoteIndex = new Map([[111, "Languages/What-is-2-2-111.md"]]);

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 111: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {
          111: {
            lastHash: "stale",
            lastMod: 100,
            status: "synced.clean",
            updatedAt: 0,
            v: 1,
          },
        },
        vaultNoteIndex,
      },
      jsonEngine,
    );

    // then
    expect(report).toMatchObject({ overwritten: 0, skippedNewerInVault: 1 });
    expect(
      await vault.read(
        vault.getAbstractFileByPath(
          "Languages/What-is-2-2-111.md",
        ) as unknown as ObsidianTFile,
      ),
    ).toBe(before);
  });

  test("given cancellation mid-run when executed then stops with a partial report", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(101, 100), basicImportNote(102, 100)];
    let calls = 0;

    // when
    const report = await executeImport(
      new Anki(),
      vault,
      {
        deckName: "Languages",
        notes,
        decisions: { 101: true, 102: true },
        fieldMappings: { Basic: basicMapping() },
        targetFolder: "",
        noteLifecycle: {},
        isCancelled: () => {
          calls += 1;
          return calls > 1;
        },
      },
      jsonEngine,
    );

    // then
    expect(report.cancelled).toBe(true);
    expect(report.created).toBe(1);
  });
});

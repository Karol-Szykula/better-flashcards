/**
 * @jest-environment jsdom
 *
 * buildNoteMarkdown converts HTML through showdown, which needs window.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type {
  TFile as ObsidianTFile,
  Vault as ObsidianVault,
} from "obsidian";
import { Anki } from "src/services/anki";
import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { Clozecard } from "src/entities/clozecard";
import { Flashcard } from "src/entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { basicModelName } from "src/conf/constants";
import type { FieldMapping } from "src/services/import";
import {
  buildNoteMarkdown,
  classifyDeckNotes,
  deckFolder,
  discoverDeckModels,
  executeImport,
  fetchDeckNotes,
  isKnownModel,
  mergeFieldMappings,
  normalizeCardText,
  noteTitle,
  presetFieldMapping,
  resolveFieldMapping,
} from "src/services/import";
import { AnkiConnectMock } from "../mocks/anki-connect";

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
});

describe("presetFieldMapping", () => {
  test("given known and unknown fields when mapped then maps by name and skips the rest", async () => {
    // given
    const fields = ["Front", "Back", "Weird"];

    // when
    const mapping = presetFieldMapping(fields);

    // then
    expect(mapping).toEqual({
      Front: "Front",
      Back: "Back",
      Weird: "Skip",
    });
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
      (r) => r.action === "findNotes"
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

describe("normalizeCardText", () => {
  test.each([
    ["<p>What is <b>2+2</b>?</p>", "What is **2+2**?"],
    ["<ul><li>a</li><li>b</li></ul>", "- a\n- b"],
    ["a &gt; b", "a > b"],
    ["a   b\nc", "a b c"],
    ["<div><p>x</p></div>", "x"],
    ["<p><code>f(x)</code></p>", "`f(x)`"],
  ])("given same content in both formats when normalized then treats as equal: %p vs %p", (anki, obsidian) => {
    // when
    const normalizedAnki = normalizeCardText(anki);
    const normalizedObsidian = normalizeCardText(obsidian);

    // then
    expect(normalizedAnki).toBe(normalizedObsidian);
  });

  test.each([
    ["4", "5"],
    ["Hello", "Hello world"],
    ["cat", "Cat"],
    ["<p>a</p>", "<p>a b</p>"],
  ])("given different content when normalized then treats as different: %p vs %p", (anki, obsidian) => {
    // when
    const normalizedAnki = normalizeCardText(anki);
    const normalizedObsidian = normalizeCardText(obsidian);

    // then
    expect(normalizedAnki).not.toBe(normalizedObsidian);
  });
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
    const notes = await fetchDeckNotes(new Anki(), "Languages", (fetched, total) => {
      progress.push([fetched, total]);
    });

    // then
    expect(notes).toHaveLength(totalNotes);
    expect(notes[0].noteId).toBe(1);
    expect(notes[totalNotes - 1].noteId).toBe(totalNotes);
    const infoCalls = AnkiConnectMock.requests.filter(
      (r) => r.action === "notesInfo"
    );
    expect(infoCalls).toHaveLength(3);
    expect(progress).toEqual([
      [100, totalNotes],
      [200, totalNotes],
      [250, totalNotes],
    ]);
  });
});

describe("buildNoteMarkdown", () => {
  const flashcardsTag = "card";

  function basicNote(tags: string[] = []) {
    return {
      noteId: 1,
      modelName: "Basic",
      fields: {
        Front: { value: "<p>What is 2+2?</p>" },
        Back: { value: "<p>4</p>" },
      },
      tags,
      cards: [7],
    };
  }

  test("given Front and Back when built then returns inline syntax", async () => {
    // when
    const built = buildNoteMarkdown(basicNote(), { Front: "Front", Back: "Back" }, flashcardsTag);

    // then
    expect(built.markdown).toBe("What is 2+2? :: 4\n");
    expect(built.media).toEqual([]);
  });

  test("given note tags when built then appends them to the inline card", async () => {
    // given
    const noteTags = ["t1", "parent::child"];

    // when
    const built = buildNoteMarkdown(
      basicNote(noteTags),
      { Front: "Front", Back: "Back" },
      flashcardsTag
    );

    // then
    expect(built.markdown).toContain("#t1");
    expect(built.markdown).toContain("#parent/child");
  });

  test("given Anki cloze markers when built then converts them to deletions", async () => {
    // given
    const note = {
      noteId: 2,
      modelName: "Cloze",
      fields: { Text: { value: "<p>This is {{c1::hidden}}</p>" }, Extra: { value: "" } },
      tags: [] as string[],
      cards: [8],
    };

    // when
    const built = buildNoteMarkdown(
      note,
      { Text: "Text", Extra: "Extra" },
      flashcardsTag
    );

    // then
    expect(built.markdown).toContain("==hidden==");
  });

  test("given a Prompt when built then returns spaced syntax", async () => {
    // given
    const note = {
      noteId: 3,
      modelName: "Spaced",
      fields: { Prompt: { value: "<p>Recall this</p>" } },
      tags: [] as string[],
      cards: [9],
    };

    // when
    const built = buildNoteMarkdown(note, { Prompt: "Prompt" }, flashcardsTag);

    // then
    expect(built.markdown).toBe("Recall this #card-spaced\n");
  });

  test("given media references when built then extracts image and sound names", async () => {
    // given
    const note = {
      noteId: 4,
      modelName: "Basic",
      fields: {
        Front: { value: '<p>Look <img src="a.png"></p>' },
        Back: { value: "<p>Listen [sound:b.mp3]</p>" },
      },
      tags: [] as string[],
      cards: [10],
    };

    // when
    const built = buildNoteMarkdown(
      note,
      { Front: "Front", Back: "Back" },
      flashcardsTag
    );

    // then
    expect(built.media).toEqual(["a.png", "b.mp3"]);
  });

  test("given only skipped fields when built then returns empty markdown", async () => {
    // when
    const built = buildNoteMarkdown(
      basicNote(),
      { Front: "Skip", Back: "Skip" },
      flashcardsTag
    );

    // then
    expect(built.markdown).toBe("");
  });
});

describe("buildNoteMarkdown round-trip", () => {
  function parseBuilt(markdown: string) {
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    return parser.generateFlashcards(markdown, "Default", "Vault", "Note", []);
  }

  test("given built inline markdown when parsed back then returns one inline card", async () => {
    // given
    const note = {
      noteId: 1,
      modelName: "Basic",
      fields: {
        Front: { value: "<p>What is 2+2?</p>" },
        Back: { value: "<p>4</p>" },
      },
      tags: [] as string[],
      cards: [7],
    };

    // when
    const built = buildNoteMarkdown(note, { Front: "Front", Back: "Back" }, "card");
    const cards = parseBuilt(built.markdown);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Inlinecard);
  });

  test("given built cloze markdown when parsed back then returns one cloze card", async () => {
    // given
    const note = {
      noteId: 2,
      modelName: "Cloze",
      fields: { Text: { value: "<p>Paris is {{c1::France}}</p>" } },
      tags: [] as string[],
      cards: [8],
    };

    // when
    const built = buildNoteMarkdown(note, { Text: "Text" }, "card");
    const cards = parseBuilt(built.markdown);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
  });

  test("given built spaced markdown when parsed back then returns one spaced card", async () => {
    // given
    const note = {
      noteId: 3,
      modelName: "Spaced",
      fields: { Prompt: { value: "<p>Recall this</p>" } },
      tags: [] as string[],
      cards: [9],
    };

    // when
    const built = buildNoteMarkdown(note, { Prompt: "Prompt" }, "card");
    const cards = parseBuilt(built.markdown);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
  });

  test("given a front-only note when built and parsed back then returns one card", async () => {
    // given
    const note = {
      noteId: 4,
      modelName: "Basic",
      fields: { Front: { value: "<p>Lonely question</p>" } },
      tags: [] as string[],
      cards: [10],
    };

    // when
    const built = buildNoteMarkdown(note, { Front: "Front" }, "card");
    const cards = parseBuilt(built.markdown);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Flashcard);
  });
});

describe("classifyDeckNotes", () => {
  const firstNote = {
    noteId: 1,
    fields: { Front: { value: "q" } },
    tags: [] as string[],
  };
  const secondNote = {
    noteId: 2,
    fields: { Front: { value: "w" } },
    tags: [] as string[],
  };

  test("given unknown notes when classified then marks them new", async () => {
    // when
    const classified = classifyDeckNotes([firstNote, secondNote], new Map());

    // then
    expect(classified).toEqual([
      { note: firstNote, status: "new" },
      { note: secondNote, status: "new" },
    ]);
  });

  test("given known notes when classified then marks conflicts with vault path", async () => {
    // given
    const vaultFileName = "Note.md";
    const vaultNoteIndex = new Map([[2, vaultFileName]]);

    // when
    const classified = classifyDeckNotes([firstNote, secondNote], vaultNoteIndex);

    // then
    expect(classified).toEqual([
      { note: firstNote, status: "new" },
      { note: secondNote, status: "conflict", vaultPath: vaultFileName },
    ]);
  });
});

describe("resolveFieldMapping", () => {
  test("given valid saved targets when resolved then merges them over the preset", async () => {
    // given
    const fields = ["Front", "Back"];

    // when
    const mapping = resolveFieldMapping(fields, { Back: "Text", Front: "Front" });

    // then
    expect(mapping).toEqual({ Front: "Front", Back: "Text" });
  });

  test("given off-list saved targets when resolved then drops them", async () => {
    // given
    const fields = ["Front"];

    // when
    const mapping = resolveFieldMapping(fields, { Front: "Nope" });

    // then
    expect(mapping).toEqual({
      Front: "Front",
    });
  });

  test("given no saved mapping when resolved then keeps the preset", async () => {
    // when
    const mapping = resolveFieldMapping(["Front"], undefined);

    // then
    expect(mapping).toEqual({
      Front: "Front",
    });
  });
});

describe("mergeFieldMappings", () => {
  test("given incoming mappings when merged then keeps other models intact", async () => {
    // when
    const merged = mergeFieldMappings(
      { Basic: { Front: "Front" }, Other: { A: "Skip" } },
      { Basic: { Back: "Back" } }
    );

    // then
    expect(merged).toEqual({
      Basic: { Front: "Front", Back: "Back" },
      Other: { A: "Skip" },
    });
  });
});

describe("noteTitle", () => {
  test("given a plain deck when titled then combines deck and note id", async () => {
    // when
    const title = noteTitle("Angielski", 1111111111111);

    // then
    expect(title).toBe("Angielski-1111111111111");
  });

  test("given a nested deck when titled then flattens deck levels", async () => {
    // when
    const title = noteTitle("Angielski::words::endings", 1111111111111);

    // then
    expect(title).toBe("Angielski-words-endings-1111111111111");
  });

  test("given illegal filename characters when titled then replaces them", async () => {
    // when
    const title = noteTitle("A/B:C", 7);

    // then
    expect(title).toBe("A-B-C-7");
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
  const flashcardsTag = "card";

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
    const report = await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true, 102: false },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(report).toMatchObject({
      created: 1,
      overwritten: 0,
      skipped: 1,
      cancelled: false,
      lastSyncRev: 100,
    });
    const written = await vault.read(
      vault.getAbstractFileByPath("Languages/Languages-101.md") as unknown as ObsidianTFile
    );
    expect(written).toContain("^101");
  });

  test("given a missing deck folder when executed then creates the folder first", async () => {
    // given
    const { app, vault } = executeWith({});
    const createFolder = jest.spyOn(app.vault, "createFolder");
    const notes = [basicImportNote(101, 100)];

    // when
    await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(createFolder).toHaveBeenCalledWith("Languages");
  });

  test("given an existing file when executed then overwrites it", async () => {
    // given
    const { vault } = executeWith({
      "Languages/Languages-101.md": "stale content\n\n^101\n",
    });
    const notes = [basicImportNote(101, 100)];

    // when
    const report = await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(report).toMatchObject({ created: 0, overwritten: 1 });
    const written = await vault.read(
      vault.getAbstractFileByPath("Languages/Languages-101.md") as unknown as ObsidianTFile
    );
    expect(written).not.toContain("stale content");
    expect(written).toContain("^101");
  });

  test("given identical fields when executed then writes separate files per note", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(101, 100), basicImportNote(102, 100)];

    // when
    await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true, 102: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(
      vault.getAbstractFileByPath("Languages/Languages-101.md")
    ).not.toBeNull();
    expect(
      vault.getAbstractFileByPath("Languages/Languages-102.md")
    ).not.toBeNull();
  });

  test("given dotted field text when executed then names the file by deck and note id", async () => {
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
    await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 104: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    const created = vault.getMarkdownFiles().map((file) => file.path);
    expect(created).toEqual(["Languages/Languages-104.md"]);
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
    const report = await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 103: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(report.mediaFiles).toBe(1);
    expect(
      vault.getAbstractFileByPath("Languages/attachments/a.png")
    ).not.toBeNull();
    const written = await vault.read(
      vault.getAbstractFileByPath("Languages/Languages-103.md") as unknown as ObsidianTFile
    );
    expect(written).toContain("![[Languages/attachments/a.png]]");
  });

  test("given a foreign file at the target path when executed then suffixes instead of overwriting", async () => {
    // given
    const { vault } = executeWith({
      "Languages/Languages-101.md": "someone else's notes\n",
    });
    const notes = [basicImportNote(101, 100)];

    // when
    const report = await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
    });

    // then
    expect(report).toMatchObject({ created: 1, overwritten: 0 });
    const untouched = await vault.read(
      vault.getAbstractFileByPath(
        "Languages/Languages-101.md"
      ) as unknown as ObsidianTFile
    );
    expect(untouched).toBe("someone else's notes\n");
    expect(
      vault.getAbstractFileByPath("Languages/Languages-101-1.md")
    ).not.toBeNull();
  });

  test("given cancellation mid-run when executed then stops with a partial report", async () => {
    // given
    const { vault } = executeWith({});
    const notes = [basicImportNote(101, 100), basicImportNote(102, 100)];
    let calls = 0;

    // when
    const report = await executeImport(new Anki(), vault, {
      deckName: "Languages",
      notes,
      decisions: { 101: true, 102: true },
      fieldMappings: { Basic: basicMapping() },
      targetFolder: "",
      flashcardsTag,
      isCancelled: () => {
        calls += 1;
        return calls > 1;
      },
    });

    // then
    expect(report.cancelled).toBe(true);
    expect(report.created).toBe(1);
  });
});

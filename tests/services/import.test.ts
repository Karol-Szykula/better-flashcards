/**
 * @jest-environment jsdom
 *
 * buildNoteMarkdown converts HTML through showdown, which needs window.
 */
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
import {
  buildNoteMarkdown,
  classifyDeckNotes,
  discoverDeckModels,
  fetchDeckNotes,
  isKnownModel,
  mergeFieldMappings,
  normalizeCardText,
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
    const vaultNoteIndex = new Map([[2, "Note.md"]]);

    // when
    const classified = classifyDeckNotes([firstNote, secondNote], vaultNoteIndex);

    // then
    expect(classified).toEqual([
      { note: firstNote, status: "new" },
      { note: secondNote, status: "conflict", vaultPath: "Note.md" },
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

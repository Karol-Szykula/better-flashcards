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
  test("recognizes the plugin models", async () => {
    expect(isKnownModel(basicModelName)).toBe(true);
  });

  test("recognizes plugin models with extensions", async () => {
    expect(isKnownModel(`${basicModelName} with source`)).toBe(true);
  });

  test("rejects foreign models", async () => {
    expect(isKnownModel("Custom Language Model")).toBe(false);
  });
});

describe("presetFieldMapping", () => {
  test("maps known fields by name and skips the rest", async () => {
    expect(presetFieldMapping(["Front", "Back", "Weird"])).toEqual({
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

  test("groups fields by model", async () => {
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

    const models = await discoverDeckModels(new Anki(), deckName);

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

  test("labels notes without a model as Unknown", async () => {
    respondWithNotes([{ noteId: 1, fields: { Front: { value: "q" } } }]);

    const models = await discoverDeckModels(new Anki(), deckName);

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
  ])("treats as equal: %p vs %p", (anki, obsidian) => {
    expect(normalizeCardText(anki)).toBe(normalizeCardText(obsidian));
  });

  test.each([
    ["4", "5"],
    ["Hello", "Hello world"],
    ["cat", "Cat"],
    ["<p>a</p>", "<p>a b</p>"],
  ])("treats as different: %p vs %p", (anki, obsidian) => {
    expect(normalizeCardText(anki)).not.toBe(normalizeCardText(obsidian));
  });
});

describe("fetchDeckNotes", () => {
  test("fetches notes in chunks and reports progress", async () => {
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

    const notes = await fetchDeckNotes(new Anki(), "Languages", (fetched, total) => {
      progress.push([fetched, total]);
    });

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

  test("builds inline syntax from Front and Back", async () => {
    const built = buildNoteMarkdown(basicNote(), { Front: "Front", Back: "Back" }, flashcardsTag);
    expect(built.markdown).toBe("What is 2+2? :: 4\n");
    expect(built.media).toEqual([]);
  });

  test("appends tags to the inline card", async () => {
    const built = buildNoteMarkdown(
      basicNote(["t1", "parent::child"]),
      { Front: "Front", Back: "Back" },
      flashcardsTag
    );
    expect(built.markdown).toContain("#t1");
    expect(built.markdown).toContain("#parent/child");
  });

  test("converts Anki cloze deletions", async () => {
    const note = {
      noteId: 2,
      modelName: "Cloze",
      fields: { Text: { value: "<p>This is {{c1::hidden}}</p>" }, Extra: { value: "" } },
      tags: [] as string[],
      cards: [8],
    };
    const built = buildNoteMarkdown(
      note,
      { Text: "Text", Extra: "Extra" },
      flashcardsTag
    );
    expect(built.markdown).toContain("==hidden==");
  });

  test("builds spaced syntax from Prompt", async () => {
    const note = {
      noteId: 3,
      modelName: "Spaced",
      fields: { Prompt: { value: "<p>Recall this</p>" } },
      tags: [] as string[],
      cards: [9],
    };
    const built = buildNoteMarkdown(note, { Prompt: "Prompt" }, flashcardsTag);
    expect(built.markdown).toBe("Recall this #card-spaced\n");
  });

  test("extracts image and sound references", async () => {
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
    const built = buildNoteMarkdown(
      note,
      { Front: "Front", Back: "Back" },
      flashcardsTag
    );
    expect(built.media).toEqual(["a.png", "b.mp3"]);
  });

  test("returns empty markdown when everything is skipped", async () => {
    const built = buildNoteMarkdown(
      basicNote(),
      { Front: "Skip", Back: "Skip" },
      flashcardsTag
    );
    expect(built.markdown).toBe("");
  });
});

describe("buildNoteMarkdown round-trip", () => {
  function parseBuilt(markdown: string) {
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    return parser.generateFlashcards(markdown, "Default", "Vault", "Note", []);
  }

  test("inline markdown parses back to one card", async () => {
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
    const built = buildNoteMarkdown(note, { Front: "Front", Back: "Back" }, "card");
    const cards = parseBuilt(built.markdown);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Inlinecard);
  });

  test("cloze markdown parses back to one card", async () => {
    const note = {
      noteId: 2,
      modelName: "Cloze",
      fields: { Text: { value: "<p>Paris is {{c1::France}}</p>" } },
      tags: [] as string[],
      cards: [8],
    };
    const built = buildNoteMarkdown(note, { Text: "Text" }, "card");
    const cards = parseBuilt(built.markdown);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
  });

  test("spaced markdown parses back to one card", async () => {
    const note = {
      noteId: 3,
      modelName: "Spaced",
      fields: { Prompt: { value: "<p>Recall this</p>" } },
      tags: [] as string[],
      cards: [9],
    };
    const built = buildNoteMarkdown(note, { Prompt: "Prompt" }, "card");
    const cards = parseBuilt(built.markdown);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
  });

  test("front-only fallback parses back to one card", async () => {
    const note = {
      noteId: 4,
      modelName: "Basic",
      fields: { Front: { value: "<p>Lonely question</p>" } },
      tags: [] as string[],
      cards: [10],
    };
    const built = buildNoteMarkdown(note, { Front: "Front" }, "card");
    const cards = parseBuilt(built.markdown);
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

  test("marks unknown notes as new", async () => {
    const classified = classifyDeckNotes([firstNote, secondNote], new Map());
    expect(classified).toEqual([
      { note: firstNote, status: "new" },
      { note: secondNote, status: "new" },
    ]);
  });

  test("marks known notes as conflicts with vault path", async () => {
    const vaultNoteIndex = new Map([[2, "Note.md"]]);
    const classified = classifyDeckNotes([firstNote, secondNote], vaultNoteIndex);
    expect(classified).toEqual([
      { note: firstNote, status: "new" },
      { note: secondNote, status: "conflict", vaultPath: "Note.md" },
    ]);
  });
});

describe("resolveFieldMapping", () => {
  test("merges preset with valid saved targets", async () => {
    expect(
      resolveFieldMapping(["Front", "Back"], { Back: "Text", Front: "Front" })
    ).toEqual({ Front: "Front", Back: "Text" });
  });

  test("drops saved targets outside the allowed list", async () => {
    expect(resolveFieldMapping(["Front"], { Front: "Nope" })).toEqual({
      Front: "Front",
    });
  });

  test("keeps preset without saved mapping", async () => {
    expect(resolveFieldMapping(["Front"], undefined)).toEqual({
      Front: "Front",
    });
  });
});

describe("mergeFieldMappings", () => {
  test("merges incoming mappings per model without dropping others", async () => {
    expect(
      mergeFieldMappings(
        { Basic: { Front: "Front" }, Other: { A: "Skip" } },
        { Basic: { Back: "Back" } }
      )
    ).toEqual({
      Basic: { Front: "Front", Back: "Back" },
      Other: { A: "Skip" },
    });
  });
});

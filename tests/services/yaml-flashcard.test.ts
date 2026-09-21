/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";
import {
  computeContentHash,
  parseYamlFlashcards,
  readYamlFlashcards,
  serializeYamlFlashcard,
  yamlNoteFileName,
} from "src/services/yaml-flashcard";
import type { YamlFlashcard } from "src/services/yaml-flashcard";

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

function yamlCard(overrides: Partial<YamlFlashcard> = {}): YamlFlashcard {
  return {
    back: "4",
    extra: {},
    front: "What is 2+2?",
    id: 1111111111111,
    tags: "math",
    ...overrides,
  };
}

describe("parseYamlFlashcards", () => {
  test("given content with one form block when parsed then returns the card", async () => {
    // given
    const block = '{"front": "Q", "back": "A", "tags": "math", "id": 7}';
    const content = `# Title\n\`\`\`flashcard-form\n${block}\n\`\`\`\nAfter\n`;

    // when
    const parsed = parseYamlFlashcards(content, jsonEngine);

    // then
    expect(parsed).toEqual([
      { back: "A", extra: {}, front: "Q", id: 7, tags: "math" },
    ]);
  });

  test("given content without form blocks when parsed then returns nothing", async () => {
    // given
    const content = "# Title\nJust text\n";

    // when
    const parsed = parseYamlFlashcards(content, jsonEngine);

    // then
    expect(parsed).toEqual([]);
  });

  test("given content with two form blocks when parsed then returns both cards", async () => {
    // given
    const first = '{"front": "Q1", "back": "A1"}';
    const second = '{"front": "Q2", "back": "A2"}';
    const content = `\`\`\`flashcard-form\n${first}\n\`\`\`\n\`\`\`flashcard-form\n${second}\n\`\`\`\n`;

    // when
    const parsed = parseYamlFlashcards(content, jsonEngine);

    // then
    expect(parsed.map((card) => card.front)).toEqual(["Q1", "Q2"]);
  });
});

describe("computeContentHash", () => {
  test("given identical content when hashed then returns the same hex digest", async () => {
    // given
    const front = "What is 2+2?";
    const back = "4";
    const tags = "math";

    // when
    const first = await computeContentHash(front, back, tags);
    const second = await computeContentHash(front, back, tags);

    // then
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  test("given changed back when hashed then returns a different digest", async () => {
    // given
    const front = "What is 2+2?";
    const tags = "math";

    // when
    const original = await computeContentHash(front, "4", tags);
    const changed = await computeContentHash(front, "5", tags);

    // then
    expect(changed).not.toBe(original);
  });
});

describe("serializeYamlFlashcard", () => {
  test("given a card when serialized then wraps it in a fenced block", async () => {
    // given
    const card = yamlCard({ extra: {}, id: undefined });

    // when
    const serialized = serializeYamlFlashcard(card, jsonEngine);

    // then
    expect(serialized).toBe(
      '```flashcard-form\n{"front":"What is 2+2?","back":"4","tags":"math"}\n```'
    );
  });
});

describe("yamlNoteFileName", () => {
  test("given front text when named then joins front and note id", async () => {
    // given
    const deckName = "Angielski";
    const front = "What is 2+2?";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("What-is-2-2-1111111111111.md");
  });

  test("given empty front when named then falls back to the deck name", async () => {
    // given
    const deckName = "Angielski";
    const front = "";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("Angielski-1111111111111.md");
  });

  test("given illegal characters when named then sanitizes them", async () => {
    // given
    const deckName = "Angielski";
    const front = "a/b:c*d?e";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("a-b-c-d-e-1111111111111.md");
  });

  test("given media references when named then strips them", async () => {
    // given
    const deckName = "Angielski";
    const front = "Look ![[Languages/attachments/a.png]]";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("Look-1111111111111.md");
  });

  test("given cloze markers when named then keeps only the inner text", async () => {
    // given
    const deckName = "Angielski";
    const front = "Stolica to {{c1::Paryż}}";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("Stolica-to-Paryż-1111111111111.md");
  });

  test("given an ellipsis when named then removes it", async () => {
    // given
    const deckName = "Angielski";
    const front = "Wait... what?";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("Wait-what-1111111111111.md");
  });

  test("given leftover html when named then strips the tags", async () => {
    // given
    const deckName = "Angielski";
    const front = "<div>Jak tylko spróbuję</div>";
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe("Jak-tylko-spróbuję-1111111111111.md");
  });

  test("given a long multibyte front when named then truncates by bytes without splitting characters", async () => {
    // given
    const deckName = "Angielski";
    const front = "ą".repeat(150);
    const noteId = 1111111111111;

    // when
    const fileName = yamlNoteFileName(deckName, front, noteId);

    // then
    expect(fileName).toBe(`${"ą".repeat(100)}-1111111111111.md`);
  });
});

describe("readYamlFlashcards", () => {
  test("given a vault file with a form block when read then returns the card", async () => {
    // given
    const block = '{"front": "Q", "back": "A", "tags": "math", "id": 7}';
    const app = App.createConfigured__({
      files: { "Note.md": `\`\`\`flashcard-form\n${block}\n\`\`\`\n` },
    });
    const vault = app.vault as unknown as ObsidianVault;
    const file = vault.getAbstractFileByPath("Note.md");
    if (!(file instanceof TFile)) {
      throw new Error("Note.md not found in mock vault");
    }

    // when
    const cards = await readYamlFlashcards(vault, file, jsonEngine);

    // then
    expect(cards).toEqual([
      { back: "A", extra: {}, front: "Q", id: 7, tags: "math" },
    ]);
  });
});

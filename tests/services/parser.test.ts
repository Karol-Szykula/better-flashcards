import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { Flashcard } from "src/entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { Clozecard } from "src/entities/clozecard";

function createParser(overrides: Partial<ISettings> = {}): Parser {
  const settings = createSettings(overrides);
  return new Parser(new Regex(settings), settings);
}

function generate(
  file: string,
  overrides: Partial<ISettings> = {},
  globalTags: string[] = []
) {
  return createParser(overrides).generateFlashcards(
    file,
    "Test deck",
    "Vault",
    "Note",
    globalTags
  );
}

beforeEach(() => {
  setActiveDocument();
});

describe("Parser - inline cards (Q :: A)", () => {
  test("parses basic inline card with fields, deck and offsets", () => {
    const file = "What is 2+2? :: 4\n";
    const cards = generate(file);

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toBeInstanceOf(Inlinecard);
    expect(card.fields["Front"]).toContain("What is 2+2?");
    expect(card.fields["Back"]).toContain("4");
    expect(card.reversed).toBe(false);
    expect(card.deckName).toBe("Test deck");
    expect(card.initialOffset).toBe(0);
    expect(card.endOffset).toBeGreaterThan(0);
    expect(card.endOffset).toBeLessThanOrEqual(file.length);
    expect(card.inserted).toBe(false);
    expect(card.id).toBe(-1);
  });

  test("parses reversed inline card (:::)", () => {
    const cards = generate("Capital of France ::: Paris\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe("Obsidian-basic-reversed");
  });

  test("skips lines starting with cards-deck", () => {
    const cards = generate("cards-deck: Foo :: Bar\n");
    expect(cards).toHaveLength(0);
  });

  test("skips lines starting with tags", () => {
    const cards = generate("tags: #a :: b\n");
    expect(cards).toHaveLength(0);
  });

  test("collects card tags and converts hierarchy separator", () => {
    const cards = generate("Q :: A #science/physics #important\n");

    expect(cards[0].tags).toEqual(["science::physics", "important"]);
  });

  test("merges global tags before card tags", () => {
    const cards = generate("Q :: A #card-tag\n", {}, ["global1"]);

    expect(cards[0].tags).toEqual(["global1", "card-tag"]);
  });

  test("reads inline block ID when inlineID enabled", () => {
    const cards = generate("Q :: A ^1234567890123\n", { inlineID: true });

    expect(cards[0].id).toBe(1234567890123);
    expect(cards[0].inserted).toBe(true);
  });

  test("adds Source field when sourceSupport enabled", () => {
    const settings = createSettings({ sourceSupport: true });
    const parser = new Parser(new Regex(settings), settings);
    const cards = parser.generateFlashcards(
      "Q :: A\n",
      "Deck",
      "Vault",
      "Note"
    );

    expect(cards[0].fields["Source"]).toBe(
      '<a href="obsidian://open?vault=Vault&file=Note.md">Note</a>'
    );
  });

  test("parses card defined in a heading line", () => {
    const cards = generate("# Heading question :: answer\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("Heading question");
  });

  test("parses card defined as a list item", () => {
    const cards = generate("- List question :: list answer\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("List question");
  });

  test("converts markdown to HTML in fields", () => {
    const cards = generate("This is **bold** :: answer\n");

    expect(cards[0].fields["Front"]).toContain("<strong>bold</strong>");
  });

  test("detects code in card content", () => {
    const cards = generate("Use `printf` here :: output\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].containsCode).toBe(true);
  });

  test("collects wiki image and audio links as medias", () => {
    const cards = generate(
      "Look ![[photo.png]] :: Listen ![[voice.mp3]]\n"
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].mediaNames).toContain("photo.png");
    expect(cards[0].mediaNames).toContain("voice.mp3");
  });
});

describe("Parser – spaced repetition cards", () => {
  test("parses single-line spaced card", () => {
    const cards = generate("What is Anki? #card-spaced\n");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
    expect(cards[0].fields["Prompt"]).toContain("What is Anki?");
    expect(cards[0].modelName).toBe("Obsidian-spaced");
  });

  test("collects additional tags on spaced card", () => {
    const cards = generate("Addition #card-spaced #math\n");

    expect(cards[0].tags).toEqual(["math"]);
  });

  test("does not create cards from plain lines", () => {
    const cards = generate("Just an ordinary sentence.\n");
    expect(cards).toHaveLength(0);
  });
});

describe("Parser – cloze cards", () => {
  test("converts ==highlight== to cloze deletion", () => {
    const cards = generate("The ==Sun== is hot\n");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
    expect(cards[0].fields["Text"]).toContain("{{c1::Sun}}");
    expect(cards[0].initialContent).toBe("The ==Sun== is hot");
  });

  test("converts {curly} syntax to cloze deletion", () => {
    const cards = generate("A {dog} barks\n");

    expect(cards[0].fields["Text"]).toContain("{{c1::dog}}");
  });

  test("respects explicit cloze numbering ({2:...})", () => {
    const cards = generate("A {2:dog} and a {1:cat}\n");

    expect(cards[0].fields["Text"]).toContain("{{c2::dog}}");
    expect(cards[0].fields["Text"]).toContain("{{c1::cat}}");
  });

  test("does not create cloze card without cloze markers", () => {
    const cards = generate("Nothing special here\n");
    expect(cards).toHaveLength(0);
  });

  test("shields math from cloze parsing", () => {
    const cards = generate("$$E=mc^2$$ says ==energy==\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Text"]).toContain("{{c1::energy}}");
    expect(cards[0].fields["Text"]).toContain("E=mc^2");
  });
});

describe("Parser – multiline cards with tag", () => {
  test("parses multiline card under flashcards tag", () => {
    const cards = generate("Two plus two\n#card\nFour\n");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Flashcard);
    expect(cards[0].fields["Front"]).toContain("Two plus two");
    expect(cards[0].fields["Back"]).toContain("Four");
    expect(cards[0].reversed).toBe(false);
    expect(cards[0].modelName).toBe("Obsidian-basic");
  });

  test("parses reversed multiline card", () => {
    const cards = generate("Capital city\n#card-reverse\nWarsaw\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe("Obsidian-basic-reversed");
  });

  test("inlines embedded note content into the answer", () => {
    setActiveDocument([
      {
        src: "embedded-note",
        outerHTML: '<div class="internal-embed">EMBEDCONTENTMARKER</div>',
      },
    ]);

    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    jest
      .spyOn((parser as any).htmlConverter, "makeMarkdown")
      .mockReturnValue("EMBEDCONTENTMARKER");

    const cards = parser.generateFlashcards(
      "Front side\n#card\nSee ![[embedded-note]]\n",
      "Test deck",
      "Vault",
      "Note"
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Back"]).toContain("EMBEDCONTENTMARKER");
  });
});

describe("Parser – context aware mode", () => {
  const file = "# Topic\n\n## Subtopic\n\nWhat :: Answer\n";

  test("prepends heading context to the prompt", () => {
    const cards = generate(file, { contextAwareMode: true });
    const front = cards[0].fields["Front"];

    expect(front).toContain("Topic");
    expect(front).toContain("Subtopic");
    expect(front).toContain("What");
  });

  test("omits context when contextAwareMode disabled", () => {
    const cards = generate(file);
    const front = cards[0].fields["Front"];

    expect(front).not.toContain("Topic");
    expect(front).not.toContain("Subtopic");
  });
});

describe("Parser – filtering and ordering", () => {
  test.each([
    ["code block", "```\nHidden :: Card\n```\n"],
    ["math block", "$$\nx :: y\n$$\n"],
    ["math inline", "$x :: y$\n"],
  ])("discards cards fully inside %s", (_name, file) => {
    expect(generate(file)).toHaveLength(0);
  });

  test("sorts generated cards by end offset", () => {
    const cards = generate("First :: one\n\nSecond :: two\n");

    expect(cards).toHaveLength(2);
    expect(cards[0].endOffset).toBeLessThan(cards[1].endOffset);
  });

  test("appends default Anki tag to all cards", () => {
    const cards = generate("Q :: A\n", { defaultAnkiTag: "imported" });

    expect(cards[0].tags).toContain("imported");
  });
});

describe("Parser – public helper methods", () => {
  test("containsCode detects <code> blocks", () => {
    const parser = createParser();

    expect(parser.containsCode(["<code>x = 1</code>"])).toBe(true);
    expect(parser.containsCode(["plain text"])).toBe(false);
  });

  test("getCardsToDelete returns orphan block IDs", () => {
    const parser = createParser();

    expect(parser.getCardsToDelete("text\n\n^1234567890123\n")).toEqual([
      1234567890123,
    ]);
  });

  test("getAnkiIDsBlocks finds all block IDs", () => {
    const parser = createParser();
    const blocks = parser.getAnkiIDsBlocks(
      "a ^1111111111111 b ^2222222222222\n"
    );

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b[1])).toEqual([
      "1111111111111",
      "2222222222222",
    ]);
  });
});

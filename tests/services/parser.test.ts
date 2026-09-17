import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { Flashcard } from "src/entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { Clozecard } from "src/entities/clozecard";
import {
  basicModelName,
  basicReversedModelName,
  spacedModelName,
} from "src/conf/constants";

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

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("Parser - inline cards (Q :: A)", () => {
  test("parses basic inline card with fields, deck and offsets", () => {
    // given
    const question = "What is 2+2?";
    const answer = "4";
    const cardLine = `${question} :: ${answer}`;
    const file = `${cardLine}\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toBeInstanceOf(Inlinecard);
    expect(card.fields["Front"]).toContain(question);
    expect(card.fields["Back"]).toContain(answer);
    expect(card.reversed).toBe(false);
    expect(card.deckName).toBe("Test deck");
    expect(card.initialOffset).toBe(0);
    expect(card.endOffset).toBe(cardLine.length);
    expect(card.inserted).toBe(false);
    expect(card.id).toBe(-1);
  });

  test("parses reversed inline card (:::)", () => {
    // when
    const cards = generate("Capital of France ::: Paris\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("skips lines starting with cards-deck", () => {
    // when
    const cards = generate("cards-deck: Foo :: Bar\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("skips lines starting with tags", () => {
    // when
    const cards = generate("tags: #a :: b\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("collects card tags and converts hierarchy separator", () => {
    // when
    const cards = generate("Q :: A #science/physics #important\n");

    // then
    expect(cards[0].tags).toEqual(["science::physics", "important"]);
  });

  test("merges global tags before card tags", () => {
    // given
    const globalTag = "global1";
    const cardTag = "card-tag";

    // when
    const cards = generate(
      `Q :: A #${cardTag}\n`,
      {},
      [globalTag]
    );

    // then
    expect(cards[0].tags).toEqual([globalTag, cardTag]);
  });

  test("reads inline block ID when inlineID enabled", () => {
    // given
    const blockId = 1234567890123;

    // when
    const cards = generate(
      `Q :: A ^${blockId}\n`,
      { inlineID: true }
    );

    // then
    expect(cards[0].id).toBe(blockId);
    expect(cards[0].inserted).toBe(true);
  });

  test("adds Source field when sourceSupport enabled", () => {
    // given
    const vault = "Vault";
    const note = "Note";
    const settings = createSettings({ sourceSupport: true });
    const parser = new Parser(new Regex(settings), settings);

    // when
    const cards = parser.generateFlashcards(
      "Q :: A\n",
      "Deck",
      vault,
      note
    );

    // then
    expect(cards[0].fields["Source"]).toBe(
      `<a href="obsidian://open?vault=${vault}&file=${note}.md">${note}</a>`
    );
  });

  test("parses card defined in a heading line", () => {
    // given
    const question = "Heading question";

    // when
    const cards = generate(`# ${question} :: answer\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("parses card defined as a list item", () => {
    // given
    const question = "List question";

    // when
    const cards = generate(`- ${question} :: list answer\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("converts markdown to HTML in fields", () => {
    // given
    const boldText = "bold";

    // when
    const cards = generate(`This is **${boldText}** :: answer\n`);

    // then
    expect(cards[0].fields["Front"]).toContain(
      `<p>This is <strong>${boldText}</strong></p>`
    );
  });

  test("detects code in card content", () => {
    // when
    const cards = generate("Use `printf` here :: output\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].containsCode).toBe(true);
  });

  test("collects wiki image and audio links as medias", () => {
    // given
    const image = "photo.png";
    const audio = "voice.mp3";

    // when
    const cards = generate(
      `Look ![[${image}]] :: Listen ![[${audio}]]\n`
    );

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].mediaNames).toContain(image);
    expect(cards[0].mediaNames).toContain(audio);
  });
});

describe("Parser - spaced repetition cards", () => {
  test("parses single-line spaced card", () => {
    // given
    const prompt = "What is Anki?";

    // when
    const cards = generate(`${prompt} #card-spaced\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
    expect(cards[0].fields["Prompt"]).toContain("<p>" + prompt + "</p>");
    expect(cards[0].modelName).toBe(spacedModelName);
  });

  test("collects additional tags on spaced card", () => {
    // when
    const cards = generate("Addition #card-spaced #math\n");

    // then
    expect(cards[0].tags).toEqual(["math"]);
  });

  test("does not create cards from plain lines", () => {
    // when
    const cards = generate("Just an ordinary sentence.\n");

    // then
    expect(cards).toHaveLength(0);
  });
});

describe("Parser - cloze cards", () => {
  test("converts ==highlight== to cloze deletion", () => {
    // given
    const word = "Sun";
    const line = `The ==${word}== is hot`;

    // when
    const cards = generate(`${line}\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
    expect(cards[0].fields["Text"]).toContain(`<p>The {{c1::${word}}} is hot</p>`);
    expect(cards[0].initialContent).toBe(line);
  });

  test("converts {curly} syntax to cloze deletion", () => {
    // given
    const word = "dog";

    // when
    const cards = generate(`A {${word}} barks\n`);

    // then
    expect(cards[0].fields["Text"]).toContain(`<p>A {{c1::${word}}} barks</p>`);
  });

  test("respects explicit cloze numbering ({2:...})", () => {
    // given
    const secondWord = "dog";
    const firstWord = "cat";

    // when
    const cards = generate(
      `A {2:${secondWord}} and a {1:${firstWord}}\n`
    );

    // then
    expect(cards[0].fields["Text"]).toContain(`{{c2::${secondWord}}}`);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${firstWord}}}`);
  });

  test("does not create cloze card without cloze markers", () => {
    // when
    const cards = generate("Nothing special here\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("shields math from cloze parsing", () => {
    // given
    const math = "E=mc^2";
    const word = "energy";

    // when
    const cards = generate(`$${math}$ says ==${word}==\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${word}}}`);
    expect(cards[0].fields["Text"]).toContain(math);
  });
});

describe("Parser - multiline cards with tag", () => {
  test("parses multiline card under flashcards tag", () => {
    // given
    const question = "Two plus two";
    const answer = "Four";

    // when
    const cards = generate(`${question}\n#card\n${answer}\n`);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Flashcard);
    expect(cards[0].fields["Front"]).toContain(question);
    expect(cards[0].fields["Back"]).toContain(answer);
    expect(cards[0].reversed).toBe(false);
    expect(cards[0].modelName).toBe(basicModelName);
  });

  test("parses reversed multiline card", () => {
    // when
    const cards = generate("Capital city\n#card-reverse\nWarsaw\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("inlines embedded note content into the answer", () => {
    // given
    const embedMarker = "EMBEDCONTENTMARKER";
    const embedSrc = "embedded-note";

    setActiveDocument([
      {
        src: embedSrc,
        outerHTML: `<div class="internal-embed">${embedMarker}</div>`,
      },
    ]);

    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    jest
      .spyOn(
        (parser as unknown as { htmlConverter: { makeMarkdown: (html: string) => string } })
          .htmlConverter,
        "makeMarkdown"
      )
      .mockReturnValue(embedMarker);

    // when
    const cards = parser.generateFlashcards(
      `Front side\n#card\nSee ![[${embedSrc}]]\n`,
      "Test deck",
      "Vault",
      "Note"
    );

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Back"]).toContain(`<p>See !<a href="obsidian://open?vault=Vault&file=embedded-note.md">${embedSrc}</a>${embedMarker}</p>`);
  });
});

describe("Parser - context aware mode", () => {
  const topic = "Topic";
  const subtopic = "Subtopic";
  const question = "What";
  const file = `# ${topic}\n\n## ${subtopic}\n\n${question} :: Answer\n`;

  test("prepends heading context to the prompt", () => {
    // when
    const cards = generate(file, { contextAwareMode: true });
    const front = htmlToPlainText(cards[0].fields["Front"]);

    // then
    expect(front).toContain("&gt;");
    expect(front).toContain(topic);
    expect(front).toContain(subtopic);
    expect(front).toContain(question);
    expect(front.match(/&gt;/g)).toHaveLength(2);
  });

  test("omits context when contextAwareMode disabled", () => {
    // when
    const cards = generate(file);
    const front = htmlToPlainText(cards[0].fields["Front"]);

    // then
    expect(front).not.toContain("&gt;");
    expect(front).not.toContain(topic);
    expect(front).not.toContain(subtopic);
  });

  test("collects all heading levels from deeply nested notes", () => {
    // given
    const deepTopics = [
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
    ];
    const deepFile =
      deepTopics
        .map((name, i) => `${"#".repeat(i + 1)} ${name}`)
        .join("\n\n") + `\n\n${question} :: Answer\n`;

    // when
    const cards = generate(deepFile, { contextAwareMode: true });
    const front = htmlToPlainText(cards[0].fields["Front"]);

    // then
    expect(cards).toHaveLength(1);
    expect(front.match(/&gt;/g)).toHaveLength(deepTopics.length);
    for (const name of deepTopics) {
      expect(front).toContain(name);
    }
    expect(front).toContain(question);
  });
});

describe("Parser - filtering and ordering", () => {
  test.each([
    ["code block", "```\nHidden :: Card\n```\n"],
    ["math block", "$$\nx :: y\n$$\n"],
    ["math inline", "$x :: y$\n"],
  ])("discards cards fully inside %s", (_name, file) => {
    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(0);
  });

  test("sorts generated cards by end offset", () => {
    // when
    const cards = generate("First :: one\n\nSecond :: two\n");

    // then
    expect(cards).toHaveLength(2);
    expect(cards[0].endOffset).toBeLessThan(cards[1].endOffset);
  });

  test("appends default Anki tag to all cards", () => {
    // given
    const defaultTag = "imported";

    // when
    const cards = generate("Q :: A\n", { defaultAnkiTag: defaultTag });

    // then
    expect(cards[0].tags).toContain(defaultTag);
  });
});

describe("Parser - public helper methods", () => {
  test("containsCode detects <code> blocks", () => {
    // given
    const parser = createParser();

    // when
    const codeDetected = parser.containsCode(["<code>x = 1</code>"]);
    const plainDetected = parser.containsCode(["plain text"]);

    // then
    expect(codeDetected).toBe(true);
    expect(plainDetected).toBe(false);
  });

  test("getCardsToDelete returns orphan block IDs", () => {
    // given
    const parser = createParser();
    const blockId = 1234567890123;

    // when
    const orphanIds = parser.getCardsToDelete(`text\n\n^${blockId}\n`);

    // then
    expect(orphanIds).toEqual([
      blockId,
    ]);
  });

  test("getAnkiIDsBlocks finds all block IDs", () => {
    // given
    const parser = createParser();
    const firstId = "1111111111111";
    const secondId = "2222222222222";

    // when
    const blocks = parser.getAnkiIDsBlocks(
      `a ^${firstId} b ^${secondId}\n`
    );

    // then
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b[1])).toEqual([firstId, secondId]);
  });
});

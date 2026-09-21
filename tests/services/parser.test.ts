import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { Flashcard } from "src/entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { Clozecard } from "src/entities/clozecard";
import { Yamlcard } from "src/entities/yamlcard";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";
import {
  basicModelName,
  basicReversedModelName,
  spacedModelName,
} from "src/conf/constants";

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

function createParser(overrides: Partial<ISettings> = {}): Parser {
  const settings = createSettings(overrides);
  return new Parser(new Regex(settings), settings, jsonEngine);
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
  test("given a basic inline line when parsed then returns one card with fields deck and offsets", () => {
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

  test("given an inline line with ::: when parsed then returns a reversed card", () => {
    // when
    const cards = generate("Capital of France ::: Paris\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("given a cards-deck directive line when parsed then returns no cards", () => {
    // when
    const cards = generate("cards-deck: Foo :: Bar\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("given a tags directive line when parsed then returns no cards", () => {
    // when
    const cards = generate("tags: #a :: b\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("given inline card tags when parsed then converts the hierarchy separator", () => {
    // when
    const cards = generate("Q :: A #science/physics #important\n");

    // then
    expect(cards[0].tags).toEqual(["science::physics", "important"]);
  });

  test("given global and card tags when parsed then merges globals first", () => {
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

  test("given inlineID enabled when a block id follows then assigns the id and marks inserted", () => {
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

  test("given sourceSupport enabled when parsed then adds the Source field", () => {
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

  test("given a card in a heading line when parsed then returns it", () => {
    // given
    const question = "Heading question";
    const file = `# ${question} :: answer\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("given a card as a list item when parsed then returns it", () => {
    // given
    const question = "List question";
    const file = `- ${question} :: list answer\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("given markdown in fields when parsed then converts it to HTML", () => {
    // given
    const boldText = "bold";
    const file = `This is **${boldText}** :: answer\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards[0].fields["Front"]).toContain(
      `<p>This is <strong>${boldText}</strong></p>`
    );
  });

  test("given code in content when parsed then flags containsCode", () => {
    // when
    const cards = generate("Use `printf` here :: output\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].containsCode).toBe(true);
  });

  test("given wiki media links when parsed then collects media names", () => {
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
  test("given a spaced line when parsed then returns a spaced card", () => {
    // given
    const prompt = "What is Anki?";
    const file = `${prompt} #card-spaced\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
    expect(cards[0].fields["Prompt"]).toContain("<p>" + prompt + "</p>");
    expect(cards[0].modelName).toBe(spacedModelName);
  });

  test("given extra tags on a spaced line when parsed then collects them", () => {
    // when
    const cards = generate("Addition #card-spaced #math\n");

    // then
    expect(cards[0].tags).toEqual(["math"]);
  });

  test("given a plain line when parsed then returns no cards", () => {
    // when
    const cards = generate("Just an ordinary sentence.\n");

    // then
    expect(cards).toHaveLength(0);
  });
});

describe("Parser - cloze cards", () => {
  test("given highlight markers when parsed then converts them to cloze deletion", () => {
    // given
    const word = "Sun";
    const line = `The ==${word}== is hot`;
    const file = `${line}\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
    expect(cards[0].fields["Text"]).toContain(`<p>The {{c1::${word}}} is hot</p>`);
    expect(cards[0].initialContent).toBe(line);
  });

  test("given curly markers when parsed then converts them to cloze deletion", () => {
    // given
    const word = "dog";
    const file = `A {${word}} barks\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards[0].fields["Text"]).toContain(`<p>A {{c1::${word}}} barks</p>`);
  });

  test("given explicit cloze numbers when parsed then keeps the numbering", () => {
    // given
    const secondWord = "dog";
    const firstWord = "cat";
    const file = `A {2:${secondWord}} and a {1:${firstWord}}\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards[0].fields["Text"]).toContain(`{{c2::${secondWord}}}`);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${firstWord}}}`);
  });

  test("given a line without markers when parsed then returns no cloze cards", () => {
    // when
    const cards = generate("Nothing special here\n");

    // then
    expect(cards).toHaveLength(0);
  });

  test("given math beside a cloze marker when parsed then shields the math", () => {
    // given
    const math = "E=mc^2";
    const word = "energy";
    const file = `$${math}$ says ==${word}==\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${word}}}`);
    expect(cards[0].fields["Text"]).toContain(math);
  });
});

describe("Parser - multiline cards with tag", () => {
  test("given a multiline block when parsed then returns one card", () => {
    // given
    const question = "Two plus two";
    const answer = "Four";
    const file = `${question}\n#card\n${answer}\n`;

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Flashcard);
    expect(cards[0].fields["Front"]).toContain(question);
    expect(cards[0].fields["Back"]).toContain(answer);
    expect(cards[0].reversed).toBe(false);
    expect(cards[0].modelName).toBe(basicModelName);
  });

  test("given a reverse tag when parsed then returns a reversed card", () => {
    // when
    const cards = generate("Capital city\n#card-reverse\nWarsaw\n");

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("given an embedded note when parsed then inlines its content into the answer", () => {
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

describe("Parser - yaml flashcard-form blocks", () => {
  test("given a form block without id when parsed then returns an uninserted yaml card", () => {
    // given
    const file = '```flashcard-form\n{"front": "Q", "back": "A", "tags": "math"}\n```\n';

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Yamlcard);
    expect(cards[0].fields["Front"]).toContain("Q");
    expect(cards[0].fields["Back"]).toContain("A");
    expect(cards[0].tags).toEqual(["math"]);
    expect(cards[0].id).toBe(-1);
    expect(cards[0].inserted).toBe(false);
  });

  test("given a form block with id when parsed then returns an inserted yaml card", () => {
    // given
    const file =
      '```flashcard-form\n{"front": "Q", "back": "A", "tags": "", "id": 101}\n```\n';

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Yamlcard);
    expect(cards[0].id).toBe(101);
    expect(cards[0].inserted).toBe(true);
  });

  test("given an invalid form block when parsed then skips it", () => {
    // given
    const file = "```flashcard-form\nnot json{{{\n```\nQ :: A\n";

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toBeInstanceOf(Yamlcard);
  });

  test("given a cloze form block when parsed then restores anki markers as html", () => {
    // given
    const file =
      '```flashcard-form\n{"front": "Stolica to ==Paryż==", "back": "", "tags": "", "model": "Obsidian-cloze"}\n```\n';

    // when
    const cards = generate(file);

    // then
    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Yamlcard);
    expect(cards[0].fields["Text"]).toContain("{{c1::Paryż}}");
  });
});

describe("Parser - context aware mode", () => {
  const topic = "Topic";
  const subtopic = "Subtopic";
  const question = "What";
  const file = `# ${topic}\n\n## ${subtopic}\n\n${question} :: Answer\n`;

  test("given contextAwareMode when parsed then prepends heading context", () => {
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

  test("given disabled contextAwareMode when parsed then omits context", () => {
    // when
    const cards = generate(file);
    const front = htmlToPlainText(cards[0].fields["Front"]);

    // then
    expect(front).not.toContain("&gt;");
    expect(front).not.toContain(topic);
    expect(front).not.toContain(subtopic);
  });

  test("given deeply nested headings when parsed then collects every level", () => {
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

  test("given two cards when parsed then sorts them by end offset", () => {
    // when
    const cards = generate("First :: one\n\nSecond :: two\n");

    // then
    expect(cards).toHaveLength(2);
    expect(cards[0].endOffset).toBeLessThan(cards[1].endOffset);
  });

  test("given a default Anki tag when parsed then appends it to all cards", () => {
    // given
    const defaultTag = "imported";

    // when
    const cards = generate("Q :: A\n", { defaultAnkiTag: defaultTag });

    // then
    expect(cards[0].tags).toContain(defaultTag);
  });
});

describe("Parser - public helper methods", () => {
  test("given code and plain strings when checked then detects only code blocks", () => {
    // given
    const parser = createParser();
    const codeSnippet = "<code>x = 1</code>";
    const plainSnippet = "plain text";

    // when
    const codeDetected = parser.containsCode([codeSnippet]);
    const plainDetected = parser.containsCode([plainSnippet]);

    // then
    expect(codeDetected).toBe(true);
    expect(plainDetected).toBe(false);
  });

  test("given an orphan block id when scanned then returns it", () => {
    // given
    const parser = createParser();
    const blockId = 1234567890123;
    const file = `text\n\n^${blockId}\n`;

    // when
    const orphanIds = parser.getCardsToDelete(file);

    // then
    expect(orphanIds).toEqual([
      blockId,
    ]);
  });

  test("given two block ids when scanned then finds both", () => {
    // given
    const parser = createParser();
    const firstId = "1111111111111";
    const secondId = "2222222222222";
    const file = `a ^${firstId} b ^${secondId}\n`;

    // when
    const blocks = parser.getAnkiIDsBlocks(file);

    // then
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b[1])).toEqual([firstId, secondId]);
  });
});

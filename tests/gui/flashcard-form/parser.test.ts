import {
  parseFlashcardForm,
  serializeFlashcardForm,
} from "src/gui/flashcard-form/parser";
import type { FlashcardFormData } from "src/gui/flashcard-form/types";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

describe("parseFlashcardForm", () => {
  test("given all fields when parsed then returns each value", async () => {
    // given
    const source = '{"front": "What is 2+2?", "back": "4", "tags": "math", "id": 123}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "4",
      extra: {},
      front: "What is 2+2?",
      id: 123,
      tags: "math",
    });
  });

  test("given multiline values when parsed then keeps the newlines", async () => {
    // given
    const source = '{"front": "First line\\nSecond line", "back": "Answer"}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("First line\nSecond line");
    expect(parsed.back).toBe("Answer");
  });

  test("given missing keys when parsed then defaults to empty values", async () => {
    // given
    const source = '{"front": "Only front"}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "",
      extra: {},
      front: "Only front",
      id: undefined,
      tags: "",
    });
  });

  test("given a non-numeric id when parsed then leaves id undefined", async () => {
    // given
    const source = '{"front": "Q", "id": "soon"}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed.id).toBeUndefined();
  });

  test("given capitalized keys when parsed then reads them anyway", async () => {
    // given
    const source = '{"Front": "Q", "Back": "A"}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("Q");
    expect(parsed.back).toBe("A");
  });

  test("given unknown keys when parsed then keeps them as extra", async () => {
    // given
    const source = '{"front": "Q", "deck": "Languages"}';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("Q");
    expect(parsed.extra).toEqual({ deck: "Languages" });
  });

  test("given a non-object document when parsed then defaults everything", async () => {
    // given
    const source = '"just a string"';

    // when
    const parsed = parseFlashcardForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "",
      extra: {},
      front: "",
      id: undefined,
      tags: "",
    });
  });
});

describe("serializeFlashcardForm", () => {
  test("given full data when serialized then emits known keys with extras", async () => {
    // given
    const data: FlashcardFormData = {
      back: "4",
      extra: { deck: "Languages" },
      front: "What is 2+2?",
      id: 123,
      tags: "math",
    };

    // when
    const serialized = serializeFlashcardForm(data, jsonEngine);

    // then
    expect(JSON.parse(serialized)).toEqual({
      back: "4",
      deck: "Languages",
      front: "What is 2+2?",
      id: 123,
      tags: "math",
    });
  });

  test("given no id when serialized then omits the id key", async () => {
    // given
    const data: FlashcardFormData = {
      back: "A",
      extra: {},
      front: "Q",
      id: undefined,
      tags: "",
    };

    // when
    const serialized = serializeFlashcardForm(data, jsonEngine);

    // then
    expect(JSON.parse(serialized)).toEqual({
      back: "A",
      front: "Q",
      tags: "",
    });
  });

  test("given data when serialized then round-trips through the parser", async () => {
    // given
    const data: FlashcardFormData = {
      back: "Line one\nLine two",
      extra: { deck: "Languages" },
      front: "Q",
      id: 7,
      tags: "math",
    };

    // when
    const reparsed = parseFlashcardForm(
      serializeFlashcardForm(data, jsonEngine),
      jsonEngine
    );

    // then
    expect(reparsed).toEqual(data);
  });
});

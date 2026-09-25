import { parseNoteForm, serializeNoteForm } from "src/services/note-parser";
import type { NoteFormData } from "src/entities/note-form-data";
import { jsonEngine } from "../helpers/json-engine";

describe("parseNoteForm", () => {
  test("given all fields when parsed then returns each value", async () => {
    // given
    const source =
      '{"front": "What is 2+2?", "back": "4", "tags": "math", "id": 123}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "4",
      extra: {},
      front: "What is 2+2?",
      id: 123,
      model: "Basic",
      tags: "math",
    });
  });

  test("given multiline values when parsed then keeps the newlines", async () => {
    // given
    const source = '{"front": "First line\\nSecond line", "back": "Answer"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("First line\nSecond line");
    expect(parsed.back).toBe("Answer");
  });

  test("given missing keys when parsed then defaults to empty values", async () => {
    // given
    const source = '{"front": "Only front"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "",
      extra: {},
      front: "Only front",
      id: undefined,
      model: "Basic",
      tags: "",
    });
  });

  test("given a non-numeric id when parsed then leaves id undefined", async () => {
    // given
    const source = '{"front": "Q", "id": "soon"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed.id).toBeUndefined();
  });

  test("given capitalized keys when parsed then reads them anyway", async () => {
    // given
    const source = '{"Front": "Q", "Back": "A"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("Q");
    expect(parsed.back).toBe("A");
  });

  test("given unknown keys when parsed then keeps them as extra", async () => {
    // given
    const source = '{"front": "Q", "deck": "Languages"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed.front).toBe("Q");
    expect(parsed.extra).toEqual({ deck: "Languages" });
  });

  test("given a cloze block when parsed then reads native keys into slots", async () => {
    // given
    const source =
      '{"model": "Cloze", "text": "Paris is {{c1::France}}", "back_extra": "Capital", "tags": "geo", "id": 9}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "Capital",
      extra: {},
      front: "Paris is {{c1::France}}",
      id: 9,
      model: "Cloze",
      tags: "geo",
    });
  });

  test("given a missing model when parsed then defaults to basic", async () => {
    // given
    const source = '{"front": "Q", "back": "A"}';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed.model).toBe("Basic");
  });

  test("given a non-object document when parsed then defaults everything", async () => {
    // given
    const source = '"just a string"';

    // when
    const parsed = parseNoteForm(source, jsonEngine);

    // then
    expect(parsed).toEqual({
      back: "",
      extra: {},
      front: "",
      id: undefined,
      model: "Basic",
      tags: "",
    });
  });
});

describe("serializeNoteForm", () => {
  test("given full data when serialized then emits known keys with extras", async () => {
    // given
    const data: NoteFormData = {
      back: "4",
      extra: { deck: "Languages" },
      front: "What is 2+2?",
      id: 123,
      model: "Basic",
      tags: "math",
    };

    // when
    const serialized = serializeNoteForm(data, jsonEngine);

    // then
    expect(JSON.parse(serialized)).toEqual({
      back: "4",
      deck: "Languages",
      front: "What is 2+2?",
      id: 123,
      model: "Basic",
      tags: "math",
    });
  });

  test("given cloze data when serialized then emits native cloze keys", async () => {
    // given
    const data: NoteFormData = {
      back: "Capital",
      extra: {},
      front: "Paris is {{c1::France}}",
      id: 9,
      model: "Cloze",
      tags: "geo",
    };

    // when
    const serialized = serializeNoteForm(data, jsonEngine);

    // then
    expect(JSON.parse(serialized)).toEqual({
      back_extra: "Capital",
      id: 9,
      model: "Cloze",
      tags: "geo",
      text: "Paris is {{c1::France}}",
    });
  });

  test("given no id when serialized then omits the id key", async () => {
    // given
    const data: NoteFormData = {
      back: "A",
      extra: {},
      front: "Q",
      id: undefined,
      model: "Basic",
      tags: "",
    };

    // when
    const serialized = serializeNoteForm(data, jsonEngine);

    // then
    expect(JSON.parse(serialized)).toEqual({
      back: "A",
      front: "Q",
      model: "Basic",
      tags: "",
    });
  });

  test("given data when serialized then round-trips through the parser", async () => {
    // given
    const data: NoteFormData = {
      back: "Line one\nLine two",
      extra: { deck: "Languages" },
      front: "Q",
      id: 7,
      model: "Basic",
      tags: "math",
    };

    // when
    const reparsed = parseNoteForm(
      serializeNoteForm(data, jsonEngine),
      jsonEngine,
    );

    // then
    expect(reparsed).toEqual(data);
  });

  test("given cloze data when serialized then round-trips through the parser", async () => {
    // given
    const data: NoteFormData = {
      back: "Capital",
      extra: {},
      front: "Paris is {{c1::France}}",
      id: 9,
      model: "Cloze",
      tags: "geo",
    };

    // when
    const reparsed = parseNoteForm(
      serializeNoteForm(data, jsonEngine),
      jsonEngine,
    );

    // then
    expect(reparsed).toEqual(data);
  });
});

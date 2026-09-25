import { AnkiNote, noteFieldsMatch } from "src/entities/anki-note";
import { BasicNote } from "src/entities/basic-note";
import { ClozeNote } from "src/entities/cloze-note";
import { CustomMappedNote } from "src/entities/custom-mapped-note";
import type { AnkiNoteInfo } from "src/entities/anki-note";

function basicFields(): Record<string, string> {
  return { Front: "Q", Back: "A" };
}

function basicNote(): BasicNote {
  return new BasicNote(5, "Deck", basicFields(), false, ["tag"]);
}

function ankiNoteInfo(overrides: Partial<AnkiNoteInfo> = {}): AnkiNoteInfo {
  return {
    cards: [7],
    fields: { Back: { value: "A" }, Front: { value: "Q" } },
    noteId: 5,
    tags: ["tag"],
    ...overrides,
  };
}

describe("BasicNote", () => {
  test("given a forward note when built then uses the basic model", () => {
    // when
    const payload = basicNote().toPayload(false);

    // then
    expect(payload).toEqual({
      deckName: "Deck",
      fields: basicFields(),
      modelName: "Basic",
      tags: ["tag"],
    });
  });

  test("given a reversed note when built then uses the reversed model", () => {
    // given
    const note = new BasicNote(5, "Deck", basicFields(), true);

    // when
    const payload = note.toPayload(false);

    // then
    expect(payload.modelName).toBe("Basic (and reversed card)");
  });

  test("given an update when built then includes the note id", () => {
    // when
    const payload = basicNote().toPayload(true);

    // then
    expect(payload.id).toBe(5);
  });

  test("given stored media when read then returns filename pairs", () => {
    // given
    const note: AnkiNote = basicNote();
    note.mediaNames = ["a.png"];
    note.mediaBase64Encoded = ["ZGF0YQ=="];

    // when
    const medias = note.getMedias();

    // then
    expect(medias).toEqual([{ data: "ZGF0YQ==", filename: "a.png" }]);
  });
});

describe("ClozeNote", () => {
  test("given a cloze note when built then uses the cloze model", () => {
    // given
    const note = new ClozeNote(6, "Deck", { Text: "t", Extra: "e" }, false);

    // when
    const payload = note.toPayload(false);

    // then
    expect(payload.modelName).toBe("Cloze");
    expect(payload.fields).toEqual({ Text: "t", Extra: "e" });
  });
});

describe("CustomMappedNote", () => {
  test("given a custom model name when built then keeps it", () => {
    // given
    const note = new CustomMappedNote(
      7,
      "Deck",
      { Question: "Q" },
      false,
      [],
      [],
      "My Model",
    );

    // when
    const payload = note.toPayload(false);

    // then
    expect(payload.modelName).toBe("My Model");
  });
});

describe("getFormTemplate", () => {
  test("given a basic note when resolved then returns the basic shape", () => {
    // when
    const template = basicNote().getFormTemplate();

    // then
    expect(template.layout).toBe("basic");
    expect(template.primaryKey).toBe("front");
  });

  test("given a cloze note when resolved then returns the cloze shape", () => {
    // given
    const note = new ClozeNote(6, "Deck", { Text: "t" }, false);

    // when
    const template = note.getFormTemplate();

    // then
    expect(template.layout).toBe("cloze");
    expect(template.primaryKey).toBe("text");
  });

  test("given a custom note when resolved then keeps its model with basic keys", () => {
    // given
    const note = new CustomMappedNote(7, "Deck", {}, false, [], [], "My Model");

    // when
    const template = note.getFormTemplate();

    // then
    expect(template.layout).toBe("basic");
    expect(template.model).toBe("My Model");
  });
});

describe("noteFieldsMatch", () => {
  test("given equal fields and tags when matched then returns true", () => {
    // when
    const matched = noteFieldsMatch(basicNote(), ankiNoteInfo());

    // then
    expect(matched).toBe(true);
  });

  test("given a changed field when matched then returns false", () => {
    // when
    const matched = noteFieldsMatch(
      basicNote(),
      ankiNoteInfo({ fields: { Back: { value: "B" }, Front: { value: "Q" } } }),
    );

    // then
    expect(matched).toBe(false);
  });

  test("given changed tags when matched then returns false", () => {
    // when
    const matched = noteFieldsMatch(
      basicNote(),
      ankiNoteInfo({ tags: ["other"] }),
    );

    // then
    expect(matched).toBe(false);
  });

  test("given a model switch when matched then returns true", () => {
    // given
    const note = basicNote();
    note.fields = { Only: "x" };

    // when
    const matched = noteFieldsMatch(
      note,
      ankiNoteInfo({
        fields: {
          Front: { value: "Q" },
          Back: { value: "A" },
          Third: { value: "T" },
        },
      }),
    );

    // then
    expect(matched).toBe(true);
  });
});

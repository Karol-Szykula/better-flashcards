import type { AnkiNoteInfo } from "src/entities/card";
import { matchFlashcardForm } from "src/gui/flashcard-form/matcher";

function ankiNote(noteId: number): AnkiNoteInfo {
  return {
    cards: [7],
    fields: {},
    modelName: "Basic",
    noteId,
    tags: [],
  };
}

describe("matchFlashcardForm", () => {
  test("given a form id matching a note when matched then matches by id", async () => {
    // given
    const notes = [ankiNote(111), ankiNote(222)];
    const hashes = { 111: "aaa", 222: "bbb" };

    // when
    const match = matchFlashcardForm(111, "zzz", notes, hashes);

    // then
    expect(match).toEqual({ kind: "id", noteId: 111 });
  });

  test("given no id but a known hash when matched then matches by hash", async () => {
    // given
    const notes = [ankiNote(111), ankiNote(222)];
    const hashes = { 111: "aaa", 222: "bbb" };

    // when
    const match = matchFlashcardForm(undefined, "bbb", notes, hashes);

    // then
    expect(match).toEqual({ kind: "hash", noteId: 222 });
  });

  test("given an id missing from notes but a known hash when matched then matches by hash", async () => {
    // given
    const notes = [ankiNote(222)];
    const hashes = { 222: "bbb" };

    // when
    const match = matchFlashcardForm(999, "bbb", notes, hashes);

    // then
    expect(match).toEqual({ kind: "hash", noteId: 222 });
  });

  test("given unknown id and hash when matched then reports a new note", async () => {
    // given
    const notes = [ankiNote(111)];
    const hashes = { 111: "aaa" };

    // when
    const match = matchFlashcardForm(undefined, "zzz", notes, hashes);

    // then
    expect(match).toEqual({ kind: "new" });
  });

  test("given a hash of a note absent from anki when matched then reports a new note", async () => {
    // given
    const notes = [ankiNote(111)];
    const hashes = { 111: "aaa", 222: "bbb" };

    // when
    const match = matchFlashcardForm(undefined, "bbb", notes, hashes);

    // then
    expect(match).toEqual({ kind: "new" });
  });
});

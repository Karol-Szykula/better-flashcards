import { flashcardContentHash } from "src/gui/flashcard-form/hasher";
import type { FlashcardFormData } from "src/gui/flashcard-form/types";

function formData(overrides: Partial<FlashcardFormData> = {}): FlashcardFormData {
  return {
    back: "4",
    extra: {},
    front: "What is 2+2?",
    id: undefined,
    tags: "math",
    ...overrides,
  };
}

describe("flashcardContentHash", () => {
  test("given identical data when hashed then returns the same hash", async () => {
    // given
    const first = formData();
    const second = formData();

    // when
    const firstHash = flashcardContentHash(first);
    const secondHash = flashcardContentHash(second);

    // then
    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[0-9a-f]+$/);
  });

  test("given changed front when hashed then returns a different hash", async () => {
    // given
    const original = formData();
    const changed = formData({ front: "What is 3+3?" });

    // when
    const originalHash = flashcardContentHash(original);
    const changedHash = flashcardContentHash(changed);

    // then
    expect(changedHash).not.toBe(originalHash);
  });

  test("given changed tags when hashed then returns a different hash", async () => {
    // given
    const original = formData();
    const changed = formData({ tags: "math basics" });

    // when
    const originalHash = flashcardContentHash(original);
    const changedHash = flashcardContentHash(changed);

    // then
    expect(changedHash).not.toBe(originalHash);
  });

  test("given different ids when hashed then ignores the id", async () => {
    // given
    const original = formData({ id: 111 });
    const changed = formData({ id: 222 });

    // when
    const originalHash = flashcardContentHash(original);
    const changedHash = flashcardContentHash(changed);

    // then
    expect(changedHash).toBe(originalHash);
  });
});

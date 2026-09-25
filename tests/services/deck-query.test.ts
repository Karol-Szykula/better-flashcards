import { deckSearchQuery } from "src/services/deck-query";

describe("deckSearchQuery", () => {
  test("given a plain deck name when queried then it is quoted as one literal name", () => {
    // given
    const deckName = "Languages";

    // when
    const query = deckSearchQuery(deckName);

    // then
    expect(query).toBe('deck:"Languages"');
  });

  test("given a deck name with spaces and wildcards when queried then they stay part of the name", () => {
    // given
    const deckName = "Medical *terms*";

    // when
    const query = deckSearchQuery(deckName);

    // then
    expect(query).toBe('deck:"Medical *terms*"');
  });

  test("given a deck name with a quote when queried then the quote is escaped instead of dropped", () => {
    // given
    const deckName = 'Say "hi"';

    // when
    const query = deckSearchQuery(deckName);

    // then
    expect(query).toBe('deck:"Say \\"hi\\""');
  });

  test("given a deck name with a backslash when queried then the backslash is escaped once", () => {
    // given
    const deckName = "back\\slash";

    // when
    const query = deckSearchQuery(deckName);

    // then
    expect(query).toBe('deck:"back\\\\slash"');
  });
});

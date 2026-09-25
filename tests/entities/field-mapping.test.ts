import {
  mergeFieldMappings,
  presetFieldMapping,
  resolveFieldMapping,
} from "src/entities/field-mapping";

describe("presetFieldMapping", () => {
  test("given known and unknown fields when mapped then maps by name and skips the rest", async () => {
    // given
    const fields = ["Front", "Back", "Weird"];

    // when
    const mapping = presetFieldMapping(fields);

    // then
    expect(mapping).toEqual({
      Front: "Front",
      Back: "Back",
      Weird: "Skip",
    });
  });
});

describe("resolveFieldMapping", () => {
  test("given valid saved targets when resolved then merges them over the preset", async () => {
    // given
    const fields = ["Front", "Back"];

    // when
    const mapping = resolveFieldMapping(fields, {
      Back: "Text",
      Front: "Front",
    });

    // then
    expect(mapping).toEqual({ Front: "Front", Back: "Text" });
  });

  test("given off-list saved targets when resolved then drops them", async () => {
    // given
    const fields = ["Front"];

    // when
    const mapping = resolveFieldMapping(fields, { Front: "Nope" });

    // then
    expect(mapping).toEqual({
      Front: "Front",
    });
  });

  test("given no saved mapping when resolved then keeps the preset", async () => {
    // when
    const mapping = resolveFieldMapping(["Front"], undefined);

    // then
    expect(mapping).toEqual({
      Front: "Front",
    });
  });
});

describe("mergeFieldMappings", () => {
  test("given incoming mappings when merged then keeps other models intact", async () => {
    // when
    const merged = mergeFieldMappings(
      { Basic: { Front: "Front" }, Other: { A: "Skip" } },
      { Basic: { Back: "Back" } },
    );

    // then
    expect(merged).toEqual({
      Basic: { Front: "Front", Back: "Back" },
      Other: { A: "Skip" },
    });
  });
});

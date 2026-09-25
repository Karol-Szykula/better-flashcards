/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import {
  collectVaultNoteIndex,
  deckForPath,
  ensureFolderExists,
  extractFileNoteIndex,
} from "src/services/vault";

describe("extractFileNoteIndex", () => {
  const noteFileName = "Note.md";
  const noteId = 1111111111111;

  test("given content with a yaml id when extracted then collects it with the file path", async () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const yamlContent = `\`\`\`note-form\nfront: Q\nid: ${noteId}\n\`\`\`\n`;

    // when
    extractFileNoteIndex(yamlContent, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given content without ids when extracted then collects nothing", async () => {
    // given
    const vaultNoteIndex = new Map<number, string>();

    // when
    extractFileNoteIndex("Q :: A\n", noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map());
  });

  test("given a note-form block with a quoted id when extracted then collects the id", () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const yamlContent = `\`\`\`note-form\nfront: Q\nid: "${noteId}"\n\`\`\`\n`;

    // when
    extractFileNoteIndex(yamlContent, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given a note-form block with a json id key when extracted then collects the id", () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const jsonContent = `\`\`\`note-form\n{\n"front": "Q",\n"id": ${noteId}\n}\n\`\`\`\n`;

    // when
    extractFileNoteIndex(jsonContent, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given a single-line json note-form block when extracted then collects the id", () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const oneLine = `\`\`\`note-form\n{"front":"Q","back":"A","model":"Basic","id":${noteId}}\n\`\`\`\n`;

    // when
    extractFileNoteIndex(oneLine, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given a note-form block whose id line has a trailing comment when extracted then collects the id", () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const commented = `\`\`\`note-form\nfront: Q\nid: ${noteId} # from Anki\n\`\`\`\n`;

    // when
    extractFileNoteIndex(commented, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given an id outside any note-form fence when extracted then ignores it", () => {
    // given
    const vaultNoteIndex = new Map<number, string>();
    const yamlOutsideFence = `id: ${noteId}\nfront: Q\n`;

    // when
    extractFileNoteIndex(yamlOutsideFence, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map());
  });
});

describe("collectVaultNoteIndex", () => {
  const noteFileName = "Note.md";
  const noteId = 1111111111111;
  const nestedNoteFileName = "Nested/Card.md";
  const nestedNoteId = 2222222222222;

  test("given three vault files when scanned then collects ids from yaml blocks", async () => {
    // given
    const app = App.createConfigured__({
      files: {
        [noteFileName]: `\`\`\`note-form\nfront: Q\nid: ${noteId}\n\`\`\`\n`,
        "Other.md": "plain text\n",
        [nestedNoteFileName]: `\`\`\`note-form\nfront: B\nid: ${nestedNoteId}\n\`\`\`\n`,
      },
    });

    // when
    const vaultNoteIndex = await collectVaultNoteIndex(
      app.vault as unknown as ObsidianVault,
    );

    // then
    expect(vaultNoteIndex).toEqual(
      new Map([
        [noteId, noteFileName],
        [nestedNoteId, nestedNoteFileName],
      ]),
    );
  });
});

describe("deckForPath", () => {
  test("given a nested vault path when resolved then uses the folders as a deck", () => {
    // given
    const filePath = "Languages/Russian/verbs-101.md";

    // when
    const deckName = deckForPath(filePath);

    // then
    expect(deckName).toBe("Languages::Russian");
  });

  test("given a file in the vault root when resolved then uses the default deck", () => {
    // given
    const filePath = "verbs-101.md";

    // when
    const deckName = deckForPath(filePath);

    // then
    expect(deckName).toBe("Default");
  });
});

describe("ensureFolderExists", () => {
  test("given a nested path when ensured then creates every level", async () => {
    // given
    const app = App.createConfigured__({ files: {} });

    // when
    await ensureFolderExists(
      app.vault as unknown as ObsidianVault,
      "Languages/attachments",
    );

    // then
    expect(
      app.vault.getAbstractFileByPath("Languages/attachments"),
    ).not.toBeNull();
  });

  test("given an existing folder when ensured then keeps it without errors", async () => {
    // given
    const app = App.createConfigured__({
      files: { "Languages/Note.md": "x\n" },
    });

    // when
    await ensureFolderExists(
      app.vault as unknown as ObsidianVault,
      "Languages",
    );

    // then
    expect(app.vault.getAbstractFileByPath("Languages")).not.toBeNull();
  });

  test("given an empty path when ensured then does nothing", async () => {
    // given
    const app = App.createConfigured__({ files: {} });

    // when
    await ensureFolderExists(app.vault as unknown as ObsidianVault, "");

    // then
    expect(app.vault.getAbstractFileByPath("")).toBeNull();
  });
});

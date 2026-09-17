/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { createSettings } from "../helpers/settings";
import {
  collectVaultNoteIndex,
  extractFileNoteIndex,
} from "src/services/vault";

describe("extractFileNoteIndex", () => {
  const noteFileName = "Note.md";
  const noteId = 1111111111111;
  const noteContent = `Q :: A\n^${noteId}\n`;
  const cardOnlyContent = "Q :: A\n";

  test("given content with a block id when extracted then collects it with the file path", async () => {
    // given
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    const vaultNoteIndex = new Map<number, string>();

    // when
    extractFileNoteIndex(parser, noteContent, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex).toEqual(new Map([[noteId, noteFileName]]));
  });

  test("given content without block ids when extracted then collects nothing", async () => {
    // given
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    const vaultNoteIndex = new Map<number, string>();

    // when
    extractFileNoteIndex(parser, cardOnlyContent, noteFileName, vaultNoteIndex);

    // then
    expect(vaultNoteIndex.size).toBe(0);
  });
});

describe("collectVaultNoteIndex", () => {
  const noteFileName = "Note.md";
  const noteId = 1111111111111;
  const nestedNoteFileName = "Nested/Card.md";
  const nestedNoteId = 2222222222222;

  test("given three vault files when scanned then collects ids from the two with cards", async () => {
    // given
    const app = App.createConfigured__({
      files: {
        [noteFileName]: `Q :: A\n^${noteId}\n`,
        "Other.md": "plain text\n",
        [nestedNoteFileName]: `Q :: B\n^${nestedNoteId}\n`,
      },
    });

    // when
    const vaultNoteIndex = await collectVaultNoteIndex(
      app.vault as unknown as ObsidianVault,
      createSettings()
    );

    // then
    expect(vaultNoteIndex).toEqual(
      new Map([
        [noteId, noteFileName],
        [nestedNoteId, nestedNoteFileName],
      ])
    );
  });
});

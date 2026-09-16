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
  test("collects block ids with file paths", async () => {
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    const vaultNoteIndex = new Map<number, string>();
    extractFileNoteIndex(
      parser,
      "Q :: A\n^1111111111111\n",
      "Note.md",
      vaultNoteIndex
    );
    expect(vaultNoteIndex).toEqual(new Map([[1111111111111, "Note.md"]]));
  });

  test("ignores content without block ids", async () => {
    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    const vaultNoteIndex = new Map<number, string>();
    extractFileNoteIndex(parser, "Q :: A\n", "Note.md", vaultNoteIndex);
    expect(vaultNoteIndex.size).toBe(0);
  });
});

describe("collectVaultNoteIndex", () => {
  test("scans every markdown file in the vault", async () => {
    const app = App.createConfigured__({
      files: {
        "Note.md": "Q :: A\n^1111111111111\n",
        "Other.md": "plain text\n",
        "Nested/Card.md": "Q :: B\n^2222222222222\n",
      },
    });

    const vaultNoteIndex = await collectVaultNoteIndex(
      app.vault as unknown as ObsidianVault,
      createSettings()
    );

    expect(vaultNoteIndex).toEqual(
      new Map([
        [1111111111111, "Note.md"],
        [2222222222222, "Nested/Card.md"],
      ])
    );
  });
});

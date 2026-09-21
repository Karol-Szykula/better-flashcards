/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals, so this suite runs in jsdom.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type { Vault as ObsidianVault } from "obsidian";
import { waitFor } from "@testing-library/react";
import {
  createFlashcardFormFile,
  flashcardFormBlock,
  flashcardFormTemplate,
  uniqueFlashcardFormPath,
} from "src/gui/flashcard-form/commands";

function mockVault(): ObsidianVault {
  const app = App.createConfigured__({ files: {} });
  return app.vault as unknown as ObsidianVault;
}

describe("flashcardFormTemplate", () => {
  test("given a new form when templated then emits empty editable keys", async () => {
    // given
    const template = 'front: ""\nback: ""\ntags: ""\n';

    // when
    const built = flashcardFormTemplate();

    // then
    expect(built).toBe(template);
    expect(built).not.toContain("id");
  });
});

describe("flashcardFormBlock", () => {
  test("given a template when wrapped then emits a fenced code block", async () => {
    // given
    const template = flashcardFormTemplate();

    // when
    const block = flashcardFormBlock();

    // then
    expect(block).toBe(`\`\`\`flashcard-form\n${template}\`\`\`\n`);
  });
});

describe("uniqueFlashcardFormPath", () => {
  test("given an empty vault when resolved then uses the base name", async () => {
    // given
    const vault = mockVault();

    // when
    const path = uniqueFlashcardFormPath(vault);

    // then
    expect(path).toBe("Flashcard.md");
  });

  test("given taken names when resolved then appends the next counter", async () => {
    // given
    const app = App.createConfigured__({
      files: { "Flashcard.md": "x", "Flashcard 2.md": "x" },
    });
    const vault = app.vault as unknown as ObsidianVault;

    // when
    const path = uniqueFlashcardFormPath(vault);

    // then
    expect(path).toBe("Flashcard 3.md");
  });
});

describe("createFlashcardFormFile", () => {
  test("given an empty vault when created then opens the new file", async () => {
    // given
    const vault = mockVault();
    const openFile = jest.fn();
    const app = {
      vault,
      workspace: { getLeaf: () => ({ openFile }) },
    };

    // when
    await createFlashcardFormFile(
      app as unknown as Parameters<typeof createFlashcardFormFile>[0]
    );

    // then
    await waitFor(() => {
      expect(vault.getAbstractFileByPath("Flashcard.md")).not.toBeNull();
    });
    expect(openFile).toHaveBeenCalledTimes(1);
  });
});

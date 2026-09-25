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
  createNoteFormFile,
  noteFormBlock,
  noteFormTemplate,
  uniqueNoteFormPath,
} from "src/gui/note-form/commands";

function mockVault(): ObsidianVault {
  const app = App.createConfigured__({ files: {} });
  return app.vault as unknown as ObsidianVault;
}

describe("noteFormTemplate", () => {
  test("given a new form when templated then emits empty editable keys", async () => {
    // given
    const template = 'front: ""\nback: ""\nmodel: "Basic"\ntags: ""\n';

    // when
    const built = noteFormTemplate();

    // then
    expect(built).toBe(template);
    expect(built).not.toContain("id");
  });

  test("given the cloze model when templated then emits native cloze keys", async () => {
    // given
    const template = 'text: ""\nback_extra: ""\nmodel: "Cloze"\ntags: ""\n';

    // when
    const built = noteFormTemplate("Cloze");

    // then
    expect(built).toBe(template);
    expect(built).not.toContain("id");
  });
});

describe("noteFormBlock", () => {
  test("given a template when wrapped then emits a fenced code block", async () => {
    // given
    const template = noteFormTemplate();

    // when
    const block = noteFormBlock();

    // then
    expect(block).toBe(`\`\`\`note-form\n${template}\`\`\`\n`);
  });

  test("given the cloze model when wrapped then emits a cloze fenced block", async () => {
    // given
    const template = noteFormTemplate("Cloze");

    // when
    const block = noteFormBlock("Cloze");

    // then
    expect(block).toBe(`\`\`\`note-form\n${template}\`\`\`\n`);
  });
});

describe("uniqueNoteFormPath", () => {
  test("given an empty vault when resolved then uses the base name", async () => {
    // given
    const vault = mockVault();

    // when
    const path = uniqueNoteFormPath(vault);

    // then
    expect(path).toBe("Untitled.md");
  });

  test("given taken names when resolved then appends the next counter", async () => {
    // given
    const app = App.createConfigured__({
      files: { "Untitled.md": "x", "Untitled 1.md": "x" },
    });
    const vault = app.vault as unknown as ObsidianVault;

    // when
    const path = uniqueNoteFormPath(vault);

    // then
    expect(path).toBe("Untitled 2.md");
  });
});

describe("createNoteFormFile", () => {
  test("given an empty vault when created then opens the new file", async () => {
    // given
    const vault = mockVault();
    const openFile = jest.fn();
    const app = {
      vault,
      workspace: { getLeaf: () => ({ openFile }) },
    };

    // when
    await createNoteFormFile(
      app as unknown as Parameters<typeof createNoteFormFile>[0],
    );

    // then
    await waitFor(() => {
      expect(vault.getAbstractFileByPath("Untitled.md")).not.toBeNull();
    });
    expect(openFile).toHaveBeenCalledTimes(1);
  });
});

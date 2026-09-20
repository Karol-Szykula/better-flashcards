/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals, so this suite runs in jsdom.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type {
  MarkdownPostProcessorContext,
  Vault as ObsidianVault,
} from "obsidian";
import type { FlashcardFormData } from "src/gui/flashcard-form/types";
import {
  replaceFlashcardFormSection,
  saveFlashcardFormEdit,
} from "src/gui/flashcard-form/persister";
import type { FlashcardFormSection } from "src/gui/flashcard-form/persister";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";

const notePath = "Note.md";
const headerLine = "# Title";
const blockLines = [
  '{"front": "Q", "back": "A", "tags": "math"}',
];
const footerLine = "After";
const noteContent = [headerLine, ...blockLines, footerLine].join("\n");
const blockSource = blockLines.join("\n");

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

function vaultWithNote(): ObsidianVault {
  const app = App.createConfigured__({ files: { [notePath]: noteContent } });
  return app.vault as unknown as ObsidianVault;
}

function blockSection(): FlashcardFormSection {
  return { lineEnd: 1, lineStart: 1, sourcePath: notePath };
}

function formData(): FlashcardFormData {
  return { back: "B", extra: {}, front: "Q", id: undefined, tags: "math" };
}

async function readNote(vault: ObsidianVault): Promise<string> {
  const file = vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`${notePath} not found in mock vault`);
  }
  return vault.read(file);
}

function sectionContext(
  section: FlashcardFormSection | null
): MarkdownPostProcessorContext {
  return {
    getSectionInfo: () => section,
    sourcePath: notePath,
  } as unknown as MarkdownPostProcessorContext;
}

describe("replaceFlashcardFormSection", () => {
  test("given a section when replaced then swaps only the block lines", async () => {
    // given
    const vault = vaultWithNote();
    const section = blockSection();

    // when
    const replaced = await replaceFlashcardFormSection(
      vault,
      section,
      formData(),
      jsonEngine
    );

    // then
    expect(replaced).toBe(true);
    const content = await readNote(vault);
    expect(content).toBe(
      [
        headerLine,
        '{"front":"Q","back":"B","tags":"math"}',
        footerLine,
      ].join("\n")
    );
  });

  test("given a missing file when replaced then reports failure", async () => {
    // given
    const vault = vaultWithNote();
    const section: FlashcardFormSection = {
      lineEnd: 1,
      lineStart: 0,
      sourcePath: "Missing.md",
    };

    // when
    const replaced = await replaceFlashcardFormSection(
      vault,
      section,
      formData(),
      jsonEngine
    );

    // then
    expect(replaced).toBe(false);
  });
});

describe("saveFlashcardFormEdit", () => {
  test("given an unchanged block when saved then writes and returns the serialized form", async () => {
    // given
    const vault = vaultWithNote();
    const ctx = sectionContext(blockSection());

    // when
    const saved = await saveFlashcardFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      blockSource,
      formData(),
      jsonEngine
    );

    // then
    expect(saved).toBe('{"front":"Q","back":"B","tags":"math"}');
    const content = await readNote(vault);
    expect(content).toContain('"back":"B"');
  });

  test("given a concurrently edited block when saved then keeps the file untouched", async () => {
    // given
    const vault = vaultWithNote();
    const ctx = sectionContext(blockSection());
    const staleSource = "Front: stale";

    // when
    const saved = await saveFlashcardFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      staleSource,
      formData(),
      jsonEngine
    );

    // then
    expect(saved).toBeNull();
    const content = await readNote(vault);
    expect(content).toBe(noteContent);
  });

  test("given no section when saved then reports nothing saved", async () => {
    // given
    const vault = vaultWithNote();
    const ctx = sectionContext(null);

    // when
    const saved = await saveFlashcardFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      blockSource,
      formData(),
      jsonEngine
    );

    // then
    expect(saved).toBeNull();
  });
});

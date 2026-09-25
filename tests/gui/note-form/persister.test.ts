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
import type { NoteFormData } from "src/entities/note-form-data";
import {
  replaceNoteFormSection,
  saveNoteFormEdit,
} from "src/gui/note-form/persister";
import type { NoteFormSection } from "src/gui/note-form/persister";
import { jsonEngine } from "../../helpers/json-engine";

const notePath = "Note.md";
const headerLine = "# Title";
const blockLines = ['{"front": "Q", "back": "A", "tags": "math"}'];
const footerLine = "After";
const noteContent = [headerLine, ...blockLines, footerLine].join("\n");
const blockSource = blockLines.join("\n");

function vaultWithNote(): ObsidianVault {
  const app = App.createConfigured__({ files: { [notePath]: noteContent } });
  return app.vault as unknown as ObsidianVault;
}

function blockSection(): NoteFormSection {
  return { lineEnd: 1, lineStart: 1, sourcePath: notePath };
}

function formData(): NoteFormData {
  return {
    back: "B",
    extra: {},
    front: "Q",
    id: undefined,
    model: "Basic",
    tags: "math",
  };
}

async function readNote(vault: ObsidianVault): Promise<string> {
  const file = vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`${notePath} not found in mock vault`);
  }
  return vault.read(file);
}

function sectionContext(
  section: NoteFormSection | null,
): MarkdownPostProcessorContext {
  return {
    getSectionInfo: () => section,
    sourcePath: notePath,
  } as unknown as MarkdownPostProcessorContext;
}

describe("replaceNoteFormSection", () => {
  test("given a section when replaced then swaps only the block lines", async () => {
    // given
    const vault = vaultWithNote();
    const section = blockSection();

    // when
    const replaced = await replaceNoteFormSection(
      vault,
      section,
      formData(),
      jsonEngine,
    );

    // then
    expect(replaced).toBe(true);
    const content = await readNote(vault);
    expect(content).toBe(
      [
        headerLine,
        '{"front":"Q","back":"B","model":"Basic","tags":"math"}',
        footerLine,
      ].join("\n"),
    );
  });

  test("given a missing file when replaced then reports failure", async () => {
    // given
    const vault = vaultWithNote();
    const section: NoteFormSection = {
      lineEnd: 1,
      lineStart: 0,
      sourcePath: "Missing.md",
    };

    // when
    const replaced = await replaceNoteFormSection(
      vault,
      section,
      formData(),
      jsonEngine,
    );

    // then
    expect(replaced).toBe(false);
  });
});

describe("saveNoteFormEdit", () => {
  test("given an unchanged block when saved then writes and returns the serialized form", async () => {
    // given
    const vault = vaultWithNote();
    const ctx = sectionContext(blockSection());

    // when
    const saved = await saveNoteFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      blockSource,
      formData(),
      jsonEngine,
    );

    // then
    expect(saved).toBe(
      '{"front":"Q","back":"B","model":"Basic","tags":"math"}',
    );
    const content = await readNote(vault);
    expect(content).toContain('"back":"B"');
  });

  test("given a concurrently edited block when saved then keeps the file untouched", async () => {
    // given
    const vault = vaultWithNote();
    const ctx = sectionContext(blockSection());
    const staleSource = "Front: stale";

    // when
    const saved = await saveNoteFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      staleSource,
      formData(),
      jsonEngine,
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
    const saved = await saveNoteFormEdit(
      vault,
      ctx,
      document.createElement("div"),
      blockSource,
      formData(),
      jsonEngine,
    );

    // then
    expect(saved).toBeNull();
  });
});

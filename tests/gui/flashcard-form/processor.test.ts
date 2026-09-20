/**
 * @jest-environment jsdom
 *
 * Processor mounts React into document, so this suite runs in jsdom.
 */
import "obsidian-test-mocks/jest-setup";
import { App, TFile } from "obsidian-test-mocks/obsidian";
import type {
  MarkdownPostProcessorContext,
  Vault as ObsidianVault,
} from "obsidian";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { createFlashcardFormHandler } from "src/gui/flashcard-form/processor";
import type { FlashcardFormChild } from "src/gui/flashcard-form/processor";
import type { YamlEngine } from "src/gui/flashcard-form/yaml";

const notePath = "Note.md";
const noteLines = [
  "# Title",
  "```flashcard-form",
  '{"front": "Q", "back": "A", "tags": "math"}',
  "```",
  "After",
];
const blockSource = '{"front": "Q", "back": "A", "tags": "math"}';

const jsonEngine: YamlEngine = {
  parse: (source) => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

function vaultWithNote(): ObsidianVault {
  const app = App.createConfigured__({
    files: { [notePath]: noteLines.join("\n") },
  });
  return app.vault as unknown as ObsidianVault;
}

function renderContext(children: FlashcardFormChild[]) {
  const ctx = {
    addChild: (child: FlashcardFormChild) => {
      children.push(child);
    },
    getSectionInfo: () => ({ lineEnd: 2, lineStart: 2 }),
    sourcePath: notePath,
  } as unknown as MarkdownPostProcessorContext;
  return ctx;
}

async function readNote(vault: ObsidianVault): Promise<string> {
  const file = vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`${notePath} not found in mock vault`);
  }
  return vault.read(file);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createFlashcardFormHandler", () => {
  test("given a form block when processed then mounts an editable form", async () => {
    // given
    const vault = vaultWithNote();
    const children: FlashcardFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createFlashcardFormHandler(vault, jsonEngine);

    // when
    await handle(blockSource, el, ctx);
    children[0].onload();

    // then
    expect(await screen.findByLabelText("Front")).toHaveValue("Q");
    expect(screen.getByLabelText("Back")).toHaveValue("A");
    expect(screen.getByLabelText("Tags")).toHaveValue("math");
    expect(screen.getByLabelText("ID")).toHaveValue("Auto (on sync)");
  });

  test("given an edited front when blurred then writes the block back to the note", async () => {
    // given
    const vault = vaultWithNote();
    const children: FlashcardFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createFlashcardFormHandler(vault, jsonEngine);
    await handle(blockSource, el, ctx);
    children[0].onload();
    const user = userEvent.setup();

    // when
    const front = await screen.findByLabelText("Front");
    await user.clear(front);
    await user.type(front, "Q2");
    await user.tab();

    // then
    await waitFor(async () => {
      const content = await readNote(vault);
      expect(content).toContain('"front":"Q2"');
    });
    const content = await readNote(vault);
    expect(content).toBe(
      ["# Title", "```flashcard-form", '{"front":"Q2","back":"A","tags":"math"}', "```", "After"].join(
        "\n"
      )
    );
  });

  test("given an invalid block when processed then shows an error instead of the form", async () => {
    // given
    const vault = vaultWithNote();
    const children: FlashcardFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createFlashcardFormHandler(vault, jsonEngine);

    // when
    await handle("not json {{{", el, ctx);

    // then
    expect(
      await screen.findByText("Invalid flashcard-form block")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Front")).not.toBeInTheDocument();
  });
});

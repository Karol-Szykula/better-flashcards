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
import { createNoteFormHandler } from "src/gui/note-form/processor";
import type { NoteFormChild } from "src/gui/note-form/processor";
import { required } from "../../helpers/required";
import { jsonEngine } from "../../helpers/json-engine";

const notePath = "Note.md";
const noteLines = [
  "# Title",
  "```note-form",
  '{"front": "Q", "back": "A", "tags": "math"}',
  "```",
  "After",
];
const blockSource = '{"front": "Q", "back": "A", "tags": "math"}';

function vaultWithNote(): ObsidianVault {
  const app = App.createConfigured__({
    files: { [notePath]: noteLines.join("\n") },
  });
  return app.vault as unknown as ObsidianVault;
}

function renderContext(children: NoteFormChild[]) {
  const ctx = {
    addChild: (child: NoteFormChild) => {
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

describe("createNoteFormHandler", () => {
  test("given a form block when processed then mounts an editable form", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(vault, () => undefined, jsonEngine);

    // when
    await handle(blockSource, el, ctx);
    required(children[0], "child").onload();

    // then
    expect(await screen.findByLabelText("Front")).toHaveValue("Q");
    expect(screen.getByLabelText("Back")).toHaveValue("A");
    expect(screen.getByLabelText("Tags")).toHaveValue("math");
    expect(screen.queryByLabelText("ID")).not.toBeInTheDocument();
  });

  test("given a cloze block when processed then mounts the cloze form", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(vault, () => undefined, jsonEngine);
    const clozeSource =
      '{"model": "Cloze", "text": "Paris is {{c1::France}}", "tags": "geo"}';

    // when
    await handle(clozeSource, el, ctx);
    required(children[0], "child").onload();

    // then
    expect(await screen.findByLabelText("Text")).toHaveValue(
      "Paris is {{c1::France}}",
    );
    expect(screen.queryByLabelText("Front")).not.toBeInTheDocument();
  });

  test("given an edited front when blurred then writes the block back to the note", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(vault, () => undefined, jsonEngine);
    await handle(blockSource, el, ctx);
    required(children[0], "child").onload();
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
      [
        "# Title",
        "```note-form",
        '{"front":"Q2","back":"A","model":"Basic","tags":"math"}',
        "```",
        "After",
      ].join("\n"),
    );
  });

  test("given an invalid block when processed then shows an error instead of the form", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(vault, () => undefined, jsonEngine);

    // when
    await handle("not json {{{", el, ctx);

    // then
    expect(
      await screen.findByText("Invalid note-form block"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Front")).not.toBeInTheDocument();
  });

  test("given a diverged note when processed then shows the conflict banner", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(
      vault,
      () => "synced.diverged",
      jsonEngine,
    );

    // when
    await handle(blockSource, el, ctx);
    required(children[0], "child").onload();

    // then
    expect(await screen.findByText(/newest version wins/)).toBeInTheDocument();
    expect(screen.getByLabelText("Front")).toBeInTheDocument();
  });

  test("given a clean note when processed then shows no banner", async () => {
    // given
    const vault = vaultWithNote();
    const children: NoteFormChild[] = [];
    const ctx = renderContext(children);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const handle = createNoteFormHandler(
      vault,
      () => "synced.clean",
      jsonEngine,
    );

    // when
    await handle(blockSource, el, ctx);
    required(children[0], "child").onload();

    // then
    expect(await screen.findByLabelText("Front")).toBeInTheDocument();
    expect(screen.queryByText(/newest version wins/)).not.toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 *
 * App.createConfigured__ touches DOM globals, so this suite runs in jsdom.
 */
import "obsidian-test-mocks/jest-setup";
import { App } from "obsidian-test-mocks/obsidian";
import type {
  Editor as ObsidianEditor,
  Plugin as ObsidianPlugin,
  Vault as ObsidianVault,
} from "obsidian";
import { waitFor } from "@testing-library/react";
import {
  flashcardFormBlock,
  flashcardFormTemplate,
  registerFlashcardFormCommands,
  uniqueFlashcardFormPath,
} from "src/gui/flashcard-form/commands";

interface RegisteredCommand {
  callback?: () => void;
  editorCallback?: (editor: ObsidianEditor) => void;
  id: string;
  name: string;
}

function registeredCommands(app: unknown): {
  commands: RegisteredCommand[];
  plugin: ObsidianPlugin;
} {
  const commands: RegisteredCommand[] = [];
  const plugin = {
    addCommand: (command: RegisteredCommand) => {
      commands.push(command);
    },
    app,
  } as unknown as ObsidianPlugin;
  registerFlashcardFormCommands(plugin);
  return { commands, plugin };
}

function commandById(
  commands: RegisteredCommand[],
  id: string
): RegisteredCommand {
  const command = commands.find((candidate) => candidate.id === id);
  if (!command) {
    throw new Error(`${id} not registered`);
  }
  return command;
}

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

describe("registerFlashcardFormCommands", () => {
  test("given registration when inserted at cursor then writes the block", async () => {
    // given
    const { commands } = registeredCommands({});
    const replaceSelection = jest.fn();
    const editor = {
      replaceSelection,
    } as unknown as ObsidianEditor;

    // when
    commandById(commands, "insert-flashcard-form").editorCallback?.(editor);

    // then
    expect(replaceSelection).toHaveBeenCalledWith(flashcardFormBlock());
  });

  test("given registration when created as a new note then opens the note", async () => {
    // given
    const vault = mockVault();
    const openFile = jest.fn();
    const app = {
      vault,
      workspace: { getLeaf: () => ({ openFile }) },
    };
    const { commands } = registeredCommands(app);

    // when
    commandById(commands, "new-flashcard-form-note").callback?.();

    // then
    await waitFor(() => {
      expect(vault.getAbstractFileByPath("Flashcard.md")).not.toBeNull();
    });
    expect(openFile).toHaveBeenCalledTimes(1);
  });

  test("given commands when registered then exposes both entries", async () => {
    // given
    const { commands } = registeredCommands({});

    // when
    const ids = commands.map((command) => command.id);

    // then
    expect(ids).toEqual(["insert-flashcard-form", "new-flashcard-form-note"]);
  });
});

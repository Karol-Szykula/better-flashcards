import type { Plugin as ObsidianPlugin } from "obsidian";
import {
  containsFlashcardForm,
  registerFlashcardFormAutoPreview,
} from "src/gui/flashcard-form/auto-preview";

type OpenHandler = (file: unknown) => void;

interface FakePlugin {
  handlers: OpenHandler[];
  plugin: ObsidianPlugin;
  setViewState: jest.Mock;
}

function pluginWithNote(
  content: string | null,
  activePath: string | null,
  mode: string
): FakePlugin {
  const handlers: OpenHandler[] = [];
  const setViewState = jest.fn(async () => undefined);
  const cachedRead = jest.fn(async () => content);
  const plugin = {
    app: {
      vault: { cachedRead },
      workspace: {
        getActiveViewOfType: jest.fn(() =>
          activePath === null
            ? null
            : {
                file: { path: activePath },
                getMode: () => mode,
                leaf: { setViewState },
              }
        ),
        on: jest.fn((name: string, handler: OpenHandler) => {
          if (name === "file-open") {
            handlers.push(handler);
          }
          return {};
        }),
      },
    },
    registerEvent: jest.fn(),
  } as unknown as ObsidianPlugin;
  return { handlers, plugin, setViewState };
}

function noteFile() {
  return { extension: "md", path: "Note.md" };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("containsFlashcardForm", () => {
  test("given a fenced block when checked then detects it", async () => {
    // given
    const content = "# Title\n```flashcard-form\nfront: Q\n```\n";

    // when
    const contains = containsFlashcardForm(content);

    // then
    expect(contains).toBe(true);
  });

  test("given plain text when checked then reports absence", async () => {
    // given
    const content = "# Title\nJust text\n";

    // when
    const contains = containsFlashcardForm(content);

    // then
    expect(contains).toBe(false);
  });
});

describe("registerFlashcardFormAutoPreview", () => {
  test("given a form note opened in source mode when opened then switches to preview", async () => {
    // given
    const content = "```flashcard-form\nfront: Q\n```\n";
    const { handlers, plugin, setViewState } = pluginWithNote(
      content,
      "Note.md",
      "source"
    );
    registerFlashcardFormAutoPreview(plugin);

    // when
    handlers[0](noteFile());
    await flushPromises();

    // then
    expect(setViewState).toHaveBeenCalledTimes(1);
    expect(setViewState).toHaveBeenCalledWith({
      active: true,
      state: { file: "Note.md", mode: "preview", source: false },
      type: "markdown",
    });
  });

  test("given a note without a form when opened then keeps the mode", async () => {
    // given
    const { handlers, plugin, setViewState } = pluginWithNote(
      "Just text\n",
      "Note.md",
      "source"
    );
    registerFlashcardFormAutoPreview(plugin);

    // when
    handlers[0](noteFile());
    await flushPromises();

    // then
    expect(setViewState).not.toHaveBeenCalled();
  });

  test("given a form note already in preview when opened then keeps the mode", async () => {
    // given
    const content = "```flashcard-form\nfront: Q\n```\n";
    const { handlers, plugin, setViewState } = pluginWithNote(
      content,
      "Note.md",
      "preview"
    );
    registerFlashcardFormAutoPreview(plugin);

    // when
    handlers[0](noteFile());
    await flushPromises();

    // then
    expect(setViewState).not.toHaveBeenCalled();
  });

  test("given a non-markdown file when opened then ignores it", async () => {
    // given
    const { handlers, plugin, setViewState } = pluginWithNote(
      "```flashcard-form\nfront: Q\n```\n",
      "Note.md",
      "source"
    );
    registerFlashcardFormAutoPreview(plugin);
    const image = { extension: "png", path: "Image.png" };

    // when
    handlers[0](image);
    await flushPromises();

    // then
    expect(setViewState).not.toHaveBeenCalled();
  });

  test("given no file when opened then ignores it", async () => {
    // given
    const { handlers, plugin, setViewState } = pluginWithNote(
      "```flashcard-form\nfront: Q\n```\n",
      "Note.md",
      "source"
    );
    registerFlashcardFormAutoPreview(plugin);

    // when
    handlers[0](null);
    await flushPromises();

    // then
    expect(setViewState).not.toHaveBeenCalled();
  });
});

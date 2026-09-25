import { MarkdownView } from "obsidian";
import type { Plugin, TFile } from "obsidian";
import { noteFormLanguage } from "src/conf/constants";

const viewSettleAttempts = 10;
const viewSettleDelayMs = 50;

export function containsNoteForm(content: string): boolean {
  return content.includes(`\`\`\`${noteFormLanguage}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findTargetView(
  plugin: Plugin,
  file: TFile,
): Promise<MarkdownView | null> {
  for (let attempt = 0; attempt < viewSettleAttempts; attempt += 1) {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path === file.path) {
      return view;
    }
    await sleep(viewSettleDelayMs);
  }
  return null;
}

async function autoPreviewNoteForm(
  plugin: Plugin,
  file: TFile | null,
): Promise<void> {
  if (!file || file.extension !== "md") {
    return;
  }
  const content = await plugin.app.vault.cachedRead(file);
  if (!containsNoteForm(content)) {
    return;
  }
  const view = await findTargetView(plugin, file);
  if (!view || view.getMode() === "preview") {
    return;
  }
  await view.leaf.setViewState({
    active: true,
    state: { file: file.path, mode: "preview", source: false },
    type: "markdown",
  });
}

export function registerNoteFormAutoPreview(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", (file) => {
      void autoPreviewNoteForm(plugin, file);
    }),
  );
}

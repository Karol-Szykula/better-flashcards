import { MarkdownView } from "obsidian";
import type { Plugin, TFile } from "obsidian";
import { flashcardFormLanguage } from "src/conf/constants";

export function containsFlashcardForm(content: string): boolean {
  return content.includes(`\`\`\`${flashcardFormLanguage}`);
}

async function autoPreviewFlashcardForm(
  plugin: Plugin,
  file: TFile | null
): Promise<void> {
  if (!file || file.extension !== "md") {
    return;
  }
  const content = await plugin.app.vault.cachedRead(file);
  if (!containsFlashcardForm(content)) {
    return;
  }
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== file.path || view.getMode() === "preview") {
    return;
  }
  await view.leaf.setViewState({
    active: true,
    state: { file: file.path, mode: "preview", source: false },
    type: "markdown",
  });
}

export function registerFlashcardFormAutoPreview(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", (file) => {
      void autoPreviewFlashcardForm(plugin, file);
    })
  );
}

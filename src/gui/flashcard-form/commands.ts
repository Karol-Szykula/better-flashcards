import type { App, Vault } from "obsidian";
import { flashcardFormLanguage } from "src/conf/constants";

const newFileBaseName = "Flashcard";

export function flashcardFormTemplate(): string {
  return 'front: ""\nback: ""\ntags: ""\n';
}

export function flashcardFormBlock(): string {
  return `\`\`\`${flashcardFormLanguage}\n${flashcardFormTemplate()}\`\`\`\n`;
}

export function uniqueFlashcardFormPath(
  vault: Vault,
  baseName = newFileBaseName
): string {
  let path = `${baseName}.md`;
  let counter = 1;
  while (vault.getAbstractFileByPath(path)) {
    counter += 1;
    path = `${baseName} ${counter}.md`;
  }
  return path;
}

export async function createFlashcardFormFile(app: App): Promise<void> {
  const path = uniqueFlashcardFormPath(app.vault);
  const file = await app.vault.create(path, flashcardFormBlock());
  await app.workspace.getLeaf().openFile(file);
}

import type { App, Vault } from "obsidian";
import { flashcardFormLanguage } from "src/conf/constants";

const newFileBaseName = "Untitled";

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
  const directPath = `${baseName}.md`;
  if (!vault.getAbstractFileByPath(directPath)) {
    return directPath;
  }
  let counter = 1;
  for (;;) {
    const candidate = `${baseName} ${counter}.md`;
    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export async function createFlashcardFormFile(app: App): Promise<void> {
  const path = uniqueFlashcardFormPath(app.vault);
  const file = await app.vault.create(path, flashcardFormBlock());
  await app.workspace.getLeaf().openFile(file);
}

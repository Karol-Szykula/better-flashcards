import type { App, Editor, Plugin, Vault } from "obsidian";
import { flashcardFormLanguage } from "src/conf/constants";

const newNoteBaseName = "Flashcard";

export function flashcardFormTemplate(): string {
  return 'front: ""\nback: ""\ntags: ""\n';
}

export function flashcardFormBlock(): string {
  return `\`\`\`${flashcardFormLanguage}\n${flashcardFormTemplate()}\`\`\`\n`;
}

export function uniqueFlashcardFormPath(
  vault: Vault,
  baseName = newNoteBaseName
): string {
  let path = `${baseName}.md`;
  let counter = 1;
  while (vault.getAbstractFileByPath(path)) {
    counter += 1;
    path = `${baseName} ${counter}.md`;
  }
  return path;
}

export async function createFlashcardFormNote(app: App): Promise<void> {
  const path = uniqueFlashcardFormPath(app.vault);
  const file = await app.vault.create(path, flashcardFormBlock());
  await app.workspace.getLeaf().openFile(file);
}

function insertFlashcardFormBlock(editor: Editor): void {
  editor.replaceSelection(flashcardFormBlock());
}

export function registerFlashcardFormCommands(plugin: Plugin): void {
  plugin.addCommand({
    editorCallback: insertFlashcardFormBlock,
    id: "insert-flashcard-form",
    name: "Insert flashcard form",
  });
  plugin.addCommand({
    callback: () => {
      void createFlashcardFormNote(plugin.app);
    },
    id: "new-flashcard-form-note",
    name: "New flashcard form note",
  });
}

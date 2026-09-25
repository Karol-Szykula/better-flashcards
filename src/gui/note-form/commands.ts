import type { App, Vault } from "obsidian";
import { basicModelName } from "src/conf/constants";
import { noteFormLanguage } from "src/conf/constants";
import { noteShapeFor } from "src/entities/note-shapes";

const newFileBaseName = "Untitled";

export function noteFormTemplate(model: string = basicModelName): string {
  const shape = noteShapeFor(model);
  return (
    `${shape.primaryKey}: ""\n` +
    `${shape.secondaryKey}: ""\n` +
    `model: "${shape.model}"\n` +
    `tags: ""\n`
  );
}

export function noteFormBlock(model: string = basicModelName): string {
  return `\`\`\`${noteFormLanguage}\n${noteFormTemplate(model)}\`\`\`\n`;
}

export function uniqueNoteFormPath(
  vault: Vault,
  baseName = newFileBaseName,
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

export async function createNoteFormFile(
  app: App,
  model: string = basicModelName,
): Promise<void> {
  const path = uniqueNoteFormPath(app.vault);
  const file = await app.vault.create(path, noteFormBlock(model));
  await app.workspace.getLeaf().openFile(file);
}

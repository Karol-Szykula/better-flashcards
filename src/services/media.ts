import type { Vault } from "obsidian";
import { Anki } from "src/services/anki";
import { escapeRegExp } from "src/utils";
import { ensureFolderExists } from "src/services/vault";

export type MediaPathMap = Record<string, string>;

export function deckAttachmentsFolder(deckName: string): string {
  return `${deckName.split("::").join("/")}/attachments`;
}

export function resolveMediaPath(
  deckName: string,
  filename: string,
  takenPaths: Set<string>
): string {
  const folder = deckAttachmentsFolder(deckName);
  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let candidate = `${folder}/${filename}`;
  let suffix = 0;
  while (takenPaths.has(candidate)) {
    suffix += 1;
    candidate = `${folder}/${stem}-${suffix}${extension}`;
  }
  takenPaths.add(candidate);
  return candidate;
}

export function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function importDeckMedia(
  anki: Anki,
  vault: Vault,
  deckName: string,
  filenames: string[]
): Promise<MediaPathMap> {
  const importedPaths: MediaPathMap = {};
  const takenPaths = new Set<string>();
  await ensureFolderExists(vault, deckAttachmentsFolder(deckName));
  for (const filename of filenames) {
    if (importedPaths[filename]) {
      continue;
    }
    const data = await anki.retrieveMediaFile(filename);
    if (!data) {
      continue;
    }
    let targetPath = resolveMediaPath(deckName, filename, takenPaths);
    while (await vault.getAbstractFileByPath(targetPath)) {
      targetPath = resolveMediaPath(deckName, filename, takenPaths);
    }
    await vault.createBinary(targetPath, decodeBase64(data));
    importedPaths[filename] = targetPath;
  }
  return importedPaths;
}

export function rewriteMediaReferences(
  content: string,
  importedPaths: MediaPathMap
): string {
  let rewritten = content;
  for (const [filename, vaultPath] of Object.entries(importedPaths)) {
    const imagePattern = new RegExp(
      `<img[^>]*src="${escapeRegExp(filename)}"[^>]*>`,
      "g"
    );
    rewritten = rewritten.replace(imagePattern, `![[${vaultPath}]]`);
    rewritten = rewritten
      .split(`[sound:${filename}]`)
      .join(`![[${vaultPath}]]`);
  }
  return rewritten;
}

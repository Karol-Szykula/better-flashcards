import type { Vault } from "obsidian";
import type { Anki } from "src/services/anki";
import { escapeRegExp } from "src/utils";
import { ensureFolderExists } from "src/services/vault";

export type MediaPathMap = Record<string, string>;

export interface DeckMediaResult {
  notImported: string[];
  written: MediaPathMap;
}

const ankiMediaPattern = /<img[^>]*src="([^"]+)"[^>]*>/g;
const ankiSoundPattern = /\[sound:([^\]]+)\]/g;
const externalReferencePattern = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function isAnkiMediaReference(reference: string): boolean {
  return !externalReferencePattern.test(reference);
}

export function mediaFilenamesIn(htmlFields: string[]): string[] {
  const media: string[] = [];
  const combined = htmlFields.join("\n");
  let match: RegExpExecArray | null;
  while ((match = ankiMediaPattern.exec(combined)) !== null) {
    const image = match[1];
    if (
      image !== undefined &&
      isAnkiMediaReference(image) &&
      !media.includes(image)
    ) {
      media.push(image);
    }
  }
  while ((match = ankiSoundPattern.exec(combined)) !== null) {
    const sound = match[1];
    if (sound !== undefined && !media.includes(sound)) {
      media.push(sound);
    }
  }
  return media;
}

export function deckAttachmentsFolder(deckName: string): string {
  return `${deckName.split("::").join("/")}/attachments`;
}

export function resolveMediaPath(
  deckName: string,
  filename: string,
  takenPaths: Set<string>,
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

export function encodeBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function importDeckMedia(
  anki: Anki,
  vault: Vault,
  deckName: string,
  filenames: string[],
): Promise<DeckMediaResult> {
  const notImported: string[] = [];
  const written: MediaPathMap = {};
  const takenPaths = new Set<string>();
  let folderReady = false;
  for (const filename of filenames) {
    if (written[filename]) {
      continue;
    }
    const data = await anki.retrieveMediaFile(filename);
    if (!data) {
      notImported.push(filename);
      continue;
    }
    if (!folderReady) {
      await ensureFolderExists(vault, deckAttachmentsFolder(deckName));
      folderReady = true;
    }
    let targetPath = resolveMediaPath(deckName, filename, takenPaths);
    while (await vault.getAbstractFileByPath(targetPath)) {
      targetPath = resolveMediaPath(deckName, filename, takenPaths);
    }
    await vault.createBinary(targetPath, decodeBase64(data));
    written[filename] = targetPath;
  }
  return { notImported, written };
}

export function rewriteMediaReferences(
  content: string,
  importedPaths: MediaPathMap,
): string {
  let rewritten = content;
  for (const [filename, vaultPath] of Object.entries(importedPaths)) {
    const imagePattern = new RegExp(
      `<img[^>]*src="${escapeRegExp(filename)}"[^>]*>`,
      "g",
    );
    rewritten = rewritten.replace(imagePattern, `![[${vaultPath}]]`);
    rewritten = rewritten
      .split(`[sound:${filename}]`)
      .join(`![[${vaultPath}]]`);
  }
  return rewritten;
}

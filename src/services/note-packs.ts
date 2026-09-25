import type { Vault } from "obsidian";
import { ankiFieldNames } from "src/conf/constants";
import { builtInModels } from "src/services/anki-models";
import { noteShapeFor, type NoteShape } from "src/entities/note-shapes";
import type { FieldMapping } from "src/entities/field-mapping";
import { trimDashes } from "src/utils";

export const notePackVersion = 1;

export interface NotePack {
  formTemplate: NoteShape;
  mapping: FieldMapping;
  modelName: string;
  packVersion: number;
}

const pluginFolderName = "better-flashcards";

interface PackFolderListing {
  files: string[];
  folders: string[];
}

interface PackFileStore {
  exists(path: string): Promise<boolean>;
  listFolder(path: string): Promise<PackFolderListing>;
  makeFolder(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  removeFolder(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
}

function vaultPackStore(vault: Vault): PackFileStore {
  const adapter = vault.adapter as unknown as {
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<PackFolderListing>;
    mkdir(path: string): Promise<void>;
    read(path: string): Promise<string>;
    rmdir(path: string, recursive: boolean): Promise<void>;
    write(path: string, data: string): Promise<void>;
  };
  return {
    exists: (path) => adapter.exists(path),
    listFolder: (path) => adapter.list(path),
    makeFolder: (path) => adapter.mkdir(path),
    readFile: (path) => adapter.read(path),
    removeFolder: (path) => adapter.rmdir(path, true),
    writeFile: (path, content) => adapter.write(path, content),
  };
}

function packsFolder(vault: Vault): string {
  return `${vault.configDir}/plugins/${pluginFolderName}/packs`;
}

function sanitizePackFileName(modelName: string): string {
  const cleaned = trimDashes(modelName.replace(/[^\p{L}\p{N}]+/gu, "-"));
  return `${cleaned || "pack"}.json`;
}

function packPath(vault: Vault, modelName: string): string {
  return `${packsFolder(vault)}/${sanitizePackFileName(modelName)}`;
}

export function builtInPackFor(modelName: string): NotePack | undefined {
  const definition = builtInModels.find(
    (builtIn) => builtIn.modelName === modelName,
  );
  if (!definition) {
    return undefined;
  }
  const mapping: FieldMapping = {};
  for (const field of definition.inOrderFields) {
    if (field === ankiFieldNames.backExtra) {
      mapping[field] = ankiFieldNames.extra;
    } else if (
      field === ankiFieldNames.front ||
      field === ankiFieldNames.back ||
      field === ankiFieldNames.text
    ) {
      mapping[field] = field;
    } else {
      mapping[field] = "Skip";
    }
  }
  return {
    formTemplate: noteShapeFor(modelName),
    mapping,
    modelName,
    packVersion: notePackVersion,
  };
}

function isNotePack(value: unknown): value is NotePack {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record["packVersion"] === notePackVersion &&
    typeof record["modelName"] === "string" &&
    typeof record["mapping"] === "object" &&
    record["mapping"] !== null &&
    typeof record["formTemplate"] === "object" &&
    record["formTemplate"] !== null
  );
}

export async function savePack(vault: Vault, pack: NotePack): Promise<void> {
  const store = vaultPackStore(vault);
  const folder = packsFolder(vault);
  const parts = folder.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (await store.exists(current)) {
      continue;
    }
    await store.makeFolder(current);
  }
  await store.writeFile(
    packPath(vault, pack.modelName),
    JSON.stringify(pack, null, 2),
  );
}

export async function loadPack(
  vault: Vault,
  modelName: string,
): Promise<NotePack | undefined> {
  const store = vaultPackStore(vault);
  const path = packPath(vault, modelName);
  if (!(await store.exists(path))) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(await store.readFile(path));
    if (isNotePack(parsed) && parsed.modelName === modelName) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function deleteAllPacks(vault: Vault): Promise<number> {
  const store = vaultPackStore(vault);
  const folder = packsFolder(vault);
  if (!(await store.exists(folder))) {
    return 0;
  }
  const listing = await store.listFolder(folder);
  await store.removeFolder(folder);
  return listing.files.length + listing.folders.length;
}

export async function packForModel(
  vault: Vault,
  modelName: string,
): Promise<NotePack | undefined> {
  return builtInPackFor(modelName) ?? (await loadPack(vault, modelName));
}

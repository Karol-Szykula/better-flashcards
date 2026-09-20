import type { FlashcardFormData } from "src/gui/flashcard-form/types";
import {
  obsidianYamlEngine,
  type YamlEngine,
} from "src/gui/flashcard-form/yaml";

const knownKeys = ["front", "back", "tags", "id"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loweredEntries(record: Record<string, unknown>): Record<string, unknown> {
  const lowered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    lowered[key.toLowerCase()] = value;
  }
  return lowered;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function toNoteId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractExtra(record: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!knownKeys.includes(key.toLowerCase())) {
      extra[key] = value;
    }
  }
  return extra;
}

export function parseFlashcardForm(
  source: string,
  yaml: YamlEngine = obsidianYamlEngine
): FlashcardFormData {
  const parsed = yaml.parse(source);
  const record = isRecord(parsed) ? parsed : {};
  const lowered = loweredEntries(record);
  return {
    back: toText(lowered["back"]),
    extra: extractExtra(record),
    front: toText(lowered["front"]),
    id: toNoteId(lowered["id"]),
    tags: toText(lowered["tags"]),
  };
}

export function serializeFlashcardForm(
  data: FlashcardFormData,
  yaml: YamlEngine = obsidianYamlEngine
): string {
  const record: Record<string, unknown> = {
    front: data.front,
    back: data.back,
    tags: data.tags,
  };
  if (data.id !== undefined) {
    record["id"] = data.id;
  }
  return yaml.stringify({ ...record, ...data.extra });
}

import { basicModelName } from "src/conf/constants";
import { noteShapeFor } from "src/entities/note-shapes";
import type { NoteFormData } from "src/entities/note-form-data";
import { obsidianYamlEngine, type YamlEngine } from "src/services/yaml-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loweredEntries(
  record: Record<string, unknown>,
): Record<string, unknown> {
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

function extractExtra(
  record: Record<string, unknown>,
  knownKeys: string[],
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!knownKeys.includes(key.toLowerCase())) {
      extra[key] = value;
    }
  }
  return extra;
}

export function parseNoteForm(
  source: string,
  yaml: YamlEngine = obsidianYamlEngine,
): NoteFormData {
  const parsed = yaml.parse(source);
  const record = isRecord(parsed) ? parsed : {};
  const lowered = loweredEntries(record);
  const model = toText(lowered["model"]) || basicModelName;
  const shape = noteShapeFor(model);
  const knownKeys = [
    shape.primaryKey,
    shape.secondaryKey,
    "tags",
    "id",
    "model",
  ];
  return {
    back: toText(lowered[shape.secondaryKey]),
    extra: extractExtra(record, knownKeys),
    front: toText(lowered[shape.primaryKey]),
    id: toNoteId(lowered["id"]),
    model,
    tags: toText(lowered["tags"]),
  };
}

export function serializeNoteForm(
  data: NoteFormData,
  yaml: YamlEngine = obsidianYamlEngine,
): string {
  const shape = noteShapeFor(data.model);
  const record: Record<string, unknown> = {
    [shape.primaryKey]: data.front,
    [shape.secondaryKey]: data.back,
    model: data.model,
    tags: data.tags,
  };
  if (data.id !== undefined) {
    record["id"] = data.id;
  }
  return yaml.stringify({ ...record, ...data.extra });
}

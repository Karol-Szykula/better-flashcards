import type { AnkiNoteInfo } from "src/entities/anki-note";
import type { FieldMapping } from "src/entities/field-mapping";
import { buildYamlNoteFields } from "src/services/import";
import { computeContentHash } from "src/services/yaml-note";
import type { YamlNote } from "src/services/yaml-note";

export async function blockContentHash(block: YamlNote): Promise<string> {
  return computeContentHash(block.front, block.back, block.tags, block.model);
}

export async function ankiContentHash(
  note: AnkiNoteInfo,
  mapping: FieldMapping,
): Promise<string> {
  const fields = buildYamlNoteFields(note, mapping) ?? {
    back: "",
    front: "",
    tags: "",
  };
  return computeContentHash(
    fields.front,
    fields.back,
    fields.tags,
    note.modelName ?? "Unknown",
  );
}

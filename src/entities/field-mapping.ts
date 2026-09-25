import { ankiFieldNames } from "src/conf/constants";

export const fieldTargets = [
  ankiFieldNames.front,
  ankiFieldNames.back,
  ankiFieldNames.text,
  ankiFieldNames.extra,
  "Skip",
] as const;

export type FieldTarget = (typeof fieldTargets)[number];

export type FieldMapping = Record<string, FieldTarget>;

export function presetFieldMapping(fields: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  for (const field of fields) {
    mapping[field] = fieldTargets.find((target) => target === field) ?? "Skip";
  }
  return mapping;
}

export function resolveFieldMapping(
  fields: string[],
  savedMapping: Record<string, string> | undefined,
): FieldMapping {
  const mapping = presetFieldMapping(fields);
  for (const [field, target] of Object.entries(savedMapping ?? {})) {
    if ((fieldTargets as readonly string[]).includes(target)) {
      mapping[field] = target as FieldTarget;
    }
  }
  return mapping;
}

export function mergeFieldMappings(
  stored: Record<string, Record<string, string>>,
  incoming: Record<string, FieldMapping>,
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = { ...stored };
  for (const [modelName, mapping] of Object.entries(incoming)) {
    merged[modelName] = { ...(merged[modelName] ?? {}), ...mapping };
  }
  return merged;
}

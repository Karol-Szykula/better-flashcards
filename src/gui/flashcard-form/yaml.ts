import { parseYaml, stringifyYaml } from "obsidian";

export interface YamlEngine {
  parse(source: string): unknown;
  stringify(value: Record<string, unknown>): string;
}

export const obsidianYamlEngine: YamlEngine = {
  parse: (source) => parseYaml(source),
  stringify: (value) => stringifyYaml(value),
};

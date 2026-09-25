import type { YamlEngine } from "src/services/yaml-engine";

export const jsonEngine: YamlEngine = {
  parse: (source): unknown => JSON.parse(source) as unknown,
  stringify: (value) => JSON.stringify(value),
};

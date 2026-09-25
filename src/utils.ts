export function describeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return Object.prototype.toString.call(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(describeUnknown(value));
}

export function trimDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") {
    start += 1;
  }
  while (end > start && value[end - 1] === "-") {
    end -= 1;
  }
  return value.slice(start, end);
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  const sortedFirst = [...a].sort((first, second) =>
    first.localeCompare(second),
  );
  const sortedSecond = [...b].sort((first, second) =>
    first.localeCompare(second),
  );

  return sortedFirst.every((value, index) => value === sortedSecond[index]);
}

export function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

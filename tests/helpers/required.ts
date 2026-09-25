export function required<T>(value: T | undefined, what = "value"): T {
  if (value === undefined) {
    throw new Error(`Test fixture is missing ${what}`);
  }
  return value;
}

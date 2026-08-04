export function cloneJsonValue<T>(input: T): T {
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => cloneJsonValue(item)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    result[key] = cloneJsonValue((input as Record<string, unknown>)[key]);
  }
  return result as T;
}

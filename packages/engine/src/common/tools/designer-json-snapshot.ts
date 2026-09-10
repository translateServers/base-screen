/**
 * 交给插件的是私有副本：插件写入不会污染 canonical 文档，且 ESM 严格模式下再次赋值会抛
 * TypeError，而不是静默无效。JSON 往返同时保证了快照是 JSON-safe 的。
 */
export function cloneAndFreeze<T>(value: T): T {
  return deepFreezeJson(JSON.parse(JSON.stringify(value)) as T);
}

function deepFreezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

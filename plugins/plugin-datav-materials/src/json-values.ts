import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';

/**
 * 物料元素读 props/style/dataState 的统一入口。
 *
 * 文档内容在契约层是 JSON-safe 的任意值，物料渲染不能假设字段存在或类型正确——
 * 这些读取器把"缺失/类型不符"统一收敛为调用方给的兜底值，避免每个元素各写一份
 * 类型判断，也避免把文档内容当可信输入直接下探。
 */
export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readRecord(value: unknown): ScreenJsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ScreenJsonObject)
    : undefined;
}

export function readArray(value: unknown): readonly ScreenJsonValue[] {
  return Array.isArray(value) ? (value as readonly ScreenJsonValue[]) : [];
}

/** 按路径读嵌套字段；任一段不是对象即返回 undefined，不抛异常。 */
export function readPath(value: unknown, path: readonly string[]): ScreenJsonValue | undefined {
  let current: unknown = value;
  for (const segment of path) {
    const record = readRecord(current);
    if (record === undefined) return undefined;
    current = record[segment];
  }
  return current as ScreenJsonValue | undefined;
}

/** CSS 颜色字面量的输出通道：只接受字符串，其余一律回落到兜底色，不把任意值拼进样式。 */
export function styleColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** 数字转 CSS 长度：非法值用兜底，避免拼出 `NaNpx` 这类无效样式。 */
export function pixelValue(value: unknown, fallback: number): string {
  return `${readNumber(value, fallback)}px`;
}

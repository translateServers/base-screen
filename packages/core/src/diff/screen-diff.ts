import type { ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';

/** 单条属性差异：路径 + 前后值（已格式化为稳定 JSON，过长截断）。 */
export interface ScreenDiffEntry {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

/** 一个组件的差异集合；新增/删除没有属性行。 */
export interface ScreenDiffRow {
  readonly componentId: string;
  readonly componentName: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly entries: readonly ScreenDiffEntry[];
}

const MAX_VALUE_LENGTH = 80;

/**
 * 文档级 diff：按组件 id 对齐，给出属性级差异行。
 *
 * 放在 core 而不是 engine：工具面与设计器要用同一份实现，否则会出现两套口径。
 * 只比较文档本身，不关心它是怎么产生的。
 */
export function diffScreenDocuments(
  before: ScreenDocument,
  after: ScreenDocument,
): readonly ScreenDiffRow[] {
  const beforeById = new Map(before.components.map((component) => [component.id, component]));
  const afterById = new Map(after.components.map((component) => [component.id, component]));
  const rows: ScreenDiffRow[] = [];
  for (const component of after.components) {
    const previous = beforeById.get(component.id);
    if (previous === undefined) {
      rows.push({
        componentId: component.id,
        componentName: component.name,
        kind: 'added',
        entries: [],
      });
      continue;
    }
    const entries = diffComponent(previous, component);
    if (entries.length > 0) {
      rows.push({
        componentId: component.id,
        componentName: component.name,
        kind: 'changed',
        entries,
      });
    }
  }
  for (const component of before.components) {
    if (afterById.has(component.id)) continue;
    rows.push({
      componentId: component.id,
      componentName: component.name,
      kind: 'removed',
      entries: [],
    });
  }
  return rows;
}

function diffComponent(
  before: ScreenDocument['components'][number],
  after: ScreenDocument['components'][number],
): readonly ScreenDiffEntry[] {
  const entries: ScreenDiffEntry[] = [];
  compareValue('name', before.name, after.name, entries);
  compareValue('position.x', before.position.x, after.position.x, entries);
  compareValue('position.y', before.position.y, after.position.y, entries);
  compareValue('size.width', before.size.width, after.size.width, entries);
  compareValue('size.height', before.size.height, after.size.height, entries);
  compareValue('rotation', before.rotation, after.rotation, entries);
  compareValue('zIndex', before.zIndex, after.zIndex, entries);
  diffObject('props', before.props, after.props, entries);
  diffObject('style', before.style, after.style, entries);
  compareValue('dataValue', before.dataValue ?? null, after.dataValue ?? null, entries);
  compareValue('dataSource', before.dataSource ?? null, after.dataSource ?? null, entries);
  compareValue('styleRules', before.styleRules ?? [], after.styleRules ?? [], entries);
  return entries;
}

function diffObject(
  prefix: string,
  before: ScreenJsonObject,
  after: ScreenJsonObject,
  entries: ScreenDiffEntry[],
): void {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    compareValue(`${prefix}.${key}`, before[key], after[key], entries);
  }
}

function compareValue(
  path: string,
  before: unknown,
  after: unknown,
  entries: ScreenDiffEntry[],
): void {
  const beforeJson = stableJson(before);
  if (beforeJson === stableJson(after)) return;
  entries.push({ path, before: formatValue(beforeJson), after: formatValue(stableJson(after)) });
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  return JSON.stringify(value) ?? 'null';
}

function formatValue(json: string): string {
  return json.length > MAX_VALUE_LENGTH ? `${json.slice(0, MAX_VALUE_LENGTH - 1)}…` : json;
}

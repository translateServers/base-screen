import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentCommand, ScreenDocumentTransaction } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { clampScreenSize, roundScreenGeometry } from '../element/designer-geometry.js';
import { selectedComponents } from './designer-selection.js';

/**
 * 多选批量样式字段交集（ADR-0053 R2）：所有选中组件 manifest.stylePanel 且
 * styleSchema 声明的字段的交集。交集为空（如文本与矩形混合多选）返回空数组，
 * 调用方只显示几何区。
 */
export function commonStyleFields(
  document: ScreenDocument,
  componentIds: readonly string[],
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly string[] {
  const selected = selectedComponents(document, componentIds);
  if (selected.length === 0 || catalog === undefined) return [];
  let intersection: ReadonlySet<string> | undefined;
  for (const component of selected) {
    const manifest = catalog.get(component.type)?.manifest;
    if (manifest === undefined) return [];
    const fields = new Set(
      (manifest.stylePanel ?? [])
        .filter((field) => manifest.styleSchema?.properties?.[field.style] !== undefined)
        .map((field) => field.style),
    );
    intersection = intersection === undefined ? fields : intersectKeys(intersection, fields);
    if (intersection.size === 0) return [];
  }
  return [...(intersection ?? [])];
}

/**
 * 批量样式提交事务（ADR-0053 R3/R4）：对每个非锁定选中组件生成一条
 * `update-components`（patch style 合并字段值），跳过锁定成员；任一选中组件的
 * manifest 不声明该字段时拒绝整笔（字段必须属于交集）。恰一条历史记录。
 */
export function createMultiSelectionStyleTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  style: string,
  value: ScreenJsonValue,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (catalog === undefined) return undefined;
  const commands: ScreenDocumentCommand[] = [];
  for (const component of selectedComponents(document, componentIds)) {
    if (isScreenComponentEffectivelyLocked(document, component.id)) continue;
    const manifest = catalog.get(component.type)?.manifest;
    if (
      manifest === undefined ||
      !(manifest.stylePanel ?? []).some((field) => field.style === style) ||
      manifest.styleSchema?.properties?.[style] === undefined
    ) {
      return undefined;
    }
    commands.push({
      type: 'update-components',
      componentIds: [component.id],
      patch: { style: { ...component.style, [style]: value } },
    });
  }
  if (commands.length === 0) return undefined;
  return { ok: true, value: { commands }, diagnostics: [] };
}

/** 多选批量几何字段：宽/高/旋转（ADR-0053 R1，不提供 X/Y）。 */
export type DesignerMultiSelectionGeometryField = 'width' | 'height' | 'rotation';

/**
 * 批量几何提交事务（ADR-0053 R1/R3/R4）：对每个非锁定选中组件生成一条
 * `update-components`（patch size/rotation，几何写路径复用 designer-geometry 规则），
 * 跳过锁定成员；值不合法（尺寸 ≤ 0、旋转越界）时拒绝整笔。恰一条历史记录。
 */
export function createMultiSelectionGeometryTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  property: DesignerMultiSelectionGeometryField,
  value: number,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!Number.isFinite(value)) return undefined;
  const commands: ScreenDocumentCommand[] = [];
  for (const component of selectedComponents(document, componentIds)) {
    if (isScreenComponentEffectivelyLocked(document, component.id)) continue;
    if (property === 'width' || property === 'height') {
      if (value <= 0) return undefined;
      commands.push({
        type: 'update-components',
        componentIds: [component.id],
        patch: {
          size: {
            ...component.size,
            [property]: roundScreenGeometry(clampScreenSize(value)),
          },
        },
      });
    } else {
      if (value < -180 || value >= 180) return undefined;
      commands.push({
        type: 'update-components',
        componentIds: [component.id],
        patch: { rotation: value },
      });
    }
  }
  if (commands.length === 0) return undefined;
  return { ok: true, value: { commands }, diagnostics: [] };
}

function intersectKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  const result = new Set<string>();
  for (const key of left) {
    if (right.has(key)) result.add(key);
  }
  return result;
}

import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentCommand, ScreenDocumentTransaction } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { clampScreenSize, roundScreenGeometry } from '../element/designer-geometry.js';
import {
  type DesignerMaterialEditorKey,
  designerMaterialEditorKeys,
} from '../style/designer-material-appearance.js';
import { createDesignerStyleFieldPatch } from '../style/designer-style-field.js';
import { selectedComponents } from './designer-selection.js';

/**
 * 多选批量样式字段交集（ADR-0053 R2）：所有选中组件外观区开放的 style 键的交集
 * （ADR-0102 D1：与单选同一份字段表）。只收批量控件能承载的字段：颜色、开关、枚举、
 * 数字与文本；字段声明 `batchable: false` 的不收。交集为空（如文本与矩形混合多选）
 * 返回空数组，调用方只显示几何区。
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
      designerMaterialEditorKeys(manifest, 'style')
        .filter((entry) => isBatchableEditorKey(entry))
        .map((entry) => entry.key),
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
      !designerMaterialEditorKeys(manifest, 'style').some(
        (entry) => entry.key === style && isBatchableEditorKey(entry),
      ) ||
      manifest.styleSchema?.properties?.[style] === undefined
    ) {
      return undefined;
    }
    commands.push({
      type: 'update-components',
      componentIds: [component.id],
      patch: { style: createDesignerStyleFieldPatch(component.style, style, value, manifest) },
    });
  }
  if (commands.length === 0) return undefined;
  return { ok: true, value: { commands }, diagnostics: [] };
}

const BATCHABLE_CONTROLS: ReadonlySet<string> = new Set([
  'color',
  'boolean',
  'select',
  'segmented',
  'number',
  'unit-number',
  'stepper',
  'text',
]);

function isBatchableEditorKey(entry: DesignerMaterialEditorKey): boolean {
  return entry.field.batchable !== false && BATCHABLE_CONTROLS.has(entry.field.control);
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

import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import {
  clampScreenCoordinate,
  roundScreenGeometry,
} from '../../../common/operations/designer-geometry.js';
import {
  createGroupRotationTransaction,
  createGroupSizeTransaction,
} from '../../../common/operations/designer-group.js';
import {
  createGroupPositionTransaction,
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../../common/operations/designer-inspector.js';
import {
  createValidatedPropsTransaction,
  createValidatedStyleTransaction,
} from '../../../common/operations/designer-layout-operations.js';
import {
  createMultiSelectionGeometryTransaction,
  createMultiSelectionStyleTransaction,
} from '../../../common/operations/designer-multi-selection-operations.js';
import { readDesignerColorPaletteValue } from '../designer-color-palette-dom.js';
import {
  createCanvasTransaction,
  type DesignerCanvasBackgroundDrafts,
} from './designer-canvas-transactions.js';
import { parseJsonDraft } from './designer-data-source-model.js';
import { isControl, success, update } from './designer-panel-transaction-utils.js';

export interface DesignerPanelInput {
  readonly value: string;
  readonly checked?: boolean;
  readonly type?: string;
}

export function createPropertyTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  canvasBackgroundDrafts?: DesignerCanvasBackgroundDrafts,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const geometryAction = target.dataset.geometryAction;
  if (geometryAction === 'flipX' || geometryAction === 'flipY') {
    const context = getDesignerInspectorContext(document, interaction, catalog);
    if (context.kind !== 'single-material' || context.manifest === undefined) return undefined;
    const schema = context.manifest.styleSchema.properties[geometryAction];
    if (schema?.kind !== 'boolean') return undefined;
    return success(
      update(context.component.id, {
        style: {
          ...context.component.style,
          [geometryAction]: context.component.style[geometryAction] !== true,
        },
      }),
    );
  }
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' && context.kind !== 'single-group') {
    return createCanvasTransaction(document, target, canvasBackgroundDrafts);
  }
  const component = context.component;
  const property = target.dataset.property;
  if (property !== undefined) {
    return createGeometryTransaction(document, context, component, property, target.value);
  }
  const prop = target.dataset.prop;
  const style = target.dataset.style;
  const manifest = context.manifest;
  if (
    manifest !== undefined &&
    style !== undefined &&
    manifest.styleSchema.properties[style] !== undefined &&
    (manifest.stylePanel.some((field) => field.style === style) || style === 'opacity')
  ) {
    const schema = manifest.styleSchema.properties[style];
    if (isClearedOptionalNumberControl(target, schema, manifest.styleSchema.required, style)) {
      const nextStyle = { ...component.style };
      delete nextStyle[style];
      return createValidatedStyleTransaction(component.id, nextStyle, manifest.styleSchema);
    }
    const value = parsePropertyControlValue(target, schema);
    return value === undefined
      ? undefined
      : createValidatedStyleTransaction(
          component.id,
          { ...component.style, [style]: value },
          manifest.styleSchema,
        );
  }
  const schema = prop === undefined ? undefined : manifest?.propsSchema.properties[prop];
  if (
    manifest === undefined ||
    prop === undefined ||
    schema === undefined ||
    !manifest.propertyPanel.some((field) => field.prop === prop)
  ) {
    return undefined;
  }
  if (isClearedOptionalNumberControl(target, schema, manifest.propsSchema.required, prop)) {
    const nextProps = { ...component.props };
    delete nextProps[prop];
    return createValidatedPropsTransaction(component.id, nextProps, manifest.propsSchema);
  }
  const value = parsePropertyControlValue(target, schema);
  if (value === undefined) return undefined;
  return createValidatedPropsTransaction(
    component.id,
    { ...component.props, [prop]: value },
    manifest.propsSchema,
  );
}

/**
 * 多选批量编辑事务分派（ADR-0053）：`data-multi-property` 控件（批量几何宽/高/旋转、
 * 批量样式 `style:<field>`）的独立事务通道；单选事务通道（createPropertyTransaction）
 * 零改动。值显示焦点组件，编辑后应用到全部选中组件（跳过锁定成员）。
 */
export function createMultiSelectionTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target) || document === undefined) return undefined;
  const multiProperty = target.dataset.multiProperty;
  if (multiProperty === undefined) return undefined;
  const componentIds = interaction.selectedComponentIds;
  if (multiProperty === 'width' || multiProperty === 'height' || multiProperty === 'rotation') {
    return createMultiSelectionGeometryTransaction(
      document,
      componentIds,
      multiProperty,
      Number(target.value),
    );
  }
  if (multiProperty.startsWith('style:')) {
    const style = multiProperty.slice('style:'.length);
    const focused = document.components.find((item) => item.id === interaction.focusedComponentId);
    const manifest = focused === undefined ? undefined : catalog?.get(focused.type)?.manifest;
    const schema = manifest?.styleSchema?.properties?.[style];
    if (schema === undefined) return undefined;
    const value = parsePropertyControlValue(target, schema);
    if (value === undefined) return undefined;
    return createMultiSelectionStyleTransaction(document, componentIds, style, value, catalog);
  }
  return undefined;
}

export function parsePropertyControlValue(
  input: DesignerPanelInput,
  schema: BaseScreenMaterialPropSchema,
): ScreenJsonValue | undefined {
  const paletteValue = readDesignerColorPaletteValue(input as unknown as EventTarget);
  if (paletteValue !== undefined) return paletteValue;
  if (input.type === 'checkbox') return input.checked === true;
  const dataset = (input as unknown as { readonly dataset?: DOMStringMap }).dataset;
  if (dataset?.opacityPercent === 'true' && schema.kind === 'number') {
    const percent = Number(input.value);
    return Number.isFinite(percent) ? percent / 100 : undefined;
  }
  if (schema.kind === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (schema.kind === 'boolean') return input.value === 'true';
  if (schema.kind === 'enum') return schema.values.find((value) => String(value) === input.value);
  if (schema.kind === 'string') return input.value;
  return parseJsonDraft(input.value);
}

function isClearedOptionalNumberControl(
  input: DesignerPanelInput,
  schema: BaseScreenMaterialPropSchema,
  required: readonly string[],
  field: string,
): boolean {
  return schema.kind === 'number' && input.value.trim() === '' && !required.includes(field);
}

function createGeometryTransaction(
  document: ScreenDocument | undefined,
  context: DesignerInspectorContext,
  component: ScreenComponentNode,
  property: string,
  input: string,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (property === 'name') return success(update(component.id, { name: input }));
  if (property === 'locked' || property === 'hidden') {
    return success(
      update(component.id, { status: { ...component.status, [property]: input === 'true' } }),
    );
  }
  const value = Number(input);
  if (!Number.isFinite(value)) return undefined;
  if (property === 'x' || property === 'y') {
    const position = {
      ...component.position,
      [property]: roundScreenGeometry(clampScreenCoordinate(value)),
    };
    if (document !== undefined && context.kind === 'single-group') {
      const transaction = createGroupPositionTransaction(document, component.id, position);
      return transaction === undefined ? undefined : success(transaction);
    }
    return success(update(component.id, { position }));
  }
  if (context.kind === 'single-group' && document !== undefined) {
    if (property === 'width' || property === 'height') {
      const size = {
        ...component.size,
        [property]: roundScreenGeometry(Math.min(value, 1_000_000)),
      };
      const transaction = createGroupSizeTransaction(document, component.id, size);
      return transaction === undefined ? undefined : success(transaction);
    }
    if (property === 'rotation' && value >= -180 && value < 180) {
      const transaction = createGroupRotationTransaction(document, component.id, value);
      return transaction === undefined ? undefined : success(transaction);
    }
  }
  if ((property === 'width' || property === 'height') && value > 0) {
    return success(
      update(component.id, {
        size: { ...component.size, [property]: roundScreenGeometry(Math.min(value, 1_000_000)) },
      }),
    );
  }
  if (property === 'rotation' && value >= -180 && value < 180) {
    return success(update(component.id, { rotation: value }));
  }
  if (property === 'zIndex' && Number.isInteger(value) && value >= 0 && value <= 1_000_000) {
    return success(update(component.id, { zIndex: value }));
  }
  return undefined;
}

import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionState,
} from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialObjectSchema,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { selectedComponents } from '../selection/designer-selection.js';

export const DESIGNER_QUICK_STYLE_PALETTES = [
  ['#111827', '#f9fafb', '#374151'],
  ['#0f172a', '#e2e8f0', '#334155'],
  ['#ffffff', '#111827', '#d1d5db'],
  ['#071a2b', '#7dd3fc', '#164e63'],
  ['#171717', '#f5f5f5', '#525252'],
  ['#0b1f14', '#86efac', '#166534'],
  ['#24140b', '#fed7aa', '#9a3412'],
  ['#211330', '#e9d5ff', '#7e22ce'],
  ['#1f1517', '#fecdd3', '#9f1239'],
] as const;

export type DesignerQuickStyleAction =
  | { readonly kind: 'preset'; readonly value: number }
  | { readonly kind: 'colors'; readonly value: string }
  | { readonly kind: 'text'; readonly value: 12 | 14 | 16 }
  | { readonly kind: 'info'; readonly value: 'simple' | 'common' | 'detailed' };

interface DesignerQuickStylePatch {
  props?: ScreenJsonObject;
  style?: ScreenJsonObject;
}

const PRESET_STYLE_FIELDS: Readonly<Record<string, 0 | 1 | 2>> = {
  backgroundColor: 0,
  color: 1,
  gridColor: 2,
  borderColor: 2,
  headerBackgroundColor: 2,
};

export function designerQuickStyleActionSupported(
  manifest: BaseScreenMaterialManifest,
  action: DesignerQuickStyleAction,
): boolean {
  if (action.kind === 'preset') {
    return (
      DESIGNER_QUICK_STYLE_PALETTES[action.value] !== undefined &&
      Object.keys(PRESET_STYLE_FIELDS).some((field) => stringStyle(manifest, field))
    );
  }
  if (action.kind === 'colors') {
    return (
      stringStyle(manifest, 'color') ||
      stringStyle(manifest, 'gridColor') ||
      seriesColorSchema(manifest) !== undefined
    );
  }
  if (action.kind === 'text') {
    return (
      numberStyle(manifest, 'fontSize') ||
      ['title', 'legend', 'xAxis'].some(
        (field) => objectProperty(manifest.propsSchema, field, 'fontSize')?.kind === 'number',
      )
    );
  }
  return ['title', 'legend', 'grid', 'tooltip'].some(
    (field) => objectProperty(manifest.propsSchema, field, 'show')?.kind === 'boolean',
  );
}

export function designerQuickStyleActionApplied(
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
  action: DesignerQuickStyleAction,
): boolean {
  if (component.type !== manifest.type || !designerQuickStyleActionSupported(manifest, action)) {
    return false;
  }
  if (action.kind === 'preset') {
    const palette = DESIGNER_QUICK_STYLE_PALETTES[action.value];
    if (palette === undefined) return false;
    let matched = false;
    for (const [field, paletteIndex] of Object.entries(PRESET_STYLE_FIELDS)) {
      if (!stringStyle(manifest, field)) continue;
      matched = true;
      if (component.style[field] !== palette[paletteIndex]) return false;
    }
    return matched;
  }
  if (action.kind === 'colors') {
    let matched = false;
    for (const field of ['color', 'gridColor']) {
      if (!stringStyle(manifest, field)) continue;
      matched = true;
      if (component.style[field] !== action.value) return false;
    }
    if (seriesColorSchema(manifest) !== undefined && Array.isArray(component.props.series)) {
      for (const series of component.props.series) {
        if (!isJsonObject(series)) continue;
        matched = true;
        if (series.color !== action.value) return false;
      }
    }
    return matched;
  }
  if (action.kind === 'text') {
    let matched = false;
    if (numberStyle(manifest, 'fontSize')) {
      matched = true;
      if (component.style.fontSize !== action.value) return false;
    }
    for (const field of ['title', 'legend', 'xAxis']) {
      if (objectProperty(manifest.propsSchema, field, 'fontSize')?.kind !== 'number') continue;
      matched = true;
      const value = component.props[field];
      if (!isJsonObject(value) || value.fontSize !== action.value) return false;
    }
    return matched;
  }

  const visibility =
    action.value === 'simple'
      ? { title: false, legend: false, grid: false, tooltip: true }
      : { title: true, legend: true, grid: true, tooltip: true };
  let matched = false;
  for (const [field, show] of Object.entries(visibility)) {
    if (objectProperty(manifest.propsSchema, field, 'show')?.kind !== 'boolean') continue;
    matched = true;
    const value = component.props[field];
    if (!isJsonObject(value) || value.show !== show) return false;
  }
  if (objectProperty(manifest.propsSchema, 'advanced', 'showDataLabels')?.kind === 'boolean') {
    matched = true;
    const advanced = component.props.advanced;
    if (!isJsonObject(advanced) || advanced.showDataLabels !== (action.value === 'detailed')) {
      return false;
    }
  }
  return matched;
}

export function createDesignerQuickStyleTransaction(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  action: DesignerQuickStyleAction,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined || catalog === undefined) return undefined;
  const componentIds =
    interaction.selectedComponentIds.length > 0
      ? interaction.selectedComponentIds
      : interaction.focusedComponentId === null
        ? []
        : [interaction.focusedComponentId];
  const commands: ScreenDocumentCommand[] = [];
  for (const component of selectedComponents(document, componentIds)) {
    if (isScreenComponentEffectivelyLocked(document, component.id)) continue;
    const manifest = catalog.get(component.type)?.manifest;
    if (manifest === undefined || !designerQuickStyleActionSupported(manifest, action)) {
      return undefined;
    }
    const result = quickStylePatch(component, manifest, action);
    if (!result.ok) return result;
    if (result.value !== undefined) {
      commands.push({
        type: 'update-components',
        componentIds: [component.id],
        patch: result.value,
      });
    }
  }
  return commands.length === 0 ? undefined : { ok: true, value: { commands }, diagnostics: [] };
}

function quickStylePatch(
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
  action: DesignerQuickStyleAction,
): ScreenParseResult<DesignerQuickStylePatch | undefined> {
  let style = component.style;
  let props = component.props;
  if (action.kind === 'preset') {
    const palette = DESIGNER_QUICK_STYLE_PALETTES[action.value];
    if (palette === undefined) return success(undefined);
    const patch: Record<string, ScreenJsonValue> = {};
    for (const [field, paletteIndex] of Object.entries(PRESET_STYLE_FIELDS)) {
      if (stringStyle(manifest, field)) patch[field] = palette[paletteIndex];
    }
    style = { ...style, ...patch };
  } else if (action.kind === 'colors') {
    const stylePatch: Record<string, ScreenJsonValue> = {};
    if (stringStyle(manifest, 'color')) stylePatch.color = action.value;
    if (stringStyle(manifest, 'gridColor')) stylePatch.gridColor = action.value;
    style = { ...style, ...stylePatch };
    props = patchSeriesColors(props, manifest, action.value);
  } else if (action.kind === 'text') {
    if (numberStyle(manifest, 'fontSize')) style = { ...style, fontSize: action.value };
    for (const field of ['title', 'legend', 'xAxis']) {
      if (objectProperty(manifest.propsSchema, field, 'fontSize')?.kind === 'number') {
        props = patchObjectProperty(props, field, { fontSize: action.value });
      }
    }
  } else {
    const visibility =
      action.value === 'simple'
        ? { title: false, legend: false, grid: false, tooltip: true }
        : { title: true, legend: true, grid: true, tooltip: true };
    for (const [field, show] of Object.entries(visibility)) {
      if (objectProperty(manifest.propsSchema, field, 'show')?.kind === 'boolean') {
        props = patchObjectProperty(props, field, { show });
      }
    }
    if (objectProperty(manifest.propsSchema, 'advanced', 'showDataLabels')?.kind === 'boolean') {
      props = patchObjectProperty(props, 'advanced', {
        showDataLabels: action.value === 'detailed',
      });
    }
  }

  const patch: DesignerQuickStylePatch = {};
  if (!sameJson(style, component.style)) {
    const validated = validateBaseScreenMaterialStyle(style, manifest.styleSchema);
    if (!validated.ok) return failure(validated);
    patch.style = validated.value;
  }
  if (!sameJson(props, component.props)) {
    const validated = validateBaseScreenMaterialProps(props, manifest.propsSchema);
    if (!validated.ok) return failure(validated);
    patch.props = validated.value;
  }
  return success(Object.keys(patch).length === 0 ? undefined : patch);
}

function patchSeriesColors(
  props: ScreenJsonObject,
  manifest: BaseScreenMaterialManifest,
  color: string,
): ScreenJsonObject {
  if (seriesColorSchema(manifest) === undefined || !Array.isArray(props.series)) return props;
  return {
    ...props,
    series: props.series.map((series) => (isJsonObject(series) ? { ...series, color } : series)),
  };
}

function patchObjectProperty(
  props: ScreenJsonObject,
  field: string,
  patch: ScreenJsonObject,
): ScreenJsonObject {
  const current = props[field];
  return { ...props, [field]: { ...(isJsonObject(current) ? current : {}), ...patch } };
}

function seriesColorSchema(
  manifest: BaseScreenMaterialManifest,
): BaseScreenMaterialPropSchema | undefined {
  const series = manifest.propsSchema.properties.series;
  return series?.kind === 'array' && series.items.kind === 'object'
    ? series.items.properties.color
    : undefined;
}

function objectProperty(
  schema: BaseScreenMaterialObjectSchema,
  field: string,
  property: string,
): BaseScreenMaterialPropSchema | undefined {
  const object = schema.properties[field];
  return object?.kind === 'object' ? object.properties[property] : undefined;
}

function stringStyle(manifest: BaseScreenMaterialManifest, field: string): boolean {
  return manifest.styleSchema.properties[field]?.kind === 'string';
}

function numberStyle(manifest: BaseScreenMaterialManifest, field: string): boolean {
  return manifest.styleSchema.properties[field]?.kind === 'number';
}

function isJsonObject(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(left: ScreenJsonValue, right: ScreenJsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function failure<T>(result: ScreenParseResult<unknown>): ScreenParseResult<T> {
  return { ok: false, diagnostics: result.diagnostics };
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

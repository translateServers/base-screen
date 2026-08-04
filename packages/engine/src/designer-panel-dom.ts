import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { createValidatedPropsTransaction } from './designer-layout-operations.js';

export interface DesignerPanelInput {
  readonly value: string;
  readonly checked?: boolean;
  readonly type?: string;
}

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  properties.replaceChildren();
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  if (component === undefined) return;
  appendInput(properties, 'Name', 'name', component.name);
  appendInput(properties, 'X', 'x', component.position.x, 'number');
  appendInput(properties, 'Y', 'y', component.position.y, 'number');
  appendInput(properties, 'Width', 'width', component.size.width, 'number', '1');
  appendInput(properties, 'Height', 'height', component.size.height, 'number', '1');
  const manifest = catalog?.get(component.type)?.manifest;
  if (manifest === undefined) return;
  for (const field of manifest.propertyPanel) {
    const schema = manifest.propsSchema.properties[field.prop];
    if (schema !== undefined) {
      appendPropControl(
        properties,
        field.label,
        field.prop,
        component.props[field.prop],
        schema,
        field.control,
      );
    }
  }
}

export function createPropertyTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  if (component === undefined) return undefined;
  const property = target.dataset.property;
  if (property !== undefined) return createGeometryTransaction(component, property, target.value);
  const prop = target.dataset.prop;
  const manifest = catalog?.get(component.type)?.manifest;
  const schema = prop === undefined ? undefined : manifest?.propsSchema.properties[prop];
  if (manifest === undefined || prop === undefined || schema === undefined) return undefined;
  const value = parsePropertyControlValue(target, schema);
  if (value === undefined) return undefined;
  return createValidatedPropsTransaction(
    component.id,
    { ...component.props, [prop]: value },
    manifest.propsSchema,
  );
}

export function parsePropertyControlValue(
  input: DesignerPanelInput,
  schema: BaseScreenMaterialPropSchema,
): ScreenJsonValue | undefined {
  if (input.type === 'checkbox') return input.checked === true;
  if (schema.kind === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (schema.kind === 'boolean') return input.value === 'true';
  if (schema.kind === 'enum') return schema.values.find((value) => String(value) === input.value);
  if (schema.kind === 'string') return input.value;
  try {
    return JSON.parse(input.value) as ScreenJsonValue;
  } catch {
    return undefined;
  }
}

function createGeometryTransaction(
  component: ScreenComponentNode,
  property: string,
  input: string,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (property === 'name') return success(update(component.id, { name: input }));
  const value = Number(input);
  if (!Number.isFinite(value)) return undefined;
  if (property === 'x' || property === 'y') {
    return success(
      update(component.id, { position: { ...component.position, [property]: clamp(value) } }),
    );
  }
  if ((property === 'width' || property === 'height') && value > 0) {
    return success(
      update(component.id, { size: { ...component.size, [property]: Math.min(value, 1_000_000) } }),
    );
  }
  return undefined;
}

function appendInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
  min?: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.value = String(value);
  input.dataset.property = property;
  if (min !== undefined) input.min = min;
  label.appendChild(input);
  parent.appendChild(label);
}

function appendPropControl(
  parent: HTMLElement,
  labelText: string,
  prop: string,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.textContent = labelText;
  const input = createControl(parent.ownerDocument, value, schema, control);
  input.dataset.prop = prop;
  label.appendChild(input);
  parent.appendChild(label);
}

function createControl(
  ownerDocument: Document,
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialPropSchema,
  control: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (control === 'boolean') {
    const input = ownerDocument.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true;
    return input;
  }
  if (control === 'select' && schema.kind === 'enum') {
    const select = ownerDocument.createElement('select');
    for (const optionValue of schema.values) {
      const option = ownerDocument.createElement('option');
      option.value = String(optionValue);
      option.textContent = String(optionValue);
      option.selected = value === optionValue;
      select.appendChild(option);
    }
    return select;
  }
  if (control === 'json') {
    const input = ownerDocument.createElement('textarea');
    input.value = JSON.stringify(value);
    return input;
  }
  const input = ownerDocument.createElement('input');
  input.type = control === 'number' ? 'number' : 'text';
  input.value = String(value ?? '');
  return input;
}

function isControl(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function update(componentId: string, patch: Record<string, unknown>): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'update-components', componentIds: [componentId], patch }],
  } as ScreenDocumentTransaction;
}

function success(value: ScreenDocumentTransaction): ScreenParseResult<ScreenDocumentTransaction> {
  return { ok: true, value, diagnostics: [] };
}

function clamp(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

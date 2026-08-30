import {
  MAX_DATASET_FIELDS,
  MAX_DATASET_ROWS,
  parseScreenTabularDataset,
  type ScreenDataBinding,
  type ScreenDatasetField,
  type ScreenDiagnostic,
  type ScreenJsonValue,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { resolveDesignerStaticDataPagination } from '../../dom/designer-static-data-pagination.js';
import { coerceDesignerStaticCell } from '../designer-static-tabular.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';

export function setStaticValue(
  context: DesignerDatasetControllerContext,
  value: ScreenJsonValue,
): void {
  context.state.staticValue = value;
  context.state.staticDraft = JSON.stringify(value, null, 2);
  context.setFeedback('');
}

export function currentStaticDataset(
  context: DesignerDatasetControllerContext,
): ScreenTabularDataset | undefined {
  const parsed = parseScreenTabularDataset(context.state.staticValue);
  return parsed.ok ? parsed.value : undefined;
}

export function setStaticDataset(
  context: DesignerDatasetControllerContext,
  dataset: ScreenTabularDataset,
  render = true,
): void {
  const parsed = parseScreenTabularDataset(dataset);
  if (!parsed.ok) {
    context.callbacks.report(parsed.diagnostics);
    context.setFeedback(formatStaticDiagnostic(context, parsed.diagnostics[0]));
    return;
  }
  context.state.staticValue =
    parsed.value as unknown as import('@base-screen/contracts').ScreenJsonValue;
  context.state.staticDraft = JSON.stringify(parsed.value, null, 2);
  context.state.staticPage = resolveDesignerStaticDataPagination(
    parsed.value.rows.length,
    context.state.staticPage,
    context.state.staticPageSize,
  ).page;
  context.setFeedback('');
  if (render) context.renderSurface();
  else syncStaticDatasetPreview(context, parsed.value);
}

export function updateStaticField(
  context: DesignerDatasetControllerContext,
  index: number,
  property: string | undefined,
  value: unknown,
): void {
  const dataset = currentStaticDataset(context);
  const field = dataset?.fields[index];
  if (dataset === undefined || field === undefined || property === undefined) return;
  let nextField: ScreenDatasetField = field;
  let rows = dataset.rows;
  if (property === 'id' && typeof value === 'string') {
    const nextId = value.trim();
    if (
      nextId === '' ||
      dataset.fields.some(
        (candidate, candidateIndex) => candidateIndex !== index && candidate.id === nextId,
      )
    ) {
      context.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
      return;
    }
    nextField = { ...field, id: nextId };
    rows = dataset.rows.map((row) => {
      const next = { ...row, [nextId]: row[field.id] ?? null };
      delete next[field.id];
      return next;
    });
    context.state.staticBinding = {
      fields: Object.fromEntries(
        Object.entries(context.state.staticBinding?.fields ?? {}).map(([role, selected]) => [
          role,
          selected.map((id) => (id === field.id ? nextId : id)),
        ]),
      ),
    };
  } else if (property === 'label' && typeof value === 'string') {
    nextField = { ...field, label: value };
  } else if (
    property === 'valueType' &&
    typeof value === 'string' &&
    ['string', 'number', 'boolean', 'date'].includes(value)
  ) {
    const valueType = value as ScreenDatasetField['valueType'];
    nextField = { ...field, valueType };
    rows = dataset.rows.map((row) => ({
      ...row,
      [field.id]: coerceExistingCell(context, row[field.id], valueType, field.nullable === true),
    }));
    context.state.staticBinding = cleanStaticBinding(
      context,
      dataset.fields.map((candidate, candidateIndex) =>
        candidateIndex === index ? nextField : candidate,
      ),
    );
  } else if (property === 'nullable' && typeof value === 'boolean') {
    nextField = { ...field, nullable: value };
    if (!value) {
      rows = dataset.rows.map((row) => ({
        ...row,
        [field.id]: row[field.id] ?? defaultCell(context, field.valueType),
      }));
    }
  }
  const fields = dataset.fields.map((candidate, candidateIndex) =>
    candidateIndex === index ? nextField : candidate,
  );
  setStaticDataset(context, { fields, rows });
}

export function updateStaticCell(
  context: DesignerDatasetControllerContext,
  rowIndex: number,
  fieldId: string,
  source: string,
  render = true,
): void {
  const dataset = currentStaticDataset(context);
  const field = dataset?.fields.find((candidate) => candidate.id === fieldId);
  const row = dataset?.rows[rowIndex];
  if (dataset === undefined || field === undefined || row === undefined) return;
  const value = coerceDesignerStaticCell(source, field.valueType, field.nullable === true);
  if (value === undefined) {
    context.setFeedback(`rows.${rowIndex}.${fieldId}：${DESIGNER_UI_TEXT.panel.enterValidValue}`);
    return;
  }
  setStaticDataset(
    context,
    {
      fields: dataset.fields,
      rows: dataset.rows.map((candidate, index) =>
        index === rowIndex ? { ...candidate, [fieldId]: value } : candidate,
      ),
    },
    render,
  );
}

function syncStaticDatasetPreview(
  context: DesignerDatasetControllerContext,
  dataset: ScreenTabularDataset,
): void {
  const value = JSON.stringify(dataset.rows.slice(0, 8), null, 2);
  const roots = [context.state.panel, context.callbacks.getWorkbenchHost?.()];
  for (const root of roots) {
    for (const preview of root?.querySelectorAll<HTMLElement>('[data-static-preview-value]') ??
      []) {
      preview.textContent = value;
    }
  }
}

export function addStaticField(context: DesignerDatasetControllerContext): void {
  const dataset = currentStaticDataset(context);
  if (dataset === undefined || dataset.fields.length >= MAX_DATASET_FIELDS) return;
  let suffix = dataset.fields.length + 1;
  while (dataset.fields.some((field) => field.id === `field_${suffix}`)) suffix++;
  const field: ScreenDatasetField = {
    id: `field_${suffix}`,
    label: `Field ${suffix}`,
    valueType: 'string',
    nullable: true,
  };
  setStaticDataset(context, {
    fields: [...dataset.fields, field],
    rows: dataset.rows.map((row) => ({ ...row, [field.id]: null })),
  });
}

export function removeStaticField(context: DesignerDatasetControllerContext, index: number): void {
  const dataset = currentStaticDataset(context);
  const field = dataset?.fields[index];
  if (dataset === undefined || field === undefined) return;
  const fields = dataset.fields.filter((_, candidateIndex) => candidateIndex !== index);
  const rows = dataset.rows.map((row) => {
    const next = { ...row };
    delete next[field.id];
    return next;
  });
  context.state.staticBinding = cleanStaticBinding(context, fields);
  setStaticDataset(context, { fields, rows });
}

export function moveStaticField(
  context: DesignerDatasetControllerContext,
  index: number,
  offset: -1 | 1,
): void {
  const dataset = currentStaticDataset(context);
  const target = index + offset;
  if (dataset === undefined || target < 0 || target >= dataset.fields.length) return;
  const fields = [...dataset.fields];
  [fields[index], fields[target]] = [fields[target]!, fields[index]!];
  setStaticDataset(context, { fields, rows: dataset.rows });
}

export function addStaticRow(context: DesignerDatasetControllerContext): void {
  const dataset = currentStaticDataset(context);
  if (dataset === undefined || dataset.rows.length >= MAX_DATASET_ROWS) return;
  const row = Object.fromEntries(
    dataset.fields.map((field) => [
      field.id,
      field.nullable === true ? null : defaultCell(context, field.valueType),
    ]),
  );
  context.state.staticPage = Math.floor(dataset.rows.length / context.state.staticPageSize);
  setStaticDataset(context, { fields: dataset.fields, rows: [...dataset.rows, row] });
}

export function removeStaticRow(context: DesignerDatasetControllerContext, index: number): void {
  const dataset = currentStaticDataset(context);
  if (dataset === undefined || dataset.rows[index] === undefined) return;
  setStaticDataset(context, {
    fields: dataset.fields,
    rows: dataset.rows.filter((_, candidateIndex) => candidateIndex !== index),
  });
}

export function restoreStaticExample(
  context: DesignerDatasetControllerContext,
  render = true,
): void {
  const manifest = context.currentEntry()?.manifest;
  const value = manifest?.defaultData ?? null;
  context.state.staticValue = value;
  context.state.staticDraft = JSON.stringify(value, null, 2);
  context.state.staticBinding =
    manifest?.staticData?.kind === 'tabular' ? manifest.staticData.defaultBinding : undefined;
  context.state.staticPage = 0;
  context.state.staticPasteDraft = '';
  context.state.feedbackText = '';
  if (render) context.renderSurface();
}

export function defaultStaticBinding(
  context: DesignerDatasetControllerContext,
  dataset: ScreenTabularDataset,
): ScreenDataBinding | undefined {
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  if (roles.length === 0) return undefined;
  const used = new Set<string>();
  const fields: Record<string, readonly string[]> = {};
  for (const role of roles) {
    const compatible = dataset.fields.filter((field) => role.valueTypes.includes(field.valueType));
    const selected =
      role.id === 'columns'
        ? compatible.slice(0, role.maxFields)
        : compatible
            .filter((field) => !used.has(field.id))
            .slice(0, role.maxFields === 1 ? 1 : role.minFields);
    fields[role.id] = selected.map((field) => field.id);
    selected.forEach((field) => used.add(field.id));
  }
  return { fields };
}

function cleanStaticBinding(
  context: DesignerDatasetControllerContext,
  fields: readonly ScreenDatasetField[],
): ScreenDataBinding | undefined {
  if (context.state.staticBinding === undefined) return undefined;
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const roles = context.currentEntry()?.manifest.dataBinding?.roles ?? [];
  return {
    fields: Object.fromEntries(
      roles.map((role) => [
        role.id,
        (context.state.staticBinding?.fields[role.id] ?? []).filter((id) => {
          const field = fieldById.get(id);
          return field !== undefined && role.valueTypes.includes(field.valueType);
        }),
      ]),
    ),
  };
}

function coerceExistingCell(
  context: DesignerDatasetControllerContext,
  value: ScreenJsonValue | undefined,
  valueType: ScreenDatasetField['valueType'],
  nullable: boolean,
): ScreenJsonValue {
  if (value === null || value === undefined)
    return nullable ? null : defaultCell(context, valueType);
  return (
    coerceDesignerStaticCell(String(value), valueType, nullable) ?? defaultCell(context, valueType)
  );
}

function defaultCell(
  _context: DesignerDatasetControllerContext,
  valueType: ScreenDatasetField['valueType'],
): ScreenJsonValue {
  if (valueType === 'number') return 0;
  if (valueType === 'boolean') return false;
  if (valueType === 'date') return '1970-01-01';
  return '';
}

export function formatStaticDiagnostic(
  _context: DesignerDatasetControllerContext,
  diagnostic: ScreenDiagnostic | undefined,
): string {
  if (diagnostic === undefined) return DESIGNER_UI_TEXT.dataSource.staticInvalid;
  const path = diagnostic.path.join('.');
  return path === '' ? diagnostic.message : `${path}：${diagnostic.message}`;
}

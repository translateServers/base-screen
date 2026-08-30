import {
  MAX_DATASET_ROWS,
  parseScreenTabularDataset,
  type ScreenDatasetField,
  type ScreenDiagnostic,
  type ScreenJsonValue,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { resolveDesignerStaticDataPagination } from '../../dom/static-data/designer-static-data-pagination.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import { coerceDesignerStaticCell } from './designer-static-cell.js';

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
  context.state.feedbackText = '';
  if (render) context.renderSurface();
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

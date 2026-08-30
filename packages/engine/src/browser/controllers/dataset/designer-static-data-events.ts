import { parseScreenJsonValue, parseScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  normalizeDesignerStaticPageSize,
  resolveDesignerStaticDataPagination,
} from '../../dom/static-data/designer-static-data-pagination.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import {
  addStaticRow,
  currentStaticDataset,
  formatStaticDiagnostic,
  removeStaticRow,
  setStaticValue,
  updateStaticCell,
} from './designer-static-table-controller.js';

export function handleStaticInput(
  context: DesignerDatasetControllerContext,
  target: HTMLInputElement | HTMLTextAreaElement,
): boolean {
  if (target.dataset.dataSourceStatic !== undefined) {
    context.state.staticDraft = target.value;
    syncStaticValueFromJson(context);
    return true;
  }
  if (target.dataset.staticScalar !== undefined) {
    if (target.dataset.staticScalar === 'number') {
      const value = Number(target.value);
      if (!Number.isFinite(value)) return true;
      setStaticValue(context, value);
    } else if (target.dataset.staticScalar === 'string') {
      setStaticValue(context, target.value);
    }
    return true;
  }
  if (target.dataset.staticCellRow !== undefined) {
    updateStaticCell(
      context,
      Number(target.dataset.staticCellRow),
      target.dataset.staticCellField ?? '',
      target.value,
      false,
    );
    return true;
  }
  return false;
}

export function handleStaticClick(
  context: DesignerDatasetControllerContext,
  target: Element,
): boolean {
  const staticBindingField = target.closest<HTMLButtonElement>('[data-static-binding-field]');
  if (staticBindingField !== null) {
    const role = context
      .currentEntry()
      ?.manifest.dataBinding?.roles.find(
        (candidate) => candidate.id === staticBindingField.dataset.staticBindingRole,
      );
    const fieldId = staticBindingField.dataset.staticBindingField;
    if (role !== undefined && fieldId !== undefined) {
      const selected = context.state.staticBinding?.fields[role.id] ?? [];
      const next = selected.includes(fieldId)
        ? selected.filter((item) => item !== fieldId)
        : selected.length < role.maxFields
          ? [...selected, fieldId]
          : selected;
      context.state.staticBinding = {
        fields: { ...context.state.staticBinding?.fields, [role.id]: next },
      };
      context.renderSurface();
      context.restoreBindingFieldFocus('static', role.id, fieldId);
    }
    return true;
  }
  const staticAction = target.closest<HTMLButtonElement>('[data-static-action]');
  if (staticAction !== null) {
    handleStaticAction(context, staticAction);
    return true;
  }
  return false;
}

export function handleStaticChange(
  context: DesignerDatasetControllerContext,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): boolean {
  if (target.dataset.staticScalar === 'boolean' && target instanceof HTMLInputElement) {
    setStaticValue(context, target.checked);
    return true;
  }
  if (target.dataset.staticPageSize !== undefined && target instanceof HTMLSelectElement) {
    context.state.staticPageSize = normalizeDesignerStaticPageSize(Number(target.value));
    context.state.staticPage = 0;
    context.renderSurface();
    return true;
  }
  if (target.dataset.staticCellRow !== undefined && target instanceof HTMLInputElement) {
    updateStaticCell(
      context,
      Number(target.dataset.staticCellRow),
      target.dataset.staticCellField ?? '',
      target.value,
      false,
    );
    return true;
  }
  if (target.dataset.staticBindingRole !== undefined && target instanceof HTMLSelectElement) {
    const roleId = target.dataset.staticBindingRole;
    const selected = target.multiple
      ? [...target.selectedOptions].map((option) => option.value)
      : target.value === ''
        ? []
        : [target.value];
    context.state.staticBinding = {
      fields: { ...context.state.staticBinding?.fields, [roleId]: selected },
    };
    context.renderSurface();
    return true;
  }
  return false;
}

function handleStaticAction(
  context: DesignerDatasetControllerContext,
  button: HTMLButtonElement,
): void {
  const action = button.dataset.staticAction;
  if (action === 'apply') {
    context.apply();
    return;
  }
  if (action === 'tab-table' || action === 'tab-advanced') {
    context.state.staticTab = action === 'tab-table' ? 'table' : 'advanced';
    context.renderSurface();
    return;
  }
  if (action === 'row-add') {
    addStaticRow(context);
    return;
  }
  if (action === 'page-previous' || action === 'page-next') {
    const rows = currentStaticDataset(context)?.rows.length ?? 0;
    const nextPage = context.state.staticPage + (action === 'page-next' ? 1 : -1);
    context.state.staticPage = resolveDesignerStaticDataPagination(
      rows,
      nextPage,
      context.state.staticPageSize,
    ).page;
    context.renderSurface();
    return;
  }
  if (action === 'binding-select-all' || action === 'binding-clear') {
    const role = context
      .currentEntry()
      ?.manifest.dataBinding?.roles.find(
        (candidate) => candidate.id === button.dataset.staticBindingRole,
      );
    const dataset = currentStaticDataset(context);
    if (role !== undefined && dataset !== undefined) {
      const selected =
        action === 'binding-clear'
          ? []
          : dataset.fields
              .filter((field) => role.valueTypes.includes(field.valueType))
              .slice(0, role.maxFields)
              .map((field) => field.id);
      context.state.staticBinding = {
        fields: { ...context.state.staticBinding?.fields, [role.id]: selected },
      };
      context.renderSurface();
    }
    return;
  }
  const index = Number(button.dataset.staticIndex);
  if (!Number.isInteger(index)) return;
  if (action === 'row-remove') removeStaticRow(context, index);
}

function syncStaticValueFromJson(context: DesignerDatasetControllerContext): void {
  let source: unknown;
  try {
    source = JSON.parse(context.state.staticDraft);
  } catch {
    context.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
    return;
  }
  const parsed = parseScreenJsonValue(source);
  if (!parsed.ok) {
    context.setFeedback(formatStaticDiagnostic(context, parsed.diagnostics[0]));
    return;
  }
  const descriptor = context.currentEntry()?.manifest.staticData;
  if (descriptor?.kind === 'scalar' && typeof parsed.value !== descriptor.valueType) {
    context.setFeedback(DESIGNER_UI_TEXT.dataSource.staticInvalid);
    return;
  }
  if (descriptor?.kind === 'tabular') {
    const dataset = parseScreenTabularDataset(parsed.value);
    if (!dataset.ok) {
      context.setFeedback(formatStaticDiagnostic(context, dataset.diagnostics[0]));
      return;
    }
    context.state.staticValue =
      dataset.value as unknown as import('@base-screen/contracts').ScreenJsonValue;
  } else {
    context.state.staticValue = parsed.value;
  }
  context.setFeedback('');
}

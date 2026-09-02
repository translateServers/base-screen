import type {
  ScreenDocument,
  ScreenHostVariableDescriptor,
  ScreenHostVariableSummary,
  ScreenVariable,
} from '@base-screen/contracts';
import type { DesignerVariableReference } from '../../common/operations/designer-variable-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton } from './designer-ui-primitives.js';
import {
  appendVariableReferenceList,
  createVariableReferenceCount,
} from './designer-variable-references-dom.js';
import {
  appendCreateEditor,
  appendDeleteConfirmation,
  appendDescriptionEditor,
  appendIconLabel,
  appendRenameEditor,
  appendValueEditor,
  createBadge,
  type DesignerVariableCreateDraft,
} from './designer-variables-editor-dom.js';
import {
  appendVariablesEmptyState,
  appendVariablesToolbar,
} from './designer-variables-toolbar-dom.js';

export interface DesignerVariablesDraft {
  readonly creating: boolean;
  readonly create: DesignerVariableCreateDraft;
  readonly renamingIndex: number | undefined;
  readonly editingDescriptionIndex: number | undefined;
  readonly editingValueIndex: number | undefined;
  readonly deletingIndex: number | undefined;
  readonly search: string;
  readonly typeFilter: 'all' | ScreenVariable['type'];
  readonly referenceCounts: ReadonlyMap<string, number>;
  readonly references: readonly DesignerVariableReference[];
  readonly expandedVariableName: string | undefined;
  readonly expandedReferenceName: string | undefined;
  readonly catalog: DesignerVariableCatalogView;
}

const VALUE_SUMMARY_LENGTH = 40;

export interface DesignerVariableCatalogView {
  readonly query: string;
  readonly items: readonly ScreenHostVariableSummary[];
  readonly nextCursor: string | undefined;
  readonly feedback: string;
  readonly selected: ScreenHostVariableDescriptor | undefined;
  readonly previewVariableId: string | undefined;
  readonly previewStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  readonly previewSummary: string | undefined;
}

export function renderDesignerVariables(
  panel: HTMLElement,
  document: ScreenDocument | undefined,
  draft: DesignerVariablesDraft,
): void {
  panel.replaceChildren();
  const variables = document?.variables ?? [];
  panel.dataset.variableCount = String(variables.length);
  appendVariablesToolbar(panel, draft, variables.length);

  const content = panel.ownerDocument.createElement('div');
  content.className = 'variable-panel-content';
  if (draft.creating) appendCreateEditor(content, draft.create);

  const visible = variables
    .map((variable, index) => ({ variable, index }))
    .filter(({ variable }) => matchesFilter(variable, draft));
  if (visible.length === 0) {
    appendVariablesEmptyState(content, variables.length === 0);
  } else {
    const list = panel.ownerDocument.createElement('div');
    list.className = 'variable-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.list);
    for (const { variable, index } of visible) appendVariableRow(list, variable, index, draft);
    content.appendChild(list);
  }
  panel.appendChild(content);
}

function appendVariableRow(
  list: HTMLElement,
  variable: ScreenVariable,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const row = list.ownerDocument.createElement('div');
  row.className = 'variable-row';
  row.dataset.variableRow = String(index);
  row.dataset.variableType = variable.type;
  row.setAttribute('role', 'listitem');
  if (draft.renamingIndex === index) {
    row.dataset.variableEditor = 'rename';
    appendRenameEditor(row, variable, index);
  } else if (draft.editingDescriptionIndex === index) {
    row.dataset.variableEditor = 'description';
    appendDescriptionEditor(row, variable, index);
  } else if (draft.editingValueIndex === index && variable.type === 'static') {
    row.dataset.variableEditor = 'value';
    appendValueEditor(row, variable, index);
  } else if (draft.deletingIndex === index) {
    row.dataset.variableEditor = 'delete';
    appendDeleteConfirmation(row, variable.name, index);
  } else {
    appendVariableSummary(row, variable, index, draft);
  }
  list.appendChild(row);
}

function appendVariableSummary(
  row: HTMLElement,
  variable: ScreenVariable,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const expanded = draft.expandedVariableName === variable.name;
  const header = row.ownerDocument.createElement('div');
  header.className = 'variable-row-header';
  const toggle = createDesignerButton(row.ownerDocument, {
    ariaLabel: expanded
      ? DESIGNER_UI_TEXT.variables.collapseVariable(variable.name)
      : DESIGNER_UI_TEXT.variables.expandVariable(variable.name),
    className: 'variable-row-toggle',
    variant: 'ghost',
  });
  toggle.dataset.variableAction = 'toggle-variable';
  toggle.dataset.variableIndex = String(index);
  toggle.setAttribute('aria-expanded', String(expanded));
  const identity = row.ownerDocument.createElement('span');
  identity.className = 'variable-identity';
  identity.appendChild(createBadge(row.ownerDocument, variable.type));
  const name = row.ownerDocument.createElement('code');
  name.className = 'variable-name';
  name.textContent = variable.name;
  name.title = variable.name;
  identity.appendChild(name);
  toggle.appendChild(identity);
  const summary = row.ownerDocument.createElement('code');
  summary.className = 'variable-row-summary';
  summary.textContent =
    variable.type === 'static'
      ? summarizeValue(formatValueForDisplay(variable.value))
      : DESIGNER_UI_TEXT.variables.sourceHost;
  summary.title = variable.type === 'static' ? JSON.stringify(variable.value) : variable.variableId;
  toggle.appendChild(summary);
  const chevron = row.ownerDocument.createElement('span');
  chevron.className = 'variable-row-chevron';
  chevron.innerHTML = designerIcon(expanded ? 'chevron-down' : 'chevron-right');
  toggle.appendChild(chevron);
  header.appendChild(toggle);
  row.appendChild(header);
  if (!expanded) return;

  const details = row.ownerDocument.createElement('section');
  details.className = 'variable-details';
  details.setAttribute('aria-label', variable.name);
  details.appendChild(createDescriptionAction(row.ownerDocument, variable, index));
  details.appendChild(
    createDetailLine(
      row.ownerDocument,
      DESIGNER_UI_TEXT.variables.source,
      variable.type === 'static'
        ? DESIGNER_UI_TEXT.variables.sourceStatic
        : DESIGNER_UI_TEXT.variables.sourceHost,
    ),
  );
  const references = draft.references.filter(
    (reference) => reference.variableName === variable.name,
  );
  if (variable.type === 'host') {
    row.dataset.variableIdReadOnly = 'true';
    details.appendChild(createHostDetail(row.ownerDocument, variable.variableId));
  } else {
    details.appendChild(createValueDetail(row.ownerDocument, variable, index));
  }
  const usage = row.ownerDocument.createElement('div');
  usage.className = 'variable-usage';
  const usageLabel = row.ownerDocument.createElement('span');
  usageLabel.className = 'variable-detail-label';
  usageLabel.textContent = DESIGNER_UI_TEXT.variables.usage;
  usage.appendChild(usageLabel);
  usage.appendChild(
    createVariableReferenceCount(
      row.ownerDocument,
      variable,
      index,
      draft.referenceCounts.get(variable.name) ?? 0,
      draft.expandedReferenceName === variable.name,
    ),
  );
  details.appendChild(usage);
  if (draft.expandedReferenceName === variable.name) {
    appendVariableReferenceList(details, variable, index, references);
  }
  if (variable.type === 'host') appendPreview(details, variable.variableId, draft.catalog);
  appendVariableActions(details, variable, index);
  row.appendChild(details);
}

function createDescriptionAction(
  ownerDocument: Document,
  variable: ScreenVariable,
  index: number,
): HTMLElement {
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.editDescription(variable.name),
    className: 'variable-description-action',
    variant: 'ghost',
  });
  button.dataset.variableAction = 'edit-description';
  button.dataset.variableIndex = String(index);
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'variable-detail-glyph';
  glyph.innerHTML = designerIcon('sliders');
  button.appendChild(glyph);
  const copy = ownerDocument.createElement('span');
  copy.textContent = variable.description ?? DESIGNER_UI_TEXT.variables.addDescription;
  button.appendChild(copy);
  return button;
}

function createDetailLine(ownerDocument: Document, label: string, value: string): HTMLElement {
  const detail = ownerDocument.createElement('div');
  detail.className = 'variable-detail-line';
  const labelElement = ownerDocument.createElement('span');
  labelElement.className = 'variable-detail-label';
  labelElement.textContent = label;
  detail.appendChild(labelElement);
  const valueElement = ownerDocument.createElement('span');
  valueElement.className = 'variable-detail-copy';
  valueElement.textContent = value;
  detail.appendChild(valueElement);
  return detail;
}

function createHostDetail(ownerDocument: Document, variableId: string): HTMLElement {
  const detail = ownerDocument.createElement('div');
  detail.className = 'variable-host-detail';
  const label = ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.variableId;
  detail.appendChild(label);
  const id = ownerDocument.createElement('code');
  id.className = 'variable-host-id';
  id.textContent = variableId;
  id.title = variableId;
  detail.appendChild(id);
  return detail;
}

function createValueDetail(
  ownerDocument: Document,
  variable: Extract<ScreenVariable, { type: 'static' }>,
  index: number,
): HTMLElement {
  const serialized = JSON.stringify(variable.value);
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.editValue(variable.name),
    className: 'variable-value-button',
    title: serialized,
    variant: 'ghost',
  });
  button.dataset.variableAction = 'edit-value';
  button.dataset.variableIndex = String(index);
  const label = ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.value;
  button.appendChild(label);
  const value = ownerDocument.createElement('code');
  value.className = 'variable-value';
  value.textContent = summarizeValue(formatValueForDisplay(variable.value));
  button.appendChild(value);
  const editGlyph = ownerDocument.createElement('span');
  editGlyph.className = 'variable-detail-glyph';
  editGlyph.innerHTML = designerIcon('pencil');
  button.appendChild(editGlyph);
  return button;
}

function appendVariableActions(
  details: HTMLElement,
  variable: ScreenVariable,
  index: number,
): void {
  const actions = details.ownerDocument.createElement('footer');
  actions.className = 'variable-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.actions(variable.name));
  if (variable.type === 'host') {
    const preview = createTextAction(
      details.ownerDocument,
      'preview',
      index,
      'eye',
      DESIGNER_UI_TEXT.variables.previewAction,
      DESIGNER_UI_TEXT.variables.preview(variable.name),
    );
    preview.dataset.variableId = variable.variableId;
    actions.appendChild(preview);
  }
  actions.appendChild(
    createTextAction(
      details.ownerDocument,
      'rename',
      index,
      'pencil',
      DESIGNER_UI_TEXT.variables.rename,
      DESIGNER_UI_TEXT.variables.renameVariable(variable.name),
    ),
  );
  actions.appendChild(
    createTextAction(
      details.ownerDocument,
      'duplicate',
      index,
      'copy',
      DESIGNER_UI_TEXT.variables.copy,
      DESIGNER_UI_TEXT.variables.duplicate(variable.name),
    ),
  );
  const remove = createTextAction(
    details.ownerDocument,
    'delete',
    index,
    'trash',
    DESIGNER_UI_TEXT.variables.delete,
    DESIGNER_UI_TEXT.variables.deleteVariable(variable.name),
  );
  remove.dataset.variant = 'danger';
  actions.appendChild(remove);
  details.appendChild(actions);
}

function createTextAction(
  ownerDocument: Document,
  action: 'rename' | 'duplicate' | 'delete' | 'preview',
  index: number,
  icon: 'pencil' | 'copy' | 'trash' | 'eye',
  label: string,
  accessibleLabel: string,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: accessibleLabel,
    className: 'variable-text-action',
    variant: 'ghost',
  });
  button.dataset.variableAction = action;
  button.dataset.variableIndex = String(index);
  appendIconLabel(button, icon, label);
  return button;
}

function appendPreview(
  row: HTMLElement,
  variableId: string,
  catalog: DesignerVariableCatalogView,
): void {
  if (catalog.previewVariableId !== variableId || catalog.previewStatus === 'idle') return;
  const preview = row.ownerDocument.createElement('section');
  preview.className = 'variable-preview';
  preview.dataset.variablePreviewStatus = catalog.previewStatus;
  const label = row.ownerDocument.createElement('strong');
  label.textContent =
    catalog.previewStatus === 'ready'
      ? DESIGNER_UI_TEXT.variables.previewReady
      : catalog.previewStatus === 'loading'
        ? DESIGNER_UI_TEXT.variables.previewLoading
        : catalog.previewStatus === 'unavailable'
          ? DESIGNER_UI_TEXT.variables.previewUnavailable
          : DESIGNER_UI_TEXT.variables.previewFailed;
  preview.appendChild(label);
  if (catalog.previewSummary !== undefined) {
    const summary = row.ownerDocument.createElement('pre');
    summary.textContent = catalog.previewSummary;
    preview.appendChild(summary);
  }
  row.appendChild(preview);
}

function matchesFilter(variable: ScreenVariable, draft: DesignerVariablesDraft): boolean {
  if (draft.typeFilter !== 'all' && variable.type !== draft.typeFilter) return false;
  const query = draft.search.trim().toLocaleLowerCase();
  if (query === '') return true;
  return [
    variable.name,
    variable.description ?? '',
    variable.type === 'host' ? variable.variableId : '',
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function summarizeValue(serialized: string): string {
  return serialized.length > VALUE_SUMMARY_LENGTH
    ? `${serialized.slice(0, VALUE_SUMMARY_LENGTH)}…`
    : serialized;
}

function formatValueForDisplay(
  value: Extract<ScreenVariable, { type: 'static' }>['value'],
): string {
  return typeof value === 'string' && value !== '' ? value : JSON.stringify(value);
}

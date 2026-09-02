import type {
  ScreenDocument,
  ScreenHostVariableDescriptor,
  ScreenHostVariableSummary,
  ScreenVariable,
} from '@base-screen/contracts';
import type { DesignerVariableReference } from '../../common/operations/designer-variable-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import {
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from './designer-ui-primitives.js';
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
  createIconAction,
  type DesignerVariableCreateDraft,
} from './designer-variables-editor-dom.js';

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
  appendToolbar(panel, draft);

  const content = panel.ownerDocument.createElement('div');
  content.className = 'variable-panel-content';
  if (draft.creating) appendCreateEditor(content, draft.create);

  const visible = variables
    .map((variable, index) => ({ variable, index }))
    .filter(({ variable }) => matchesFilter(variable, draft));
  if (visible.length === 0) {
    const empty = panel.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state variable-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.variables.empty;
    content.appendChild(empty);
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

function appendToolbar(panel: HTMLElement, draft: DesignerVariablesDraft): void {
  const toolbar = panel.ownerDocument.createElement('div');
  toolbar.className = 'variable-panel-toolbar';
  const description = panel.ownerDocument.createElement('p');
  description.className = 'variable-panel-description';
  description.textContent = DESIGNER_UI_TEXT.variables.description;
  toolbar.appendChild(description);
  const filters = panel.ownerDocument.createElement('div');
  filters.className = 'variable-panel-filters';
  const search = createDesignerInput(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.search,
    placeholder: DESIGNER_UI_TEXT.variables.search,
    value: draft.search,
  });
  search.dataset.variableSearch = 'true';
  filters.appendChild(search);
  const type = createDesignerSelect(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.filterAll,
    value: draft.typeFilter,
    options: [
      { value: 'all', label: DESIGNER_UI_TEXT.variables.filterAll },
      { value: 'static', label: DESIGNER_UI_TEXT.variables.typeStatic },
      { value: 'host', label: DESIGNER_UI_TEXT.variables.typeHost },
    ],
  });
  type.dataset.variableTypeFilter = 'true';
  filters.appendChild(type);
  toolbar.appendChild(filters);
  const add = createDesignerButton(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.add,
    className: 'variable-add-button',
    disabled: draft.creating,
    title: DESIGNER_UI_TEXT.variables.add,
    variant: 'primary',
  });
  add.dataset.variableAction = 'add';
  appendIconLabel(add, 'plus', DESIGNER_UI_TEXT.variables.add);
  toolbar.appendChild(add);
  panel.appendChild(toolbar);
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
  const header = row.ownerDocument.createElement('div');
  header.className = 'variable-row-header';
  header.appendChild(createBadge(row.ownerDocument, variable.type));
  const name = row.ownerDocument.createElement('code');
  name.className = 'variable-name';
  name.textContent = variable.name;
  name.title = variable.name;
  header.appendChild(name);
  const actions = row.ownerDocument.createElement('div');
  actions.className = 'variable-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', variable.name);
  actions.appendChild(
    createIconAction(
      row.ownerDocument,
      'rename',
      index,
      'pencil',
      DESIGNER_UI_TEXT.variables.renameVariable(variable.name),
    ),
  );
  actions.appendChild(
    createIconAction(
      row.ownerDocument,
      'edit-description',
      index,
      'sliders',
      DESIGNER_UI_TEXT.variables.editDescription(variable.name),
    ),
  );
  actions.appendChild(
    createIconAction(
      row.ownerDocument,
      'duplicate',
      index,
      'copy',
      DESIGNER_UI_TEXT.variables.duplicate(variable.name),
    ),
  );
  const remove = createIconAction(
    row.ownerDocument,
    'delete',
    index,
    'trash',
    DESIGNER_UI_TEXT.variables.deleteVariable(variable.name),
  );
  remove.dataset.variant = 'danger';
  actions.appendChild(remove);
  header.appendChild(actions);
  row.appendChild(header);

  const meta = row.ownerDocument.createElement('div');
  meta.className = 'variable-meta';
  const references = draft.references.filter(
    (reference) => reference.variableName === variable.name,
  );
  meta.appendChild(
    createVariableReferenceCount(
      row.ownerDocument,
      variable,
      index,
      draft.referenceCounts.get(variable.name) ?? 0,
      draft.expandedReferenceName === variable.name,
    ),
  );
  if (variable.description !== undefined) {
    const description = row.ownerDocument.createElement('span');
    description.className = 'variable-description';
    description.textContent = variable.description;
    meta.appendChild(description);
  }
  row.appendChild(meta);
  if (draft.expandedReferenceName === variable.name) {
    appendVariableReferenceList(row, variable, index, references);
  }

  if (variable.type === 'host') {
    row.dataset.variableIdReadOnly = 'true';
    row.appendChild(createHostDetail(row.ownerDocument, variable.variableId, variable.name, index));
    appendPreview(row, variable.variableId, draft.catalog);
    return;
  }
  const serialized = JSON.stringify(variable.value);
  const valueButton = row.ownerDocument.createElement('button');
  valueButton.type = 'button';
  valueButton.className = 'designer-control variable-value-button';
  valueButton.dataset.variableAction = 'edit-value';
  valueButton.dataset.variableIndex = String(index);
  valueButton.title = serialized;
  valueButton.ariaLabel = DESIGNER_UI_TEXT.variables.editValue(variable.name);
  const label = row.ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.value;
  valueButton.appendChild(label);
  const value = row.ownerDocument.createElement('code');
  value.className = 'variable-value';
  value.textContent = summarizeValue(serialized);
  valueButton.appendChild(value);
  const editGlyph = row.ownerDocument.createElement('span');
  editGlyph.className = 'variable-detail-glyph';
  editGlyph.innerHTML = designerIcon('pencil');
  valueButton.appendChild(editGlyph);
  row.appendChild(valueButton);
}

function createHostDetail(
  ownerDocument: Document,
  variableId: string,
  variableName: string,
  index: number,
): HTMLElement {
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
  const preview = createIconAction(
    ownerDocument,
    'preview',
    index,
    'eye',
    DESIGNER_UI_TEXT.variables.preview(variableName),
  );
  preview.dataset.variableId = variableId;
  detail.appendChild(preview);
  return detail;
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

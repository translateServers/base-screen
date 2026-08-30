import type { ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton } from './designer-ui-primitives.js';

import {
  appendCreateEditor,
  appendDeleteConfirmation,
  appendIconLabel,
  appendInlineEditor,
  createBadge,
  createIconAction,
} from './designer-variables-editor-dom.js';

/** 变量面板交互状态：新建、重命名、值编辑与删除确认互斥。 */
export interface DesignerVariablesDraft {
  readonly creating: boolean;
  readonly renamingIndex: number | undefined;
  readonly editingValueIndex: number | undefined;
  readonly deletingIndex: number | undefined;
}

const VALUE_SUMMARY_LENGTH = 40;

/** 渲染左侧「变量」面板（ADR-0054 R1-R3）。 */
export function renderDesignerVariables(
  panel: HTMLElement,
  document: ScreenDocument | undefined,
  draft: DesignerVariablesDraft,
): void {
  panel.replaceChildren();
  const variables = document?.variables ?? [];
  panel.dataset.variableCount = String(variables.length);
  appendToolbar(panel, draft.creating);

  const content = panel.ownerDocument.createElement('div');
  content.className = 'variable-panel-content';
  if (draft.creating) appendCreateEditor(content);

  if (variables.length === 0) {
    const empty = panel.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state variable-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.variables.empty;
    content.appendChild(empty);
  } else {
    const list = panel.ownerDocument.createElement('div');
    list.className = 'variable-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.list);
    for (let index = 0; index < variables.length; index++) {
      appendVariableRow(list, variables[index]!, index, draft);
    }
    content.appendChild(list);
  }
  panel.appendChild(content);
}

function appendToolbar(panel: HTMLElement, creating: boolean): void {
  const toolbar = panel.ownerDocument.createElement('div');
  toolbar.className = 'variable-panel-toolbar';
  const description = panel.ownerDocument.createElement('p');
  description.className = 'variable-panel-description';
  description.textContent = DESIGNER_UI_TEXT.variables.description;
  toolbar.appendChild(description);

  const add = createDesignerButton(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.add,
    className: 'variable-add-button',
    disabled: creating,
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

  if (draft.renamingIndex === index && variable.type === 'static') {
    row.dataset.variableEditor = 'rename';
    appendInlineEditor(row, variable, index, 'rename');
  } else if (draft.editingValueIndex === index && variable.type === 'static') {
    row.dataset.variableEditor = 'value';
    appendInlineEditor(row, variable, index, 'value');
  } else if (draft.deletingIndex === index && variable.type === 'static') {
    row.dataset.variableEditor = 'delete';
    appendDeleteConfirmation(row, variable.name, index);
  } else {
    appendVariableSummary(row, variable, index);
  }
  list.appendChild(row);
}

function appendVariableSummary(row: HTMLElement, variable: ScreenVariable, index: number): void {
  const header = row.ownerDocument.createElement('div');
  header.className = 'variable-row-header';
  header.appendChild(createBadge(row.ownerDocument, variable.type));

  const name = row.ownerDocument.createElement('code');
  name.className = 'variable-name';
  name.textContent = variable.name;
  name.title = variable.name;
  header.appendChild(name);

  if (variable.type === 'static') {
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
  } else {
    row.dataset.variableReadOnly = 'true';
  }
  row.appendChild(header);

  if (variable.type === 'host') {
    row.appendChild(createHostDetail(row.ownerDocument, variable.variableId));
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
  const readOnly = ownerDocument.createElement('span');
  readOnly.className = 'variable-readonly';
  appendIconLabel(readOnly, 'lock', DESIGNER_UI_TEXT.variables.readOnly);
  detail.appendChild(readOnly);
  return detail;
}

function summarizeValue(serialized: string): string {
  return serialized.length > VALUE_SUMMARY_LENGTH
    ? `${serialized.slice(0, VALUE_SUMMARY_LENGTH)}…`
    : serialized;
}

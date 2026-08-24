import type { ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

/** 变量面板交互状态：新建行、重命名/值编辑行索引。 */
export interface DesignerVariablesDraft {
  readonly creating: boolean;
  readonly renamingIndex: number | undefined;
  readonly editingValueIndex: number | undefined;
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

  const header = panel.ownerDocument.createElement('div');
  header.className = 'variable-panel-header';
  const title = panel.ownerDocument.createElement('span');
  title.className = 'variable-panel-title';
  title.textContent = DESIGNER_UI_TEXT.variables.title;
  header.appendChild(title);
  const add = panel.ownerDocument.createElement('button');
  add.type = 'button';
  add.className = 'designer-control designer-button designer-icon-button';
  add.dataset.variableAction = 'add';
  add.title = DESIGNER_UI_TEXT.variables.add;
  add.ariaLabel = DESIGNER_UI_TEXT.variables.add;
  add.textContent = DESIGNER_UI_TEXT.variables.add;
  header.appendChild(add);
  panel.appendChild(header);

  if (variables.length === 0 && !draft.creating) {
    const empty = panel.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.variables.empty;
    panel.appendChild(empty);
  }

  for (let index = 0; index < variables.length; index++) {
    appendVariableRow(panel, variables[index]!, index, draft);
  }
  if (draft.creating) appendCreateRow(panel);
}

function appendVariableRow(
  panel: HTMLElement,
  variable: ScreenVariable,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const row = panel.ownerDocument.createElement('div');
  row.className = 'variable-row';
  row.dataset.variableRow = String(index);

  const badge = panel.ownerDocument.createElement('span');
  badge.className = 'variable-badge';
  badge.dataset.variableType = variable.type;
  badge.textContent =
    variable.type === 'static'
      ? DESIGNER_UI_TEXT.variables.typeStatic
      : DESIGNER_UI_TEXT.variables.typeHost;
  row.appendChild(badge);

  if (draft.renamingIndex === index) {
    const rename = panel.ownerDocument.createElement('input');
    rename.type = 'text';
    rename.className = 'designer-control designer-input variable-edit-input';
    rename.value = variable.name;
    rename.dataset.variableRename = String(index);
    rename.ariaLabel = DESIGNER_UI_TEXT.variables.rename;
    row.appendChild(rename);
    appendConfirmCancel(row, 'confirm-rename', index, panel.ownerDocument);
    panel.appendChild(row);
    return;
  }

  const name = panel.ownerDocument.createElement('span');
  name.className = 'variable-name';
  name.textContent = variable.name;
  name.title = variable.name;
  row.appendChild(name);

  if (variable.type === 'host') {
    const id = panel.ownerDocument.createElement('span');
    id.className = 'variable-host-id';
    id.textContent = variable.variableId;
    id.title = `variableId: ${variable.variableId}`;
    row.appendChild(id);
    panel.appendChild(row);
    return;
  }

  if (draft.editingValueIndex === index) {
    const value = panel.ownerDocument.createElement('input');
    value.type = 'text';
    value.className = 'designer-control designer-input variable-edit-input';
    value.value = JSON.stringify(variable.value);
    value.dataset.variableValue = String(index);
    value.ariaLabel = DESIGNER_UI_TEXT.variables.value;
    row.appendChild(value);
    appendConfirmCancel(row, 'confirm-value', index, panel.ownerDocument);
    panel.appendChild(row);
    return;
  }

  const value = panel.ownerDocument.createElement('span');
  value.className = 'variable-value';
  const serialized = JSON.stringify(variable.value);
  value.textContent =
    serialized.length > VALUE_SUMMARY_LENGTH
      ? `${serialized.slice(0, VALUE_SUMMARY_LENGTH)}…`
      : serialized;
  value.title = serialized;
  value.dataset.variableAction = 'edit-value';
  value.dataset.variableIndex = String(index);
  row.appendChild(value);

  const renameButton = panel.ownerDocument.createElement('button');
  renameButton.type = 'button';
  renameButton.className = 'designer-control designer-button designer-icon-button';
  renameButton.dataset.variableAction = 'rename';
  renameButton.dataset.variableIndex = String(index);
  renameButton.title = DESIGNER_UI_TEXT.variables.rename;
  renameButton.ariaLabel = DESIGNER_UI_TEXT.variables.rename;
  renameButton.textContent = DESIGNER_UI_TEXT.variables.rename;
  row.appendChild(renameButton);

  const deleteButton = panel.ownerDocument.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'designer-control designer-button designer-icon-button';
  deleteButton.dataset.variableAction = 'delete';
  deleteButton.dataset.variableIndex = String(index);
  deleteButton.title = DESIGNER_UI_TEXT.variables.delete;
  deleteButton.ariaLabel = DESIGNER_UI_TEXT.variables.delete;
  deleteButton.textContent = DESIGNER_UI_TEXT.variables.delete;
  row.appendChild(deleteButton);

  panel.appendChild(row);
}

function appendCreateRow(panel: HTMLElement): void {
  const row = panel.ownerDocument.createElement('div');
  row.className = 'variable-row variable-create-row';

  const badge = panel.ownerDocument.createElement('span');
  badge.className = 'variable-badge';
  badge.dataset.variableType = 'static';
  badge.textContent = DESIGNER_UI_TEXT.variables.typeStatic;
  row.appendChild(badge);

  const name = panel.ownerDocument.createElement('input');
  name.type = 'text';
  name.className = 'designer-control designer-input variable-edit-input';
  name.placeholder = DESIGNER_UI_TEXT.variables.name;
  name.dataset.variableCreateName = 'true';
  name.ariaLabel = DESIGNER_UI_TEXT.variables.name;
  row.appendChild(name);

  const value = panel.ownerDocument.createElement('input');
  value.type = 'text';
  value.className = 'designer-control designer-input variable-edit-input';
  value.placeholder = DESIGNER_UI_TEXT.variables.value;
  value.dataset.variableCreateValue = 'true';
  value.ariaLabel = DESIGNER_UI_TEXT.variables.value;
  row.appendChild(value);

  appendConfirmCancel(row, 'confirm-create', -1, panel.ownerDocument);
  panel.appendChild(row);
}

function appendConfirmCancel(
  row: HTMLElement,
  action: 'confirm-create' | 'confirm-rename' | 'confirm-value',
  index: number,
  ownerDocument: Document,
): void {
  const confirm = ownerDocument.createElement('button');
  confirm.type = 'button';
  confirm.className = 'designer-control designer-button designer-icon-button';
  confirm.dataset.variableAction = action;
  confirm.dataset.variableIndex = String(index);
  confirm.textContent = '✓';
  confirm.title = DESIGNER_UI_TEXT.variables.editHint;
  confirm.ariaLabel = DESIGNER_UI_TEXT.variables.confirm;
  row.appendChild(confirm);

  const cancel = ownerDocument.createElement('button');
  cancel.type = 'button';
  cancel.className = 'designer-control designer-button designer-icon-button';
  cancel.dataset.variableAction = 'cancel';
  cancel.textContent = '✕';
  cancel.title = DESIGNER_UI_TEXT.variables.editHint;
  cancel.ariaLabel = DESIGNER_UI_TEXT.variables.cancel;
  row.appendChild(cancel);
}

import type { ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import {
  createDesignerButton,
  createDesignerIconButton,
  createDesignerInput,
} from './designer-ui-primitives.js';

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

function appendCreateEditor(content: HTMLElement): void {
  const editor = content.ownerDocument.createElement('section');
  editor.className = 'variable-editor variable-create-row';
  editor.dataset.variableEditor = 'create';
  editor.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.createTitle);
  appendEditorHeading(editor, DESIGNER_UI_TEXT.variables.createTitle);
  const errorId = 'designer-variable-create-error';
  appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.name,
    hint: DESIGNER_UI_TEXT.variables.nameHint,
    dataKey: 'variableCreateName',
    describedBy: errorId,
  });
  appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.value,
    hint: DESIGNER_UI_TEXT.variables.valueHint,
    dataKey: 'variableCreateValue',
    describedBy: errorId,
    json: true,
  });
  appendEditorError(editor, errorId);
  appendEditorActions(editor, 'confirm-create', -1, DESIGNER_UI_TEXT.variables.create);
  content.appendChild(editor);
}

function appendInlineEditor(
  row: HTMLElement,
  variable: Extract<ScreenVariable, { type: 'static' }>,
  index: number,
  kind: 'rename' | 'value',
): void {
  const title =
    kind === 'rename'
      ? DESIGNER_UI_TEXT.variables.renameTitle
      : DESIGNER_UI_TEXT.variables.editValueTitle;
  appendEditorHeading(row, title, variable.name);
  const errorId = `designer-variable-${kind}-error-${index}`;
  const input = appendEditorField(row, {
    label: kind === 'rename' ? DESIGNER_UI_TEXT.variables.name : DESIGNER_UI_TEXT.variables.value,
    hint:
      kind === 'rename'
        ? DESIGNER_UI_TEXT.variables.nameHint
        : DESIGNER_UI_TEXT.variables.valueHint,
    dataKey: kind === 'rename' ? 'variableRename' : 'variableValue',
    dataValue: String(index),
    describedBy: errorId,
    json: kind === 'value',
  });
  input.value = kind === 'rename' ? variable.name : JSON.stringify(variable.value);
  appendEditorError(row, errorId);
  appendEditorActions(
    row,
    kind === 'rename' ? 'confirm-rename' : 'confirm-value',
    index,
    DESIGNER_UI_TEXT.variables.save,
  );
}

function appendDeleteConfirmation(row: HTMLElement, name: string, index: number): void {
  const confirmation = row.ownerDocument.createElement('div');
  confirmation.className = 'variable-delete-confirmation';
  const glyph = row.ownerDocument.createElement('span');
  glyph.className = 'variable-delete-glyph';
  glyph.innerHTML = designerIcon('trash');
  confirmation.appendChild(glyph);
  const copy = row.ownerDocument.createElement('span');
  copy.className = 'variable-delete-copy';
  const title = row.ownerDocument.createElement('strong');
  title.textContent = DESIGNER_UI_TEXT.variables.confirmDeleteVariable(name);
  copy.appendChild(title);
  const hint = row.ownerDocument.createElement('small');
  hint.textContent = DESIGNER_UI_TEXT.variables.deleteHint;
  copy.appendChild(hint);
  confirmation.appendChild(copy);
  row.appendChild(confirmation);
  appendEditorActions(row, 'confirm-delete', index, DESIGNER_UI_TEXT.variables.delete, true);
}

interface EditorFieldOptions {
  readonly label: string;
  readonly hint: string;
  readonly dataKey:
    | 'variableCreateName'
    | 'variableCreateValue'
    | 'variableRename'
    | 'variableValue';
  readonly dataValue?: string;
  readonly describedBy: string;
  readonly json?: boolean;
}

function appendEditorField(editor: HTMLElement, options: EditorFieldOptions): HTMLInputElement {
  const field = editor.ownerDocument.createElement('label');
  field.className = 'variable-field';
  const label = editor.ownerDocument.createElement('span');
  label.className = 'variable-field-label';
  label.textContent = options.label;
  field.appendChild(label);
  const input = createDesignerInput(editor.ownerDocument, {
    className: 'variable-edit-input',
  });
  input.dataset[options.dataKey] = options.dataValue ?? 'true';
  input.autocomplete = 'off';
  input.spellcheck = !options.json;
  const hintId = `${options.describedBy}-${options.dataKey}-hint`;
  input.setAttribute('aria-describedby', `${hintId} ${options.describedBy}`);
  field.appendChild(input);
  const hint = editor.ownerDocument.createElement('small');
  hint.id = hintId;
  hint.className = 'variable-field-hint';
  hint.textContent = options.hint;
  field.appendChild(hint);
  editor.appendChild(field);
  return input;
}

function appendEditorHeading(editor: HTMLElement, title: string, context?: string): void {
  const heading = editor.ownerDocument.createElement('header');
  heading.className = 'variable-editor-heading';
  heading.appendChild(createBadge(editor.ownerDocument, 'static'));
  const copy = editor.ownerDocument.createElement('span');
  copy.className = 'variable-editor-title';
  const strong = editor.ownerDocument.createElement('strong');
  strong.textContent = title;
  copy.appendChild(strong);
  if (context !== undefined) {
    const code = editor.ownerDocument.createElement('code');
    code.textContent = context;
    code.title = context;
    copy.appendChild(code);
  }
  heading.appendChild(copy);
  editor.appendChild(heading);
}

function appendEditorError(editor: HTMLElement, id: string): void {
  const error = editor.ownerDocument.createElement('p');
  error.id = id;
  error.className = 'variable-editor-error';
  error.dataset.variableError = 'true';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  editor.appendChild(error);
}

function appendEditorActions(
  editor: HTMLElement,
  action: 'confirm-create' | 'confirm-rename' | 'confirm-value' | 'confirm-delete',
  index: number,
  confirmLabel: string,
  danger = false,
): void {
  const actions = editor.ownerDocument.createElement('footer');
  actions.className = 'variable-editor-actions';
  const cancel = createDesignerButton(editor.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.cancel,
    text: DESIGNER_UI_TEXT.variables.cancel,
    variant: 'ghost',
  });
  cancel.dataset.variableAction = 'cancel';
  cancel.dataset.variableIndex = String(index);
  actions.appendChild(cancel);

  const confirm = createDesignerButton(editor.ownerDocument, {
    ariaLabel: danger ? DESIGNER_UI_TEXT.variables.delete : DESIGNER_UI_TEXT.variables.confirm,
    title: DESIGNER_UI_TEXT.variables.editHint,
    variant: danger ? 'danger' : 'primary',
  });
  confirm.dataset.variableAction = action;
  confirm.dataset.variableIndex = String(index);
  appendIconLabel(confirm, danger ? 'trash' : 'check', confirmLabel);
  actions.appendChild(confirm);
  editor.appendChild(actions);
}

function createBadge(ownerDocument: Document, type: ScreenVariable['type']): HTMLElement {
  const badge = ownerDocument.createElement('span');
  badge.className = 'variable-badge';
  badge.dataset.variableType = type;
  badge.textContent =
    type === 'static' ? DESIGNER_UI_TEXT.variables.typeStatic : DESIGNER_UI_TEXT.variables.typeHost;
  return badge;
}

function createIconAction(
  ownerDocument: Document,
  action: 'rename' | 'delete',
  index: number,
  icon: DesignerIconName,
  label: string,
): HTMLButtonElement {
  const button = createDesignerIconButton(ownerDocument, {
    icon,
    label,
    variant: 'ghost',
  });
  button.dataset.variableAction = action;
  button.dataset.variableIndex = String(index);
  return button;
}

function appendIconLabel(target: HTMLElement, icon: DesignerIconName, label: string): void {
  const glyph = target.ownerDocument.createElement('span');
  glyph.className = 'variable-button-glyph';
  glyph.innerHTML = designerIcon(icon);
  target.appendChild(glyph);
  const copy = target.ownerDocument.createElement('span');
  copy.className = 'variable-button-label';
  copy.textContent = label;
  target.appendChild(copy);
}

function summarizeValue(serialized: string): string {
  return serialized.length > VALUE_SUMMARY_LENGTH
    ? `${serialized.slice(0, VALUE_SUMMARY_LENGTH)}…`
    : serialized;
}

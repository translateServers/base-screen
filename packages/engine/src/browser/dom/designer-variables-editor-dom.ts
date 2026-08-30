import type { ScreenVariable } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import {
  createDesignerButton,
  createDesignerIconButton,
  createDesignerInput,
} from './designer-ui-primitives.js';

export function createBadge(ownerDocument: Document, type: ScreenVariable['type']): HTMLElement {
  const badge = ownerDocument.createElement('span');
  badge.className = 'variable-badge';
  badge.dataset.variableType = type;
  badge.textContent =
    type === 'static' ? DESIGNER_UI_TEXT.variables.typeStatic : DESIGNER_UI_TEXT.variables.typeHost;
  return badge;
}

export function appendCreateEditor(content: HTMLElement): void {
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

export function appendInlineEditor(
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

export function appendDeleteConfirmation(row: HTMLElement, name: string, index: number): void {
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

export function createIconAction(
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

export function appendIconLabel(target: HTMLElement, icon: DesignerIconName, label: string): void {
  const glyph = target.ownerDocument.createElement('span');
  glyph.className = 'variable-button-glyph';
  glyph.innerHTML = designerIcon(icon);
  target.appendChild(glyph);
  const copy = target.ownerDocument.createElement('span');
  copy.className = 'variable-button-label';
  copy.textContent = label;
  target.appendChild(copy);
}

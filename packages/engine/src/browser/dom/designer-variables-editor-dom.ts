import type { ScreenHostVariableSummary, ScreenVariable } from '@base-screen/contracts';
import type { DesignerVariableView } from '../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton, createDesignerInput } from './designer-ui-primitives.js';

export interface DesignerVariableCreateDraft {
  readonly type: ScreenVariable['type'];
  readonly name: string;
  readonly description: string;
  readonly valueSource: string;
  readonly sourceId: string | undefined;
  readonly processorId: string;
  readonly controlled: boolean;
  readonly autoUpdate: boolean;
  readonly autoUpdateInterval: string;
  readonly catalogQuery: string;
  readonly catalogItems: readonly ScreenHostVariableSummary[];
  readonly catalogCursor: string | undefined;
  readonly catalogFeedback: string;
  readonly previewStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  readonly previewSummary: string | undefined;
}

export function createBadge(ownerDocument: Document, type: ScreenVariable['type']): HTMLElement {
  const badge = ownerDocument.createElement('span');
  badge.className = 'variable-badge';
  badge.dataset.variableType = type;
  badge.textContent = sourceTypeLabel(type);
  return badge;
}

export function appendCreateEditor(
  content: HTMLElement,
  draft: DesignerVariableCreateDraft,
  configuringIndex?: number,
): void {
  const editor = content.ownerDocument.createElement('section');
  editor.className = 'variable-editor variable-create-row';
  editor.dataset.variableEditor = configuringIndex === undefined ? 'create' : 'configuration';
  editor.dataset.variableIndex = String(configuringIndex ?? -1);
  editor.dataset.variableCreateType = draft.type;
  const title =
    configuringIndex === undefined
      ? DESIGNER_UI_TEXT.variables.createTitle
      : DESIGNER_UI_TEXT.variables.editConfigurationTitle;
  editor.setAttribute('aria-label', title);
  appendEditorHeading(editor, title);
  const intro = editor.ownerDocument.createElement('p');
  intro.className = 'variable-editor-intro';
  intro.textContent = DESIGNER_UI_TEXT.variables.createIntro;
  editor.appendChild(intro);
  const errorId = 'designer-variable-create-error';
  const name = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.name,
    hint: DESIGNER_UI_TEXT.variables.nameHint,
    dataKey: 'variableCreateName',
    describedBy: errorId,
  });
  name.value = draft.name;
  const description = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.descriptionLabel,
    hint: DESIGNER_UI_TEXT.variables.descriptionHint,
    dataKey: 'variableCreateDescription',
    describedBy: errorId,
  });
  description.value = draft.description;
  appendCreateTypeChooser(editor, draft.type);
  const value = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.initialValue,
    hint: DESIGNER_UI_TEXT.variables.valueHint,
    dataKey: 'variableCreateValue',
    describedBy: errorId,
    json: true,
  });
  value.value = draft.valueSource;
  if (draft.type !== 'static') {
    appendHostCatalog(editor, draft);
    const processor = appendEditorField(editor, {
      label: DESIGNER_UI_TEXT.variables.processor,
      hint: DESIGNER_UI_TEXT.variables.processorHint,
      dataKey: 'variableCreateProcessor',
      describedBy: errorId,
    });
    processor.value = draft.processorId;
    appendCheckboxField(
      editor,
      DESIGNER_UI_TEXT.variables.controlled,
      DESIGNER_UI_TEXT.variables.controlledHint,
      'variableCreateControlled',
      draft.controlled,
    );
    if (draft.type === 'data-source') {
      appendCheckboxField(
        editor,
        DESIGNER_UI_TEXT.variables.autoUpdate,
        DESIGNER_UI_TEXT.variables.autoUpdateHint,
        'variableCreateAutoUpdate',
        draft.autoUpdate,
      );
      const interval = appendEditorField(editor, {
        label: DESIGNER_UI_TEXT.variables.autoUpdateFrequency,
        hint: DESIGNER_UI_TEXT.variables.autoUpdateFrequencyHint,
        dataKey: 'variableCreateAutoUpdateInterval',
        describedBy: errorId,
      });
      interval.type = 'number';
      interval.min = '1';
      interval.max = '86400';
      interval.step = '1';
      interval.value = draft.autoUpdateInterval;
      interval.disabled = !draft.autoUpdate;
    }
    appendResponseField(editor, draft, configuringIndex);
  }
  appendEditorError(editor, errorId);
  appendEditorActions(
    editor,
    configuringIndex === undefined ? 'confirm-create' : 'confirm-config',
    configuringIndex ?? -1,
    configuringIndex === undefined
      ? DESIGNER_UI_TEXT.variables.create
      : DESIGNER_UI_TEXT.variables.save,
  );
  content.appendChild(editor);
}

export function appendRenameEditor(
  row: HTMLElement,
  variable: DesignerVariableView,
  index: number,
): void {
  appendEditorHeading(row, DESIGNER_UI_TEXT.variables.renameTitle, variable.name, variable.type);
  const errorId = `designer-variable-rename-error-${index}`;
  const input = appendEditorField(row, {
    label: DESIGNER_UI_TEXT.variables.name,
    hint: DESIGNER_UI_TEXT.variables.nameHint,
    dataKey: 'variableRename',
    dataValue: String(index),
    describedBy: errorId,
  });
  input.value = variable.name;
  appendEditorError(row, errorId);
  appendEditorActions(row, 'confirm-rename', index, DESIGNER_UI_TEXT.variables.save);
}

export function appendDescriptionEditor(
  row: HTMLElement,
  variable: DesignerVariableView,
  index: number,
): void {
  appendEditorHeading(
    row,
    DESIGNER_UI_TEXT.variables.editDescriptionTitle,
    variable.name,
    variable.type,
  );
  const errorId = `designer-variable-description-error-${index}`;
  const input = appendEditorField(row, {
    label: DESIGNER_UI_TEXT.variables.descriptionLabel,
    hint: DESIGNER_UI_TEXT.variables.descriptionHint,
    dataKey: 'variableDescription',
    dataValue: String(index),
    describedBy: errorId,
  });
  input.value = variable.description ?? '';
  appendEditorError(row, errorId);
  appendEditorActions(row, 'confirm-description', index, DESIGNER_UI_TEXT.variables.save);
}

export function appendValueEditor(
  row: HTMLElement,
  variable: DesignerVariableView,
  index: number,
): void {
  appendEditorHeading(row, DESIGNER_UI_TEXT.variables.editValueTitle, variable.name, variable.type);
  const errorId = `designer-variable-value-error-${index}`;
  const input = appendEditorField(row, {
    label: DESIGNER_UI_TEXT.variables.initialValue,
    hint: DESIGNER_UI_TEXT.variables.valueHint,
    dataKey: 'variableValue',
    dataValue: String(index),
    describedBy: errorId,
    json: true,
  });
  input.value = JSON.stringify(variable.initialValue);
  appendEditorError(row, errorId);
  appendEditorActions(row, 'confirm-value', index, DESIGNER_UI_TEXT.variables.save);
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

function appendCreateTypeChooser(editor: HTMLElement, selected: ScreenVariable['type']): void {
  const field = editor.ownerDocument.createElement('label');
  field.className = 'variable-field variable-source-field';
  const label = editor.ownerDocument.createElement('span');
  label.className = 'variable-field-label';
  label.textContent = DESIGNER_UI_TEXT.variables.source;
  field.appendChild(label);
  const select = editor.ownerDocument.createElement('select');
  select.className = 'variable-edit-input';
  select.dataset.variableCreateType = 'true';
  select.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.source);
  for (const type of ['static', 'data-source', 'url-query'] as const) {
    const option = editor.ownerDocument.createElement('option');
    option.value = type;
    option.textContent = sourceTypeLabel(type);
    option.selected = type === selected;
    select.appendChild(option);
  }
  field.appendChild(select);
  editor.appendChild(field);
}

function appendHostCatalog(editor: HTMLElement, draft: DesignerVariableCreateDraft): void {
  const section = editor.ownerDocument.createElement('section');
  section.className = 'variable-host-catalog';
  const label = editor.ownerDocument.createElement('span');
  label.className = 'variable-field-label';
  label.textContent = sourceTypeLabel(draft.type);
  section.appendChild(label);
  const search = createDesignerInput(editor.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.catalogSearch,
    placeholder: DESIGNER_UI_TEXT.variables.catalogSearch,
    value: draft.catalogQuery,
  });
  search.dataset.variableCatalogSearch = 'true';
  section.appendChild(search);
  const list = editor.ownerDocument.createElement('div');
  list.className = 'variable-host-catalog-list';
  for (const item of draft.catalogItems) {
    const button = createDesignerButton(editor.ownerDocument, {
      className: 'variable-host-catalog-item',
      pressed: item.sourceId === draft.sourceId,
      tip: DESIGNER_UI_TEXT.variables.selectHost(item.name),
      variant: item.sourceId === draft.sourceId ? 'primary' : 'ghost',
    });
    button.dataset.variableAction = 'select-host';
    button.dataset.sourceId = item.sourceId;
    const name = editor.ownerDocument.createElement('code');
    name.textContent = item.name;
    const description = editor.ownerDocument.createElement('span');
    description.textContent = item.description ?? '';
    button.appendChild(name);
    button.appendChild(description);
    list.appendChild(button);
  }
  section.appendChild(list);
  if (draft.catalogCursor !== undefined) {
    const more = createDesignerButton(editor.ownerDocument, {
      text: DESIGNER_UI_TEXT.variables.loadMore,
      variant: 'ghost',
    });
    more.dataset.variableAction = 'catalog-more';
    section.appendChild(more);
  }
  const feedback = editor.ownerDocument.createElement('p');
  feedback.className = 'variable-catalog-feedback';
  feedback.textContent = draft.catalogFeedback;
  section.appendChild(feedback);
  if (draft.sourceId !== undefined) {
    const selected = editor.ownerDocument.createElement('code');
    selected.className = 'variable-selected-host-id';
    selected.textContent = draft.sourceId;
    selected.dataset.variableSelectedHostId = draft.sourceId;
    section.appendChild(selected);
  }
  editor.appendChild(section);
}

function appendCheckboxField(
  editor: HTMLElement,
  label: string,
  hint: string,
  dataKey: 'variableCreateControlled' | 'variableCreateAutoUpdate',
  checked: boolean,
): void {
  const field = editor.ownerDocument.createElement('label');
  field.className = 'variable-checkbox-field';
  const input = editor.ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset[dataKey] = 'true';
  const copy = editor.ownerDocument.createElement('span');
  const title = editor.ownerDocument.createElement('strong');
  title.textContent = label;
  const description = editor.ownerDocument.createElement('small');
  description.textContent = hint;
  copy.appendChild(title);
  copy.appendChild(description);
  field.appendChild(input);
  field.appendChild(copy);
  editor.appendChild(field);
}

function appendResponseField(
  editor: HTMLElement,
  draft: DesignerVariableCreateDraft,
  configuringIndex: number | undefined,
): void {
  const section = editor.ownerDocument.createElement('section');
  section.className = 'variable-response-field';
  const heading = editor.ownerDocument.createElement('div');
  const label = editor.ownerDocument.createElement('span');
  label.className = 'variable-field-label';
  label.textContent = DESIGNER_UI_TEXT.variables.responseResult;
  heading.appendChild(label);
  if (configuringIndex !== undefined) {
    const refresh = createDesignerButton(editor.ownerDocument, {
      text: DESIGNER_UI_TEXT.variables.responseRefresh,
      variant: 'ghost',
    });
    refresh.dataset.variableAction = 'preview';
    refresh.dataset.variableIndex = String(configuringIndex);
    heading.appendChild(refresh);
  }
  section.appendChild(heading);
  if (draft.previewSummary !== undefined) {
    const response = editor.ownerDocument.createElement('pre');
    response.textContent = draft.previewSummary;
    section.appendChild(response);
  } else {
    const response = editor.ownerDocument.createElement('p');
    response.textContent =
      draft.previewStatus === 'loading'
        ? DESIGNER_UI_TEXT.variables.previewLoading
        : draft.previewStatus === 'unavailable'
          ? DESIGNER_UI_TEXT.variables.previewUnavailable
          : draft.previewStatus === 'error'
            ? DESIGNER_UI_TEXT.variables.previewFailed
            : DESIGNER_UI_TEXT.variables.responseEmpty;
    section.appendChild(response);
  }
  editor.appendChild(section);
}

function sourceTypeLabel(type: ScreenVariable['type']): string {
  return type === 'static'
    ? DESIGNER_UI_TEXT.variables.typeStatic
    : type === 'data-source'
      ? DESIGNER_UI_TEXT.variables.typeDataSource
      : DESIGNER_UI_TEXT.variables.typeUrlQuery;
}

interface EditorFieldOptions {
  readonly label: string;
  readonly hint: string;
  readonly dataKey:
    | 'variableCreateName'
    | 'variableCreateDescription'
    | 'variableCreateValue'
    | 'variableCreateProcessor'
    | 'variableCreateAutoUpdateInterval'
    | 'variableRename'
    | 'variableDescription'
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
  const input = createDesignerInput(editor.ownerDocument, { className: 'variable-edit-input' });
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

function appendEditorHeading(
  editor: HTMLElement,
  title: string,
  context?: string,
  type?: ScreenVariable['type'],
): void {
  const heading = editor.ownerDocument.createElement('header');
  heading.className = 'variable-editor-heading';
  if (type !== undefined) heading.appendChild(createBadge(editor.ownerDocument, type));
  const copy = editor.ownerDocument.createElement('span');
  copy.className = 'variable-editor-title';
  const strong = editor.ownerDocument.createElement('strong');
  strong.textContent = title;
  copy.appendChild(strong);
  if (context !== undefined) {
    const code = editor.ownerDocument.createElement('code');
    code.textContent = context;
    code.setAttribute('data-tip', context);
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
  action:
    | 'confirm-create'
    | 'confirm-config'
    | 'confirm-rename'
    | 'confirm-description'
    | 'confirm-value'
    | 'confirm-delete',
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
    tip: DESIGNER_UI_TEXT.variables.editHint,
    variant: danger ? 'danger' : 'primary',
  });
  confirm.dataset.variableAction = action;
  confirm.dataset.variableIndex = String(index);
  appendIconLabel(confirm, danger ? 'trash' : 'check', confirmLabel);
  actions.appendChild(confirm);
  editor.appendChild(actions);
}

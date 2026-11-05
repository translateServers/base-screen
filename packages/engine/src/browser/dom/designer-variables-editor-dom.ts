import type { ScreenHostCatalogSummary, ScreenVariable } from '@base-screen/contracts';
import type { DesignerVariableView } from '../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../dom/designer-icons.js';
import { createDesignerFieldRow, createDesignerToggleField } from './designer-field-primitives.js';
import {
  createDesignerButton,
  createDesignerInput,
  createDesignerSegmented,
  createDesignerTextarea,
} from './designer-ui-primitives.js';
import { createDesignerBadge } from './panel/designer-chrome-primitives.js';

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
  readonly catalogItems: readonly ScreenHostCatalogSummary[];
  readonly catalogCursor: string | undefined;
  readonly catalogFeedback: string;
  readonly previewStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  readonly previewSummary: string | undefined;
}

export function appendVariableBadge(
  parent: HTMLElement,
  type: ScreenVariable['type'],
): HTMLElement {
  const tone = type === 'data-source' ? 'accent' : type === 'url-query' ? 'success' : 'neutral';
  return createDesignerBadge(parent, {
    text: sourceTypeLabel(type),
    tone,
    dataset: { variableType: type },
  });
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
  const summary = editor.ownerDocument.createElement('div');
  summary.className = 'variable-error-summary';
  summary.dataset.variableErrorSummary = '';
  summary.setAttribute('role', 'alert');
  summary.hidden = true;
  editor.appendChild(summary);
  appendEditorSection(editor, 'A', DESIGNER_UI_TEXT.variables.sectionBasic);
  const name = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.name,
    hint: DESIGNER_UI_TEXT.variables.nameHint,
    required: true,
    dataKey: 'variableCreateName',
    describedBy: errorId,
  });
  name.value = draft.name;
  const description = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.descriptionLabel,
    hint: DESIGNER_UI_TEXT.variables.descriptionHint,
    multiline: true,
    dataKey: 'variableCreateDescription',
    describedBy: errorId,
  });
  description.value = draft.description;
  appendEditorSection(editor, 'B', DESIGNER_UI_TEXT.variables.sectionSource);
  appendCreateTypeChooser(editor, draft.type);
  if (draft.type !== 'static') {
    appendHostCatalog(editor, draft);
    const processor = appendEditorField(editor, {
      label: DESIGNER_UI_TEXT.variables.processor,
      hint: DESIGNER_UI_TEXT.variables.processorHint,
      dataKey: 'variableCreateProcessor',
      describedBy: errorId,
    });
    processor.value = draft.processorId;
  }
  appendEditorSection(editor, 'C', DESIGNER_UI_TEXT.variables.sectionValue);
  const value = appendEditorField(editor, {
    label: DESIGNER_UI_TEXT.variables.initialValue,
    hint: DESIGNER_UI_TEXT.variables.valueHint,
    multiline: true,
    dataKey: 'variableCreateValue',
    describedBy: errorId,
    json: true,
  });
  value.value = draft.valueSource;
  syncInitialFieldDecorations(editor, name, description, value);
  if (draft.type !== 'static') {
    appendResponseField(editor, draft, configuringIndex);
    const run = editor.ownerDocument.createElement('details');
    run.className = 'variable-run-section';
    run.open = draft.controlled || draft.autoUpdate;
    const summary = editor.ownerDocument.createElement('summary');
    const key = editor.ownerDocument.createElement('span');
    key.className = 'variable-editor-section-key';
    key.textContent = 'D';
    const runTitle = editor.ownerDocument.createElement('span');
    runTitle.className = 'variable-run-title';
    runTitle.textContent = DESIGNER_UI_TEXT.variables.sectionRun;
    const runSummary = editor.ownerDocument.createElement('span');
    runSummary.className = 'variable-run-summary';
    const runState = [
      `${
        DESIGNER_UI_TEXT.variables.controlled
      } ${draft.controlled ? DESIGNER_UI_TEXT.variables.enabled : DESIGNER_UI_TEXT.variables.disabled}`,
    ];
    if (draft.type === 'data-source') {
      runState.push(
        `${DESIGNER_UI_TEXT.variables.autoUpdate} ${
          draft.autoUpdate
            ? DESIGNER_UI_TEXT.variables.enabled
            : DESIGNER_UI_TEXT.variables.disabled
        }`,
      );
    }
    runSummary.textContent = runState.join(' · ');
    const caret = editor.ownerDocument.createElement('span');
    caret.className = 'variable-run-caret';
    caret.innerHTML = designerIcon('chevron-right');
    summary.appendChild(key);
    summary.appendChild(runTitle);
    summary.appendChild(runSummary);
    summary.appendChild(caret);
    run.appendChild(summary);
    appendCheckboxField(
      run,
      DESIGNER_UI_TEXT.variables.controlled,
      DESIGNER_UI_TEXT.variables.controlledHint,
      'variableCreateControlled',
      draft.controlled,
    );
    if (draft.type === 'data-source') {
      appendCheckboxField(
        run,
        DESIGNER_UI_TEXT.variables.autoUpdate,
        DESIGNER_UI_TEXT.variables.autoUpdateHint,
        'variableCreateAutoUpdate',
        draft.autoUpdate,
      );
      const interval = appendEditorField(run, {
        label: DESIGNER_UI_TEXT.variables.autoUpdateFrequency,
        hint: DESIGNER_UI_TEXT.variables.autoUpdateFrequencyHint,
        dataKey: 'variableCreateAutoUpdateInterval',
        describedBy: errorId,
        number: true,
      }) as HTMLInputElement;
      interval.min = '1';
      interval.max = '86400';
      interval.step = '1';
      interval.value = draft.autoUpdateInterval;
      interval.disabled = !draft.autoUpdate;
    }
    editor.appendChild(run);
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
  const row = createDesignerFieldRow(editor.ownerDocument, {
    label: DESIGNER_UI_TEXT.variables.sourceTypeLabel,
    tagName: 'span',
  });
  const segmented = createDesignerSegmented(editor.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.source,
    selected,
    options: (['static', 'data-source', 'url-query'] as const).map((type) => ({
      value: type,
      label: sourceTypeLabel(type),
      dataset: {
        variableAction:
          type === 'static'
            ? 'create-type-static'
            : type === 'data-source'
              ? 'create-type-data-source'
              : 'create-type-url-query',
      },
    })),
  });
  row.control.appendChild(segmented.element);
  editor.appendChild(row.field);
}

function appendHostCatalog(editor: HTMLElement, draft: DesignerVariableCreateDraft): void {
  const section = editor.ownerDocument.createElement('details');
  section.className = 'variable-host-catalog';
  section.open = false;
  const label = sourceTypeLabel(draft.type);
  const summary = editor.ownerDocument.createElement('summary');
  summary.className = 'variable-catalog-summary';
  summary.dataset.variableCatalogSummary = 'true';
  const glyph = editor.ownerDocument.createElement('span');
  glyph.className = 'variable-catalog-glyph';
  glyph.innerHTML = designerIcon(draft.type === 'data-source' ? 'database' : 'link');
  glyph.setAttribute('aria-hidden', 'true');
  const copy = editor.ownerDocument.createElement('span');
  copy.className = 'variable-catalog-copy';
  const title = editor.ownerDocument.createElement('span');
  title.className = 'variable-catalog-title';
  title.textContent = draft.sourceId ?? DESIGNER_UI_TEXT.variables.selectSource(label);
  if (draft.sourceId !== undefined) title.dataset.variableSelectedHostId = draft.sourceId;
  const sub = editor.ownerDocument.createElement('span');
  sub.className = 'variable-catalog-sub';
  sub.textContent =
    draft.catalogFeedback || DESIGNER_UI_TEXT.variables.sourceItemCount(draft.catalogItems.length);
  copy.appendChild(title);
  copy.appendChild(sub);
  const caret = editor.ownerDocument.createElement('span');
  caret.className = 'variable-catalog-caret';
  caret.innerHTML = designerIcon('chevron-right');
  summary.appendChild(glyph);
  summary.appendChild(copy);
  summary.appendChild(caret);
  section.appendChild(summary);

  const body = editor.ownerDocument.createElement('div');
  body.className = 'variable-catalog-content';
  const search = createDesignerInput(editor.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.catalogSearch,
    placeholder: DESIGNER_UI_TEXT.variables.catalogSearch,
    value: draft.catalogQuery,
  });
  search.dataset.variableCatalogSearch = 'true';
  body.appendChild(search);
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
  body.appendChild(list);
  if (draft.catalogCursor !== undefined) {
    const more = createDesignerButton(editor.ownerDocument, {
      text: DESIGNER_UI_TEXT.variables.loadMore,
      variant: 'ghost',
    });
    more.dataset.variableAction = 'catalog-more';
    body.appendChild(more);
  }
  const feedback = editor.ownerDocument.createElement('p');
  feedback.className = 'variable-catalog-feedback';
  feedback.textContent = draft.catalogFeedback;
  body.appendChild(feedback);
  if (draft.sourceId !== undefined) {
    const selected = editor.ownerDocument.createElement('code');
    selected.className = 'variable-selected-host-id';
    selected.textContent = draft.sourceId;
    body.appendChild(selected);
  }
  section.appendChild(body);
  editor.appendChild(section);
}

function appendCheckboxField(
  editor: HTMLElement,
  label: string,
  hint: string,
  dataKey: 'variableCreateControlled' | 'variableCreateAutoUpdate',
  checked: boolean,
): void {
  const { field, input } = createDesignerToggleField(editor.ownerDocument, {
    ariaLabel: label,
    checked,
    control: 'checkbox',
    hint,
    label,
  });
  input.dataset[dataKey] = 'true';
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
  label.className = 'designer-inspector-section-title';
  label.textContent = DESIGNER_UI_TEXT.variables.responseResult;
  heading.appendChild(label);
  if (configuringIndex !== undefined) {
    const refresh = createDesignerButton(editor.ownerDocument, {
      size: 'compact',
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

function appendEditorSection(editor: HTMLElement, key: string, title: string): void {
  const section = editor.ownerDocument.createElement('p');
  section.className = `variable-editor-section${key === 'A' ? ' is-first' : ''}`;
  const glyph = editor.ownerDocument.createElement('span');
  glyph.className = 'variable-editor-section-key';
  glyph.textContent = key;
  const label = editor.ownerDocument.createElement('span');
  label.className = 'variable-editor-step-title';
  label.textContent = title;
  const hint = editor.ownerDocument.createElement('span');
  hint.className = 'variable-editor-section-hint';
  hint.textContent = key === 'A' ? 'NAME' : key === 'B' ? 'SOURCE' : key === 'C' ? 'VALUE' : 'RUN';
  section.appendChild(glyph);
  section.appendChild(label);
  section.appendChild(hint);
  editor.appendChild(section);
}

interface EditorFieldOptions {
  readonly label: string;
  readonly hint: string;
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly number?: boolean;
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

function appendEditorField(
  editor: HTMLElement,
  options: EditorFieldOptions,
): HTMLInputElement | HTMLTextAreaElement {
  const row = createDesignerFieldRow(editor.ownerDocument, {
    label: options.label,
    controlClassName: 'variable-input-wrap',
  });
  const field = row.field;
  const controlId = `designer-${options.dataKey}`;
  (field as HTMLLabelElement).htmlFor = controlId;
  if (options.required) {
    const required = editor.ownerDocument.createElement('span');
    required.className = 'variable-required';
    required.textContent = '*';
    required.setAttribute('aria-hidden', 'true');
    row.labelText.appendChild(required);
  }
  const input = options.multiline
    ? createDesignerTextarea(editor.ownerDocument)
    : createDesignerInput(editor.ownerDocument, {
        appearance: options.number === true ? 'number' : 'text',
      });
  input.id = controlId;
  input.dataset[options.dataKey] = options.dataValue ?? 'true';
  if (!options.multiline) {
    (input as HTMLInputElement).autocomplete = 'off';
  }
  input.spellcheck = !options.json;
  const hintId = `${options.describedBy}-${options.dataKey}-hint`;
  const fieldKey = editorFieldKey(options.dataKey);
  const fieldErrorId = `${hintId}-error`;
  input.setAttribute(
    'aria-describedby',
    `${hintId}${fieldKey === undefined ? '' : ` ${fieldErrorId}`} ${options.describedBy}`,
  );
  row.control.appendChild(input);
  if (fieldKey === 'name') {
    input.dataset.affix = 'icon';
    const check = editor.ownerDocument.createElement('span');
    check.className = 'variable-input-check';
    check.dataset.variableNameCheck = '';
    check.innerHTML = designerIcon('check');
    check.hidden = true;
    row.control.appendChild(check);
  }
  if (fieldKey !== undefined) {
    const error = editor.ownerDocument.createElement('p');
    error.id = fieldErrorId;
    error.className = 'variable-field-error designer-field-message';
    error.dataset.variableFieldError = fieldKey;
    error.setAttribute('role', 'alert');
    error.hidden = true;
    field.appendChild(error);
  }
  const foot = editor.ownerDocument.createElement('div');
  foot.className = 'variable-field-foot';
  const hint = editor.ownerDocument.createElement('small');
  hint.id = hintId;
  hint.className = 'designer-field-hint variable-field-hint';
  hint.textContent = options.hint;
  foot.appendChild(hint);
  const checks = editor.ownerDocument.createElement('span');
  checks.className = 'variable-field-checks';
  if (fieldKey === 'name') {
    const count = editor.ownerDocument.createElement('span');
    count.className = 'variable-field-count';
    count.dataset.variableNameCount = '';
    count.textContent = '0/128';
    checks.appendChild(count);
  } else if (fieldKey === 'description') {
    const count = editor.ownerDocument.createElement('span');
    count.className = 'variable-field-count';
    count.dataset.variableDescriptionCount = '';
    count.textContent = '0/4096';
    checks.appendChild(count);
  } else if (fieldKey === 'value') {
    const type = editor.ownerDocument.createElement('span');
    type.className = 'variable-field-type';
    type.dataset.variableValueType = '';
    checks.appendChild(type);
  }
  if (checks.childElementCount > 0) foot.appendChild(checks);
  field.appendChild(foot);
  editor.appendChild(field);
  return input;
}

function syncInitialFieldDecorations(
  editor: HTMLElement,
  name: HTMLInputElement | HTMLTextAreaElement,
  description: HTMLInputElement | HTMLTextAreaElement,
  value: HTMLInputElement | HTMLTextAreaElement,
): void {
  const nameCount = editor.querySelector<HTMLElement>('[data-variable-name-count]');
  if (nameCount !== null) nameCount.textContent = `${name.value.length}/128`;
  const descriptionCount = editor.querySelector<HTMLElement>('[data-variable-description-count]');
  if (descriptionCount !== null) {
    descriptionCount.textContent = `${[...description.value].length}/4096`;
  }
  const valueType = editor.querySelector<HTMLElement>('[data-variable-value-type]');
  if (valueType !== null) {
    const text = value.value.trim();
    valueType.textContent =
      text === ''
        ? DESIGNER_UI_TEXT.variables.valueTypeText
        : text === 'true' || text === 'false'
          ? DESIGNER_UI_TEXT.variables.valueTypeBoolean
          : text === 'null'
            ? DESIGNER_UI_TEXT.variables.valueTypeNull
            : /^-?\d+(?:\.\d+)?$/u.test(text)
              ? DESIGNER_UI_TEXT.variables.valueTypeNumber
              : text.startsWith('[')
                ? DESIGNER_UI_TEXT.variables.valueTypeArray
                : text.startsWith('{')
                  ? DESIGNER_UI_TEXT.variables.valueTypeObject
                  : DESIGNER_UI_TEXT.variables.valueTypeText;
  }
}

function editorFieldKey(
  dataKey: EditorFieldOptions['dataKey'],
): 'name' | 'description' | 'value' | 'interval' | undefined {
  if (dataKey === 'variableCreateName') return 'name';
  if (dataKey === 'variableCreateDescription') return 'description';
  if (dataKey === 'variableCreateValue') return 'value';
  if (dataKey === 'variableCreateAutoUpdateInterval') return 'interval';
  return undefined;
}

function appendEditorHeading(
  editor: HTMLElement,
  title: string,
  context?: string,
  type?: ScreenVariable['type'],
): void {
  const heading = editor.ownerDocument.createElement('header');
  heading.className = 'variable-editor-heading';
  if (type !== undefined) appendVariableBadge(heading, type);
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
    size: 'compact',
    text: DESIGNER_UI_TEXT.variables.cancel,
    variant: 'ghost',
  });
  cancel.dataset.variableAction = 'cancel';
  cancel.dataset.variableIndex = String(index);
  actions.appendChild(cancel);
  const confirm = createDesignerButton(editor.ownerDocument, {
    ariaLabel: danger ? DESIGNER_UI_TEXT.variables.delete : DESIGNER_UI_TEXT.variables.confirm,
    size: 'compact',
    tip: DESIGNER_UI_TEXT.variables.editHint,
    variant: danger ? 'danger' : 'primary',
  });
  confirm.dataset.variableAction = action;
  confirm.dataset.variableIndex = String(index);
  appendIconLabel(confirm, danger ? 'trash' : 'check', confirmLabel);
  actions.appendChild(confirm);
  editor.appendChild(actions);
}

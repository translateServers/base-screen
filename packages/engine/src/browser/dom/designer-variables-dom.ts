import type {
  ScreenDocument,
  ScreenHostVariableDescriptor,
  ScreenHostVariableSummary,
  ScreenJsonValue,
  ScreenVariable,
} from '@base-screen/contracts';
import type { DesignerVariableReference } from '../../common/operations/designer-variable-operations.js';
import {
  type DesignerVariableView,
  readDesignerVariableViews,
} from '../../common/operations/designer-variable-view.js';
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
  type DesignerVariableCreateDraft,
} from './designer-variables-editor-dom.js';
import {
  appendVariablesEmptyState,
  appendVariablesToolbar,
} from './designer-variables-toolbar-dom.js';

export interface DesignerVariablesDraft {
  readonly creating: boolean;
  readonly configuringIndex: number | undefined;
  readonly create: DesignerVariableCreateDraft;
  readonly renamingIndex: number | undefined;
  readonly editingDescriptionIndex: number | undefined;
  readonly editingValueIndex: number | undefined;
  readonly deletingIndex: number | undefined;
  readonly search: string;
  readonly typeFilter: 'all' | ScreenVariable['type'];
  readonly referenceCounts: ReadonlyMap<string, number>;
  readonly references: readonly DesignerVariableReference[];
  /** Stable variable id, retained under the historical view key for API locality. */
  readonly expandedVariableName: string | undefined;
  /** Stable variable id, retained under the historical view key for API locality. */
  readonly expandedReferenceName: string | undefined;
  readonly catalog: DesignerVariableCatalogView;
}

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

const VALUE_SUMMARY_LENGTH = 48;

export function renderDesignerVariables(
  panel: HTMLElement,
  document: ScreenDocument | undefined,
  draft: DesignerVariablesDraft,
): void {
  panel.replaceChildren();
  const variables = readDesignerVariableViews(document);
  panel.dataset.variableCount = String(variables.length);
  appendVariablesToolbar(panel, draft, variables.length);

  const content = panel.ownerDocument.createElement('div');
  content.className = 'variable-panel-content';
  if (draft.creating && draft.configuringIndex === undefined) {
    appendCreateEditor(content, draft.create);
  }
  if (!draft.creating && variables.length === 0) {
    appendVariablesEmptyState(content, true);
    panel.appendChild(content);
    return;
  }
  // 原型按来源分组（设计变量 / 数据集 / 查询参数），组内保持文档顺序；
  // 行的编辑索引仍取文档下标，分组只影响呈现，不改变任何命令寻址。
  for (const group of variableGroups(variables)) {
    if (group.entries.length === 0) continue;
    const section = panel.ownerDocument.createElement('section');
    section.className = 'variable-group';
    section.dataset.variableGroup = group.types[0];
    const heading = panel.ownerDocument.createElement('p');
    heading.className = 'list-heading';
    heading.textContent = group.label;
    section.appendChild(heading);
    const list = panel.ownerDocument.createElement('div');
    list.className = 'variable-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', group.label);
    for (const { index, variable } of group.entries) {
      if (draft.configuringIndex === index) appendCreateEditor(list, draft.create, index);
      else appendVariableRow(list, variable, index, draft);
    }
    section.appendChild(list);
    content.appendChild(section);
  }
  panel.appendChild(content);
}

interface VariableGroup {
  readonly label: string;
  readonly types: readonly ScreenVariable['type'][];
  readonly entries: readonly { readonly index: number; readonly variable: DesignerVariableView }[];
}

function variableGroups(variables: readonly DesignerVariableView[]): readonly VariableGroup[] {
  const entries = variables.map((variable, index) => ({ index, variable }));
  return [
    {
      label: DESIGNER_UI_TEXT.variables.groupStatic,
      types: ['static'],
      entries: entries.filter((entry) => entry.variable.type === 'static'),
    },
    {
      label: DESIGNER_UI_TEXT.variables.groupDataSource,
      types: ['data-source'],
      entries: entries.filter((entry) => entry.variable.type === 'data-source'),
    },
    {
      label: DESIGNER_UI_TEXT.variables.groupUrlQuery,
      types: ['url-query'],
      entries: entries.filter((entry) => entry.variable.type === 'url-query'),
    },
  ];
}

function appendVariableRow(
  list: HTMLElement,
  variable: DesignerVariableView,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const row = list.ownerDocument.createElement('div');
  row.className = 'variable-row';
  row.dataset.variableRow = String(index);
  row.dataset.variableType = variable.type;
  row.dataset.variableId = variable.id;
  row.setAttribute('role', 'listitem');
  if (draft.renamingIndex === index) {
    row.dataset.variableEditor = 'rename';
    appendRenameEditor(row, variable, index);
  } else if (draft.editingDescriptionIndex === index) {
    row.dataset.variableEditor = 'description';
    appendDescriptionEditor(row, variable, index);
  } else if (draft.editingValueIndex === index) {
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
  variable: DesignerVariableView,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const expanded = draft.expandedVariableName === variable.id;
  row.dataset.expanded = String(expanded);
  const header = row.ownerDocument.createElement('div');
  header.className = 'variable-row-header';
  const toggle = createDesignerButton(row.ownerDocument, {
    ariaLabel: expanded
      ? DESIGNER_UI_TEXT.variables.collapseVariable(variable.name)
      : DESIGNER_UI_TEXT.variables.expandVariable(variable.name),
    className: 'variable-row-toggle',
    tip: expanded
      ? DESIGNER_UI_TEXT.variables.collapseVariable(variable.name)
      : DESIGNER_UI_TEXT.variables.expandVariable(variable.name),
    variant: 'ghost',
  });
  toggle.dataset.variableAction = 'toggle-variable';
  toggle.dataset.variableIndex = String(index);
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.appendChild(createVariableGlyph(row.ownerDocument, variable));
  const chevron = row.ownerDocument.createElement('span');
  chevron.className = 'variable-row-chevron';
  chevron.innerHTML = designerIcon(expanded ? 'chevron-down' : 'chevron-right');
  toggle.appendChild(chevron);
  header.appendChild(toggle);

  const identity = row.ownerDocument.createElement('div');
  identity.className = 'variable-row-identity';
  const name = row.ownerDocument.createElement('code');
  name.className = 'variable-name';
  name.textContent = variable.name;
  name.setAttribute('data-tip', variable.name);
  identity.appendChild(name);
  header.appendChild(identity);

  header.appendChild(createRowContext(row.ownerDocument, variable));
  appendCompactActions(header, variable, index);
  row.appendChild(header);
  if (!expanded) return;

  const details = row.ownerDocument.createElement('section');
  details.className = 'variable-details';
  details.setAttribute('aria-label', variable.name);
  const usage = createVariableReferenceCount(
    row.ownerDocument,
    variable,
    index,
    draft.referenceCounts.get(variable.id) ?? 0,
    draft.expandedReferenceName === variable.id,
  );
  usage.className = `${usage.className} variable-row-usage`.trim();
  details.appendChild(createUsageLine(row.ownerDocument, usage));
  details.appendChild(createDescriptionAction(row.ownerDocument, variable, index));
  details.appendChild(
    createDetailLine(
      row.ownerDocument,
      DESIGNER_UI_TEXT.variables.source,
      variableSourceLabel(variable),
    ),
  );
  details.appendChild(createValueDetail(row.ownerDocument, variable, index));
  if (variable.type !== 'static') {
    details.appendChild(
      createCodeDetail(row.ownerDocument, DESIGNER_UI_TEXT.variables.sourceId, variable.sourceId),
    );
    details.appendChild(
      createDetailLine(
        row.ownerDocument,
        DESIGNER_UI_TEXT.variables.controlled,
        variable.controlled
          ? DESIGNER_UI_TEXT.variables.enabled
          : DESIGNER_UI_TEXT.variables.disabled,
      ),
    );
    if (variable.processorId !== undefined) {
      details.appendChild(
        createCodeDetail(
          row.ownerDocument,
          DESIGNER_UI_TEXT.variables.processor,
          variable.processorId,
        ),
      );
    }
    if (variable.type === 'data-source') {
      details.appendChild(
        createDetailLine(
          row.ownerDocument,
          DESIGNER_UI_TEXT.variables.autoUpdate,
          variable.autoUpdate === undefined
            ? DESIGNER_UI_TEXT.variables.disabled
            : DESIGNER_UI_TEXT.variables.autoUpdateInterval(variable.autoUpdate.intervalSeconds),
        ),
      );
    }
    appendPreview(details, variable.id, draft.catalog);
  }
  if (draft.expandedReferenceName === variable.id) {
    appendVariableReferenceList(
      details,
      variable,
      index,
      draft.references.filter((reference) => reference.variableId === variable.id),
    );
  }
  row.appendChild(details);
}

/**
 * 行首 14px 图形：静态颜色值显示为色板（与原型设计变量同形），其余按来源取图标。
 * 展开箭头复用同一 20px 槽位、叠在图形上，避免 hover 时行几何变化。
 */
function createVariableGlyph(ownerDocument: Document, variable: DesignerVariableView): HTMLElement {
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'variable-row-glyph';
  const color = variable.type === 'static' ? colorValue(variable.initialValue) : undefined;
  if (color !== undefined) {
    const swatch = ownerDocument.createElement('span');
    swatch.className = 'variable-swatch';
    swatch.style.background = color;
    swatch.setAttribute('aria-hidden', 'true');
    glyph.appendChild(swatch);
    return glyph;
  }
  glyph.innerHTML = designerIcon(
    variable.type === 'data-source'
      ? 'database'
      : variable.type === 'url-query'
        ? 'link'
        : 'variable',
  );
  return glyph;
}

function colorValue(value: ScreenJsonValue): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(trimmed)) return trimmed;
  if (/^var\(--[\w-]+\)$/u.test(trimmed)) return trimmed;
  if (/^(?:rgb|rgba|hsl|hsla|oklch)\(/iu.test(trimmed)) return trimmed;
  return undefined;
}

function createUsageLine(ownerDocument: Document, usage: HTMLElement): HTMLElement {
  const line = ownerDocument.createElement('div');
  line.className = 'variable-detail-line variable-usage-line';
  const label = ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.usage;
  line.appendChild(label);
  line.appendChild(usage);
  return line;
}

function createRowContext(ownerDocument: Document, variable: DesignerVariableView): HTMLElement {
  const context = ownerDocument.createElement('div');
  context.className = 'variable-row-context';
  const label = ownerDocument.createElement('span');
  label.className = 'variable-row-context-label';
  label.textContent =
    variable.type === 'static'
      ? DESIGNER_UI_TEXT.variables.initialValue
      : DESIGNER_UI_TEXT.variables.sourceId;
  const value = ownerDocument.createElement('code');
  value.className = 'variable-row-context-value';
  value.textContent =
    variable.type === 'static'
      ? summarizeValue(formatValue(variable.initialValue))
      : variable.sourceId;
  value.setAttribute(
    'data-tip',
    variable.type === 'static' ? formatValue(variable.initialValue) : variable.sourceId,
  );
  context.appendChild(label);
  context.appendChild(value);
  return context;
}

function appendCompactActions(
  header: HTMLElement,
  variable: DesignerVariableView,
  index: number,
): void {
  const actions = header.ownerDocument.createElement('div');
  actions.className = 'variable-row-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.actions(variable.name));
  if (variable.type !== 'static') {
    actions.appendChild(
      createIconAction(
        header.ownerDocument,
        'preview',
        index,
        'eye',
        DESIGNER_UI_TEXT.variables.preview(variable.name),
      ),
    );
  }
  actions.appendChild(
    createIconAction(
      header.ownerDocument,
      'edit-config',
      index,
      'sliders',
      DESIGNER_UI_TEXT.variables.editConfiguration(variable.name),
    ),
  );
  actions.appendChild(
    createIconAction(
      header.ownerDocument,
      'add-to-blueprint',
      index,
      'plus',
      DESIGNER_UI_TEXT.variables.addToBlueprint(variable.name),
    ),
  );
  actions.appendChild(
    createIconAction(
      header.ownerDocument,
      'rename',
      index,
      'pencil',
      DESIGNER_UI_TEXT.variables.renameVariable(variable.name),
    ),
  );
  actions.appendChild(
    createIconAction(
      header.ownerDocument,
      'duplicate',
      index,
      'copy',
      DESIGNER_UI_TEXT.variables.duplicate(variable.name),
    ),
  );
  const remove = createIconAction(
    header.ownerDocument,
    'delete',
    index,
    'trash',
    DESIGNER_UI_TEXT.variables.deleteVariable(variable.name),
  );
  remove.dataset.variant = 'danger';
  actions.appendChild(remove);
  header.appendChild(actions);
}

function createIconAction(
  ownerDocument: Document,
  action: 'preview' | 'edit-config' | 'add-to-blueprint' | 'rename' | 'duplicate' | 'delete',
  index: number,
  icon: 'eye' | 'sliders' | 'plus' | 'pencil' | 'copy' | 'trash',
  label: string,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: label,
    className: 'variable-icon-action',
    tip: label,
    variant: 'ghost',
  });
  button.dataset.variableAction = action;
  button.dataset.variableIndex = String(index);
  appendIconLabel(button, icon, '');
  return button;
}

function createDescriptionAction(
  ownerDocument: Document,
  variable: DesignerVariableView,
  index: number,
): HTMLElement {
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.editDescription(variable.name),
    className: 'variable-description-action',
    tip: variable.description ?? DESIGNER_UI_TEXT.variables.addDescription,
    variant: 'ghost',
  });
  button.dataset.variableAction = 'edit-description';
  button.dataset.variableIndex = String(index);
  const label = ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.descriptionLabel;
  button.appendChild(label);
  const copy = ownerDocument.createElement('span');
  copy.className = 'variable-description-copy';
  copy.textContent = variable.description ?? DESIGNER_UI_TEXT.variables.addDescription;
  button.appendChild(copy);
  return button;
}

function createValueDetail(
  ownerDocument: Document,
  variable: DesignerVariableView,
  index: number,
): HTMLElement {
  const serialized = formatValue(variable.initialValue);
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.editValue(variable.name),
    className: 'variable-value-button',
    tip: serialized,
    variant: 'ghost',
  });
  button.dataset.variableAction = 'edit-value';
  button.dataset.variableIndex = String(index);
  const label = ownerDocument.createElement('span');
  label.className = 'variable-detail-label';
  label.textContent = DESIGNER_UI_TEXT.variables.initialValue;
  button.appendChild(label);
  const value = ownerDocument.createElement('code');
  value.className = 'variable-value';
  value.textContent = summarizeValue(serialized);
  button.appendChild(value);
  const edit = ownerDocument.createElement('span');
  edit.className = 'variable-detail-glyph';
  edit.innerHTML = designerIcon('pencil');
  button.appendChild(edit);
  return button;
}

function createDetailLine(ownerDocument: Document, label: string, value: string): HTMLElement {
  const line = ownerDocument.createElement('div');
  line.className = 'variable-detail-line';
  const key = ownerDocument.createElement('span');
  key.className = 'variable-detail-label';
  key.textContent = label;
  const copy = ownerDocument.createElement('span');
  copy.className = 'variable-detail-copy';
  copy.textContent = value;
  line.appendChild(key);
  line.appendChild(copy);
  return line;
}

function createCodeDetail(ownerDocument: Document, label: string, value: string): HTMLElement {
  const line = createDetailLine(ownerDocument, label, value);
  const hostId = Object.assign(ownerDocument.createElement('code'), {
    className: 'variable-host-id',
    textContent: value,
  });
  hostId.setAttribute('data-tip', value);
  line.lastElementChild?.replaceWith(hostId);
  return line;
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

/** 来源文案：旧三形态沿用三桶文案，单形态记录用「常量 / 来源输出」。 */
function variableSourceLabel(variable: DesignerVariableView): string {
  switch (variable.valueRefKind) {
    case 'inline':
      return DESIGNER_UI_TEXT.variables.valueSourceConstant;
    case 'data-source-field':
      return DESIGNER_UI_TEXT.variables.valueSourceSourceOutput;
    default:
      // 旧三形态（`valueRefKind === undefined`）沿用三桶文案。
      return sourceLabel(variable.type);
  }
}

function sourceLabel(type: ScreenVariable['type']): string {
  return type === 'static'
    ? DESIGNER_UI_TEXT.variables.typeStatic
    : type === 'data-source'
      ? DESIGNER_UI_TEXT.variables.typeDataSource
      : DESIGNER_UI_TEXT.variables.typeUrlQuery;
}

function formatValue(value: ScreenJsonValue): string {
  return typeof value === 'string' && value !== '' ? value : JSON.stringify(value);
}

function summarizeValue(value: string): string {
  return value.length > VALUE_SUMMARY_LENGTH ? `${value.slice(0, VALUE_SUMMARY_LENGTH)}…` : value;
}

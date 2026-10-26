import type { ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import { readDesignerVariableView } from '../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton, createDesignerIconButton } from './designer-ui-primitives.js';
import {
  appendVariableDetails,
  createVariableGlyph,
  type DesignerVariablesDraft,
} from './designer-variables-dom.js';
import {
  appendCreateEditor,
  appendDeleteConfirmation,
  appendDescriptionEditor,
  appendRenameEditor,
  appendValueEditor,
} from './designer-variables-editor-dom.js';

export interface DesignerVariableInspectorSurface {
  readonly layer: HTMLElement;
  readonly card: HTMLElement;
  readonly glyph: HTMLElement;
  readonly eyebrow: HTMLElement;
  readonly eyebrowText: HTMLElement;
  readonly title: HTMLElement;
  readonly sub: HTMLElement;
  readonly body: HTMLElement;
  readonly foot: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly menuLayer: HTMLElement;
  readonly menu: HTMLElement;
}

/**
 * 变量检查器浮层：锚定左栏、非模态，承载新建/编辑/删除确认。
 * 浮层挂在变量面板的 scope 上（真实环境为 `.designer`），避免被面板滚动区裁切。
 */
export function ensureDesignerVariableInspector(
  scope: HTMLElement,
): DesignerVariableInspectorSurface {
  const existing = scope.querySelector<HTMLElement>('[data-variable-inspector-layer]');
  if (existing !== null) {
    return {
      layer: existing,
      card: existing.querySelector<HTMLElement>('[data-variable-inspector]')!,
      glyph: existing.querySelector<HTMLElement>('[data-variable-inspector-glyph]')!,
      eyebrow: existing.querySelector<HTMLElement>('[data-variable-inspector-eyebrow]')!,
      eyebrowText: existing.querySelector<HTMLElement>('[data-variable-inspector-eyebrow-text]')!,
      title: existing.querySelector<HTMLElement>('[data-variable-inspector-title]')!,
      sub: existing.querySelector<HTMLElement>('[data-variable-inspector-sub]')!,
      body: existing.querySelector<HTMLElement>('[data-variable-inspector-scroll]')!,
      foot: existing.querySelector<HTMLElement>('[data-variable-inspector-foot]')!,
      close: existing.querySelector<HTMLButtonElement>('[data-variable-inspector-close]')!,
      menuLayer: scope.querySelector<HTMLElement>('[data-variable-row-menu-layer]')!,
      menu: scope.querySelector<HTMLElement>('[data-variable-row-menu]')!,
    };
  }

  const ownerDocument = scope.ownerDocument;
  const layer = ownerDocument.createElement('div');
  layer.className = 'variable-inspector-layer';
  layer.dataset.variableInspectorLayer = '';
  layer.hidden = true;

  const card = ownerDocument.createElement('section');
  card.className = 'variable-inspector-card';
  card.dataset.variableInspector = '';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'designer-variable-inspector-title');

  const head = ownerDocument.createElement('header');
  head.className = 'variable-inspector-head';
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'variable-inspector-glyph';
  glyph.dataset.variableInspectorGlyph = '';
  glyph.setAttribute('aria-hidden', 'true');
  const headCopy = ownerDocument.createElement('span');
  headCopy.className = 'variable-inspector-head-copy';
  const eyebrow = ownerDocument.createElement('span');
  eyebrow.className = 'variable-inspector-eyebrow';
  eyebrow.dataset.variableInspectorEyebrow = '';
  const dot = ownerDocument.createElement('span');
  dot.className = 'variable-inspector-dot';
  dot.setAttribute('aria-hidden', 'true');
  const eyebrowText = ownerDocument.createElement('span');
  eyebrowText.dataset.variableInspectorEyebrowText = '';
  eyebrow.appendChild(dot);
  eyebrow.appendChild(eyebrowText);
  const title = ownerDocument.createElement('span');
  title.className = 'variable-inspector-title';
  title.id = 'designer-variable-inspector-title';
  title.dataset.variableInspectorTitle = '';
  const sub = ownerDocument.createElement('span');
  sub.className = 'variable-inspector-sub';
  sub.dataset.variableInspectorSub = '';
  headCopy.appendChild(eyebrow);
  headCopy.appendChild(title);
  headCopy.appendChild(sub);
  const close = createDesignerIconButton(ownerDocument, {
    className: 'variable-inspector-close',
    icon: 'close',
    label: DESIGNER_UI_TEXT.variables.cancel,
    variant: 'ghost',
  });
  close.dataset.variableAction = 'close-inspector';
  close.dataset.variableIndex = '-1';
  close.dataset.variableInspectorClose = '';
  head.appendChild(glyph);
  head.appendChild(headCopy);
  head.appendChild(close);

  const body = ownerDocument.createElement('div');
  body.className = 'variable-inspector-scroll';
  body.dataset.variableInspectorScroll = '';
  const foot = ownerDocument.createElement('footer');
  foot.className = 'variable-inspector-foot';
  foot.dataset.variableInspectorFoot = '';
  foot.hidden = true;
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(foot);
  layer.appendChild(card);
  scope.appendChild(layer);

  const menuLayer = ownerDocument.createElement('div');
  menuLayer.className = 'variable-row-menu-layer';
  menuLayer.dataset.variableRowMenuLayer = '';
  menuLayer.hidden = true;
  const menu = ownerDocument.createElement('div');
  menu.className = 'variable-row-menu';
  menu.dataset.variableRowMenu = '';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.moreMenu);
  menuLayer.appendChild(menu);
  scope.appendChild(menuLayer);

  return {
    layer,
    card,
    glyph,
    eyebrow,
    eyebrowText,
    title,
    sub,
    body,
    foot,
    close,
    menuLayer,
    menu,
  };
}

/** 行“更多”菜单：与检查器共用 overlay host，避免被面板滚动区裁切。 */
export function renderDesignerVariableRowMenu(
  surface: DesignerVariableInspectorSurface,
  panel: HTMLElement,
  document: ScreenDocument | undefined,
  draft: DesignerVariablesDraft,
): void {
  const menu = surface.menu;
  const menuLayer = surface.menuLayer;
  if (panel.hidden || draft.menuIndex === undefined) {
    menuLayer.hidden = true;
    menu.replaceChildren();
    return;
  }
  const entry = document?.variables[draft.menuIndex];
  if (document === undefined || entry === undefined) {
    menuLayer.hidden = true;
    menu.replaceChildren();
    return;
  }
  const variable = readDesignerVariableView(document, entry);
  const ownerDocument = menu.ownerDocument;
  menu.replaceChildren();
  const addItem = (
    action: string,
    label: string,
    icon: DesignerIconName,
    danger = false,
  ): HTMLButtonElement => {
    const item = ownerDocument.createElement('button');
    item.type = 'button';
    item.className = 'variable-row-menu-item';
    item.dataset.variableAction = action;
    item.dataset.variableIndex = String(draft.menuIndex);
    item.setAttribute('role', 'menuitem');
    if (danger) item.dataset.variant = 'danger';
    const glyph = ownerDocument.createElement('span');
    glyph.className = 'variable-row-menu-glyph';
    glyph.innerHTML = designerIcon(icon);
    glyph.setAttribute('aria-hidden', 'true');
    const copy = ownerDocument.createElement('span');
    copy.textContent = label;
    item.appendChild(glyph);
    item.appendChild(copy);
    return item;
  };
  if (variable.type !== 'static') {
    menu.appendChild(addItem('preview', DESIGNER_UI_TEXT.variables.previewAction, 'eye'));
  }
  if (draft.canAddToBlueprint) {
    menu.appendChild(
      addItem('add-to-blueprint', DESIGNER_UI_TEXT.variables.addToBlueprintMenu, 'plus'),
    );
  }
  menu.appendChild(addItem('duplicate', DESIGNER_UI_TEXT.variables.duplicateMenu, 'copy'));
  const referenceCount = draft.referenceCounts.get(variable.id) ?? 0;
  if (referenceCount > 0) {
    menu.appendChild(addItem('references', DESIGNER_UI_TEXT.variables.viewReferences, 'eye'));
  } else {
    menu.appendChild(addItem('delete', DESIGNER_UI_TEXT.variables.delete, 'trash', true));
  }
  menuLayer.hidden = false;
  positionRowMenu(surface, panel, draft.menuIndex);
}

function positionRowMenu(
  surface: DesignerVariableInspectorSurface,
  panel: HTMLElement,
  index: number,
): void {
  if (typeof surface.menuLayer.getBoundingClientRect !== 'function') return;
  const layerRect = surface.menuLayer.getBoundingClientRect();
  if (layerRect.width <= 0 || layerRect.height <= 0) return;
  const trigger = panel.querySelector<HTMLElement>(
    `[data-variable-action="more"][data-variable-index="${index}"]`,
  );
  if (trigger === null) return;
  const triggerRect = trigger.getBoundingClientRect();
  const width = surface.menu.offsetWidth || 168;
  const height = surface.menu.offsetHeight || 160;
  const left = Math.min(
    Math.max(8, triggerRect.right - layerRect.left - width),
    Math.max(8, layerRect.width - width - 8),
  );
  let top = triggerRect.bottom - layerRect.top + 4;
  if (top + height > layerRect.height - 8) {
    top = triggerRect.top - layerRect.top - height - 4;
  }
  surface.menu.style.left = `${left}px`;
  surface.menu.style.top = `${Math.max(8, top)}px`;
}

export function renderDesignerVariableInspector(
  surface: DesignerVariableInspectorSurface,
  panel: HTMLElement,
  document: ScreenDocument | undefined,
  draft: DesignerVariablesDraft,
): void {
  const index =
    draft.configuringIndex ??
    draft.renamingIndex ??
    draft.editingDescriptionIndex ??
    draft.editingValueIndex ??
    draft.deletingIndex ??
    -1;
  const hasEditor =
    draft.creating ||
    draft.renamingIndex !== undefined ||
    draft.editingDescriptionIndex !== undefined ||
    draft.editingValueIndex !== undefined ||
    draft.deletingIndex !== undefined;
  if (panel.hidden) {
    surface.layer.hidden = true;
    surface.body.replaceChildren();
    return;
  }

  const entry = index >= 0 ? document?.variables[index] : undefined;
  const variable =
    document !== undefined && entry !== undefined
      ? readDesignerVariableView(document, entry)
      : undefined;
  const detailIndex =
    !hasEditor && draft.expandedVariableName !== undefined && document !== undefined
      ? document.variables.findIndex((item) => item.id === draft.expandedVariableName)
      : -1;
  const detailEntry = detailIndex >= 0 ? document?.variables[detailIndex] : undefined;
  const detailVariable =
    document !== undefined && detailEntry !== undefined
      ? readDesignerVariableView(document, detailEntry)
      : undefined;

  if (!hasEditor && detailVariable === undefined) {
    surface.layer.hidden = true;
    surface.body.replaceChildren();
    return;
  }

  const previousSummary = surface.card.querySelector<HTMLElement>('.variable-error-summary');
  previousSummary?.remove();
  surface.body.replaceChildren();
  surface.foot.replaceChildren();
  surface.foot.hidden = true;

  let title: string = DESIGNER_UI_TEXT.variables.createTitle;
  let eyebrow: string = DESIGNER_UI_TEXT.variables.eyebrowCreate;
  let sub: string = DESIGNER_UI_TEXT.variables.createIntro;
  let glyphType: ScreenVariable['type'] = draft.create.type;
  let detailMode = false;

  if (draft.creating) {
    appendCreateEditor(surface.body, draft.create, draft.configuringIndex);
    const editing = draft.configuringIndex !== undefined;
    title = editing
      ? DESIGNER_UI_TEXT.variables.editVariableTitle
      : DESIGNER_UI_TEXT.variables.createFormTitle(variableTypeLabel(draft.create.type));
    eyebrow = `${variableTypeShort(draft.create.type)} · ${
      editing ? DESIGNER_UI_TEXT.variables.eyebrowEdit : DESIGNER_UI_TEXT.variables.eyebrowCreate
    }`;
    sub = editing
      ? draft.create.name || DESIGNER_UI_TEXT.variables.unselectedSource
      : DESIGNER_UI_TEXT.variables.createFormSub;
    glyphType = draft.create.type;
  } else if (draft.renamingIndex !== undefined && variable !== undefined) {
    appendRenameEditor(surface.body, variable, draft.renamingIndex);
    title = DESIGNER_UI_TEXT.variables.renameTitle;
    eyebrow = `${variableTypeShort(variable.type)} · ${DESIGNER_UI_TEXT.variables.eyebrowEdit}`;
    sub = variable.name;
    glyphType = variable.type;
  } else if (draft.editingDescriptionIndex !== undefined && variable !== undefined) {
    appendDescriptionEditor(surface.body, variable, draft.editingDescriptionIndex);
    title = DESIGNER_UI_TEXT.variables.editDescriptionTitle;
    eyebrow = `${variableTypeShort(variable.type)} · ${DESIGNER_UI_TEXT.variables.eyebrowEdit}`;
    sub = variable.name;
    glyphType = variable.type;
  } else if (draft.editingValueIndex !== undefined && variable !== undefined) {
    appendValueEditor(surface.body, variable, draft.editingValueIndex);
    title = DESIGNER_UI_TEXT.variables.editValueTitle;
    eyebrow = `${variableTypeShort(variable.type)} · ${DESIGNER_UI_TEXT.variables.eyebrowEdit}`;
    sub = variable.name;
    glyphType = variable.type;
  } else if (draft.deletingIndex !== undefined && variable !== undefined) {
    appendDeleteConfirmation(surface.body, variable.name, draft.deletingIndex);
    title = DESIGNER_UI_TEXT.variables.confirmDelete;
    eyebrow = `${variableTypeShort(variable.type)} · ${DESIGNER_UI_TEXT.variables.eyebrowDelete}`;
    sub = variable.name;
    glyphType = variable.type;
  } else if (detailVariable !== undefined) {
    appendVariableDetails(surface.body, detailVariable, detailIndex, draft);
    title = detailVariable.name;
    eyebrow = `${variableTypeShort(detailVariable.type)} · ${variableTypeLabel(detailVariable.type)}`;
    sub =
      detailVariable.type === 'static'
        ? DESIGNER_UI_TEXT.variables.manualCurrentDocument
        : detailVariable.sourceId || DESIGNER_UI_TEXT.variables.unselectedSource;
    glyphType = detailVariable.type;
    detailMode = true;
  } else {
    surface.layer.hidden = true;
    surface.body.replaceChildren();
    return;
  }

  const summary = surface.body.querySelector<HTMLElement>('.variable-error-summary');
  if (summary !== null) surface.card.insertBefore(summary, surface.body);

  const activeIndex = detailMode ? detailIndex : index;
  surface.title.textContent = title;
  surface.eyebrowText.textContent = eyebrow;
  surface.sub.textContent = sub;
  surface.glyph.replaceChildren();
  if (detailVariable !== undefined && detailMode) {
    surface.glyph.appendChild(createVariableGlyph(surface.glyph.ownerDocument, detailVariable));
  } else {
    surface.glyph.appendChild(createTypeBrick(surface.glyph.ownerDocument, glyphType));
  }
  surface.close.dataset.variableIndex = String(activeIndex);

  const editorActions = surface.body.querySelector<HTMLElement>('.variable-editor-actions');
  if (editorActions !== null) {
    surface.foot.appendChild(editorActions);
    surface.foot.hidden = false;
  } else if (detailMode && detailVariable !== undefined) {
    appendDetailFoot(surface, detailVariable, detailIndex, draft);
  }

  surface.layer.dataset.variableInspectorMode = detailMode
    ? 'detail'
    : draft.creating
      ? draft.configuringIndex === undefined
        ? 'create'
        : 'configuration'
      : draft.deletingIndex !== undefined
        ? 'delete'
        : 'edit';
  surface.body.dataset.variableInspectorMode = surface.layer.dataset.variableInspectorMode;
  surface.body.dataset.variableIndex = String(activeIndex);
  surface.layer.hidden = false;
  positionInspector(surface, panel, activeIndex);
}

function variableTypeLabel(type: ScreenVariable['type']): string {
  return type === 'static'
    ? DESIGNER_UI_TEXT.variables.typeStatic
    : type === 'data-source'
      ? DESIGNER_UI_TEXT.variables.typeDataSource
      : DESIGNER_UI_TEXT.variables.typeUrlQuery;
}

function variableTypeShort(type: ScreenVariable['type']): string {
  return type === 'static'
    ? DESIGNER_UI_TEXT.variables.typeShortStatic
    : type === 'data-source'
      ? DESIGNER_UI_TEXT.variables.typeShortDataSource
      : DESIGNER_UI_TEXT.variables.typeShortUrlQuery;
}

function createTypeBrick(ownerDocument: Document, type: ScreenVariable['type']): HTMLElement {
  const brick = ownerDocument.createElement('span');
  brick.className = 'variable-inspector-type';
  brick.innerHTML = designerIcon(
    type === 'data-source' ? 'database' : type === 'url-query' ? 'link' : 'variable',
  );
  return brick;
}

function appendDetailFoot(
  surface: DesignerVariableInspectorSurface,
  variable: ReturnType<typeof readDesignerVariableView>,
  index: number,
  draft: DesignerVariablesDraft,
): void {
  const ownerDocument = surface.foot.ownerDocument;
  const add = (action: string, label: string, variant: 'ghost' | 'danger' | 'primary'): void => {
    const button = createDesignerButton(ownerDocument, {
      className: 'variable-inspector-foot-button',
      text: label,
      tip: label,
      variant,
    });
    button.dataset.variableAction = action;
    button.dataset.variableIndex = String(index);
    surface.foot.appendChild(button);
  };
  add('duplicate', DESIGNER_UI_TEXT.variables.copy, 'ghost');
  if ((draft.referenceCounts.get(variable.id) ?? 0) > 0) {
    add('references', DESIGNER_UI_TEXT.variables.viewReferences, 'ghost');
  }
  const spacer = ownerDocument.createElement('span');
  spacer.className = 'variable-inspector-foot-spacer';
  surface.foot.appendChild(spacer);
  if ((draft.referenceCounts.get(variable.id) ?? 0) === 0) {
    add('delete', DESIGNER_UI_TEXT.variables.delete, 'danger');
  }
  add('edit-config', DESIGNER_UI_TEXT.variables.editMenu, 'primary');
  surface.foot.hidden = false;
}

function positionInspector(
  surface: DesignerVariableInspectorSurface,
  panel: HTMLElement,
  index: number,
): void {
  if (typeof surface.layer.getBoundingClientRect !== 'function') return;
  const view = panel.ownerDocument.defaultView;
  if (view === null) return;
  const layerRect = surface.layer.getBoundingClientRect();
  if (layerRect.width <= 0 || layerRect.height <= 0) return;
  const panelRect = panel.getBoundingClientRect();
  const rail = typeof panel.closest === 'function' ? panel.closest<HTMLElement>('.rail') : null;
  const railRect = rail?.getBoundingClientRect();
  const anchor =
    index >= 0
      ? panel.querySelector<HTMLElement>(`[data-variable-row="${index}"]`)
      : panel.querySelector<HTMLElement>('[data-variable-action="add"]');
  const anchorRect =
    anchor !== null && typeof anchor.getBoundingClientRect === 'function'
      ? anchor.getBoundingClientRect()
      : null;
  const width = surface.card.offsetWidth || 376;
  const height = surface.card.offsetHeight || 420;
  const right = railRect?.right ?? panelRect.right;
  const left = Math.min(
    Math.max(8, right + 10 - layerRect.left),
    Math.max(8, layerRect.width - width - 8),
  );
  const preferredTop = (anchorRect?.top ?? panelRect.top) - 6 - layerRect.top;
  const top = Math.min(Math.max(8, preferredTop), Math.max(8, layerRect.height - height - 8));
  surface.card.style.left = `${left}px`;
  surface.card.style.top = `${top}px`;
}

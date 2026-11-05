import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../dom/designer-icons.js';
import { createDesignerButton } from './designer-ui-primitives.js';
import { createDesignerBadge } from './panel/designer-chrome-primitives.js';

export const DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR =
  '.designer-inspector-section, [data-inspector-search-section]';

export interface DesignerInspectorSearchClipboard {
  readonly kind: string;
  readonly value: string;
  readonly checked?: boolean;
}

/**
 * Inspector sections may either wrap a `<details>` or be one themselves; this
 * resolves the toggleable disclosure for filters, preferences, and search.
 */
export function designerInspectorSectionDisclosure(
  section: HTMLElement,
): HTMLDetailsElement | null {
  if (section.tagName === 'DETAILS') return section as HTMLDetailsElement;
  return section.querySelector<HTMLDetailsElement>('details');
}

export function decorateDesignerInspectorSearchables(root: ShadowRoot | HTMLElement): void {
  let sequence = 0;
  for (const pane of root.querySelectorAll<HTMLElement>('[data-inspector-pane]')) {
    const sections = [
      ...(pane.matches(DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR) ? [pane] : []),
      ...pane.querySelectorAll<HTMLElement>(DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR),
    ];
    for (const section of sections) {
      section.dataset.inspectorSearchKind = 'section';
      section.dataset.inspectorSearchKey ||= `section-${sequence++}`;
      const heading = section.querySelector<HTMLElement>(
        '.designer-inspector-section-title, .designer-descriptor-group-summary, h3, h4',
      );
      section.dataset.inspectorSearchText ||= heading?.textContent?.trim() ?? '';
      for (const field of section.querySelectorAll<HTMLElement>('.designer-field-label')) {
        field.dataset.inspectorSearchKind = 'field';
        field.dataset.inspectorSearchKey ||= `field-${sequence++}`;
        field.dataset.inspectorSearchText ||= field.textContent?.trim() ?? '';
      }
    }
  }
}

export function designerInspectorSearchableText(element: HTMLElement): string {
  return `${element.dataset.inspectorSearchText ?? ''} ${element.textContent ?? ''}`.toLocaleLowerCase();
}

export function renderDesignerInspectorSearchResults(
  root: ShadowRoot | HTMLElement,
  fields: readonly HTMLElement[],
  sections: readonly HTMLElement[],
  query: string,
): void {
  const results = root.querySelector<HTMLElement>('[data-inspector-search-results]');
  if (results === null) return;
  results.replaceChildren();
  results.hidden = query === '';
  if (query === '') return;

  const matchedFields = fields
    .filter((field) => !field.hasAttribute('data-inspector-filtered'))
    .slice(0, 40);
  const fieldSections = new Set(
    matchedFields.map((field) =>
      field.closest<HTMLElement>(DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR),
    ),
  );
  const matchedSections = sections
    .filter(
      (section) =>
        designerInspectorSearchableText(section).includes(query) && !fieldSections.has(section),
    )
    .slice(0, 40);

  if (matchedSections.length === 0 && matchedFields.length === 0) {
    const empty = results.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state inspector-search-empty';
    empty.textContent = DESIGNER_UI_TEXT.inspectorUi.searchEmpty;
    results.appendChild(empty);
    return;
  }
  for (const section of matchedSections) {
    appendSearchResult(results, section, section, section.dataset.inspectorSearchText ?? '');
  }
  for (const field of matchedFields) {
    const section = field.closest<HTMLElement>(DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR);
    appendSearchResult(results, field, section, directLabel(field));
  }
}

export function closeDesignerInspectorSearchMenus(
  root: ShadowRoot | HTMLElement,
  except?: Element,
): void {
  for (const menu of root.querySelectorAll<HTMLElement>('[data-inspector-search-menu]')) {
    if (except !== undefined && menu.contains(except)) continue;
    menu.hidden = true;
  }
}

export function captureDesignerInspectorSearchStyle(
  root: ShadowRoot | HTMLElement,
  key: string,
): DesignerInspectorSearchClipboard | undefined {
  const control = searchTargetControl(searchTarget(root, key));
  if (control === undefined) return undefined;
  return control instanceof HTMLInputElement && isCheckable(control)
    ? { kind: searchControlKind(control), value: control.value, checked: control.checked }
    : { kind: searchControlKind(control), value: control.value };
}

export function applyDesignerInspectorSearchStyle(
  root: ShadowRoot | HTMLElement,
  key: string,
  clipboard: DesignerInspectorSearchClipboard,
): boolean {
  const control = searchTargetControl(searchTarget(root, key));
  if (control === undefined || searchControlKind(control) !== clipboard.kind) return false;
  if (control instanceof HTMLInputElement && isCheckable(control)) {
    if (clipboard.checked === undefined) return false;
    control.checked = clipboard.checked;
  } else {
    control.value = clipboard.value;
  }
  control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  control.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return true;
}

function appendSearchResult(
  results: HTMLElement,
  target: HTMLElement,
  section: HTMLElement | null,
  labelText: string,
): void {
  const pane = target.closest<HTMLElement>('[data-inspector-pane]');
  const tab = pane?.dataset.inspectorPane;
  if (tab !== 'appearance' && tab !== 'data' && tab !== 'interaction') return;
  const key = target.dataset.inspectorSearchKey;
  if (key === undefined) return;

  const sectionTitle =
    section
      ?.querySelector<HTMLElement>(
        '.designer-inspector-section-title, .designer-descriptor-group-summary, h3, h4',
      )
      ?.textContent?.trim() ?? '';
  const card = results.ownerDocument.createElement('article');
  card.className = 'designer-list-row inspector-search-result';
  card.dataset.inspectorSearchResult = key;

  const pathButton = results.ownerDocument.createElement('button');
  pathButton.type = 'button';
  pathButton.className = 'inspector-search-result-path';
  pathButton.dataset.inspectorSearchTab = tab;
  pathButton.dataset.inspectorSearchTarget = key;
  pathButton.setAttribute('data-tip', DESIGNER_UI_TEXT.inspectorUi.locateSetting);
  const locateIcon = results.ownerDocument.createElement('span');
  locateIcon.className = 'inspector-search-result-locate';
  locateIcon.innerHTML = designerIcon('locate');
  const copy = results.ownerDocument.createElement('span');
  copy.className = 'inspector-search-result-copy';
  const path = results.ownerDocument.createElement('small');
  path.textContent = DESIGNER_UI_TEXT.inspectorUi.searchPath(
    inspectorSearchTabLabel(tab),
    sectionTitle,
    '',
  );
  const label = results.ownerDocument.createElement('strong');
  label.textContent = labelText;
  copy.append(path, label);
  pathButton.append(locateIcon, copy);
  if (target.closest('[data-inspector-advanced]') !== null) {
    createDesignerBadge(pathButton, {
      text: DESIGNER_UI_TEXT.inspectorUi.advanced,
      tone: 'accent',
      className: 'inspector-search-result-badge',
    });
  }
  card.appendChild(pathButton);

  if (target.dataset.inspectorSearchKind === 'field') {
    card.appendChild(cloneSearchEditor(target, key));
  }
  const menu = createSearchContextMenu(results.ownerDocument, key);
  card.appendChild(menu);
  attachSearchContextMenu(card, pathButton, menu, results);
  results.appendChild(card);
}

function cloneSearchEditor(target: HTMLElement, key: string): HTMLElement {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.classList.add('inspector-search-result-editor');
  clone.dataset.inspectorSearchEditor = key;
  for (const element of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    delete element.dataset.inspectorSearchKind;
    delete element.dataset.inspectorSearchKey;
    delete element.dataset.inspectorSearchText;
    element.removeAttribute('data-inspector-filtered');
    element.removeAttribute('hidden');
    element.removeAttribute('id');
    element.removeAttribute('for');
    element.removeAttribute('aria-describedby');
  }
  const sourceControls = target.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');
  const clonedControls = clone.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');
  for (let index = 0; index < sourceControls.length; index++) {
    const source = sourceControls[index];
    const cloned = clonedControls[index];
    if (source === undefined || cloned === undefined) continue;
    cloned.value = source.value;
    if (source instanceof HTMLInputElement && cloned instanceof HTMLInputElement) {
      cloned.checked = source.checked;
      if (cloned.type === 'radio') cloned.name = `inspector-search-${key}-${index}`;
    }
  }
  return clone;
}

function createSearchContextMenu(ownerDocument: Document, key: string): HTMLElement {
  const menu = ownerDocument.createElement('div');
  menu.className = 'inspector-search-context-menu';
  menu.dataset.inspectorSearchMenu = key;
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  for (const [action, label] of [
    ['copy', DESIGNER_UI_TEXT.inspectorUi.copyStyle],
    ['paste', DESIGNER_UI_TEXT.inspectorUi.pasteStyle],
  ] as const) {
    const button = createDesignerButton(ownerDocument, {
      size: 'compact',
      text: label,
      variant: 'ghost',
    });
    button.dataset[action === 'copy' ? 'inspectorSearchCopyTarget' : 'inspectorSearchPasteTarget'] =
      key;
    button.setAttribute('role', 'menuitem');
    menu.appendChild(button);
  }
  return menu;
}

function attachSearchContextMenu(
  card: HTMLElement,
  pathButton: HTMLButtonElement,
  menu: HTMLElement,
  results: HTMLElement,
): void {
  const open = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    closeDesignerInspectorSearchMenus(results);
    menu.hidden = false;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  card.addEventListener('contextmenu', open);
  pathButton.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event);
  });
}

function searchTarget(root: ShadowRoot | HTMLElement, key: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[data-inspector-search-key]')].find(
    (item) => item.dataset.inspectorSearchKey === key,
  );
}

function searchTargetControl(
  target: HTMLElement | undefined,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined {
  if (target === undefined) return undefined;
  for (const selector of [
    'input[data-color-palette-field="solid"]',
    'input[data-property], select[data-property], textarea[data-property]',
    '[data-descriptor-field-id]:not([data-color-palette-field="mode"])',
    '[data-style]:not([data-color-palette-field="mode"])',
    '[data-prop]:not([data-color-palette-field="mode"])',
    'input:not([type="radio"]), select, textarea',
  ]) {
    const control = target.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(selector);
    if (control !== null) return control;
  }
  return undefined;
}

function searchControlKind(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string {
  if (control instanceof HTMLInputElement) {
    return `input:${control.dataset.descriptorControl ?? control.type}`;
  }
  return control instanceof HTMLSelectElement ? 'select' : 'textarea';
}

function isCheckable(control: HTMLInputElement): boolean {
  return control.type === 'checkbox' || control.type === 'radio';
}

function directLabel(field: HTMLElement): string {
  for (const node of field.childNodes) {
    if (node.nodeType === 3 && node.textContent?.trim()) return node.textContent.trim();
  }
  return field.dataset.inspectorSearchText ?? '';
}

/** 搜索面包屑的页签段文本（导出以便断言「对象被塞进模板串」这类渲染事故）。 */
export function inspectorSearchTabLabel(tab: 'appearance' | 'data' | 'interaction'): string {
  if (tab === 'appearance') return DESIGNER_UI_TEXT.appearance;
  if (tab === 'data') return DESIGNER_UI_TEXT.data.title;
  return DESIGNER_UI_TEXT.inspectorUi.advanced;
}

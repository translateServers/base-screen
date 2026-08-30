import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { getDesignerInspectorContext } from '../../common/operations/style/designer-inspector.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import {
  DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR,
  decorateDesignerInspectorSearchables,
  designerInspectorSearchableText,
  designerInspectorSectionDisclosure,
  renderDesignerInspectorSearchResults,
} from './designer-inspector-search-dom.js';

export type DesignerInspectorDensity = 'basic' | 'all';

export interface DesignerInspectorFilterOptions {
  readonly density: DesignerInspectorDensity;
  readonly query: string;
}

export function renderDesignerInspectorContext(
  container: HTMLElement | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (container === null) return;
  container.replaceChildren();
  const context = getDesignerInspectorContext(document, interaction, catalog);
  container.dataset.inspectorContext = context.kind;
  const panel = container.closest<HTMLElement>('[data-right-panel]');
  if (panel !== null) panel.dataset.inspectorContextKind = context.kind;
  const heading = container.ownerDocument.createElement('div');
  heading.className = 'inspector-context-heading';
  const identity = container.ownerDocument.createElement('div');
  identity.className = 'inspector-context-identity';
  const titleRow = container.ownerDocument.createElement('div');
  titleRow.className = 'inspector-context-title-row';
  const title = container.ownerDocument.createElement('strong');
  title.className = 'inspector-context-title';
  const subtitle = container.ownerDocument.createElement('span');
  subtitle.className = 'inspector-context-subtitle';
  titleRow.appendChild(title);
  identity.append(titleRow, subtitle);
  heading.appendChild(identity);

  if (context.kind === 'canvas') {
    title.textContent = DESIGNER_UI_TEXT.inspectorUi.canvas;
    subtitle.textContent =
      document === undefined ? '' : `${document.canvas.width} × ${document.canvas.height}`;
    container.appendChild(heading);
    return;
  }
  if (context.kind === 'multi-selection') {
    title.textContent = DESIGNER_UI_TEXT.inspectorUi.batchConfiguration;
    subtitle.textContent = DESIGNER_UI_TEXT.inspectorUi.multiple(context.summary.count);
    appendBadge(heading, context.summary.hasLocked, DESIGNER_UI_TEXT.inspectorUi.locked);
    container.appendChild(heading);
    return;
  }

  title.textContent = context.component.name;
  subtitle.textContent =
    context.manifest === undefined
      ? context.component.type
      : DESIGNER_UI_TEXT.inspectorUi.componentMeta(context.component.type, context.manifest.name);
  const icon = container.ownerDocument.createElement('span');
  icon.className = 'inspector-context-material-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = designerIcon(materialIcon(context.component.type));
  titleRow.appendChild(icon);
  container.appendChild(heading);
}

function materialIcon(type: string): DesignerIconName {
  if (type.includes('echarts') || type.includes('chart')) return 'chart';
  if (type.includes('table')) return 'table';
  if (type.includes('image')) return 'image';
  if (type.includes('text')) return 'text';
  if (type.includes('rectangle') || type.includes('ellipse') || type.includes('shape')) {
    return 'shapes';
  }
  if (type.includes('container') || type.includes('group')) return 'container';
  return 'cube';
}

export function applyDesignerInspectorFilters(
  root: ShadowRoot | HTMLElement | null,
  options: DesignerInspectorFilterOptions,
): void {
  if (root === null) return;
  decorateDesignerInspectorSearchables(root);
  const query = options.query.trim().toLocaleLowerCase();
  const inspector = root.querySelector<HTMLElement>('[data-right-panel]');
  if (inspector !== null) {
    inspector.dataset.inspectorDensity = options.density;
    inspector.toggleAttribute('data-inspector-searching', query !== '');
  }
  for (const scope of root.querySelectorAll<HTMLElement>('[data-data-workbench]')) {
    scope.dataset.inspectorDensity = options.density;
    scope.toggleAttribute('data-inspector-searching', query !== '');
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-inspector-advanced]')) {
    element.hidden = options.density === 'basic' && query === '';
  }

  const fields = [...root.querySelectorAll<HTMLElement>('[data-inspector-search-kind="field"]')];
  for (const field of fields) {
    const matches = query === '' || designerInspectorSearchableText(field).includes(query);
    field.toggleAttribute('data-inspector-filtered', !matches);
  }
  for (const section of root.querySelectorAll<HTMLElement>(
    '[data-inspector-search-kind="section"]',
  )) {
    const ownMatch = query !== '' && designerInspectorSearchableText(section).includes(query);
    const visibleChild = [
      ...section.querySelectorAll<HTMLElement>('[data-inspector-search-kind="field"]'),
    ].some((field) => !field.hasAttribute('data-inspector-filtered'));
    section.toggleAttribute('data-inspector-filtered', query !== '' && !ownMatch && !visibleChild);
    const details = designerInspectorSectionDisclosure(section);
    if (query !== '' && (ownMatch || visibleChild)) {
      if (details !== null && details.dataset.inspectorSearchWasOpen === undefined) {
        details.dataset.inspectorSearchWasOpen = String(details.open);
      }
      if (details !== null) details.open = true;
    } else if (details?.dataset.inspectorSearchWasOpen !== undefined) {
      details.open = details.dataset.inspectorSearchWasOpen === 'true';
      delete details.dataset.inspectorSearchWasOpen;
    }
  }
  const sections = [
    ...root.querySelectorAll<HTMLElement>(DESIGNER_INSPECTOR_SEARCH_SECTION_SELECTOR),
  ].filter((section) => section.dataset.inspectorSearchKind === 'section');
  renderDesignerInspectorSearchResults(root, fields, sections, query);
  for (const control of root.querySelectorAll<HTMLButtonElement>('[data-inspector-density]')) {
    control.ariaPressed = String(control.dataset.inspectorDensity === options.density);
  }
}

function appendBadge(parent: HTMLElement, visible: boolean, label: string): void {
  if (!visible) return;
  const badge = parent.ownerDocument.createElement('span');
  badge.className = 'inspector-context-badge';
  badge.textContent = label;
  parent.appendChild(badge);
}

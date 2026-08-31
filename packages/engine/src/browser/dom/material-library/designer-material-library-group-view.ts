import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';

export interface DesignerMaterialGroupView {
  readonly navigation: HTMLElement;
  readonly roots: HTMLElement;
  readonly children: HTMLElement;
  readonly heading: HTMLElement;
  readonly back: HTMLButtonElement;
}

export interface DesignerMaterialGroupButton {
  readonly key: string;
  readonly action: 'all' | 'current' | 'select';
  readonly groupId?: string | undefined;
  readonly label: string;
  readonly accessibleLabel: string;
  readonly path: string;
  readonly icon?: DesignerIconName;
  readonly count: number;
  readonly selected: boolean;
  readonly hasChildren?: boolean;
}

const views = new WeakMap<HTMLElement, DesignerMaterialGroupView>();

export function getMaterialGroupView(navigation: HTMLElement): DesignerMaterialGroupView {
  const existing = views.get(navigation);
  if (existing !== undefined && navigation.contains(existing.roots)) return existing;
  const document = navigation.ownerDocument;
  const roots = document.createElement('div');
  roots.className = 'material-group-roots';
  roots.dataset.materialGroupList = 'roots';
  roots.setAttribute('role', 'group');
  roots.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroupRoots);
  const secondary = document.createElement('div');
  secondary.className = 'material-group-secondary';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'designer-control designer-button material-group-back';
  back.dataset.materialGroupAction = 'back';
  back.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroupBack);
  back.innerHTML = designerIcon('chevron-left');
  const heading = document.createElement('span');
  heading.className = 'material-group-heading-label';
  const children = document.createElement('div');
  children.className = 'material-group-children';
  children.dataset.materialGroupList = 'children';
  children.setAttribute('role', 'group');
  children.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroupChildren);
  back.append(heading);
  secondary.append(back, children);
  navigation.replaceChildren(roots, secondary);
  const view = { navigation, roots, children, heading, back };
  views.set(navigation, view);
  return view;
}

// Reconcile by stable group id, preserving focus and each column's scroll position.
export function renderMaterialGroupButtons(
  list: HTMLElement,
  descriptors: readonly DesignerMaterialGroupButton[],
): void {
  const root = list.getRootNode() as Document | ShadowRoot;
  const previouslyFocused = root.activeElement;
  const restoreFocus = previouslyFocused !== null && list.contains(previouslyFocused);
  const existing = new Map(
    [...list.querySelectorAll<HTMLButtonElement>('[data-material-group-key]')].map((button) => [
      button.dataset.materialGroupKey,
      button,
    ]),
  );
  const focusedKey = [...existing.values()].find((button) => button.tabIndex === 0)?.dataset
    .materialGroupKey;
  const focusKey = descriptors.some((entry) => entry.key === focusedKey)
    ? focusedKey
    : (descriptors.find((entry) => entry.selected)?.key ?? descriptors[0]?.key);
  const keys = new Set(descriptors.map((entry) => entry.key));
  let fallbackFocus: HTMLButtonElement | undefined;
  for (const [key, button] of existing) {
    if (key === undefined || !keys.has(key)) button.remove();
  }
  for (const [index, descriptor] of descriptors.entries()) {
    const button = existing.get(descriptor.key) ?? createGroupButton(list.ownerDocument);
    button.dataset.materialGroupKey = descriptor.key;
    button.dataset.materialGroupAction = descriptor.action;
    button.dataset.materialGroupHasChildren = String(descriptor.hasChildren === true);
    if (descriptor.action === 'select') button.dataset.materialGroup = descriptor.groupId ?? '';
    if (descriptor.action === 'all') button.dataset.materialGroupAll = 'true';
    if (descriptor.action === 'current')
      button.dataset.materialGroupCurrent = descriptor.groupId ?? '';
    button.ariaPressed = String(descriptor.selected);
    button.ariaLabel = descriptor.accessibleLabel;
    button.title = DESIGNER_UI_TEXT.materialGroupTitle(descriptor.path, descriptor.count);
    button.setAttribute('aria-description', button.title);
    button.tabIndex = descriptor.key === focusKey ? 0 : -1;
    if (button.tabIndex === 0) fallbackFocus = button;
    button.querySelector<HTMLElement>('.material-group-label')!.textContent = descriptor.label;
    const glyph = button.querySelector<HTMLElement>('.material-group-glyph')!;
    glyph.hidden = descriptor.icon === undefined;
    if (glyph.dataset.icon !== descriptor.icon) {
      glyph.dataset.icon = descriptor.icon ?? '';
      glyph.innerHTML = descriptor.icon === undefined ? '' : designerIcon(descriptor.icon);
    }
    const count = button.querySelector<HTMLElement>('.material-group-count')!;
    count.textContent = String(descriptor.count);
    count.ariaLabel = DESIGNER_UI_TEXT.materialGroupCount(descriptor.count);
    button.querySelector<HTMLElement>('.material-group-chevron')!.hidden = !descriptor.hasChildren;
    if (list.children[index] !== button) list.insertBefore(button, list.children[index] ?? null);
  }
  if (restoreFocus) {
    const focused = list.contains(previouslyFocused)
      ? (previouslyFocused as HTMLElement)
      : fallbackFocus;
    if (root.activeElement !== focused) focused?.focus({ preventScroll: true });
  }
}

function createGroupButton(document: Document): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button material-group-button';
  const glyph = document.createElement('span');
  glyph.className = 'material-group-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'material-group-label';
  const meta = document.createElement('span');
  meta.className = 'material-group-meta';
  const count = document.createElement('span');
  count.className = 'material-group-count';
  const chevron = document.createElement('span');
  chevron.className = 'material-group-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = designerIcon('chevron-right');
  meta.append(count, chevron);
  button.append(glyph, label, meta);
  return button;
}

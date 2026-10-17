import { designerIcon } from '../../ui/designer-icons.js';
import type { DesignerMenuControllerCallbacks } from './designer-menu-model.js';
import { TOGGLE_MENU_ACTIONS } from './designer-menu-model.js';

export function positionMenu(menu: HTMLElement, toggle: HTMLElement, root: ShadowRoot): void {
  // Clear any previous inline positioning from context menu
  menu.style.left = '';
  menu.style.right = '';
  menu.style.top = '';

  const layout = root.host as HTMLElement | null;
  if (layout === null) return;

  const layoutRect = layout.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;

  // Position horizontally: align with toggle, clamp to layout bounds
  let left = toggleRect.left - layoutRect.left;
  // Ensure menu doesn't overflow right edge
  if (left + menuWidth > layoutRect.width - 8) {
    left = layoutRect.width - menuWidth - 8;
  }
  // Ensure menu doesn't overflow left edge
  if (left < 8) left = 8;

  menu.style.left = `${left}px`;
}

export function renderMenuState(
  callbacks: DesignerMenuControllerCallbacks,
  menu: HTMLElement,
): void {
  for (const control of menu.querySelectorAll<HTMLButtonElement>('[data-menu-action]')) {
    const id = control.dataset.menuAction;
    if (id === undefined) continue;
    const state = callbacks.getOperationState(id);
    if (state !== undefined) {
      control.hidden = !state.available;
      control.disabled = !state.enabled;
      // Set aria-checked for toggle actions
      if (TOGGLE_MENU_ACTIONS.has(id)) {
        control.setAttribute('aria-checked', String(state.checked));
        // Ensure checkmark element exists
        if (!control.querySelector('.menu-item-check')) {
          const check = document.createElement('span');
          check.className = 'menu-item-check';
          check.setAttribute('aria-hidden', 'true');
          check.innerHTML = designerIcon('check');
          control.prepend(check);
          // Wrap label text
          const label = document.createElement('span');
          label.className = 'menu-item-label';
          // Move text nodes to label (but keep kbd at end)
          const nodes = Array.from(control.childNodes);
          for (const node of nodes) {
            if (
              node.nodeType === Node.TEXT_NODE ||
              (node instanceof HTMLElement &&
                !node.classList.contains('menu-item-check') &&
                node.tagName !== 'KBD')
            ) {
              label.appendChild(node);
            }
          }
          control.insertBefore(label, control.querySelector('kbd'));
        }
      }
    }
  }
  renderSubmenuVisibility(menu);
}

function renderSubmenuVisibility(menu: HTMLElement): void {
  for (const wrapper of menu.querySelectorAll<HTMLElement>('.designer-menu-submenu-wrap')) {
    const submenu = wrapper.querySelector<HTMLElement>('[data-submenu]');
    const trigger = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
    if (submenu === null || trigger === null) continue;
    const hasAvailableItem = Array.from(
      submenu.querySelectorAll<HTMLButtonElement>('[data-menu-action], [data-plugin-command]'),
    ).some((item) => !item.hidden);
    wrapper.hidden = !hasAvailableItem;
    if (!hasAvailableItem) {
      submenu.hidden = true;
      trigger.ariaExpanded = 'false';
    }
  }
}

export function closeSiblingSubmenus(wrapper: HTMLElement, keep: HTMLElement): void {
  for (const sibling of wrapper.parentElement?.querySelectorAll<HTMLElement>('[data-submenu]') ??
    []) {
    if (sibling === keep) continue;
    sibling.hidden = true;
    delete sibling.dataset.submenuOpenSource;
    const siblingToggle =
      sibling.parentElement?.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
    if (siblingToggle !== null && siblingToggle !== undefined) {
      siblingToggle.ariaExpanded = 'false';
    }
  }
}

export function positionSubmenu(
  submenu: HTMLElement,
  wrapper: HTMLElement,
  root: ShadowRoot,
): void {
  const layout = root.host as HTMLElement | null;
  if (
    layout === null ||
    layout === undefined ||
    typeof layout.getBoundingClientRect !== 'function' ||
    typeof wrapper.getBoundingClientRect !== 'function'
  ) {
    return;
  }
  const layoutRect = layout.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const submenuWidth = submenu.offsetWidth;
  const submenuHeight = submenu.offsetHeight;
  const edgeGap = 8;
  const overlap = 1;
  const layoutRight = layoutRect.left + layoutRect.width;
  const layoutBottom = layoutRect.top + layoutRect.height;
  const wrapperRight = wrapperRect.left + wrapperRect.width;
  const wrapperBottom = wrapperRect.top + wrapperRect.height;
  const rightSpace = layoutRight - wrapperRight;
  const leftSpace = wrapperRect.left - layoutRect.left;
  const canOpenLeft = leftSpace >= submenuWidth + edgeGap;
  // 顶层菜单靠右半时子菜单向左翻，避免飞出设计器；否则优先向右。
  const anchorMenu = submenu.closest<HTMLElement>('[data-menu]');
  const anchorRect = anchorMenu?.getBoundingClientRect();
  const anchorCenter =
    anchorRect === undefined ? wrapperRect.left : anchorRect.left + anchorRect.width / 2;
  const prefersLeft = anchorCenter > layoutRect.left + layoutRect.width / 2;
  const opensLeft = canOpenLeft && (prefersLeft || rightSpace < submenuWidth + edgeGap);
  submenu.dataset.submenuSide = opensLeft ? 'left' : 'right';
  submenu.style.left = opensLeft ? '' : 'calc(100% - 4px)';
  submenu.style.right = opensLeft ? 'calc(100% - 4px)' : '';

  const spaceBelow = layoutBottom - wrapperRect.top - edgeGap;
  const spaceAbove = wrapperBottom - layoutRect.top - edgeGap;
  const opensUp = spaceBelow < submenuHeight && spaceAbove >= spaceBelow;
  const availableHeight = Math.max(0, opensUp ? spaceAbove : spaceBelow);
  submenu.style.top = opensUp ? 'auto' : `-${overlap}px`;
  submenu.style.bottom = opensUp ? `-${overlap}px` : 'auto';
  submenu.style.maxHeight = submenuHeight > availableHeight ? `${availableHeight}px` : '';
}

export function closeSubmenus(root: ShadowRoot): void {
  for (const submenu of root.querySelectorAll<HTMLElement>('[data-submenu]')) {
    submenu.hidden = true;
    delete submenu.dataset.submenuOpenSource;
  }
  for (const toggle of root.querySelectorAll<HTMLButtonElement>('[data-submenu-toggle]')) {
    toggle.ariaExpanded = 'false';
  }
}

export function switchToMenu(
  callbacks: DesignerMenuControllerCallbacks,
  trigger: HTMLButtonElement,
  root: ShadowRoot,
  prepareMenu?: (menu: HTMLElement) => void,
): void {
  const menuId = trigger.dataset.menuToggle;
  if (menuId === undefined) return;
  // Close all menus
  for (const m of root.querySelectorAll<HTMLElement>('[data-menu]')) {
    m.hidden = true;
  }
  for (const t of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
    t.ariaExpanded = 'false';
  }
  closeSubmenus(root);
  const menu = root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
  if (menu !== null) {
    prepareMenu?.(menu);
    menu.hidden = false;
    positionMenu(menu, trigger, root);
    renderMenuState(callbacks, menu);
    trigger.ariaExpanded = 'true';
    const firstItem = menu.querySelector<HTMLButtonElement>(
      '.designer-menu-item:not(:disabled):not([hidden])',
    );
    firstItem?.focus();
  }
}

export function getMenuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('.designer-menu-item:not(:disabled):not([hidden])'),
  );
}

export function focusMenuItem(menu: HTMLElement, current: HTMLElement, direction: 1 | -1): void {
  const items = getMenuItems(menu);
  const currentIndex = items.indexOf(current as HTMLButtonElement);
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
}

// 把光标锚点夹紧到 [0, fit]；fit 为负（菜单超出容器）时退化为只保证非负，保持光标锚定。
export function clampToFit(anchor: number, fit: number): number {
  return fit >= 0 ? Math.min(Math.max(0, anchor), fit) : Math.max(0, anchor);
}

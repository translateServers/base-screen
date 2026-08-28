import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { contextMenuHtml, type DesignerContextMenuAction } from './designer-workspace.js';

export interface DesignerMenuControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getContextMenu: () => HTMLElement | undefined;
  readonly getSelectedComponentIds: () => readonly string[];
  readonly getOperationState: (id: string) => DesignerOperationStateShape | undefined;
}

export interface DesignerOperationStateShape {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly checked: boolean;
}

// Actions that act as toggles (show checkmark when enabled/active).
const TOGGLE_MENU_ACTIONS = new Set([
  'toggle-grid',
  'toggle-guides',
  'toggle-border-guides',
  'toggle-snap',
]);

// 画布右键菜单按右键目标动态组合：空白画布、单个组件与多选（框选）显示不同菜单。
const DESIGNER_CONTEXT_MENU = {
  canvas: [
    'undo',
    'redo',
    'separator',
    'select-all',
    'paste',
    'separator',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
    'zoom-fit',
    'separator',
    {
      label: DESIGNER_UI_TEXT.canvasAids,
      entries: ['toggle-grid', 'toggle-guides', 'toggle-border-guides'],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  component: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
    {
      label: DESIGNER_UI_TEXT.layer,
      entries: [
        'bring-to-front',
        'bring-forward',
        'send-backward',
        'send-to-back',
        'lock',
        'unlock',
        'hide',
      ],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  multi: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
    {
      label: DESIGNER_UI_TEXT.arrange,
      entries: [
        'align-left',
        'align-center',
        'align-right',
        'align-top',
        'align-middle',
        'align-bottom',
        'separator',
        'distribute-horizontal',
        'distribute-vertical',
      ],
    },
    {
      label: DESIGNER_UI_TEXT.layer,
      entries: [
        'bring-to-front',
        'bring-forward',
        'send-backward',
        'send-to-back',
        'lock',
        'unlock',
        'hide',
      ],
    },
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
};

// 画布右键菜单与下拉菜单（含帮助面板）的 DOM 编排。只依赖根节点与操作状态查询，
// 不直接耦合元素或操作注册表。
export class DesignerMenuController {
  #helpReturnFocus: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerMenuControllerCallbacks) {}

  toggleMenuFromTarget(target: Element): boolean {
    const submenuToggle = target.closest<HTMLButtonElement>('[data-submenu-toggle]');
    if (submenuToggle !== null) return this.toggleSubmenu(submenuToggle);
    const toggle = target.closest<HTMLButtonElement>('[data-menu-toggle]');
    if (toggle === null) return false;
    const menuId = toggle.dataset.menuToggle;
    const root = this.callbacks.getRoot();
    if (menuId === undefined || root === null) return true;

    const isOpening = (() => {
      const menu = root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
      return menu !== null && menu.hidden;
    })();

    // Close all menus first
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      menu.hidden = true;
    }
    this.closeSubmenus(root);

    if (isOpening) {
      const menu = root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
      if (menu !== null) {
        menu.hidden = false;
        this.positionMenu(menu, toggle, root);
        this.renderMenuState(menu);
        // Focus first enabled menu item for keyboard navigation
        const firstItem = menu.querySelector<HTMLButtonElement>(
          '.designer-menu-item:not(:disabled):not([hidden])',
        );
        firstItem?.focus();
      }
    }

    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
      control.ariaExpanded = 'false';
    }
    if (isOpening) {
      toggle.ariaExpanded = 'true';
    }
    return true;
  }

  private positionMenu(menu: HTMLElement, toggle: HTMLElement, root: ShadowRoot): void {
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

  private renderMenuState(menu: HTMLElement): void {
    for (const control of menu.querySelectorAll<HTMLButtonElement>('[data-menu-action]')) {
      const id = control.dataset.menuAction;
      if (id === undefined) continue;
      const state = this.callbacks.getOperationState(id);
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
            check.innerHTML = checkGlyph();
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
    this.renderSubmenuVisibility(menu);
  }

  private renderSubmenuVisibility(menu: HTMLElement): void {
    for (const wrapper of menu.querySelectorAll<HTMLElement>('.designer-menu-submenu-wrap')) {
      const submenu = wrapper.querySelector<HTMLElement>('[data-submenu]');
      const trigger = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
      if (submenu === null || trigger === null) continue;
      const hasAvailableItem = Array.from(
        submenu.querySelectorAll<HTMLButtonElement>('[data-menu-action]'),
      ).some((item) => !item.hidden);
      wrapper.hidden = !hasAvailableItem;
      if (!hasAvailableItem) {
        submenu.hidden = true;
        trigger.ariaExpanded = 'false';
      }
    }
  }

  private toggleSubmenu(toggle: HTMLButtonElement): boolean {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    const submenu = wrapper?.querySelector<HTMLElement>('[data-submenu]');
    const root = this.callbacks.getRoot();
    if (wrapper === null || submenu === null || submenu === undefined || root === null) return true;
    this.closeSiblingSubmenus(wrapper, submenu);
    const opening = submenu.hidden;
    if (!opening && submenu.dataset.submenuOpenSource === 'hover') {
      submenu.dataset.submenuOpenSource = 'click';
      toggle.ariaExpanded = 'true';
      return true;
    }
    submenu.hidden = !opening;
    toggle.ariaExpanded = String(opening);
    if (opening) {
      submenu.dataset.submenuOpenSource = 'click';
      this.renderMenuState(submenu);
      this.positionSubmenu(submenu, wrapper, root);
      submenu
        .querySelector<HTMLButtonElement>('.designer-menu-item:not(:disabled):not([hidden])')
        ?.focus();
    } else {
      delete submenu.dataset.submenuOpenSource;
    }
    return true;
  }

  onSubmenuEnter(toggle: HTMLButtonElement): void {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    const submenu = wrapper?.querySelector<HTMLElement>('[data-submenu]');
    if (wrapper === null || submenu === null || submenu === undefined) return;
    if (submenu.hidden) {
      this.closeSiblingSubmenus(wrapper, submenu);
      submenu.hidden = false;
      submenu.dataset.submenuOpenSource = 'hover';
      toggle.ariaExpanded = 'true';
      this.renderMenuState(submenu);
      const root = this.callbacks.getRoot();
      if (root !== null) this.positionSubmenu(submenu, wrapper, root);
    }
  }

  onSubmenuLeave(toggle: HTMLButtonElement): void {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    const submenu = wrapper?.querySelector<HTMLElement>('[data-submenu]');
    if (wrapper === null || submenu === null || submenu === undefined) return;
    if (!submenu.hidden) {
      submenu.hidden = true;
      delete submenu.dataset.submenuOpenSource;
      toggle.ariaExpanded = 'false';
    }
  }

  /** 鼠标离开触发按钮或其子菜单项时收起；relatedTarget 仍在同一子菜单内时保持展开。 */
  onSubmenuPointerOut(toggle: HTMLButtonElement, relatedTarget: EventTarget | null): void {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    if (wrapper === null) return;
    const stillInside =
      relatedTarget instanceof Element &&
      relatedTarget.closest('.designer-menu-submenu-wrap') === wrapper;
    if (!stillInside) this.onSubmenuLeave(toggle);
  }

  private closeSiblingSubmenus(wrapper: HTMLElement, keep: HTMLElement): void {
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

  private positionSubmenu(submenu: HTMLElement, wrapper: HTMLElement, root: ShadowRoot): void {
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
    const opensLeft = rightSpace < submenuWidth + edgeGap && leftSpace >= submenuWidth + edgeGap;
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

  private closeSubmenus(root: ShadowRoot): void {
    for (const submenu of root.querySelectorAll<HTMLElement>('[data-submenu]')) {
      submenu.hidden = true;
      delete submenu.dataset.submenuOpenSource;
    }
    for (const toggle of root.querySelectorAll<HTMLButtonElement>('[data-submenu-toggle]')) {
      toggle.ariaExpanded = 'false';
    }
  }

  /** Handle keyboard navigation within open menus. */
  onKeyDown(event: KeyboardEvent): boolean {
    const root = this.callbacks.getRoot();
    if (root === null) return false;

    const target = event.target;
    const currentMenu =
      target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-menu], [data-submenu]')
        : null;
    const openMenu =
      currentMenu ??
      Array.from(root.querySelectorAll<HTMLElement>('[data-menu]')).find((m) => !m.hidden);
    if (openMenu === undefined) return false;

    if (!(target instanceof HTMLElement)) return false;

    const inMenu = target.closest('[data-menu], [data-submenu]') !== null;
    const onToggle = target.closest('[data-menu-toggle]') !== null;
    if (!inMenu && !onToggle) return false;

    const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]'));
    const currentTrigger = triggers.find((t) => t.ariaExpanded === 'true') ?? triggers[0];
    if (currentTrigger === undefined) return false;
    const currentIndex = triggers.indexOf(currentTrigger);

    switch (event.key) {
      case 'Escape': {
        if (inMenu) {
          event.preventDefault();
          const submenu = target.closest<HTMLElement>('[data-submenu]');
          const openSubmenu = submenu !== null && submenu !== undefined ? submenu : null;
          if (openSubmenu !== null) {
            const trigger =
              openSubmenu.parentElement?.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
            openSubmenu.hidden = true;
            if (trigger !== null && trigger !== undefined) {
              trigger.ariaExpanded = 'false';
              trigger.focus();
            }
            return true;
          }
        }
        return false;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (inMenu) {
          const submenu = target.closest<HTMLElement>('[data-submenu]');
          const openSubmenu = submenu !== null && submenu !== undefined ? submenu : null;
          if (openSubmenu !== null) {
            const trigger =
              openSubmenu.parentElement?.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
            openSubmenu.hidden = true;
            if (trigger !== null && trigger !== undefined) {
              trigger.ariaExpanded = 'false';
              trigger.focus();
            }
            return true;
          }
        }
        const prevIndex = (currentIndex - 1 + triggers.length) % triggers.length;
        const prevTrigger = triggers[prevIndex];
        if (prevTrigger !== undefined) this.switchToMenu(prevTrigger, root);
        return true;
      }
      case 'ArrowRight': {
        event.preventDefault();
        const submenuToggle = target.closest<HTMLButtonElement>('[data-submenu-toggle]');
        if (submenuToggle !== null && submenuToggle !== undefined) {
          this.toggleSubmenu(submenuToggle);
          return true;
        }
        if (openMenu.dataset.submenu !== undefined) return true;
        const nextIndex = (currentIndex + 1) % triggers.length;
        const nextTrigger = triggers[nextIndex];
        if (nextTrigger !== undefined) this.switchToMenu(nextTrigger, root);
        return true;
      }
      case 'ArrowDown': {
        if (onToggle) {
          event.preventDefault();
          const menu = root.querySelector<HTMLElement>(
            `[data-menu="${currentTrigger.dataset.menuToggle}"]`,
          );
          const firstItem = menu?.querySelector<HTMLButtonElement>(
            '.designer-menu-item:not(:disabled):not([hidden])',
          );
          firstItem?.focus();
          return true;
        }
        if (inMenu) {
          event.preventDefault();
          this.focusMenuItem(openMenu, target, 1);
          return true;
        }
        return false;
      }
      case 'ArrowUp': {
        if (inMenu) {
          event.preventDefault();
          this.focusMenuItem(openMenu, target, -1);
          return true;
        }
        return false;
      }
      case 'Home': {
        if (inMenu) {
          event.preventDefault();
          const items = this.getMenuItems(openMenu);
          items[0]?.focus();
          return true;
        }
        return false;
      }
      case 'End': {
        if (inMenu) {
          event.preventDefault();
          const items = this.getMenuItems(openMenu);
          items[items.length - 1]?.focus();
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  private switchToMenu(trigger: HTMLButtonElement, root: ShadowRoot): void {
    const menuId = trigger.dataset.menuToggle;
    if (menuId === undefined) return;
    // Close all menus
    for (const m of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      m.hidden = true;
    }
    for (const t of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
      t.ariaExpanded = 'false';
    }
    this.closeSubmenus(root);
    const menu = root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
    if (menu !== null) {
      menu.hidden = false;
      this.positionMenu(menu, trigger, root);
      this.renderMenuState(menu);
      trigger.ariaExpanded = 'true';
      const firstItem = menu.querySelector<HTMLButtonElement>(
        '.designer-menu-item:not(:disabled):not([hidden])',
      );
      firstItem?.focus();
    }
  }

  private getMenuItems(menu: HTMLElement): HTMLButtonElement[] {
    return Array.from(
      menu.querySelectorAll<HTMLButtonElement>('.designer-menu-item:not(:disabled):not([hidden])'),
    );
  }

  private focusMenuItem(menu: HTMLElement, current: HTMLElement, direction: 1 | -1): void {
    const items = this.getMenuItems(menu);
    const currentIndex = items.indexOf(current as HTMLButtonElement);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  closeMenus(): boolean {
    const root = this.callbacks.getRoot();
    if (root === null) return false;
    let closed = false;
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      if (!menu.hidden) {
        menu.hidden = true;
        closed = true;
      }
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]')) {
      control.ariaExpanded = 'false';
    }
    this.closeSubmenus(root);
    return closed;
  }

  openContextMenu(event: MouseEvent): void {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined) return;
    const workspace = this.callbacks.getRoot()?.querySelector<HTMLElement>('.workspace');
    if (workspace === null || workspace === undefined) return;
    const target = event.target;
    const targetElement = target instanceof Element ? target : null;
    const component =
      targetElement?.closest<HTMLElement>('[data-base-screen-component-id]') ?? null;
    const selectedIds = this.callbacks.getSelectedComponentIds();
    const onSelectedComponent =
      component !== null &&
      component.dataset.baseScreenComponentId !== undefined &&
      selectedIds.includes(component.dataset.baseScreenComponentId);
    // 右键命中选区框（拖拽空白区/变换手柄/旋转控制，含多选包围盒内的间隙）时按当前选择解析菜单；
    // 未命中选区的组件与空白画布保持单组件/画布菜单。
    const inSelectionBox = targetElement?.closest('[data-selection]') !== null;
    menu.innerHTML = contextMenuHtml(
      selectedIds.length > 1 && (onSelectedComponent || inSelectionBox)
        ? DESIGNER_CONTEXT_MENU.multi
        : component !== null || (inSelectionBox && selectedIds.length === 1)
          ? DESIGNER_CONTEXT_MENU.component
          : DESIGNER_CONTEXT_MENU.canvas,
    );
    this.renderContextMenuState();
    menu.hidden = false;
    const bounds = workspace.getBoundingClientRect();
    // 菜单（如多选菜单）超出工作区大小时保持光标锚定，不把负的夹紧边界压回 (0,0)；
    // 高度受限时由 .designer-context-menu 的 max-height/overflow 滚动承接。
    const left = clampToFit(event.clientX - bounds.left, bounds.width - menu.offsetWidth);
    const top = clampToFit(event.clientY - bounds.top, bounds.height - menu.offsetHeight);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.focus();
  }

  renderContextMenuState(): void {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined) return;
    for (const control of menu.querySelectorAll<HTMLButtonElement>('[data-menu-action]')) {
      const id = control.dataset.menuAction;
      if (id === undefined) continue;
      const state = this.callbacks.getOperationState(id);
      if (state !== undefined) {
        control.hidden = !state.available;
        control.disabled = !state.enabled;
        if (TOGGLE_MENU_ACTIONS.has(id)) {
          control.setAttribute('aria-checked', String(state.checked));
          if (!control.querySelector('.menu-item-check')) {
            const check = document.createElement('span');
            check.className = 'menu-item-check';
            check.setAttribute('aria-hidden', 'true');
            check.innerHTML = checkGlyph();
            control.prepend(check);
            const label = document.createElement('span');
            label.className = 'menu-item-label';
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
    this.renderSubmenuVisibility(menu);
  }

  /** Refresh menu item states (enabled/disabled/checked) for any currently open menu. */
  renderMenuStates(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      if (!menu.hidden) this.renderMenuState(menu);
    }
    this.renderContextMenuState();
  }

  closeContextMenu(): boolean {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined || menu.hidden) return false;
    menu.hidden = true;
    const root = this.callbacks.getRoot();
    if (root !== null) this.closeSubmenus(root);
    return true;
  }

  onHelpClick(target: Element): boolean {
    const close = target.closest('[data-help-close]');
    if (close !== null) return this.closeHelpPanel();
    const help = target.closest<HTMLElement>('[data-help-dialog]');
    if (help === null || target !== help) return false;
    return this.closeHelpPanel();
  }

  toggleHelpPanel(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const help = root.querySelector<HTMLElement>('[data-help-dialog]');
    if (help === null || help === undefined) return;
    if (!help.hidden) {
      this.closeHelpPanel();
      return;
    }
    this.closeMenus();
    this.#helpReturnFocus =
      root.activeElement instanceof HTMLElement ? root.activeElement : undefined;
    help.hidden = false;
    const closeBtn = help.querySelector<HTMLElement>('[data-help-close]');
    if (closeBtn !== null) closeBtn.focus();
  }

  closeHelpPanel(): boolean {
    const root = this.callbacks.getRoot();
    if (root === null) return false;
    const help = root.querySelector<HTMLElement>('[data-help-dialog]');
    if (help === null || help.hidden) return false;
    help.hidden = true;
    const returnFocus = this.#helpReturnFocus;
    this.#helpReturnFocus = undefined;
    if (returnFocus?.isConnected) returnFocus.focus();
    return true;
  }
}

function checkGlyph(): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5l3 3 7-7"/></svg>`;
}

// 把光标锚点夹紧到 [0, fit]；fit 为负（菜单超出容器）时退化为只保证非负，保持光标锚定。
function clampToFit(anchor: number, fit: number): number {
  return fit >= 0 ? Math.min(Math.max(0, anchor), fit) : Math.max(0, anchor);
}

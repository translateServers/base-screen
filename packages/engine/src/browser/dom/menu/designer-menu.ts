import { contextMenuHtml } from '../workspace/designer-workspace.js';
import {
  clampToFit,
  closeSiblingSubmenus,
  closeSubmenus,
  focusMenuItem,
  getMenuItems,
  positionMenu,
  positionSubmenu,
  renderMenuState,
  switchToMenu,
} from './designer-menu-dom.js';
import {
  DESIGNER_CONTEXT_MENU,
  type DesignerMenuControllerCallbacks,
} from './designer-menu-model.js';

export type {
  DesignerMenuControllerCallbacks,
  DesignerOperationStateShape,
} from './designer-menu-model.js';

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
    closeSubmenus(root);

    if (isOpening) {
      const menu = root.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
      if (menu !== null) {
        menu.hidden = false;
        positionMenu(menu, toggle, root);
        renderMenuState(this.callbacks, menu);
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

  private toggleSubmenu(toggle: HTMLButtonElement): boolean {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    const submenu = wrapper?.querySelector<HTMLElement>('[data-submenu]');
    const root = this.callbacks.getRoot();
    if (wrapper === null || submenu === null || submenu === undefined || root === null) return true;
    closeSiblingSubmenus(wrapper, submenu);
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
      renderMenuState(this.callbacks, submenu);
      positionSubmenu(submenu, wrapper, root);
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
      closeSiblingSubmenus(wrapper, submenu);
      submenu.hidden = false;
      submenu.dataset.submenuOpenSource = 'hover';
      toggle.ariaExpanded = 'true';
      renderMenuState(this.callbacks, submenu);
      const root = this.callbacks.getRoot();
      if (root !== null) positionSubmenu(submenu, wrapper, root);
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
        if (prevTrigger !== undefined) switchToMenu(this.callbacks, prevTrigger, root);
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
        if (nextTrigger !== undefined) switchToMenu(this.callbacks, nextTrigger, root);
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
          focusMenuItem(openMenu, target, 1);
          return true;
        }
        return false;
      }
      case 'ArrowUp': {
        if (inMenu) {
          event.preventDefault();
          focusMenuItem(openMenu, target, -1);
          return true;
        }
        return false;
      }
      case 'Home': {
        if (inMenu) {
          event.preventDefault();
          const items = getMenuItems(openMenu);
          items[0]?.focus();
          return true;
        }
        return false;
      }
      case 'End': {
        if (inMenu) {
          event.preventDefault();
          const items = getMenuItems(openMenu);
          items[items.length - 1]?.focus();
          return true;
        }
        return false;
      }
      default:
        return false;
    }
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
    closeSubmenus(root);
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
    renderMenuState(this.callbacks, menu);
  }

  /** Refresh menu item states (enabled/disabled/checked) for any currently open menu. */
  renderMenuStates(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    for (const menu of root.querySelectorAll<HTMLElement>('[data-menu]')) {
      if (!menu.hidden) renderMenuState(this.callbacks, menu);
    }
    this.renderContextMenuState();
  }

  closeContextMenu(): boolean {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined || menu.hidden) return false;
    menu.hidden = true;
    const root = this.callbacks.getRoot();
    if (root !== null) closeSubmenus(root);
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

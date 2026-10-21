import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { contextMenuHtml, contextMenuSummaryHtml } from '../workspace/designer-workspace.js';
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
import { pluginCommandMenuSection, renderPluginToolsMenu } from './designer-plugin-command-menu.js';

export type {
  DesignerMenuControllerCallbacks,
  DesignerOperationStateShape,
} from './designer-menu-model.js';

/**
 * 把锚点换算到从 `offset` 起算的区域内：先转成区域本地坐标，夹到
 * [0, 区域尺寸 - 菜单尺寸]，再转回容器坐标。区域比菜单还小时保持光标锚定
 * （沿用 clampToFit 的既有语义），返回值不是负数，菜单不会被压回容器原点。
 */
function placeWithin(anchor: number, offset: number, extent: number, size: number): number {
  return clampToFit(anchor - offset, extent - size) + offset;
}

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
        renderPluginToolsMenu(menu, this.callbacks);
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

  /** 鼠标离开触发按钮或其子菜单项时收起；relatedTarget 仍落在本子菜单包裹层内时保持展开。 */
  onSubmenuPointerOut(toggle: HTMLButtonElement, relatedTarget: EventTarget | null): void {
    const wrapper = toggle.closest<HTMLElement>('.designer-menu-submenu-wrap');
    if (wrapper === null) return;
    // 用包含判定而非最近 wrap 相等判定：进入更深层（第三级及以后）嵌套 wrap 时，
    // relatedTarget 的最近 wrap 是更内层节点，会误判为离开并把父级子菜单连带收起。
    const stillInside = relatedTarget instanceof Element && wrapper.contains(relatedTarget);
    if (!stillInside) this.onSubmenuLeave(toggle);
  }

  /** Handle keyboard navigation within open menus. */
  onKeyDown(event: KeyboardEvent): boolean {
    const root = this.callbacks.getRoot();
    if (root === null) return false;

    const menuSelector = '[data-menu], [data-submenu], [data-context-menu]';
    const target = event.target;
    const currentMenu =
      target instanceof HTMLElement ? target.closest<HTMLElement>(menuSelector) : null;
    const openMenu =
      currentMenu ??
      Array.from(root.querySelectorAll<HTMLElement>('[data-menu], [data-context-menu]')).find(
        (m) => !m.hidden,
      );
    if (openMenu === undefined) return false;

    if (!(target instanceof HTMLElement)) return false;

    const inMenu = target.closest(menuSelector) !== null;
    const onToggle = target.closest('[data-menu-toggle]') !== null;
    if (!inMenu && !onToggle) return false;
    const isContextMenu = openMenu.hasAttribute('data-context-menu');

    // 左右循环限定在同一父容器内的触发器：菜单栏内跨四个菜单，状态栏缩放菜单保持自身。
    const allTriggers = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]'));
    const currentTrigger = allTriggers.find((t) => t.ariaExpanded === 'true') ?? allTriggers[0];
    if (currentTrigger === undefined) return false;
    const groupSiblings =
      currentTrigger.parentElement?.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]');
    const triggers =
      groupSiblings === undefined || groupSiblings.length === 0
        ? allTriggers
        : Array.from(groupSiblings);
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
          // 右键菜单没有菜单栏兄弟，左右键不应跳到顶栏第一颗触发器。
          if (isContextMenu) return true;
        }
        const prevIndex = (currentIndex - 1 + triggers.length) % triggers.length;
        const prevTrigger = triggers[prevIndex];
        if (prevTrigger !== undefined) {
          switchToMenu(this.callbacks, prevTrigger, root, (menu) =>
            renderPluginToolsMenu(menu, this.callbacks),
          );
        }
        return true;
      }
      case 'ArrowRight': {
        event.preventDefault();
        const submenuToggle = target.closest<HTMLButtonElement>('[data-submenu-toggle]');
        if (submenuToggle !== null && submenuToggle !== undefined) {
          this.toggleSubmenu(submenuToggle);
          return true;
        }
        if (openMenu.dataset.submenu !== undefined || isContextMenu) return true;
        const nextIndex = (currentIndex + 1) % triggers.length;
        const nextTrigger = triggers[nextIndex];
        if (nextTrigger !== undefined) {
          switchToMenu(this.callbacks, nextTrigger, root, (menu) =>
            renderPluginToolsMenu(menu, this.callbacks),
          );
        }
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

  /**
   * 打开右键菜单。`source` 是调用方已解析好的命中信息：
   * - `componentId`：图层行在同步选区后会随面板重渲染脱离文档，之后再按 DOM 反查
   *   `closest('[data-layer-id]')` 只会拿到 null，必须由事件源头先捕获再传进来；
   * - `fromPanel`：夹紧范围随之放宽到整个设计器，菜单才能盖到面板上方。
   */
  openContextMenu(
    event: MouseEvent,
    source: { readonly componentId?: string | undefined; readonly fromPanel?: boolean } = {},
  ): void {
    const menu = this.callbacks.getContextMenu();
    if (menu === undefined) return;
    const root = this.callbacks.getRoot();
    // 菜单是 .designer 的直接子节点（面板与画布共用一个浮层），定位基准也随之取 .designer。
    const layout = root?.querySelector<HTMLElement>('.designer');
    if (layout === null || layout === undefined) return;
    const target = event.target;
    const targetElement = target instanceof Element ? target : null;
    // 画布组件与图层面板行同属一份上下文：都按「命中的组件 + 当前选区」解析菜单，
    // 面板因此不需要第二套菜单项，也不会有两处需要同步的文案与可用性状态。
    const componentId =
      source.componentId ??
      targetElement?.closest<HTMLElement>('[data-base-screen-component-id]')?.dataset
        .baseScreenComponentId;
    const selectedIds = this.callbacks.getSelectedComponentIds();
    const onSelectedComponent = componentId !== undefined && selectedIds.includes(componentId);
    // 右键命中选区框（拖拽空白区/变换手柄/旋转控制，含多选包围盒内的间隙）时按当前选择解析菜单；
    // 未命中选区的组件与空白画布保持单组件/画布菜单。
    const inSelectionBox = targetElement?.closest('[data-selection]') !== null;
    const kind =
      selectedIds.length > 1 && (onSelectedComponent || inSelectionBox)
        ? 'multi'
        : componentId !== undefined || (inSelectionBox && selectedIds.length === 1)
          ? 'component'
          : 'canvas';
    const pluginItems = this.callbacks.getPluginCommandItems?.(`context.${kind}`) ?? [];
    const heading = kind === 'multi' ? contextMenuSummaryHtml(selectedIds.length) : '';
    menu.innerHTML = `${heading}${contextMenuHtml(DESIGNER_CONTEXT_MENU[kind])}${pluginCommandMenuSection(
      pluginItems,
      { label: DESIGNER_UI_TEXT.contextMenuPlugin, context: true },
    )}`;
    this.renderContextMenuState();
    menu.hidden = false;
    const bounds = layout.getBoundingClientRect();
    // 夹紧范围按来源区分：画布右键仍收在工作区内，菜单不会盖住右侧检查器；面板右键
    // 允许跨到画布上方（面板本身在工作区左侧，只夹在设计器内就已经贴住指针）。
    const clampArea =
      source.fromPanel === true || root === null
        ? bounds
        : (root.querySelector<HTMLElement>('.workspace')?.getBoundingClientRect() ?? bounds);
    // 菜单（如多选菜单）超出夹紧范围时保持光标锚定，不把负的夹紧边界压回 (0,0)；
    // 高度受限时由 .designer-context-menu 的 max-height/overflow 滚动承接。
    // 绝对定位的坐标原点是容纳块的 padding box：.designer 带 1px 外框，必须补上 clientLeft/Top，
    // 否则菜单会整体偏出边框那一像素，贴边时视觉上压过检查器/状态栏。
    const originLeft = bounds.left + (layout.clientLeft || 0);
    const originTop = bounds.top + (layout.clientTop || 0);
    const left = placeWithin(
      event.clientX,
      clampArea.left - originLeft,
      clampArea.width,
      menu.offsetWidth,
    );
    const top = placeWithin(
      event.clientY,
      clampArea.top - originTop,
      clampArea.height,
      menu.offsetHeight,
    );
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

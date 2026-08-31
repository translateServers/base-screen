import {
  getInspectorDraftTarget,
  isEditableTarget,
  isTextAreaDraft,
} from '../../browser/dom/designer-surface-router.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function initializeDesignerElementSurfaceBindings(
  element: DesignerElementHost,
  state: DesignerElementState,
): void {
  state.surfaceBindings = {
    click: [
      (target) => state.notificationController.dismiss(target as Element),
      (target) => state.errorConsoleController.onClick(target as Element),
      (target) => state.commandPaletteController.onClick(target as Element),
      (target) => state.blueprintWorkbenchController.onClick(target as Element),
      (target) => state.topbarController.onClick(target as Element),
      (target) => state.coordinateEntryController.onClick(target),
      (target) => state.menuController.onHelpClick(target as Element),
      (target) => state.menuController.toggleMenuFromTarget(target as Element),
      () => {
        state.menuController.closeMenus();
        state.menuController.closeContextMenu();
        return false;
      },
      (target) => state.runtime.executeToolFromTarget(element, target as Element),
      (target) => state.runtime.executeOperationFromTarget(element, target as Element),
      (target) => state.runtime.onStatusZoomPreset(element, target as Element),
      (target) => state.importController.onClick(target as Element),
      (target) => state.projectFeedbackController.onClick(target as Element),
      (target) => state.projectWorkspaceController.onClick(target as Element),
      (target) => state.datasetController.onClick(target as Element),
      (target) => state.integrationController.onClick(target as Element),
      (target) => state.variablesController.onClick(target as Element),
      (target) => state.workbenchController.onClick(target as Element),
      (_target, event) => state.layersController.onClick(event as MouseEvent),
      (_target, event) => {
        state.panelController.onClick(event as MouseEvent);
        return true;
      },
    ],
    contextMenu: (target, event) => {
      // 手势激活期间阻止浏览器右键菜单（R3）。
      if (state.gestureController.active) {
        event.preventDefault();
        return true;
      }
      const targetElement = target as Element;
      if (targetElement.closest('[data-viewport]')) {
        event.preventDefault();
        state.menuController.openContextMenu(event as MouseEvent);
        return true;
      }
      // 全 shadow 表面阻止浏览器默认菜单；面板不新增菜单（R4）。
      event.preventDefault();
      return true;
    },
    selectStart: (target, event) => {
      // 手势激活期全 shadow 禁选；可编辑目标放行（画布表面常禁选由手势控制器负责）。
      if (!isEditableTarget(target) && state.gestureController.active) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    copy: (target, event) => {
      // 剪贴板事件旁路（右键/系统组合）：非可编辑目标路由到应用剪贴板操作。
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      state.operations.execute('copy', undefined);
      return true;
    },
    cut: (target, event) => {
      // 未注册 cut 操作：仅阻止默认，防止设计器内容进入系统剪贴板。
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      return true;
    },
    paste: (target, event) => {
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      state.operations.execute('paste', undefined);
      return true;
    },
    gesture: (target, event) => {
      // Safari 触控板双指手势（与 ctrl+wheel 等价）：非可编辑目标阻止默认。
      if (!isEditableTarget(target)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    change: [
      (target) => state.blueprintWorkbenchController.onChange(target as Element),
      (target) => state.coordinateEntryController.onChange(target),
      (_target, event) => state.runtime.onImportChange(element, event),
      (_target, event) => state.layersController.onChange(event),
      (target) => state.datasetController.onChange(target),
      (_target, event) => {
        state.panelController.onPropertyChange(event);
        return true;
      },
    ],
    input: [
      (target) => state.blueprintWorkbenchController.onInput(target as Element),
      (target) => state.coordinateEntryController.onInput(target),
      (target) => state.commandPaletteController.onInput(target as Element),
      (target) => state.datasetController.onInput(target),
      (_target, event) => state.panelController.onInput(event),
      (_target, event) => {
        state.layersController.onInput(event);
        return true;
      },
    ],
    dragStart: [
      () => {
        // 标记本设计器发起的拖拽，供 window DnD 防线识别（零宿主干预）。
        state.eventSystem.markDragStart();
        return false;
      },
      (_target, event) => state.blueprintWorkbenchController.onDragStart(event as DragEvent),
      (_target, event) => state.panelController.onDragStart(event as DragEvent),
      (_target, event) => state.layersController.onDragStart(event as DragEvent),
    ],
    dragOver: (_target, event) => state.layersController.onDragOver(event as DragEvent),
    drop: (_target, event) => state.layersController.onDrop(event as DragEvent),
    dragEnd: () => {
      state.layersController.clearDrag();
      return true;
    },
    pointerDown: (_target, event) => {
      state.panelController.onPointerDown(event as PointerEvent);
      state.workbenchController.onPointerDown(event as PointerEvent);
      return true;
    },
    pointerMove: (_target, event) => {
      state.workbenchController.onPointerMove(event as PointerEvent);
      return true;
    },
    mouseOver: (target) => {
      const element = target as Element | null;
      const wrapper = element?.closest<HTMLElement>('.designer-menu-submenu-wrap');
      if (wrapper !== null && wrapper !== undefined) {
        const toggle = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
        if (toggle !== null && toggle !== undefined) state.menuController.onSubmenuEnter(toggle);
        return true;
      }
      return false;
    },
    mouseOut: (target, event) => {
      const element = target as Element | null;
      const wrapper = element?.closest<HTMLElement>('.designer-menu-submenu-wrap');
      if (wrapper !== null && wrapper !== undefined) {
        const toggle = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
        if (toggle !== null && toggle !== undefined) {
          state.menuController.onSubmenuPointerOut(toggle, (event as MouseEvent).relatedTarget);
        }
        return true;
      }
      return false;
    },
    pointerUp: (_target, event) => {
      state.workbenchController.onPointerUp(event as PointerEvent);
      return true;
    },
    pointerCancel: (_target, event) => {
      state.workbenchController.onPointerCancel(event as PointerEvent);
      return true;
    },
    doubleClick: (_target, event) => {
      const mouseEvent = event as MouseEvent;
      if (state.layersController.onDoubleClick(mouseEvent)) return true;
      state.workbenchController.onDoubleClick(mouseEvent);
      return true;
    },
    focusOut: (_target, event) => {
      state.coordinateEntryController.onFocusOut(event as FocusEvent);
      return state.layersController.onFocusOut(event as FocusEvent);
    },
    keyDownCapture: (_target, event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === '/' && state.commandPaletteController.onKeyDown(keyboardEvent)) {
        keyboardEvent.stopImmediatePropagation();
        return true;
      }
      return state.eventSystem.swallow(keyboardEvent);
    },
    keyUpCapture: (_target, event) => {
      // 手势激活期间 keyup 同样全吞；但 Space 必须放行到 viewport 的 keyup，
      // 否则抓手状态（spacePressed）无法在拖拽中松开复位。
      const keyboardEvent = event as KeyboardEvent;
      if (state.gestureController.active && keyboardEvent.code !== 'Space') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
      return false;
    },
    keyDown: [
      (_target, event) => state.blueprintWorkbenchController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.coordinateEntryController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.commandPaletteController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.errorConsoleController.onKeyDown(event as KeyboardEvent),
      (_target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key !== 'Escape' || !state.menuController.closeHelpPanel()) return false;
        keyboardEvent.preventDefault();
        return true;
      },
      (_target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        const inspectorDraft = getInspectorDraftTarget(keyboardEvent);
        if (
          keyboardEvent.key !== 'Enter' ||
          keyboardEvent.isComposing ||
          inspectorDraft === undefined ||
          isTextAreaDraft(inspectorDraft)
        ) {
          return false;
        }
        keyboardEvent.preventDefault();
        state.panelController.onPropertyChange({ target: inspectorDraft } as Event);
        return true;
      },
      (_target, event) => state.layersController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.variablesController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.datasetController.onKeyDown(event as KeyboardEvent),
      (_target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (!state.panelController.onKeyDown(keyboardEvent)) {
          state.runtime.onKeyDown(element, keyboardEvent);
        }
        return true;
      },
    ],
    keyUp: (_target, event) => state.viewportController.onKeyUp(event as KeyboardEvent),
  };
}

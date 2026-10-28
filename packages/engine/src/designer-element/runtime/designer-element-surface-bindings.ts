import {
  getInspectorDraftTarget,
  isEditableTarget,
  isTextAreaDraft,
} from '../../browser/dom/designer-surface-router.js';
import { hasDesignerTextSelection } from '../../browser/dom/designer-text-selection.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function initializeDesignerElementSurfaceBindings(
  element: DesignerElementHost,
  state: DesignerElementState,
): void {
  state.surfaceBindings = {
    click: [
      (target) => state.notificationController.dismiss(target as Element),
      (target) => state.errorConsoleController.onClick(target as Element),
      (target) => state.guardController.onClick(target as Element),
      (target) => state.changeController.onClick(target as Element),
      (target) => state.sceneController.onClick(target as Element),
      (target) => state.presentationLockController.onClick(target as Element),
      (target) => state.intentController.onClick(target as Element),
      (target) => state.commandPaletteController.onClick(target as Element),
      (target) => state.blueprintWorkbenchController.onClick(target as Element),
      (target) => state.topbarController.onClick(target as Element),
      (target) => state.coordinateEntryController.onClick(target),
      (target) => state.sizeEntryController.onClick(target),
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
      // 图层面板：行命中时先把选区落到该行（多选内的行保持选区），再弹出与画布同一张菜单；
      // 树的空白区没有命中行，菜单按画布上下文解析（与右键画布空白一致）。
      if (targetElement.closest('[data-layer-root]')) {
        event.preventDefault();
        // 行 id 必须在 onContextMenu 之前取：同步选区会重渲染图层树，之后行节点已脱离
        // 文档，closest 再也走不回 [data-layer-root]。
        const row = targetElement.closest<HTMLElement>('[data-layer-root] [data-layer-id]');
        const hit = state.layersController.onContextMenu(event as MouseEvent);
        if (hit !== 'ignore') {
          state.menuController.openContextMenu(event as MouseEvent, {
            componentId: hit === 'row' ? row?.dataset.layerId : undefined,
            fromPanel: true,
          });
        }
        return true;
      }
      // 其余面板维持既有的「只阻止浏览器菜单、不新增菜单」行为。
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
      // 剪贴板事件旁路（右键/系统组合）：可编辑目标走原生复制；存在真实文本选区时
      // 同样让位给浏览器，否则"复制选中组件"会吃掉面板/只读文本的复制。
      if (isEditableTarget(target)) return false;
      if (hasDesignerTextSelection(element.shadowRoot)) return false;
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
      (target) => state.sizeEntryController.onChange(target),
      (_target, event) => state.runtime.onImportChange(element, event),
      (_target, event) => state.layersController.onChange(event),
      (target) => state.datasetController.onChange(target),
      (target) => state.variablesController.onChange(target),
      (_target, event) => {
        state.panelController.onPropertyChange(event);
        return true;
      },
    ],
    input: [
      (target) => state.blueprintWorkbenchController.onInput(target as Element),
      (target) => state.coordinateEntryController.onInput(target),
      (target) => state.sizeEntryController.onInput(target),
      (target) => state.commandPaletteController.onInput(target as Element),
      (target) => state.datasetController.onInput(target),
      (target) => state.variablesController.onInput(target),
      (target) => {
        if (target !== null && (target as Element).closest('[data-intent-input]') === null) {
          return false;
        }
        state.intentController.onInput();
        return true;
      },
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
      state.sizeEntryController.onFocusOut(event as FocusEvent);
      state.variablesController.onFocusOut(event as FocusEvent);
      return state.layersController.onFocusOut(event as FocusEvent);
    },
    keyDownCapture: (_target, event) => {
      const keyboardEvent = event as KeyboardEvent;
      const isPaletteShortcut =
        (keyboardEvent.key === 'k' || keyboardEvent.key === 'K') &&
        (keyboardEvent.ctrlKey || keyboardEvent.metaKey);
      if (isPaletteShortcut && state.commandPaletteController.onKeyDown(keyboardEvent)) {
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
      (_target, event) => state.sizeEntryController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.commandPaletteController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.errorConsoleController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.guardController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.changeController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.sceneController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.presentationLockController.onKeyDown(event as KeyboardEvent),
      (_target, event) => state.intentController.onKeyDown(event as KeyboardEvent),
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

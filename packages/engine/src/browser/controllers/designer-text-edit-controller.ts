import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  buildTextEditCommand,
  isTextEditableComponent,
} from '../../common/operations/designer-text-edit-operations.js';
import {
  createTextEditOverlay,
  destroyTextEditOverlay,
  insertNewlineAtCursor,
  selectAllTextInOverlay,
} from '../dom/designer-text-edit-dom.js';

export interface DesignerTextEditCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getCanvas: () => HTMLElement | undefined;
  /** 画布当前缩放（overlay 以画布本地坐标定位，需除以缩放还原几何）。 */
  readonly getZoom: () => number;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  /** 编辑会话启停通知（供手势抑制等消费，ADR-0052 R2）。 */
  readonly onEditingChange: (editing: boolean) => void;
}

/**
 * 画布内文本编辑会话（ADR-0052）：双击进入 → contenteditable overlay 全选编辑；
 * Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交。提交复用 `update-components`
 * patch dataSource（恰一条历史），Escape 零副作用。
 */
export class DesignerTextEditController {
  #overlay: HTMLElement | undefined;
  #componentId: string | undefined;
  #initialText: string | undefined;
  #material: HTMLElement | undefined;
  #finished = false;

  constructor(private readonly callbacks: DesignerTextEditCallbacks) {}

  get editing(): boolean {
    return this.#overlay !== undefined;
  }

  isEditing(componentId: string): boolean {
    return this.#overlay !== undefined && this.#componentId === componentId;
  }

  enter(componentId: string): boolean {
    const document = this.callbacks.getDocument();
    const canvas = this.callbacks.getCanvas();
    if (document === undefined || canvas === undefined) return false;
    if (!isTextEditableComponent(document, componentId)) return false;
    const material = canvas.querySelector<HTMLElement>(
      `[data-base-screen-component-id="${componentId}"]`,
    );
    if (material === null) return false;
    const component = document.components.find((item) => item.id === componentId);
    const text =
      component?.dataSource?.type === 'static' && typeof component.dataSource.value === 'string'
        ? component.dataSource.value
        : '';

    this.#finished = false;
    this.#componentId = componentId;
    this.#initialText = text;
    this.#material = material;
    // 编辑期间隐藏物料元素本体：overlay 为透明层（视觉复制物料样式），旧文本透出会与
    // 编辑内容重叠（用户可见"新旧文本重叠"）。隐藏后露出的是画布背景，与正常视觉一致。
    material.style.visibility = 'hidden';
    this.#overlay = createTextEditOverlay(canvas, material, text, this.callbacks.getZoom());
    this.#overlay.addEventListener('keydown', this.onKeyDown);
    this.#overlay.addEventListener('blur', this.onBlur);
    selectAllTextInOverlay(this.#overlay);
    this.callbacks.onEditingChange(true);
    return true;
  }

  /** 提交编辑：文本变化时构建命令并执行（恰一条历史）；文本未变化时仅关闭会话。 */
  commit(): void {
    const document = this.callbacks.getDocument();
    const overlay = this.#overlay;
    const componentId = this.#componentId;
    if (document === undefined || overlay === undefined || componentId === undefined) return;
    const text = overlay.textContent ?? '';
    if (text !== this.#initialText) {
      const result = buildTextEditCommand(document, componentId, text);
      if (result.ok) {
        this.callbacks.report(this.callbacks.executeCommand(result.value));
      } else {
        this.callbacks.report(result);
      }
    }
    this.finish();
  }

  /** 取消编辑：零副作用、不产生历史记录。 */
  cancel(): void {
    this.finish();
  }

  /**
   * 结束进行中的编辑会话（元素 disconnect 时由宿主调用）：未编辑时零副作用，
   * 编辑中按取消收口，避免拆卸后物料 visibility 残留与 overlay 监听器/引用滞留。
   */
  disconnect(): void {
    if (this.#overlay === undefined) return;
    this.finish();
  }

  private finish(): void {
    const overlay = this.#overlay;
    this.#overlay = undefined;
    this.#componentId = undefined;
    this.#initialText = undefined;
    this.#finished = true;
    const material = this.#material;
    this.#material = undefined;
    if (material !== undefined) {
      // 恢复物料元素可见性（编辑期间隐藏以避免透明 overlay 下旧文本透出重叠）。
      material.style.visibility = '';
    }
    if (overlay !== undefined) {
      overlay.removeEventListener('keydown', this.onKeyDown);
      overlay.removeEventListener('blur', this.onBlur);
      destroyTextEditOverlay(overlay);
    }
    this.callbacks.onEditingChange(false);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        const overlay = this.#overlay;
        if (overlay !== undefined) insertNewlineAtCursor(overlay);
        return;
      }
      this.commit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };

  private readonly onBlur = (): void => {
    if (this.#finished) return;
    this.commit();
  };
}

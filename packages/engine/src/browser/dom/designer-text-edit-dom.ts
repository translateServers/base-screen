import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

// 编辑态光标的可见颜色：渐变文字（background-clip: text + color: transparent）下
// currentColor 不可见，编辑态显式给出中性光标色（提交后物料渲染恢复渐变语义）。
const TEXT_EDIT_CARET_COLOR = 'rgba(15, 23, 42, 0.9)';

/**
 * 创建画布内文本编辑 overlay（ADR-0052 R2）：contenteditable 层覆盖物料元素 rect，
 * 视觉复制物料排版样式（WYSIWYG）。overlay 是 canvas 子节点，随画布缩放/平移自动跟随；
 * 不侵入物料元素或 Renderer 内部 DOM。
 */
export function createTextEditOverlay(
  canvas: HTMLElement,
  material: HTMLElement,
  initialText: string,
): HTMLElement {
  const overlay = canvas.ownerDocument.createElement('div');
  const canvasRect = canvas.getBoundingClientRect();
  const materialRect = material.getBoundingClientRect();
  const style = canvas.ownerDocument.defaultView?.getComputedStyle(material);

  overlay.setAttribute('contenteditable', 'true');
  overlay.setAttribute('role', 'textbox');
  overlay.setAttribute('aria-label', DESIGNER_UI_TEXT.textEditing.hint);
  overlay.title = DESIGNER_UI_TEXT.textEditing.hint;
  overlay.dataset.textEditOverlay = 'true';
  overlay.textContent = initialText;

  overlay.style.cssText = [
    'position: absolute',
    `left: ${materialRect.left - canvasRect.left}px`,
    `top: ${materialRect.top - canvasRect.top}px`,
    `width: ${materialRect.width}px`,
    `height: ${materialRect.height}px`,
    'box-sizing: border-box',
    'margin: 0',
    'padding: 0',
    'display: flex',
    'flex-direction: column',
    'align-items: inherit',
    'justify-content: inherit',
    'white-space: pre-wrap',
    'overflow: hidden',
    'outline: 1px solid var(--designer-border-strong, rgba(56, 189, 248, 0.9))',
    'outline-offset: -1px',
    'background: transparent',
    'z-index: 1',
  ].join('; ');

  if (style != null) {
    const vertical = style.alignItems;
    overlay.style.alignItems =
      vertical === 'center' || vertical === 'flex-end' ? vertical : 'flex-start';
    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.fontWeight = style.fontWeight;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.textAlign = style.textAlign;
    overlay.style.letterSpacing = style.letterSpacing;
    overlay.style.color = style.color;
    overlay.style.caretColor =
      style.backgroundClip === 'text' || style.backgroundImage !== 'none'
        ? TEXT_EDIT_CARET_COLOR
        : 'currentColor';
    if (style.backgroundClip === 'text') {
      overlay.style.backgroundImage = style.backgroundImage;
      overlay.style.backgroundClip = 'text';
      overlay.style.color = 'transparent';
    }
  }

  // 编辑层独占指针与文本选择：阻止事件冒泡到画布手势与 selectstart 拦截，
  // 避免编辑期间触发拖拽/框选或原生选择被画布吞掉。
  overlay.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  overlay.addEventListener('selectstart', (event) => {
    event.stopPropagation();
  });

  canvas.appendChild(overlay);
  return overlay;
}

/** 销毁文本编辑 overlay。 */
export function destroyTextEditOverlay(overlay: HTMLElement): void {
  overlay.remove();
}

/** 聚焦 overlay 并全选文本（ADR-0052 R3：进入编辑时全选，再次点击可定位光标）。 */
export function selectAllTextInOverlay(overlay: HTMLElement): void {
  overlay.focus({ preventScroll: true });
  const selection = overlay.ownerDocument.getSelection();
  const range = overlay.ownerDocument.createRange();
  range.selectNodeContents(overlay);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** 在光标处插入换行（Shift+Enter）：contenteditable 下以文本节点换行，pre-wrap 渲染。 */
export function insertNewlineAtCursor(overlay: HTMLElement): void {
  overlay.ownerDocument.execCommand('insertText', false, '\n');
}

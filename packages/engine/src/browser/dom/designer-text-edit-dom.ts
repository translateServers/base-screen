import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

// 编辑态光标的可见颜色：渐变文字（background-clip: text + color: transparent）下
// currentColor 不可见，编辑态显式给出中性光标色（提交后物料渲染恢复渐变语义）。
const TEXT_EDIT_CARET_COLOR = 'rgba(15, 23, 42, 0.9)';

/**
 * 创建画布内文本编辑 overlay（ADR-0052 R2）：contenteditable 层覆盖物料元素 rect，
 * 视觉复制物料排版样式（WYSIWYG）。overlay 是 canvas 子节点，随画布缩放/平移自动跟随；
 * 不侵入物料元素或 Renderer 内部 DOM。
 *
 * 画布整体经 `translate(...) scale(zoom)` 变换，`getBoundingClientRect()` 返回的是
 * 缩放后的视口坐标；overlay 以画布本地坐标定位（画布变换会再次作用于子元素），
 * 必须把视口几何除以 zoom 还原本地几何，否则缩放 ≠ 100% 时出现平方级偏移与尺寸放大。
 */
export function createTextEditOverlay(
  canvas: HTMLElement,
  material: HTMLElement,
  initialText: string,
  zoom: number,
  autoWidth = false,
): HTMLElement {
  const overlay = canvas.ownerDocument.createElement('div');
  const canvasRect = canvas.getBoundingClientRect();
  const materialRect = material.getBoundingClientRect();
  const scale = Math.max(zoom, Number.EPSILON);
  // 画布 border 在缩放后同样放大：先在视口坐标中扣除（clientLeft × scale）再除缩放。
  const borderLeft = Number.isFinite(canvas.clientLeft) ? Math.max(0, canvas.clientLeft) : 0;
  const borderTop = Number.isFinite(canvas.clientTop) ? Math.max(0, canvas.clientTop) : 0;
  const originLeft = canvasRect.left + borderLeft * scale;
  const originTop = canvasRect.top + borderTop * scale;
  const left = (materialRect.left - originLeft) / scale;
  const top = (materialRect.top - originTop) / scale;
  const width = materialRect.width / scale;
  const height = materialRect.height / scale;
  const style = canvas.ownerDocument.defaultView?.getComputedStyle(material);

  overlay.setAttribute('contenteditable', 'true');
  overlay.setAttribute('role', 'textbox');
  overlay.setAttribute('aria-label', DESIGNER_UI_TEXT.textEditing.hint);
  overlay.setAttribute('data-tip', DESIGNER_UI_TEXT.textEditing.hint);
  overlay.dataset.textEditOverlay = 'true';
  overlay.textContent = initialText;

  overlay.style.cssText = [
    'position: absolute',
    `left: ${left}px`,
    `top: ${top}px`,
    `width: ${width}px`,
    `height: ${height}px`,
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
    // 编辑层必须高于全部组件与画布覆盖层：组件 z-index 为 Core painter order（0..N-1），
    // 选择层 = N+2（--designer-z-canvas-selection），overlay 取选择层 +1，避免被
    // 其他组件图层或选择框覆盖。
    'z-index: calc(var(--designer-z-canvas-selection, 0) + 1)',
  ].join('; ');

  if (autoWidth) {
    overlay.style.width = 'max-content';
    overlay.style.minWidth = '1px';
    overlay.style.maxWidth = '1000000px';
    overlay.style.whiteSpace = 'pre';
    // The material's local box remains authoritative under rotation/flip/viewport zoom.
    if (material.style.left) overlay.style.left = material.style.left;
    if (material.style.top) overlay.style.top = material.style.top;
    if (material.style.height) overlay.style.height = material.style.height;
    if (style?.transform) overlay.style.transform = style.transform;
    overlay.style.transformOrigin = 'center';
  }

  if (style != null) {
    // overlay 是 flex column：交叉轴（align-items）决定水平位置，主轴（justify-content）
    // 决定垂直位置。文本节点是收缩到内容的匿名 flex item，继承的 text-align 只作用于
    // item 内部多行——水平位置必须按 textAlign 映射到 alignItems，否则单行文本贴左。
    const horizontal =
      style.textAlign === 'center'
        ? 'center'
        : style.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start';
    overlay.style.alignItems = horizontal;
    // 垂直位置读物料内层 wrapper 的实际对齐（middle/bottom 时物料把文本移入
    // display:flex 的 wrapper 并设置 alignItems；top/无 wrapper 为 flex-start），
    // 保证 overlay 与物料逐像素一致（WYSIWYG）。
    const wrapper = material.firstElementChild;
    const wrapperStyle =
      wrapper instanceof HTMLElement
        ? canvas.ownerDocument.defaultView?.getComputedStyle(wrapper)
        : undefined;
    const vertical =
      wrapperStyle?.alignItems === 'center' || wrapperStyle?.alignItems === 'flex-end'
        ? wrapperStyle.alignItems
        : 'flex-start';
    overlay.style.justifyContent = vertical;
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

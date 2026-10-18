/**
 * 图层拖拽幽灵：跟随光标的浮起行卡片。
 *
 * 原生 drag image 由浏览器截取“拖拽源此刻的样子”，而源行在 dragstart 里会被降档到
 * 45% 透明（提示“这一项正在移动”）。两者叠加后，幽灵是一团半透明灰影，压在同样色阶
 * 的列表底色上既看不清形状也读不出名称。所以这里自绘一张幽灵：实心浮起表面 + 收边 +
 * 浮起阴影，名称与读数保持可读，方向仍由落点指示线表达。
 *
 * 浏览器只在 dragstart 派发期间截取画面，之后节点即可移除；因此这里把幽灵放在视口外，
 * 用户看不到它闪一下，只看到拖拽影像本身。
 */
export interface DesignerLayerDragImage {
  readonly image: HTMLElement;
  /** 从文档移除；重复调用无副作用。 */
  readonly dispose: () => void;
}

export function createDesignerLayerDragImage(
  row: HTMLElement,
  count = 1,
): DesignerLayerDragImage | undefined {
  const ownerDocument = row.ownerDocument;
  const root = row.getRootNode();
  // 幽灵必须挂回同一棵可绘制树（shadow root 或 document），否则拿不到设计令牌，
  // 截出来的影像会退回 UA 默认字体与颜色。
  const container =
    root !== null && 'appendChild' in root && typeof root.appendChild === 'function'
      ? (root as unknown as { readonly appendChild: (node: Node) => Node })
      : undefined;
  if (ownerDocument === null || ownerDocument === undefined || container === undefined) {
    return undefined;
  }

  const image = ownerDocument.createElement('div');
  image.className = 'layer-drag-image';
  image.setAttribute('aria-hidden', 'true');
  // 幽灵按内容收缩（不再是整行宽）：拖拽时它不能盖住落点行，也不该拖着一大片空白。
  // 行宽只作上限，长名称仍按列表里的规则省略。
  const width = row.getBoundingClientRect().width;
  if (width > 0) image.style.maxWidth = `${Math.round(width)}px`;

  // 复用行内的图标 + 双行正文节点：幽灵与列表行是同一套排版语言，不另造一份样式。
  const select = row.querySelector('.layer-select');
  if (select !== null) {
    for (const child of select.children) image.appendChild(child.cloneNode(true));
  } else {
    const name = ownerDocument.createElement('span');
    name.className = 'layer-name';
    name.textContent = row.textContent ?? '';
    image.appendChild(name);
  }

  // 多选拖拽：卡片要说明“拎起来的是一组”，否则用户会以为只移动了光标所在那一行。
  if (count > 1) {
    const badge = ownerDocument.createElement('span');
    badge.className = 'layer-drag-count';
    badge.textContent = String(count);
    image.appendChild(badge);
  }

  container.appendChild(image);
  let mounted = true;
  return {
    image,
    dispose: () => {
      if (!mounted) return;
      mounted = false;
      image.remove();
    },
  };
}

const CANVAS_HINT_DISMISSED_KEY = 'base-screen.designer.canvas-hint-dismissed';

/**
 * 画布操作提示：关闭是单向的作者偏好，沿用工作台其余 UI 偏好的 localStorage 落点
 * （沙箱宿主可能禁用存储，读失败按「未关闭」处理，写失败只丢持久化不影响本次隐藏）。
 */
export function attachDesignerCanvasHint(root: ParentNode, ownerDocument: Document): void {
  const hint = root.querySelector<HTMLElement>('[data-canvas-hint]');
  if (hint === null) return;
  if (readDismissed(ownerDocument)) {
    hint.hidden = true;
    return;
  }
  hint
    .querySelector<HTMLButtonElement>('[data-canvas-hint-dismiss]')
    ?.addEventListener('click', () => {
      hint.hidden = true;
      writeDismissed(ownerDocument);
    });
}

function readDismissed(ownerDocument: Document): boolean {
  try {
    return ownerDocument.defaultView?.localStorage.getItem(CANVAS_HINT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(ownerDocument: Document): void {
  try {
    ownerDocument.defaultView?.localStorage.setItem(CANVAS_HINT_DISMISSED_KEY, 'true');
  } catch {
    // Persistence is optional; the hint still hides for this session.
  }
}

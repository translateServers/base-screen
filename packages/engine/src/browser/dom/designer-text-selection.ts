import { isEditableTarget } from './designer-surface-router.js';

// 设计器把 Ctrl+C 与 copy 事件路由到应用剪贴板（"复制选中组件"），这条通道只应在
// 用户没有选中任何文本时生效。用户手动选中的面板文本、只读值、错误信息一旦存在
// 非折叠选区，复制语义就归浏览器，否则文本永远复制不出来（焦点常留在画布视口，
// 键盘与 copy 事件都从设计器表面经过，原生复制会被一起吞掉）。

// Chromium/WebKit 的 shadow 作用域选区读取（lib.dom 尚未声明该扩展）：选区不属于该
// shadow 树时返回 null，因此不会把宿主页面的选区误判成设计器内的选区。
type ShadowRootWithSelection = ShadowRoot & { getSelection?: () => Selection | null };

export function hasDesignerTextSelection(root: ShadowRoot | null | undefined): boolean {
  if (root === null || root === undefined) return false;
  const selection = readSelection(root);
  if (selection === null || selection.isCollapsed) return false;
  if (selection.toString().length === 0) return false;
  const anchor = selection.anchorNode;
  if (!anchorsInRoot(root, anchor)) return false;
  // 可编辑目标内的选区走原生文本编辑路径（键盘策略已按 editable 放行），不参与抢占判定。
  return !isEditableTarget(anchorElement(anchor));
}

function readSelection(root: ShadowRoot): Selection | null {
  const scoped = root as ShadowRootWithSelection;
  if (typeof scoped.getSelection === 'function') return scoped.getSelection();
  return root.ownerDocument.getSelection?.() ?? null;
}

function anchorsInRoot(root: ShadowRoot, anchor: Node | null): boolean {
  if (anchor === null) return false;
  if (root.contains(anchor)) return true;
  // 个别实现把 shadow 内选区投影到宿主元素上：只有正好落在本 shadow 宿主时才算本表面。
  return anchor === root.host;
}

function anchorElement(anchor: Node | null): Element | null {
  if (anchor === null) return null;
  if (anchor.nodeType === 3) return anchor.parentElement ?? null;
  return anchor instanceof Element ? anchor : null;
}

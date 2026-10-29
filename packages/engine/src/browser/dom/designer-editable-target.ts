// 「焦点是否在可编辑控件里」的唯一判定。
//
// 这里曾有三份逐字相同的实现：surface-router 的 `isEditableTarget` 与
// viewport / panel-selection 两个 controller 各自的私有 `isEditable`。判定一旦分歧，
// 表现是一处拦截输入、另一处把点击穿透到画布——所以收敛到单点。

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * 焦点是否在「自己会用 Enter / Space 激活」的原生控件上。
 *
 * 与 isEditableTarget 分开：按钮不可编辑，但 Enter / Space 是它的原生激活手势。键盘策略
 * 需要这一位来让行，否则命令通道会把激活手势当成快捷键吃掉。
 */
export function isNativeActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLButtonElement) return true;
  if (target instanceof HTMLAnchorElement) return target.hasAttribute('href');
  const tag = target.tagName;
  if (tag === 'SUMMARY' || tag === 'OPTION') return true;
  const role = target.getAttribute('role');
  return (
    role === 'button' ||
    role === 'switch' ||
    role === 'checkbox' ||
    role === 'radio' ||
    role === 'tab' ||
    role === 'menuitem'
  );
}

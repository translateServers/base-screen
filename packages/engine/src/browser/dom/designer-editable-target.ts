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

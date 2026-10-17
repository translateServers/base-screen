/** 路由跳转助手：统一 hash 路由的目标格式，避免各处拼接漂移。 */
export function goToList(): void {
  window.location.hash = '#/';
}

export function goToEdit(id: string): void {
  window.location.hash = `#/screens/${encodeURIComponent(id)}/edit`;
}

export function goToView(id: string): void {
  window.location.hash = `#/screens/${encodeURIComponent(id)}/view`;
}

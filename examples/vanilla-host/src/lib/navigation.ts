/** 路由跳转助手：统一 hash 路由的目标格式，避免各处拼接漂移。 */
export function goToList(): void {
  window.location.hash = '#/';
}

/** 数据源管理页（顶栏「数据源」tab 与空态引导共用）。 */
export function goToDatasources(): void {
  window.location.hash = '#/datasources';
}

/** 素材管理页（顶栏「素材」tab 与编辑页入口共用）。 */
export function goToAssets(): void {
  window.location.hash = '#/assets';
}

/** 组件库（ADR-0106）：列表与两个全页编辑器。 */
export function goToComponents(): void {
  window.location.hash = '#/components';
}

export function goToAtomicComponent(type: string | undefined, template?: string): void {
  window.location.hash =
    type === undefined
      ? `#/components/atomic/new${template === undefined ? '' : `?template=${encodeURIComponent(template)}`}`
      : `#/components/atomic/${encodeURIComponent(type)}`;
}

export function goToFragmentComponent(id: string | undefined): void {
  window.location.hash =
    id === undefined ? '#/components/fragment/new' : `#/components/fragment/${encodeURIComponent(id)}`;
}

export function goToEdit(id: string): void {
  window.location.hash = `#/screens/${encodeURIComponent(id)}/edit`;
}

export function goToView(id: string): void {
  window.location.hash = `#/screens/${encodeURIComponent(id)}/view`;
}

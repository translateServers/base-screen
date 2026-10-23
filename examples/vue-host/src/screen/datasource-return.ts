/**
 * 宿主编辑页与数据源管理页之间的返回线索。
 *
 * 三端共用同一份 sessionStorage 键与形状：编辑页在跳转前记住来源屏，数据源页据此渲染
 * “返回大屏”。只接受 `#/screens/` 下的编辑路由，避免被外部写入的任意地址当作导航目标。
 */
const STORAGE_KEY = 'base-screen.host.datasource-return';

export interface DatasourceReturnTarget {
  readonly href: string;
}

export function rememberDatasourceReturn(href: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    // 隐私模式 / 禁用存储时只是少了返回入口，不影响编辑与保存。
  }
}

export function readDatasourceReturn(): DatasourceReturnTarget | null {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    return href !== null && /^#\/screens\/[^/]+\/edit$/.test(href) ? { href } : null;
  } catch {
    return null;
  }
}

export function clearDatasourceReturn(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同 rememberDatasourceReturn：存储不可用时无需额外处理。
  }
}

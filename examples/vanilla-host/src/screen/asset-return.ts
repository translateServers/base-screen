/**
 * 宿主编辑页与素材管理页之间的返回线索。
 *
 * 三端共用同一份 sessionStorage 键与形状：编辑页跳转发前记住来源屏，素材页据此渲染
 * “返回大屏”。只接受 `#/screens/` 下的编辑路由，避免被外部写入的任意地址当作导航目标。
 */
const STORAGE_KEY = 'base-screen.host.asset-return';

export interface AssetReturnTarget {
  readonly href: string;
}

export function rememberAssetReturn(href: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    // 隐私模式 / 禁用存储时只是少了返回入口，不影响编辑与保存。
  }
}

export function readAssetReturn(): AssetReturnTarget | null {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    return href !== null && /^#\/screens\/[^/]+\/edit$/.test(href) ? { href } : null;
  } catch {
    return null;
  }
}

export function clearAssetReturn(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同 rememberAssetReturn：存储不可用时无需额外处理。
  }
}

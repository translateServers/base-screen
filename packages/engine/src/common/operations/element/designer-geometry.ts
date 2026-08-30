/**
 * 画布几何数值的全局统一规则：任何写入 canonical document 的坐标（x/y）与尺寸（width/height）
 * 都只保留小数点后两位，并夹取到合法范围。所有几何写路径（属性面板、拖拽/缩放/旋转提交、
 * 创建、对齐/分布、编组/解组等）必须复用本模块，不得各自内联实现。
 */
export function roundScreenGeometry(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 画布拖拽与形变（移动/缩放/旋转）的 1px 网格量化：结果按整数像素取整（最小步长 1px），
 * 保证整数几何在拖拽/缩放/旋转后仍是整数，不因缩放倍数或吸附到小数参考线而产生小数
 * 坐标；已带小数偏移的组件在操作后被校正到 1px 网格。仅画布交互手势路径使用；面板
 * 编辑仍保留两位小数精度。
 */
export function roundScreenStep(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function clampScreenCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

export function clampScreenSize(value: number): number {
  return Math.max(1, Math.min(1_000_000, value));
}

/**
 * 画布几何数值的全局统一规则：任何写入 canonical document 的坐标（x/y）与尺寸（width/height）
 * 都只保留小数点后两位，并夹取到合法范围。所有几何写路径（属性面板、拖拽/缩放/旋转提交、
 * 创建、对齐/分布、编组/解组等）必须复用本模块，不得各自内联实现。
 */
export function roundScreenGeometry(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampScreenCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

export function clampScreenSize(value: number): number {
  return Math.max(1, Math.min(1_000_000, value));
}

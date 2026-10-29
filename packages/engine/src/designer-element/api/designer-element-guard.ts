import type { DesignerGuardSnapshot } from '../../common/validation/designer-guard.js';
import type { DesignerElementHost } from '../runtime/designer-element-state.js';
import { getDesignerElementState } from '../runtime/designer-element-state.js';

export type { DesignerGuardSnapshot };

/**
 * 对比度守卫的只读结果：检查数、是否截断、逐项问题与建议色。
 *
 * 守卫只走确定性代码，读的是最近一次真实渲染的测量结果；没有结果时返回
 * `checked: 0`，不代表通过。
 */
export function readContrastGuard(element: DesignerElementHost): DesignerGuardSnapshot {
  return getDesignerElementState(element).guardController.readResult();
}

/** 关掉守卫只停止测量与展示；不会关闭任何校验或写入文档。 */
export function setContrastGuardEnabled(element: DesignerElementHost, enabled: boolean): void {
  getDesignerElementState(element).guardController.setEnabled(enabled);
}

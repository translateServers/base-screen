import {
  readScreenComponentValueRef,
  type ScreenComponentNode,
  type ScreenDataSourceSourceKind,
  type ScreenDocument,
  type ScreenValueRef,
} from '@base-screen/contracts';
import type { DesignerDataSourceInstanceView } from '../../dom/dataset/designer-dataset-types.js';
import { readDesignerDataSourceInstanceView } from './designer-dataset-instance-view.js';

/**
 * 组件「实际生效」的取值与实例 —— 面板渲染的唯一输入。
 *
 * 为什么需要一层 effective：**未应用的草稿也要能看见**。用户点「接数据源」选了数据集但还没
 * 应用时，文档里什么都没有；如果段集合只读文档，配置界面会在最需要它的那一刻消失。
 *
 * 两条硬约束（架构 §5.2.5 / 主理人裁决）：
 * 1. **文档优先**：已应用的取值永远压过草稿——草稿只能填"文档还没有"的空，不能覆盖已落库的
 *    状态，否则用户在另一个组件上看到的引用会与文档不一致。
 * 2. **算一次，传下去**：这里只由控制器调用一次，段集合 / 七态 / 跳转渲染三个消费方共享同
 *    一份结果；禁止各消费方再自行读文档（那会长出"两处独立推导"）。
 */
export interface DesignerDataDraftSelection {
  /**
   * 未应用的草稿取值。
   *
   * B1b-1 阶段**恒为 `null`**：接入因此与改造前逐字节相同（行为中性）。B1b-2 起由「取值方式
   * + 草稿输入」合成后填入。
   */
  readonly valueRef: ScreenValueRef | null;
  /**
   * 草稿实例（与 `valueRef` 同源）：未应用期间用它渲染 `pending` 三态。
   *
   * 与 `missing` 必须分开：草稿实例的 id 与将要落库的 id 相同，`data-instance-id` 等值校验
   * 会通过，但那个 id 在文档里还不存在——等值只证明"我要用它"，不证明"它已存在"。
   */
  readonly instance?: DesignerDraftInstance | undefined;
}

export interface DesignerDraftInstance {
  readonly id: string;
  readonly name: string;
  readonly sourceKind: ScreenDataSourceSourceKind | undefined;
}

/** 文档值优先，草稿只补空缺。 */
export function readDesignerEffectiveValueRef(
  component: ScreenComponentNode | undefined,
  draft: DesignerDataDraftSelection,
): ScreenValueRef | null {
  if (component === undefined) return draft.valueRef;
  return readScreenComponentValueRef(component) ?? draft.valueRef;
}

/**
 * 实例只读视图（三态：`document` / `pending` / `missing`）。
 *
 * 存在性只读文档派生视图（同步）；草稿实例只在"文档里确实没有、但草稿刚好指向它"时接手。
 */
export function readDesignerEffectiveInstanceView(
  document: ScreenDocument | undefined,
  value: ScreenValueRef | null,
  draft: DesignerDataDraftSelection,
): DesignerDataSourceInstanceView | undefined {
  const resolved = readDesignerDataSourceInstanceView(document, value);
  if (resolved === undefined) return undefined;
  if (resolved.status === 'document') return resolved;
  const draftInstance = draft.instance;
  if (draftInstance !== undefined && value !== null && value.kind === 'data-source-field') {
    if (draftInstance.id === value.dataSourceId) {
      return {
        id: draftInstance.id,
        name: draftInstance.name,
        sourceKind: draftInstance.sourceKind,
        updatePolicy: undefined,
        processorId: undefined,
        status: 'pending',
      };
    }
  }
  return resolved;
}

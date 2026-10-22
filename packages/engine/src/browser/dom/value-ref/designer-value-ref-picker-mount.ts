import type { ScreenValueRef } from '@base-screen/contracts';
import { createValueRefPicker } from './designer-value-ref-picker-dom.js';
import type {
  DesignerValueRefPickerInput,
  DesignerValueRefPickerOptions,
  DesignerValueRefText,
} from './designer-value-ref-types.js';

/**
 * 取值选择器的挂载层。
 *
 * 存在的唯一理由：让接入点只依赖「一个函数 + 一份文案包」，不必知道内部 DOM 细节；
 * 同时把「文案必须整包传入」这条硬约束固化在签名里（`text: DesignerValueRefText`，
 * 调用点一律写 `DESIGNER_UI_TEXT.data.ref`，禁止挑键拼对象）。
 */
export interface DesignerValueRefPickerMount {
  readonly element: HTMLElement;
  readonly dispose: () => void;
}

export function mountValueRefPicker(
  options: Omit<DesignerValueRefPickerOptions, 'ownerDocument' | 'text'> & {
    readonly ownerDocument: Document;
    readonly text: DesignerValueRefText;
  },
): DesignerValueRefPickerMount {
  return createValueRefPicker(options);
}

/** 两个引用是否指向同一取值（草稿去重与「值没变就不重渲染」的判据）。 */
export function valueRefEquals(left: ScreenValueRef | null, right: ScreenValueRef | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'variable' && right.kind === 'variable') {
    return left.variableId === right.variableId;
  }
  if (left.kind === 'data-source-field' && right.kind === 'data-source-field') {
    return (
      left.dataSourceId === right.dataSourceId &&
      left.path.length === right.path.length &&
      left.path.every((segment, index) => segment === right.path[index])
    );
  }
  if (left.kind === 'inline' && right.kind === 'inline') {
    return JSON.stringify(left.value) === JSON.stringify(right.value);
  }
  return false;
}

/**
 * 参数位的 picker 入参：只开放 `variable`。
 *
 * 固定值/变量的切换由参数行自己的两段开关承担，编辑器常驻；picker 只负责「选哪个变量」，
 * 所以列表里不该再出现一次「固定值」选项——那会让同一件事有两个入口。
 *
 * `excludedDataSourceIds` 现在就传（当前实例 id），是为 T03b 打开 `data-source-field` 时
 * 直接生效——那时只需把 `'data-source-field'` 加进 `allowedKinds`，其余不用改。
 */
export function datasetParameterPickerInput(
  current: ScreenValueRef | null,
  variables: readonly { readonly id: string; readonly name: string }[],
  excludedDataSourceIds: readonly string[] = [],
): DesignerValueRefPickerInput {
  return {
    allowedKinds: ['variable'],
    current,
    variables,
    excludedDataSourceIds,
  };
}

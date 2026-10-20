import type { ScreenJsonValue, ScreenValueRef } from '@base-screen/contracts';

/** 取值引用的三种形态（与契约同形，单独命名以便在 DOM 层表达「允许哪些」）。 */
export type DesignerValueRefKind = ScreenValueRef['kind'];

/** 搜索去抖：与素材搜索同量级，导出以便单测与探针共用同一个数字。 */
export const VALUE_REF_SEARCH_DEBOUNCE_MS = 180;

/**
 * 取值选择器的文案包。
 *
 * **必须整包传入**（调用点一律写 `text: DESIGNER_UI_TEXT.data.ref`），不允许挑几个键拼一个
 * 对象：否则下一轮加键时某个调用点会静默用旧的键集合，症状是「新文案不生效但不报错」。
 */
export interface DesignerValueRefText {
  readonly tab: {
    readonly inline: string;
    readonly variable: string;
    readonly field: string;
  };
  readonly placeholder: string;
  readonly search: string;
  readonly emptyVariables: string;
  readonly emptySearch: string;
  readonly clearSearch: string;
  readonly manage: string;
  readonly selected: (name: string) => string;
  readonly stale: string;
  readonly staleHint: string;
  /** 空态里的「新建变量」动作标签（PRD §6.6 未单列，随选择器一并引入）。 */
  readonly createVariable: string;
}

/** 列表里的一项。`id` 必须稳定（`aria-activedescendant` 用它指路）。 */
export interface DesignerValueRefOption {
  readonly id: string;
  readonly kind: DesignerValueRefKind;
  readonly label: string;
  readonly badge: string;
  readonly value: ScreenValueRef;
}

export interface DesignerValueRefVariableView {
  readonly id: string;
  readonly name: string;
}

/** 数据源实例输出（T03b 开放 `data-source-field` 后由参数位传进来）。 */
export interface DesignerValueRefFieldView {
  readonly dataSourceId: string;
  readonly label: string;
  readonly path: readonly string[];
}

export interface DesignerValueRefInlineView {
  readonly id: string;
  readonly label: string;
  readonly value: ScreenJsonValue;
}

export interface DesignerValueRefPickerInput {
  /**
   * 允许的形态。
   *
   * 阶段性约束：参数位本轮只用 `inline | variable`。`data-source-field` 要等数据源事务切到
   * `replace-data-sources` + 组件 `dataValue`（T03b）之后再开放——旧 `component.dataSource`
   * 形态表达不了「参数引用另一个实例的输出」，提前放开会产出一条无法落库的引用。
   */
  readonly allowedKinds: readonly DesignerValueRefKind[];
  readonly current: ScreenValueRef | null;
  readonly variables: readonly DesignerValueRefVariableView[];
  readonly inlineViews?: readonly DesignerValueRefInlineView[];
  readonly fields?: readonly DesignerValueRefFieldView[];
  /** 引用自身实例时要排除（自引用参数），为 T03b 留位。 */
  readonly excludedDataSourceIds?: readonly string[];
}

export interface DesignerValueRefPickerOptions {
  readonly ownerDocument: Document;
  readonly text: DesignerValueRefText;
  readonly input: DesignerValueRefPickerInput;
  /** 控件逻辑地址：写进 `data-value-ref-trigger`，段 diff 的焦点回落靠它认人。 */
  readonly controlKey: string;
  readonly ariaLabel: string;
  /** 浮层宿主（段之外）。缺省时退化到触发器最近的 `.designer` 后代。 */
  readonly popoverHost: HTMLElement | undefined;
  readonly allowCreateVariable?: boolean;
  readonly onCreateVariable?: () => void;
  readonly onManage?: () => void;
  readonly onSelect: (ref: ScreenValueRef) => void;
}

/** 触发器的可见摘要：徽标 + 名称。 */
export interface DesignerValueRefSummary {
  readonly badge: string;
  readonly label: string;
}

export function badgeOf(kind: DesignerValueRefKind, text: DesignerValueRefText): string {
  if (kind === 'inline') return text.tab.inline;
  if (kind === 'variable') return text.tab.variable;
  return text.tab.field;
}

/**
 * 一个引用在触发器等处的可见摘要。
 *
 * 名称解析遵守「有名字用名字、没有就用稳定的兜底标签」：引用指向已删除的变量/实例时，
 * 不能把内部 id 裸露给用户，也不能留空。
 */
export function summarizeValueRef(
  ref: ScreenValueRef | null,
  input: DesignerValueRefPickerInput,
  text: DesignerValueRefText,
): DesignerValueRefSummary {
  if (ref === null) return { badge: '', label: text.placeholder };
  if (ref.kind === 'variable') {
    const variable = input.variables.find((item) => item.id === ref.variableId);
    return { badge: text.tab.variable, label: variable?.name ?? ref.variableId };
  }
  if (ref.kind === 'data-source-field') {
    const field = input.fields?.find(
      (item) => item.dataSourceId === ref.dataSourceId && samePath(item.path, ref.path),
    );
    return { badge: text.tab.field, label: field?.label ?? ref.dataSourceId };
  }
  const inline = input.inlineViews?.find((item) => item.value === ref.value);
  return { badge: text.tab.inline, label: inline?.label ?? previewInline(ref.value) };
}

/** 把当前可选项展开成列表项（分段顺序固定：常量 → 变量 → 数据源输出）。 */
export function buildValueRefOptions(
  input: DesignerValueRefPickerInput,
  text: DesignerValueRefText,
): readonly DesignerValueRefOption[] {
  const options: DesignerValueRefOption[] = [];
  if (input.allowedKinds.includes('inline')) {
    const inlineViews = input.inlineViews ?? [];
    if (inlineViews.length === 0) {
      // 没有预设候选时，常量项就是「当前内联值」（参数位靠内联编辑器改值，不在这里选）。
      const current = input.current;
      const value = current !== null && current.kind === 'inline' ? current.value : null;
      options.push({
        id: 'inline:current',
        kind: 'inline',
        label: previewInline(value),
        badge: text.tab.inline,
        value: { kind: 'inline', value },
      });
    }
    for (const view of inlineViews) {
      options.push({
        id: `inline:${view.id}`,
        kind: 'inline',
        label: view.label,
        badge: text.tab.inline,
        value: { kind: 'inline', value: view.value },
      });
    }
  }
  if (input.allowedKinds.includes('variable')) {
    for (const variable of input.variables) {
      options.push({
        id: `variable:${variable.id}`,
        kind: 'variable',
        label: variable.name,
        badge: text.tab.variable,
        value: { kind: 'variable', variableId: variable.id },
      });
    }
  }
  if (input.allowedKinds.includes('data-source-field')) {
    const excluded = new Set(input.excludedDataSourceIds ?? []);
    for (const field of input.fields ?? []) {
      if (excluded.has(field.dataSourceId)) continue;
      options.push({
        id: `field:${field.dataSourceId}:${field.path.join('.')}`,
        kind: 'data-source-field',
        label: field.label,
        badge: text.tab.field,
        value: {
          kind: 'data-source-field',
          dataSourceId: field.dataSourceId,
          path: [...field.path],
        },
      });
    }
  }
  return options;
}

/** 搜索过滤：大小写无关的子串匹配（不排序，保持分段顺序）。 */
export function filterValueRefOptions(
  options: readonly DesignerValueRefOption[],
  query: string,
): readonly DesignerValueRefOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return options;
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) || option.badge.toLowerCase().includes(needle),
  );
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

/** 内联值的短标签：只用于列表与触发器，不做格式化承诺。 */
function previewInline(value: ScreenJsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value.length > 32 ? `${value.slice(0, 32)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? `[${value.length}]` : '{…}';
}

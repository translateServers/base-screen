/**
 * 意图层 IR（ADR-0113 §2.2）：模型产出的「这屏讲什么、怎么分区、每块用什么」。
 *
 * 宿主侧格式，不进 `contracts`，也没有版本字段：演进靠加可选键。IR 不含像素——几何由布局求解器
 * 按区域与顺序算出；数值只能是模型给的示例数据、或对宿主数据集的引用，不是画面上的真实数值。
 *
 * 每个解析出的指标与块带 `origin`：它在**模型原文**里的路径（如 `blocks[2]`、`regions[1].main[0]`）。
 * 丢弃坏项之后下标会前移，只有 `origin` 能让修复提示和来源表指回模型自己写的那一处。
 */

/** 指标的增减量：`direction` 决定涨跌的好坏，颜色由编译器按它取状态色位。 */
export interface IntentKpiDelta {
  readonly value: number;
  /** `percent` 百分比变化；`point` 百分点；`absolute` 与指标同单位的绝对变化。 */
  readonly unit: 'percent' | 'point' | 'absolute';
  readonly direction: 'up-good' | 'down-good' | 'neutral';
}

export interface IntentKpi {
  readonly label: string;
  /** `null` 表示没有数据（确定性兜底的占位），编译器画「—」而不是 0。 */
  readonly value: number | null;
  /** 「%」「万元」「人次」；不含数量级，万 / 亿由编译器折算。 */
  readonly unit?: string;
  /** 小数位 0–3；缺省时由编译器按数量级决定。 */
  readonly precision?: number;
  readonly delta?: IntentKpiDelta;
  readonly origin: string;
  /**
   * 稳定标识（会话里用）：编译出的组件 id 与层级按它分段，而不是按当前位置。
   * 删掉一块之后，后面的块位置前移、几何要变，但组件 id 不能跟着漂——未变的组件才能原样保留，
   * 用户改过的内容才能对得上。缺省时用位置路径。
   */
  readonly ident?: string;
}

export interface IntentTableColumn {
  readonly id: string;
  readonly label: string;
  readonly type: 'string' | 'number' | 'boolean';
}

export interface IntentTable {
  readonly columns: readonly IntentTableColumn[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean>>[];
}

/**
 * 块的取值。模型面向的写法仍是平铺字段（`table` / `datasetId` / `text` / `assetId`），
 * 解析时归一成这里的判别联合：下游不再逐个字段猜。
 */
export type IntentBind =
  | { readonly kind: 'table'; readonly table: IntentTable }
  | { readonly kind: 'dataset'; readonly datasetId: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'asset'; readonly assetId: string }
  | { readonly kind: 'none' };

export interface IntentBlock {
  /** 目录里真实存在的物料 type。 */
  readonly type: string;
  readonly title: string;
  readonly note?: string;
  /** 四列栅格里占几列，1–4；只在 `grid` 区域里有意义，其他区域固定为 1。 */
  readonly span: number;
  readonly bind: IntentBind;
  readonly props?: Readonly<Record<string, string | number | boolean>>;
  /** 目录里没有用户要的物料、用了替代品时，模型写明「本来要的是什么」，编译器据此说明缺口。 */
  readonly substituteFor?: string;
  readonly origin: string;
  /** 稳定标识，见 `IntentKpi.ident`。 */
  readonly ident?: string;
}

/** 一排等宽的小卡（指标条）。 */
export interface IntentBand {
  readonly kind: 'band';
  readonly items: readonly IntentKpi[];
  /** 区域在模型原文里的路径：`regions[1]`；平铺写法的指标带为 `kpis`。容量冲突的诊断靠它指回模型写的那一处。 */
  readonly origin: string;
}

/** 四列栅格：块按顺序排，同一行 span 之和不超过 4。 */
export interface IntentGrid {
  readonly kind: 'grid';
  readonly blocks: readonly IntentBlock[];
  /** `regions[2]`；平铺写法的栅格为 `blocks`。 */
  readonly origin: string;
}

/** 主区 + 侧栏：侧栏里的块纵向堆叠。 */
export interface IntentSplit {
  readonly kind: 'split';
  /** `wide-narrow` 主区宽、侧栏窄；`even` 两栏等宽。缺省 `wide-narrow`。 */
  readonly ratio: 'wide-narrow' | 'even';
  /** 侧栏在哪一侧，缺省 `right`。 */
  readonly railSide: 'left' | 'right';
  readonly main: readonly IntentBlock[];
  readonly rail: readonly IntentBlock[];
  readonly origin: string;
}

export type IntentRegion = IntentBand | IntentGrid | IntentSplit;

export interface ScreenIntent {
  readonly title: string;
  readonly subtitle: string;
  /** 风格预设 id；是否认得由编译器判断，不认得回退默认预设。 */
  readonly style?: string;
  /** 区域按从上到下的顺序。 */
  readonly regions: readonly IntentRegion[];
}

/**
 * 解析诊断。
 *
 * - `error`：这一项被丢弃或降级，值得请模型修一次（进修复回环）；
 * - `warning`：这一项被收敛后保留（截断、裁行、丢未声明的参数），如实告诉用户即可。
 *
 * `path` 是模型原文里的路径，空串表示整份输出。诊断码沿用阶段 1 已面向用户的 `AGENT_*`，
 * 区域层新增的用 `INTENT_*`；`message` 是给开发者的英文，面向用户的文案由宿主按码映射。
 */
export interface IntentDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: string;
  readonly message: string;
  /**
   * 给宿主拼用户可读文案用的结构化细节（英文 `message` 不面向用户）。
   * `INTENT_BLOCK_SUBSTITUTED`：`wanted`（模型写明本来要的）与 `used`（实际用的物料名）。
   */
  readonly detail?: Readonly<Record<string, string | number>>;
}

export interface IntentParseResult {
  /** `undefined` 表示整份不可用（诊断里有整份级的 error），调用方走失败路径。 */
  readonly intent: ScreenIntent | undefined;
  readonly diagnostics: readonly IntentDiagnostic[];
}

/** 单项解析（流式逐项出帧时用）。 */
export interface IntentItemResult<T> {
  readonly value: T | undefined;
  readonly diagnostics: readonly IntentDiagnostic[];
}

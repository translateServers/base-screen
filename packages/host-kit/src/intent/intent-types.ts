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

/**
 * 指标卡读数据集的一个字段（ADR-0114 D4）。结果只能有一行：文本物料只读第一行。
 * 有 `bind` 时模型不得写 `value` / `delta`——真实数值配示例增减量比整张示例卡更误导。
 */
export interface IntentKpiBind {
  readonly datasetId: string;
  readonly field: string;
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * 一条阈值状态（ADR-0115 D2 状态来源 threshold）：数值满足 `op value` 时切到 `tone` 的外观。
 * 规则按顺序判定、第一条命中即停，所以严重的写在前面。
 */
export interface IntentStateRule {
  readonly op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  readonly value: number | string;
  readonly tone: 'success' | 'warning' | 'danger' | 'info';
  /** 状态名（「过载」「偏低」）；缺省按 tone 取默认名。 */
  readonly label?: string;
}

/**
 * 指标卡的状态（ADR-0115 D1 / D2）：只对绑定了数据集字段的指标卡编译——示例数值不是真实数据，
 * 按它判定阈值没有意义（`AGENT_STATE_NEEDS_DATA`）。
 */
export interface IntentKpiStates {
  readonly rules: readonly IntentStateRule[];
  /** 阈值是模型补的（用户没说具体数）：提案理由里提示用户核对（`INTENT_STATE_SUGGESTED`）。 */
  readonly suggested?: boolean;
  /**
   * 状态来源（ADR-0115 D2）：缺省为 `threshold`（按 `rules` 判定）；`level-scale` 表示按宿主为该字段
   * 声明的分级表生成（ADR-0110 §2.6.3 的同一套规则），此时 `rules` 为空。宿主没给分级表时不编译、
   * 写进理由（`AGENT_STATE_LEVEL_SCALE_UNAVAILABLE`）。
   */
  readonly source?: 'threshold' | 'level-scale';
}

/**
 * 句柄（ADR-0115 D1）：模型给块 / 指标卡起的短名，联动按它（或按标题）指向组件。
 * 小写字母开头，字母、数字、连字符，至多 32 字符。
 */
export type IntentKey = string;

export interface IntentKpi {
  readonly label: string;
  /** `null` 表示没有数据（确定性兜底的占位），编译器画「—」而不是 0。 */
  readonly value: number | null;
  /** 「%」「万元」「人次」；不含数量级，万 / 亿由编译器折算。 */
  readonly unit?: string;
  /** 小数位 0–3；缺省时由编译器按数量级决定。 */
  readonly precision?: number;
  readonly delta?: IntentKpiDelta;
  /** 读数据集字段；有它时 `value` 为 `null`、没有 `delta` / `precision`。 */
  readonly bind?: IntentKpiBind;
  /** 联动引用用的句柄。 */
  readonly key?: IntentKey;
  /** 阈值状态；只在 `bind` 存在时编译。 */
  readonly states?: IntentKpiStates;
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
  | {
      readonly kind: 'dataset';
      readonly datasetId: string;
      /** 角色 id → 字段 id（ADR-0114 D4）；缺省时编译器按列类型分配（阶段 2 的行为）。 */
      readonly fields?: Readonly<Record<string, readonly string[]>>;
      /** 查询参数；与数据集声明的默认值合并，取值须合法。 */
      readonly params?: Readonly<Record<string, string | number | boolean>>;
    }
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
  /** 由本轮候选表展开而来时的候选编号（`c3`）：提案理由与评测据此统计。 */
  readonly candidate?: string;
  /** 联动引用用的句柄。 */
  readonly key?: IntentKey;
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

/**
 * 联动（ADR-0115 D2）：一个块的事件驱动另一些块。`from` / `to` 写块或指标卡的 `key`，或它的标题。
 *
 * - `filter`：点了来源块，把事件里的一个值写进目标块数据集的查询参数（只经数据集参数，不做前端过滤）。
 *   编译器推出一个变量承接这个值，目标实例的参数改为引用该变量；`field` 是来源行里的字段
 *   （表格 / 滚动表的 `rowClick`），图表点击取横轴值、页签取选中值、数字类取数值时可省略。
 * - `show`：点了来源块，显示 / 隐藏 / 切换目标块；`show` 模式的目标初始隐藏。
 */
export type IntentInteraction =
  | {
      readonly kind: 'filter';
      readonly from: string;
      readonly event: string;
      readonly field?: string;
      readonly to: readonly string[];
      readonly param: string;
      /** 再点同一项恢复原来的取值（ADR-0115 D2）：编译成蓝图条件分支。 */
      readonly reset?: true;
      readonly origin: string;
    }
  | {
      readonly kind: 'show';
      readonly from: string;
      readonly event: string;
      readonly to: readonly string[];
      readonly mode: 'show' | 'hide' | 'toggle';
      readonly origin: string;
    }
  | {
      /**
       * 设状态（ADR-0115 D2）：点来源 → 把目标指标切到它某个已声明的状态（按状态名或色调找），
       * `reset` 表示恢复按判定显示。目标必须是本屏声明了 `states` 的指标。
       */
      readonly kind: 'state';
      readonly from: string;
      readonly event: string;
      readonly to: readonly string[];
      readonly state: string;
      readonly origin: string;
    };

export interface ScreenIntent {
  readonly title: string;
  readonly subtitle: string;
  /** 风格预设 id；是否认得由编译器判断，不认得回退默认预设。 */
  readonly style?: string;
  /** 区域按从上到下的顺序。 */
  readonly regions: readonly IntentRegion[];
  /** 联动（ADR-0115）；变量由编译器推出，模型不写。 */
  readonly interactions?: readonly IntentInteraction[];
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

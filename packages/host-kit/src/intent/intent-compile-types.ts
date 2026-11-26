import type { ScreenJsonValue } from '@base-screen/contracts';
import type { IntentBlock, IntentDiagnostic, IntentKpi } from './intent-types.js';

/**
 * 编译器的共享类型（ADR-0113 §2.1）。
 *
 * 编译产物是一份「文档草稿」：形状与契约的 `ScreenDocument` 对齐，但不在这里声明为契约类型——
 * 契约解析（`parseScreenDocument`）才是唯一裁判，产物交给引擎提交时由它失败关闭地校验。
 */

export interface CompiledComponent {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  zIndex: number;
  status: { locked: boolean; hidden: boolean };
  props: Record<string, ScreenJsonValue>;
  style: Record<string, ScreenJsonValue>;
  dataSource: null;
  dataValue: Record<string, unknown> | null;
  dataBinding?: Record<string, unknown>;
}

export interface CompiledScreenDocument {
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly backgroundColor: string;
  };
  readonly components: readonly CompiledComponent[];
  readonly variables: readonly never[];
  readonly dataSources?: readonly Record<string, unknown>[];
  readonly blueprint: { readonly nodes: readonly never[]; readonly edges: readonly never[] };
}

/** 引用数据集的一个查询参数（来自数据集 describe 的 `parameters`）。 */
export interface IntentReferenceParameter {
  readonly name: string;
  readonly required: boolean;
  /** 数据集声明的参数类型；有它时模型给的取值按它校验。 */
  readonly valueType?: 'string' | 'number' | 'boolean' | 'date';
  readonly defaultValue?: string | number | boolean;
  readonly allowedValues?: readonly (string | number | boolean)[];
}

/** 本轮引用的一个数据集。 */
export interface IntentReferenceDataset {
  readonly datasetId: string;
  readonly name: string;
  readonly columns: readonly {
    readonly id: string;
    /** 字段 `valueType`（`string` / `number` / `boolean` / `date`）。 */
    readonly type: string;
    readonly label?: string;
    readonly unit?: string;
  }[];
  /**
   * 画像时样本的行数（`sampled`）与宿主声明的总行数（`total`）。指标卡只能绑单行结果：
   * 知道多于一行时编译器拒绝把它绑上指标卡（`AGENT_KPI_MULTI_ROW`）。缺省表示不知道。
   */
  readonly rows?: { readonly sampled: number; readonly total?: number };
  /**
   * 查询参数定义。编译时把默认值显式写进数据源实例；必填却没有默认值的参数，本轮无从取值，
   * 引用它的块会被跳过（`AGENT_DATASET_PARAM_REQUIRED`），不编出运行时必然失败的实例。
   * 缺省等同于没有参数（旧宿主不上送这一项）。
   */
  readonly parameters?: readonly IntentReferenceParameter[];
}

/** 本轮引用：用户指定的素材与数据集（列类型来自数据集 describe，供角色分配）。 */
export interface IntentReferences {
  readonly assets: readonly { readonly id: string; readonly name: string }[];
  readonly datasets: readonly IntentReferenceDataset[];
}

/**
 * 版面骨架（ADR-0112 §2.5 / ADR-0113 §2.3）：整屏几何只由它决定——区域序列，以及每个区域里
 * 有几格、每块占几列、是不是数据型。流式落稿时模型先给骨架，编译器据此一次算定全部位置；
 * 之后到达的内容只往格子里填。
 */
export interface IntentSkeleton {
  readonly regions: readonly IntentSkeletonRegion[];
  /**
   * 平铺写法（`kpis` + `blocks`）：区域路径记为 `kpis` / `blocks`，格子路径为 `kpis[i]` / `blocks[i]`，
   * 组件 id 沿用 `agent-kpi-i-*` / `agent-block-i-*`。
   */
  readonly flat?: true;
}

export interface IntentSkeletonSlot {
  readonly span: number;
  /** 数据型块（表格 / 数据集）行高权重更大。 */
  readonly data: boolean;
}

export type IntentSkeletonRegion =
  | { readonly kind: 'band'; readonly count: number }
  | { readonly kind: 'grid'; readonly slots: readonly IntentSkeletonSlot[] }
  | {
      readonly kind: 'split';
      readonly ratio: 'wide-narrow' | 'even';
      readonly railSide: 'left' | 'right';
      readonly main: readonly { readonly data: boolean }[];
      readonly rail: readonly { readonly data: boolean }[];
    };

/** 平铺写法的骨架：一条指标带（`kpis` > 0 时）+ 一条栅格（有块时）。 */
export function flatSkeleton(kpis: number, blocks: readonly IntentSkeletonSlot[]): IntentSkeleton {
  const regions: IntentSkeletonRegion[] = [];
  if (kpis > 0) regions.push({ kind: 'band', count: kpis });
  if (blocks.length > 0) regions.push({ kind: 'grid', slots: blocks });
  return { regions, flat: true };
}

/**
 * 流式落稿的一帧：按骨架排版，格子路径 → 已到达的内容；没到的格子画占位。
 * 格子路径是位置路径：平铺写法 `kpis[1]` / `blocks[0]`，区域写法 `regions[1].items[0]` /
 * `regions[2].blocks[1]` / `regions[3].main[0]` / `regions[3].rail[2]`。
 */
export interface IntentStreamFrame {
  readonly skeleton: IntentSkeleton;
  readonly kpis: Readonly<Record<string, IntentKpi>>;
  readonly blocks: Readonly<Record<string, IntentBlock>>;
}

export interface IntentCompileResult {
  readonly document: CompiledScreenDocument;
  /** 用素材身份赋值的组件数。 */
  readonly imageCount: number;
  /** 实际落进文档的物料 type，按首次出现排序去重。 */
  readonly materials: readonly string[];
  /** 降级发生的块（例如列满足不了物料的绑定角色），屏仍然产出，但要如实说明。 */
  readonly warnings: readonly IntentDiagnostic[];
  /**
   * 组件 id → IR 路径（模型原文里的位置：`title` / `kpis[1]` / `blocks[2]`；编译器自有内容为空串）。
   * 修复回环靠它把文档诊断翻译回模型能看懂的位置（ADR-0112 §2.1）。
   */
  readonly sources: Readonly<Record<string, string>>;
}

export type IntentCompileOutcome =
  | { readonly ok: true; readonly value: IntentCompileResult }
  | { readonly ok: false; readonly diagnostics: readonly IntentDiagnostic[] };

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextToken {
  readonly fontSize?: number;
  readonly fontWeight?: string;
  readonly color?: string;
  readonly lineSpacing?: number;
}

export interface PushExtra {
  props?: Record<string, ScreenJsonValue>;
  style?: Record<string, ScreenJsonValue>;
  dataValue?: Record<string, unknown> | null;
  dataBinding?: Record<string, unknown>;
  /** 显式给出父级；缺省沿用编译器当前打开的外壳（没有就是顶层）。 */
  parentId?: string | null;
  /** 流式落稿的占位框：内容到了就被移除，不占该来源的计数。 */
  pending?: boolean;
}

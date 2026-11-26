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
  parentId: null;
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

/** 本轮引用：用户指定的素材与数据集（列类型来自数据集 describe，供角色分配）。 */
export interface IntentReferences {
  readonly assets: readonly { readonly id: string; readonly name: string }[];
  readonly datasets: readonly {
    readonly datasetId: string;
    readonly name: string;
    readonly columns: readonly { readonly id: string; readonly type: string }[];
  }[];
}

/**
 * 版面骨架（ADR-0112 §2.5）：整屏几何只由它决定——指标个数，以及每块占几列、是不是数据型。
 * 流式落稿时模型先给骨架，编译器据此一次算定全部位置；之后到达的内容只往格子里填。
 */
export interface IntentSkeleton {
  readonly kpis: number;
  readonly blocks: readonly IntentSkeletonSlot[];
}

export interface IntentSkeletonSlot {
  readonly span: number;
  /** 数据型块（表格 / 数据集）行高权重更大。 */
  readonly data: boolean;
}

/** 流式落稿的一帧：按骨架排版，`kpis[i]` / `blocks[i]` 落进骨架第 i 格，缺的格子画占位。 */
export interface IntentStreamFrame {
  readonly skeleton: IntentSkeleton;
  readonly kpis: readonly (IntentKpi | undefined)[];
  readonly blocks: readonly (IntentBlock | undefined)[];
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
  /** 流式落稿的占位框：内容到了就被移除，不占该来源的计数。 */
  pending?: boolean;
}

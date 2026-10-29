import type { ScreenDocument } from '@base-screen/contracts';

/** 与 shared-backend REST 契约逐字节对齐的投影类型（document 以 canonical 文档视之）。 */
export interface ScreenShape {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly document: ScreenDocument;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScreenSummaryShape {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly updatedAt: string;
}

/** `POST /agent/generate` 的响应：与后端 `AgentGenerateResult` 逐字段对齐。 */
export interface AgentGenerateShape {
  /** 后端已经落库的那张新屏；示例宿主只取它的 document 当候选内容。 */
  readonly screen: ScreenShape;
  /** 这一轮实际走的通道：`deterministic` 表示没调模型、由确定性兜底产出。 */
  readonly mode: 'llm' | 'deterministic';
  readonly imageCount: number;
  readonly failure?: string;
}

export interface MetricPoint {
  readonly t: string;
  readonly value: number;
}

export interface MetricSeries {
  readonly metric: string;
  readonly unit: string;
  readonly points: readonly MetricPoint[];
}

export interface RankingItem {
  readonly name: string;
  readonly value: number;
}

export interface MetricRanking {
  readonly dimension: string;
  readonly unit: string;
  readonly items: readonly RankingItem[];
}

/** 数据集字段（与后端 `dataset-definitions.ts` 的定义逐字段对齐）。 */
export interface DatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'date';
  readonly nullable?: boolean;
  readonly unit?: string;
  readonly format?: string;
}

/** 数据集参数：`allowedValues` 是设计器下拉的取值域，`minimum/maximum` 是数值区间。 */
export interface DatasetParameter {
  readonly name: string;
  readonly label: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'date';
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly allowedValues?: readonly (string | number | boolean)[];
}

export interface DatasetGroup {
  readonly id: string;
  readonly name: string;
}

export interface DatasetEntry {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId?: string;
}

/** `GET /api/datasets`：分组与条目一次返回（渲染器只要 `items`，`groups` 由宿主自己消费）。 */
export interface DatasetCatalog {
  readonly groups: readonly DatasetGroup[];
  readonly items: readonly DatasetEntry[];
}

/** `GET /api/datasets/:id`：字段顺序即绑定默认顺序。 */
export interface DatasetDefinition extends DatasetEntry {
  readonly fields: readonly DatasetField[];
  readonly parameters: readonly DatasetParameter[];
}

/** `GET /api/datasets/:id/query`：`totalRowCount` 是过滤后的总数，`rows` 已被 limit 截断。 */
export interface TabularDataset {
  readonly fields: readonly DatasetField[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly totalRowCount?: number;
}

/** 宿主素材库元数据（ADR-0089）：文档只存 `host_image` 身份，不存 contentPath。 */
export interface HostAssetShape {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly contentPath: string;
  readonly referenceCount: number;
  /** 设计器临时上传；公共素材为 false。 */
  readonly temporary: boolean;
  /** 临时素材绑定的大屏；公共素材为 null。 */
  readonly screenId: string | null;
  /** 后台展示用的绑定大屏名；仅临时素材有值。 */
  readonly screenName: string | null;
  /** 临时素材的回收资格；公共素材为 null。 */
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

/** 在线物料包（ADR-0090）：宿主审核并导入的 ESM 代码 + Manifest。 */
export interface OnlineMaterialPackageShape {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly code: string;
  readonly manifest: Record<string, unknown>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** `?smoke=1` 的调试面：只暴露状态与手动刷新入口，不含端口/文档/URL。 */
declare global {
  interface Window {
    __baseScreenHost?:
      | {
          tickNow(): void;
          refreshNow(): void;
          status(): {
            readonly requests: number;
            readonly failures: number;
            readonly lastCode: string | undefined;
            readonly pending: readonly string[];
            readonly failedComponents: readonly string[];
          };
          alarmStatus():
            | import('./screen/host-alarm-controller').HostAlarmStatusSnapshot
            | undefined;
        }
      | undefined;
  }
}

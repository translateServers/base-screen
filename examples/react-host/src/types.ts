import type { ScreenDocument } from '@base-screen/contracts';

/** 与 host-api REST 契约逐字节对齐的投影类型（document 以 canonical 文档视之）。 */
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

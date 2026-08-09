import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

export type ScreenDatasetValueType = 'string' | 'number' | 'boolean' | 'date';

export interface ScreenDatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: ScreenDatasetValueType;
  readonly nullable?: boolean;
  readonly unit?: string;
  readonly format?: string;
}

export interface ScreenTabularDataset {
  readonly fields: readonly ScreenDatasetField[];
  readonly rows: readonly ScreenJsonObject[];
  readonly totalRowCount?: number;
}

export interface ScreenDatasetSummary {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly name: string;
  readonly description: string | null;
}

export interface ScreenDatasetPage {
  readonly items: readonly ScreenDatasetSummary[];
  readonly nextCursor?: string;
}

export type ScreenDatasetParameterEditor = 'text' | 'number' | 'boolean' | 'date' | 'json';

/**
 * 参数描述元数据（DRH-R8）：只保留 name/label 与可选 editor/defaultValue；
 * 无 valueType/required。参数结构与约束的权威是资源类型的 configSchema；
 * editor/defaultValue 由消费方按 configSchema 校验。
 */
export interface ScreenDatasetParameter {
  readonly name: string;
  readonly label: string;
  readonly editor?: ScreenDatasetParameterEditor;
  readonly defaultValue?: ScreenJsonValue;
}

export interface ScreenDatasetDescriptor {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly fields: readonly ScreenDatasetField[];
  readonly parameters: readonly ScreenDatasetParameter[];
}

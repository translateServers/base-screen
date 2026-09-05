import type { ScreenJsonObject } from './json.js';

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

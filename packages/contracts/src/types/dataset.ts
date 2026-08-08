import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

export type ScreenDatasetValueType = 'string' | 'number' | 'boolean' | 'date';

export interface ScreenDatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: ScreenDatasetValueType;
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

export interface ScreenDatasetParameter {
  readonly name: string;
  readonly label: string;
  readonly valueType: ScreenDatasetValueType;
  readonly editor: ScreenDatasetParameterEditor;
  readonly required: boolean;
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

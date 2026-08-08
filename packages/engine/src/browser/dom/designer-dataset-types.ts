import type {
  ScreenDatasetDescriptor,
  ScreenDatasetSummary,
  ScreenHostResourceParameter,
} from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';

export type DesignerDataSourceMode = 'none' | 'static' | 'dataset';

export interface DesignerDatasetDraftView {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export interface DesignerDataSourcePanelOptions {
  readonly panel: HTMLElement;
  readonly mode: DesignerDataSourceMode;
  readonly availableModes: readonly DesignerDataSourceMode[];
  readonly staticDraft: string;
  readonly query: string;
  readonly catalogOpen: boolean;
  readonly items: readonly ScreenDatasetSummary[];
  readonly cursor: string | undefined;
  readonly descriptor: ScreenDatasetDescriptor | undefined;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variableNames: readonly string[];
  readonly catalogAvailable: boolean;
  readonly resourceAvailable: boolean;
  readonly feedback: string;
}

export interface DesignerDatasetConfigurationOptions {
  readonly panel: HTMLElement;
  readonly descriptor: ScreenDatasetDescriptor;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variableNames: readonly string[];
  readonly resourceAvailable: boolean;
}

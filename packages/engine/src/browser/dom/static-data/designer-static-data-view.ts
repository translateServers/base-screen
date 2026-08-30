import type { ScreenDataBinding, ScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialStaticDataDescriptor,
} from '@base-screen/plugin-core';

export interface DesignerStaticDataView {
  readonly ownerDocument: Document;
  readonly descriptor: BaseScreenMaterialStaticDataDescriptor | undefined;
  readonly value: ScreenJsonValue;
  readonly binding: ScreenDataBinding | undefined;
  readonly jsonDraft: string;
  readonly tab: 'table' | 'advanced';
  readonly page: number;
  readonly pageSize: number;
  readonly roles: readonly BaseScreenMaterialDataBindingRole[];
  readonly scrollScope?: string;
}

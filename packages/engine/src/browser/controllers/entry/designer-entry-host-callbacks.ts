import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

// 三个直接编辑入口（坐标 / 尺寸 / 成对）共用的宿主契约。
//
// 这段声明原本在三个 controller 里各写一份、字段逐字相同：两者一旦漂移，同一份宿主实现
// 就会出现「坐标输入能提交、尺寸输入被拒」这类只在一个入口复现的缺陷。
export interface DesignerEntryHostCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly focusViewport: () => void;
}

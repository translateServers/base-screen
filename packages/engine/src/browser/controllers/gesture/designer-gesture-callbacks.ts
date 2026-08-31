import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenPosition,
} from '@base-screen/contracts';
import type {
  ScreenDocumentTransaction,
  ScreenInteractionAction,
  ScreenViewportState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenHostResourceAuthoringIntent } from '../../../common/operations/host-resource/host-resource-authoring.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import type {
  DesignerToolId,
  DesignerToolMaterialTypes,
} from '../../../common/tools/designer-tools.js';
import type {
  DesignerSnapPoint,
  DesignerSnapPreview,
  DesignerSnapTranslation,
} from '../../viewport/designer-canvas-aids.js';

export interface DesignerGestureCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getMaterialLibraryItem?: (
    id: string,
  ) => BaseScreenResolvedMaterialLibraryItem | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => {
    readonly selectedComponentIds: readonly string[];
    readonly focusedComponentId: string | null;
  };
  readonly getViewport: () => ScreenViewportState;
  readonly panBy: (delta: { readonly x: number; readonly y: number }) => void;
  readonly zoomBy: (factor: number) => void;
  readonly isHandActive: () => boolean;
  readonly getActiveTool: () => DesignerToolId;
  readonly getToolMaterialTypes: () => DesignerToolMaterialTypes | undefined;
  readonly snapCanvasPoint: (
    point: { readonly x: number; readonly y: number },
    excludedComponentIds?: readonly string[],
  ) => DesignerSnapPoint;
  readonly snapCanvasSelection: (
    bounds: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    },
    offset: { readonly x: number; readonly y: number },
    excludedComponentIds?: readonly string[],
  ) => DesignerSnapTranslation;
  readonly renderSnapPreview?: (point: DesignerSnapPreview | undefined) => void;
  readonly setSnapSessionActive?: (active: boolean) => void;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly reportTransaction: (transaction: ScreenDocumentTransaction) => void;
  readonly validateHostResourceIntent?: (
    intent: BaseScreenHostResourceAuthoringIntent,
  ) => ScreenParseResult<BaseScreenHostResourceAuthoringIntent>;
  readonly insertHostResourceAt?: (
    intent: BaseScreenHostResourceAuthoringIntent,
    position: ScreenPosition,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reportDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly renderSelection: () => void;
  readonly focusViewport?: () => void;
  readonly setPanning?: (panning: boolean) => void;
  readonly enterTextEdit?: (componentId: string) => boolean;
}

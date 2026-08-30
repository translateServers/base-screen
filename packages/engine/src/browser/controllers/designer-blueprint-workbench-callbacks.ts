import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type { BaseScreenDesignerWorkbenchMode } from '../../common/operations/designer-blueprint-protocol.js';
import type { BaseScreenDesignerLeftPanelGroup } from '../../designer-left-panel-groups.js';

export interface DesignerBlueprintWorkbenchCallbacks {
  readonly getHost: () => HTMLElement;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly getDocumentRevision: () => number;
  readonly getProjectRevision: () => string | null;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly getLeftPanelGroups: () => readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  readonly setWorkbenchAuthoringMode: (mode: BaseScreenDesignerWorkbenchMode) => void;
  readonly expandLeftPanel: () => void;
  readonly onActiveLeftPanelGroupChange: () => void;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly undo: () => ScreenParseResult<ScreenDocument>;
  readonly redo: () => ScreenParseResult<ScreenDocument>;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

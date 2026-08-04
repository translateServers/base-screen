export type {
  ScreenCanvas,
  ScreenComponentNode,
  ScreenComponentStatus,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenPosition,
  ScreenSize,
  ScreenStaticDataSource,
  ScreenStaticVariable,
} from '@base-screen/contracts';
export {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintDispatchResult,
  type ScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from './blueprint/runtime.js';
export { applyScreenDocumentCommand, applyScreenDocumentTransaction } from './commands/apply.js';
export type {
  ScreenCommandResult,
  ScreenComponentPatch,
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenTransactionFailure,
  ScreenTransactionResult,
  ScreenTransactionSuccess,
} from './commands/types.js';
export type { ScreenAlignmentDelta, ScreenSnapCandidate } from './geometry/geometry.js';
export {
  calculateScreenAlignment,
  calculateScreenDistribution,
  canvasPointToViewport,
  chooseScreenSnapCandidate,
  getScreenComponentBounds,
  getScreenSelectionBounds,
  hitTestScreenComponents,
  queryScreenComponentsInRect,
  viewportPointToCanvas,
} from './geometry/geometry.js';
export type {
  ScreenAxis,
  ScreenBounds,
  ScreenPoint,
  ScreenRect,
  ScreenVector,
} from './geometry/types.js';
export {
  buildComponentIndex,
  getPainterOrder,
} from './hierarchy/hierarchy.js';
export {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from './hierarchy/query.js';
export type { ScreenHistoryEntry, ScreenHistoryState } from './history/history.js';
export {
  commitScreenHistory,
  createScreenHistory,
  redoScreenHistory,
  undoScreenHistory,
} from './history/history.js';
export type { ScreenInteractionAction, ScreenInteractionState } from './state/interaction.js';
export { reduceScreenInteraction } from './state/interaction.js';
export type { ScreenViewportAction, ScreenViewportState } from './state/viewport.js';
export { reduceScreenViewport } from './state/viewport.js';

export { ScreenCoreInvariantError } from './validation/invariant-error.js';
export { validateScreenDocumentSemantics } from './validation/validate-semantics.js';

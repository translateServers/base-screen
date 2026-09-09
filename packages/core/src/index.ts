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
  ScreenVariable,
} from '@base-screen/contracts';
export {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY,
  type ScreenBlueprintActionTrace,
  type ScreenBlueprintComponentVisibilityActionTrace,
  type ScreenBlueprintConditionTraceState,
  type ScreenBlueprintDispatchResult,
  type ScreenBlueprintEmitHostEventActionTrace,
  type ScreenBlueprintEvent,
  type ScreenBlueprintHostActionTrace,
  type ScreenBlueprintPlan,
  type ScreenBlueprintRuleTrace,
  type ScreenBlueprintSetVariableActionTrace,
  type ScreenBlueprintTraceResult,
  type ScreenBlueprintVisibilityEffect,
  traceScreenBlueprintEvent,
} from './blueprint/runtime.js';
export { applyScreenDocumentCommand, applyScreenDocumentTransaction } from './commands/apply.js';
export { parseScreenDocumentCommand } from './commands/parse-command.js';
export type {
  ScreenCanvasPatch,
  ScreenCommandResult,
  ScreenComponentPatch,
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenTransactionFailure,
  ScreenTransactionResult,
  ScreenTransactionSuccess,
} from './commands/types.js';
export type {
  ScreenDataBindingRole,
  ScreenHostResourceBindingValidation,
  ScreenHostResourceParameterEvaluation,
} from './data/host-dataset.js';
export {
  evaluateScreenHostResourceParameters,
  extractScreenHostResourceVariableDependencies,
  validateScreenHostResourceBinding,
} from './data/host-dataset.js';
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
export {
  deleteScreenJsonPath,
  getScreenJsonPath,
  insertScreenJsonArrayItem,
  moveScreenJsonArrayItem,
  removeScreenJsonArrayItem,
  setScreenJsonArrayItem,
  setScreenJsonPath,
} from './json/path-update.js';
export type { ScreenInteractionAction, ScreenInteractionState } from './state/interaction.js';
export { reduceScreenInteraction } from './state/interaction.js';
export type { ScreenViewportAction, ScreenViewportState } from './state/viewport.js';
export { reduceScreenViewport } from './state/viewport.js';

export { ScreenCoreInvariantError } from './validation/invariant-error.js';
export { validateScreenDocumentSemantics } from './validation/validate-semantics.js';

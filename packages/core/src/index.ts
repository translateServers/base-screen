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
  ScreenTransactionProvenance,
  ScreenTransactionResult,
  ScreenTransactionSource,
  ScreenTransactionSuccess,
} from './commands/types.js';
export { componentsReferencingDataSources } from './data/data-source-dependents.js';
export type {
  ScreenDataBindingRole,
  ScreenDataBindingValidation,
  ScreenHostResourceBindingValidation,
  ScreenHostResourceParameterEvaluation,
} from './data/host-dataset.js';
export {
  evaluateScreenHostResourceParameters,
  extractScreenHostResourceVariableDependencies,
  validateScreenDataBinding,
  validateScreenHostResourceBinding,
} from './data/host-dataset.js';
export type {
  ScreenValueRefDependencies,
  ScreenValueRefEnvironment,
  ScreenValueRefEvaluation,
  ScreenValueRefFailureReason,
} from './data/value-ref.js';
export {
  collectScreenValueRefDependencies,
  evaluateScreenValueRef,
} from './data/value-ref.js';
export * from './diff/screen-diff.js';
export type {
  ScreenAlignmentDelta,
  ScreenHitTestOptions,
  ScreenSnapCandidate,
} from './geometry/geometry.js';
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
export type { ComponentIndex } from './hierarchy/hierarchy.js';
export {
  buildComponentIndex,
  getAncestorDepth,
  getAncestorIds,
  getDescendantIds,
  getDescendantSet,
  getPainterOrder,
  getRootIds,
} from './hierarchy/hierarchy.js';
export {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from './hierarchy/query.js';
export type {
  ScreenHistoryEntry,
  ScreenHistoryNode,
  ScreenHistoryState,
} from './history/history.js';
export {
  commitScreenHistory,
  createScreenHistory,
  readScreenHistoryNodes,
  redoScreenHistory,
  revertScreenHistory,
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
export * from './validation/contrast.js';
export { ScreenCoreInvariantError } from './validation/invariant-error.js';
export { validateScreenDocumentSemantics } from './validation/validate-semantics.js';

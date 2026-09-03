import {
  parseScreenDocument,
  type ScreenBlueprint,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  type ScreenDocumentCommand,
  traceScreenBlueprintEvent,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { connectDesignerBlueprintNodes } from '../../../common/operations/blueprint/designer-blueprint-connection.js';
import {
  buildDesignerBlueprintEventOptions,
  commitDesignerBlueprintLayout,
  commitDesignerBlueprintViewport,
  componentBlueprintNodeId,
  deleteDesignerBlueprintSelection,
  insertDesignerBlueprintComponentNode,
  insertDesignerBlueprintVariableNode,
  variableBlueprintNodeId,
} from '../../../common/operations/blueprint/designer-blueprint-model.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandResult,
  type BaseScreenBlueprintCanvasGraph,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
  type BaseScreenBlueprintCanvasTrace,
  type BaseScreenDesignerWorkbenchMode,
  parseBaseScreenBlueprintCanvasCommand,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { insertDesignerBlueprintLibraryNode } from '../../../common/operations/blueprint/designer-blueprint-unconnected-nodes.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  blueprintCapabilityReader,
  cloneAndFreeze,
  designerBlueprintConnectionFailureMessage,
  diagnostic,
  failure,
  isRecord,
  rejectedBlueprintCanvasCommand,
} from './designer-blueprint-canvas-bridge-helpers.js';

const MAX_PROCESSED_COMMANDS = 256;

export interface DesignerBlueprintCanvasBridgeCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGraph: () => BaseScreenBlueprintCanvasGraph;
  readonly getMode: () => BaseScreenDesignerWorkbenchMode;
  readonly getSelection: () => BaseScreenBlueprintCanvasSelection;
  readonly getViewRequest: () => BaseScreenBlueprintCanvasState['viewRequest'];
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly getDocumentRevision: () => number;
  readonly getProjectRevision: () => string | null;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly select: (
    selection: BaseScreenBlueprintCanvasSelection,
    requestView: boolean,
  ) => ScreenParseResult<null>;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly undo: () => ScreenParseResult<ScreenDocument>;
  readonly redo: () => ScreenParseResult<ScreenDocument>;
  readonly render: () => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerBlueprintCanvasBridge {
  #host: HTMLElement | undefined;
  #canvas: Element | undefined;
  #trace: BaseScreenBlueprintCanvasTrace | null = null;
  #lastCommand: BaseScreenBlueprintCanvasCommandResult | undefined;
  #generation = 0;
  readonly #processedCommands = new Map<string, BaseScreenBlueprintCanvasCommandResult>();
  readonly #onCommand = (event: Event): void => this.receive(event);

  constructor(private readonly callbacks: DesignerBlueprintCanvasBridgeCallbacks) {}

  get canvas(): Element | undefined {
    return this.#canvas;
  }

  get trace(): BaseScreenBlueprintCanvasTrace | null {
    return this.#trace;
  }

  connect(host: HTMLElement): void {
    if (this.#host === host) return;
    this.disconnect();
    this.#host = host;
    host.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, this.#onCommand);
  }

  disconnect(): void {
    this.#host?.removeEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, this.#onCommand);
    this.#host = undefined;
  }

  setCanvas(canvas: Element | undefined): boolean {
    if (canvas === this.#canvas) return false;
    this.#canvas = canvas;
    this.#generation++;
    this.#processedCommands.clear();
    this.#lastCommand = undefined;
    return true;
  }

  reset(): void {
    this.#trace = null;
    this.#lastCommand = undefined;
    this.#processedCommands.clear();
  }

  dispatchState(graph = this.callbacks.getGraph()): void {
    const canvas = this.#canvas;
    if (canvas === undefined) return;
    const viewRequest = this.callbacks.getViewRequest();
    const state = cloneAndFreeze<BaseScreenBlueprintCanvasState>({
      generation: this.#generation,
      documentRevision: this.callbacks.getDocumentRevision(),
      projectRevision: this.callbacks.getProjectRevision(),
      active: this.callbacks.getMode() === 'blueprint',
      canUndo: this.callbacks.canUndo(),
      canRedo: this.callbacks.canRedo(),
      graph,
      selection: this.callbacks.getSelection(),
      diagnostics: this.stateDiagnostics(),
      trace: this.#trace,
      ...(viewRequest === undefined ? {} : { viewRequest }),
      ...(this.#lastCommand === undefined ? {} : { lastCommand: this.#lastCommand }),
    });
    canvas.dispatchEvent(
      new CustomEvent<BaseScreenBlueprintCanvasStateEventDetail>(
        BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
        { detail: { state } },
      ),
    );
  }

  commitBlueprint(blueprint: ScreenBlueprint | null): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined)
      return failure('AUTHORING_EXPIRED', DESIGNER_UI_TEXT.lifecycle.unloaded);
    if (blueprint === null) {
      return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidCommand);
    }
    if (JSON.stringify(blueprint) === JSON.stringify(document.blueprint)) {
      return { ok: true, value: document, diagnostics: [] };
    }
    const parsed = parseScreenDocument({ ...document, blueprint });
    if (!parsed.ok) return parsed;
    const compiled = compileScreenBlueprint(parsed.value, this.capabilities);
    if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics };
    return this.callbacks.executeCommand({
      type: 'replace-blueprint',
      blueprint: parsed.value.blueprint,
    });
  }

  stateDiagnostics(): readonly ScreenDiagnostic[] {
    const document = this.callbacks.getDocument();
    const compiled =
      document === undefined ? undefined : compileScreenBlueprint(document, this.capabilities);
    const compileDiagnostics = compiled !== undefined && !compiled.ok ? compiled.diagnostics : [];
    return [...compileDiagnostics, ...(this.#lastCommand?.diagnostics ?? [])];
  }

  private receive(event: Event): void {
    if (this.#canvas === undefined || !event.composedPath().includes(this.#canvas)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    const commandInput =
      isRecord(detail) && Object.keys(detail).length === 1 && 'command' in detail
        ? detail.command
        : undefined;
    const parsed = parseBaseScreenBlueprintCanvasCommand(commandInput);
    if (!parsed.ok) {
      this.rejectUnknown(commandInput, parsed.diagnostics);
      return;
    }
    const command = parsed.value;
    const prior = this.#processedCommands.get(command.commandId);
    if (prior !== undefined) {
      this.#lastCommand = prior;
      this.dispatchState();
      return;
    }
    if (
      command.generation !== this.#generation ||
      command.documentRevision !== this.callbacks.getDocumentRevision()
    ) {
      this.finish(command.commandId, 'rejected', [
        diagnostic('AUTHORING_EXPIRED', DESIGNER_UI_TEXT.blueprint.staleCommand),
      ]);
      return;
    }
    this.execute(command);
  }

  private execute(command: BaseScreenBlueprintCanvasCommand): void {
    if (command.type === 'ready') {
      this.finish(command.commandId, 'accepted', []);
      return;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined) {
      this.finish(command.commandId, 'rejected', [
        diagnostic('AUTHORING_EXPIRED', DESIGNER_UI_TEXT.lifecycle.unloaded),
      ]);
      return;
    }
    let result: ScreenParseResult<unknown> = { ok: true, value: null, diagnostics: [] };
    switch (command.type) {
      case 'select':
        result = this.callbacks.select(command.selection, false);
        break;
      case 'connect': {
        const connection = connectDesignerBlueprintNodes(
          document,
          command.sourceNodeId,
          command.sourceHandle,
          command.targetNodeId,
          command.targetHandle,
          buildDesignerBlueprintEventOptions(
            document,
            this.callbacks.getCatalog(),
            this.callbacks.getRuntimeContributions(),
          ),
        );
        result = connection.ok
          ? this.commitBlueprint(connection.blueprint)
          : failure(
              'AUTHORING_REQUEST_INVALID',
              designerBlueprintConnectionFailureMessage(connection.reason),
            );
        if (result.ok && connection.ok) {
          result = this.callbacks.select(connection.selection, false);
        }
        break;
      }
      case 'delete-selection':
        result = this.commitBlueprint(
          deleteDesignerBlueprintSelection(document.blueprint, command.selection),
        );
        if (result.ok) this.callbacks.select(null, false);
        break;
      case 'insert-node': {
        const insertion =
          command.kind === 'component'
            ? {
                nodeId: componentBlueprintNodeId(command.componentId),
                blueprint: insertDesignerBlueprintComponentNode(
                  document,
                  command.componentId,
                  command.position,
                ),
              }
            : command.kind === 'variable'
              ? {
                  nodeId: variableBlueprintNodeId(command.variableId),
                  blueprint: insertDesignerBlueprintVariableNode(
                    document,
                    command.variableId,
                    command.position,
                  ),
                }
              : insertDesignerBlueprintLibraryNode(
                  document,
                  command.kind,
                  command.variableId,
                  command.position,
                );
        result = this.commitBlueprint(insertion === null ? null : insertion.blueprint);
        if (result.ok && insertion !== null) {
          result = this.callbacks.select({ kind: 'node', id: insertion.nodeId }, false);
        }
        break;
      }
      case 'commit-layout': {
        const currentIds = new Set(this.callbacks.getGraph().nodes.map((node) => node.id));
        const submittedIds = new Set(command.nodes.map((node) => node.id));
        result =
          currentIds.size !== submittedIds.size ||
          [...currentIds].some((id) => !submittedIds.has(id))
            ? failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.staleCommand)
            : this.commitBlueprint(
                commitDesignerBlueprintLayout(document.blueprint, command.nodes, command.viewport),
              );
        break;
      }
      case 'commit-viewport':
        result = this.commitBlueprint(
          commitDesignerBlueprintViewport(document.blueprint, command.viewport),
        );
        break;
      case 'history-undo':
        result = this.callbacks.undo();
        break;
      case 'history-redo':
        result = this.callbacks.redo();
        break;
      case 'run-simulation':
        result = this.runSimulation(command.componentId, command.eventName, command.payload);
        break;
    }
    this.finish(command.commandId, result.ok ? 'accepted' : 'rejected', result.diagnostics);
  }

  private runSimulation(
    componentId: string,
    eventName: string,
    payload: ScreenJsonValue,
  ): ScreenParseResult<null> {
    const document = this.callbacks.getDocument();
    if (document === undefined)
      return failure('AUTHORING_EXPIRED', DESIGNER_UI_TEXT.lifecycle.unloaded);
    const compiled = compileScreenBlueprint(document, this.capabilities);
    if (!compiled.ok) return compiled;
    const traced = traceScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId,
      name: eventName,
      payload,
    });
    if (!traced.ok) return traced;
    const executedEdgeIds: string[] = [];
    const failedRuleIds: string[] = [];
    const lines: string[] = [];
    for (const ruleTrace of traced.value.ruleTraces) {
      if (!ruleTrace.triggerMatched) continue;
      const rule = document.blueprint.rules.find((item) => item.id === ruleTrace.ruleId);
      if (rule?.condition !== undefined) executedEdgeIds.push(`edge:${ruleTrace.ruleId}:trigger`);
      if (ruleTrace.condition === 'failed') failedRuleIds.push(ruleTrace.ruleId);
      for (const action of ruleTrace.actions) {
        executedEdgeIds.push(`edge:${ruleTrace.ruleId}:action:${action.actionIndex}`);
      }
      const condition =
        ruleTrace.condition === 'failed'
          ? DESIGNER_UI_TEXT.blueprint.conditionStates.failed
          : ruleTrace.condition === 'passed'
            ? DESIGNER_UI_TEXT.blueprint.conditionStates.passed
            : DESIGNER_UI_TEXT.blueprint.conditionStates.none;
      lines.push(
        DESIGNER_UI_TEXT.blueprint.simulationLine(
          ruleTrace.ruleId,
          condition,
          ruleTrace.actions.length,
        ),
      );
    }
    if (lines.length === 0) lines.push(DESIGNER_UI_TEXT.blueprint.simulationEmpty);
    this.#trace = { executedEdgeIds, failedRuleIds, lines };
    return { ok: true, value: null, diagnostics: [] };
  }

  private finish(
    commandId: string,
    status: BaseScreenBlueprintCanvasCommandResult['status'],
    diagnostics: readonly ScreenDiagnostic[],
  ): void {
    const result = cloneAndFreeze<BaseScreenBlueprintCanvasCommandResult>({
      commandId,
      status,
      diagnostics,
    });
    this.#lastCommand = result;
    this.#processedCommands.set(commandId, result);
    if (this.#processedCommands.size > MAX_PROCESSED_COMMANDS) {
      this.#processedCommands.delete(this.#processedCommands.keys().next().value as string);
    }
    this.callbacks.render();
    if (status === 'rejected') this.callbacks.emitDiagnostics(diagnostics);
  }

  private rejectUnknown(input: unknown, diagnostics: readonly ScreenDiagnostic[]): void {
    this.#lastCommand = rejectedBlueprintCanvasCommand(input, diagnostics);
    this.callbacks.render();
    this.callbacks.emitDiagnostics(diagnostics);
  }

  private get capabilities(): { readonly hasBlueprintCapability: (id: string) => boolean } {
    return blueprintCapabilityReader(this.callbacks.getRuntimeContributions);
  }
}

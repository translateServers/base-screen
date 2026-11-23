import {
  parseScreenDocument,
  readScreenBlueprintEventPort,
  resolveScreenStartPageId,
  type ScreenBlueprint,
  type ScreenBlueprintAction,
  type ScreenBlueprintRuleStep,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  screenJsonEquals,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  type ScreenBlueprintEvent,
  type ScreenDocumentCommand,
  traceScreenBlueprintEvent,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  buildDesignerBlueprintConnectionContext,
  buildDesignerBlueprintSimulationTriggers,
  commitDesignerBlueprintLayout,
  commitDesignerBlueprintViewport,
  connectDesignerBlueprintPorts,
  deleteDesignerBlueprintSelection,
  duplicateDesignerBlueprintNodes,
  findBlueprintNode,
  insertDesignerBlueprintNode,
  reorderDesignerBlueprintEdge,
  updateDesignerBlueprintNode,
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
  type BaseScreenBlueprintCanvasTraceStep,
  type BaseScreenDesignerWorkbenchMode,
  EMPTY_BLUEPRINT_CANVAS_SELECTION,
  parseBaseScreenBlueprintCanvasCommand,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
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
/** 与 viewer 的级联上限一致：变量写入引发的 data-updated 作为后续分派，最多 32 层。 */
const MAX_SIMULATION_CASCADE = 32;
const TEXT = DESIGNER_UI_TEXT.blueprint.graph;

export interface DesignerBlueprintCanvasBridgeCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGraph: () => BaseScreenBlueprintCanvasGraph;
  readonly getMode: () => BaseScreenDesignerWorkbenchMode;
  readonly getSelection: () => BaseScreenBlueprintCanvasSelection;
  readonly getShowSemantic: () => boolean;
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
  /** 一次模拟产出轨迹后调用（画布模拟条与检查器「运行」页共用）。 */
  readonly onSimulated?: () => void;
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

  clearTrace(): void {
    this.#trace = null;
  }

  dispatchState(graph = this.callbacks.getGraph()): void {
    const canvas = this.#canvas;
    if (canvas === undefined) return;
    const document = this.callbacks.getDocument();
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
      simulationTriggers:
        document === undefined ? [] : buildDesignerBlueprintSimulationTriggers(graph, document),
      showSemantic: this.callbacks.getShowSemantic(),
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
    if (
      screenJsonEquals(
        blueprint as unknown as ScreenJsonValue,
        document.blueprint as unknown as ScreenJsonValue,
      )
    ) {
      return { ok: true, value: document, diagnostics: [] };
    }
    const parsed = parseScreenDocument({ ...document, blueprint });
    if (!parsed.ok) return parsed;
    // 作者期不因能力缺失拒绝编辑：未授权能力由状态诊断提示，运行时失败关闭。
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

  /** 供面板与右键菜单直接调用的模拟入口（与画布命令同一实现）。 */
  simulate(nodeId: string, port: string, payload: ScreenJsonValue): ScreenParseResult<null> {
    const result = this.runSimulation(nodeId, port, payload);
    if (result.ok) this.callbacks.onSimulated?.();
    this.callbacks.render();
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
    return result;
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
    // 只读命令不受文档版本约束：选择与模拟不改文档。
    const readOnly =
      command.type === 'select' ||
      command.type === 'run-simulation' ||
      command.type === 'clear-simulation';
    if (
      command.generation !== this.#generation ||
      (!readOnly && command.documentRevision !== this.callbacks.getDocumentRevision())
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
        const connection = connectDesignerBlueprintPorts(
          document.blueprint,
          command.from,
          command.to,
          buildDesignerBlueprintConnectionContext(
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
          result = this.callbacks.select({ nodes: [], edges: [connection.edgeId] }, false);
        }
        break;
      }
      case 'delete-selection':
        result = this.commitBlueprint(
          deleteDesignerBlueprintSelection(document.blueprint, command.selection),
        );
        if (result.ok) this.callbacks.select(EMPTY_BLUEPRINT_CANVAS_SELECTION, false);
        break;
      case 'insert-node': {
        const {
          type: _type,
          commandId: _id,
          generation: _g,
          documentRevision: _r,
          position,
          ...spec
        } = command;
        const inserted = insertDesignerBlueprintNode(document, spec, position);
        result = this.commitBlueprint(inserted?.blueprint ?? null);
        if (result.ok && inserted !== null) {
          result = this.callbacks.select({ nodes: [inserted.nodeId], edges: [] }, false);
        }
        break;
      }
      case 'update-node': {
        let blueprint: ScreenBlueprint | null = document.blueprint;
        for (const nodeId of command.nodeIds) {
          if (blueprint === null) break;
          blueprint = updateDesignerBlueprintNode(blueprint, nodeId, command.update);
        }
        result = this.commitBlueprint(blueprint);
        break;
      }
      case 'reorder-edge':
        result = this.commitBlueprint(
          reorderDesignerBlueprintEdge(document.blueprint, command.edgeId, command.direction),
        );
        break;
      case 'duplicate-nodes': {
        const duplicated = duplicateDesignerBlueprintNodes(document.blueprint, command.nodeIds);
        result = this.commitBlueprint(duplicated?.blueprint ?? null);
        if (result.ok && duplicated !== null) {
          result = this.callbacks.select({ nodes: duplicated.nodeIds, edges: [] }, false);
        }
        break;
      }
      case 'commit-layout':
        result = this.commitBlueprint(
          commitDesignerBlueprintLayout(document.blueprint, command.nodes, command.viewport),
        );
        break;
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
        result = this.runSimulation(command.nodeId, command.port, command.payload);
        if (result.ok) this.callbacks.onSimulated?.();
        break;
      case 'clear-simulation':
        this.#trace = null;
        break;
    }
    this.finish(command.commandId, result.ok ? 'accepted' : 'rejected', result.diagnostics);
  }

  /**
   * 从一个触发锚点模拟（ADR-0107 §2.3、D6）：按编译后的规则深度优先执行；变量值改变后，
   * 以新值为负载再分派该变量的 `data-updated`（级联上限 32）。请求类动作只登记，不发出。
   */
  private runSimulation(
    nodeId: string,
    port: string,
    payload: ScreenJsonValue,
  ): ScreenParseResult<null> {
    const document = this.callbacks.getDocument();
    if (document === undefined) {
      return failure('AUTHORING_EXPIRED', DESIGNER_UI_TEXT.lifecycle.unloaded);
    }
    const node = findBlueprintNode(document.blueprint, nodeId);
    const event = node === undefined ? undefined : simulationEvent(node, port, payload);
    if (event === undefined) {
      return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidCommand);
    }
    const compiled = compileScreenBlueprint(document, { hasBlueprintCapability: () => true });
    if (!compiled.ok) return compiled;
    const plan = compiled.value;
    const steps: BaseScreenBlueprintCanvasTraceStep[] = [];
    const executedEdgeIds = new Set<string>();
    const visitedNodeIds = new Set<string>([nodeId]);
    const titles = new Map(this.callbacks.getGraph().nodes.map((item) => [item.id, item.title]));
    let variables: ScreenJsonObject = plan.initialVariables;
    // 模拟里的从画布状态：弹框从全部关闭开始，页面从起始页开始；真正变化时才级联
    // 「已打开 / 已关闭」与「页面已切换」（同查看器的顺序：先关弹框 → 旧页离开 → 新页进入）。
    const openPopups = new Set<string>();
    const pageIds = (document.subCanvases ?? [])
      .filter((canvas) => canvas.display === 'page')
      .map((canvas) => canvas.id);
    let currentPage: string | null = resolveScreenStartPageId(document);
    const pageHistory: string[] = [];
    const enqueue = (next: ScreenBlueprintEvent, depth: number): void => {
      queue.push({ event: next, depth });
    };
    const goPage = (
      target: string | undefined,
      payload: ScreenJsonValue | undefined,
      remember: boolean,
      depth: number,
    ): void => {
      if (target === undefined || target === currentPage || !pageIds.includes(target)) return;
      for (const popupId of [...openPopups].reverse()) {
        openPopups.delete(popupId);
        enqueue({ type: 'canvas-event', canvasId: popupId, name: 'closed', payload: null }, depth);
      }
      const from = currentPage;
      if (from !== null) {
        if (remember) pageHistory.push(from);
        enqueue({ type: 'canvas-event', canvasId: from, name: 'closed', payload: null }, depth);
      }
      currentPage = target;
      enqueue(
        { type: 'canvas-event', canvasId: target, name: 'opened', payload: payload ?? null },
        depth,
      );
      enqueue({ type: 'page-changed', name: 'page-changed', payload: { from, to: target } }, depth);
    };
    let failed = false;
    const queue: { readonly event: ScreenBlueprintEvent; readonly depth: number }[] = [
      { event, depth: 0 },
    ];
    while (queue.length > 0) {
      const { event: current, depth } = queue.shift()!;
      if (depth > MAX_SIMULATION_CASCADE) {
        steps.push({ kind: 'error', depth, text: TEXT.simulation.depthExceeded });
        failed = true;
        break;
      }
      const traced = traceScreenBlueprintEvent(plan, variables, current);
      if (!traced.ok) {
        steps.push({
          kind: 'error',
          depth,
          text: traced.diagnostics[0]?.message ?? DESIGNER_UI_TEXT.blueprint.invalidCommand,
        });
        failed = true;
        break;
      }
      for (const ruleTrace of traced.value.ruleTraces) {
        if (!ruleTrace.triggerMatched) continue;
        const rule = plan.rules.find((candidate) => candidate.id === ruleTrace.ruleId);
        if (rule === undefined) continue;
        visitedNodeIds.add(rule.nodeId);
        steps.push({
          kind: depth === 0 ? 'trigger' : 'cascade',
          nodeId: rule.nodeId,
          depth,
          text: titles.get(rule.nodeId) ?? rule.nodeId,
        });
        const conditions = [...ruleTrace.conditions];
        const actions = [...ruleTrace.actions];
        const walk = (ruleSteps: readonly ScreenBlueprintRuleStep[], level: number): void => {
          for (const step of ruleSteps) {
            if (step.type === 'condition') {
              const evaluated = conditions[0];
              if (evaluated === undefined || evaluated.nodeId !== step.nodeId) return;
              conditions.shift();
              executedEdgeIds.add(step.edgeId);
              visitedNodeIds.add(step.nodeId);
              steps.push({
                kind: 'condition',
                nodeId: step.nodeId,
                edgeId: step.edgeId,
                passed: evaluated.passed,
                depth: level,
                text: `${titles.get(step.nodeId) ?? step.nodeId} · ${
                  evaluated.passed ? TEXT.simulation.passed : TEXT.simulation.failed
                }`,
              });
              walk(evaluated.passed ? step.yes : step.no, level + 1);
              continue;
            }
            const executed = actions[0];
            if (executed === undefined || executed.edgeId !== step.edgeId) continue;
            actions.shift();
            executedEdgeIds.add(step.edgeId);
            const target = document.blueprint.edges.find((edge) => edge.id === step.edgeId)?.to
              .node;
            if (target !== undefined) visitedNodeIds.add(target);
            steps.push({
              kind:
                step.action.type === 'request-variable' ||
                step.action.type === 'request-component-data'
                  ? 'request'
                  : 'action',
              edgeId: step.edgeId,
              ...(target === undefined ? {} : { nodeId: target }),
              depth: level,
              text: describeAction(step.action, document),
            });
          }
        };
        walk(rule.steps, depth + 1);
      }
      const next = traced.value.variables;
      for (const [variableId, value] of Object.entries(next)) {
        if (screenJsonEquals(value, variables[variableId] ?? null) && variableId in variables) {
          continue;
        }
        queue.push({
          event: { type: 'variable-event', variableId, name: 'data-updated', payload: value },
          depth: depth + 1,
        });
      }
      variables = next;
      for (const effect of traced.value.canvasEffects) {
        if (effect.type === 'page-navigation') {
          if (effect.operation === 'back') {
            goPage(pageHistory.pop(), undefined, false, depth + 1);
          } else {
            const index = currentPage === null ? -1 : pageIds.indexOf(currentPage);
            goPage(
              pageIds[effect.operation === 'next' ? index + 1 : index - 1],
              undefined,
              true,
              depth + 1,
            );
          }
          continue;
        }
        if (pageIds.includes(effect.canvasId)) {
          const open =
            effect.operation === 'open' ||
            (effect.operation === 'toggle' && effect.canvasId !== currentPage);
          if (open) goPage(effect.canvasId, effect.payload, true, depth + 1);
          else if (effect.canvasId === currentPage) {
            goPage(pageHistory.pop(), undefined, false, depth + 1);
          }
          continue;
        }
        const open =
          effect.operation === 'open'
            ? true
            : effect.operation === 'close'
              ? false
              : !openPopups.has(effect.canvasId);
        if (open === openPopups.has(effect.canvasId)) continue;
        if (open) openPopups.add(effect.canvasId);
        else openPopups.delete(effect.canvasId);
        enqueue(
          {
            type: 'canvas-event',
            canvasId: effect.canvasId,
            name: open ? 'opened' : 'closed',
            payload: open ? (effect.payload ?? null) : null,
          },
          depth + 1,
        );
      }
    }
    this.#trace = {
      trigger: { nodeId, port },
      executedEdgeIds: [...executedEdgeIds],
      visitedNodeIds: [...visitedNodeIds],
      steps,
      failed,
    };
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

/** 触发锚点 → 运行时事件；不是触发锚点时返回 `undefined`。 */
function simulationEvent(
  node: ScreenBlueprint['nodes'][number],
  port: string,
  payload: ScreenJsonValue,
): ScreenBlueprintEvent | undefined {
  if (node.kind === 'component') {
    if (port === 'state-changed') {
      return {
        type: 'component-state-changed',
        componentId: node.componentId,
        name: 'state-changed',
        payload,
      };
    }
    const name = readScreenBlueprintEventPort(port);
    return name === undefined ? undefined : { componentId: node.componentId, name, payload };
  }
  if (node.kind === 'variable' && port === 'data-updated') {
    return { type: 'variable-event', variableId: node.variableId, name: 'data-updated', payload };
  }
  if (node.kind === 'lifecycle' && port === 'ready') {
    return { type: 'lifecycle', name: 'ready', payload };
  }
  if (node.kind === 'timer' && port === 'tick') {
    return { type: 'timer', name: 'tick', intervalSeconds: node.intervalSeconds, payload };
  }
  if (node.kind === 'sub-canvas' && (port === 'opened' || port === 'closed')) {
    return { type: 'canvas-event', canvasId: node.canvasId, name: port, payload };
  }
  if (node.kind === 'main-canvas' && port === 'page-changed') {
    return { type: 'page-changed', name: 'page-changed', payload };
  }
  return undefined;
}

function describeAction(action: ScreenBlueprintAction, document: ScreenDocument): string {
  const componentName = (id: string) =>
    document.components.find((component) => component.id === id)?.name ?? id;
  switch (action.type) {
    case 'component-visibility':
      return `${TEXT.ports[action.operation] ?? action.operation} · ${componentName(action.componentId)}`;
    case 'request-component-data':
      return TEXT.simulation.requested(componentName(action.componentId));
    case 'request-variable':
      return TEXT.simulation.requested(action.variableId);
    case 'set-variable':
      return DESIGNER_UI_TEXT.blueprint.setVariableAction(action.variableId);
    case 'emit-host-event':
      return DESIGNER_UI_TEXT.blueprint.emitHostEventAction(action.eventName);
    case 'host-action':
      return DESIGNER_UI_TEXT.blueprint.hostAction(action.actionId);
    case 'canvas-visibility': {
      const canvas = document.subCanvases?.find((candidate) => candidate.id === action.canvasId);
      return DESIGNER_UI_TEXT.blueprint.canvasAction(
        TEXT.subCanvasPorts[canvas?.display ?? 'popup'][action.operation] ?? action.operation,
        canvas?.name ?? action.canvasId,
      );
    }
    case 'page-navigation':
      return TEXT.mainCanvasPorts[action.operation] ?? action.operation;
    case 'component-state': {
      const component = document.components.find((item) => item.id === action.componentId);
      const state = component?.states?.items.find((item) => item.id === action.stateId);
      const port = TEXT.ports[action.operation === 'set' ? 'set-state' : 'reset-state'];
      return `${port ?? action.operation} · ${componentName(action.componentId)}${
        state === undefined ? '' : ` · ${state.name}`
      }`;
    }
  }
}

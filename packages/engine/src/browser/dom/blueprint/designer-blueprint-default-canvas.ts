import type {
  BaseScreenBlueprintCanvasCommand,
  BaseScreenBlueprintCanvasCommandEventDetail,
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasInsertNode,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
  BaseScreenBlueprintCanvasState,
  BaseScreenBlueprintCanvasStateEventDetail,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerIconName } from '../../ui/designer-icons.js';
import { designerIcon } from '../../ui/designer-icons.js';
import {
  createDesignerButton,
  createDesignerIconButton,
  createDesignerSelect,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';

/**
 * 引擎内置的蓝图中央画布（无宿主画布时的默认实现）。
 *
 * 与宿主画布走完全相同的公开协议：消费 `base-screen-blueprint-canvas-state`，
 * 发出 `base-screen-blueprint-canvas-command`。语义图、canonical 编辑、历史与
 * 模拟结果均由引擎提供，这里只负责图形、手势和画布局部控件。
 *
 * 样式在 `designer-workbench-blueprint-canvas.css`，文案在
 * `designer-blueprint-ui-text.ts` 的 `canvasSurface` 段。
 */

const NODE_WIDTH = 208;
const NODE_HEADER = 34;
const PORT_ROW = 22;
const BODY_PADDING = 8;
const SUBTITLE_HEIGHT = 16;
const SUMMARY_LINE_HEIGHT = 16;
const NODE_BOTTOM_PADDING = 10;
const SNAP = 8;
const FIT_PADDING = 28;
const SIMULATION_INSET = 150;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ZOOM_STEPS = [0.4, 0.5, 0.6, 0.7, 0.84, 1, 1.25, 1.5, 2] as const;
const SVG_NS = 'http://www.w3.org/2000/svg';
const TRACE_LABEL_MIN_ZOOM = 0.62;

const text = DESIGNER_UI_TEXT.blueprint.canvasSurface;
const blueprintText = DESIGNER_UI_TEXT.blueprint;

interface CanvasPort {
  readonly handle: string;
  readonly label: string;
  readonly y: number;
  readonly available: boolean;
  readonly requiredCapability?: string;
  readonly dependency?: true;
}

interface NodeGeometry {
  readonly width: number;
  readonly height: number;
  readonly portStart: number;
  readonly inputY: number;
  readonly inputHandle?: 'condition:in' | 'action:in';
  readonly outputs: readonly CanvasPort[];
  readonly dependency: boolean;
}

interface DragState {
  readonly nodeId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

interface PanState {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

interface LinkState {
  readonly nodeId: string;
  readonly handle: string;
  readonly pointerId: number;
  target: Element | null;
}

interface ArmedSource {
  readonly nodeId: string;
  readonly handle: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ViewportValue {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

type CommandInput = BaseScreenBlueprintCanvasCommand extends infer Command
  ? Command extends BaseScreenBlueprintCanvasCommand
    ? Omit<Command, 'commandId' | 'generation' | 'documentRevision'>
    : never
  : never;

export interface DesignerBlueprintDefaultCanvasHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createDesignerBlueprintDefaultCanvas(
  ownerDocument: Document,
): DesignerBlueprintDefaultCanvasHandle {
  const view = ownerDocument.defaultView;
  const root = ownerDocument.createElement('div');
  root.className = 'designer-blueprint-canvas';
  root.dataset.designerBlueprintCanvas = 'true';

  const bar = ownerDocument.createElement('div');
  bar.className = 'designer-blueprint-canvas-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', text.toolbar);

  const addAnchor = ownerDocument.createElement('span');
  addAnchor.className = 'designer-blueprint-canvas-menu-anchor';
  const addButton = textButton(ownerDocument, 'plus', text.addNode, 'add-node');
  addButton.setAttribute('aria-haspopup', 'menu');
  addButton.setAttribute('aria-expanded', 'false');
  const addMenu = ownerDocument.createElement('div');
  addMenu.className = 'designer-blueprint-canvas-menu';
  addMenu.dataset.canvasMenu = 'add-node';
  addMenu.setAttribute('role', 'menu');
  addMenu.setAttribute('aria-label', text.addNodeMenu);
  addMenu.hidden = true;
  for (const [kind, label] of [
    ['condition', text.insertCondition],
    ['set-variable', text.insertSetVariable],
    ['emit-host-event', text.insertEmitHostEvent],
  ] as const) {
    const item = createDesignerButton(ownerDocument, {
      className: 'designer-blueprint-canvas-menu-item',
      text: label,
    });
    item.dataset.canvasInsert = kind;
    item.setAttribute('role', 'menuitem');
    addMenu.append(item);
  }
  addAnchor.append(addButton, addMenu);

  const layoutButton = textButton(ownerDocument, 'grid', blueprintText.autoLayout, 'auto-layout');
  const problemsButton = ownerDocument.createElement('button');
  problemsButton.type = 'button';
  problemsButton.className =
    'designer-control designer-button designer-blueprint-canvas-problems-button';
  problemsButton.dataset.canvasAction = 'problems';
  problemsButton.dataset.state = 'ok';
  problemsButton.setAttribute('aria-haspopup', 'dialog');
  problemsButton.setAttribute('aria-expanded', 'false');
  const problemsDot = ownerDocument.createElement('span');
  problemsDot.className = 'designer-blueprint-canvas-problems-dot';
  problemsDot.setAttribute('aria-hidden', 'true');
  const problemsLabel = ownerDocument.createElement('span');
  problemsLabel.className = 'designer-blueprint-canvas-bar-label';
  problemsLabel.dataset.canvasProblemsLabel = 'true';
  problemsButton.append(problemsDot, problemsLabel);

  const traceButton = textButton(ownerDocument, 'activity', text.traceToggle, 'trace');
  traceButton.setAttribute('aria-pressed', 'true');

  const spacer = ownerDocument.createElement('span');
  spacer.className = 'designer-blueprint-canvas-bar-spacer';

  const zoomOut = iconButton(ownerDocument, 'minus', text.zoomOut, 'zoom-out');
  const zoomValue = ownerDocument.createElement('span');
  zoomValue.className = 'designer-blueprint-canvas-zoom';
  zoomValue.dataset.canvasZoom = 'true';
  zoomValue.setAttribute('role', 'status');
  const zoomIn = iconButton(ownerDocument, 'plus', text.zoomIn, 'zoom-in');
  const fitButton = iconButton(ownerDocument, 'fit', blueprintText.fit, 'fit');
  const simulateButton = textButton(ownerDocument, 'play', text.simulatePanel, 'simulate');
  simulateButton.setAttribute('aria-expanded', 'false');

  bar.append(
    addAnchor,
    layoutButton,
    problemsButton,
    traceButton,
    spacer,
    zoomOut,
    zoomValue,
    zoomIn,
    fitButton,
    simulateButton,
  );

  const problems = ownerDocument.createElement('div');
  problems.className = 'designer-blueprint-canvas-problems';
  problems.dataset.canvasProblems = 'true';
  problems.setAttribute('role', 'dialog');
  problems.setAttribute('aria-label', blueprintText.problemsTitle);
  problems.hidden = true;

  const viewport = ownerDocument.createElement('div');
  viewport.className = 'designer-blueprint-canvas-viewport';
  viewport.dataset.canvasViewport = 'true';
  viewport.tabIndex = 0;

  const layers = ownerDocument.createElement('div');
  layers.className = 'designer-blueprint-canvas-layers';
  const edges = ownerDocument.createElementNS(SVG_NS, 'svg');
  edges.classList.add('designer-blueprint-canvas-edges');
  layers.append(edges);

  const overlay = ownerDocument.createElementNS(SVG_NS, 'svg');
  overlay.classList.add('designer-blueprint-canvas-overlay');
  const preview = ownerDocument.createElementNS(SVG_NS, 'path');
  preview.classList.add('designer-blueprint-canvas-link-preview');
  preview.setAttribute('visibility', 'hidden');
  overlay.append(preview);

  const emptyCard = ownerDocument.createElement('section');
  emptyCard.className = 'designer-blueprint-canvas-empty';
  emptyCard.dataset.canvasEmpty = 'true';
  emptyCard.hidden = true;
  const emptyTitle = ownerDocument.createElement('h3');
  emptyTitle.textContent = text.emptyTitle;
  const emptyDescription = ownerDocument.createElement('p');
  emptyDescription.textContent = text.emptyDescription;
  const emptySteps = ownerDocument.createElement('ol');
  for (const step of [text.emptyStepTrigger, text.emptyStepConnect, text.emptyStepExit]) {
    const item = ownerDocument.createElement('li');
    item.textContent = step;
    emptySteps.append(item);
  }
  const emptyActions = ownerDocument.createElement('div');
  emptyActions.className = 'designer-blueprint-canvas-empty-actions';
  const emptyCreate = createDesignerButton(ownerDocument, {
    className: 'designer-blueprint-canvas-empty-primary',
    text: text.emptyCreateCondition,
    variant: 'primary',
  });
  emptyCreate.dataset.canvasInsert = 'condition';
  const emptyHint = ownerDocument.createElement('span');
  emptyHint.className = 'designer-blueprint-canvas-empty-hint';
  emptyHint.textContent = text.emptyLibraryHint;
  emptyActions.append(emptyCreate, emptyHint);
  emptyCard.append(emptyTitle, emptyDescription, emptySteps, emptyActions);

  const noEvents = ownerDocument.createElement('div');
  noEvents.className = 'designer-blueprint-canvas-no-events';
  noEvents.dataset.canvasNoEvents = 'true';
  noEvents.hidden = true;
  noEvents.setAttribute('role', 'status');
  const noEventsTitle = ownerDocument.createElement('strong');
  noEventsTitle.textContent = text.noEventsTitle;
  const noEventsBody = ownerDocument.createElement('span');
  noEventsBody.textContent = text.noEventsBody;
  noEvents.append(noEventsTitle, noEventsBody);

  const status = ownerDocument.createElement('div');
  status.className = 'designer-blueprint-canvas-status';
  status.dataset.canvasStatus = 'true';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  const simulationBar = ownerDocument.createElement('div');
  simulationBar.className = 'designer-blueprint-canvas-simulation-bar';
  simulationBar.dataset.canvasSimulationBar = 'true';
  const simulationBarLabel = ownerDocument.createElement('span');
  simulationBarLabel.className = 'designer-blueprint-canvas-simulation-bar-label';
  const simulationExpand = textButton(
    ownerDocument,
    'play',
    text.expandSimulation,
    'simulation-expand',
  );
  simulationBar.append(simulationBarLabel, simulationExpand);

  const simulation = ownerDocument.createElement('section');
  simulation.className = 'designer-blueprint-canvas-simulation';
  simulation.dataset.canvasSimulation = 'true';
  simulation.hidden = true;
  simulation.setAttribute('aria-label', blueprintText.simulate);
  const simulationHeader = ownerDocument.createElement('header');
  simulationHeader.className = 'designer-blueprint-canvas-simulation-header';
  const simulationTitle = ownerDocument.createElement('strong');
  simulationTitle.textContent = blueprintText.simulate;
  const simulationClose = panelIconButton(
    ownerDocument,
    'close',
    text.collapseSimulation,
    'simulation-close',
  );
  simulationHeader.append(simulationTitle, simulationClose);

  const simulationContent = ownerDocument.createElement('div');
  simulationContent.className = 'designer-blueprint-canvas-simulation-content';
  const simulationControls = ownerDocument.createElement('div');
  simulationControls.className = 'designer-blueprint-canvas-simulation-controls';
  const eventLabel = ownerDocument.createElement('label');
  eventLabel.className = 'designer-blueprint-canvas-simulation-field';
  const eventLabelText = ownerDocument.createElement('span');
  eventLabelText.textContent = text.simulationEventLabel;
  const eventSelect = createDesignerSelect(ownerDocument, {
    ariaLabel: text.simulationEventLabel,
    className: 'designer-blueprint-canvas-simulation-select',
  });
  eventSelect.dataset.canvasSimulationEvent = 'true';
  eventLabel.append(eventLabelText, eventSelect);
  const payloadLabel = ownerDocument.createElement('label');
  payloadLabel.className = 'designer-blueprint-canvas-simulation-field';
  const payloadLabelText = ownerDocument.createElement('span');
  payloadLabelText.textContent = text.simulationPayloadLabel;
  const payloadInput = createDesignerTextarea(ownerDocument, {
    ariaLabel: text.simulationPayloadAria,
    className: 'designer-blueprint-canvas-simulation-payload',
    value: '{}',
  });
  payloadInput.dataset.canvasSimulationPayload = 'true';
  payloadInput.spellcheck = false;
  payloadLabel.append(payloadLabelText, payloadInput);

  const simulationFooter = ownerDocument.createElement('div');
  simulationFooter.className = 'designer-blueprint-canvas-simulation-footer';
  const simulationStatus = ownerDocument.createElement('span');
  simulationStatus.className = 'designer-blueprint-canvas-simulation-status';
  simulationStatus.dataset.canvasSimulationStatus = 'true';
  simulationStatus.setAttribute('role', 'status');
  const runButton = createDesignerButton(ownerDocument, {
    className: 'designer-blueprint-canvas-simulation-run',
    text: text.simulationRun,
    variant: 'primary',
  });
  runButton.dataset.canvasAction = 'simulation-run';
  simulationFooter.append(simulationStatus, runButton);
  simulationControls.append(eventLabel, payloadLabel, simulationFooter);

  const tracePanel = ownerDocument.createElement('div');
  tracePanel.className = 'designer-blueprint-canvas-simulation-trace';
  const traceTitle = ownerDocument.createElement('h4');
  traceTitle.textContent = text.simulationTraceTitle;
  const traceList = ownerDocument.createElement('ol');
  traceList.dataset.canvasTrace = 'true';
  const traceEmpty = ownerDocument.createElement('p');
  traceEmpty.className = 'designer-blueprint-canvas-simulation-trace-empty';
  traceEmpty.textContent = text.simulationNoTrace;
  tracePanel.append(traceTitle, traceList, traceEmpty);
  simulationContent.append(simulationControls, tracePanel);
  simulation.append(simulationHeader, simulationContent);

  viewport.append(
    layers,
    overlay,
    emptyCard,
    noEvents,
    problems,
    simulationBar,
    simulation,
    status,
  );
  root.append(bar, viewport);

  let state: BaseScreenBlueprintCanvasState | null = null;
  let generation = -1;
  let readySent = false;
  let positions = new Map<string, Point>();
  let viewportValue: ViewportValue = { x: 0, y: 0, zoom: 1 };
  let lastSentViewportKey = '';
  let lastAdoptedViewportKey = '';
  let viewportsDirty = false;
  let viewportCommitTimer: ReturnType<typeof setTimeout> | undefined;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let drag: DragState | null = null;
  let pan: PanState | null = null;
  let link: LinkState | null = null;
  let armed: ArmedSource | null = null;
  let commandSequence = 0;
  let lastFocusRequestId: number | undefined;
  let sessionLayout = false;
  let hydrated = false;
  let lastEnginePositions = new Map<string, Point>();
  let pendingInitialFit = false;
  let initialFitDone = false;
  let wasActive = false;
  let traceVisible = true;
  let simulationOpen = false;
  let menuOpen = false;
  let problemsOpen = false;
  let lastRunCommandId = '';
  let destroyed = false;

  const resizeObserver =
    typeof view?.ResizeObserver === 'function'
      ? new view.ResizeObserver(() => {
          if (pendingInitialFit) scheduleInitialFit();
        })
      : undefined;
  resizeObserver?.observe(viewport);

  function textButton(
    doc: Document,
    icon: DesignerIconName,
    label: string,
    action: string,
  ): HTMLButtonElement {
    const button = createDesignerButton(doc, {
      ariaLabel: label,
      className: 'designer-blueprint-canvas-bar-button',
      tip: label,
    });
    button.dataset.canvasAction = action;
    button.insertAdjacentHTML('afterbegin', designerIcon(icon));
    const labelElement = doc.createElement('span');
    labelElement.className = 'designer-blueprint-canvas-bar-label';
    labelElement.textContent = label;
    button.append(labelElement);
    return button;
  }

  function iconButton(
    doc: Document,
    icon: DesignerIconName,
    label: string,
    action: string,
  ): HTMLButtonElement {
    const button = createDesignerIconButton(doc, {
      className: 'designer-blueprint-canvas-bar-button',
      icon,
      label,
    });
    button.dataset.canvasAction = action;
    return button;
  }

  function panelIconButton(
    doc: Document,
    icon: DesignerIconName,
    label: string,
    action: string,
  ): HTMLButtonElement {
    const button = createDesignerIconButton(doc, {
      className: 'designer-blueprint-canvas-panel-icon',
      icon,
      label,
    });
    button.dataset.canvasAction = action;
    return button;
  }

  function graph(): BaseScreenBlueprintCanvasGraph | null {
    return state?.graph ?? null;
  }

  function geometryOf(node: BaseScreenBlueprintCanvasNode): NodeGeometry {
    const summary = node.summary?.secondary ?? '';
    const summaryLines =
      node.kind === 'condition' || node.kind === 'action' ? 2 : summary === '' ? 0 : 1;
    const portStart =
      NODE_HEADER +
      BODY_PADDING +
      SUBTITLE_HEIGHT +
      (summaryLines === 0 ? 0 : summaryLines * SUMMARY_LINE_HEIGHT + 4) +
      BODY_PADDING;
    if (node.kind === 'component' || node.kind === 'variable') {
      const events = node.events ?? [];
      const rows = Math.max(1, events.length);
      const dependency = node.kind === 'variable';
      const outputs: CanvasPort[] = events.map((event, index) => ({
        handle: `event:${event.name}`,
        label: event.label === '' ? event.name : event.label,
        y: portStart + index * PORT_ROW + PORT_ROW / 2,
        available: event.available,
        ...(event.requiredCapability === undefined
          ? {}
          : { requiredCapability: event.requiredCapability }),
      }));
      if (dependency) {
        outputs.push({
          handle: 'dependency:out',
          label: text.dependencyPort,
          y: portStart + rows * PORT_ROW + PORT_ROW / 2,
          available: true,
          dependency: true,
        });
      }
      const height = portStart + (rows + (dependency ? 1 : 0)) * PORT_ROW + NODE_BOTTOM_PADDING;
      return {
        width: NODE_WIDTH,
        height,
        portStart,
        inputY: portStart + PORT_ROW / 2,
        outputs,
        dependency,
      };
    }
    if (node.kind === 'condition') {
      return {
        width: NODE_WIDTH,
        height: portStart + PORT_ROW + NODE_BOTTOM_PADDING,
        portStart,
        inputY: portStart + PORT_ROW / 2,
        inputHandle: 'condition:in',
        outputs: [
          {
            handle: 'condition:true',
            label: 'true',
            y: portStart + PORT_ROW / 2,
            available: true,
          },
        ],
        dependency: false,
      };
    }
    return {
      width: NODE_WIDTH,
      height: portStart + PORT_ROW + NODE_BOTTOM_PADDING,
      portStart,
      inputY: portStart + PORT_ROW / 2,
      inputHandle: 'action:in',
      outputs: [],
      dependency: false,
    };
  }

  function positionOf(node: BaseScreenBlueprintCanvasNode): Point {
    return positions.get(node.id) ?? { x: node.x, y: node.y };
  }

  function snap(value: number): number {
    return Math.round(value / SNAP) * SNAP;
  }

  function outputPortY(node: BaseScreenBlueprintCanvasNode, handle: string): number {
    const geometry = geometryOf(node);
    return geometry.outputs.find((port) => port.handle === handle)?.y ?? geometry.height / 2;
  }

  function inputPortY(node: BaseScreenBlueprintCanvasNode): number {
    return geometryOf(node).inputY;
  }

  function nodeById(id: string): BaseScreenBlueprintCanvasNode | undefined {
    return graph()?.nodes.find((node) => node.id === id);
  }

  function sendCommand(input: CommandInput): BaseScreenBlueprintCanvasCommand | undefined {
    if (state === null) return undefined;
    commandSequence += 1;
    const command = {
      ...input,
      commandId: `designer-blueprint-${Date.now()}-${commandSequence}`,
      generation: state.generation,
      documentRevision: state.documentRevision,
    } as BaseScreenBlueprintCanvasCommand;
    root.dispatchEvent(
      new CustomEvent<BaseScreenBlueprintCanvasCommandEventDetail>(
        BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
        { bubbles: true, composed: true, detail: { command } },
      ),
    );
    return command;
  }

  function setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = false;
    if (statusTimer !== undefined) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.hidden = true;
      statusTimer = undefined;
    }, 3200);
  }

  function viewportKey(value: ViewportValue): string {
    return `${value.x.toFixed(1)}:${value.y.toFixed(1)}:${value.zoom.toFixed(3)}`;
  }

  function applyTransform(): void {
    layers.style.transform = `translate(${viewportValue.x}px, ${viewportValue.y}px) scale(${viewportValue.zoom})`;
    viewport.style.backgroundPosition = `${viewportValue.x}px ${viewportValue.y}px`;
    viewport.dataset.zoomFar = String(viewportValue.zoom < TRACE_LABEL_MIN_ZOOM);
    const percent = Math.round(viewportValue.zoom * 100);
    zoomValue.textContent = text.zoomValue(percent);
    zoomValue.setAttribute('aria-label', text.zoomAria(percent));
  }

  function scheduleViewportCommit(): void {
    viewportsDirty = true;
    if (viewportCommitTimer !== undefined) clearTimeout(viewportCommitTimer);
    viewportCommitTimer = setTimeout(() => {
      viewportCommitTimer = undefined;
      commitViewport();
    }, 280);
  }

  function commitViewport(): void {
    if (viewportCommitTimer !== undefined) clearTimeout(viewportCommitTimer);
    viewportCommitTimer = undefined;
    viewportsDirty = false;
    lastSentViewportKey = viewportKey(viewportValue);
    sendCommand({
      type: 'commit-viewport',
      viewport: {
        x: Math.round(viewportValue.x),
        y: Math.round(viewportValue.y),
        zoom: Math.round(viewportValue.zoom * 1000) / 1000,
      },
    });
  }

  function adoptViewport(next: ViewportValue | undefined): void {
    if (next === undefined) return;
    const key = viewportKey(next);
    if (key === lastAdoptedViewportKey) return;
    if (viewportsDirty || drag !== null || pan !== null || link !== null) return;
    if (key !== viewportKey(viewportValue) && key !== lastSentViewportKey) {
      viewportValue = { x: next.x, y: next.y, zoom: next.zoom };
      lastAdoptedViewportKey = key;
      applyTransform();
      return;
    }
    lastAdoptedViewportKey = key;
  }

  function screenToGraph(clientX: number, clientY: number): Point {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewportValue.x) / viewportValue.zoom,
      y: (clientY - rect.top - viewportValue.y) / viewportValue.zoom,
    };
  }

  function edgePath(edge: BaseScreenBlueprintCanvasEdge): string | null {
    const source = nodeById(edge.source);
    const target = nodeById(edge.target);
    if (source === undefined || target === undefined) return null;
    const sourceGeometry = geometryOf(source);
    const sourcePosition = positionOf(source);
    const targetPosition = positionOf(target);
    const x1 = sourcePosition.x + sourceGeometry.width;
    const y1 = sourcePosition.y + outputPortY(source, edge.sourceHandle);
    const x2 = targetPosition.x;
    const y2 = targetPosition.y + inputPortY(target);
    const offset = Math.max(56, Math.abs(x2 - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
  }

  function edgeLabel(edge: BaseScreenBlueprintCanvasEdge): string {
    if (edge.kind === 'dependency') {
      const source = nodeById(edge.source);
      return text.edgeDependency(source?.variableName ?? source?.variableId ?? '');
    }
    if (edge.kind === 'trigger') {
      return edge.sourceHandle.startsWith('event:')
        ? edge.sourceHandle.slice('event:'.length)
        : 'true';
    }
    if (edge.operation !== undefined) return blueprintText.visibilityOperation[edge.operation];
    if (edge.sourceHandle.startsWith('event:')) return edge.sourceHandle.slice('event:'.length);
    return 'true';
  }

  function edgeMidpoint(path: string): Point | null {
    const numbers = path.match(/-?\d+(?:\.\d+)?/g);
    if (numbers === null || numbers.length < 8) return null;
    const [x1 = 0, y1 = 0, cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0, x2 = 0, y2 = 0] = numbers
      .slice(0, 8)
      .map(Number);
    return {
      x: 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2,
      y: 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2,
    };
  }

  function labelOffset(edgeId: string): number {
    let hash = 0;
    for (let index = 0; index < edgeId.length; index += 1) {
      hash = (hash * 31 + edgeId.charCodeAt(index)) % 24;
    }
    return hash - 12;
  }

  function renderGraph(): void {
    const current = graph();
    edges.replaceChildren();
    for (const node of layers.querySelectorAll('.designer-blueprint-canvas-node')) node.remove();
    if (current === null) return;

    const traced = new Set(traceVisible ? (state?.trace?.executedEdgeIds ?? []) : []);
    const traceActive = traced.size > 0;
    for (const edge of current.edges) {
      const pathData = edgePath(edge);
      if (pathData === null) continue;
      const path = ownerDocument.createElementNS(SVG_NS, 'path');
      path.classList.add('designer-blueprint-canvas-edge');
      path.setAttribute('d', pathData);
      path.dataset.kind = edge.kind;
      if (traceActive && traced.has(edge.id)) path.dataset.traced = 'true';
      if (state?.selection?.kind === 'edge' && state.selection.id === edge.id) {
        path.dataset.selected = 'true';
      }
      edges.append(path);

      const hit = ownerDocument.createElementNS(SVG_NS, 'path');
      hit.classList.add('designer-blueprint-canvas-edge-hit');
      hit.setAttribute('d', pathData);
      hit.dataset.edgeId = edge.id;
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      const label = edgeLabel(edge);
      hit.setAttribute('aria-label', text.edgeAria(label));
      hit.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        select({ kind: 'edge', id: edge.id });
      });
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select({ kind: 'edge', id: edge.id });
        }
      });
      edges.append(hit);

      if (label !== '') {
        const point = edgeMidpoint(pathData);
        if (point !== null) {
          const labelElement = ownerDocument.createElementNS(SVG_NS, 'text');
          labelElement.classList.add('designer-blueprint-canvas-edge-label');
          labelElement.dataset.edgeLabel = edge.id;
          if (traceActive && traced.has(edge.id)) {
            labelElement.dataset.traced = 'true';
          }
          if (state?.selection?.kind === 'edge' && state.selection.id === edge.id) {
            labelElement.dataset.selected = 'true';
          }
          labelElement.setAttribute('x', String(point.x));
          labelElement.setAttribute('y', String(point.y + labelOffset(edge.id)));
          labelElement.textContent = label;
          edges.append(labelElement);
        }
      }
    }

    const failedRules = new Set(state?.trace?.failedRuleIds ?? []);
    for (const node of current.nodes) {
      const geometry = geometryOf(node);
      const position = positionOf(node);
      const card = ownerDocument.createElement('div');
      card.className = 'designer-blueprint-canvas-node';
      card.dataset.nodeId = node.id;
      card.dataset.kind = node.kind;
      if (node.unconnected === true) card.dataset.unconnected = 'true';
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
      card.style.width = `${geometry.width}px`;
      card.style.height = `${geometry.height}px`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const kindLabel = text.nodeKind[node.kind];
      const title = nodeTitle(node);
      card.setAttribute('aria-label', `${kindLabel} ${title}`);
      if (state?.selection?.kind === 'node' && state.selection.id === node.id) {
        card.dataset.selected = 'true';
      }
      if (node.ruleId !== undefined && failedRules.has(node.ruleId)) {
        card.dataset.failed = 'true';
      }

      const header = ownerDocument.createElement('div');
      header.className = 'designer-blueprint-canvas-node-header';
      const badge = ownerDocument.createElement('span');
      badge.className = 'designer-blueprint-canvas-node-badge';
      badge.textContent = kindLabel;
      const titleElement = ownerDocument.createElement('span');
      titleElement.className = 'designer-blueprint-canvas-node-title';
      titleElement.textContent = title;
      const flow = ownerDocument.createElement('span');
      flow.className = 'designer-blueprint-canvas-node-flow';
      const outputCount = geometry.outputs.filter((port) => port.dependency !== true).length;
      flow.textContent =
        node.unconnected === true
          ? blueprintText.unconnectedNode
          : geometry.inputHandle === undefined
            ? text.nodeFlowOutputs(outputCount)
            : text.nodeFlow(outputCount);
      header.append(badge, titleElement, flow);

      const content = ownerDocument.createElement('div');
      content.className = 'designer-blueprint-canvas-node-content';
      const subtitle = ownerDocument.createElement('div');
      subtitle.className = 'designer-blueprint-canvas-node-subtitle';
      subtitle.textContent = nodeSubtitle(node);
      content.append(subtitle);
      const summary = node.summary?.secondary ?? '';
      if (summary !== '') {
        const summaryElement = ownerDocument.createElement('p');
        summaryElement.className = 'designer-blueprint-canvas-node-summary';
        summaryElement.textContent = summary;
        content.append(summaryElement);
      }

      const ports = ownerDocument.createElement('div');
      ports.className = 'designer-blueprint-canvas-ports';
      ports.style.top = `${geometry.portStart}px`;
      if (node.kind === 'component' || node.kind === 'variable') {
        const eventPorts = geometry.outputs.filter((port) => port.dependency !== true);
        if (eventPorts.length === 0) {
          const row = ownerDocument.createElement('div');
          row.className = 'designer-blueprint-canvas-port-row';
          row.dataset.available = 'false';
          row.textContent = text.nodeNoEvents;
          ports.append(row);
        }
        for (const port of eventPorts) {
          ports.append(portRow(port));
        }
      }
      for (const port of geometry.outputs.filter((port) => port.dependency === true)) {
        const row = portRow(port);
        row.dataset.dependency = 'true';
        ports.append(row);
      }
      if (node.kind === 'condition') {
        for (const port of geometry.outputs) {
          ports.append(portRow(port));
        }
      }

      const input = ownerDocument.createElement('span');
      input.className = 'designer-blueprint-canvas-port designer-blueprint-canvas-port-in';
      input.dataset.nodeId = node.id;
      input.dataset.armed = String(armed !== null && typeCanReceive(armed));
      input.style.top = `${geometry.inputY}px`;
      input.setAttribute('role', 'button');
      input.setAttribute('tabindex', '0');
      input.setAttribute('aria-label', text.inputPort);
      input.addEventListener('pointerdown', (event) => onInputPointerDown(event));
      input.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && armed !== null) {
          event.preventDefault();
          event.stopPropagation();
          completeConnection(armed.nodeId, armed.handle, input);
          armed = null;
        }
      });

      card.append(header, content, ports);
      if (geometry.inputHandle !== undefined) {
        input.dataset.inputHandle = geometry.inputHandle;
        card.append(input);
      }
      for (const port of geometry.outputs) {
        const output = ownerDocument.createElement('span');
        output.className = 'designer-blueprint-canvas-port designer-blueprint-canvas-port-out';
        output.dataset.outputHandle = port.handle;
        output.dataset.nodeId = node.id;
        output.dataset.available = String(port.available);
        if (port.dependency === true) output.dataset.dependency = 'true';
        output.style.top = `${port.y}px`;
        output.setAttribute('role', 'button');
        output.setAttribute('tabindex', '0');
        const portLabel = `${port.label}`;
        output.setAttribute(
          'aria-label',
          port.available ? portLabel : text.portUnavailableAria(portLabel),
        );
        if (!port.available) {
          output.setAttribute('aria-disabled', 'true');
          output.setAttribute(
            'data-tip',
            port.requiredCapability === undefined
              ? text.portUnavailable
              : text.portUnavailableCapability(port.requiredCapability),
          );
        }
        if (port.dependency === true) {
          output.setAttribute('aria-disabled', 'true');
        } else {
          output.addEventListener('pointerdown', (event) => onPortPointerDown(event, node, port));
          output.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            if (!port.available) {
              setStatus(text.statusPortUnavailable, 'error');
              return;
            }
            armed = { nodeId: node.id, handle: port.handle };
            renderGraph();
          });
        }
        card.append(output);
      }

      card.addEventListener('pointerdown', (event) => onNodePointerDown(event, node));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select({ kind: 'node', id: node.id });
        }
      });
      layers.append(card);
    }
  }

  function portRow(port: CanvasPort): HTMLElement {
    const row = ownerDocument.createElement('div');
    row.className = 'designer-blueprint-canvas-port-row';
    row.dataset.available = String(port.available);
    if (port.dependency === true) row.dataset.dependency = 'true';
    row.textContent = port.label;
    return row;
  }

  function typeCanReceive(source: ArmedSource): boolean {
    const sourceNode = nodeById(source.nodeId);
    return sourceNode !== undefined;
  }

  function nodeTitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') return node.componentName ?? node.componentId ?? node.id;
    if (node.kind === 'variable') return node.variableName ?? node.variableId ?? node.id;
    return node.summary?.primary ?? node.id;
  }

  function nodeSubtitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') {
      const events = node.events?.length ?? 0;
      return text.nodeEventSummary(node.materialType ?? 'material', events);
    }
    if (node.kind === 'variable') {
      const value =
        node.variableInitialValue === undefined ? '' : ` = ${shortJson(node.variableInitialValue)}`;
      return `${node.variableType ?? 'variable'}${value}`;
    }
    if (node.kind === 'condition') return node.condition?.operator ?? 'condition';
    return node.action?.type ?? node.summary?.kind ?? 'action';
  }

  function shortJson(value: unknown): string {
    try {
      const textValue = JSON.stringify(value);
      return textValue !== undefined && textValue.length > 22
        ? `${textValue.slice(0, 21)}…`
        : (textValue ?? '…');
    } catch {
      return '…';
    }
  }

  function renderBar(): void {
    const current = graph();
    const diagnostics = state?.diagnostics ?? [];
    const errors = diagnostics.filter((item) => item.severity === 'error');
    problemsButton.dataset.state = errors.length === 0 ? 'ok' : 'error';
    problemsLabel.textContent =
      errors.length === 0 ? text.validationPassed : text.validationFailed(errors.length);
    problemsButton.setAttribute('aria-label', text.validationAria(errors.length));
    problemsButton.setAttribute('aria-expanded', String(problemsOpen));
    layoutButton.disabled = (current?.nodes.length ?? 0) === 0;
    traceButton.setAttribute('aria-pressed', String(traceVisible));
    traceButton.dataset.active = String(traceVisible);
    simulateButton.setAttribute('aria-expanded', String(simulationOpen));
    simulateButton.dataset.active = String(simulationOpen);
    simulationBar.hidden = simulationOpen;
    simulation.hidden = !simulationOpen;
    root.dataset.simulation = simulationOpen ? 'open' : 'closed';
    const traceLines = state?.trace?.lines ?? [];
    simulationBarLabel.textContent =
      traceLines.length > 0 ? (traceLines.at(-1) ?? text.simulationIdle) : text.simulationIdle;
  }

  function renderEmpty(): void {
    const empty = (graph()?.nodes.length ?? 0) === 0;
    emptyCard.hidden = !empty;
    if (empty) layoutButton.disabled = true;
  }

  function renderNoEvents(): void {
    const current = graph();
    const hasSource =
      current?.nodes.some((node) => node.kind === 'component' || node.kind === 'variable') ?? false;
    const hasAvailableEvent =
      current?.nodes.some((node) => (node.events ?? []).some((event) => event.available)) ?? false;
    noEvents.hidden = !(hasSource && !hasAvailableEvent);
  }

  function renderProblems(): void {
    const diagnostics = state?.diagnostics ?? [];
    problems.replaceChildren();
    const header = ownerDocument.createElement('header');
    const title = ownerDocument.createElement('strong');
    title.textContent = blueprintText.problemsTitle;
    const close = panelIconButton(
      ownerDocument,
      'close',
      blueprintText.problemsTitle,
      'problems-close',
    );
    header.append(title, close);
    const list = ownerDocument.createElement('ul');
    if (diagnostics.length === 0) {
      const empty = ownerDocument.createElement('li');
      empty.textContent = text.problemsEmpty;
      list.append(empty);
    } else {
      for (const diagnostic of diagnostics) {
        const item = ownerDocument.createElement('li');
        item.dataset.severity = diagnostic.severity;
        const message = ownerDocument.createElement('span');
        message.textContent = diagnostic.message;
        const code = ownerDocument.createElement('code');
        code.textContent = diagnostic.code;
        item.append(message, code);
        list.append(item);
      }
    }
    problems.append(header, list);
    problems.hidden = !problemsOpen;
    problemsButton.setAttribute('aria-expanded', String(problemsOpen));
  }

  function renderSimulationOptions(): void {
    const previous = eventSelect.value;
    const options: { value: string; label: string }[] = [];
    for (const node of graph()?.nodes ?? []) {
      if (node.kind !== 'component' && node.kind !== 'variable') continue;
      for (const event of node.events ?? []) {
        if (!event.available) continue;
        options.push({
          value: JSON.stringify({
            componentId: node.componentId ?? node.variableId ?? node.id,
            eventName: event.name,
          }),
          label: `${nodeTitle(node)} · ${event.name}`,
        });
      }
    }
    eventSelect.replaceChildren();
    if (options.length === 0) {
      const option = ownerDocument.createElement('option');
      option.textContent = text.simulationNoEvent;
      option.value = '';
      eventSelect.append(option);
      eventSelect.disabled = true;
      runButton.disabled = true;
      return;
    }
    for (const option of options) {
      const element = ownerDocument.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      eventSelect.append(element);
    }
    eventSelect.disabled = false;
    if (options.some((option) => option.value === previous)) {
      eventSelect.value = previous;
    } else if (previous !== '') {
      eventSelect.value = options[0]?.value ?? '';
    }
    runButton.disabled = eventSelect.value === '';
  }

  function renderSimulation(): void {
    renderSimulationOptions();
    const trace = state?.trace;
    const failed = (trace?.failedRuleIds.length ?? 0) > 0;
    const rejected =
      state?.lastCommand?.commandId === lastRunCommandId && state.lastCommand.status === 'rejected';
    if (trace === null || (trace?.lines.length ?? 0) === 0) {
      simulationStatus.textContent = rejected
        ? `${text.simulationRejected} · ${
            state?.lastCommand?.diagnostics.map((item) => item.message).join('；') ||
            blueprintText.invalidCommand
          }`
        : text.simulationIdle;
      simulationStatus.dataset.tone = 'idle';
    } else {
      simulationStatus.textContent = failed ? text.simulationFailed : text.simulationSuccess;
      simulationStatus.dataset.tone = failed ? 'error' : 'success';
    }
    traceList.replaceChildren();
    traceEmpty.hidden = (trace?.lines.length ?? 0) > 0;
    for (const line of trace?.lines ?? []) {
      const item = ownerDocument.createElement('li');
      item.textContent = line;
      traceList.append(item);
    }
  }

  function render(): void {
    renderBar();
    renderEmpty();
    renderNoEvents();
    renderProblems();
    renderSimulation();
    applyTransform();
    renderGraph();
  }

  function select(selection: BaseScreenBlueprintCanvasSelection): void {
    sendCommand({ type: 'select', selection });
  }

  function onNodePointerDown(event: PointerEvent, node: BaseScreenBlueprintCanvasNode): void {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-output-handle], [data-input-handle], [data-canvas-menu]') != null) {
      return;
    }
    event.stopPropagation();
    const position = positionOf(node);
    drag = {
      nodeId: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    view?.addEventListener('pointermove', onNodePointerMove);
    view?.addEventListener('pointerup', onNodePointerUp);
    view?.addEventListener('pointercancel', onNodePointerUp);
  }

  function onNodePointerMove(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startClientX) / viewportValue.zoom;
    const dy = (event.clientY - drag.startClientY) / viewportValue.zoom;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    const next = { x: snap(drag.startX + dx), y: snap(drag.startY + dy) };
    positions.set(drag.nodeId, next);
    const card = layers.querySelector<HTMLElement>(`[data-node-id="${cssEscape(drag.nodeId)}"]`);
    if (card !== null) {
      card.style.left = `${next.x}px`;
      card.style.top = `${next.y}px`;
    }
    renderEdgesOnly();
  }

  function onNodePointerUp(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    view?.removeEventListener('pointermove', onNodePointerMove);
    view?.removeEventListener('pointerup', onNodePointerUp);
    view?.removeEventListener('pointercancel', onNodePointerUp);
    if (!finished.moved) {
      select({ kind: 'node', id: finished.nodeId });
      return;
    }
    commitLayout();
  }

  function renderEdgesOnly(): void {
    const current = graph();
    if (current === null) return;
    edges.replaceChildren();
    for (const edge of current.edges) {
      const pathData = edgePath(edge);
      if (pathData === null) continue;
      const path = ownerDocument.createElementNS(SVG_NS, 'path');
      path.classList.add('designer-blueprint-canvas-edge');
      path.setAttribute('d', pathData);
      path.dataset.kind = edge.kind;
      edges.append(path);
    }
  }

  function onPortPointerDown(
    event: PointerEvent,
    node: BaseScreenBlueprintCanvasNode,
    port: CanvasPort,
  ): void {
    event.stopPropagation();
    event.preventDefault();
    if (!port.available) {
      setStatus(text.statusPortUnavailable, 'error');
      return;
    }
    link = {
      nodeId: node.id,
      handle: port.handle,
      pointerId: event.pointerId,
      target: null,
    };
    const rect = viewport.getBoundingClientRect();
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    preview.setAttribute('d', `M ${start.x} ${start.y} L ${start.x} ${start.y}`);
    preview.setAttribute('visibility', 'visible');
    preview.dataset.startX = String(start.x);
    preview.dataset.startY = String(start.y);
    viewport.dataset.linking = 'true';
    view?.addEventListener('pointermove', onLinkPointerMove);
    view?.addEventListener('pointerup', onLinkPointerUp);
    view?.addEventListener('pointercancel', onLinkPointerUp);
  }

  function onLinkPointerMove(event: PointerEvent): void {
    if (link === null || event.pointerId !== link.pointerId) return;
    const startX = Number(preview.dataset.startX ?? '0');
    const startY = Number(preview.dataset.startY ?? '0');
    const rect = viewport.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    preview.setAttribute('d', `M ${startX} ${startY} L ${point.x} ${point.y}`);
    const hit = inputAt(event.clientX, event.clientY);
    link = { ...link, target: hit };
    for (const port of viewport.querySelectorAll<HTMLElement>('[data-input-handle]')) {
      port.dataset.hover = String(hit !== null && port === hit);
    }
  }

  function onLinkPointerUp(event: PointerEvent): void {
    if (link === null || event.pointerId !== link.pointerId) return;
    const finished = link;
    link = null;
    preview.setAttribute('visibility', 'hidden');
    viewport.dataset.linking = 'false';
    view?.removeEventListener('pointermove', onLinkPointerMove);
    view?.removeEventListener('pointerup', onLinkPointerUp);
    view?.removeEventListener('pointercancel', onLinkPointerUp);
    for (const port of viewport.querySelectorAll<HTMLElement>('[data-input-handle]')) {
      port.dataset.hover = 'false';
    }
    const hit = inputAt(event.clientX, event.clientY) ?? finished.target;
    if (hit !== null) {
      completeConnection(finished.nodeId, finished.handle, hit);
      return;
    }
    armed = { nodeId: finished.nodeId, handle: finished.handle };
    setStatus(text.statusArmed);
    renderGraph();
  }

  function onInputPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    if (armed === null) return;
    event.preventDefault();
    completeConnection(armed.nodeId, armed.handle, event.currentTarget as Element);
    armed = null;
  }

  function completeConnection(sourceNodeId: string, sourceHandle: string, target: Element): void {
    const input = target.closest<HTMLElement>('[data-input-handle]');
    if (input === null) return;
    const targetNodeId = input.dataset.nodeId;
    const targetHandle = input.dataset.inputHandle;
    if (targetNodeId === undefined || targetHandle === undefined) return;
    if (targetNodeId === sourceNodeId) {
      setStatus(text.statusSameNode, 'error');
      return;
    }
    sendCommand({
      type: 'connect',
      sourceNodeId,
      sourceHandle,
      targetNodeId,
      targetHandle,
    });
    armed = null;
    renderGraph();
  }

  function inputAt(clientX: number, clientY: number): Element | null {
    const rootNode = root.getRootNode() as Document | ShadowRoot;
    const elementFromPoint = rootNode.elementFromPoint?.bind(rootNode);
    const element = elementFromPoint?.(clientX, clientY) ?? null;
    return element?.closest('[data-input-handle]') ?? null;
  }

  function commitLayout(): void {
    const current = graph();
    if (current === null) return;
    const nodes = current.nodes.map((node) => {
      const position = positionOf(node);
      return {
        id: node.id,
        x: Math.round(position.x),
        y: Math.round(position.y),
        ...(node.collapsed === true ? { collapsed: true } : {}),
      };
    });
    sessionLayout = false;
    lastSentViewportKey = viewportKey(viewportValue);
    sendCommand({
      type: 'commit-layout',
      nodes,
      viewport: {
        x: Math.round(viewportValue.x),
        y: Math.round(viewportValue.y),
        zoom: Math.round(viewportValue.zoom * 1000) / 1000,
      },
    });
  }

  function onBackgroundPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.designer-blueprint-canvas-node, [data-edge-id]') != null) return;
    if (
      target?.closest(
        '[data-canvas-empty], [data-canvas-simulation], [data-canvas-simulation-bar], [data-canvas-problems], [data-canvas-no-events]',
      ) != null
    ) {
      return;
    }
    armed = null;
    pan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewportValue.x,
      startY: viewportValue.y,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    view?.addEventListener('pointermove', onPanPointerMove);
    view?.addEventListener('pointerup', onPanPointerUp);
    view?.addEventListener('pointercancel', onPanPointerUp);
  }

  function onPanPointerMove(event: PointerEvent): void {
    if (pan === null || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.startClientX;
    const dy = event.clientY - pan.startClientY;
    if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    pan = { ...pan, moved: true };
    viewportValue = { ...viewportValue, x: pan.startX + dx, y: pan.startY + dy };
    viewportsDirty = true;
    applyTransform();
  }

  function onPanPointerUp(event: PointerEvent): void {
    if (pan === null || event.pointerId !== pan.pointerId) return;
    const finished = pan;
    pan = null;
    view?.removeEventListener('pointermove', onPanPointerMove);
    view?.removeEventListener('pointerup', onPanPointerUp);
    view?.removeEventListener('pointercancel', onPanPointerUp);
    if (finished.moved) commitViewport();
    else select(null);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.0015);
      const next = clampZoom(viewportValue.zoom * factor);
      const point = screenToGraph(event.clientX, event.clientY);
      const rect = viewport.getBoundingClientRect();
      viewportValue = {
        zoom: next,
        x: event.clientX - rect.left - point.x * next,
        y: event.clientY - rect.top - point.y * next,
      };
    } else {
      viewportValue = {
        ...viewportValue,
        x: viewportValue.x - event.deltaX,
        y: viewportValue.y - event.deltaY,
      };
    }
    applyTransform();
    scheduleViewportCommit();
  }

  function clampZoom(value: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000));
  }

  function stepZoom(direction: 1 | -1): void {
    const current = viewportValue.zoom;
    const next =
      direction > 0
        ? (ZOOM_STEPS.find((step) => step > current + 0.001) ?? ZOOM_MAX)
        : ([...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? ZOOM_MIN);
    zoomTo(clampZoom(next));
  }

  function zoomTo(next: number): void {
    const rect = viewport.getBoundingClientRect();
    const centerX = (rect.width / 2 - viewportValue.x) / viewportValue.zoom;
    const centerY = (rect.height / 2 - viewportValue.y) / viewportValue.zoom;
    viewportValue = {
      zoom: next,
      x: rect.width / 2 - centerX * next,
      y: rect.height / 2 - centerY * next,
    };
    applyTransform();
    commitViewport();
  }

  function fitView(
    targets?: readonly BaseScreenBlueprintCanvasNode[],
    commit = true,
    extraBottom = 0,
  ): void {
    const current = graph();
    if (current === null) return;
    const nodes = targets ?? current.nodes;
    if (nodes.length === 0) {
      viewportValue = { x: 0, y: 0, zoom: 1 };
      applyTransform();
      if (commit) commitViewport();
      return;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      const position = positionOf(node);
      const geometry = geometryOf(node);
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + geometry.width);
      maxY = Math.max(maxY, position.y + geometry.height);
    }
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const availableWidth = Math.max(1, rect.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, rect.height - FIT_PADDING * 2 - extraBottom);
    const zoom = clampZoom(Math.min(1.15, availableWidth / width, availableHeight / height));
    viewportValue = {
      zoom,
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - extraBottom - height * zoom) / 2 - minY * zoom,
    };
    applyTransform();
    if (commit) commitViewport();
  }

  function autoLayout(): void {
    const current = graph();
    if (current === null || current.nodes.length === 0) return;
    positions = computeAutoLayout(current.nodes);
    sessionLayout = false;
    renderGraph();
    fitView(undefined, false, simulationOpen ? SIMULATION_INSET : 0);
    commitLayout();
    setStatus(text.statusLayoutApplied);
  }

  function computeAutoLayout(nodes: readonly BaseScreenBlueprintCanvasNode[]): Map<string, Point> {
    const current = graph();
    if (current === null) return new Map();
    const depths = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    for (const edge of current.edges) {
      if (edge.kind === 'dependency') continue;
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    }
    const visit = (id: string, depth: number, stack: Set<string>): void => {
      if (stack.has(id)) return;
      const known = depths.get(id);
      if (known !== undefined && known >= depth) return;
      depths.set(id, depth);
      const nextStack = new Set(stack).add(id);
      for (const target of outgoing.get(id) ?? []) visit(target, depth + 1, nextStack);
    };
    for (const node of nodes) {
      if ((outgoing.get(node.id) ?? []).length > 0) visit(node.id, 0, new Set());
    }
    const columns = new Map<number, BaseScreenBlueprintCanvasNode[]>();
    for (const node of nodes) {
      const fallback =
        node.kind === 'component' || node.kind === 'variable'
          ? 0
          : node.kind === 'condition'
            ? 1
            : 2;
      const depth = depths.get(node.id) ?? fallback;
      columns.set(depth, [...(columns.get(depth) ?? []), node]);
    }
    const next = new Map<string, Point>();
    for (const [depth, column] of [...columns.entries()].sort(
      (left, right) => left[0] - right[0],
    )) {
      column.sort((left, right) => {
        const leftPosition = positionOf(left);
        const rightPosition = positionOf(right);
        return leftPosition.y - rightPosition.y || left.id.localeCompare(right.id);
      });
      column.forEach((node, index) => {
        next.set(node.id, {
          x: 72 + depth * 280,
          y: 72 + index * 140,
        });
      });
    }
    return next;
  }

  function columnOf(node: BaseScreenBlueprintCanvasNode | undefined): number {
    if (node === undefined) return 0;
    return node.kind === 'component' || node.kind === 'variable'
      ? 0
      : node.kind === 'condition'
        ? 1
        : 2;
  }

  function placeNewNode(node: BaseScreenBlueprintCanvasNode | undefined): Point {
    const column = columnOf(node);
    let bottom = 0;
    for (const candidate of graph()?.nodes ?? []) {
      if (candidate.id === node?.id || columnOf(candidate) !== column) continue;
      const position = positionOf(candidate);
      bottom = Math.max(bottom, position.y + geometryOf(candidate).height);
    }
    return {
      x: 72 + column * 280,
      y: bottom === 0 ? 72 : bottom + 48,
    };
  }

  function scheduleInitialFit(): void {
    pendingInitialFit = true;
    const frame =
      view?.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0));
    frame(() => {
      if (!pendingInitialFit || destroyed) return;
      const current = graph();
      if (current === null || current.nodes.length === 0) return;
      const rect = viewport.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pendingInitialFit = false;
      initialFitDone = true;
      fitView(current.nodes, false, simulationOpen ? SIMULATION_INSET : 0);
    });
  }

  function onInsert(kind: 'condition' | 'set-variable' | 'emit-host-event'): void {
    const rect = viewport.getBoundingClientRect();
    const point = screenToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    sendCommand({
      type: 'insert-node',
      kind,
      position: { x: snap(point.x), y: snap(point.y) },
    });
    closeMenu();
  }

  function runSimulation(): void {
    if (eventSelect.value === '') {
      setStatus(text.statusNoSimulationEvent, 'error');
      return;
    }
    let trigger: { componentId?: unknown; eventName?: unknown };
    try {
      trigger = JSON.parse(eventSelect.value) as { componentId?: unknown; eventName?: unknown };
    } catch {
      setStatus(text.statusSimulationEventStale, 'error');
      return;
    }
    if (typeof trigger.componentId !== 'string' || typeof trigger.eventName !== 'string') return;
    let payload: unknown;
    try {
      payload = JSON.parse(payloadInput.value);
    } catch {
      setStatus(text.statusSimulationPayloadInvalid, 'error');
      return;
    }
    const command = sendCommand({
      type: 'run-simulation',
      componentId: trigger.componentId,
      eventName: trigger.eventName,
      payload: payload as never,
    });
    if (command !== undefined) lastRunCommandId = command.commandId;
  }

  function onDrop(event: DragEvent): void {
    const transfer = event.dataTransfer;
    if (transfer === null) return;
    const raw = transfer.getData(BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME);
    if (raw === '') return;
    event.preventDefault();
    let payload: BaseScreenBlueprintCanvasInsertNode;
    try {
      payload = JSON.parse(raw) as BaseScreenBlueprintCanvasInsertNode;
    } catch {
      setStatus(text.statusDropInvalid, 'error');
      return;
    }
    const point = screenToGraph(event.clientX, event.clientY);
    sendCommand({
      ...payload,
      type: 'insert-node',
      position: { x: snap(point.x), y: snap(point.y) },
    } as CommandInput);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (menuOpen) {
        closeMenu();
        return;
      }
      if (problemsOpen) {
        problemsOpen = false;
        renderProblems();
        return;
      }
      if (simulationOpen) {
        closeSimulation();
        fitView(undefined, false);
        return;
      }
      if (armed !== null) {
        armed = null;
        renderGraph();
        return;
      }
      if (state?.selection !== null && state?.selection !== undefined) {
        select(null);
        return;
      }
      return;
    }
    if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      fitView(undefined, true, simulationOpen ? SIMULATION_INSET : 0);
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (state?.selection === null || state?.selection === undefined) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    event.preventDefault();
    sendCommand({ type: 'delete-selection', selection: state.selection });
  }

  function onCanvasState(event: Event): void {
    const detail = (event as CustomEvent<BaseScreenBlueprintCanvasStateEventDetail>).detail;
    if (detail === null || typeof detail !== 'object' || detail.state === undefined) return;
    const next = detail.state;
    const generationChanged = next.generation !== generation;
    state = next;
    if (generationChanged) {
      generation = next.generation;
      readySent = false;
      armed = null;
      viewportValue = next.graph.viewport ?? { x: 0, y: 0, zoom: 1 };
      lastAdoptedViewportKey = viewportKey(viewportValue);
      lastSentViewportKey = '';
      viewportsDirty = false;
      lastEnginePositions = new Map(
        next.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      sessionLayout = next.graph.viewport === undefined;
      positions = sessionLayout
        ? computeAutoLayout(next.graph.nodes)
        : new Map(lastEnginePositions);
      hydrated = next.graph.nodes.length > 0;
      initialFitDone = false;
      pendingInitialFit = false;
      lastRunCommandId = '';
      closeSimulation(false);
      scheduleInitialFit();
    }
    if (!generationChanged) {
      const engineNext = new Map(
        next.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      if (drag === null) {
        if (!hydrated && engineNext.size > 0) {
          sessionLayout = next.graph.viewport === undefined;
          positions = sessionLayout ? computeAutoLayout(next.graph.nodes) : new Map(engineNext);
          hydrated = true;
          scheduleInitialFit();
        } else if (hydrated) {
          for (const [id, position] of engineNext) {
            const previous = lastEnginePositions.get(id);
            if (previous === undefined && sessionLayout) {
              positions.set(
                id,
                placeNewNode(nodeById(id) ?? next.graph.nodes.find((item) => item.id === id)),
              );
            } else if (
              previous === undefined ||
              previous.x !== position.x ||
              previous.y !== position.y
            ) {
              positions.set(id, position);
            }
          }
          for (const id of [...positions.keys()]) {
            if (!engineNext.has(id)) positions.delete(id);
          }
        }
      }
      lastEnginePositions = engineNext;
      if (next.graph.nodes.length === 0) hydrated = false;
    }
    if (!generationChanged) adoptViewport(next.graph.viewport);
    if (next.active && !wasActive && !initialFitDone) scheduleInitialFit();
    wasActive = next.active;
    render();
    if (!readySent) {
      readySent = true;
      sendCommand({ type: 'ready' });
    }
    if (next.viewRequest !== undefined && next.viewRequest.id !== lastFocusRequestId) {
      lastFocusRequestId = next.viewRequest.id;
      focusNode(next.viewRequest.targetId);
    }
  }

  function focusNode(targetId: string): void {
    const node = nodeById(targetId);
    if (node === undefined) return;
    const position = positionOf(node);
    const geometry = geometryOf(node);
    const rect = viewport.getBoundingClientRect();
    viewportValue = {
      ...viewportValue,
      x: rect.width / 2 - (position.x + geometry.width / 2) * viewportValue.zoom,
      y:
        rect.height / 2 -
        (simulationOpen ? SIMULATION_INSET / 2 : 0) -
        (position.y + geometry.height / 2) * viewportValue.zoom,
    };
    applyTransform();
  }

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    addMenu.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    addAnchor.classList.remove('is-open');
  }

  function openMenu(): void {
    menuOpen = true;
    addMenu.hidden = false;
    addButton.setAttribute('aria-expanded', 'true');
    addAnchor.classList.add('is-open');
    (addMenu.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  function openSimulation(): void {
    if (simulationOpen) return;
    simulationOpen = true;
    renderBar();
    renderSimulation();
    eventSelect.focus();
  }

  function closeSimulation(focusBar = true): void {
    if (!simulationOpen) return;
    simulationOpen = false;
    renderBar();
    renderSimulation();
    if (focusBar) simulateButton.focus();
  }

  function toggleProblems(): void {
    problemsOpen = !problemsOpen;
    renderProblems();
  }

  addButton.addEventListener('click', () => {
    if (menuOpen) closeMenu();
    else openMenu();
  });
  bar.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    const insert = target.closest<HTMLElement>('[data-canvas-insert]')?.dataset.canvasInsert;
    if (insert === 'condition' || insert === 'set-variable' || insert === 'emit-host-event') {
      onInsert(insert);
      return;
    }
    const action = target.closest<HTMLElement>('[data-canvas-action]')?.dataset.canvasAction;
    if (action === undefined) return;
    if (action === 'auto-layout') {
      autoLayout();
      return;
    }
    if (action === 'problems') {
      toggleProblems();
      return;
    }
    if (action === 'trace') {
      if (state?.trace === null || state?.trace === undefined) {
        setStatus(text.statusTraceUnavailable);
        return;
      }
      traceVisible = !traceVisible;
      renderBar();
      renderGraph();
      return;
    }
    if (action === 'zoom-in') {
      stepZoom(1);
      return;
    }
    if (action === 'zoom-out') {
      stepZoom(-1);
      return;
    }
    if (action === 'fit') {
      fitView(undefined, true, simulationOpen ? SIMULATION_INSET : 0);
      return;
    }
    if (action === 'simulate') {
      if (simulationOpen) closeSimulation();
      else openSimulation();
    }
  });
  emptyCard.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest<HTMLElement>('[data-canvas-insert]')?.dataset.canvasInsert === 'condition'
    ) {
      onInsert('condition');
    }
  });
  problems.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-action="problems-close"]') !== null) {
      problemsOpen = false;
      renderProblems();
    }
  });
  simulation.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-action="simulation-run"]') !== null) {
      runSimulation();
      return;
    }
    if (target?.closest('[data-canvas-action="simulation-close"]') !== null) {
      closeSimulation();
    }
  });
  simulationExpand.addEventListener('click', openSimulation);
  eventSelect.addEventListener('change', () => {
    runButton.disabled = eventSelect.value === '';
  });

  root.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      menuOpen &&
      target?.closest('[data-canvas-menu]') === null &&
      target?.closest('[data-canvas-action="add-node"]') === null
    ) {
      closeMenu();
    }
    if (
      problemsOpen &&
      target?.closest('[data-canvas-problems]') === null &&
      target?.closest('[data-canvas-action="problems"]') === null
    ) {
      problemsOpen = false;
      renderProblems();
    }
  });
  viewport.addEventListener('pointerdown', onBackgroundPointerDown);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('dragover', (event) => {
    if (
      Array.from(event.dataTransfer?.types ?? []).includes(BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME)
    ) {
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    }
  });
  viewport.addEventListener('drop', onDrop);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, onCanvasState);

  applyTransform();
  renderBar();

  return {
    element: root,
    destroy(): void {
      destroyed = true;
      resizeObserver?.disconnect();
      if (viewportCommitTimer !== undefined) clearTimeout(viewportCommitTimer);
      if (statusTimer !== undefined) clearTimeout(statusTimer);
      view?.removeEventListener('pointermove', onNodePointerMove);
      view?.removeEventListener('pointerup', onNodePointerUp);
      view?.removeEventListener('pointercancel', onNodePointerUp);
      view?.removeEventListener('pointermove', onLinkPointerMove);
      view?.removeEventListener('pointerup', onLinkPointerUp);
      view?.removeEventListener('pointercancel', onLinkPointerUp);
      view?.removeEventListener('pointermove', onPanPointerMove);
      view?.removeEventListener('pointerup', onPanPointerUp);
      view?.removeEventListener('pointercancel', onPanPointerUp);
    },
  };
}

function cssEscape(value: string): string {
  const escape = globalThis.CSS?.escape;
  return typeof escape === 'function' ? escape(value) : value.replace(/["\\]/g, '\\$&');
}

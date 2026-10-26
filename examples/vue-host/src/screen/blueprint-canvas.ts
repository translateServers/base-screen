import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasEdge,
  type BaseScreenBlueprintCanvasGraph,
  type BaseScreenBlueprintCanvasInsertNode,
  type BaseScreenBlueprintCanvasNode,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
} from '@base-screen/sdk/designer';

/**
 * 宿主提供的蓝图中央画布。
 *
 * 引擎拥有语义图、canonical 编辑与 history；这里只做图形与手势：消费
 * `base-screen-blueprint-canvas-state`，发 `base-screen-blueprint-canvas-command`。
 * 协议类型全部来自 `@base-screen/sdk/designer` 公共导出，不额外定义状态通道。
 *
 * 三个前端宿主（vanilla / react / vue）共用本文件，修改时必须逐字同步。
 */

const NODE_WIDTH = 216;
const COMPACT_WIDTH = 200;
const NODE_HEADER = 34;
const PORT_ROW = 22;
const PORT_START = 56;
const GRAPH_PADDING = 72;
const COLUMN_STEP = 280;
const ROW_STEP = 140;

interface CanvasPort {
  readonly handle: string;
  readonly label: string;
  readonly y: number;
  readonly available: boolean;
}

interface NodeGeometry {
  readonly width: number;
  readonly height: number;
  readonly outputs: readonly CanvasPort[];
  readonly inputHandle: string;
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
  readonly startClientX: number;
  readonly startClientY: number;
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

type CommandInput = BaseScreenBlueprintCanvasCommand extends infer Command
  ? Command extends BaseScreenBlueprintCanvasCommand
    ? Omit<Command, 'commandId' | 'generation' | 'documentRevision'>
    : never
  : never;

const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE_TEXT = `
.host-blueprint-canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: #d7e0f0;
  background:
    radial-gradient(circle at 18% 12%, rgba(56, 132, 255, 0.12), transparent 46%),
    linear-gradient(180deg, #101624 0%, #0a0f18 100%);
  font: 12px/1.4 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none;
  overflow: hidden;
}
.host-blueprint-canvas button {
  font: inherit;
  color: inherit;
}
.bp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(120, 158, 220, 0.18);
  background: rgba(9, 14, 24, 0.86);
  z-index: 3;
}
.bp-toolbar-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-right: 6px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.bp-toolbar-title small {
  color: #7f90aa;
  font-weight: 400;
}
.bp-toolbar-spacer { flex: 1 1 auto; }
.bp-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(120, 158, 220, 0.24);
  border-radius: 6px;
  background: rgba(32, 46, 68, 0.72);
  cursor: pointer;
}
.bp-button:hover:not(:disabled) { border-color: rgba(88, 166, 255, 0.65); }
.bp-button:disabled { opacity: 0.42; cursor: default; }
.bp-button[data-tone="primary"] {
  border-color: rgba(88, 166, 255, 0.55);
  background: rgba(30, 96, 180, 0.42);
}
.bp-zoom {
  min-width: 44px;
  text-align: center;
  color: #9fb0c8;
  font-variant-numeric: tabular-nums;
}
.bp-problem-chip {
  border: 1px solid rgba(245, 176, 65, 0.5);
  border-radius: 999px;
  padding: 3px 9px;
  color: #f5b041;
  background: rgba(80, 54, 12, 0.32);
  cursor: pointer;
}
.bp-problem-chip[data-empty="true"] {
  border-color: rgba(94, 201, 138, 0.4);
  color: #67d391;
  background: rgba(16, 68, 42, 0.28);
}
.bp-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.bp-viewport:active { cursor: grabbing; }
.bp-viewport[data-linking="true"] { cursor: crosshair; }
.bp-layers {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  will-change: transform;
}
.bp-edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.bp-edge {
  fill: none;
  stroke: rgba(125, 160, 210, 0.55);
  stroke-width: 1.6;
}
.bp-edge[data-kind="trigger"] { stroke: rgba(88, 166, 255, 0.9); }
.bp-edge[data-kind="action"] { stroke: rgba(94, 201, 138, 0.85); }
.bp-edge[data-kind="dependency"] {
  stroke: rgba(125, 160, 210, 0.38);
  stroke-dasharray: 5 5;
}
.bp-edge[data-traced="true"] { stroke: #f5b041; stroke-width: 2.4; }
.bp-edge[data-selected="true"] { stroke: #ffd166; stroke-width: 2.6; }
.bp-edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}
.bp-edge-label {
  fill: #8fa2bd;
  font-size: 10px;
  paint-order: stroke;
  stroke: #0a0f18;
  stroke-width: 3px;
}
.bp-node {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid rgba(120, 158, 220, 0.3);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(30, 42, 62, 0.96), rgba(20, 29, 44, 0.96));
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  cursor: move;
}
.bp-node:focus-visible {
  outline: 2px solid rgba(88, 166, 255, 0.8);
  outline-offset: 2px;
}
.bp-node[data-selected="true"] {
  border-color: #58a6ff;
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.55), 0 10px 26px rgba(0, 0, 0, 0.34);
}
.bp-node[data-failed="true"] { border-color: rgba(245, 176, 65, 0.8); }
.bp-node-full { cursor: not-allowed; }
.bp-node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: ${NODE_HEADER}px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(120, 158, 220, 0.16);
  overflow: hidden;
  white-space: nowrap;
}
.bp-node-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(88, 166, 255, 0.16);
  color: #7fc0ff;
  font-size: 10px;
  letter-spacing: 0.06em;
}
.bp-node[data-kind="variable"] .bp-node-badge { background: rgba(160, 120, 255, 0.18); color: #c0a4ff; }
.bp-node[data-kind="condition"] .bp-node-badge { background: rgba(245, 176, 65, 0.16); color: #f5c26b; }
.bp-node[data-kind="action"] .bp-node-badge { background: rgba(94, 201, 138, 0.16); color: #74dfa2; }
.bp-node-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.bp-node-body {
  padding: 8px 10px 10px;
}
.bp-node-sub {
  color: #8b9cb6;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-node-summary {
  margin: 8px 0 0;
  color: #c6d3e6;
  font-size: 11px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bp-ports {
  margin-top: 6px;
}
.bp-port-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: ${PORT_ROW}px;
  padding-right: 12px;
  color: #9fb0c8;
  font-size: 10px;
  overflow: hidden;
  white-space: nowrap;
}
.bp-port-row[data-available="false"] { opacity: 0.4; }
.bp-port {
  position: absolute;
  box-sizing: border-box;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  border: 2px solid #0a0f18;
  border-radius: 50%;
  background: #58a6ff;
  cursor: crosshair;
  pointer-events: auto;
}
.bp-port:hover { background: #8ac4ff; }
.bp-port[data-available="false"] { background: #52627a; cursor: not-allowed; }
.bp-port-in {
  left: 0;
  background: #94a3b8;
}
.bp-port-out { right: -5.5px; }
.bp-node[data-kind="condition"] .bp-port-out { background: #f5b041; }
.bp-port-in[data-armed="true"] {
  background: #67d391;
  box-shadow: 0 0 0 3px rgba(103, 211, 145, 0.35);
}
.bp-link-preview {
  fill: none;
  stroke: #58a6ff;
  stroke-width: 2;
  stroke-dasharray: 4 4;
  pointer-events: none;
}
.bp-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.bp-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-top: 1px solid rgba(120, 158, 220, 0.18);
  background: rgba(9, 14, 24, 0.9);
  color: #8b9cb6;
  z-index: 3;
}
.bp-footer select,
.bp-footer input {
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(120, 158, 220, 0.24);
  border-radius: 5px;
  background: rgba(20, 29, 44, 0.9);
  color: #d7e0f0;
  font: inherit;
}
.bp-footer input { width: 220px; }
.bp-footer-status {
  flex: 1 1 180px;
  min-width: 120px;
  color: #9fb0c8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-footer-status[data-tone="error"] { color: #ff8b8b; }
.bp-trace {
  flex-basis: 100%;
  color: #f5b041;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-problems {
  position: absolute;
  top: 44px;
  right: 12px;
  z-index: 5;
  width: min(360px, calc(100% - 24px));
  max-height: 46%;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid rgba(245, 176, 65, 0.4);
  border-radius: 8px;
  background: rgba(16, 21, 32, 0.98);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
}
.bp-problems[hidden] { display: none; }
.bp-problems h4 {
  margin: 0 0 6px;
  font-size: 11px;
  color: #f5b041;
}
.bp-problems ul {
  margin: 0;
  padding-left: 16px;
}
.bp-problems li {
  margin: 3px 0;
  color: #c6d3e6;
  font-size: 11px;
}
.bp-problems code {
  color: #8b9cb6;
  font-size: 10px;
}
`;

export function createBlueprintCanvas(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'host-blueprint-canvas';
  root.slot = BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT;
  root.dataset.hostBlueprintCanvas = 'true';
  root.tabIndex = 0;

  const style = document.createElement('style');
  style.textContent = STYLE_TEXT;

  const toolbar = document.createElement('div');
  toolbar.className = 'bp-toolbar';
  toolbar.innerHTML = `
    <span class="bp-toolbar-title">事件编排 <small data-bp-counts></small></span>
    <button type="button" class="bp-button" data-bp-insert="condition">条件</button>
    <button type="button" class="bp-button" data-bp-insert="set-variable">设置变量</button>
    <button type="button" class="bp-button" data-bp-insert="emit-host-event">触发业务事件</button>
    <button type="button" class="bp-button" data-bp-undo disabled>撤销</button>
    <button type="button" class="bp-button" data-bp-redo disabled>重做</button>
    <button type="button" class="bp-button" data-bp-layout>自动布局</button>
    <button type="button" class="bp-button" data-bp-fit>适应画布</button>
    <span class="bp-toolbar-spacer"></span>
    <button type="button" class="bp-button" data-bp-zoom-out aria-label="缩小">−</button>
    <span class="bp-zoom" data-bp-zoom>100%</span>
    <button type="button" class="bp-button" data-bp-zoom-in aria-label="放大">＋</button>
    <button type="button" class="bp-problem-chip" data-bp-problems data-empty="true">校验通过</button>
  `;

  const viewport = document.createElement('div');
  viewport.className = 'bp-viewport';
  viewport.dataset.bpViewport = 'true';

  const layers = document.createElement('div');
  layers.className = 'bp-layers';
  const edges = document.createElementNS(SVG_NS, 'svg');
  edges.classList.add('bp-edges');
  layers.append(edges);
  viewport.append(layers);

  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.classList.add('bp-overlay');
  const preview = document.createElementNS(SVG_NS, 'path');
  preview.classList.add('bp-link-preview');
  preview.setAttribute('visibility', 'hidden');
  overlay.append(preview);
  viewport.append(overlay);

  const problems = document.createElement('div');
  problems.className = 'bp-problems';
  problems.hidden = true;

  const footer = document.createElement('div');
  footer.className = 'bp-footer';
  footer.innerHTML = `
    <label>模拟事件
      <select data-bp-sim-event></select>
    </label>
    <label>负载
      <input type="text" data-bp-sim-payload value="{}" spellcheck="false">
    </label>
    <button type="button" class="bp-button" data-bp-sim-run>试运行</button>
    <span class="bp-footer-status" data-bp-status role="status"></span>
    <span class="bp-trace" data-bp-trace hidden></span>
  `;

  root.append(style, toolbar, viewport, problems, footer);

  let state: BaseScreenBlueprintCanvasState | null = null;
  let generation = -1;
  let readySent = false;
  let positions = new Map<string, Point>();
  let viewportValue = { x: 0, y: 0, zoom: 1 };
  let lastSentViewportKey = '';
  let lastAdoptedViewportKey = '';
  let viewportsDirty = false;
  let viewportCommitTimer: number | undefined;
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

  function graph(): BaseScreenBlueprintCanvasGraph | null {
    return state?.graph ?? null;
  }

  function geometryOf(node: BaseScreenBlueprintCanvasNode): NodeGeometry {
    if (node.kind === 'component' || node.kind === 'variable') {
      const events = node.events ?? [];
      const rows = Math.max(1, events.length);
      const height = PORT_START + rows * PORT_ROW + 8;
      return {
        width: NODE_WIDTH,
        height,
        outputs: events.map((event, index) => ({
          handle: `event:${event.name}`,
          label: event.label === '' ? event.name : event.label,
          y: PORT_START + index * PORT_ROW + PORT_ROW / 2,
          available: event.available,
        })),
        inputHandle: 'dependency:in',
      };
    }
    return {
      width: COMPACT_WIDTH,
      height: 96,
      outputs:
        node.kind === 'condition'
          ? [{ handle: 'condition:true', label: 'true', y: 64, available: true }]
          : [],
      inputHandle: node.kind === 'condition' ? 'condition:in' : 'action:in',
    };
  }

  function positionOf(node: BaseScreenBlueprintCanvasNode): Point {
    return positions.get(node.id) ?? { x: node.x, y: node.y };
  }

  function outputPortY(node: BaseScreenBlueprintCanvasNode, handle: string): number {
    const geometry = geometryOf(node);
    return geometry.outputs.find((port) => port.handle === handle)?.y ?? geometry.height / 2;
  }

  function nodeById(id: string): BaseScreenBlueprintCanvasNode | undefined {
    return graph()?.nodes.find((node) => node.id === id);
  }

  function sendCommand(input: CommandInput): void {
    if (state === null) return;
    commandSequence += 1;
    const command = {
      ...input,
      commandId: `host-blueprint-${Date.now()}-${commandSequence}`,
      generation: state.generation,
      documentRevision: state.documentRevision,
    } as BaseScreenBlueprintCanvasCommand;
    root.dispatchEvent(
      new CustomEvent<BaseScreenBlueprintCanvasCommandEventDetail>(
        BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
        { bubbles: true, composed: true, detail: { command } },
      ),
    );
  }

  function setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    const element = footer.querySelector<HTMLElement>('[data-bp-status]');
    if (element === null) return;
    element.textContent = message;
    element.dataset.tone = tone;
  }

  function viewportKey(value: { x: number; y: number; zoom: number }): string {
    return `${value.x.toFixed(1)}:${value.y.toFixed(1)}:${value.zoom.toFixed(3)}`;
  }

  function applyTransform(): void {
    layers.style.transform = `translate(${viewportValue.x}px, ${viewportValue.y}px) scale(${viewportValue.zoom})`;
    const zoom = toolbar.querySelector<HTMLElement>('[data-bp-zoom]');
    if (zoom !== null) zoom.textContent = `${Math.round(viewportValue.zoom * 100)}%`;
  }

  function scheduleViewportCommit(): void {
    viewportsDirty = true;
    window.clearTimeout(viewportCommitTimer);
    viewportCommitTimer = window.setTimeout(() => {
      viewportCommitTimer = undefined;
      commitViewport();
    }, 280);
  }

  function commitViewport(): void {
    window.clearTimeout(viewportCommitTimer);
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

  function adoptViewport(next: { x: number; y: number; zoom: number } | undefined): void {
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
    const targetGeometry = geometryOf(target);
    const sourcePosition = positionOf(source);
    const targetPosition = positionOf(target);
    const x1 = sourcePosition.x + sourceGeometry.width;
    const y1 = sourcePosition.y + outputPortY(source, edge.sourceHandle);
    const x2 = targetPosition.x;
    const y2 = targetPosition.y + targetGeometry.height / 2;
    const offset = Math.max(56, Math.abs(x2 - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
  }

  function edgeLabel(edge: BaseScreenBlueprintCanvasEdge): string {
    if (edge.kind === 'dependency') return '';
    if (edge.kind === 'trigger') {
      return edge.sourceHandle.startsWith('event:') ? edge.sourceHandle.slice(6) : 'true';
    }
    return edge.operation ?? '';
  }

  function renderGraph(): void {
    const current = graph();
    edges.replaceChildren();
    for (const node of layers.querySelectorAll('.bp-node')) node.remove();
    if (current === null) return;

    const traced = new Set(state?.trace?.executedEdgeIds ?? []);
    for (const edge of current.edges) {
      const pathData = edgePath(edge);
      if (pathData === null) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.classList.add('bp-edge');
      path.setAttribute('d', pathData);
      path.dataset.kind = edge.kind;
      if (traced.has(edge.id)) path.dataset.traced = 'true';
      if (state?.selection?.kind === 'edge' && state.selection.id === edge.id) {
        path.dataset.selected = 'true';
      }
      edges.append(path);

      const hit = document.createElementNS(SVG_NS, 'path');
      hit.classList.add('bp-edge-hit');
      hit.setAttribute('d', pathData);
      hit.dataset.edgeId = edge.id;
      hit.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        select({ kind: 'edge', id: edge.id });
      });
      edges.append(hit);

      const label = edgeLabel(edge);
      if (label !== '') {
        const text = document.createElementNS(SVG_NS, 'text');
        text.classList.add('bp-edge-label');
        const sourceNode = nodeById(edge.source);
        const targetNode = nodeById(edge.target);
        if (sourceNode !== undefined && targetNode !== undefined) {
          const sourcePosition = positionOf(sourceNode);
          const targetPosition = positionOf(targetNode);
          const sourceGeometry = geometryOf(sourceNode);
          text.setAttribute('x', String(sourcePosition.x + sourceGeometry.width + 16));
          text.setAttribute(
            'y',
            String(sourcePosition.y + outputPortY(sourceNode, edge.sourceHandle) - 4),
          );
          if (targetPosition.x < sourcePosition.x) text.setAttribute('visibility', 'hidden');
        }
        text.textContent = label;
        edges.append(text);
      }
    }

    const failedRules = new Set(state?.trace?.failedRuleIds ?? []);
    for (const node of current.nodes) {
      const geometry = geometryOf(node);
      const position = positionOf(node);
      const card = document.createElement('div');
      card.className = 'bp-node';
      card.dataset.nodeId = node.id;
      card.dataset.kind = node.kind;
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
      card.style.width = `${geometry.width}px`;
      card.style.height = `${geometry.height}px`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${nodeKindLabel(node)} ${nodeTitle(node)}`);
      if (state?.selection?.kind === 'node' && state.selection.id === node.id) {
        card.dataset.selected = 'true';
      }
      if (node.ruleId !== undefined && failedRules.has(node.ruleId)) {
        card.dataset.failed = 'true';
      }
      const header = document.createElement('div');
      header.className = 'bp-node-header';
      const badge = document.createElement('span');
      badge.className = 'bp-node-badge';
      badge.textContent = nodeKindBadge(node);
      const title = document.createElement('span');
      title.className = 'bp-node-title';
      title.textContent = nodeTitle(node);
      header.append(badge, title);

      const body = document.createElement('div');
      body.className = 'bp-node-body';
      const sub = document.createElement('div');
      sub.className = 'bp-node-sub';
      sub.textContent = nodeSubtitle(node);
      body.append(sub);
      if (node.summary?.secondary !== undefined && node.summary.secondary !== '') {
        const summary = document.createElement('p');
        summary.className = 'bp-node-summary';
        summary.textContent = node.summary.secondary;
        body.append(summary);
      }
      if (node.kind === 'component' || node.kind === 'variable') {
        const ports = document.createElement('div');
        ports.className = 'bp-ports';
        const events = node.events ?? [];
        if (events.length === 0) {
          const row = document.createElement('div');
          row.className = 'bp-port-row';
          row.dataset.available = 'false';
          row.textContent = '暂无可用事件';
          ports.append(row);
        }
        for (const port of geometry.outputs) {
          const row = document.createElement('div');
          row.className = 'bp-port-row';
          row.dataset.available = String(port.available);
          row.textContent = port.label;
          ports.append(row);
        }
        body.append(ports);
      }
      card.append(header, body);

      const input = document.createElement('span');
      input.className = 'bp-port bp-port-in';
      input.dataset.inputHandle = geometry.inputHandle;
      input.dataset.nodeId = node.id;
      input.dataset.armed = String(armed !== null && typeCanReceive(armed, geometry.inputHandle));
      input.style.top = `${geometry.height / 2}px`;
      input.setAttribute('aria-label', '输入端口');
      card.append(input);

      for (const port of geometry.outputs) {
        const output = document.createElement('span');
        output.className = 'bp-port bp-port-out';
        output.dataset.outputHandle = port.handle;
        output.dataset.nodeId = node.id;
        output.dataset.available = String(port.available);
        output.style.top = `${port.y}px`;
        output.setAttribute('aria-label', port.label);
        card.append(output);
      }

      card.addEventListener('pointerdown', (event) => onNodePointerDown(event, node));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select({ kind: 'node', id: node.id });
        }
      });
      card.querySelectorAll<HTMLElement>('[data-output-handle]').forEach((portElement) => {
        portElement.addEventListener('pointerdown', (event) => onPortPointerDown(event, node));
      });
      input.addEventListener('pointerdown', (event) =>
        onInputPointerDown(event, node, geometry.inputHandle),
      );
      layers.append(card);
    }
  }

  function typeCanReceive(source: ArmedSource, inputHandle: string): boolean {
    const sourceNode = nodeById(source.nodeId);
    if (sourceNode === undefined) return false;
    if (sourceNode.kind === 'condition') return inputHandle === 'action:in';
    if (sourceNode.kind === 'component' || sourceNode.kind === 'variable') {
      return inputHandle === 'condition:in' || inputHandle === 'action:in';
    }
    return false;
  }

  function nodeKindLabel(node: BaseScreenBlueprintCanvasNode): string {
    return node.kind === 'component'
      ? '组件'
      : node.kind === 'variable'
        ? '变量'
        : node.kind === 'condition'
          ? '条件'
          : '动作';
  }

  function nodeKindBadge(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'action') return node.summary?.kind ?? 'action';
    return nodeKindLabel(node);
  }

  function nodeTitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') return node.componentName ?? node.componentId ?? node.id;
    if (node.kind === 'variable') return node.variableName ?? node.variableId ?? node.id;
    return node.summary?.primary ?? node.id;
  }

  function nodeSubtitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') {
      const events = node.events?.length ?? 0;
      return `${node.materialType ?? 'material'} · ${events} 个事件`;
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
      const text = JSON.stringify(value);
      return text.length > 22 ? `${text.slice(0, 21)}…` : text;
    } catch {
      return '…';
    }
  }

  function renderChrome(): void {
    const current = graph();
    const counts = toolbar.querySelector<HTMLElement>('[data-bp-counts]');
    if (counts !== null) {
      counts.textContent =
        current === null ? '未连接' : `${current.nodes.length} 节点 · ${current.edges.length} 连线`;
    }
    const undo = toolbar.querySelector<HTMLButtonElement>('[data-bp-undo]');
    const redo = toolbar.querySelector<HTMLButtonElement>('[data-bp-redo]');
    if (undo !== null) undo.disabled = state?.canUndo !== true;
    if (redo !== null) redo.disabled = state?.canRedo !== true;

    const chip = toolbar.querySelector<HTMLElement>('[data-bp-problems]');
    const diagnostics = state?.diagnostics ?? [];
    if (chip !== null) {
      chip.dataset.empty = String(diagnostics.length === 0);
      chip.textContent = diagnostics.length === 0 ? '校验通过' : `问题 ${diagnostics.length}`;
    }
    renderProblems(diagnostics);
    renderSimulationOptions();
    renderTrace();
  }

  function renderProblems(
    diagnostics: readonly { severity: string; code: string; message: string }[],
  ): void {
    problems.replaceChildren();
    if (diagnostics.length === 0) {
      problems.hidden = true;
      return;
    }
    const title = document.createElement('h4');
    title.textContent = '校验问题';
    const list = document.createElement('ul');
    for (const diagnostic of diagnostics) {
      const item = document.createElement('li');
      item.textContent = diagnostic.message;
      const code = document.createElement('code');
      code.textContent = ` ${diagnostic.code}`;
      item.append(code);
      list.append(item);
    }
    problems.append(title, list);
  }

  function renderSimulationOptions(): void {
    const select = footer.querySelector<HTMLSelectElement>('[data-bp-sim-event]');
    if (select === null || state === null) return;
    const previous = select.value;
    const options: { value: string; label: string }[] = [];
    for (const node of state.graph.nodes) {
      if (node.kind !== 'component' && node.kind !== 'variable') continue;
      for (const event of node.events ?? []) {
        if (!event.available) continue;
        const componentId = node.componentId ?? node.variableId ?? node.id;
        options.push({
          value: JSON.stringify({ componentId, eventName: event.name }),
          label: `${nodeTitle(node)} · ${event.name}`,
        });
      }
    }
    select.replaceChildren();
    if (options.length === 0) {
      const option = document.createElement('option');
      option.textContent = '没有可用事件';
      option.value = '';
      select.append(option);
      return;
    }
    for (const item of options) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.append(option);
    }
    if (options.some((item) => item.value === previous)) select.value = previous;
  }

  function renderTrace(): void {
    const element = footer.querySelector<HTMLElement>('[data-bp-trace]');
    if (element === null) return;
    const trace = state?.trace;
    if (trace === null || trace === undefined || trace.lines.length === 0) {
      element.hidden = true;
      element.textContent = '';
      return;
    }
    element.hidden = false;
    element.textContent = trace.lines.slice(0, 3).join('  |  ');
  }

  function render(): void {
    renderChrome();
    applyTransform();
    renderGraph();
  }

  function select(selection: BaseScreenBlueprintCanvasSelection): void {
    sendCommand({ type: 'select', selection });
  }

  function onNodePointerDown(event: PointerEvent, node: BaseScreenBlueprintCanvasNode): void {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-output-handle], [data-input-handle]') != null) return;
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
    window.addEventListener('pointermove', onNodePointerMove);
    window.addEventListener('pointerup', onNodePointerUp);
    window.addEventListener('pointercancel', onNodePointerUp);
  }

  function onNodePointerMove(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startClientX) / viewportValue.zoom;
    const dy = (event.clientY - drag.startClientY) / viewportValue.zoom;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    const next = {
      x: Math.round(drag.startX + dx),
      y: Math.round(drag.startY + dy),
    };
    positions.set(drag.nodeId, next);
    const card = layers.querySelector<HTMLElement>(`[data-node-id="${cssEscape(drag.nodeId)}"]`);
    if (card !== null) {
      card.style.left = `${next.x}px`;
      card.style.top = `${next.y}px`;
    }
  }

  function onNodePointerUp(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    window.removeEventListener('pointermove', onNodePointerMove);
    window.removeEventListener('pointerup', onNodePointerUp);
    window.removeEventListener('pointercancel', onNodePointerUp);
    if (!finished.moved) {
      select({ kind: 'node', id: finished.nodeId });
      return;
    }
    commitLayout();
  }

  function onPortPointerDown(event: PointerEvent, node: BaseScreenBlueprintCanvasNode): void {
    event.stopPropagation();
    event.preventDefault();
    const target = event.target as HTMLElement;
    const handle = target.dataset.outputHandle;
    if (handle === undefined || target.dataset.available === 'false') {
      setStatus('该事件不可连接。', 'error');
      return;
    }
    link = {
      nodeId: node.id,
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      target: null,
    };
    const rect = viewport.getBoundingClientRect();
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    preview.setAttribute('d', `M ${start.x} ${start.y} L ${start.x} ${start.y}`);
    preview.setAttribute('visibility', 'visible');
    preview.dataset.startX = String(start.x);
    preview.dataset.startY = String(start.y);
    viewport.dataset.linking = 'true';
    window.addEventListener('pointermove', onLinkPointerMove);
    window.addEventListener('pointerup', onLinkPointerUp);
    window.addEventListener('pointercancel', onLinkPointerUp);
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
    window.removeEventListener('pointermove', onLinkPointerMove);
    window.removeEventListener('pointerup', onLinkPointerUp);
    window.removeEventListener('pointercancel', onLinkPointerUp);
    for (const port of viewport.querySelectorAll<HTMLElement>('[data-input-handle]')) {
      port.dataset.hover = 'false';
    }
    const hit = inputAt(event.clientX, event.clientY) ?? finished.target;
    if (hit !== null) {
      completeConnection(finished.nodeId, finished.handle, hit);
      return;
    }
    armed = { nodeId: finished.nodeId, handle: finished.handle };
    setStatus('已选择输出端，点击目标节点的输入端完成连接。');
    render();
  }

  function onInputPointerDown(
    event: PointerEvent,
    _node: BaseScreenBlueprintCanvasNode,
    _handle: string,
  ): void {
    event.stopPropagation();
    if (armed === null) return;
    event.preventDefault();
    completeConnection(armed.nodeId, armed.handle, event.target as Element);
    armed = null;
  }

  function completeConnection(sourceNodeId: string, sourceHandle: string, target: Element): void {
    const input = target.closest<HTMLElement>('[data-input-handle]');
    if (input === null) return;
    const targetNodeId = input.dataset.nodeId;
    const targetHandle = input.dataset.inputHandle;
    if (targetNodeId === undefined || targetHandle === undefined) return;
    if (targetNodeId === sourceNodeId) {
      setStatus('不能连接同一个节点。', 'error');
      return;
    }
    sendCommand({ type: 'connect', sourceNodeId, sourceHandle, targetNodeId, targetHandle });
    armed = null;
    render();
  }

  function inputAt(clientX: number, clientY: number): Element | null {
    const element = document.elementFromPoint(clientX, clientY);
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
    if (target?.closest('.bp-node, [data-edge-id]') != null) return;
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
    window.addEventListener('pointermove', onPanPointerMove);
    window.addEventListener('pointerup', onPanPointerUp);
    window.addEventListener('pointercancel', onPanPointerUp);
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
    window.removeEventListener('pointermove', onPanPointerMove);
    window.removeEventListener('pointerup', onPanPointerUp);
    window.removeEventListener('pointercancel', onPanPointerUp);
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
    return Math.min(2, Math.max(0.2, Math.round(value * 1000) / 1000));
  }

  function zoomBy(factor: number): void {
    const rect = viewport.getBoundingClientRect();
    const next = clampZoom(viewportValue.zoom * factor);
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

  function fitView(targets?: readonly BaseScreenBlueprintCanvasNode[], commit = true): void {
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
    const zoom = clampZoom(Math.min(1.15, (rect.width - 96) / width, (rect.height - 96) / height));
    viewportValue = {
      zoom,
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - height * zoom) / 2 - minY * zoom,
    };
    applyTransform();
    if (commit) commitViewport();
  }

  function autoLayout(): void {
    const current = graph();
    if (current === null) return;
    positions = computeAutoLayout(current.nodes);
    sessionLayout = false;
    renderGraph();
    fitWithPositions();
    commitLayout();
  }

  /**
   * 宿主拥有的布局算法：按 trigger/action 边的深度分列，列内按当前纵向顺序排开。
   * 未连接的库节点按种类落到组件/条件/动作列。依赖边不参与分层。
   */
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
          x: GRAPH_PADDING + depth * COLUMN_STEP,
          y: GRAPH_PADDING + index * ROW_STEP,
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

  /** 新节点落到同类列的底部：不做每次插入都重排，但也不会叠在已有节点上。 */
  function placeNewNode(node: BaseScreenBlueprintCanvasNode | undefined): Point {
    const column = columnOf(node);
    let bottom = 0;
    for (const candidate of graph()?.nodes ?? []) {
      if (candidate.id === node?.id || columnOf(candidate) !== column) continue;
      const position = positionOf(candidate);
      bottom = Math.max(bottom, position.y + geometryOf(candidate).height);
    }
    return {
      x: GRAPH_PADDING + column * COLUMN_STEP,
      y: bottom === 0 ? GRAPH_PADDING : bottom + 48,
    };
  }

  function fitWithPositions(): void {
    fitView(undefined, false);
  }

  function scheduleInitialFit(): void {
    pendingInitialFit = true;
    window.requestAnimationFrame(() => {
      if (!pendingInitialFit) return;
      const current = graph();
      if (current === null || current.nodes.length === 0) return;
      const rect = viewport.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pendingInitialFit = false;
      initialFitDone = true;
      fitView(current.nodes, false);
    });
  }

  function onInsert(kind: 'condition' | 'set-variable' | 'emit-host-event'): void {
    const rect = viewport.getBoundingClientRect();
    const point = screenToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    sendCommand({
      type: 'insert-node',
      kind,
      position: { x: Math.round(point.x), y: Math.round(point.y) },
    });
  }

  function runSimulation(): void {
    const select = footer.querySelector<HTMLSelectElement>('[data-bp-sim-event]');
    const payloadInput = footer.querySelector<HTMLInputElement>('[data-bp-sim-payload]');
    if (select === null || payloadInput === null) return;
    if (select.value === '') {
      setStatus('当前没有可模拟的事件。', 'error');
      return;
    }
    let trigger: { componentId?: unknown; eventName?: unknown };
    try {
      trigger = JSON.parse(select.value) as { componentId?: unknown; eventName?: unknown };
    } catch {
      setStatus('模拟事件已失效，请重新选择。', 'error');
      return;
    }
    if (typeof trigger.componentId !== 'string' || typeof trigger.eventName !== 'string') return;
    let payload: unknown;
    try {
      payload = JSON.parse(payloadInput.value);
    } catch {
      setStatus('负载不是合法 JSON。', 'error');
      return;
    }
    sendCommand({
      type: 'run-simulation',
      componentId: trigger.componentId,
      eventName: trigger.eventName,
      payload: payload as never,
    });
    setStatus('已提交模拟事件。');
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
      setStatus('拖入的蓝图节点无法解析。', 'error');
      return;
    }
    const point = screenToGraph(event.clientX, event.clientY);
    sendCommand({
      ...payload,
      type: 'insert-node',
      position: { x: Math.round(point.x), y: Math.round(point.y) },
    } as CommandInput);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (state?.selection === null || state?.selection === undefined) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      event.preventDefault();
      sendCommand({ type: 'delete-selection', selection: state.selection });
      return;
    }
    if (event.key === 'Escape') {
      armed = null;
      render();
      return;
    }
    if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      fitView();
    }
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
      // 没有保存过布局时，用宿主布局做只读展示；首次拖动/自动布局才写回文档。
      sessionLayout = next.graph.viewport === undefined;
      positions = sessionLayout
        ? computeAutoLayout(next.graph.nodes)
        : new Map(lastEnginePositions);
      hydrated = next.graph.nodes.length > 0;
      initialFitDone = false;
      scheduleInitialFit();
    }
    if (!generationChanged) {
      const engineNext = new Map(
        next.graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      if (drag === null) {
        if (!hydrated && engineNext.size > 0) {
          // 画布先拿到空图、随后文档才装载：第一次出现的节点整体接管，不逐个摆到视口中心。
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
      y: rect.height / 2 - (position.y + geometry.height / 2) * viewportValue.zoom,
    };
    applyTransform();
  }

  toolbar.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    const insert = target.closest<HTMLElement>('[data-bp-insert]')?.dataset.bpInsert;
    if (insert === 'condition' || insert === 'set-variable' || insert === 'emit-host-event') {
      onInsert(insert);
      return;
    }
    if (target.closest('[data-bp-undo]') !== null) {
      sendCommand({ type: 'history-undo' });
      return;
    }
    if (target.closest('[data-bp-redo]') !== null) {
      sendCommand({ type: 'history-redo' });
      return;
    }
    if (target.closest('[data-bp-layout]') !== null) {
      autoLayout();
      return;
    }
    if (target.closest('[data-bp-fit]') !== null) {
      fitView();
      return;
    }
    if (target.closest('[data-bp-zoom-in]') !== null) {
      zoomBy(1.2);
      return;
    }
    if (target.closest('[data-bp-zoom-out]') !== null) {
      zoomBy(1 / 1.2);
      return;
    }
    if (target.closest('[data-bp-problems]') !== null) {
      problems.hidden = !problems.hidden;
    }
  });

  footer.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-bp-sim-run]') !== null) runSimulation();
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

  // 设计器在隐藏的标签页里首次拿到状态时视口尺寸可能还是 0；尺寸就绪后补一次适应画布。
  const resizeObserver = new ResizeObserver(() => {
    if (pendingInitialFit) scheduleInitialFit();
  });
  resizeObserver.observe(viewport);

  applyTransform();
  return root;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

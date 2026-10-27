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

const NODE_WIDTH = 208;
const NODE_HEADER = 45;
const SUBTITLE_HEIGHT = 21;
const VARIABLE_VALUE_ROW = 40;
const PORT_ROW = 28;
const SUMMARY_ROW = 32;
const NODE_BOTTOM_PADDING = 8;
const GRAPH_PADDING = 72;
const COLUMN_STEP = 272;
const ROW_STEP = 180;
// 图层固定 2x 排版、transform 缩放补偿：缩放只改合成变换，卡片/文字保持清晰。
const LAYER_RASTER_ZOOM = 2;

interface CanvasPort {
  readonly handle: string;
  readonly label: string;
  readonly y: number;
  readonly available: boolean;
  readonly semantic?: true;
  readonly containment?: true;
}

interface NodeGeometry {
  readonly width: number;
  readonly height: number;
  readonly portStart: number;
  readonly inputY: number;
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

interface MarqueeState {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startLeft: number;
  readonly startTop: number;
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
  color: #b7b7b7;
  background: #0f0f0f;
  font: 12px/1.4 "Geist", "Geist Sans", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none;
  overflow: hidden;
}
.host-blueprint-canvas button { font: inherit; color: inherit; }
.bp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(245, 245, 245, 0.1);
  background: #0f0f0f;
  z-index: 3;
  overflow-x: auto;
}
.bp-toolbar-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-right: 8px;
  color: #f5f5f5;
  font-weight: 600;
  white-space: nowrap;
}
.bp-toolbar-title small {
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px;
  font-weight: 400;
}
.bp-toolbar-spacer { flex: 1 1 auto; }
.bp-button {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #b7b7b7;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.bp-button:hover:not(:disabled) { background: #2a2a2a; color: #f5f5f5; }
.bp-button:disabled { opacity: 0.4; cursor: default; }
.bp-zoom {
  min-width: 40px;
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.bp-problem-chip {
  height: 22px;
  padding: 0 9px;
  border: 1px solid rgba(79, 203, 111, 0.42);
  border-radius: 999px;
  background: rgba(79, 203, 111, 0.12);
  color: #4fcb6f;
  font-size: 10px;
  cursor: pointer;
}
.bp-problem-chip[data-empty="false"] {
  border-color: rgba(230, 178, 33, 0.5);
  background: rgba(230, 178, 33, 0.12);
  color: #e6b221;
}
.bp-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  cursor: default;
  touch-action: none;
  background-color: #282828;
  background-image: radial-gradient(circle, rgba(245, 245, 245, 0.08) 1px, transparent 1px);
  background-size: 20px 20px;
}
.bp-viewport[data-hand="true"] { cursor: grab; }
.bp-viewport[data-panning="true"] { cursor: grabbing; }
.bp-viewport[data-linking="true"] { cursor: crosshair; }
.bp-layers { position: absolute; inset: 0; transform-origin: 0 0; }
.bp-edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bp-edge-line {
  fill: none;
  stroke: #b7b7b7;
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
  transition: stroke 150ms cubic-bezier(0.2, 0, 0, 1), stroke-width 150ms cubic-bezier(0.2, 0, 0, 1);
}
.bp-edge-group[data-kind="relation"] .bp-edge-line { stroke: #b7b7b7; stroke-width: 1.5; }
.bp-edge-group[data-kind="dependency"] .bp-edge-line {
  stroke: #7d7d7d;
  stroke-width: 1.6;
  stroke-dasharray: 1 5;
  stroke-linecap: round;
}
.bp-edge-group[data-kind="semantic"] .bp-edge-line { stroke: #b7b7b7; stroke-dasharray: 7 5; }
.bp-edge-group[data-kind="containment"] .bp-edge-line { stroke: #7d7d7d; stroke-dasharray: 1 5; opacity: 0.55; }
.bp-edge-group:hover .bp-edge-line { stroke: #f5f5f5; stroke-width: 2; }
.bp-edge-group[data-selected="true"] .bp-edge-line { stroke: #5297fc; stroke-width: 2.4; }
.bp-edge-group[data-traced="true"] .bp-edge-line { stroke: #5297fc; stroke-width: 2.2; }
.bp-edge-caps { fill: #b7b7b7; stroke: none; pointer-events: none; }
.bp-edge-group[data-kind="dependency"] .bp-edge-caps,
.bp-edge-group[data-kind="semantic"] .bp-edge-caps { fill: #7d7d7d; }
.bp-edge-group[data-selected="true"] .bp-edge-caps,
.bp-edge-group[data-traced="true"] .bp-edge-caps { fill: #5297fc; }
.bp-edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 16;
  pointer-events: stroke;
  cursor: pointer;
}
.bp-edge-labels { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.bp-edge-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 168px;
  padding: 0 7px;
  overflow: hidden;
  border-radius: 5px;
  background: #262626;
  box-shadow: 0 0 0 1px rgba(245, 245, 245, 0.15), 0 6px 16px -8px rgba(0, 0, 0, 0.7);
  color: #b7b7b7;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
  transform: translate(-50%, -50%);
}
.bp-edge-label svg { width: 10px; height: 10px; flex: none; color: #7d7d7d; }
.bp-edge-label span { overflow: hidden; text-overflow: ellipsis; }
.bp-edge-label:hover { color: #f5f5f5; box-shadow: 0 0 0 1px rgba(245, 245, 245, 0.28), 0 6px 16px -8px rgba(0, 0, 0, 0.7); }
.bp-edge-label[data-selected="true"] { color: #f5f5f5; box-shadow: 0 0 0 1px #5297fc, 0 6px 16px -8px rgba(0, 0, 0, 0.7); }
.bp-edge-label[data-selected="true"] svg { color: #5297fc; }
.bp-edge-label[data-traced="true"] { color: #f5f5f5; box-shadow: 0 0 0 1px rgba(82, 151, 252, 0.55), 0 6px 16px -8px rgba(0, 0, 0, 0.7); }
.bp-node {
  position: absolute;
  box-sizing: border-box;
  border-radius: 6px;
  background: #0f0f0f;
  box-shadow:
    0 0 0 1px rgba(245, 245, 245, 0.15),
    0 2px 4px rgba(0, 0, 0, 0.6),
    0 16px 32px -20px rgba(0, 0, 0, 0.75);
  cursor: default;
  transition: box-shadow 150ms cubic-bezier(0.2, 0, 0, 1), outline-color 150ms cubic-bezier(0.2, 0, 0, 1);
}
.bp-node:hover { box-shadow: 0 0 0 1px rgba(245, 245, 245, 0.28), 0 2px 4px rgba(0, 0, 0, 0.6), 0 16px 32px -20px rgba(0, 0, 0, 0.75); }
.bp-node:focus-visible { outline: 2px solid #5297fc; outline-offset: 2px; }
.bp-node[data-selected="true"] {
  outline: 1px solid rgba(82, 151, 252, 0.72);
  outline-offset: 0;
  box-shadow: 0 0 0 3px #161d27, 0 2px 4px rgba(0, 0, 0, 0.6), 0 16px 32px -20px rgba(0, 0, 0, 0.75);
}
.bp-node[data-traced="true"] { outline: 1px solid rgba(82, 151, 252, 0.48); outline-offset: 0; }
.bp-node[data-failed="true"] { outline: 1px solid #fc675c; outline-offset: 0; }
.bp-node[data-kind="host"] { background: #131619; }
.bp-node-full { cursor: not-allowed; }
.bp-node-header {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  height: ${NODE_HEADER}px;
  padding: 7px 10px;
  overflow: hidden;
  border-radius: 6px 6px 0 0;
}
.bp-node[data-selected="true"] .bp-node-header { background: rgba(245, 245, 245, 0.03); }
.bp-node-icon {
  display: grid;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: #161616;
  box-shadow: inset 0 0 0 1px rgba(245, 245, 245, 0.1);
  color: #b7b7b7;
  place-items: center;
}
.bp-node-icon svg { width: 12px; height: 12px; }
.bp-node[data-kind="variable"] .bp-node-icon { background: #161d27; color: #609ffc; box-shadow: inset 0 0 0 1px rgba(82, 151, 252, 0.18); }
.bp-node-head-copy { display: grid; gap: 1px; min-width: 0; }
.bp-node-kind {
  overflow: hidden;
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.06em;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-node-title {
  overflow: hidden;
  color: #f5f5f5;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-node-relcount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: #161616;
  box-shadow: inset 0 0 0 1px rgba(245, 245, 245, 0.1);
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 8.5px;
  white-space: nowrap;
}
.bp-node-relcount b { color: #b7b7b7; font-weight: 500; }
.bp-node-sub {
  box-sizing: border-box;
  height: ${SUBTITLE_HEIGHT}px;
  padding: 0 10px;
  overflow: hidden;
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9.5px;
  line-height: ${SUBTITLE_HEIGHT}px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-node-value {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: ${VARIABLE_VALUE_ROW}px;
  padding: 0 10px;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
  color: #aeaeae;
  font-size: 9.5px;
  white-space: nowrap;
}
.bp-node-value b {
  overflow: hidden;
  color: #f5f5f5;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
}
.bp-node-value span:last-child { flex: none; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.bp-node-summary {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  height: ${SUMMARY_ROW}px;
  padding: 0 10px;
  overflow: hidden;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
  border-radius: 0 0 6px 6px;
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-ports { position: absolute; right: 0; left: 0; }
.bp-port-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: ${PORT_ROW}px;
  padding: 0 14px 0 10px;
  overflow: hidden;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
  color: #b7b7b7;
  font-size: 10.5px;
  white-space: nowrap;
}
.bp-port-row:hover { background: rgba(245, 245, 245, 0.04); color: #f5f5f5; }
.bp-port-row[data-available="false"] { color: #7d7d7d; }
.bp-port-row[data-semantic="true"] .bp-port-name,
.bp-port-row[data-containment="true"] .bp-port-name { font-family: inherit; }
.bp-port-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-port-tag {
  flex: none;
  color: #aeaeae;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 8.5px;
  letter-spacing: 0.04em;
}
.bp-port-row[data-semantic="true"] .bp-port-tag { color: #7ea6e8; }
.bp-port-row[data-available="false"] .bp-port-tag { color: #7d7d7d; }
.bp-port-lock { display: inline-flex; flex: none; width: 9px; height: 9px; color: #7d7d7d; }
.bp-port-lock svg { width: 9px; height: 9px; }
.bp-port {
  position: absolute;
  box-sizing: border-box;
  display: grid;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transform: translateY(-50%);
  place-items: center;
  z-index: 4;
  cursor: crosshair;
}
.bp-port::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #aeaeae;
  box-shadow: 0 0 0 2px #0f0f0f;
  content: "";
}
.bp-port:hover::before { background: #f5f5f5; box-shadow: 0 0 0 2px #0f0f0f, 0 0 0 3px rgba(245, 245, 245, 0.26); }
.bp-port-in { left: -12px; }
.bp-port-in::before {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px #aeaeae, 0 0 0 2px #0f0f0f;
}
.bp-port-out { right: -12px; }
.bp-port[data-available="false"] { cursor: not-allowed; }
.bp-port[data-available="false"]::before {
  border: 1px dashed rgba(245, 245, 245, 0.26);
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(245, 245, 245, 0.16);
}
.bp-port[data-semantic="true"]::before { border-radius: 1.5px; background: #b7b7b7; transform: rotate(45deg); }
.bp-port[data-containment="true"] { cursor: default; }
.bp-port[data-containment="true"]::before { border-radius: 1px; background: transparent; box-shadow: inset 0 0 0 1px #7d7d7d; }
.bp-port-in[data-armed="true"]::before {
  background: #5297fc;
  box-shadow: 0 0 0 2px #0f0f0f, 0 0 0 4px #161d27;
}
.bp-link-preview { fill: none; stroke: #5297fc; stroke-width: 1.8; stroke-dasharray: 5 4; pointer-events: none; }
.bp-overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bp-viewport[data-hand="true"] .bp-node,
.bp-viewport[data-hand="true"] .bp-edge-label,
.bp-viewport[data-hand="true"] .bp-port { cursor: grab; }
.bp-viewport[data-panning="true"] .bp-node,
.bp-viewport[data-panning="true"] .bp-edge-label,
.bp-viewport[data-panning="true"] .bp-port { cursor: grabbing; }
.bp-marquee {
  position: absolute;
  z-index: 6;
  border: 1px solid #5297fc;
  background: rgba(82, 151, 252, 0.14);
  pointer-events: none;
}
.bp-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
  background: #0f0f0f;
  color: #aeaeae;
  z-index: 3;
}
.bp-footer select,
.bp-footer input {
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(245, 245, 245, 0.15);
  border-radius: 6px;
  background: #161616;
  color: #f5f5f5;
  font: inherit;
}
.bp-footer input { width: 220px; }
.bp-footer-status {
  flex: 1 1 180px;
  min-width: 120px;
  overflow: hidden;
  color: #aeaeae;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-footer-status[data-tone="error"] { color: #fd7469; }
.bp-trace {
  flex-basis: 100%;
  overflow: hidden;
  color: #5297fc;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-problems {
  position: absolute;
  top: 52px;
  right: 12px;
  z-index: 5;
  width: min(360px, calc(100% - 24px));
  max-height: 46%;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: #262626;
  box-shadow: 0 0 0 1px rgba(245, 245, 245, 0.15), 0 12px 32px -12px rgba(0, 0, 0, 0.78);
}
.bp-problems[hidden] { display: none; }
.bp-problems h4 { margin: 0 0 6px; color: #e6b221; font-size: 11px; }
.bp-problems ul { margin: 0; padding-left: 16px; }
.bp-problems li { margin: 3px 0; color: #b7b7b7; font-size: 11px; }
.bp-problems code { color: #aeaeae; font-size: 10px; }
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
    <span class="bp-toolbar-title">关系视图 <small data-bp-counts></small></span>
    <button type="button" class="bp-button" data-bp-insert="host">业务系统</button>
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
  layers.style.setProperty('zoom', String(LAYER_RASTER_ZOOM));
  const edges = document.createElementNS(SVG_NS, 'svg');
  edges.classList.add('bp-edges');
  const labels = document.createElement('div');
  labels.className = 'bp-edge-labels';
  layers.append(edges, labels);
  viewport.append(layers);

  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.classList.add('bp-overlay');
  const preview = document.createElementNS(SVG_NS, 'path');
  preview.classList.add('bp-link-preview');
  preview.setAttribute('visibility', 'hidden');
  overlay.append(preview);
  viewport.append(overlay);

  const marqueeBox = document.createElement('div');
  marqueeBox.className = 'bp-marquee';
  marqueeBox.hidden = true;
  viewport.append(marqueeBox);

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
  let marquee: MarqueeState | null = null;
  let spacePressed = false;
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
      const valueHeight = node.kind === 'variable' ? VARIABLE_VALUE_ROW : 0;
      const portStart = NODE_HEADER + SUBTITLE_HEIGHT + valueHeight;
      const events = node.events ?? [];
      const rows = Math.max(1, events.length);
      const outputs: CanvasPort[] = events.map((event, index) => ({
        handle: `event:${event.name}`,
        label: event.label === '' ? event.name : event.label,
        y: portStart + index * PORT_ROW + PORT_ROW / 2,
        available: event.available,
      }));
      let rowCount = rows;
      if (node.kind === 'component') {
        outputs.push({
          handle: 'semantic:out',
          label: '语义关联',
          y: portStart + rowCount * PORT_ROW + PORT_ROW / 2,
          available: true,
          semantic: true,
        });
        rowCount += 1;
        if (node.isContainer === true) {
          outputs.push({
            handle: 'containment:out',
            label: '包含',
            y: portStart + rowCount * PORT_ROW + PORT_ROW / 2,
            available: true,
            containment: true,
          });
          rowCount += 1;
        }
      }
      const height = portStart + rowCount * PORT_ROW + NODE_BOTTOM_PADDING;
      return {
        width: NODE_WIDTH,
        height,
        portStart,
        inputY: height / 2,
        outputs,
        inputHandle: 'relation:in',
      };
    }
    return {
      width: NODE_WIDTH,
      height: 96,
      portStart: NODE_HEADER + SUBTITLE_HEIGHT,
      inputY: 48,
      outputs: [],
      inputHandle: 'relation:in',
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
    // 与引擎画布一致：固定 2x 排版，transform 负责实际缩放；translate 被 CSS zoom 放大，故除以 2。
    const scale = viewportValue.zoom / LAYER_RASTER_ZOOM;
    layers.style.transform = `translate(${viewportValue.x / LAYER_RASTER_ZOOM}px, ${viewportValue.y / LAYER_RASTER_ZOOM}px) scale(${scale})`;
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
    const viewport = {
      x: Math.round(viewportValue.x),
      y: Math.round(viewportValue.y),
      zoom: Math.round(viewportValue.zoom * 1000) / 1000,
    };
    // 记录实际发送的取整值；否则回传状态会被当成外部变更再采纳一次，产生回跳。
    lastSentViewportKey = viewportKey(viewport);
    sendCommand({ type: 'commit-viewport', viewport });
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

  interface EdgeRoute {
    readonly path: string;
    readonly start: Point;
    readonly end: Point;
    readonly beforeEnd: Point;
    readonly label: Point;
  }

  const NODE_ICONS: Readonly<Record<string, string>> = {
    component: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 5v14"/>',
    variable:
      '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 2-2 2 1 0 2 .5 2 2v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5 1 2 2 2-1 0-2 .5-2 2v2c0 2-1 3-3 3"/>',
    host: '<path d="m5 7 4 4-4 4M11 15h8"/>',
    container:
      '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5"/>',
  };

  const EDGE_ICONS: Readonly<Record<string, string>> = {
    relation: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    dependency:
      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    semantic:
      '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 12 5.7 14.3a3.5 3.5 0 0 0 5 5L13 17"/><path d="M16 12l2.3-2.3a3.5 3.5 0 0 0-5-5L11 7"/>',
    containment:
      '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5"/>',
  };

  function iconSvg(body: string): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function nodeIcon(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'variable') return NODE_ICONS.variable ?? '';
    if (node.kind === 'host') return NODE_ICONS.host ?? '';
    if (node.isContainer === true) return NODE_ICONS.container ?? '';
    return NODE_ICONS.component ?? '';
  }

  function edgeRoute(edge: BaseScreenBlueprintCanvasEdge): EdgeRoute | null {
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
    const y2 = targetPosition.y + targetGeometry.inputY;
    const gap = x2 - x1;
    const hash = hashOf(edge.id);
    let points: Point[];
    if (gap >= 48) {
      const lane = Math.min(x2 - 16, x1 + Math.min(120, Math.max(28, gap * 0.42)) + (hash % 4) * 6);
      points = [
        { x: x1, y: y1 },
        { x: lane, y: y1 },
        { x: lane, y: y2 },
        { x: x2, y: y2 },
      ];
    } else {
      const bottom =
        Math.max(
          sourcePosition.y + sourceGeometry.height,
          targetPosition.y + targetGeometry.height,
        ) +
        28 +
        (hash % 4) * 14;
      points = [
        { x: x1, y: y1 },
        { x: x1 + 24, y: y1 },
        { x: x1 + 24, y: bottom },
        { x: x2 - 24, y: bottom },
        { x: x2 - 24, y: y2 },
        { x: x2, y: y2 },
      ];
    }
    return {
      path: roundedPolylinePath(points, 12),
      start: points[0] as Point,
      end: points[points.length - 1] as Point,
      beforeEnd: points[points.length - 2] as Point,
      label: labelPointFor(points, edge.id),
    };
  }

  function roundedPolylinePath(points: readonly Point[], radius: number): string {
    const first = points[0] as Point;
    let path = `M ${first.x} ${first.y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1] as Point;
      const current = points[index] as Point;
      const next = points[index + 1] as Point;
      const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
      const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
      const limit = Math.min(radius, incoming / 2, outgoing / 2);
      const start =
        limit === 0
          ? current
          : {
              x: current.x - ((current.x - previous.x) / incoming) * limit,
              y: current.y - ((current.y - previous.y) / incoming) * limit,
            };
      const end =
        limit === 0
          ? current
          : {
              x: current.x + ((next.x - current.x) / outgoing) * limit,
              y: current.y + ((next.y - current.y) / outgoing) * limit,
            };
      path += ` L ${start.x} ${start.y} Q ${current.x} ${current.y} ${end.x} ${end.y}`;
    }
    const last = points[points.length - 1] as Point;
    return `${path} L ${last.x} ${last.y}`;
  }

  function arrowPath(end: Point, previous: Point): string {
    const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
    const size = 7;
    const halfWidth = 3.4;
    const left = {
      x: end.x - size * Math.cos(angle) + halfWidth * Math.sin(angle),
      y: end.y - size * Math.sin(angle) - halfWidth * Math.cos(angle),
    };
    const right = {
      x: end.x - size * Math.cos(angle) - halfWidth * Math.sin(angle),
      y: end.y - size * Math.sin(angle) + halfWidth * Math.cos(angle),
    };
    return `M ${end.x} ${end.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
  }

  function hashOf(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function labelPointFor(points: readonly Point[], edgeId: string): Point {
    const hash = hashOf(edgeId);
    if (points.length === 4) {
      const start = points[0] as Point;
      const lane = points[1] as Point;
      const endLane = points[2] as Point;
      const end = points[3] as Point;
      if (Math.abs(lane.x - start.x) >= Math.abs(end.x - endLane.x)) {
        return { x: (start.x + lane.x) / 2, y: start.y - 11 - (hash % 4) * 3 };
      }
      return { x: (endLane.x + end.x) / 2, y: end.y - 11 - (hash % 4) * 3 };
    }
    if (points.length < 3) {
      const start = points[0] as Point;
      const end = points[points.length - 1] as Point;
      return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 12 };
    }
    const start = points[0] as Point;
    const bottom = points[2] as Point;
    const end = points[points.length - 1] as Point;
    return { x: (start.x + end.x) / 2, y: bottom.y + 12 + (hash % 3) * 3 };
  }

  function edgeLabel(edge: BaseScreenBlueprintCanvasEdge): string {
    if (edge.kind === 'dependency') {
      const source = nodeById(edge.source);
      const name = source?.variableName ?? source?.variableId ?? '';
      return name === '' ? '读取变量' : `读取 ${name}`;
    }
    if (edge.kind === 'containment') return '包含';
    if (edge.kind === 'semantic') {
      return ({ related: '关联', detail: '详情', group: '分组', 'drill-down': '下钻' } as const)[
        edge.semanticRole ?? 'related'
      ];
    }
    if (edge.kind === 'relation') {
      if (edge.effectType === 'component-visibility') {
        const operation = ({ show: '显示', hide: '隐藏', toggle: '切换' } as const)[
          edge.operation ?? 'toggle'
        ];
        return `${edge.eventName ?? ''} · ${operation}`;
      }
      if (edge.effectType === 'set-variable') return `更新变量 ${edge.variableId ?? ''}`;
      if (edge.effectType === 'request-variable') return `请求变量 ${edge.variableId ?? ''}`;
      if (edge.effectType === 'request-component-data') {
        return `${edge.eventName ?? ''} · 请求数据`;
      }
      if (edge.effectType === 'emit-host-event') return `业务事件 ${edge.eventName ?? ''}`;
      if (edge.effectType === 'host-action') return `业务动作 ${edge.actionId ?? ''}`;
      return edge.eventName ?? '';
    }
    if (edge.sourceHandle.startsWith('event:')) return edge.sourceHandle.slice(6);
    return '';
  }

  function renderGraph(): void {
    const current = graph();
    edges.replaceChildren();
    labels.replaceChildren();
    for (const node of layers.querySelectorAll('.bp-node')) node.remove();
    if (current === null) return;

    const trace = state?.trace;
    const traced = new Set(trace?.executedEdgeIds ?? []);
    const failedRelations = new Set(trace?.failedRelationIds ?? []);
    const nodeRects = current.nodes.map((node) => {
      const geometry = geometryOf(node);
      const position = positionOf(node);
      return {
        left: position.x,
        top: position.y,
        right: position.x + geometry.width,
        bottom: position.y + geometry.height,
      };
    });
    const placedLabels: Point[] = [];
    for (const edge of current.edges) {
      const route = edgeRoute(edge);
      if (route === null) continue;
      const selected = state?.selection?.kind === 'edge' && state.selection.id === edge.id;
      const group = document.createElementNS(SVG_NS, 'g');
      group.classList.add('bp-edge-group');
      group.dataset.kind = edge.kind;
      if (traced.has(edge.id)) group.dataset.traced = 'true';
      if (selected) group.dataset.selected = 'true';
      const path = document.createElementNS(SVG_NS, 'path');
      path.classList.add('bp-edge-line');
      path.setAttribute('d', route.path);
      group.append(path);
      const caps = document.createElementNS(SVG_NS, 'g');
      caps.classList.add('bp-edge-caps');
      if (edge.kind === 'semantic') {
        caps.append(circleAt(route.start, 2.6), circleAt(route.end, 2.6));
      } else if (edge.kind === 'dependency') {
        caps.append(circleAt(route.end, 2.6));
      } else if (edge.kind === 'relation') {
        const arrow = document.createElementNS(SVG_NS, 'path');
        arrow.setAttribute('d', arrowPath(route.end, route.beforeEnd));
        caps.append(arrow);
      }
      group.append(caps);
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.classList.add('bp-edge-hit');
      hit.setAttribute('d', route.path);
      hit.dataset.edgeId = edge.id;
      hit.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selectFromPointer({ kind: 'edge', id: edge.id }, event);
      });
      group.append(hit);
      edges.append(group);

      const label = edgeLabel(edge);
      if (label === '') continue;
      if (edge.kind === 'dependency' && !selected && !traced.has(edge.id)) continue;
      let labelPoint = clearLabelPoint(route.label, label, nodeRects);
      while (
        placedLabels.some(
          (placed) =>
            Math.abs(placed.x - labelPoint.x) < 96 && Math.abs(placed.y - labelPoint.y) < 16,
        )
      ) {
        labelPoint = { x: labelPoint.x, y: labelPoint.y + 22 };
      }
      placedLabels.push(labelPoint);
      const chip = document.createElement('span');
      chip.className = 'bp-edge-label';
      chip.dataset.kind = edge.kind;
      chip.dataset.edgeLabel = edge.id;
      chip.innerHTML = iconSvg(EDGE_ICONS[edge.kind] ?? EDGE_ICONS.relation ?? '');
      const chipText = document.createElement('span');
      chipText.textContent = label;
      chip.append(chipText);
      if (selected) {
        chip.dataset.selected = 'true';
      }
      if (traced.has(edge.id)) {
        chip.dataset.traced = 'true';
      }
      chip.style.left = `${labelPoint.x}px`;
      chip.style.top = `${labelPoint.y}px`;
      chip.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selectFromPointer({ kind: 'edge', id: edge.id }, event);
      });
      labels.append(chip);
    }

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
      if (traced.has(`relation:${node.id}`)) card.dataset.traced = 'true';
      if (
        current.edges.some(
          (edge) =>
            edge.target === node.id &&
            edge.relationId !== undefined &&
            failedRelations.has(edge.relationId),
        )
      ) {
        card.dataset.failed = 'true';
      }

      const header = document.createElement('div');
      header.className = 'bp-node-header';
      const icon = document.createElement('span');
      icon.className = 'bp-node-icon';
      icon.innerHTML = iconSvg(nodeIcon(node));
      const copy = document.createElement('span');
      copy.className = 'bp-node-head-copy';
      const kind = document.createElement('span');
      kind.className = 'bp-node-kind';
      kind.textContent = nodeKindLine(node);
      const title = document.createElement('span');
      title.className = 'bp-node-title';
      title.textContent = nodeTitle(node);
      copy.append(kind, title);
      header.append(icon, copy);
      if (node.kind !== 'variable') {
        const counts = document.createElement('span');
        counts.className = 'bp-node-relcount';
        const out = document.createElement('span');
        out.textContent = '出 ';
        const outValue = document.createElement('b');
        outValue.textContent = String(node.outboundCount ?? 0);
        const inbound = document.createElement('span');
        inbound.textContent = ' 入 ';
        const inboundValue = document.createElement('b');
        inboundValue.textContent = String(node.inboundCount ?? 0);
        counts.append(out, outValue, inbound, inboundValue);
        header.append(counts);
      }
      card.append(header);

      const sub = document.createElement('div');
      sub.className = 'bp-node-sub';
      sub.textContent = nodeSubtitle(node);
      card.append(sub);

      if (node.kind === 'variable') {
        const value = document.createElement('div');
        value.className = 'bp-node-value';
        const valueLabel = document.createElement('span');
        valueLabel.textContent = '初值 ';
        const valueText = document.createElement('b');
        valueText.textContent =
          node.variableInitialValue === undefined ? '—' : shortJson(node.variableInitialValue);
        const stats = document.createElement('span');
        stats.textContent = `${node.writeCount ?? 0} 写 / ${node.readCount ?? 0} 读`;
        value.append(valueLabel, valueText, stats);
        card.append(value);
      }

      if (node.kind === 'component' || node.kind === 'variable') {
        const ports = document.createElement('div');
        ports.className = 'bp-ports';
        ports.style.top = `${geometry.portStart}px`;
        for (const port of geometry.outputs) {
          const row = document.createElement('div');
          row.className = 'bp-port-row';
          row.dataset.available = String(port.available);
          if (port.semantic === true) row.dataset.semantic = 'true';
          if (port.containment === true) row.dataset.containment = 'true';
          const name = document.createElement('span');
          name.className = 'bp-port-name';
          name.textContent = port.label;
          const tag = document.createElement('span');
          tag.className = 'bp-port-tag';
          tag.textContent =
            port.semantic === true
              ? '语义'
              : port.containment === true
                ? '结构'
                : port.available
                  ? '事件'
                  : '不可用';
          row.append(name, tag);
          if (!port.available) {
            const lock = document.createElement('span');
            lock.className = 'bp-port-lock';
            lock.innerHTML = iconSvg(
              '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
            );
            row.append(lock);
          }
          ports.append(row);
        }
        card.append(ports);
      }

      const summary = nodeSummaryText(node);
      if (summary !== '') {
        const summaryElement = document.createElement('div');
        summaryElement.className = 'bp-node-summary';
        summaryElement.textContent = summary;
        card.append(summaryElement);
      }

      const input = document.createElement('span');
      input.className = 'bp-port bp-port-in';
      input.dataset.inputHandle = geometry.inputHandle;
      input.dataset.nodeId = node.id;
      input.dataset.armed = String(armed !== null && typeCanReceive(armed, geometry.inputHandle));
      input.style.top = `${geometry.inputY}px`;
      input.setAttribute('aria-label', '输入端口');
      card.append(input);

      for (const port of geometry.outputs) {
        const output = document.createElement('span');
        output.className = 'bp-port bp-port-out';
        output.dataset.outputHandle = port.handle;
        output.dataset.nodeId = node.id;
        output.dataset.available = String(port.containment === true ? false : port.available);
        if (port.semantic === true) output.dataset.semantic = 'true';
        if (port.containment === true) output.dataset.containment = 'true';
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
        if (portElement.dataset.containment === 'true') return;
        portElement.addEventListener('pointerdown', (event) => onPortPointerDown(event, node));
      });
      input.addEventListener('pointerdown', (event) =>
        onInputPointerDown(event, node, geometry.inputHandle),
      );
      layers.append(card);
    }
  }

  function circleAt(point: Point, radius: number): SVGCircleElement {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', String(radius));
    return circle;
  }

  function labelWidth(label: string): number {
    let width = 28;
    for (const character of label) {
      width += /[\x00-\x7f]/.test(character) ? 6 : 10;
    }
    return Math.min(168, width);
  }

  function clearLabelPoint(
    preferred: Point,
    label: string,
    rects: readonly { left: number; top: number; right: number; bottom: number }[],
  ): Point {
    const halfWidth = labelWidth(label) / 2;
    const halfHeight = 11;
    const isClear = (point: Point): boolean =>
      !rects.some(
        (rect) =>
          point.x - halfWidth < rect.right + 2 &&
          point.x + halfWidth > rect.left - 2 &&
          point.y - halfHeight < rect.bottom + 2 &&
          point.y + halfHeight > rect.top - 2,
      );
    const candidates: Point[] = [
      preferred,
      { x: preferred.x, y: preferred.y - 24 },
      { x: preferred.x, y: preferred.y - 46 },
      { x: preferred.x, y: preferred.y + 24 },
      { x: preferred.x, y: preferred.y + 46 },
      { x: preferred.x - 72, y: preferred.y },
      { x: preferred.x + 72, y: preferred.y },
    ];
    return candidates.find(isClear) ?? preferred;
  }

  function typeCanReceive(source: ArmedSource, inputHandle: string): boolean {
    const sourceNode = nodeById(source.nodeId);
    if (sourceNode === undefined) return false;
    if (inputHandle !== 'relation:in' && inputHandle !== 'dependency:in') return false;
    return sourceNode.kind === 'component' || sourceNode.kind === 'variable';
  }

  function nodeKindLabel(node: BaseScreenBlueprintCanvasNode): string {
    return node.kind === 'component' ? '组件' : node.kind === 'variable' ? '变量' : '业务系统';
  }

  function nodeKindLine(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') return `组件 · ${node.materialType ?? 'material'}`;
    if (node.kind === 'variable') return '变量 · 静态';
    if (node.kind === 'host') return '平台 · 业务出口';
    return nodeKindLabel(node);
  }

  function nodeTitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') return node.componentName ?? node.componentId ?? node.id;
    if (node.kind === 'variable') return node.variableName ?? node.variableId ?? node.id;
    return '业务系统';
  }

  function nodeSubtitle(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component') {
      return `${node.materialType ?? 'material'} · ${node.componentId ?? node.id}`;
    }
    if (node.kind === 'variable') {
      return `${node.variableType ?? 'variable'} · ${node.variableId ?? node.id}`;
    }
    return `${node.exitCount ?? 0} 个业务出口`;
  }

  function nodeSummaryText(node: BaseScreenBlueprintCanvasNode): string {
    if (node.kind === 'component' && (node.childCount ?? 0) > 0) {
      return `结构 · 子组件 ${node.childCount}`;
    }
    return '';
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
      if (current === null) {
        counts.textContent = '未连接';
      } else {
        const components = current.nodes.filter((node) => node.kind === 'component').length;
        const relations = current.edges.filter((edge) => edge.kind === 'relation').length;
        const semantic = current.edges.filter((edge) => edge.kind === 'semantic').length;
        const structural = current.edges.filter((edge) => edge.kind === 'containment').length;
        counts.textContent = `${components} 组件 · ${relations} 关系 · ${semantic} 语义 · ${structural} 结构`;
      }
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

  function selectFromPointer(
    selection: NonNullable<BaseScreenBlueprintCanvasSelection>,
    event: { readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): void {
    const current = state?.selection;
    if (
      (event.ctrlKey || event.metaKey) &&
      current !== null &&
      current !== undefined &&
      current.kind === selection.kind &&
      current.id === selection.id
    ) {
      select(null);
      return;
    }
    select(selection);
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
      selectFromPointer({ kind: 'node', id: finished.nodeId }, event);
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
    if (target?.closest('.bp-node, [data-edge-id], .bp-problems') != null) return;
    armed = null;
    const rect = viewport.getBoundingClientRect();
    marquee = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: event.clientX - rect.left,
      startTop: event.clientY - rect.top,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', onMarqueePointerMove);
    window.addEventListener('pointerup', onMarqueePointerUp);
    window.addEventListener('pointercancel', onMarqueePointerUp);
  }

  function onMarqueePointerMove(event: PointerEvent): void {
    if (marquee === null || event.pointerId !== marquee.pointerId) return;
    const rect = viewport.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    const left = Math.min(marquee.startLeft, currentX);
    const top = Math.min(marquee.startTop, currentY);
    const width = Math.abs(currentX - marquee.startLeft);
    const height = Math.abs(currentY - marquee.startTop);
    if (!marquee.moved && width + height < 3) return;
    marquee = { ...marquee, moved: true };
    marqueeBox.hidden = false;
    marqueeBox.style.left = `${left}px`;
    marqueeBox.style.top = `${top}px`;
    marqueeBox.style.width = `${width}px`;
    marqueeBox.style.height = `${height}px`;
  }

  function onMarqueePointerUp(event: PointerEvent): void {
    if (marquee === null || event.pointerId !== marquee.pointerId) return;
    const finished = marquee;
    marquee = null;
    window.removeEventListener('pointermove', onMarqueePointerMove);
    window.removeEventListener('pointerup', onMarqueePointerUp);
    window.removeEventListener('pointercancel', onMarqueePointerUp);
    marqueeBox.hidden = true;
    if (!finished.moved) {
      select(null);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const left = Math.min(finished.startClientX, event.clientX) - rect.left;
    const top = Math.min(finished.startClientY, event.clientY) - rect.top;
    const right = Math.max(finished.startClientX, event.clientX) - rect.left;
    const bottom = Math.max(finished.startClientY, event.clientY) - rect.top;
    const nodeId = nodeWithLargestIntersection(left, top, right, bottom);
    if (nodeId === undefined) {
      select(null);
      return;
    }
    selectFromPointer({ kind: 'node', id: nodeId }, event);
  }

  function nodeWithLargestIntersection(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): string | undefined {
    let bestId: string | undefined;
    let bestArea = 0;
    const rect = viewport.getBoundingClientRect();
    for (const card of layers.querySelectorAll<HTMLElement>('.bp-node')) {
      const cardRect = card.getBoundingClientRect();
      const cardLeft = cardRect.left - rect.left;
      const cardTop = cardRect.top - rect.top;
      const width = Math.max(
        0,
        Math.min(cardLeft + cardRect.width, right) - Math.max(cardLeft, left),
      );
      const height = Math.max(
        0,
        Math.min(cardTop + cardRect.height, bottom) - Math.max(cardTop, top),
      );
      const area = width * height;
      if (area > bestArea && card.dataset.nodeId !== undefined) {
        bestArea = area;
        bestId = card.dataset.nodeId;
      }
    }
    return bestId;
  }

  function startPan(event: PointerEvent): void {
    pan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewportValue.x,
      startY: viewportValue.y,
      moved: false,
    };
    viewport.dataset.panning = 'true';
    viewport.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', onPanPointerMove);
    window.addEventListener('pointerup', onPanPointerUp);
    window.addEventListener('pointercancel', onPanPointerUp);
  }

  function onViewportCapturePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !spacePressed) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.bp-problems, .bp-footer') != null) return;
    event.preventDefault();
    event.stopPropagation();
    armed = null;
    startPan(event);
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
    viewport.dataset.panning = 'false';
    window.removeEventListener('pointermove', onPanPointerMove);
    window.removeEventListener('pointerup', onPanPointerUp);
    window.removeEventListener('pointercancel', onPanPointerUp);
    if (finished.moved) commitViewport();
  }

  function isEditableTarget(event: Event): boolean {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.closest('input, textarea, select, button, a, [contenteditable="true"]') !== null
    );
  }

  function onRootKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space' || !spacePressed) return;
    spacePressed = false;
    viewport.dataset.hand = 'false';
  }

  function onRootBlur(): void {
    spacePressed = false;
    viewport.dataset.hand = 'false';
    if (pan === null) return;
    viewport.dataset.panning = 'false';
    pan = null;
    window.removeEventListener('pointermove', onPanPointerMove);
    window.removeEventListener('pointerup', onPanPointerUp);
    window.removeEventListener('pointercancel', onPanPointerUp);
    viewportsDirty = true;
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = clampZoom(viewportValue.zoom * factor);
      const point = screenToGraph(event.clientX, event.clientY);
      const rect = viewport.getBoundingClientRect();
      viewportValue = {
        zoom: next,
        x: event.clientX - rect.left - point.x * next,
        y: event.clientY - rect.top - point.y * next,
      };
    } else {
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 512 : 1;
      const dx = (event.shiftKey ? event.deltaY : event.deltaX) * scale;
      const dy = (event.shiftKey ? event.deltaX : event.deltaY) * scale;
      viewportValue = {
        ...viewportValue,
        x: viewportValue.x - dx,
        y: viewportValue.y - dy,
      };
    }
    applyTransform();
    scheduleViewportCommit();
  }

  function clampZoom(value: number): number {
    return Math.min(2, Math.max(0.1, Math.round(value * 1000) / 1000));
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
    const components = nodes.filter((node) => node.kind === 'component');
    const variables = nodes.filter((node) => node.kind === 'variable');
    const hosts = nodes.filter((node) => node.kind === 'host');
    const columns = Math.max(1, Math.min(components.length, viewport.clientWidth >= 760 ? 3 : 2));
    const depths = new Map<string, number>(nodes.map((node) => [node.id, 0] as const));
    const relations = current.edges.filter(
      (edge) => edge.kind === 'relation' || edge.kind === 'semantic',
    );
    for (let pass = 0; pass < Math.min(nodes.length, 8); pass += 1) {
      let changed = false;
      for (const edge of relations) {
        const source = depths.get(edge.source);
        const target = depths.get(edge.target);
        if (source === undefined || target === undefined) continue;
        if (source + 1 > target && source + 1 < 8) {
          depths.set(edge.target, source + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const readOnlyVariables = variables.filter(
      (node) => !current.edges.some((edge) => edge.target === node.id && edge.kind === 'relation'),
    );
    const variablesOnLeft = variables.length > 0 && readOnlyVariables.length === variables.length;
    const componentBaseX = GRAPH_PADDING + (variablesOnLeft ? COLUMN_STEP : 0);
    const ordered = [...components].sort(
      (left, right) => (depths.get(left.id) ?? 0) - (depths.get(right.id) ?? 0),
    );
    const rows = Math.max(1, Math.ceil(ordered.length / columns));
    const next = new Map<string, Point>();
    ordered.forEach((node, index) => {
      const column = Math.floor(index / rows);
      const row = index % rows;
      next.set(node.id, {
        x: componentBaseX + column * COLUMN_STEP,
        y: GRAPH_PADDING + row * ROW_STEP,
      });
    });
    let cursor = GRAPH_PADDING;
    if (variablesOnLeft) {
      for (const node of readOnlyVariables) {
        next.set(node.id, { x: GRAPH_PADDING, y: cursor });
        cursor += geometryOf(node).height + 20;
      }
    } else {
      const variableX = componentBaseX + columns * COLUMN_STEP;
      cursor = GRAPH_PADDING;
      for (const node of variables) {
        next.set(node.id, { x: variableX, y: cursor });
        cursor += geometryOf(node).height + 20;
      }
    }
    const hostX = componentBaseX + columns * COLUMN_STEP;
    let hostY = variablesOnLeft
      ? GRAPH_PADDING +
        Math.max(
          0,
          ...ordered.map(
            (node) => (next.get(node.id)?.y ?? GRAPH_PADDING) + geometryOf(node).height,
          ),
        ) +
        24
      : cursor;
    for (const node of hosts) {
      next.set(node.id, { x: hostX, y: hostY });
      hostY += geometryOf(node).height + 24;
    }
    return next;
  }

  function columnOf(node: BaseScreenBlueprintCanvasNode | undefined): number {
    if (node === undefined) return 0;
    return node.kind === 'component' || node.kind === 'variable' ? 0 : 2;
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

  function onInsert(kind: 'host'): void {
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
    if (event.code === 'Space' && !isEditableTarget(event)) {
      event.preventDefault();
      spacePressed = true;
      viewport.dataset.hand = 'true';
      return;
    }
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
    if (insert === 'host') {
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

  viewport.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, button, a') !== null) return;
      root.focus({ preventScroll: true });
    },
    true,
  );
  viewport.addEventListener('pointerdown', onViewportCapturePointerDown, true);
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
  root.addEventListener('keyup', onRootKeyUp);
  root.addEventListener('blur', onRootBlur, true);
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

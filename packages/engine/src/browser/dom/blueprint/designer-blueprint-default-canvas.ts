import type { ScreenBlueprintLayoutNode, ScreenJsonValue } from '@base-screen/contracts';
import {
  DESIGNER_BLUEPRINT_NODE_BODY_BOTTOM as BODY_BOTTOM,
  DESIGNER_BLUEPRINT_NODE_BODY_TOP as BODY_TOP,
  DESIGNER_BLUEPRINT_NODE_HEADER_HEIGHT as HEADER_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_MIN_HEIGHT as MIN_NODE_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_BORDER as NODE_BORDER,
  DESIGNER_BLUEPRINT_NODE_GAP as NODE_GAP,
  DESIGNER_BLUEPRINT_NODE_WIDTH as NODE_WIDTH,
  DESIGNER_BLUEPRINT_NODE_ROW_HEIGHT as ROW_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_SNAP_DISTANCE as SNAP_DISTANCE,
} from '../../../common/operations/blueprint/designer-blueprint-geometry.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasEdge,
  type BaseScreenBlueprintCanvasInsertNode,
  type BaseScreenBlueprintCanvasNode,
  type BaseScreenBlueprintCanvasNodeKind,
  type BaseScreenBlueprintCanvasPort,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { type DesignerIconName, designerIcon } from '../designer-icons.js';
import { escapeAttribute, escapeHtml } from './designer-blueprint-dom-helpers.js';

/**
 * 引擎默认蓝图画布（ADR-0107 §2.6，视觉与手势参考 LIGHT CHASER 实测，见设计说明
 * `blueprint-node-graph.md`）。
 *
 * 只经画布协议与工作台通信：收 `state` 事件渲染，发 `command` 事件请求修改；文档、历史与校验都不在这里。
 * 拖动、框选、平移、缩放是本地交互态，松手后一次性以 `commit-layout` 提交位置。
 *
 * 几何来自 `designer-blueprint-geometry.ts`：卡片宽 164、标题栏 44、内边距 12/13/13、
 * 锚点行 27（先输出后输入，语义锚点单列一行）、圆点 12（命中 28）。
 */

/** 锚点圆心压在卡片外缘上（连线直接接到卡片边，见 bp-port 样式的 --designer-blueprint-port-offset）。 */
const PORT_EDGE_OFFSET = 0;
const GRID = 8;
const MENU_CLICK_TOLERANCE = 4;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const TEXT = DESIGNER_UI_TEXT.blueprint.graph;
const ADDABLE_KINDS: readonly Exclude<
  BaseScreenBlueprintCanvasNodeKind,
  'component' | 'variable' | 'sub-canvas' | 'main-canvas'
>[] = ['lifecycle', 'timer', 'condition', 'host'];
const KIND_ICONS: Readonly<Record<BaseScreenBlueprintCanvasNodeKind, DesignerIconName>> = {
  component: 'cube',
  variable: 'variable',
  host: 'database',
  lifecycle: 'play',
  timer: 'activity',
  condition: 'sliders',
  'sub-canvas': 'copy',
  'main-canvas': 'grid',
};

export interface DesignerBlueprintDefaultCanvasHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PortRef {
  readonly node: string;
  readonly port: string;
}

type Drag =
  | {
      readonly type: 'pan' | 'context';
      readonly startX: number;
      readonly startY: number;
      readonly viewX: number;
      readonly viewY: number;
      moved: boolean;
      readonly target: Element | null;
      readonly additive: boolean;
    }
  | {
      readonly type: 'node';
      readonly ids: readonly string[];
      readonly origins: readonly Point[];
      readonly startX: number;
      readonly startY: number;
      moved: boolean;
    }
  | {
      readonly type: 'link';
      readonly from: PortRef;
      readonly direction: 'out' | 'in';
      readonly anchor: Point;
      snap: PortRef | undefined;
    }
  | {
      readonly type: 'marquee';
      readonly startX: number;
      readonly startY: number;
      readonly world: Point;
      moved: boolean;
      readonly additive: boolean;
      readonly base: readonly string[];
    };

export function createDesignerBlueprintDefaultCanvas(
  ownerDocument: Document,
): DesignerBlueprintDefaultCanvasHandle {
  const canvas = new DefaultBlueprintCanvas(ownerDocument);
  return { element: canvas.element, destroy: () => canvas.destroy() };
}

class DefaultBlueprintCanvas {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #stage: HTMLElement;
  readonly #world: HTMLElement;
  readonly #edges: SVGSVGElement;
  readonly #nodes: HTMLElement;
  readonly #labels: HTMLElement;
  readonly #marquee: HTMLElement;
  readonly #menu: HTMLElement;
  readonly #toolbar: HTMLElement;
  readonly #simulation: HTMLElement;
  readonly #empty: HTMLElement;
  #state: BaseScreenBlueprintCanvasState | undefined;
  #view = { x: 40, y: 40, z: 1 };
  #viewInitialized = false;
  #positions = new Map<string, Point>();
  #selection: BaseScreenBlueprintCanvasSelection = { nodes: [], edges: [] };
  #drag: Drag | undefined;
  #hoverEdge: string | undefined;
  #renaming: string | undefined;
  #showTrace = true;
  /** 语义连线显隐是画布会话态（不进文档、不进历史）。 */
  #showSemantic = true;
  #simulationOpen = false;
  #simulationTrigger: string | undefined;
  #space = false;
  #contextPoint: Point = { x: 0, y: 0 };
  #lastViewRequest = -1;
  #commandSeq = 0;
  /**
   * 上一次写入 DOM 的结构标记（不含选中 / 悬停这类会话态）。标记不变就不重建 DOM：
   * 选中切换发生在 pointerdown 里，若此时整块重建，按下的元素被换掉，浏览器会丢掉这次
   * click（双击也随之失效），悬停态与过渡动画也会重新开始，看起来就是卡一下。
   */
  #nodesMarkup = '';
  #edgesMarkup = '';
  #toolbarMarkup = '';
  #simulationMarkup = '';
  #tracedNodes: ReadonlySet<string> = new Set();
  readonly #listeners: [EventTarget, string, EventListener, AddEventListenerOptions | undefined][] =
    [];

  constructor(ownerDocument: Document) {
    this.#document = ownerDocument;
    const element = ownerDocument.createElement('div');
    element.className = 'designer-blueprint-canvas';
    element.tabIndex = 0;
    element.setAttribute('role', 'application');
    element.setAttribute('aria-label', DESIGNER_UI_TEXT.blueprint.canvas);
    element.dataset.designerBlueprintCanvas = 'true';
    element.innerHTML = `<div class="bp-toolbar" role="toolbar" aria-label="${escapeAttribute(DESIGNER_UI_TEXT.blueprint.localToolbar)}"></div>
      <div class="bp-stage" data-bp-stage>
        <div class="bp-world" data-bp-world>
          <svg class="bp-edges" data-bp-edges aria-hidden="true"></svg>
          <div class="bp-nodes" data-bp-nodes></div>
          <div class="bp-labels" data-bp-labels></div>
        </div>
        <div class="bp-marquee" data-bp-marquee hidden></div>
        <div class="bp-empty" data-bp-empty hidden></div>
      </div>
      <div class="bp-simulation" data-bp-simulation hidden></div>
      <div class="designer-context-menu bp-context-menu" data-bp-menu role="menu" hidden tabindex="-1"></div>`;
    this.element = element;
    this.#toolbar = element.querySelector<HTMLElement>('.bp-toolbar')!;
    this.#stage = element.querySelector<HTMLElement>('[data-bp-stage]')!;
    this.#world = element.querySelector<HTMLElement>('[data-bp-world]')!;
    this.#edges = element.querySelector<SVGSVGElement>('[data-bp-edges]')!;
    this.#nodes = element.querySelector<HTMLElement>('[data-bp-nodes]')!;
    this.#labels = element.querySelector<HTMLElement>('[data-bp-labels]')!;
    this.#marquee = element.querySelector<HTMLElement>('[data-bp-marquee]')!;
    this.#menu = element.querySelector<HTMLElement>('[data-bp-menu]')!;
    this.#simulation = element.querySelector<HTMLElement>('[data-bp-simulation]')!;
    this.#empty = element.querySelector<HTMLElement>('[data-bp-empty]')!;
    this.listen(element, BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) =>
      this.receive((event as CustomEvent<BaseScreenBlueprintCanvasStateEventDetail>).detail.state),
    );
    this.listen(this.#stage, 'pointerdown', (event) => this.onPointerDown(event as PointerEvent));
    this.listen(this.#stage, 'pointermove', (event) => this.onPointerMove(event as PointerEvent));
    this.listen(this.#stage, 'pointerup', (event) => this.onPointerUp(event as PointerEvent));
    this.listen(this.#stage, 'pointercancel', () => this.cancelDrag());
    this.listen(this.#stage, 'pointerleave', () => this.setHoverEdge(undefined));
    this.listen(this.#stage, 'contextmenu', (event) => event.preventDefault());
    this.listen(this.#stage, 'dblclick', (event) => this.onDoubleClick(event as MouseEvent));
    this.listen(this.#stage, 'wheel', (event) => this.onWheel(event as WheelEvent), {
      passive: false,
    });
    this.listen(this.#stage, 'dragover', (event) => this.onDragOver(event as DragEvent));
    this.listen(this.#stage, 'drop', (event) => this.onDrop(event as DragEvent));
    this.listen(element, 'keydown', (event) => this.onKeyDown(event as KeyboardEvent));
    this.listen(element, 'keyup', (event) => {
      if ((event as KeyboardEvent).code === 'Space') {
        this.#space = false;
        this.#stage.classList.remove('is-space');
      }
    });
    this.listen(this.#toolbar, 'click', (event) => this.onToolbarClick(event));
    this.listen(this.#menu, 'click', (event) => this.onMenuClick(event));
    this.listen(this.#simulation, 'click', (event) => this.onSimulationClick(event));
    this.listen(this.#simulation, 'change', (event) => {
      const select = (event.target as Element).closest<HTMLSelectElement>('[data-bp-sim-trigger]');
      if (select !== null) this.#simulationTrigger = select.value;
    });
    this.listen(ownerDocument, 'pointerdown', (event) => {
      if (!this.#menu.hidden && !event.composedPath().includes(this.#menu)) this.closeMenu();
    });
    this.renderToolbar();
    this.applyView();
    queueMicrotask(() => this.send({ type: 'ready' }));
  }

  destroy(): void {
    for (const [target, type, listener, options] of this.#listeners) {
      target.removeEventListener(type, listener, options);
    }
    this.#listeners.length = 0;
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.#listeners.push([target, type, listener, options]);
  }

  // ── 协议 ──────────────────────────────────────────────────────────────

  private receive(state: BaseScreenBlueprintCanvasState): void {
    const previous = this.#state;
    this.#state = state;
    this.#selection = state.selection;
    if (previous === undefined || previous.documentRevision !== state.documentRevision) {
      this.#positions.clear();
    }
    if (!this.#viewInitialized && state.graph.viewport !== undefined) {
      this.#view = {
        x: state.graph.viewport.x,
        y: state.graph.viewport.y,
        z: clamp(state.graph.viewport.zoom, MIN_ZOOM, MAX_ZOOM),
      };
      this.#viewInitialized = true;
    }
    this.element.dataset.active = String(state.active);
    this.render();
    const request = state.viewRequest;
    if (request !== undefined && request.id !== this.#lastViewRequest) {
      this.#lastViewRequest = request.id;
      if (request.type === 'fit') this.fit();
      else if (request.type === 'auto-layout') this.autoLayout();
      else if (request.targetId !== undefined) this.focus(request.targetId);
    } else if (!this.#viewInitialized && state.graph.nodes.length > 0) {
      this.#viewInitialized = true;
      this.fit();
    }
  }

  private send(
    command: DistributiveOmit<
      BaseScreenBlueprintCanvasCommand,
      'commandId' | 'generation' | 'documentRevision'
    >,
  ): void {
    const state = this.#state;
    const full = {
      ...command,
      commandId: `default-canvas-${++this.#commandSeq}`,
      generation: state?.generation ?? 0,
      documentRevision: state?.documentRevision ?? 0,
    } as BaseScreenBlueprintCanvasCommand;
    this.element.dispatchEvent(
      new CustomEvent<BaseScreenBlueprintCanvasCommandEventDetail>(
        BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
        { bubbles: true, composed: true, detail: { command: full } },
      ),
    );
  }

  private select(selection: BaseScreenBlueprintCanvasSelection): void {
    this.#selection = selection;
    this.renderSelection();
    this.send({ type: 'select', selection });
  }

  // ── 几何 ──────────────────────────────────────────────────────────────

  private get graph(): BaseScreenBlueprintCanvasState['graph'] {
    return this.#state?.graph ?? { nodes: [], edges: [] };
  }

  private node(id: string): BaseScreenBlueprintCanvasNode | undefined {
    return this.graph.nodes.find((node) => node.id === id);
  }

  private position(node: BaseScreenBlueprintCanvasNode): Point {
    return this.#positions.get(node.id) ?? { x: node.x, y: node.y };
  }

  private rows(
    node: BaseScreenBlueprintCanvasNode,
  ): readonly (BaseScreenBlueprintCanvasPort | 'semantic')[] {
    return [...node.outputs, ...node.inputs, ...(node.semantic ? (['semantic'] as const) : [])];
  }

  private height(node: BaseScreenBlueprintCanvasNode): number {
    return Math.max(
      MIN_NODE_HEIGHT,
      HEADER_HEIGHT + BODY_TOP + this.rows(node).length * ROW_HEIGHT + BODY_BOTTOM + NODE_BORDER,
    );
  }

  private portPoint(
    node: BaseScreenBlueprintCanvasNode,
    port: string,
    direction: 'in' | 'out',
  ): Point {
    const rows = this.rows(node);
    const index = Math.max(
      0,
      rows.findIndex((row) =>
        port === 'semantic'
          ? row === 'semantic'
          : row !== 'semantic' && row.id === port && row.direction === direction,
      ),
    );
    const origin = this.position(node);
    return {
      x:
        direction === 'out'
          ? origin.x + NODE_WIDTH + PORT_EDGE_OFFSET
          : origin.x - PORT_EDGE_OFFSET,
      y: origin.y + 1 + HEADER_HEIGHT + BODY_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2,
    };
  }

  private toWorld(clientX: number, clientY: number): Point {
    const rect = this.#stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.#view.x) / this.#view.z,
      y: (clientY - rect.top - this.#view.y) / this.#view.z,
    };
  }

  private visibleEdge(edge: BaseScreenBlueprintCanvasEdge): boolean {
    return edge.kind !== 'semantic' || (this.#showSemantic && (this.#state?.showSemantic ?? true));
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────

  private render(): void {
    this.renderNodes();
    this.renderEdges();
    this.renderToolbar();
    this.renderSimulation();
    const empty = this.graph.nodes.length === 0;
    this.#empty.hidden = !empty;
    if (empty) {
      this.#empty.innerHTML = `<strong>${escapeHtml(DESIGNER_UI_TEXT.blueprint.directNodeHint)}</strong>`;
    }
  }

  private renderNodes(): void {
    const trace = this.#showTrace ? this.#state?.trace : null;
    this.#tracedNodes = new Set(trace?.visitedNodeIds ?? []);
    const connected = this.connectedPorts();
    const categories = this.portCategories();
    const markup = this.graph.nodes
      .map((node) => {
        const position = this.position(node);
        const rows = this.rows(node)
          .map((row) => {
            if (row === 'semantic') {
              const used = connected.has(`${node.id}\u0000semantic`);
              return `<div class="bp-anchor bp-anchor-semantic"><span class="bp-port bp-port-semantic${used ? ' is-used' : ''}" data-bp-node="${escapeAttribute(node.id)}" data-bp-port="semantic" data-bp-dir="in"></span><span class="bp-anchor-label">${escapeHtml(TEXT.ports.semantic ?? '')}</span><span class="bp-port bp-port-semantic${used ? ' is-used' : ''}" data-bp-node="${escapeAttribute(node.id)}" data-bp-port="semantic" data-bp-dir="out"></span></div>`;
            }
            const tip =
              row.unavailableReason === undefined ? row.id : `${row.id} · ${row.unavailableReason}`;
            const category = categories.get(`${node.id}\u0000${row.direction}\u0000${row.id}`);
            return `<div class="bp-anchor" data-dir="${row.direction}" data-available="${String(row.available)}" title="${escapeAttribute(tip)}"><span class="bp-port${row.connected ? ' is-used' : ''}" data-bp-node="${escapeAttribute(node.id)}" data-bp-port="${escapeAttribute(row.id)}" data-bp-dir="${row.direction}" data-available="${String(row.available)}"${category === undefined ? '' : ` data-category="${category}"`}></span><span class="bp-anchor-label">${escapeHtml(row.label)}</span></div>`;
          })
          .join('');
        // 从画布按显示方式称呼（页面 / 弹框），图标也随之区分；锚点 id 不变（ADR-0109 D2）。
        const kindName =
          node.kind === 'sub-canvas' && node.canvasDisplay !== undefined
            ? TEXT.subCanvasKinds[node.canvasDisplay]
            : TEXT.nodeKinds[node.kind];
        const kindIcon: DesignerIconName =
          node.kind === 'sub-canvas' && node.canvasDisplay === 'page'
            ? 'doc'
            : KIND_ICONS[node.kind];
        const title =
          this.#renaming === node.id
            ? `<input class="bp-rename" data-bp-rename-input value="${escapeAttribute(node.name ?? node.title)}" maxlength="64" aria-label="${escapeAttribute(TEXT.nodeName)}">`
            : escapeHtml(node.title);
        return `<div class="bp-node" data-bp-node-id="${escapeAttribute(node.id)}" data-kind="${node.kind}" data-enabled="${String(node.enabled)}" style="left:${position.x}px;top:${position.y}px;min-height:${this.height(node)}px" role="group" aria-label="${escapeAttribute(`${kindName} ${node.title}`)}">
          <div class="bp-node-header" data-bp-drag="${escapeAttribute(node.id)}" title="${escapeAttribute(`${node.title} · ${node.subtitle}`)}"><span class="bp-node-icon" aria-hidden="true">${designerIcon(kindIcon)}</span><span class="bp-node-heading"><span class="bp-node-title" data-bp-rename="${escapeAttribute(node.id)}">${title}</span>${
            // 类型名与标题相同（业务系统、实例就绪、未改名的条件判断）时不重复一行。
            node.title === kindName
              ? ''
              : `<span class="bp-node-kind">${escapeHtml(kindName)}</span>`
          }</span></div>
          <div class="bp-node-content">${rows}</div>
        </div>`;
      })
      .join('');
    if (markup === this.#nodesMarkup) {
      this.applyNodeState();
      return;
    }
    this.#nodesMarkup = markup;
    this.#nodes.innerHTML = markup;
    this.applyNodeState();
    const input = this.#nodes.querySelector<HTMLInputElement>('[data-bp-rename-input]');
    if (input !== null) {
      input.focus();
      input.select();
      input.addEventListener('pointerdown', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') input.blur();
        if (event.key === 'Escape') {
          this.#renaming = undefined;
          this.renderNodes();
        }
      });
      input.addEventListener('blur', () => this.finishRename(input.value));
    }
  }

  private connectedPorts(): ReadonlySet<string> {
    const set = new Set<string>();
    for (const edge of this.graph.edges) {
      if (edge.kind === 'semantic') {
        set.add(`${edge.source}\u0000semantic`);
        set.add(`${edge.target}\u0000semantic`);
      }
    }
    return set;
  }

  /** 锚点 → 第一条接上它的连线类别：接上连线的锚点染成连线同色。 */
  private portCategories(): ReadonlyMap<string, string> {
    const map = new Map<string, string>();
    for (const edge of this.graph.edges) {
      if (edge.kind === 'semantic') continue;
      const out = `${edge.source}\u0000out\u0000${edge.sourcePort}`;
      const input = `${edge.target}\u0000in\u0000${edge.targetPort}`;
      if (!map.has(out)) map.set(out, edge.category);
      if (!map.has(input)) map.set(input, edge.category);
    }
    return map;
  }

  private renderEdges(ghost?: { readonly from: Point; readonly to: Point }): void {
    const trace = this.#showTrace ? this.#state?.trace : null;
    const traced = new Set(trace?.executedEdgeIds ?? []);
    let paths = '';
    let labels = '';
    for (const edge of this.graph.edges) {
      if (!this.visibleEdge(edge)) continue;
      const source = this.node(edge.source);
      const target = this.node(edge.target);
      if (source === undefined || target === undefined) continue;
      const curve = bezier(
        this.portPoint(source, edge.sourcePort, 'out'),
        this.portPoint(target, edge.targetPort, 'in'),
      );
      // 选中 / 悬停不进标记，由 applyEdgeState 切换类名。
      const classes = [
        'bp-edge',
        `is-${edge.kind}`,
        edge.active ? '' : 'is-off',
        traced.has(edge.id) ? 'is-traced' : '',
      ]
        .filter((name) => name !== '')
        .join(' ');
      // 主线 / 轨迹流动虚线 / 方向箭头 / 命中区；中性灰，选中链路与轨迹换强调色（见连线样式）。
      paths += `<g class="${classes}" data-bp-edge-group="${escapeAttribute(edge.id)}" data-bp-edge-source="${escapeAttribute(edge.source)}" data-bp-edge-target="${escapeAttribute(edge.target)}" data-category="${edge.category}"><path class="bp-edge-line" d="${curve.d}"/><path class="bp-edge-flow" d="${curve.d}"/><path class="bp-edge-arrow" d="M-4.5,-4 L4,0 L-4.5,4 L-2.5,0 Z" transform="translate(${curve.mid.x} ${curve.mid.y}) rotate(${curve.angle})"/><path class="bp-edge-hit" data-bp-edge="${escapeAttribute(edge.id)}" d="${curve.d}"/></g>`;
      const order =
        edge.order !== undefined && (edge.siblingCount ?? 1) > 1 ? `#${edge.order} ` : '';
      labels += `<div class="bp-edge-label" data-bp-edge-label="${escapeAttribute(edge.id)}" data-category="${edge.category}" style="left:${curve.mid.x}px;top:${curve.mid.y}px">${escapeHtml(order + edge.label)}</div>`;
    }
    if (ghost !== undefined) {
      paths += `<path class="bp-edge-ghost" d="${bezier(ghost.from, ghost.to).d}"/><circle class="bp-edge-ghost-end" cx="${ghost.to.x}" cy="${ghost.to.y}" r="4"/>`;
    }
    const markup = `${paths}\u0000${labels}`;
    if (markup !== this.#edgesMarkup) {
      this.#edgesMarkup = markup;
      this.#edges.innerHTML = paths;
      this.#labels.innerHTML = labels;
    }
    this.applyEdgeState();
  }

  /** 选中态只改属性：节点 / 连线的 DOM 保持不动（见 #nodesMarkup 注释）。 */
  private renderSelection(): void {
    this.applyNodeState();
    this.applyEdgeState();
  }

  /**
   * 聚焦：有选中时，与选中节点 / 连线直接相连的节点与连线保持原样，其余淡出，
   * 选中链路上的连线显示流动方向。只改属性，不重建 DOM。
   */
  private focusSets(): {
    readonly nodes: ReadonlySet<string>;
    readonly edges: ReadonlySet<string>;
  } {
    const selectedNodes = new Set(this.#selection.nodes);
    const selectedEdges = new Set(this.#selection.edges);
    const nodes = new Set<string>();
    const edges = new Set<string>();
    for (const edge of this.graph.edges) {
      if (!this.visibleEdge(edge)) continue;
      if (
        selectedEdges.has(edge.id) ||
        selectedNodes.has(edge.source) ||
        selectedNodes.has(edge.target)
      ) {
        edges.add(edge.id);
        nodes.add(edge.source);
        nodes.add(edge.target);
      }
    }
    return { nodes, edges };
  }

  private applyFocus(): void {
    const total = this.#selection.nodes.length + this.#selection.edges.length;
    this.#stage.dataset.focus = String(total > 0);
  }

  private applyNodeState(): void {
    this.applyFocus();
    const related = this.focusSets().nodes;
    for (const element of this.#nodes.querySelectorAll<HTMLElement>('[data-bp-node-id]')) {
      const id = element.dataset.bpNodeId ?? '';
      const selected = this.#selection.nodes.includes(id);
      element.dataset.selected = String(selected);
      element.dataset.related = String(!selected && related.has(id));
      element.dataset.traced = String(this.#tracedNodes.has(id) && !selected);
    }
  }

  private applyEdgeState(): void {
    this.applyFocus();
    const selected = new Set(this.#selection.edges);
    const related = this.focusSets().edges;
    for (const group of this.#edges.querySelectorAll<SVGGElement>('[data-bp-edge-group]')) {
      const id = group.dataset.bpEdgeGroup ?? '';
      group.classList.toggle('is-selected', selected.has(id));
      group.classList.toggle('is-related', related.has(id));
      group.classList.toggle('is-hover', id === this.#hoverEdge);
    }
    for (const label of this.#labels.querySelectorAll<HTMLElement>('[data-bp-edge-label]')) {
      const id = label.dataset.bpEdgeLabel ?? '';
      label.classList.toggle('is-selected', selected.has(id));
      label.classList.toggle('is-visible', id === this.#hoverEdge);
    }
  }

  private setHoverEdge(id: string | undefined): void {
    if (this.#hoverEdge === id) return;
    this.#hoverEdge = id;
    for (const group of this.#edges.querySelectorAll<SVGGElement>('[data-bp-edge-group]')) {
      group.classList.toggle('is-hover', group.dataset.bpEdgeGroup === id);
    }
    for (const label of this.#labels.querySelectorAll<HTMLElement>('[data-bp-edge-label]')) {
      label.classList.toggle('is-visible', label.dataset.bpEdgeLabel === id);
    }
  }

  private renderToolbar(): void {
    const state = this.#state;
    const toolbar = DESIGNER_UI_TEXT.blueprint.graph.toolbar;
    const button = (action: string, icon: DesignerIconName, label: string, extra = '') =>
      `<button type="button" class="designer-control designer-button bp-tool" data-bp-tool="${action}" aria-label="${escapeAttribute(label)}" data-tip="${escapeAttribute(label)}"${extra}>${designerIcon(icon)}</button>`;
    const errors = state?.diagnostics.filter((item) => item.severity === 'error').length ?? 0;
    const markup = `<div class="bp-tool-group">
        <button type="button" class="designer-control designer-button bp-tool bp-tool-wide" data-bp-tool="add" aria-haspopup="menu" aria-label="${escapeAttribute(toolbar.addNode)}" data-tip="${escapeAttribute(toolbar.addNode)}">${designerIcon('plus')}<span>${escapeHtml(toolbar.addNode)}</span></button>
        ${button('auto-layout', 'grid', toolbar.autoLayout)}
      </div>
      <div class="bp-tool-group">
        ${button('undo', 'undo', DESIGNER_UI_TEXT.blueprint.graph.toolbar.undo, state?.canUndo === true ? '' : ' disabled')}
        ${button('redo', 'redo', DESIGNER_UI_TEXT.blueprint.graph.toolbar.redo, state?.canRedo === true ? '' : ' disabled')}
      </div>
      <div class="bp-tool-group">
        ${button('semantic', 'link', toolbar.semantic, ` aria-pressed="${String(this.#showSemantic)}"`)}
        ${button('trace', 'activity', toolbar.highlightTrace, ` aria-pressed="${String(this.#showTrace)}"`)}
        <span class="bp-tool-status" data-state="${errors === 0 ? 'ok' : 'error'}" aria-live="polite">${designerIcon(errors === 0 ? 'check-circle' : 'x-circle')}<span>${escapeHtml(errors === 0 ? DESIGNER_UI_TEXT.blueprint.problemsHealthy : `${DESIGNER_UI_TEXT.blueprint.problemsTitle} ${errors}`)}</span></span>
      </div>
      <div class="bp-tool-group bp-tool-group-end">
        ${button('zoom-out', 'zoom-out', toolbar.zoomOut)}
        <span class="bp-zoom-value" data-bp-zoom>${Math.round(this.#view.z * 100)}%</span>
        ${button('zoom-in', 'zoom-in', toolbar.zoomIn)}
        ${button('fit', 'fit', toolbar.fit)}
        <button type="button" class="designer-control designer-button bp-tool bp-tool-wide" data-bp-tool="simulate" data-variant="${this.#simulationOpen ? 'primary' : 'neutral'}" aria-pressed="${String(this.#simulationOpen)}" aria-label="${escapeAttribute(toolbar.simulate)}" data-tip="${escapeAttribute(toolbar.simulate)}">${designerIcon('play')}<span>${escapeHtml(toolbar.simulate)}</span></button>
      </div>`;
    // 结构没变就不重建：按住工具栏按钮时被换掉同样会丢 click。
    if (markup === this.#toolbarMarkup) return;
    this.#toolbarMarkup = markup;
    this.#toolbar.innerHTML = markup;
    adoptDesignerFormControls(this.#toolbar);
  }

  private renderSimulation(): void {
    this.#simulation.hidden = !this.#simulationOpen;
    if (!this.#simulationOpen) {
      this.#simulationMarkup = '';
      return;
    }
    const text = TEXT.simulation;
    const triggers = this.#state?.simulationTriggers ?? [];
    const key = (trigger: { nodeId: string; port: string }) =>
      `${trigger.nodeId}\u0000${trigger.port}`;
    if (
      this.#simulationTrigger === undefined ||
      !triggers.some((trigger) => key(trigger) === this.#simulationTrigger)
    ) {
      this.#simulationTrigger = triggers[0] === undefined ? undefined : key(triggers[0]);
    }
    const existing = this.#simulation.querySelector<HTMLTextAreaElement>('[data-bp-sim-payload]');
    const payload = existing?.value ?? '{}';
    const markup =
      triggers.length === 0
        ? `<p class="bp-simulation-empty">${escapeHtml(text.noTriggers)}</p>`
        : `<label class="designer-field"><span class="designer-field-label">${escapeHtml(text.trigger)}</span><select class="designer-control designer-select" data-bp-sim-trigger>${triggers
            .map(
              (trigger) =>
                `<option value="${escapeAttribute(key(trigger))}"${key(trigger) === this.#simulationTrigger ? ' selected' : ''}>${escapeHtml(trigger.label)}</option>`,
            )
            .join('')}</select></label>
          <label class="designer-field bp-simulation-payload"><span class="designer-field-label">${escapeHtml(text.payload)}</span><textarea class="designer-control designer-input" data-bp-sim-payload rows="2" spellcheck="false">${escapeHtml(payload)}</textarea></label>
          <div class="bp-simulation-actions">
            <button type="button" class="designer-control designer-button" data-variant="primary" data-bp-sim="run">${designerIcon('play')}<span>${escapeHtml(text.run)}</span></button>
            <button type="button" class="designer-control designer-button" data-bp-sim="clear"${this.#state?.trace === null ? ' disabled' : ''}>${escapeHtml(text.clear)}</button>
          </div>
          <p class="bp-simulation-message" data-bp-sim-message aria-live="polite"></p>`;
    if (markup === this.#simulationMarkup) return;
    this.#simulationMarkup = markup;
    this.#simulation.innerHTML = markup;
    adoptDesignerFormControls(this.#simulation);
  }

  private applyView(): void {
    this.#world.style.transform = `translate(${this.#view.x}px, ${this.#view.y}px) scale(${this.#view.z})`;
    // 只移动点阵层（见 .bp-stage 背景注释）；光晕层固定。
    this.#stage.style.setProperty('--bp-pan-x', `${this.#view.x}px`);
    this.#stage.style.setProperty('--bp-pan-y', `${this.#view.y}px`);
    this.#stage.style.setProperty('--bp-zoom', String(this.#view.z));
    this.#stage.dataset.zoomFar = String(this.#view.z < 0.6);
    const zoom = this.#toolbar.querySelector<HTMLElement>('[data-bp-zoom]');
    if (zoom !== null) zoom.textContent = `${Math.round(this.#view.z * 100)}%`;
  }

  private zoomAt(factor: number, x: number, y: number): void {
    const zoom = clamp(this.#view.z * factor, MIN_ZOOM, MAX_ZOOM);
    const ratio = zoom / this.#view.z;
    this.#view = { x: x - (x - this.#view.x) * ratio, y: y - (y - this.#view.y) * ratio, z: zoom };
    this.applyView();
  }

  private fit(): void {
    const nodes = this.graph.nodes;
    const rect = this.#stage.getBoundingClientRect();
    if (nodes.length === 0 || rect.width === 0 || rect.height === 0) return;
    const boxes = nodes.map((node) => ({ ...this.position(node), h: this.height(node) }));
    const x0 = Math.min(...boxes.map((box) => box.x));
    const y0 = Math.min(...boxes.map((box) => box.y));
    const x1 = Math.max(...boxes.map((box) => box.x + NODE_WIDTH));
    const y1 = Math.max(...boxes.map((box) => box.y + box.h));
    const pad = 32;
    const zoom = clamp(
      Math.min((rect.width - pad * 2) / (x1 - x0), (rect.height - pad * 2) / (y1 - y0)),
      MIN_ZOOM,
      1.1,
    );
    this.#view = {
      z: zoom,
      x: pad + (rect.width - pad * 2 - (x1 - x0) * zoom) / 2 - x0 * zoom,
      y: pad + (rect.height - pad * 2 - (y1 - y0) * zoom) / 2 - y0 * zoom,
    };
    this.applyView();
  }

  private focus(targetId: string): void {
    const node = this.node(targetId);
    const edge = this.graph.edges.find((candidate) => candidate.id === targetId);
    const anchor = node ?? (edge === undefined ? undefined : this.node(edge.source));
    if (anchor === undefined) return;
    const rect = this.#stage.getBoundingClientRect();
    const position = this.position(anchor);
    this.#view = {
      ...this.#view,
      x: rect.width / 2 - (position.x + NODE_WIDTH / 2) * this.#view.z,
      y: rect.height / 2 - (position.y + this.height(anchor) / 2) * this.#view.z,
    };
    this.applyView();
    const element = this.#nodes.querySelector<HTMLElement>(
      `[data-bp-node-id="${cssEscape(anchor.id)}"]`,
    );
    element?.classList.add('is-flash');
    setTimeout(() => element?.classList.remove('is-flash'), 600);
  }

  /** 按 flow 连线分层：列 = 最长上游路径，列内按当前纵坐标排序后等距堆叠。 */
  private autoLayout(): void {
    const nodes = this.graph.nodes;
    const depth = new Map(nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < nodes.length; pass++) {
      let changed = false;
      for (const edge of this.graph.edges) {
        if (edge.kind !== 'flow') continue;
        const next = Math.min((depth.get(edge.source) ?? 0) + 1, 24);
        if (next > (depth.get(edge.target) ?? 0)) {
          depth.set(edge.target, next);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const columns = new Map<number, BaseScreenBlueprintCanvasNode[]>();
    for (const node of nodes) {
      const column = depth.get(node.id) ?? 0;
      const list = columns.get(column) ?? [];
      list.push(node);
      columns.set(column, list);
    }
    for (const [column, list] of columns) {
      let y = 24;
      list.sort((left, right) => this.position(left).y - this.position(right).y);
      for (const node of list) {
        this.#positions.set(node.id, { x: 40 + column * 248, y });
        y += this.height(node) + NODE_GAP;
      }
    }
    this.render();
    this.fit();
    this.commitLayout();
  }

  private commitLayout(): void {
    const nodes: ScreenBlueprintLayoutNode[] = this.graph.nodes.map((node) => {
      const position = this.position(node);
      return { id: node.id, x: Math.round(position.x), y: Math.round(position.y) };
    });
    this.send({
      type: 'commit-layout',
      nodes,
      viewport: {
        x: Math.round(this.#view.x),
        y: Math.round(this.#view.y),
        zoom: Math.round(this.#view.z * 1000) / 1000,
      },
    });
  }

  // ── 手势 ──────────────────────────────────────────────────────────────

  private onPointerDown(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-bp-rename-input]') !== null && target !== null) return;
    this.element.focus({ preventScroll: true });
    this.closeMenu();
    const port = target?.closest<HTMLElement>('[data-bp-port]') ?? null;
    const edgeHit = target?.closest<SVGElement>('[data-bp-edge]') ?? null;
    const nodeElement = target?.closest<HTMLElement>('[data-bp-node-id]') ?? null;
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.button === 2) {
      this.#drag = {
        type: 'context',
        startX: event.clientX,
        startY: event.clientY,
        viewX: this.#view.x,
        viewY: this.#view.y,
        moved: false,
        target,
        additive,
      };
      this.#stage.setPointerCapture(event.pointerId);
      return;
    }
    if (this.#space || event.button === 1) {
      this.#drag = {
        type: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        viewX: this.#view.x,
        viewY: this.#view.y,
        moved: false,
        target,
        additive,
      };
      this.#stage.classList.add('is-panning');
      this.#stage.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (port !== null) {
      const node = this.node(port.dataset.bpNode ?? '');
      const portId = port.dataset.bpPort;
      const direction = port.dataset.bpDir === 'in' ? 'in' : 'out';
      if (node !== undefined && portId !== undefined && port.dataset.available !== 'false') {
        const from = { node: node.id, port: portId };
        this.#drag = {
          type: 'link',
          from,
          direction,
          anchor: this.portPoint(node, portId, direction),
          snap: undefined,
        };
        this.#stage.classList.add('is-connecting');
        this.markConnectable(from, direction);
        this.#stage.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (nodeElement !== null) {
      const id = nodeElement.dataset.bpNodeId ?? '';
      if (additive) {
        const nodes = this.#selection.nodes.includes(id)
          ? this.#selection.nodes.filter((candidate) => candidate !== id)
          : [...this.#selection.nodes, id];
        this.select({ nodes, edges: this.#selection.edges });
        return;
      }
      if (!this.#selection.nodes.includes(id)) this.select({ nodes: [id], edges: [] });
      const ids = this.#selection.nodes;
      this.#drag = {
        type: 'node',
        ids,
        origins: ids.map((nodeId) => {
          const node = this.node(nodeId);
          return node === undefined ? { x: 0, y: 0 } : this.position(node);
        }),
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      this.#stage.setPointerCapture(event.pointerId);
      return;
    }
    if (edgeHit !== null) {
      const id = edgeHit.dataset.bpEdge ?? '';
      this.select(
        additive
          ? {
              nodes: this.#selection.nodes,
              edges: this.#selection.edges.includes(id)
                ? this.#selection.edges.filter((candidate) => candidate !== id)
                : [...this.#selection.edges, id],
            }
          : { nodes: [], edges: [id] },
      );
      return;
    }
    this.#drag = {
      type: 'marquee',
      startX: event.clientX,
      startY: event.clientY,
      world: this.toWorld(event.clientX, event.clientY),
      moved: false,
      additive,
      base: this.#selection.nodes,
    };
    this.#stage.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === undefined) {
      const hit = (event.target as Element | null)?.closest<SVGElement>('[data-bp-edge]');
      this.setHoverEdge(hit?.dataset.bpEdge);
      return;
    }
    if (drag.type === 'pan' || drag.type === 'context') {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && dx * dx + dy * dy < MENU_CLICK_TOLERANCE * MENU_CLICK_TOLERANCE) return;
      drag.moved = true;
      this.#stage.classList.add('is-panning');
      this.#view = { ...this.#view, x: drag.viewX + dx, y: drag.viewY + dy };
      this.applyView();
      return;
    }
    if (drag.type === 'node') {
      const dx = (event.clientX - drag.startX) / this.#view.z;
      const dy = (event.clientY - drag.startY) / this.#view.z;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 2) return;
      drag.moved = true;
      drag.ids.forEach((id, index) => {
        const origin = drag.origins[index] ?? { x: 0, y: 0 };
        const next = {
          x: Math.round((origin.x + dx) / GRID) * GRID,
          y: Math.round((origin.y + dy) / GRID) * GRID,
        };
        this.#positions.set(id, next);
        const element = this.#nodes.querySelector<HTMLElement>(
          `[data-bp-node-id="${cssEscape(id)}"]`,
        );
        if (element !== null) {
          element.style.left = `${next.x}px`;
          element.style.top = `${next.y}px`;
        }
      });
      // 拖动直接改了节点 DOM：作废结构标记，下一次 renderNodes 一定按当前位置重写。
      this.#nodesMarkup = '';
      this.renderEdges();
      return;
    }
    if (drag.type === 'link') {
      const wanted = drag.direction === 'out' ? 'in' : 'out';
      let best: HTMLElement | undefined;
      let bestDistance = SNAP_DISTANCE * SNAP_DISTANCE;
      for (const port of this.#nodes.querySelectorAll<HTMLElement>(
        `[data-bp-dir="${wanted}"]:not(.is-blocked)`,
      )) {
        const rect = port.getBoundingClientRect();
        const distance =
          (rect.left + rect.width / 2 - event.clientX) ** 2 +
          (rect.top + rect.height / 2 - event.clientY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = port;
        }
      }
      for (const port of this.#nodes.querySelectorAll('.is-snap')) port.classList.remove('is-snap');
      best?.classList.add('is-snap');
      drag.snap =
        best === undefined
          ? undefined
          : { node: best.dataset.bpNode ?? '', port: best.dataset.bpPort ?? '' };
      const snapNode = drag.snap === undefined ? undefined : this.node(drag.snap.node);
      const end =
        snapNode === undefined || drag.snap === undefined
          ? this.toWorld(event.clientX, event.clientY)
          : this.portPoint(snapNode, drag.snap.port, wanted);
      this.renderEdges(
        drag.direction === 'out' ? { from: drag.anchor, to: end } : { from: end, to: drag.anchor },
      );
      return;
    }
    if (drag.type !== 'marquee') return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < 16) return;
    drag.moved = true;
    const rect = this.#stage.getBoundingClientRect();
    this.#marquee.hidden = false;
    Object.assign(this.#marquee.style, {
      left: `${Math.min(event.clientX, drag.startX) - rect.left}px`,
      top: `${Math.min(event.clientY, drag.startY) - rect.top}px`,
      width: `${Math.abs(dx)}px`,
      height: `${Math.abs(dy)}px`,
    });
    const point = this.toWorld(event.clientX, event.clientY);
    const x0 = Math.min(point.x, drag.world.x);
    const x1 = Math.max(point.x, drag.world.x);
    const y0 = Math.min(point.y, drag.world.y);
    const y1 = Math.max(point.y, drag.world.y);
    const hits = this.graph.nodes
      .filter((node) => {
        const position = this.position(node);
        return (
          position.x < x1 &&
          position.x + NODE_WIDTH > x0 &&
          position.y < y1 &&
          position.y + this.height(node) > y0
        );
      })
      .map((node) => node.id);
    this.#selection = {
      nodes: drag.additive ? [...new Set([...drag.base, ...hits])] : hits,
      edges: [],
    };
    this.renderSelection();
  }

  private onPointerUp(event: PointerEvent): void {
    const drag = this.#drag;
    this.#drag = undefined;
    this.#stage.classList.remove('is-panning');
    if (drag === undefined) return;
    if (drag.type === 'context') {
      if (!drag.moved) this.openMenu(event.clientX, event.clientY, drag.target, drag.additive);
      return;
    }
    if (drag.type === 'link') {
      this.#stage.classList.remove('is-connecting');
      for (const port of this.#nodes.querySelectorAll('.is-blocked, .is-snap')) {
        port.classList.remove('is-blocked', 'is-snap');
      }
      const target = drag.snap;
      if (target !== undefined) {
        const [from, to] = drag.direction === 'out' ? [drag.from, target] : [target, drag.from];
        this.send({ type: 'connect', from, to });
      }
      this.renderEdges();
      return;
    }
    if (drag.type === 'node') {
      if (drag.moved) this.commitLayout();
      return;
    }
    if (drag.type === 'marquee') {
      this.#marquee.hidden = true;
      if (!drag.moved) {
        if (!drag.additive) this.select({ nodes: [], edges: [] });
      } else {
        this.select(this.#selection);
      }
    }
  }

  private cancelDrag(): void {
    this.#drag = undefined;
    this.#marquee.hidden = true;
    this.#stage.classList.remove('is-panning', 'is-connecting');
    this.renderEdges();
  }

  /** 连线拖动时把不能接受的锚点淡显（方向不符、同节点、语义 / flow 不匹配、不可用）。 */
  private markConnectable(from: PortRef, direction: 'in' | 'out'): void {
    const wanted = direction === 'out' ? 'in' : 'out';
    const semantic = from.port === 'semantic';
    for (const port of this.#nodes.querySelectorAll<HTMLElement>('[data-bp-port]')) {
      const blocked =
        port.dataset.bpDir !== wanted ||
        port.dataset.bpNode === from.node ||
        (port.dataset.bpPort === 'semantic') !== semantic ||
        port.dataset.available === 'false';
      port.classList.toggle('is-blocked', blocked);
    }
  }

  private onDoubleClick(event: MouseEvent): void {
    const target = this.#document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-bp-rename]');
    const id =
      target?.dataset.bpRename ??
      (event.target as Element | null)?.closest<HTMLElement>('[data-bp-rename]')?.dataset.bpRename;
    if (id !== undefined) {
      event.preventDefault();
      this.startRename(id);
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = this.#stage.getBoundingClientRect();
      this.zoomAt(
        event.deltaY < 0 ? 1.1 : 1 / 1.1,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      return;
    }
    this.#view = {
      ...this.#view,
      x: this.#view.x - (event.shiftKey ? event.deltaY : event.deltaX),
      y: this.#view.y - (event.shiftKey ? 0 : event.deltaY),
    };
    this.applyView();
  }

  private onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME) !== true) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  private onDrop(event: DragEvent): void {
    const raw = event.dataTransfer?.getData(BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME);
    if (raw === undefined || raw === '') return;
    event.preventDefault();
    let payload: BaseScreenBlueprintCanvasInsertNode;
    try {
      payload = JSON.parse(raw) as BaseScreenBlueprintCanvasInsertNode;
    } catch {
      return;
    }
    const point = this.toWorld(event.clientX, event.clientY);
    this.send({
      type: 'insert-node',
      ...payload,
      position: {
        x: Math.round(point.x - NODE_WIDTH / 2),
        y: Math.round(point.y - HEADER_HEIGHT / 2),
      },
    } as never);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if ((event.target as Element | null)?.closest('input, textarea, select') !== null) return;
    const mod = event.ctrlKey || event.metaKey;
    if (event.code === 'Space') {
      this.#space = true;
      this.#stage.classList.add('is-space');
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      if (!this.#menu.hidden) this.closeMenu();
      else this.select({ nodes: [], edges: [] });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.#selection.nodes.length + this.#selection.edges.length === 0) return;
      event.preventDefault();
      this.send({ type: 'delete-selection', selection: this.#selection });
      return;
    }
    if (event.key === 'F2' && this.#selection.nodes.length === 1) {
      event.preventDefault();
      this.startRename(this.#selection.nodes[0] ?? '');
      return;
    }
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'a') {
      event.preventDefault();
      this.select({ nodes: this.graph.nodes.map((node) => node.id), edges: [] });
    } else if (key === 'd') {
      event.preventDefault();
      if (this.#selection.nodes.length > 0) {
        this.send({ type: 'duplicate-nodes', nodeIds: this.#selection.nodes });
      }
    } else if (key === '0') {
      event.preventDefault();
      this.fit();
    } else if (key === 'z') {
      event.preventDefault();
      this.send({ type: event.shiftKey ? 'history-redo' : 'history-undo' });
    } else if (key === 'y') {
      event.preventDefault();
      this.send({ type: 'history-redo' });
    }
  }

  private startRename(id: string): void {
    const node = this.node(id);
    if (node === undefined || !node.renamable) return;
    this.#renaming = id;
    this.renderNodes();
  }

  private finishRename(value: string): void {
    const id = this.#renaming;
    this.#renaming = undefined;
    const node = id === undefined ? undefined : this.node(id);
    if (node !== undefined) {
      const name = value.trim();
      if (name !== (node.name ?? '') && name !== node.title) {
        this.send({
          type: 'update-node',
          nodeIds: [node.id],
          update: { type: 'name', name: name === '' ? null : name },
        });
      }
    }
    this.renderNodes();
  }

  // ── 工具栏 / 右键菜单 / 模拟 ─────────────────────────────────────────

  private onToolbarClick(event: Event): void {
    const tool = (event.target as Element).closest<HTMLButtonElement>('[data-bp-tool]');
    if (tool === null || tool.disabled) return;
    const rect = this.#stage.getBoundingClientRect();
    switch (tool.dataset.bpTool) {
      case 'add': {
        const box = tool.getBoundingClientRect();
        this.#contextPoint = this.toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        this.openAddMenu(box.left, box.bottom + 4);
        break;
      }
      case 'auto-layout':
        this.autoLayout();
        break;
      case 'undo':
        this.send({ type: 'history-undo' });
        break;
      case 'redo':
        this.send({ type: 'history-redo' });
        break;
      case 'semantic':
        this.#showSemantic = !this.#showSemantic;
        this.render();
        break;
      case 'trace':
        this.#showTrace = !this.#showTrace;
        this.render();
        break;
      case 'zoom-in':
        this.zoomAt(1.1, rect.width / 2, rect.height / 2);
        break;
      case 'zoom-out':
        this.zoomAt(1 / 1.1, rect.width / 2, rect.height / 2);
        break;
      case 'fit':
        this.fit();
        break;
      case 'simulate':
        this.#simulationOpen = !this.#simulationOpen;
        this.renderToolbar();
        this.renderSimulation();
        break;
    }
  }

  private onSimulationClick(event: Event): void {
    const action = (event.target as Element).closest<HTMLButtonElement>('[data-bp-sim]')?.dataset
      .bpSim;
    if (action === 'clear') {
      this.send({ type: 'clear-simulation' });
      return;
    }
    if (action !== 'run' || this.#simulationTrigger === undefined) return;
    const [nodeId, port] = this.#simulationTrigger.split('\u0000');
    const textarea = this.#simulation.querySelector<HTMLTextAreaElement>('[data-bp-sim-payload]');
    let payload: ScreenJsonValue;
    try {
      payload = JSON.parse(textarea?.value.trim() || 'null') as ScreenJsonValue;
    } catch {
      const message = this.#simulation.querySelector<HTMLElement>('[data-bp-sim-message]');
      if (message !== null) message.textContent = TEXT.simulation.invalidPayload;
      return;
    }
    if (nodeId !== undefined && port !== undefined)
      this.send({ type: 'run-simulation', nodeId, port, payload });
  }

  private menuItem(
    action: string,
    icon: DesignerIconName,
    label: string,
    options: { readonly kbd?: string; readonly danger?: boolean; readonly disabled?: boolean } = {},
  ): string {
    return `<button type="button" class="designer-control designer-button designer-menu-item" role="menuitem" data-bp-menu-action="${escapeAttribute(action)}"${options.danger === true ? ' data-menu-tone="danger"' : ''}${options.disabled === true ? ' disabled' : ''}><span class="menu-item-icon" aria-hidden="true">${designerIcon(icon)}</span><span class="menu-item-label">${escapeHtml(label)}</span>${options.kbd === undefined ? '' : `<kbd>${escapeHtml(options.kbd)}</kbd>`}</button>`;
  }

  private addItems(): string {
    const present = new Set(this.graph.nodes.map((node) => node.kind));
    return ADDABLE_KINDS.map((kind) =>
      this.menuItem(`add:${kind}`, KIND_ICONS[kind], TEXT.nodeKinds[kind], {
        disabled: (kind === 'host' || kind === 'lifecycle') && present.has(kind),
      }),
    ).join('');
  }

  /**
   * 右键菜单（内容参考 LIGHT CHASER，样式用设计器 `.designer-context-menu`）：
   * 有选中时置顶删除，其后节点操作；最后是「在此处新增节点」与全选 / 自动布局 / 适应画布。
   */
  private openMenu(
    clientX: number,
    clientY: number,
    target: Element | null,
    additive: boolean,
  ): void {
    const nodeElement = target?.closest<HTMLElement>('[data-bp-node-id]') ?? null;
    const edgeHit = target?.closest<SVGElement>('[data-bp-edge]') ?? null;
    if (nodeElement !== null) {
      const id = nodeElement.dataset.bpNodeId ?? '';
      if (!this.#selection.nodes.includes(id)) this.select({ nodes: [id], edges: [] });
    } else if (edgeHit !== null) {
      const id = edgeHit.dataset.bpEdge ?? '';
      if (!this.#selection.edges.includes(id)) this.select({ nodes: [], edges: [id] });
    } else if (!additive && this.#selection.nodes.length + this.#selection.edges.length > 0) {
      this.select({ nodes: [], edges: [] });
    }
    this.#contextPoint = this.toWorld(clientX, clientY);
    const menu = TEXT.menu;
    const nodes = this.#selection.nodes.map((id) => this.node(id)).filter(isDefined);
    const single = nodes.length === 1 ? nodes[0] : undefined;
    let html = '';
    if (nodes.length > 1) {
      html += `<div class="designer-context-menu-heading"><span class="designer-context-menu-heading-icon" aria-hidden="true">${designerIcon('select-all')}</span><span class="designer-context-menu-heading-label">${escapeHtml(TEXT.multiSelection(nodes.length, this.#selection.edges.length))}</span></div>`;
    }
    if (nodes.length > 0) {
      const anyEnabled = nodes.some((node) => node.enabled);
      html += this.menuItem('delete', 'trash', menu.delete, { kbd: 'Delete', danger: true });
      if (single !== undefined) {
        html += this.menuItem('rename', 'pencil', menu.rename, {
          kbd: 'F2',
          disabled: !single.renamable,
        });
      }
      html += this.menuItem('duplicate', 'duplicate', menu.duplicate, {
        kbd: 'Ctrl D',
        disabled: !nodes.some((node) => node.duplicable),
      });
      html += this.menuItem(
        anyEnabled ? 'disable' : 'enable',
        anyEnabled ? 'eye-off' : 'eye',
        anyEnabled ? menu.disable : menu.enable,
      );
      const triggers = (this.#state?.simulationTriggers ?? []).filter(
        (trigger) => single !== undefined && trigger.nodeId === single.id,
      );
      if (single !== undefined && triggers.length > 0) {
        html += this.menuItem('simulate', 'play', menu.simulateFrom);
      }
      html += '<div class="designer-menu-separator" role="separator"></div>';
    } else if (this.#selection.edges.length > 0) {
      html += this.menuItem('delete', 'trash', menu.deleteEdge, { kbd: 'Delete', danger: true });
      html += '<div class="designer-menu-separator" role="separator"></div>';
    }
    html += `<div class="designer-menu-section-label">${escapeHtml(menu.addHere)}</div>`;
    html += this.addItems();
    html += '<div class="designer-menu-separator" role="separator"></div>';
    html += this.menuItem('select-all', 'select-all', menu.selectAll, { kbd: 'Ctrl A' });
    html += this.menuItem('auto-layout', 'grid', menu.autoLayout);
    html += this.menuItem('fit', 'fit', menu.fit, { kbd: 'Ctrl 0' });
    this.showMenu(html, clientX, clientY);
  }

  private openAddMenu(clientX: number, clientY: number): void {
    this.showMenu(
      `<div class="designer-menu-section-label">${escapeHtml(TEXT.toolbar.addNode)}</div>${this.addItems()}`,
      clientX,
      clientY,
    );
  }

  private showMenu(html: string, clientX: number, clientY: number): void {
    this.#menu.innerHTML = html;
    adoptDesignerFormControls(this.#menu);
    this.#menu.hidden = false;
    const host = this.element.getBoundingClientRect();
    this.#menu.style.left = '0px';
    this.#menu.style.top = '0px';
    let x = clientX - host.left;
    let y = clientY - host.top;
    const width = this.#menu.offsetWidth;
    const height = this.#menu.offsetHeight;
    if (x + width > host.width - 8) x = Math.max(8, x - width);
    if (y + height > host.height - 8) y = Math.max(8, host.height - 8 - height);
    this.#menu.style.left = `${x}px`;
    this.#menu.style.top = `${y}px`;
    this.#menu.focus({ preventScroll: true });
  }

  private closeMenu(): void {
    this.#menu.hidden = true;
    this.#menu.innerHTML = '';
  }

  private onMenuClick(event: Event): void {
    const item = (event.target as Element).closest<HTMLButtonElement>('[data-bp-menu-action]');
    if (item === null || item.disabled) return;
    const action = item.dataset.bpMenuAction ?? '';
    this.closeMenu();
    const nodes = this.#selection.nodes;
    if (action.startsWith('add:')) {
      const kind = action.slice('add:'.length);
      if (kind === 'host' || kind === 'lifecycle' || kind === 'timer' || kind === 'condition') {
        this.send({
          type: 'insert-node',
          kind,
          position: {
            x: Math.round(this.#contextPoint.x),
            y: Math.round(this.#contextPoint.y),
          },
        });
      }
      return;
    }
    switch (action) {
      case 'delete':
        this.send({ type: 'delete-selection', selection: this.#selection });
        break;
      case 'rename':
        if (nodes[0] !== undefined) this.startRename(nodes[0]);
        break;
      case 'duplicate':
        this.send({ type: 'duplicate-nodes', nodeIds: nodes });
        break;
      case 'disable':
      case 'enable':
        this.send({
          type: 'update-node',
          nodeIds: nodes,
          update: { type: 'enabled', enabled: action === 'enable' },
        });
        break;
      case 'simulate': {
        const trigger = (this.#state?.simulationTriggers ?? []).find(
          (candidate) => candidate.nodeId === nodes[0],
        );
        if (trigger !== undefined) {
          this.#simulationTrigger = `${trigger.nodeId}\u0000${trigger.port}`;
          this.#simulationOpen = true;
          this.renderToolbar();
          this.renderSimulation();
        }
        break;
      }
      case 'select-all':
        this.select({ nodes: this.graph.nodes.map((node) => node.id), edges: [] });
        break;
      case 'auto-layout':
        this.autoLayout();
        break;
      case 'fit':
        this.fit();
        break;
    }
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function bezier(
  from: Point,
  to: Point,
): { readonly d: string; readonly mid: Point; readonly angle: number } {
  const dx = Math.abs(to.x - from.x);
  const k = to.x < from.x ? 0.8 : 0.5;
  const c1 = { x: from.x + dx * k, y: from.y };
  const c2 = { x: to.x - dx * k, y: to.y };
  const t = 0.5;
  const mt = 1 - t;
  const mid = {
    x: mt ** 3 * from.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * to.x,
    y: mt ** 3 * from.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * to.y,
  };
  // 中点切线方向：箭头沿线指向目标锚点。
  const tx = 3 * mt * mt * (c1.x - from.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x);
  const ty = 3 * mt * mt * (c1.y - from.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y);
  return {
    d: `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`,
    mid,
    angle: Math.round((Math.atan2(ty, tx) * 180) / Math.PI),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

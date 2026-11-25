import type { ScreenComponentNode, ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';
import type { BaseScreenMaterialEvent, BaseScreenRenderer } from '@base-screen/renderer';
import {
  type DesignerArtboardId,
  listDesignerCanvasComponentIds,
} from '../../common/session/designer-artboard.js';

export interface DesignerReferenceLayerCallbacks {
  /** 建一个只读的参照渲染器（预览模式、不可交互），挂在 `root` 上。 */
  readonly createRenderer: (root: HTMLElement) => BaseScreenRenderer | undefined;
  /** 渲染器的身份（物料目录）：变化时丢弃旧渲染器、按新目录重建。 */
  readonly getRendererKey: () => unknown;
  /** 完整文档（含全部从画布）。 */
  readonly getDocument: () => ScreenDocument | undefined;
  /** 要垫哪块画布（`null` = 主画布）；`undefined` = 不垫（开关关闭、弹框画板、没有页面）。 */
  readonly getReferenceCanvas: () => DesignerArtboardId | undefined;
  /** 设计器主渲染器的挂载根：参照层作为它的第一个子节点，画在画布背景之上、组件之下。 */
  readonly getContentRoot: () => HTMLElement | undefined;
  /** 画布当前的变量值：参照内容与画布同口径取值。 */
  readonly getVariables: () => ScreenJsonObject;
  /**
   * 状态栏「事件」是否开着。开着时参照层变成「实况」：不透明、可交互，物料事件（去掉 `ref:`
   * 前缀后）照常进蓝图；编辑页面时主画布内容叠在页面之上（与查看器同序），标签页、导航按钮能点。
   */
  readonly isLive: () => boolean;
  /** 实况参照层的物料事件（组件 id 已还原）。 */
  readonly onMaterialEvent: (event: BaseScreenMaterialEvent) => void;
}

/**
 * 参照底图（ADR-0109 §2.5）：编辑页面时把主画布的公共内容（标题、导航、边框）以 32% 不透明度
 * 垫在画布上；编辑主画布时垫最近编辑的页面。只读：不拦截指针、不进图层、不可选。
 *
 * 用独立的只读渲染器画参照内容：参照文档只含参照画布的组件，去掉从画布归属与蓝图，画布背景透明。
 * 参照层挂成主渲染器挂载根的第一个子节点，叠放即「画板背景 → 参照 → 当前画板组件」。
 * 参照组件的 id 一律加 `ref:` 前缀：设计器按 `data-base-screen-component-id` 查元素（拖动、对比度、
 * 自动宽度等），参照元素不能与真实组件同名。
 */
export class DesignerReferenceLayerController {
  #host: HTMLElement | undefined;
  #root: HTMLElement | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #rendererKey: unknown;
  #source: ScreenDocument | undefined;
  #canvas: DesignerArtboardId | undefined;
  #live = false;

  constructor(private readonly callbacks: DesignerReferenceLayerCallbacks) {}

  connect(host: HTMLElement, root: HTMLElement): void {
    if (this.#host === host && this.#root === root) return;
    this.release();
    this.#host = host;
    this.#root = root;
    host.hidden = true;
    this.sync();
  }

  release(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#host = undefined;
    this.#root = undefined;
    this.#source = undefined;
    this.#canvas = undefined;
  }

  /** 文档、画板或开关变化后调用：按需重画或收起。 */
  sync(): void {
    const host = this.#host;
    if (host === undefined) return;
    const source = this.callbacks.getDocument();
    const canvas = this.callbacks.getReferenceCanvas();
    if (source === undefined || canvas === undefined) {
      this.#hide(host);
      this.#canvas = undefined;
      return;
    }
    const renderer = this.#ensureRenderer();
    if (renderer === undefined) {
      this.#hide(host);
      return;
    }
    if (source !== this.#source || canvas !== this.#canvas) {
      this.#source = source;
      this.#canvas = canvas;
      renderer.setVariables(this.callbacks.getVariables());
      const rendered = renderer.render(referenceDocument(source, canvas), { trigger: 'manual' });
      if (!rendered.ok) {
        this.#hide(host);
        return;
      }
    }
    const live = this.callbacks.isLive();
    if (live !== this.#live) {
      this.#live = live;
      const result = renderer.setInteractive(live);
      if (!result.ok) {
        this.#hide(host);
        return;
      }
    }
    host.toggleAttribute('data-live', live);
    host.style.width = `${source.canvas.width}px`;
    host.style.height = `${source.canvas.height}px`;
    const content = this.callbacks.getContentRoot();
    if (content !== undefined) {
      // 叠放与查看器一致：主画布内容在页面之上。实况且参照的是主画布（正在编辑页面）时放到最后，
      // 否则垫在最前（编辑主画布时页面在下）。
      const onTop = live && canvas === null;
      if (onTop ? host !== content.lastElementChild : host !== content.firstElementChild) {
        if (onTop) content.appendChild(host);
        else content.insertBefore(host, content.firstChild);
      }
    }
    host.hidden = false;
  }

  /** 实况参照层抛出的物料事件：把 `ref:` 前缀还原成真实组件 id 再交给设计器。 */
  handleMaterialEvent(event: BaseScreenMaterialEvent): void {
    if (!this.#live || !event.componentId.startsWith(REFERENCE_ID_PREFIX)) return;
    this.callbacks.onMaterialEvent({
      ...event,
      componentId: event.componentId.slice(REFERENCE_ID_PREFIX.length),
    });
  }

  #hide(host: HTMLElement): void {
    host.hidden = true;
  }

  #ensureRenderer(): BaseScreenRenderer | undefined {
    const key = this.callbacks.getRendererKey();
    if (this.#renderer !== undefined && this.#rendererKey === key) return this.#renderer;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#source = undefined;
    const root = this.#root;
    if (root === undefined) return undefined;
    this.#rendererKey = key;
    this.#live = false;
    this.#renderer = this.callbacks.createRenderer(root);
    return this.#renderer;
  }
}

/**
 * 参照文档：只含参照画布的组件（去掉画布归属，id 加 `ref:` 前缀），没有从画布与蓝图，画布背景透明。
 */
function referenceDocument(source: ScreenDocument, canvas: DesignerArtboardId): ScreenDocument {
  const inside = listDesignerCanvasComponentIds(source, canvas);
  const { subCanvases: _subCanvases, startCanvasId: _start, ...rest } = source;
  return {
    ...rest,
    canvas: {
      width: source.canvas.width,
      height: source.canvas.height,
      backgroundColor: 'transparent',
    },
    components: source.components
      .filter((component) => inside.has(component.id))
      .map(referenceCopyOf),
    blueprint: { nodes: [], edges: [] },
  };
}

/**
 * 参照组件副本按原组件引用缓存：原组件不变就复用同一个副本，参照渲染器的解析共享引用、
 * 候选校验缓存与挂载复用守卫才能命中——文档每次提交只重投影真正改动过的参照组件。
 */
const referenceCopies = new WeakMap<ScreenComponentNode, ScreenComponentNode>();

function referenceCopyOf(component: ScreenComponentNode): ScreenComponentNode {
  const cached = referenceCopies.get(component);
  if (cached !== undefined) return cached;
  const { canvasId: _canvasId, belowSubCanvas: _below, ...plain } = component;
  const copy: ScreenComponentNode = {
    ...plain,
    id: referenceId(component.id),
    parentId: component.parentId === null ? null : referenceId(component.parentId),
  };
  referenceCopies.set(component, copy);
  return copy;
}

function referenceId(id: string): string {
  return `${REFERENCE_ID_PREFIX}${id}`.slice(0, 128);
}

const REFERENCE_ID_PREFIX = 'ref:';

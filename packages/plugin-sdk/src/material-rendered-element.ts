import type {
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialMode,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { failure } from './diagnostics.js';
import {
  type BaseScreenMaterialDefinition,
  createMaterialDefinition,
} from './material-definition.js';
import {
  type BaseScreenMaterialSpec,
  type BaseScreenMaterialSpecData,
  type BaseScreenMaterialSpecRow,
  compileBaseScreenMaterialSpec,
  createBaseScreenMaterialSpecDataAdapter,
  normalizeBaseScreenMaterialSpecValue,
  parseBaseScreenMaterialSpec,
} from './material-spec.js';
import {
  createBaseScreenMaterialEmptyView,
  createBaseScreenMaterialErrorView,
  createBaseScreenMaterialStateView,
} from './material-state-view.js';
import {
  type CompiledBaseScreenMaterialTemplate,
  compileBaseScreenMaterialTemplate,
} from './material-template.js';
import { createBaseScreenMaterialTemplateRenderer } from './material-template-render.js';

/**
 * 渲染函数物料（base-screen-docs ADR-0105 §2.3）：作者只写「数据就绪时怎么画」，
 * 元素骨架、四态、重绘与失败隔离由这里统一提供。
 *
 * 骨架替作者守住的范式（作者写不出违规的代码路径）：
 * - **宿主元素归渲染器**：尺寸、透明度、变换都不碰（物料渲染盒不变式、ADR-0099 R6）；作者只拿到
 *   Shadow DOM 里一个满盒的 `root`，样式表也写在里面，不泄漏到页面。
 * - **非 ready 态走 SDK 状态视图**：首帧前显示加载 / 出错 / 空态；已有画面时加载与 idle 保持原画面
 *   （轮询不闪烁），出错换成错误视图。作者不写空态文案（ADR-0099 R8）。
 * - **多行数据为空即空态**：渲染函数只在至少有一行时被调用。
 * - **渲染抛错即错误视图**：一个组件的代码错误不会打断整屏。
 */
export interface BaseScreenMaterialRenderContext {
  readonly document: Document;
  /** 满盒容器（`width/height: 100%`）；每次重绘都是一个新的空容器。 */
  readonly root: HTMLElement;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly size: ScreenSize;
  readonly mode: BaseScreenMaterialMode;
  /** 单值组件的读数（数字或字符串；读不出时为 null）。 */
  readonly value: number | string | null;
  /** 多行组件的行（键为角色 id）；单值 / 无数据组件为空数组。 */
  readonly rows: readonly BaseScreenMaterialSpecRow[];
  /** 按读数格式配置组（前缀 / 单位 / 小数位 / 千分位）格式化；读不出数时为 `--`。 */
  formatNumber(value: unknown): string;
}

export type BaseScreenMaterialRenderFunction = (context: BaseScreenMaterialRenderContext) => void;

export interface BaseScreenRenderedMaterialPresenter {
  /** 按新的 model 重绘；同一个 model 重复调用也会重绘（渲染器只在变化时写 model）。 */
  update(model: BaseScreenMaterialModel): void;
}

export interface BaseScreenRenderedMaterialOptions {
  readonly data: BaseScreenMaterialSpecData;
  readonly render: BaseScreenMaterialRenderFunction;
}

const FRAME_STYLE =
  ':host{contain:content}.frame{position:relative;box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}.frame>*{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0}';
const MAX_RENDER_ERROR = 160;

/**
 * 在给定的挂载点上呈现渲染函数物料：元素骨架与作者工坊的预览共用这一份，预览因此与画布上的
 * 实际表现一致，且不需要为每次预览注册新的 Custom Element。
 */
export function createBaseScreenRenderedMaterialPresenter(
  mount: ShadowRoot | HTMLElement,
  options: BaseScreenRenderedMaterialOptions,
): BaseScreenRenderedMaterialPresenter {
  const ownerDocument = mount.ownerDocument;
  const sheet = ownerDocument.createElement('style');
  sheet.textContent = FRAME_STYLE;
  const frame = ownerDocument.createElement('div');
  frame.className = 'frame';
  frame.setAttribute('part', 'frame');
  mount.replaceChildren(sheet, frame);
  let hasFrame = false;

  const show = (view: HTMLElement | undefined, painted: boolean): void => {
    frame.replaceChildren(...(view === undefined ? [] : [view]));
    hasFrame = painted;
  };

  const paint = (model: BaseScreenMaterialModel, value: ScreenJsonValue | undefined): void => {
    const normalized = normalizeBaseScreenMaterialSpecValue(options.data, value);
    if (options.data.kind === 'rows' && normalized.rows.length === 0) {
      show(createBaseScreenMaterialEmptyView(ownerDocument), false);
      return;
    }
    const root = ownerDocument.createElement('div');
    root.setAttribute('data-base-screen-material-root', '');
    try {
      options.render({
        document: ownerDocument,
        root,
        props: model.props,
        style: model.style,
        size: model.size,
        mode: model.mode,
        value: normalized.value,
        rows: normalized.rows,
        formatNumber: (input) => formatBaseScreenMaterialNumber(input, model.props),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      show(
        createBaseScreenMaterialErrorView(
          ownerDocument,
          'HOST_DATASET_INVALID',
          `组件渲染失败：${reason}`.slice(0, MAX_RENDER_ERROR),
        ),
        false,
      );
      return;
    }
    show(root, true);
  };

  return {
    update(model) {
      const state = model.dataState;
      if (options.data.kind === 'none') {
        paint(model, undefined);
        return;
      }
      if (state.status === 'ready') {
        paint(model, state.value);
        return;
      }
      // 已有画面：加载与 idle 保持原画面，轮询刷新不闪烁；出错必须让作者看见。
      if (hasFrame && state.status !== 'error') return;
      const view = createBaseScreenMaterialStateView(ownerDocument, state);
      show(view, false);
    },
  };
}

/** 读数格式（ADR-0102 §11）：与配置组同键，`decimals` / `prefix` / `unit` / `thousandsSeparator`。 */
export function formatBaseScreenMaterialNumber(input: unknown, props: ScreenJsonObject): string {
  const numeric =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim() !== ''
        ? Number(input)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return '--';
  const rawDecimals = typeof props.decimals === 'number' ? props.decimals : 0;
  const decimals = Math.min(6, Math.max(0, Math.trunc(rawDecimals)));
  const body =
    props.thousandsSeparator === true
      ? numeric.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : numeric.toFixed(decimals);
  const prefix = typeof props.prefix === 'string' ? props.prefix : '';
  const unit = typeof props.unit === 'string' ? props.unit : '';
  return `${prefix}${body}${unit}`;
}

/**
 * 由 Manifest 与渲染函数生成物料构造器（静态 `manifest` / `tabularDataAdapter` 为数据属性，
 * 可直接交给 `createMaterialDefinition`）。`manifest` 必须是规格编译产物：数据形状由 `data` 决定。
 */
export function createBaseScreenRenderedMaterialElement(options: {
  readonly manifest: BaseScreenMaterialManifest;
  readonly data: BaseScreenMaterialSpecData;
  readonly render: BaseScreenMaterialRenderFunction | (() => BaseScreenMaterialRenderFunction);
  /** `render` 是工厂：每个实例调用一次取得自己的渲染函数（模板解释器要记上一帧做过渡）。 */
  readonly renderPerInstance?: true;
}): BaseScreenMaterialConstructor {
  const ElementBase =
    (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
    (class {} as unknown as typeof HTMLElement);
  const presenterOptions = (): BaseScreenRenderedMaterialOptions => ({
    data: options.data,
    render:
      options.renderPerInstance === true
        ? (options.render as () => BaseScreenMaterialRenderFunction)()
        : (options.render as BaseScreenMaterialRenderFunction),
  });

  class RenderedMaterialElement extends ElementBase {
    #model: BaseScreenMaterialModel | undefined;
    #presenter: BaseScreenRenderedMaterialPresenter | undefined;

    get model(): BaseScreenMaterialModel {
      if (this.#model === undefined) throw new Error('Material model has not been set.');
      return this.#model;
    }

    set model(value: BaseScreenMaterialModel) {
      this.#model = value;
      // 数据状态进属性：E2E 与样式钩子据此观察四态，不依赖作者的内部结构。
      this.setAttribute('data-base-screen-data-state', value.dataState.status);
      this.#paint();
    }

    connectedCallback(): void {
      this.#paint();
    }

    #paint(): void {
      const model = this.#model;
      if (model === undefined || !this.isConnected) return;
      this.#presenter ??= createBaseScreenRenderedMaterialPresenter(
        this.shadowRoot ?? this.attachShadow({ mode: 'open' }),
        presenterOptions(),
      );
      this.#presenter.update(model);
    }
  }

  // configurable：宿主「仅更新清单」需要把新 Manifest 挂回同一个构造器（ADR-0090 兼容矩阵）。
  Object.defineProperty(RenderedMaterialElement, 'manifest', {
    value: options.manifest,
    configurable: true,
  });
  const adapter = createBaseScreenMaterialSpecDataAdapter(options.data);
  if (adapter !== undefined) {
    Object.defineProperty(RenderedMaterialElement, 'tabularDataAdapter', { value: adapter });
  }
  return RenderedMaterialElement as unknown as BaseScreenMaterialConstructor;
}

export interface CreateBaseScreenSpecMaterialDefinitionOptions {
  readonly spec: BaseScreenMaterialSpec;
  /** 代码物料的渲染函数；L2 模板物料（规格带 `template`）不给。 */
  readonly render?: BaseScreenMaterialRenderFunction;
  readonly tagName: string;
  readonly libraryVisible?: boolean;
  readonly cover?: string;
}

/**
 * 模板 → 渲染函数（L2，ADR-0116）。`createRender()` 每次返回一个新实例的解释器，
 * 工坊预览与画布元素共用同一份解释器实现。
 */
export function createBaseScreenMaterialTemplateRender(
  spec: BaseScreenMaterialSpec,
): ScreenParseResult<() => BaseScreenMaterialRenderFunction> {
  const compiled = compileSpecTemplate(spec);
  if (!compiled.ok) return compiled;
  const template = compiled.value;
  return {
    ok: true,
    value: () => {
      const renderer = createBaseScreenMaterialTemplateRenderer(template);
      return (context) =>
        renderer({
          document: context.document,
          root: context.root,
          props: context.props,
          style: context.style,
          size: context.size,
          interactive: context.mode !== 'design',
          value: context.value,
          rows: context.rows,
          formatNumber: context.formatNumber,
        });
    },
    diagnostics: [],
  };
}

function compileSpecTemplate(
  spec: BaseScreenMaterialSpec,
): ScreenParseResult<CompiledBaseScreenMaterialTemplate> {
  if (spec.template === undefined) {
    return failure('PLUGIN_CORE_LIFECYCLE_INVALID', ['template'], '规格没有 template。');
  }
  return compileBaseScreenMaterialTemplate(spec.template, {
    fields: spec.fields,
    data: spec.data,
    ...(spec.events === undefined ? {} : { events: spec.events }),
    sectionTarget: (section) =>
      section === 'text' || section === 'surface' || section === 'semantic' ? 'style' : 'props',
  });
}

/**
 * 规格 + 渲染函数 → 物料定义：编译 Manifest、生成构造器，再经 `createMaterialDefinition`
 * 走与手写物料同一条严格校验；`define()` 才注册标签。
 */
export function createBaseScreenSpecMaterialDefinition(
  options: CreateBaseScreenSpecMaterialDefinitionOptions,
): ScreenParseResult<BaseScreenMaterialDefinition> {
  const spec = parseBaseScreenMaterialSpec(options.spec);
  if (!spec.ok) return spec;
  if (spec.value.isolated !== undefined) {
    // ADR-0117 D8：L3 代码只在沙箱里运行，不能当同 realm 渲染函数注册。
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      ['spec', 'isolated'],
      'MATERIAL_ISOLATED_CONFLICT：规格带 isolated 时用 createBaseScreenIsolatedMaterialDefinition 注册。',
    );
  }
  const hasTemplate = spec.value.template !== undefined;
  if (hasTemplate && options.render !== undefined) {
    // ADR-0116 D1：L2 物料只有数据；没有「模板 + 补充代码」的混合形态。
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      ['render'],
      'MATERIAL_TEMPLATE_RENDER_CONFLICT：规格带 template 时不能再给渲染函数。',
    );
  }
  if (!hasTemplate && typeof options.render !== 'function') {
    return failure('PLUGIN_CORE_LIFECYCLE_INVALID', ['render'], '渲染函数必须是函数。');
  }
  const manifest = compileBaseScreenMaterialSpec(spec.value, {
    tagName: options.tagName,
    ...(options.libraryVisible === undefined ? {} : { libraryVisible: options.libraryVisible }),
    ...(options.cover === undefined ? {} : { cover: options.cover }),
  });
  if (!manifest.ok) return manifest;
  if (hasTemplate) {
    const render = createBaseScreenMaterialTemplateRender(spec.value);
    if (!render.ok) return render;
    const element = createBaseScreenRenderedMaterialElement({
      manifest: manifest.value,
      data: spec.value.data,
      render: render.value,
      renderPerInstance: true,
    });
    return createMaterialDefinition({ manifest: manifest.value, element });
  }
  const element = createBaseScreenRenderedMaterialElement({
    manifest: manifest.value,
    data: spec.value.data,
    render: options.render as BaseScreenMaterialRenderFunction,
  });
  return createMaterialDefinition({ manifest: manifest.value, element });
}

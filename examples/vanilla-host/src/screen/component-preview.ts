import type { ScreenSize } from 'base-screen/contracts';
import type {
  BaseScreenFragmentDefinition,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialDataState,
  BaseScreenMaterialManifest,
} from 'base-screen/plugin-core';
import {
  type BaseScreenMaterialRenderFunction,
  type BaseScreenMaterialSpec,
  compileBaseScreenMaterialSpec,
  createBaseScreenRenderedMaterialPresenter,
  parseBaseScreenMaterialSpec,
} from 'base-screen/plugins';
import type { AtomicComponentSource } from './component-library';
import { buildSpecMaterialModule, importSpecMaterialModule } from './component-workshop';

/**
 * 组件预览（ADR-0106 §2.3）：组件库封面与原子组件编辑器的中栏共用。
 *
 * 用 SDK 的渲染骨架（`createBaseScreenRenderedMaterialPresenter`）呈现，与大屏画布上的表现一致；
 * 不注册 Custom Element，改代码不产生新标签。
 */
export type PreviewDataMode = 'ready' | 'loading' | 'empty' | 'error';

const PREVIEW_TAG = 'host-online-preview';

export interface CompiledPreview {
  readonly spec: BaseScreenMaterialSpec;
  readonly manifest: BaseScreenMaterialManifest;
  readonly render: BaseScreenMaterialRenderFunction;
}

export type CompilePreviewResult =
  | { readonly ok: true; readonly value: CompiledPreview }
  | { readonly ok: false; readonly stage: 'spec' | 'code'; readonly message: string };

/** 渲染模块按源码缓存：同一份代码只 `import()` 一次（封面网格里同一模板的组件很多）。 */
const renderCache = new Map<string, Promise<BaseScreenMaterialRenderFunction | string>>();

export async function compilePreview(source: AtomicComponentSource): Promise<CompilePreviewResult> {
  const parsed = parseBaseScreenMaterialSpec(source.spec);
  if (!parsed.ok) {
    return { ok: false, stage: 'spec', message: parsed.diagnostics[0]?.message ?? '组件定义有错误。' };
  }
  const manifest = compileBaseScreenMaterialSpec(parsed.value, { tagName: PREVIEW_TAG });
  if (!manifest.ok) {
    return { ok: false, stage: 'spec', message: manifest.diagnostics[0]?.message ?? '组件定义有错误。' };
  }
  const code = buildSpecMaterialModule(parsed.value, source.renderBody);
  let pending = renderCache.get(code);
  if (pending === undefined) {
    pending = importSpecMaterialModule(code).then((imported) =>
      imported.ok ? imported.value.render : (imported.diagnostics[0]?.message ?? '渲染代码无法加载。'),
    );
    renderCache.set(code, pending);
    if (renderCache.size > 64) renderCache.delete(renderCache.keys().next().value as string);
  }
  const render = await pending;
  if (typeof render === 'string') return { ok: false, stage: 'code', message: render };
  return { ok: true, value: { spec: parsed.value, manifest: manifest.value, render } };
}

export function previewDataState(
  compiled: CompiledPreview,
  mode: PreviewDataMode,
): BaseScreenMaterialDataState {
  const { spec, manifest } = compiled;
  switch (mode) {
    case 'loading':
      return { status: 'loading' };
    case 'error':
      return { status: 'error', code: 'HOST_RESOURCE_FAILED', message: '示例：数据源请求失败。' };
    case 'empty':
      return spec.data.kind === 'rows'
        ? { status: 'ready', value: { rows: [], total: 0 } }
        : { status: 'idle' };
    default:
      return spec.data.kind === 'none'
        ? { status: 'idle' }
        : { status: 'ready', value: manifest.defaultData ?? null };
  }
}

export interface PreviewRenderInput {
  readonly compiled: CompiledPreview;
  readonly size: ScreenSize;
  readonly mode: PreviewDataMode;
  /** 覆盖默认值（编辑器右栏改默认值时实时预览）；省略用 Manifest 默认值。 */
  readonly props?: BaseScreenMaterialManifest['defaultProps'];
  readonly style?: BaseScreenMaterialManifest['defaultStyle'];
}

/** 在 `mount` 里画一次；每次调用都重建 presenter（渲染函数可能换了）。 */
export function renderPreview(mount: HTMLElement, input: PreviewRenderInput): void {
  const shadow = mount.shadowRoot ?? mount.attachShadow({ mode: 'open' });
  const presenter = createBaseScreenRenderedMaterialPresenter(shadow, {
    data: input.compiled.spec.data,
    render: input.compiled.render,
  });
  presenter.update({
    componentId: 'component-preview',
    mode: 'design',
    interactive: false,
    props: input.props ?? input.compiled.manifest.defaultProps,
    style: input.style ?? input.compiled.manifest.defaultStyle,
    size: input.size,
    dataState: previewDataState(input.compiled, input.mode),
  });
}

/**
 * 封面：按默认尺寸画，再整体缩放进 `box`。失败时放一行说明，不抛错（封面不该拖垮列表）。
 */
export async function renderCover(
  box: HTMLElement,
  source: AtomicComponentSource | undefined,
): Promise<void> {
  if (source === undefined) {
    box.replaceChildren(coverNote('源码无法读取'));
    return;
  }
  const compiled = await compilePreview(source);
  if (!compiled.ok) {
    box.replaceChildren(coverNote(compiled.stage === 'code' ? '渲染代码有错误' : '组件定义有错误'));
    return;
  }
  const size = compiled.value.spec.defaultSize;
  const stage = document.createElement('div');
  stage.className = 'component-cover__stage';
  stage.style.width = `${size.width}px`;
  stage.style.height = `${size.height}px`;
  box.replaceChildren(stage);
  const fit = (): void => {
    const width = box.clientWidth || 240;
    const height = box.clientHeight || 150;
    const scale = Math.min(1, (width - 24) / size.width, (height - 24) / size.height);
    stage.style.transform = `translate(-50%, -50%) scale(${Math.max(scale, 0.05)})`;
  };
  fit();
  renderPreview(stage, { compiled: compiled.value, size, mode: 'ready' });
}

/** 组合封面：按节点几何画示意线框（与 Engine 物料库的缺省封面同一思路，只用几何）。 */
export function renderFragmentCover(
  box: HTMLElement,
  definition: BaseScreenFragmentDefinition,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  const rects: { x: number; y: number; width: number; height: number; shell: boolean }[] = [];
  const sizeOf = (materialType: string, size: ScreenSize | undefined): ScreenSize =>
    size ?? catalog?.get(materialType)?.manifest.defaultSize ?? { width: 80, height: 32 };
  if (definition.shell !== undefined) {
    const size = sizeOf(definition.shell.materialType, definition.shell.size);
    rects.push({ x: definition.shell.offset?.x ?? 0, y: definition.shell.offset?.y ?? 0, ...size, shell: true });
  }
  for (const node of definition.nodes) {
    const size = sizeOf(node.materialType, node.size);
    rects.push({ x: node.offset?.x ?? 0, y: node.offset?.y ?? 0, ...size, shell: false });
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `${minX - 4} ${minY - 4} ${maxX - minX + 8} ${maxY - minY + 8}`);
  svg.setAttribute('class', 'component-cover__wireframe');
  svg.setAttribute('aria-hidden', 'true');
  for (const rect of rects) {
    const shape = document.createElementNS(ns, 'rect');
    shape.setAttribute('x', String(rect.x));
    shape.setAttribute('y', String(rect.y));
    shape.setAttribute('width', String(rect.width));
    shape.setAttribute('height', String(rect.height));
    shape.setAttribute('rx', '4');
    shape.setAttribute('data-shell', String(rect.shell));
    svg.append(shape);
  }
  box.replaceChildren(svg);
}

function coverNote(text: string): HTMLElement {
  const note = document.createElement('span');
  note.className = 'component-cover__note';
  note.textContent = text;
  return note;
}

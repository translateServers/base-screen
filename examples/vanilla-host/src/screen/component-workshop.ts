import { type ScreenJsonValue, type ScreenParseResult, screenJsonEquals } from 'base-screen/contracts';
import type {
  BaseScreenComponentFragmentInsertionIntent,
  BaseScreenFragmentBody,
  BaseScreenFragmentDefinition,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialDataState,
  BaseScreenMaterialManifest,
} from 'base-screen/plugin-core';
import { parseBaseScreenMaterialManifest } from 'base-screen/plugin-core';
import {
  auditBaseScreenFragment,
  auditBaseScreenMaterialSpec,
  BASE_SCREEN_MATERIAL_SPEC_SECTIONS,
  type BaseScreenAuthoringFinding,
  type BaseScreenMaterialRenderFunction,
  type BaseScreenMaterialSpec,
  type BaseScreenMaterialSpecField,
  type BaseScreenMaterialSpecRole,
  type BaseScreenRenderedMaterialPresenter,
  compileBaseScreenMaterialSpec,
  createBaseScreenRenderedMaterialPresenter,
  createBaseScreenSpecMaterialDefinition,
  hasBaseScreenAuthoringErrors,
  parseBaseScreenMaterialSpec,
} from 'base-screen/plugins';

/**
 * 组件工坊（base-screen-docs ADR-0105）——三端逐字共享的宿主侧实现，browser-harness 也挂同一份。
 *
 * 两类产物、两条既有通道，不新增文档契约与渲染 ABI：
 * - **原子组件** = 在线物料包（ADR-0090）。作者写规格（字段 / 数据形状）与渲染函数体，
 *   Manifest 由 SDK 的 `compileBaseScreenMaterialSpec` 派生；发布即热刷新 catalog。
 * - **组合组件** = 分片（ADR-0100）。作者在画布上摆好、选中后「存为组合」，在这里命名归类、体检、管理；
 *   插入即展开为普通组件。
 *
 * 两类都先体检（SDK 的 `auditBaseScreenMaterialSpec` / `auditBaseScreenFragment`），有错误不能发布。
 * 存储与加载归宿主：本模块只经端口读写（`WorkshopMaterialStore` / `WorkshopFragmentStore`），
 * 代码加载走 `loadSpecMaterialEntry`（宿主 `import()` + SDK 定义，ADR-0090 §8 信任边界不变）。
 */

// ———————————————————————————— 在线包格式 ————————————————————————————

const MODULE_HEADER = '// base-screen spec material module (ADR-0105)';
const SPEC_BEGIN = '/*spec:begin*/';
const SPEC_END = '/*spec:end*/';
const RENDER_BEGIN = '//render:begin';
const RENDER_END = '//render:end';
/** 渲染函数体可直接使用的上下文变量；顺序即界面提示顺序。 */
export const SPEC_RENDER_CONTEXT_NAMES = [
  'document',
  'root',
  'props',
  'style',
  'size',
  'mode',
  'value',
  'rows',
  'formatNumber',
] as const;

/** 规格 + 渲染函数体 → 在线包代码：一个导出 `spec` 与 `render` 的 ES 模块，可原样回读编辑。 */
export function buildSpecMaterialModule(spec: BaseScreenMaterialSpec, renderBody: string): string {
  return `${MODULE_HEADER}
export const spec = ${SPEC_BEGIN}${JSON.stringify(spec)}${SPEC_END};
export function render(context) {
  const { ${SPEC_RENDER_CONTEXT_NAMES.join(', ')} } = context;
${RENDER_BEGIN}
${renderBody}
${RENDER_END}
}
`;
}

export function isSpecMaterialModule(code: string): boolean {
  return code.startsWith(MODULE_HEADER);
}

/** 不执行代码地回读规格与渲染函数体；不是规格模块或标记损坏时返回 undefined。 */
export function readSpecMaterialModule(
  code: string,
): { readonly spec: unknown; readonly renderBody: string } | undefined {
  if (!isSpecMaterialModule(code)) return undefined;
  const specStart = code.indexOf(SPEC_BEGIN);
  const specEnd = code.indexOf(SPEC_END);
  const bodyStart = code.indexOf(`${RENDER_BEGIN}\n`);
  const bodyEnd = code.lastIndexOf(`\n${RENDER_END}`);
  if (specStart < 0 || specEnd < specStart || bodyStart < 0 || bodyEnd < bodyStart) return undefined;
  try {
    return {
      spec: JSON.parse(code.slice(specStart + SPEC_BEGIN.length, specEnd)) as unknown,
      renderBody: code.slice(bodyStart + RENDER_BEGIN.length + 1, bodyEnd),
    };
  } catch {
    return undefined;
  }
}

/** 宿主受控加载（ADR-0029）：blob `import()` 一个规格模块，校验导出形状。 */
export async function importSpecMaterialModule(
  code: string,
): Promise<
  ScreenParseResult<{
    readonly spec: BaseScreenMaterialSpec;
    readonly render: BaseScreenMaterialRenderFunction;
  }>
> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const imported: unknown = await import(/* @vite-ignore */ url);
    const module = isRecord(imported) ? imported : {};
    if (typeof module.render !== 'function') {
      return workshopFailure('PLUGIN_CORE_LIFECYCLE_INVALID', '规格模块必须导出 render 函数。');
    }
    const spec = parseBaseScreenMaterialSpec(module.spec);
    if (!spec.ok) return spec;
    return {
      ok: true,
      value: { spec: spec.value, render: module.render as BaseScreenMaterialRenderFunction },
      diagnostics: [],
    };
  } catch (error) {
    return workshopFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      `渲染代码无法加载：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const definedSpecEntries = new Map<string, BaseScreenMaterialCatalogEntry>();

/**
 * 规格模块 → catalog 条目。持久化的 Manifest 是权威：它必须等于用同一标签重新编译规格的结果，
 * 否则说明包被改坏（清单与代码不一致），失败关闭。同一标签只定义一次（`customElements` 不能覆盖），
 * 只差 Manifest 的变化（上下架）就把新 Manifest 挂回已定义的构造器，不重挂载（ADR-0090 兼容矩阵）。
 */
export async function loadSpecMaterialEntry(
  code: string,
  storedManifest: unknown,
): Promise<ScreenParseResult<BaseScreenMaterialCatalogEntry>> {
  const manifest = parseBaseScreenMaterialManifest(storedManifest);
  if (!manifest.ok) return manifest;
  const cached = definedSpecEntries.get(manifest.value.tagName);
  if (cached !== undefined) {
    if (sameManifest(cached.manifest, manifest.value)) return ok(cached);
    try {
      Object.defineProperty(cached.constructor, 'manifest', {
        value: manifest.value,
        configurable: true,
      });
    } catch {
      return workshopFailure('PLUGIN_CORE_MANIFEST_FIELD_INVALID', '无法更新在线组件的清单。');
    }
    const entry = { ...cached, manifest: manifest.value };
    definedSpecEntries.set(manifest.value.tagName, entry);
    return ok(entry);
  }
  const imported = await importSpecMaterialModule(code);
  if (!imported.ok) return imported;
  const definition = createBaseScreenSpecMaterialDefinition({
    spec: imported.value.spec,
    render: imported.value.render,
    tagName: manifest.value.tagName,
    ...(manifest.value.libraryVisible === false ? { libraryVisible: false } : {}),
  });
  if (!definition.ok) return definition;
  if (!sameManifest(definition.value.manifest, manifest.value)) {
    return workshopFailure(
      'PLUGIN_CORE_IDENTITY_CONFLICT',
      '包内清单与规格编译结果不一致：请在组件工坊里重新发布。',
    );
  }
  const defined = definition.value.define();
  if (!defined.ok) return defined;
  definedSpecEntries.set(manifest.value.tagName, defined.value);
  return defined;
}

// ———————————————————————————— 存储端口 ————————————————————————————

export interface WorkshopMaterialPackage {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly code: string;
  readonly revision: number;
}

export type WorkshopResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

export interface WorkshopMaterialSaveInput {
  readonly id?: string;
  readonly revision?: number;
  readonly type: string;
  readonly name: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly code: string;
}

/** 在线组件包的存储：示例宿主落到后端 `MaterialPackage`，harness 用内存。 */
export interface WorkshopMaterialStore {
  list(): Promise<WorkshopResult<readonly WorkshopMaterialPackage[]>>;
  save(input: WorkshopMaterialSaveInput): Promise<WorkshopResult<WorkshopMaterialPackage>>;
  setVisibility(id: string, visible: boolean): Promise<WorkshopResult<WorkshopMaterialPackage>>;
  remove(id: string): Promise<WorkshopResult<null>>;
}

/** 把包装载进当前设计器的 catalog（宿主重建完整 catalog 后 `refreshCatalog`）。 */
export interface WorkshopMaterialRuntime {
  apply(pkg: WorkshopMaterialPackage): Promise<ScreenParseResult<unknown>>;
  remove(type: string): Promise<ScreenParseResult<unknown>>;
}

/** 组合（分片定义）的存储；读写是同步的，宿主自己决定落到哪里。 */
export interface WorkshopFragmentStore {
  list(): readonly BaseScreenFragmentDefinition[];
  save(definition: BaseScreenFragmentDefinition): void;
  remove(id: string): void;
}

export function createMemoryWorkshopMaterialStore(
  initial: readonly WorkshopMaterialPackage[] = [],
): WorkshopMaterialStore {
  let packages = [...initial];
  // 恢复的包可能带着更大的序号：从现有最大值往后编，避免撞 id。
  let sequence = packages.reduce((max, pkg) => {
    const matched = /^workshop-(\d+)$/.exec(pkg.id);
    return matched === null ? max : Math.max(max, Number(matched[1]));
  }, 0);
  return {
    async list() {
      return { ok: true, value: packages };
    },
    async save(input) {
      const existing = input.id === undefined ? undefined : packages.find((pkg) => pkg.id === input.id);
      if (input.id !== undefined && existing === undefined) return { ok: false, message: '组件包不存在。' };
      if (existing !== undefined && existing.revision !== input.revision) {
        return { ok: false, message: '组件包已被其他会话更新，请重新打开。' };
      }
      if (existing === undefined && packages.some((pkg) => pkg.type === input.type)) {
        return { ok: false, message: '物料类型已存在。' };
      }
      sequence += 1;
      const saved: WorkshopMaterialPackage = {
        id: existing?.id ?? `workshop-${sequence}`,
        type: input.type,
        name: input.name,
        manifest: input.manifest,
        code: input.code,
        revision: (existing?.revision ?? 0) + 1,
      };
      packages = [saved, ...packages.filter((pkg) => pkg.id !== saved.id)];
      return { ok: true, value: saved };
    },
    async setVisibility(id, visible) {
      const existing = packages.find((pkg) => pkg.id === id);
      if (existing === undefined) return { ok: false, message: '组件包不存在。' };
      const { libraryVisible: _visible, ...rest } = existing.manifest;
      const saved = {
        ...existing,
        manifest: visible ? rest : { ...rest, libraryVisible: false },
        revision: existing.revision + 1,
      };
      packages = packages.map((pkg) => (pkg.id === id ? saved : pkg));
      return { ok: true, value: saved };
    },
    async remove(id) {
      packages = packages.filter((pkg) => pkg.id !== id);
      return { ok: true, value: null };
    },
  };
}

/**
 * 在线组件包存到 localStorage：没有后端的演示页（browser-harness）用它，刷新后仍在。
 * 真实宿主应落到自己的后端（示例宿主用 `MaterialPackage` 接口），并做审核与引用保护。
 */
export function createLocalWorkshopMaterialStore(storageKey: string): WorkshopMaterialStore {
  const read = (): WorkshopMaterialPackage[] => {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey);
      const parsed: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WorkshopMaterialPackage[]) : [];
    } catch {
      return [];
    }
  };
  const memory = createMemoryWorkshopMaterialStore(read());
  const persist = async (): Promise<void> => {
    const listed = await memory.list();
    if (!listed.ok) return;
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(listed.value));
    } catch {
      // 配额满或隐私模式：保留内存副本。
    }
  };
  const persisted = <T>(result: WorkshopResult<T>): Promise<WorkshopResult<T>> =>
    result.ok ? persist().then(() => result) : Promise.resolve(result);
  return {
    list: () => memory.list(),
    save: async (input) => persisted(await memory.save(input)),
    setVisibility: async (id, visible) => persisted(await memory.setVisibility(id, visible)),
    remove: async (id) => persisted(await memory.remove(id)),
  };
}

/** 组合存到 localStorage（示例级持久化）；读不到或写失败时退化为内存。 */
export function createLocalWorkshopFragmentStore(storageKey: string): WorkshopFragmentStore {
  let memory: BaseScreenFragmentDefinition[] = readStoredFragments(storageKey);
  const persist = (): void => {
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(memory));
    } catch {
      // 隐私模式 / 配额满：保留内存副本，刷新即丢。
    }
  };
  return {
    list: () => memory,
    save(definition) {
      memory = [definition, ...memory.filter((item) => item.id !== definition.id)];
      persist();
    },
    remove(id) {
      memory = memory.filter((item) => item.id !== id);
      persist();
    },
  };
}

function readStoredFragments(storageKey: string): BaseScreenFragmentDefinition[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    const parsed: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BaseScreenFragmentDefinition[]) : [];
  } catch {
    return [];
  }
}

/** 物料库分组树（结构类型，与设计器 `materialLibraryGrouping` 同形）。 */
export interface WorkshopLibraryGroup {
  readonly id: string;
  readonly label: string;
  readonly materialTypes?: readonly string[];
  readonly fragmentIds?: readonly string[];
  readonly children?: readonly WorkshopLibraryGroup[];
}

export interface WorkshopLibraryGrouping {
  readonly groups: readonly WorkshopLibraryGroup[];
}

/**
 * 宿主配置了物料库分组时，在线组件要随 catalog 一起进分组（ADR-0105 P2）：分组必须覆盖全部可见物料、
 * 不得引用下架或不存在的类型。这里把 `onlineTypes` 从整棵树里摘掉，再把其中可见的放进「在线组件」分组
 * （没有就追加到末尾）；结果交给 `refreshCatalog(catalog, { materialLibraryGrouping })`。
 */
export function withWorkshopLibraryGroup(
  grouping: WorkshopLibraryGrouping,
  onlineTypes: ReadonlySet<string>,
  visibleTypes: readonly string[],
  group: { readonly id: string; readonly label: string } = { id: 'online-components', label: '在线组件' },
): WorkshopLibraryGrouping {
  const strip = (items: readonly WorkshopLibraryGroup[]): WorkshopLibraryGroup[] =>
    items.map((item) => {
      const materialTypes = item.materialTypes?.filter((type) => !onlineTypes.has(type));
      const children = item.children === undefined ? undefined : strip(item.children);
      const { materialTypes: _types, children: _children, ...rest } = item;
      return {
        ...rest,
        ...(materialTypes === undefined ? {} : { materialTypes }),
        ...(children === undefined ? {} : { children }),
      };
    });
  const groups = strip(grouping.groups);
  const index = groups.findIndex((item) => item.id === group.id);
  if (index >= 0) {
    const existing = groups[index]!;
    groups[index] = { ...existing, materialTypes: [...(existing.materialTypes ?? []), ...visibleTypes] };
  } else if (visibleTypes.length > 0) {
    groups.push({ id: group.id, label: group.label, materialTypes: [...visibleTypes] });
  }
  return { groups };
}

// ———————————————————————————— 工坊界面 ————————————————————————————

/** 工坊用到的设计器能力（结构类型，便于 harness 与三端共用）。 */
export interface ComponentWorkshopDesigner {
  readonly catalog: BaseScreenMaterialCatalog | undefined;
  materialLibraryFragments: readonly BaseScreenFragmentDefinition[] | undefined;
  // 写成 Record：源码门禁 R10 会把对象字面量里的物料类型键当作分片节点做静态解析。
  insertComponent(intent: Readonly<Record<'materialType', string>>): ScreenParseResult<unknown>;
  insertComponentFragment(
    intent: BaseScreenComponentFragmentInsertionIntent,
  ): ScreenParseResult<unknown>;
  createComponentFragment(componentIds?: readonly string[]): ScreenParseResult<BaseScreenFragmentBody>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface ComponentWorkshopOptions {
  readonly designer: ComponentWorkshopDesigner;
  readonly materials: WorkshopMaterialStore;
  readonly runtime: WorkshopMaterialRuntime;
  readonly fragments: WorkshopFragmentStore;
  /** 宿主预置的组合：只读，排在作者组合前面。 */
  readonly presetFragments?: readonly BaseScreenFragmentDefinition[];
  /** 设计器「存为组合」的请求事件名；给出时工坊接管命名与保存。 */
  readonly fragmentSaveRequestEvent?: string;
  /** 在线物料类型前缀（后端据此识别在线包），缺省 `host.online.`。 */
  readonly typePrefix?: string;
  /** 自定义标签前缀，缺省 `host-online`。 */
  readonly tagPrefix?: string;
  /** 新建组合的 id 前缀，缺省 `host-app.fragment`。 */
  readonly fragmentIdPrefix?: string;
  /** 是否渲染打开工坊的按钮；宿主有自己的入口时关掉，改调 `open()`。 */
  readonly toggle?: boolean;
}

export interface ComponentWorkshopHandle {
  readonly element: HTMLElement;
  open(tab?: WorkshopTab): void;
  close(): void;
  dispose(): void;
}

type WorkshopTab = 'materials' | 'fragments';

interface FieldDraft extends Omit<BaseScreenMaterialSpecField, 'visibleWhen'> {
  readonly uid: number;
  visibleKey: string;
  visibleEquals: string;
}

interface MaterialDraft {
  id?: string;
  revision?: number;
  type: string;
  name: string;
  category: string;
  keywords: string;
  width: number;
  height: number;
  rotate: boolean;
  formatEnabled: boolean;
  formatDecimals: number;
  formatPrefix: boolean;
  formatPrefixDefault: string;
  formatUnit: boolean;
  formatUnitDefault: string;
  formatThousands: boolean;
  formatFollow: string;
  fields: FieldDraft[];
  dataKind: 'none' | 'scalar' | 'rows';
  scalarType: 'number' | 'string';
  scalarSample: string;
  roles: (BaseScreenMaterialSpecRole & { readonly uid: number })[];
  rowsSample: string;
  renderBody: string;
  libraryVisible: boolean;
}

interface FragmentDraft {
  id?: string;
  preset: boolean;
  name: string;
  category: string;
  keywords: string;
  body: BaseScreenFragmentBody;
}

const DEFAULT_TYPE_PREFIX = 'host.online.';
const DEFAULT_TAG_PREFIX = 'host-online';
const DEFAULT_FRAGMENT_PREFIX = 'host-app.fragment';
const PREVIEW_TAG = 'host-online-preview';
const PREVIEW_BOX = { width: 360, height: 220 };
const REFRESH_DELAY = 280;
const SECTION_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  BASE_SCREEN_MATERIAL_SPEC_SECTIONS.map((section) => [section.id, section.label]),
);
const KIND_LABEL: Readonly<Record<BaseScreenMaterialSpecField['kind'], string>> = {
  number: '数字',
  text: '文本',
  boolean: '开关',
  color: '颜色',
  choice: '选项',
};
const CONTROL_LABEL: Readonly<Record<string, string>> = {
  number: '滑杆 / 数字',
  'unit-number': '带单位数字',
  stepper: '步进器',
  boolean: '开关',
  color: '取色器',
  text: '文本框',
  select: '下拉',
  segmented: '分段',
};
const PREVIEW_STATES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'ready', label: '就绪' },
  { id: 'loading', label: '加载中' },
  { id: 'empty', label: '空数据' },
  { id: 'error', label: '出错' },
];

let uidSequence = 0;
const nextUid = (): number => {
  uidSequence += 1;
  return uidSequence;
};

/** 新建组件的起点：一个符合范式的「环形进度」（单值、读数格式、跟随开关的读数样式）。 */
function starterDraft(type: string): MaterialDraft {
  const field = (input: Omit<FieldDraft, 'uid' | 'visibleKey' | 'visibleEquals'>, follow = ''): FieldDraft => ({
    ...input,
    uid: nextUid(),
    visibleKey: follow,
    visibleEquals: follow === '' ? '' : 'true',
  });
  return {
    type,
    name: '环形进度',
    category: '在线组件',
    keywords: '进度, 百分比',
    width: 160,
    height: 160,
    rotate: true,
    formatEnabled: true,
    formatDecimals: 1,
    formatPrefix: false,
    formatPrefixDefault: '',
    formatUnit: true,
    formatUnitDefault: '%',
    formatThousands: false,
    formatFollow: 'showValue',
    fields: [
      field({ key: 'showValue', label: '显示读数', section: 'format', kind: 'boolean', default: true }),
      field({ key: 'color', label: '读数色', section: 'text', kind: 'color', default: '#e6f1ff' }, 'showValue'),
      field(
        { key: 'fontSize', label: '读数字号', section: 'text', kind: 'number', default: 26, min: 10, max: 72, unit: 'px' },
        'showValue',
      ),
      field({ key: 'trackColor', label: '轨道色', section: 'surface', kind: 'color', default: '#132f4c' }),
      field({ key: 'fillColor', label: '填充色', section: 'surface', kind: 'color', default: '#38bdf8' }),
      field({ key: 'strokeWidth', label: '线宽', section: 'surface', kind: 'number', default: 12, min: 2, max: 40, unit: 'px' }),
    ],
    dataKind: 'scalar',
    scalarType: 'number',
    scalarSample: '72.4',
    roles: [],
    rowsSample: '[]',
    renderBody: STARTER_RENDER,
    libraryVisible: true,
  };
}

const STARTER_RENDER = `// 只在 root 里绘制；数据就绪时才会被调用，加载 / 空态 / 出错由 SDK 统一呈现。
const percent = Math.max(0, Math.min(100, Number(value) || 0));
const box = Math.min(size.width, size.height);
const stroke = Math.min(Number(style.strokeWidth) || 12, box / 3);
const radius = (box - stroke) / 2;
const length = 2 * Math.PI * radius;
const ns = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(ns, 'svg');
svg.setAttribute('viewBox', \`0 0 \${box} \${box}\`);
svg.style.cssText = 'display:block;width:100%;height:100%';
const ring = (color, dash) => {
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', String(box / 2));
  circle.setAttribute('cy', String(box / 2));
  circle.setAttribute('r', String(radius));
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', String(color));
  circle.setAttribute('stroke-width', String(stroke));
  if (dash !== undefined) {
    circle.setAttribute('stroke-dasharray', \`\${dash} \${length}\`);
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('transform', \`rotate(-90 \${box / 2} \${box / 2})\`);
  }
  return circle;
};
svg.append(ring(style.trackColor), ring(style.fillColor, (percent / 100) * length));
root.style.cssText = 'display:grid;place-items:center;position:relative';
root.append(svg);
if (props.showValue) {
  const reading = document.createElement('span');
  reading.textContent = formatNumber(value);
  reading.style.cssText = \`position:absolute;color:\${style.color};font:600 \${style.fontSize}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums\`;
  root.append(reading);
}`;

export function createComponentWorkshop(options: ComponentWorkshopOptions): ComponentWorkshopHandle {
  const { designer, materials, runtime, fragments } = options;
  const typePrefix = options.typePrefix ?? DEFAULT_TYPE_PREFIX;
  const tagPrefix = options.tagPrefix ?? DEFAULT_TAG_PREFIX;
  const fragmentPrefix = options.fragmentIdPrefix ?? DEFAULT_FRAGMENT_PREFIX;
  const presets = options.presetFragments ?? [];
  const doc = document;

  const host = doc.createElement('div');
  host.className = 'bs-host';
  host.dataset.componentWorkshop = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = doc.createElement('style');
  sheet.textContent = WORKSHOP_STYLE;
  const toggle = button('组件工坊', 'ws-toggle');
  toggle.dataset.workshopToggle = '';
  toggle.hidden = options.toggle === false;
  const dialog = doc.createElement('dialog');
  dialog.className = 'ws-dialog';
  dialog.setAttribute('aria-label', '组件工坊');
  shadow.append(sheet, toggle, dialog);

  // —— 框架：页头 / 左侧列表 / 编辑区
  const head = el('header', 'ws-head');
  const title = el('div', 'ws-title');
  title.append(el('strong', '', '组件工坊'), el('span', 'ws-subtitle', '在线制作原子组件与组合组件；体检通过后发布到物料库，无需刷新页面。'));
  const close = button('关闭', 'ws-button ws-ghost');
  head.append(title, close);
  const body = el('div', 'ws-body');
  const side = el('aside', 'ws-side');
  const tabs = el('div', 'ws-tabs');
  tabs.setAttribute('role', 'tablist');
  const materialTab = button('原子组件', 'ws-tab');
  const fragmentTab = button('组合组件', 'ws-tab');
  for (const [tab, id] of [
    [materialTab, 'materials'],
    [fragmentTab, 'fragments'],
  ] as const) {
    tab.setAttribute('role', 'tab');
    tab.dataset.workshopTab = id;
  }
  tabs.append(materialTab, fragmentTab);
  const sideAction = button('新建组件', 'ws-button ws-primary ws-wide');
  sideAction.dataset.workshopNew = '';
  const list = el('div', 'ws-list');
  list.dataset.workshopList = '';
  side.append(tabs, sideAction, list);
  const main = el('section', 'ws-main');
  body.append(side, main);
  const status = el('p', 'ws-status');
  status.dataset.workshopStatus = '';
  status.setAttribute('aria-live', 'polite');
  dialog.append(head, body, status);

  let tab: WorkshopTab = 'materials';
  let packages: readonly WorkshopMaterialPackage[] = [];
  let draft: MaterialDraft | undefined;
  let fragmentDraft: FragmentDraft | undefined;
  let busy = false;
  let disposed = false;
  let armedDelete: string | undefined;
  let refreshTimer: number | undefined;
  let previewState = 'ready';
  let previewCode = '';
  let previewRender: BaseScreenMaterialRenderFunction | undefined;
  let previewError: string | undefined;
  let previewToken = 0;

  const setStatus = (message: string, tone: 'info' | 'error' | 'success' = 'info'): void => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const syncFragmentsToDesigner = (): void => {
    designer.materialLibraryFragments = [...presets, ...fragments.list()];
  };
  syncFragmentsToDesigner();

  // —— 列表
  const renderList = (): void => {
    materialTab.setAttribute('aria-selected', String(tab === 'materials'));
    fragmentTab.setAttribute('aria-selected', String(tab === 'fragments'));
    sideAction.textContent = tab === 'materials' ? '新建组件' : '从选区新建组合';
    list.replaceChildren();
    if (tab === 'materials') {
      for (const pkg of packages) {
        const visible = (pkg.manifest as { readonly libraryVisible?: unknown }).libraryVisible !== false;
        list.append(
          listItem(pkg.name, pkg.type, `第 ${pkg.revision} 版 · ${visible ? '已上架' : '已下架'}`, draft?.id === pkg.id, () =>
            openPackage(pkg),
          ),
        );
      }
      if (packages.length === 0) list.append(el('p', 'ws-empty', '还没有在线组件。点「新建组件」从模板开始。'));
      return;
    }
    for (const preset of presets) {
      list.append(listItem(preset.name, preset.category, '预置 · 只读', fragmentDraft?.id === preset.id, () => openFragment(preset, true)));
    }
    for (const item of fragments.list()) {
      list.append(
        listItem(item.name, item.category, `${item.nodes.length + (item.shell === undefined ? 0 : 1)} 个组件`, fragmentDraft?.id === item.id, () =>
          openFragment(item, false),
        ),
      );
    }
    if (presets.length + fragments.list().length === 0) {
      list.append(el('p', 'ws-empty', '在画布上摆好组件并选中，点「从选区新建组合」。'));
    }
  };

  const listItem = (name: string, meta: string, detail: string, selected: boolean, onClick: () => void): HTMLElement => {
    const item = button('', 'ws-item');
    item.classList.toggle('is-selected', selected);
    item.append(el('strong', 'ws-item-name', name), el('span', 'ws-item-meta', meta), el('span', 'ws-item-meta', detail));
    item.addEventListener('click', onClick);
    return item;
  };

  const switchTab = (next: WorkshopTab): void => {
    tab = next;
    armedDelete = undefined;
    renderList();
    if (tab === 'materials') {
      if (draft === undefined) {
        if (packages[0] !== undefined) openPackage(packages[0]);
        else startMaterial();
      } else renderMaterialEditor();
    } else if (fragmentDraft !== undefined) renderFragmentEditor();
    else renderFragmentPlaceholder();
  };

  // ———————————————————————— 原子组件编辑 ————————————————————————

  const startMaterial = (): void => {
    // 类型是文档里的身份（ADR-0090 §5），发布前可改、发布后锁定；缺省给一个带随机后缀的占位。
    draft = starterDraft(`${typePrefix}component-${randomToken(4)}`);
    previewCode = '';
    renderList();
    renderMaterialEditor();
    setStatus('从「环形进度」模板开始：改字段、数据与渲染代码，体检通过后发布。');
  };

  const openPackage = (pkg: WorkshopMaterialPackage): void => {
    const source = readSpecMaterialModule(pkg.code);
    const spec = source === undefined ? undefined : parseBaseScreenMaterialSpec(source.spec);
    if (source === undefined || spec === undefined || !spec.ok) {
      draft = undefined;
      renderList();
      main.replaceChildren(
        el('p', 'ws-empty', `「${pkg.name}」不是组件工坊生成的包（例如旧模板生成的在线物料），只能在物料库里使用。`),
      );
      return;
    }
    draft = draftFromSpec(spec.value, source.renderBody, pkg);
    previewCode = '';
    renderList();
    renderMaterialEditor();
    setStatus(`正在编辑「${pkg.name}」。`);
  };

  const draftFromSpec = (spec: BaseScreenMaterialSpec, renderBody: string, pkg: WorkshopMaterialPackage): MaterialDraft => {
    const data = spec.data;
    return {
      id: pkg.id,
      revision: pkg.revision,
      type: spec.type,
      name: spec.name,
      category: spec.category,
      keywords: spec.keywords.join(', '),
      width: spec.defaultSize.width,
      height: spec.defaultSize.height,
      rotate: spec.rotate !== false,
      formatEnabled: spec.numberFormat !== undefined,
      formatDecimals: spec.numberFormat?.decimals ?? 0,
      formatPrefix: spec.numberFormat?.prefix !== undefined && spec.numberFormat.prefix !== false,
      formatPrefixDefault: typeof spec.numberFormat?.prefix === 'string' ? spec.numberFormat.prefix : '',
      formatUnit: spec.numberFormat?.unit !== undefined && spec.numberFormat.unit !== false,
      formatUnitDefault: typeof spec.numberFormat?.unit === 'string' ? spec.numberFormat.unit : '',
      formatThousands: spec.numberFormat?.thousandsSeparator !== undefined,
      formatFollow: spec.numberFormat?.visibleWhen?.key ?? '',
      fields: spec.fields.map((field) => {
        const { visibleWhen, ...rest } = field;
        return {
          ...rest,
          uid: nextUid(),
          visibleKey: visibleWhen?.key ?? '',
          visibleEquals: visibleWhen === undefined ? '' : String(visibleWhen.equals),
        };
      }),
      dataKind: data.kind,
      scalarType: data.kind === 'scalar' ? data.valueType : 'number',
      scalarSample: data.kind === 'scalar' ? String(data.sample) : '',
      roles: data.kind === 'rows' ? data.roles.map((role) => ({ ...role, uid: nextUid() })) : [],
      rowsSample: data.kind === 'rows' ? JSON.stringify(data.sample, null, 2) : '[]',
      renderBody,
      libraryVisible: (pkg.manifest as { readonly libraryVisible?: unknown }).libraryVisible !== false,
    };
  };

  /** 草稿 → 规格（不做校验：交给 SDK 的解析与体检，界面只负责如实转写）。 */
  const specFromDraft = (current: MaterialDraft): unknown => {
    const fieldByKey = new Map(current.fields.map((field) => [field.key, field]));
    const conditionValue = (key: string, raw: string): string | number | boolean => {
      const dependency = fieldByKey.get(key);
      if (dependency?.kind === 'boolean') return raw !== 'false';
      return raw;
    };
    let rowsSample: unknown = [];
    try {
      rowsSample = JSON.parse(current.rowsSample) as unknown;
    } catch {
      rowsSample = '示例行不是合法 JSON';
    }
    const data =
      current.dataKind === 'none'
        ? { kind: 'none' }
        : current.dataKind === 'scalar'
          ? {
              kind: 'scalar',
              valueType: current.scalarType,
              sample: current.scalarType === 'number' ? Number(current.scalarSample) : current.scalarSample,
            }
          : {
              kind: 'rows',
              roles: current.roles.map(({ uid: _uid, ...role }) => ({
                id: role.id,
                label: role.label,
                valueType: role.valueType,
                ...(role.optional === true ? { optional: true } : {}),
              })),
              sample: rowsSample,
            };
    return {
      type: current.type,
      name: current.name.trim(),
      category: current.category.trim(),
      keywords: splitKeywords(current.keywords),
      defaultSize: { width: current.width, height: current.height },
      ...(current.rotate ? {} : { rotate: false }),
      ...(current.formatEnabled
        ? {
            numberFormat: {
              decimals: current.formatDecimals,
              ...(current.formatPrefix ? { prefix: current.formatPrefixDefault === '' ? true : current.formatPrefixDefault } : {}),
              ...(current.formatUnit ? { unit: current.formatUnitDefault === '' ? true : current.formatUnitDefault } : {}),
              ...(current.formatThousands ? { thousandsSeparator: true } : {}),
              ...(current.formatFollow === ''
                ? {}
                : { visibleWhen: { key: current.formatFollow, equals: conditionValue(current.formatFollow, 'true') } }),
            },
          }
        : {}),
      fields: current.fields.map((field) => {
        const { uid: _uid, visibleKey, visibleEquals, ...rest } = field;
        return {
          ...cleanField(rest),
          ...(visibleKey === '' ? {} : { visibleWhen: { key: visibleKey, equals: conditionValue(visibleKey, visibleEquals) } }),
        };
      }),
      data,
    };
  };

  // 编辑区的可刷新部分（预览、表单预览、体检）
  let previewHost: HTMLElement | undefined;
  let previewPresenter: BaseScreenRenderedMaterialPresenter | undefined;
  let previewStage: HTMLElement | undefined;
  let formPreview: HTMLElement | undefined;
  let auditList: HTMLElement | undefined;
  let publishButton: HTMLButtonElement | undefined;
  let insertButton: HTMLButtonElement | undefined;
  let visibilityButton: HTMLButtonElement | undefined;
  let deleteButton: HTMLButtonElement | undefined;

  const renderMaterialEditor = (): void => {
    const current = draft;
    if (current === undefined) return;
    const form = el('div', 'ws-form');
    form.dataset.workshopMaterialForm = '';

    // 基本信息
    const basics = section('基本信息');
    basics.append(
      textField('名称', current.name, (value) => (current.name = value), 'name'),
      textField('分类', current.category, (value) => (current.category = value), 'category'),
      textField('关键词', current.keywords, (value) => (current.keywords = value), 'keywords', '用逗号分隔'),
      current.id === undefined
        ? textField('物料类型', current.type, (value) => (current.type = value.trim()), 'type', `${typePrefix}…`)
        : readonlyField('物料类型', current.type),
      numberField('默认宽', current.width, (value) => (current.width = value), 'width'),
      numberField('默认高', current.height, (value) => (current.height = value), 'height'),
      checkField('允许旋转', current.rotate, (value) => (current.rotate = value), 'rotate'),
    );

    // 数据
    const data = section('数据', '原子组件只读一种数据形状（ADR-0099 T2）。');
    data.dataset.workshopData = '';
    const kind = selectField(
      '数据形状',
      current.dataKind,
      [
        ['none', '无数据（纯视觉）'],
        ['scalar', '单值（一个读数）'],
        ['rows', '多行（按角色绑定列）'],
      ],
      (value) => {
        current.dataKind = value as MaterialDraft['dataKind'];
        if (current.dataKind === 'rows' && current.roles.length === 0) {
          current.roles = [
            { uid: nextUid(), id: 'name', label: '名称', valueType: 'string' },
            { uid: nextUid(), id: 'value', label: '数值', valueType: 'number' },
          ];
          current.rowsSample = JSON.stringify([{ name: '一号线', value: 82 }, { name: '二号线', value: 64 }], null, 2);
        }
        renderMaterialEditor();
      },
      'dataKind',
    );
    data.append(kind);
    if (current.dataKind === 'scalar') {
      data.append(
        selectField('值类型', current.scalarType, [['number', '数字'], ['string', '文本']], (value) => (current.scalarType = value as 'number' | 'string'), 'scalarType'),
        textField('示例值', current.scalarSample, (value) => (current.scalarSample = value), 'scalarSample'),
      );
    }
    if (current.dataKind === 'rows') {
      const roles = el('div', 'ws-rows');
      roles.dataset.workshopRoles = '';
      for (const role of current.roles) {
        const row = el('div', 'ws-row ws-role');
        row.append(
          inlineText(role.id, (value) => replaceRole(role.uid, { id: value }), '角色 id'),
          inlineText(role.label, (value) => replaceRole(role.uid, { label: value }), '角色名'),
          inlineSelect(role.valueType, [['number', '数字'], ['string', '文本']], (value) => replaceRole(role.uid, { valueType: value as 'number' | 'string' })),
          inlineCheck('可选', role.optional === true, (value) => replaceRole(role.uid, value ? { optional: true } : { optional: false })),
          removeButton(() => {
            current.roles = current.roles.filter((item) => item.uid !== role.uid);
            renderMaterialEditor();
          }),
        );
        roles.append(row);
      }
      const addRole = button('添加角色', 'ws-button ws-ghost');
      addRole.addEventListener('click', () => {
        current.roles = [...current.roles, { uid: nextUid(), id: `role${current.roles.length + 1}`, label: '新角色', valueType: 'string' }];
        renderMaterialEditor();
      });
      data.append(roles, addRole, codeField('示例行（JSON，键为角色 id）', current.rowsSample, (value) => (current.rowsSample = value), 'rowsSample', 6));
    }

    // 读数格式
    const format = section('读数格式', '通用配置组（ADR-0102 §11）：小数位、前缀、单位、千分位在所有组件里同键同控件。');
    const followOptions: [string, string][] = [
      ['', '始终显示'],
      ...current.fields.filter((field) => field.section === 'format' && field.kind === 'boolean').map((field): [string, string] => [field.key, `跟随「${field.label}」`]),
    ];
    format.append(
      checkField('启用读数格式', current.formatEnabled, (value) => {
        current.formatEnabled = value;
        renderMaterialEditor();
      }, 'formatEnabled'),
    );
    if (current.formatEnabled) {
      format.append(
        numberField('默认小数位', current.formatDecimals, (value) => (current.formatDecimals = value), 'formatDecimals'),
        checkField('前缀', current.formatPrefix, (value) => (current.formatPrefix = value), 'formatPrefix'),
        textField('默认前缀', current.formatPrefixDefault, (value) => (current.formatPrefixDefault = value), 'formatPrefixDefault', '例如 ¥'),
        checkField('单位', current.formatUnit, (value) => (current.formatUnit = value), 'formatUnit'),
        textField('默认单位', current.formatUnitDefault, (value) => (current.formatUnitDefault = value), 'formatUnitDefault', '例如 %'),
        checkField('千分位', current.formatThousands, (value) => (current.formatThousands = value), 'formatThousands'),
        selectField('显示条件', current.formatFollow, followOptions, (value) => (current.formatFollow = value), 'formatFollow'),
      );
    }

    // 字段
    const fieldsSection = section('可调项', '分区决定落在 props 还是 style、出现在检查器哪一段；控件按语义自动推导（ADR-0102）。');
    const fieldList = el('div', 'ws-fields');
    fieldList.dataset.workshopFields = '';
    current.fields.forEach((field, index) => fieldList.append(fieldCard(current, field, index)));
    const addField = button('添加可调项', 'ws-button ws-ghost');
    addField.dataset.workshopAddField = '';
    addField.addEventListener('click', () => {
      current.fields = [
        ...current.fields,
        { uid: nextUid(), key: `field${current.fields.length + 1}`, label: '新可调项', section: 'structure', kind: 'number', default: 0, min: 0, max: 100, visibleKey: '', visibleEquals: '' },
      ];
      renderMaterialEditor();
    });
    fieldsSection.append(fieldList, addField);

    // 渲染代码
    const code = section('渲染代码', `函数体可直接使用：${SPEC_RENDER_CONTEXT_NAMES.join('、')}。数据就绪时才会被调用；只在 root 里绘制。`);
    code.append(codeField('render(context)', current.renderBody, (value) => (current.renderBody = value), 'renderBody', 18));

    form.append(basics, data, format, fieldsSection, code);

    // 右栏
    const aside = el('div', 'ws-aside');
    const previewSection = section('预览');
    const states = el('div', 'ws-segmented');
    for (const state of PREVIEW_STATES) {
      const option = button(state.label, 'ws-segment');
      option.dataset.workshopPreviewState = state.id;
      option.setAttribute('aria-pressed', String(previewState === state.id));
      option.addEventListener('click', () => {
        previewState = state.id;
        for (const item of states.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === option));
        scheduleRefresh(0);
      });
      states.append(option);
    }
    previewStage = el('div', 'ws-preview');
    previewStage.dataset.workshopPreview = '';
    previewHost = el('div', 'ws-preview-host');
    previewPresenter = undefined;
    previewStage.append(previewHost);
    previewSection.append(states, previewStage);
    const formSection = section('检查器', '发布后选中组件时检查器的样子：分区、字段与推导出的控件。');
    formPreview = el('div', 'ws-form-preview');
    formPreview.dataset.workshopFormPreview = '';
    formSection.append(formPreview);
    const auditSection = section('体检', '错误阻止发布，警告只提示。');
    auditList = el('ul', 'ws-audit');
    auditList.dataset.workshopAudit = '';
    auditSection.append(auditList);
    const actions = el('div', 'ws-actions');
    publishButton = button(current.id === undefined ? '发布' : '发布新版本', 'ws-button ws-primary');
    publishButton.dataset.workshopPublish = '';
    insertButton = button('插入画布', 'ws-button');
    insertButton.dataset.workshopInsert = '';
    visibilityButton = button(current.libraryVisible ? '下架' : '上架', 'ws-button');
    visibilityButton.dataset.workshopVisibility = '';
    deleteButton = button(armedDelete === current.id ? '确认删除' : '删除', 'ws-button ws-danger');
    deleteButton.dataset.workshopDelete = '';
    const duplicate = button('复制为新组件', 'ws-button');
    duplicate.dataset.workshopDuplicate = '';
    duplicate.hidden = current.id === undefined;
    duplicate.addEventListener('click', duplicateMaterial);
    publishButton.addEventListener('click', () => void publish());
    insertButton.addEventListener('click', insertMaterial);
    visibilityButton.addEventListener('click', () => void toggleVisibility());
    deleteButton.addEventListener('click', () => void deleteMaterial());
    actions.append(publishButton, insertButton, visibilityButton, duplicate, deleteButton);
    aside.append(previewSection, formSection, auditSection, actions);

    const layout = el('div', 'ws-material');
    layout.append(form, aside);
    main.replaceChildren(layout);
    form.addEventListener('input', () => scheduleRefresh());
    form.addEventListener('change', () => scheduleRefresh());
    syncMaterialActions();
    scheduleRefresh(0);
  };

  const replaceRole = (uid: number, patch: Partial<BaseScreenMaterialSpecRole>): void => {
    const current = draft;
    if (current === undefined) return;
    current.roles = current.roles.map((role) => (role.uid === uid ? { ...role, ...patch } : role));
  };

  const fieldCard = (current: MaterialDraft, field: FieldDraft, index: number): HTMLElement => {
    const card = el('div', 'ws-field');
    card.dataset.workshopField = field.key;
    const update = (patch: Partial<FieldDraft>, rerender = false): void => {
      current.fields = current.fields.map((item) => (item.uid === field.uid ? ({ ...item, ...patch } as FieldDraft) : item));
      if (rerender) renderMaterialEditor();
    };
    const top = el('div', 'ws-row');
    top.append(
      inlineText(field.key, (value) => update({ key: value }), '键名'),
      inlineText(field.label, (value) => update({ label: value }), '标签'),
      inlineSelect(field.section, BASE_SCREEN_MATERIAL_SPEC_SECTIONS.map((item): [string, string] => [item.id, `${item.label} · ${item.target}`]), (value) =>
        update({ section: value as FieldDraft['section'] }, true),
      ),
      inlineSelect(field.kind, Object.entries(KIND_LABEL), (value) => update(retypeField(field, value as FieldDraft['kind']), true)),
      moveButton('↑', index > 0, () => moveField(current, index, -1)),
      moveButton('↓', index < current.fields.length - 1, () => moveField(current, index, 1)),
      removeButton(() => {
        current.fields = current.fields.filter((item) => item.uid !== field.uid);
        renderMaterialEditor();
      }),
    );
    const bottom = el('div', 'ws-row ws-row-detail');
    bottom.append(defaultEditor(field, update));
    if (field.kind === 'number') {
      bottom.append(
        inlineNumber(field.min, (value) => update(value === undefined ? withoutKey('min') : { min: value }), '最小'),
        inlineNumber(field.max, (value) => update(value === undefined ? withoutKey('max') : { max: value }), '最大'),
        inlineText(field.unit ?? '', (value) => update(value === '' ? withoutKey('unit') : { unit: value }), '单位'),
      );
    }
    if (field.kind === 'choice') {
      bottom.append(
        inlineText((field.options ?? []).join(', '), (value) => update({ options: splitKeywords(value) }), '选项（逗号分隔）'),
      );
    }
    if (field.kind === 'color') {
      bottom.append(inlineCheck('渐变', field.allowGradient === true, (value) => update(value ? { allowGradient: true } : withoutKey('allowGradient'))));
    }
    const dependencies = current.fields
      .slice(0, index)
      .filter((item) => item.kind === 'boolean' || item.kind === 'choice');
    bottom.append(
      inlineSelect(
        field.visibleKey,
        [['', '始终显示'], ...dependencies.map((item): [string, string] => [item.key, `当「${item.label}」=`])],
        (value) => {
          const dependency = dependencies.find((item) => item.key === value);
          update(
            {
              visibleKey: value,
              visibleEquals: dependency === undefined ? '' : dependency.kind === 'boolean' ? 'true' : String(dependency.options?.[0] ?? ''),
            },
            true,
          );
        },
      ),
    );
    if (field.visibleKey !== '') {
      const dependency = dependencies.find((item) => item.key === field.visibleKey);
      bottom.append(
        dependency?.kind === 'choice'
          ? inlineSelect(field.visibleEquals, (dependency.options ?? []).map((option): [string, string] => [option, option]), (value) => update({ visibleEquals: value }))
          : inlineSelect(field.visibleEquals, [['true', '开'], ['false', '关']], (value) => update({ visibleEquals: value })),
      );
    }
    card.append(top, bottom);
    return card;
  };

  const moveField = (current: MaterialDraft, index: number, delta: number): void => {
    const next = [...current.fields];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(index + delta, 0, moved);
    current.fields = next;
    renderMaterialEditor();
  };

  const scheduleRefresh = (delay = REFRESH_DELAY): void => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void refreshMaterial(), delay);
  };

  /** 一次刷新：转写规格 → 体检 → 表单预览 → 预览（渲染代码变了才重新加载模块）。 */
  const refreshMaterial = async (): Promise<readonly BaseScreenAuthoringFinding[]> => {
    const current = draft;
    if (current === undefined) return [];
    const spec = specFromDraft(current);
    const findings: BaseScreenAuthoringFinding[] = [...auditBaseScreenMaterialSpec(spec, { renderSource: current.renderBody })];
    const parsed = parseBaseScreenMaterialSpec(spec);
    const compiled = parsed.ok ? compileBaseScreenMaterialSpec(parsed.value, { tagName: PREVIEW_TAG }) : undefined;
    renderFormPreview(compiled?.ok === true ? compiled.value : undefined);
    if (parsed.ok && compiled?.ok === true) {
      const token = ++previewToken;
      const code = buildSpecMaterialModule(parsed.value, current.renderBody);
      if (code !== previewCode) {
        const imported = await importSpecMaterialModule(code);
        if (token !== previewToken || draft !== current) return findings;
        previewCode = code;
        previewRender = imported.ok ? imported.value.render : undefined;
        previewError = imported.ok ? undefined : imported.diagnostics[0]?.message;
      }
      if (previewError !== undefined) findings.unshift({ rule: 'RENDER', severity: 'error', message: previewError });
      renderPreview(parsed.value, compiled.value);
    } else {
      previewHost?.replaceChildren(el('p', 'ws-empty', '规格有错误，修正后显示预览。'));
      previewPresenter = undefined;
    }
    renderAudit(findings);
    return findings;
  };

  const renderPreview = (spec: BaseScreenMaterialSpec, manifest: BaseScreenMaterialManifest): void => {
    const stage = previewStage;
    const mountHost = previewHost;
    if (stage === undefined || mountHost === undefined) return;
    const render = previewRender;
    if (render === undefined) {
      mountHost.replaceChildren(el('p', 'ws-empty', '渲染代码无法加载，见体检。'));
      previewPresenter = undefined;
      return;
    }
    const scale = Math.min(1, PREVIEW_BOX.width / spec.defaultSize.width, PREVIEW_BOX.height / spec.defaultSize.height);
    mountHost.style.width = `${spec.defaultSize.width}px`;
    mountHost.style.height = `${spec.defaultSize.height}px`;
    mountHost.style.transform = `scale(${scale})`;
    // 每次重新挂载：渲染函数换了，旧 presenter 持有的是旧函数。
    const mount = mountHost.shadowRoot ?? mountHost.attachShadow({ mode: 'open' });
    previewPresenter = createBaseScreenRenderedMaterialPresenter(mount, { data: spec.data, render });
    previewPresenter.update({
      componentId: 'workshop-preview',
      mode: 'design',
      interactive: false,
      props: manifest.defaultProps,
      style: manifest.defaultStyle,
      size: spec.defaultSize,
      dataState: previewDataState(spec, manifest),
    });
  };

  const previewDataState = (spec: BaseScreenMaterialSpec, manifest: BaseScreenMaterialManifest): BaseScreenMaterialDataState => {
    switch (previewState) {
      case 'loading':
        return { status: 'loading' };
      case 'error':
        return { status: 'error', code: 'HOST_RESOURCE_FAILED', message: '示例：数据源请求失败。' };
      case 'empty':
        return spec.data.kind === 'scalar' ? { status: 'idle' } : { status: 'ready', value: { rows: [], total: 0 } };
      default:
        return spec.data.kind === 'none' ? { status: 'idle' } : { status: 'ready', value: manifest.defaultData ?? null };
    }
  };

  const renderFormPreview = (manifest: BaseScreenMaterialManifest | undefined): void => {
    const target = formPreview;
    if (target === undefined) return;
    target.replaceChildren();
    const sections = manifest?.editorDescriptor?.appearance ?? [];
    if (manifest === undefined) {
      target.append(el('p', 'ws-empty', '规格有错误，修正后显示。'));
      return;
    }
    target.append(el('div', 'ws-form-common', '公共区：位置、尺寸、旋转、不透明度、翻转、滤镜（引擎统一提供，组件不声明）'));
    for (const item of sections) {
      const block = el('div', 'ws-form-section');
      const tier = item.advanced === true ? ' · 仅全量' : item.collapsed === true ? ' · 默认收起' : '';
      block.append(el('div', 'ws-form-section-title', `${item.label}${tier}`));
      for (const field of item.fields) {
        const row = el('div', 'ws-form-row');
        row.append(
          el('span', 'ws-form-label', field.label),
          el('span', 'ws-form-control', `${CONTROL_LABEL[field.control] ?? field.control}${field.unit === undefined ? '' : ` · ${field.unit}`}${field.when === undefined ? '' : ' · 条件显示'}`),
        );
        block.append(row);
      }
      target.append(block);
    }
    if (manifest.dataCapabilities.length > 0) {
      const roles = manifest.dataBinding?.roles.map((role) => role.id).join('、') ?? '';
      target.append(el('div', 'ws-form-common', `数据页：静态数据${manifest.dataCapabilities.includes('dataset') ? ' / 数据集' : ''}${manifest.dataCapabilities.includes('variable') ? ' / 变量' : ''}；绑定角色 ${roles}`));
    }
  };

  const renderAudit = (
    findings: readonly BaseScreenAuthoringFinding[],
    passText = '符合范式，可以发布。',
  ): void => {
    const target = auditList;
    if (target === undefined) return;
    target.replaceChildren();
    if (findings.length === 0) {
      const item = el('li', 'ws-audit-item', passText);
      item.dataset.severity = 'pass';
      target.append(item);
    }
    for (const finding of findings) {
      const item = el('li', 'ws-audit-item');
      item.dataset.severity = finding.severity;
      item.dataset.rule = finding.rule;
      item.append(el('span', 'ws-audit-rule', finding.rule), el('span', '', finding.message));
      target.append(item);
    }
    if (publishButton !== undefined) publishButton.dataset.blocked = String(hasBaseScreenAuthoringErrors(findings));
  };

  const currentPackage = (): WorkshopMaterialPackage | undefined =>
    draft?.id === undefined ? undefined : packages.find((pkg) => pkg.id === draft?.id);

  const syncMaterialActions = (): void => {
    const pkg = currentPackage();
    const visible = (pkg?.manifest as { readonly libraryVisible?: unknown } | undefined)?.libraryVisible !== false;
    if (publishButton !== undefined) publishButton.disabled = busy;
    if (insertButton !== undefined) insertButton.disabled = busy || pkg === undefined || !visible;
    if (visibilityButton !== undefined) {
      visibilityButton.hidden = pkg === undefined;
      visibilityButton.disabled = busy;
      visibilityButton.textContent = visible ? '下架' : '上架';
    }
    if (deleteButton !== undefined) {
      deleteButton.hidden = pkg === undefined;
      deleteButton.disabled = busy;
      deleteButton.textContent = armedDelete !== undefined && armedDelete === pkg?.id ? '确认删除' : '删除';
    }
  };

  const withBusy = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    syncMaterialActions();
    try {
      await work();
    } finally {
      busy = false;
      syncMaterialActions();
    }
  };

  const publish = (): Promise<void> =>
    withBusy(async () => {
      const current = draft;
      if (current === undefined) return;
      window.clearTimeout(refreshTimer);
      const findings = await refreshMaterial();
      if (hasBaseScreenAuthoringErrors(findings)) {
        setStatus(`体检有 ${findings.filter((item) => item.severity === 'error').length} 个错误，修正后再发布。`, 'error');
        return;
      }
      if (!current.type.startsWith(typePrefix)) {
        setStatus(`物料类型必须以 ${typePrefix} 开头（宿主据此识别在线组件）。`, 'error');
        return;
      }
      const parsed = parseBaseScreenMaterialSpec(specFromDraft(current));
      if (!parsed.ok) return;
      const tagName = `${tagPrefix}-${slugify(current.type.slice(typePrefix.length))}-${randomToken(8)}`;
      const manifest = compileBaseScreenMaterialSpec(parsed.value, {
        tagName,
        ...(current.libraryVisible ? {} : { libraryVisible: false }),
      });
      if (!manifest.ok) {
        setStatus(manifest.diagnostics[0]?.message ?? '清单编译失败。', 'error');
        return;
      }
      const saved = await materials.save({
        ...(current.id === undefined ? {} : { id: current.id }),
        ...(current.revision === undefined ? {} : { revision: current.revision }),
        type: current.type,
        name: parsed.value.name,
        manifest: manifest.value as unknown as Record<string, unknown>,
        code: buildSpecMaterialModule(parsed.value, current.renderBody),
      });
      if (!saved.ok) {
        setStatus(`保存失败：${saved.message}`, 'error');
        return;
      }
      const applied = await runtime.apply(saved.value);
      if (!applied.ok) {
        setStatus(`已保存，但装载进物料库失败：${applied.diagnostics[0]?.message ?? '未知错误'}`, 'error');
        return;
      }
      packages = [saved.value, ...packages.filter((pkg) => pkg.id !== saved.value.id)];
      current.id = saved.value.id;
      current.revision = saved.value.revision;
      renderList();
      if (publishButton !== undefined) publishButton.textContent = '发布新版本';
      const warnings = findings.filter((item) => item.severity === 'warning').length;
      setStatus(
        `已发布「${saved.value.name}」第 ${saved.value.revision} 版：物料库已更新${warnings > 0 ? `（${warnings} 条警告）` : ''}。`,
        'success',
      );
    });

  /** 以当前组件为起点另建一个：类型重新生成（文档身份不能复用），其余照抄。 */
  const duplicateMaterial = (): void => {
    const current = draft;
    if (current === undefined) return;
    const { id: _id, revision: _revision, ...rest } = current;
    draft = {
      ...rest,
      type: `${typePrefix}component-${randomToken(4)}`,
      name: `${current.name} 副本`,
      fields: current.fields.map((field) => ({ ...field, uid: nextUid() })),
      roles: current.roles.map((role) => ({ ...role, uid: nextUid() })),
      libraryVisible: true,
    };
    previewCode = '';
    renderList();
    renderMaterialEditor();
    setStatus('已复制：改好物料类型与名称后发布，原组件不受影响。');
  };

  const insertMaterial = (): void => {
    const current = draft;
    if (current === undefined) return;
    const materialType = current.type;
    const result = designer.insertComponent({ materialType });
    setStatus(result.ok ? `已插入「${current.name}」：在检查器里调整可调项。` : (result.diagnostics[0]?.message ?? '插入失败。'), result.ok ? 'success' : 'error');
  };

  const toggleVisibility = (): Promise<void> =>
    withBusy(async () => {
      const pkg = currentPackage();
      if (pkg === undefined || draft === undefined) return;
      const visible = (pkg.manifest as { readonly libraryVisible?: unknown }).libraryVisible === false;
      const saved = await materials.setVisibility(pkg.id, visible);
      if (!saved.ok) {
        setStatus(`操作失败：${saved.message}`, 'error');
        return;
      }
      const applied = await runtime.apply(saved.value);
      if (!applied.ok) {
        setStatus(applied.diagnostics[0]?.message ?? '物料库更新失败。', 'error');
        return;
      }
      packages = packages.map((item) => (item.id === pkg.id ? saved.value : item));
      draft.libraryVisible = visible;
      draft.revision = saved.value.revision;
      renderList();
      setStatus(visible ? '已上架：物料库重新显示该组件。' : '已下架：物料库隐藏该组件，已有组件继续渲染。', 'success');
    });

  const deleteMaterial = (): Promise<void> =>
    withBusy(async () => {
      const pkg = currentPackage();
      if (pkg === undefined) return;
      if (armedDelete !== pkg.id) {
        armedDelete = pkg.id;
        setStatus('再次点击「确认删除」。仍被画布引用的组件不能删除，可以先下架。');
        return;
      }
      armedDelete = undefined;
      const removed = await runtime.remove(pkg.type);
      if (!removed.ok) {
        setStatus(`不能删除：${removed.diagnostics[0]?.message ?? '组件仍被引用'}。可以先下架。`, 'error');
        return;
      }
      const deleted = await materials.remove(pkg.id);
      if (!deleted.ok) {
        await runtime.apply(pkg);
        setStatus(`删除失败：${deleted.message}`, 'error');
        return;
      }
      packages = packages.filter((item) => item.id !== pkg.id);
      draft = undefined;
      renderList();
      if (packages[0] !== undefined) openPackage(packages[0]);
      else startMaterial();
      setStatus('已删除在线组件。', 'success');
    });

  // ———————————————————————— 组合组件编辑 ————————————————————————

  const renderFragmentPlaceholder = (): void => {
    main.replaceChildren(
      el(
        'div',
        'ws-placeholder',
        '组合组件由画布上的组件组成：摆好标题、读数、底板（用容器做外壳），全部选中或只选中外壳，点左侧「从选区新建组合」。插入后组合展开成普通组件，可以逐个调整（ADR-0100）。',
      ),
    );
  };

  const startFragmentFromSelection = (): void => {
    const extracted = designer.createComponentFragment();
    if (!extracted.ok) {
      setStatus(extractionMessage(extracted.diagnostics), 'error');
      return;
    }
    openFragmentBody(extracted.value, extracted.value.shell?.name ?? extracted.value.nodes[0]?.name ?? '');
    const dropped = extracted.diagnostics.filter((item) => item.severity === 'warning');
    if (dropped.length > 0) setStatus(`已从选区提取；${dropped.map((item) => item.message).join('；')}`);
  };

  const openFragmentBody = (fragmentBody: BaseScreenFragmentBody, suggestedName: string): void => {
    fragmentDraft = {
      preset: false,
      name: suggestedName.trim() === '' ? `我的组合 ${fragments.list().length + 1}` : suggestedName,
      category: '我的组合',
      keywords: '组合',
      body: fragmentBody,
    };
    tab = 'fragments';
    renderList();
    renderFragmentEditor();
    setStatus('已从选区提取组合：起个名字、看过体检后保存。');
  };

  const openFragment = (definition: BaseScreenFragmentDefinition, preset: boolean): void => {
    const { id, name, category, keywords, cover: _cover, ...fragmentBody } = definition;
    fragmentDraft = { id, preset, name, category, keywords: keywords.join(', '), body: fragmentBody };
    renderList();
    renderFragmentEditor();
    setStatus(preset ? `「${name}」是宿主预置组合，只能插入。` : `正在编辑「${name}」。`);
  };

  const fragmentDefinition = (current: FragmentDraft): BaseScreenFragmentDefinition => ({
    id: current.id ?? `${fragmentPrefix}-${Date.now().toString(36)}`,
    name: current.name.trim(),
    category: current.category.trim(),
    keywords: splitKeywords(current.keywords),
    ...current.body,
  });

  const renderFragmentEditor = (): void => {
    const current = fragmentDraft;
    if (current === undefined) return;
    const form = el('div', 'ws-form');
    form.dataset.workshopFragmentForm = '';
    const basics = section('基本信息');
    basics.append(
      textField('名称', current.name, (value) => (current.name = value), 'fragmentName'),
      textField('分类', current.category, (value) => (current.category = value), 'fragmentCategory'),
      textField('关键词', current.keywords, (value) => (current.keywords = value), 'fragmentKeywords', '用逗号分隔'),
    );
    if (current.preset) for (const input of basics.querySelectorAll('input')) input.disabled = true;
    const outline = section('组成', '插入后展开为这些普通组件；外壳承担卡片底板（ADR-0100 F2）。');
    const nodes = el('div', 'ws-outline');
    nodes.dataset.workshopOutline = '';
    const catalog = designer.catalog;
    const entries = [
      ...(current.body.shell === undefined ? [] : [{ entry: current.body.shell, role: '外壳', depth: 0 }]),
      ...current.body.nodes.map((node) => ({
        entry: node,
        role: node.parent === undefined ? (current.body.shell === undefined ? '节点' : '子节点') : '子节点',
        depth: node.parent === undefined ? (current.body.shell === undefined ? 0 : 1) : 2,
      })),
    ];
    for (const { entry, role, depth } of entries) {
      const row = el('div', 'ws-outline-row');
      row.style.paddingInlineStart = `${8 + depth * 14}px`;
      const materialName = catalog?.get(entry.materialType)?.manifest.name ?? entry.materialType;
      row.append(
        el('span', 'ws-outline-role', role),
        el('strong', '', entry.name ?? entry.key),
        el('span', 'ws-item-meta', `${materialName}${entry.size === undefined ? '' : ` · ${entry.size.width}×${entry.size.height}`}`),
      );
      nodes.append(row);
    }
    if ((current.body.dataSources?.length ?? 0) > 0) {
      nodes.append(el('div', 'ws-form-common', `共享数据源 ${current.body.dataSources?.length} 个：插入时一并生成，节点经字段引用读取。`));
    }
    outline.append(nodes);
    form.append(basics, outline);

    const aside = el('div', 'ws-aside');
    const auditSection = section('体检', '错误阻止保存，警告只提示。');
    auditList = el('ul', 'ws-audit');
    auditList.dataset.workshopAudit = '';
    auditSection.append(auditList);
    const actions = el('div', 'ws-actions');
    const save = button(current.id === undefined ? '保存组合' : '保存修改', 'ws-button ws-primary');
    save.dataset.workshopSaveFragment = '';
    const replace = button('用当前选区更新', 'ws-button');
    replace.dataset.workshopReplaceFragment = '';
    const insert = button('插入画布', 'ws-button');
    insert.dataset.workshopInsertFragment = '';
    const remove = button(armedDelete !== undefined && armedDelete === current.id ? '确认删除' : '删除', 'ws-button ws-danger');
    remove.dataset.workshopDeleteFragment = '';
    save.hidden = current.preset;
    replace.hidden = current.preset;
    remove.hidden = current.preset || current.id === undefined;
    save.addEventListener('click', () => saveFragment());
    replace.addEventListener('click', () => {
      const extracted = designer.createComponentFragment();
      if (!extracted.ok) {
        setStatus(extractionMessage(extracted.diagnostics), 'error');
        return;
      }
      current.body = extracted.value;
      renderFragmentEditor();
      setStatus('已用当前选区替换组合内容，保存后生效。');
    });
    insert.addEventListener('click', () => {
      const result = designer.insertComponentFragment({ ...current.body });
      setStatus(result.ok ? `已插入「${current.name}」。` : (result.diagnostics[0]?.message ?? '插入失败。'), result.ok ? 'success' : 'error');
    });
    remove.addEventListener('click', () => {
      if (current.id === undefined) return;
      if (armedDelete !== current.id) {
        armedDelete = current.id;
        remove.textContent = '确认删除';
        setStatus('再次点击「确认删除」。已插入画布的组件不受影响。');
        return;
      }
      armedDelete = undefined;
      fragments.remove(current.id);
      syncFragmentsToDesigner();
      fragmentDraft = undefined;
      renderList();
      renderFragmentPlaceholder();
      setStatus('已删除组合。', 'success');
    });
    actions.append(save, replace, insert, remove);
    aside.append(auditSection, actions);
    const layout = el('div', 'ws-material');
    layout.append(form, aside);
    main.replaceChildren(layout);
    const refresh = (): void =>
      renderAudit(auditBaseScreenFragment(fragmentDefinition(current), designer.catalog), '符合范式，可以保存。');
    form.addEventListener('input', refresh);
    refresh();
  };

  const saveFragment = (): void => {
    const current = fragmentDraft;
    if (current === undefined || current.preset) return;
    const definition = fragmentDefinition(current);
    const findings = auditBaseScreenFragment(definition, designer.catalog);
    renderAudit(findings, '符合范式，可以保存。');
    if (hasBaseScreenAuthoringErrors(findings)) {
      setStatus('体检有错误，修正后再保存。', 'error');
      return;
    }
    fragments.save(definition);
    current.id = definition.id;
    syncFragmentsToDesigner();
    renderList();
    renderFragmentEditor();
    setStatus(`已保存组合「${definition.name}」：物料库「${definition.category}」分类里可以拖入。`, 'success');
  };

  // —— 事件
  const open = (next: WorkshopTab = tab): void => {
    if (!dialog.open) dialog.showModal();
    void loadPackages().then(() => switchTab(next));
  };

  const loadPackages = async (): Promise<void> => {
    const listed = await materials.list();
    if (disposed) return;
    if (!listed.ok) {
      setStatus(`在线组件读取失败：${listed.message}`, 'error');
      return;
    }
    packages = listed.value;
  };

  const onSaveRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly fragment: BaseScreenFragmentBody; readonly suggestedName: string }>).detail;
    if (!dialog.open) dialog.showModal();
    void loadPackages();
    openFragmentBody(detail.fragment, detail.suggestedName);
  };

  toggle.addEventListener('click', () => (dialog.open ? dialog.close() : open()));
  close.addEventListener('click', () => dialog.close());
  materialTab.addEventListener('click', () => switchTab('materials'));
  fragmentTab.addEventListener('click', () => switchTab('fragments'));
  sideAction.addEventListener('click', () => (tab === 'materials' ? startMaterial() : startFragmentFromSelection()));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });
  if (options.fragmentSaveRequestEvent !== undefined) {
    designer.addEventListener(options.fragmentSaveRequestEvent, onSaveRequest);
  }

  return {
    element: host,
    open,
    close: () => dialog.close(),
    dispose(): void {
      disposed = true;
      window.clearTimeout(refreshTimer);
      if (options.fragmentSaveRequestEvent !== undefined) {
        designer.removeEventListener(options.fragmentSaveRequestEvent, onSaveRequest);
      }
      if (dialog.open) dialog.close();
      host.remove();
    },
  };
}

// ———————————————————————————— 小工具 ————————————————————————————

/** 选区提取失败的宿主文案：没选中是最常见的情况，其余沿用引擎诊断。 */
function extractionMessage(diagnostics: readonly { readonly code: string; readonly message: string }[]): string {
  const first = diagnostics[0];
  if (first === undefined || first.code === 'AUTHORING_SOURCE_INVALID') {
    return '先在画布上选中要组合的组件（外壳或全部组件）。';
  }
  if (first.code === 'AUTHORING_VARIABLE_UNSUPPORTED' || /variable/i.test(first.message)) {
    return '选区引用了变量：组合不携带变量，先把这些组件改成固定值或共享数据源。';
  }
  return `无法从选区提取组合：${first.message}`;
}

function retypeField(field: FieldDraft, kind: FieldDraft['kind']): Partial<FieldDraft> {
  const base = { kind } as Partial<FieldDraft>;
  switch (kind) {
    case 'number':
      return { ...base, default: 0, min: 0, max: 100 };
    case 'boolean':
      return { ...base, default: true };
    case 'color':
      return { ...base, default: '#38bdf8' };
    case 'choice':
      return { ...base, default: 'a', options: ['a', 'b'] };
    default:
      return { ...base, default: typeof field.default === 'string' ? field.default : '' };
  }
}

/** 按类型去掉不适用的键（切换类型后残留的范围、选项等）。 */
function cleanField(field: Omit<FieldDraft, 'uid' | 'visibleKey' | 'visibleEquals'>): BaseScreenMaterialSpecField {
  const { min, max, step, unit, options, allowGradient, help, ...rest } = field;
  return {
    ...rest,
    ...(field.kind === 'number'
      ? {
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
          ...(step === undefined ? {} : { step }),
          ...(unit === undefined ? {} : { unit }),
        }
      : {}),
    ...(field.kind === 'choice' && options !== undefined ? { options } : {}),
    ...(field.kind === 'color' && allowGradient === true ? { allowGradient } : {}),
    ...(help === undefined || help === '' ? {} : { help }),
  };
}

/** 清掉一个可选键：合并进草稿后由 `cleanField` 在转写规格时略去。 */
function withoutKey(key: 'min' | 'max' | 'unit' | 'allowGradient'): Partial<FieldDraft> {
  return { [key]: undefined } as unknown as Partial<FieldDraft>;
}

function sameManifest(left: BaseScreenMaterialManifest, right: BaseScreenMaterialManifest): boolean {
  return screenJsonEquals(comparableManifest(left), comparableManifest(right));
}

/**
 * 示例后端把 `libraryVisible` 规范成显式的 `true`，规格编译在可见时省略该键：两者语义相同，
 * 比较前统一去掉「可见」标记，否则后端存过的包在刷新后会被误判为「清单与规格不一致」。
 */
function comparableManifest(manifest: BaseScreenMaterialManifest): ScreenJsonValue {
  const { libraryVisible, ...rest } = manifest;
  return (libraryVisible === false ? manifest : rest) as unknown as ScreenJsonValue;
}

function defaultEditor(field: FieldDraft, update: (patch: Partial<FieldDraft>) => void): HTMLElement {
  switch (field.kind) {
    case 'boolean':
      return inlineSelect(String(field.default), [['true', '默认开'], ['false', '默认关']], (value) => update({ default: value === 'true' }));
    case 'number':
      return inlineNumber(typeof field.default === 'number' ? field.default : 0, (value) => update({ default: value ?? 0 }), '默认值');
    case 'color': {
      const wrap = el('span', 'ws-color');
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'ws-input ws-swatch';
      const text = inlineText(String(field.default), (value) => update({ default: value }), '默认颜色');
      const textInput = text as HTMLInputElement;
      picker.value = /^#[0-9a-f]{6}$/i.test(String(field.default)) ? String(field.default) : '#000000';
      picker.addEventListener('input', () => {
        textInput.value = picker.value;
        update({ default: picker.value });
      });
      wrap.append(picker, text);
      return wrap;
    }
    case 'choice':
      return inlineSelect(String(field.default), (field.options ?? []).map((option): [string, string] => [option, `默认 ${option}`]), (value) => update({ default: value }));
    default:
      return inlineText(String(field.default), (value) => update({ default: value }), '默认值');
  }
}

function section(titleText: string, hint?: string): HTMLElement {
  const element = el('section', 'ws-section');
  element.append(el('h3', 'ws-section-title', titleText));
  if (hint !== undefined) element.append(el('p', 'ws-hint', hint));
  return element;
}

function labelled(labelText: string, control: HTMLElement, key: string): HTMLElement {
  const wrapper = el('label', 'ws-labelled');
  wrapper.dataset.workshopInput = key;
  wrapper.append(el('span', 'ws-label', labelText), control);
  return wrapper;
}

function textField(labelText: string, value: string, onInput: (value: string) => void, key: string, placeholder = ''): HTMLElement {
  return labelled(labelText, inlineText(value, onInput, placeholder), key);
}

function readonlyField(labelText: string, value: string): HTMLElement {
  const input = inlineText(value, () => {}, '') as HTMLInputElement;
  input.readOnly = true;
  return labelled(labelText, input, 'type');
}

function numberField(labelText: string, value: number, onInput: (value: number) => void, key: string): HTMLElement {
  return labelled(labelText, inlineNumber(value, (next) => onInput(next ?? 0), ''), key);
}

function checkField(labelText: string, value: boolean, onChange: (value: boolean) => void, key: string): HTMLElement {
  const wrapper = el('label', 'ws-labelled ws-check');
  wrapper.dataset.workshopInput = key;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.append(el('span', 'ws-label', labelText), input);
  return wrapper;
}

function selectField(labelText: string, value: string, options: readonly (readonly [string, string])[], onChange: (value: string) => void, key: string): HTMLElement {
  return labelled(labelText, inlineSelect(value, options, onChange), key);
}

function codeField(labelText: string, value: string, onInput: (value: string) => void, key: string, rows: number): HTMLElement {
  const area = document.createElement('textarea');
  area.className = 'ws-input ws-code';
  area.rows = rows;
  area.spellcheck = false;
  area.value = value;
  area.addEventListener('input', () => onInput(area.value));
  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const start = area.selectionStart;
    area.setRangeText('  ', start, area.selectionEnd, 'end');
    onInput(area.value);
  });
  const wrapper = labelled(labelText, area, key);
  wrapper.classList.add('ws-labelled-block');
  return wrapper;
}

function inlineText(value: string, onInput: (value: string) => void, placeholder: string): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ws-input';
  input.value = value;
  input.placeholder = placeholder;
  if (placeholder !== '') input.setAttribute('aria-label', placeholder);
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function inlineNumber(value: number | undefined, onInput: (value: number | undefined) => void, placeholder: string): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'ws-input ws-number';
  input.value = value === undefined ? '' : String(value);
  input.placeholder = placeholder;
  if (placeholder !== '') input.setAttribute('aria-label', placeholder);
  input.addEventListener('input', () => {
    const next = input.value.trim() === '' ? undefined : Number(input.value);
    onInput(next === undefined || Number.isFinite(next) ? next : undefined);
  });
  return input;
}

function inlineSelect(value: string, options: readonly (readonly [string, string])[], onChange: (value: string) => void): HTMLElement {
  const select = document.createElement('select');
  select.className = 'ws-input';
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function inlineCheck(labelText: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  const wrapper = el('label', 'ws-inline-check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.append(input, el('span', '', labelText));
  return wrapper;
}

function removeButton(onClick: () => void): HTMLElement {
  const control = button('×', 'ws-icon');
  control.setAttribute('aria-label', '删除');
  control.addEventListener('click', onClick);
  return control;
}

function moveButton(text: string, enabled: boolean, onClick: () => void): HTMLElement {
  const control = button(text, 'ws-icon');
  control.setAttribute('aria-label', text === '↑' ? '上移' : '下移');
  control.disabled = !enabled;
  control.addEventListener('click', onClick);
  return control;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== '') element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, className: string): HTMLButtonElement {
  const control = el('button', className, text);
  control.type = 'button';
  return control;
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug === '' ? 'component' : slug;
}

function randomToken(length: number): string {
  const source =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : Math.random().toString(36).slice(2);
  return source.slice(0, length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ok<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function workshopFailure(
  code: 'PLUGIN_CORE_LIFECYCLE_INVALID' | 'PLUGIN_CORE_IDENTITY_CONFLICT' | 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

const WORKSHOP_STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.ws-toggle, .ws-button, .ws-tab, .ws-item, .ws-segment, .ws-icon, .ws-input {
  font: var(--bs-host-font-small, 12px/1.4 system-ui, sans-serif);
  color: var(--bs-host-text-primary, #f5f5f5);
}
.ws-toggle {
  height: var(--bs-host-control-height, 30px); padding: 0 12px; cursor: pointer;
  border: 1px solid var(--bs-host-border-default, rgb(245 245 245 / 15%));
  border-radius: var(--bs-host-radius-control, 6px);
  background: var(--bs-host-surface-control, #161616);
}
.ws-toggle:hover { background: var(--bs-host-surface-control-hover, #2a2a2a); }
.ws-dialog {
  width: min(1180px, calc(100vw - 48px)); height: min(820px, calc(100vh - 48px)); padding: 0;
  border: 1px solid var(--bs-host-border-default, rgb(245 245 245 / 15%));
  border-radius: var(--bs-host-radius-overlay, 8px);
  background: var(--bs-host-surface-panel, #0f0f0f); color: var(--bs-host-text-primary, #f5f5f5);
  box-shadow: var(--bs-host-shadow-overlay, 0 12px 32px -12px rgb(0 0 0 / 78%));
  font: var(--bs-host-font, 13px/1.5 system-ui, sans-serif);
}
.ws-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.ws-dialog::backdrop { background: var(--bs-host-surface-scrim, rgb(0 0 0 / 70%)); }
.ws-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px;
  border-bottom: 1px solid var(--bs-host-border-subtle, rgb(245 245 245 / 10%)); }
.ws-title { display: grid; gap: 2px; }
.ws-subtitle, .ws-hint, .ws-item-meta, .ws-empty { color: var(--bs-host-text-muted, #8d8d8d); font-size: 12px; }
.ws-hint { margin: 0 0 8px; }
.ws-body { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 0; }
.ws-side { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; padding: 12px;
  border-right: 1px solid var(--bs-host-border-subtle, rgb(245 245 245 / 10%)); min-height: 0; }
.ws-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 2px; border-radius: 6px; background: var(--bs-host-surface-control, #161616); }
.ws-tab { height: 26px; border: 0; border-radius: 4px; background: none; cursor: pointer; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-tab[aria-selected="true"] { background: var(--bs-host-surface-control-active, #323232); color: var(--bs-host-text-primary, #f5f5f5); }
.ws-list { display: grid; align-content: start; gap: 4px; overflow: auto; min-height: 0; }
.ws-item { display: grid; gap: 1px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
.ws-item:hover { background: var(--bs-host-surface-control-hover, #2a2a2a); }
.ws-item.is-selected { border-color: var(--bs-host-accent, #5297fc); background: var(--bs-host-accent-surface, #161d27); }
.ws-item-name { font-weight: 600; }
.ws-main { min-height: 0; overflow: hidden; }
.ws-material { display: grid; grid-template-columns: minmax(0, 1fr) 392px; height: 100%; min-height: 0; }
.ws-form, .ws-aside { overflow: auto; min-height: 0; padding: 12px 16px; display: grid; align-content: start; gap: 14px; }
.ws-aside { border-left: 1px solid var(--bs-host-border-subtle, rgb(245 245 245 / 10%)); }
.ws-section { display: grid; gap: 6px; }
.ws-section-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-labelled { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 8px; }
.ws-labelled-block { grid-template-columns: 1fr; }
.ws-label { color: var(--bs-host-text-secondary, #c6c6c6); font-size: 12px; }
.ws-check { grid-template-columns: 96px auto; justify-content: start; }
.ws-input { height: 28px; min-width: 0; width: 100%; padding: 0 8px; border: 1px solid var(--bs-host-border-default, rgb(245 245 245 / 15%));
  border-radius: 4px; background: var(--bs-host-surface-control, #161616); }
.ws-input:focus-visible, .ws-button:focus-visible, .ws-item:focus-visible { outline: 2px solid var(--bs-host-focus-ring, #5297fc); outline-offset: 1px; }
.ws-input[readonly] { color: var(--bs-host-text-muted, #8d8d8d); }
select.ws-input { padding: 0 4px; }
.ws-number { width: 100%; }
.ws-code { height: auto; padding: 8px; font: 12px/1.55 var(--bs-host-font-family-mono, ui-monospace, monospace); white-space: pre; tab-size: 2; resize: vertical; }
.ws-fields, .ws-rows { display: grid; gap: 6px; }
.ws-field { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--bs-host-border-subtle, rgb(245 245 245 / 10%)); border-radius: 6px; }
.ws-row { display: grid; grid-template-columns: 1fr 1fr 1.3fr 0.8fr 24px 24px 24px; gap: 6px; align-items: center; }
.ws-role { grid-template-columns: 1fr 1fr 0.8fr auto 24px; }
.ws-row-detail { grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); }
.ws-color { display: grid; grid-template-columns: 28px 1fr; gap: 4px; }
.ws-swatch { padding: 2px; }
.ws-inline-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-button { height: 30px; padding: 0 12px; border: 1px solid var(--bs-host-border-default, rgb(245 245 245 / 15%)); border-radius: 6px;
  background: var(--bs-host-surface-control, #161616); cursor: pointer; }
.ws-button:hover:not(:disabled) { background: var(--bs-host-surface-control-hover, #2a2a2a); }
.ws-button:disabled, .ws-icon:disabled { opacity: .45; cursor: default; }
.ws-primary { border-color: transparent; background: var(--bs-host-action-primary, #5297fc); color: var(--bs-host-text-on-accent, #1c2b40); font-weight: 600; }
.ws-primary:hover:not(:disabled) { background: var(--bs-host-action-primary-hover, #6aa6fc); }
.ws-primary[data-blocked="true"] { opacity: .6; }
.ws-danger { color: var(--bs-host-danger-text, #fd7469); }
.ws-ghost { background: none; }
.ws-wide { width: 100%; }
.ws-icon { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: none; cursor: pointer; color: var(--bs-host-text-muted, #8d8d8d); }
.ws-icon:hover:not(:disabled) { background: var(--bs-host-surface-control-hover, #2a2a2a); color: var(--bs-host-text-primary, #f5f5f5); }
.ws-segmented { display: inline-grid; grid-auto-flow: column; padding: 2px; border-radius: 6px; background: var(--bs-host-surface-control, #161616); justify-self: start; }
.ws-segment { height: 24px; padding: 0 10px; border: 0; border-radius: 4px; background: none; cursor: pointer; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-segment[aria-pressed="true"] { background: var(--bs-host-surface-control-active, #323232); color: var(--bs-host-text-primary, #f5f5f5); }
.ws-preview { display: grid; place-items: center; height: 236px; overflow: hidden; border-radius: 6px;
  background: repeating-conic-gradient(#121a24 0 25%, #0f1620 0 50%) 0 0 / 16px 16px; }
.ws-preview-host { flex: none; transform-origin: center; color: #e6f1ff; }
.ws-form-preview { display: grid; gap: 8px; }
.ws-form-section { display: grid; gap: 2px; padding: 6px 8px; border-radius: 6px; background: var(--bs-host-surface-raised, #080808); }
.ws-form-section-title { font-size: 11px; font-weight: 600; color: var(--bs-host-text-muted, #8d8d8d); }
.ws-form-row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; font-size: 12px; }
.ws-form-label { color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-form-control { color: var(--bs-host-text-muted, #8d8d8d); }
.ws-form-common { font-size: 11px; color: var(--bs-host-text-muted, #8d8d8d); }
.ws-audit { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.ws-audit-item { display: grid; grid-template-columns: auto 1fr; gap: 8px; padding: 6px 8px; border-radius: 4px; font-size: 12px;
  background: var(--bs-host-surface-raised, #080808); }
.ws-audit-item[data-severity="error"] { background: var(--bs-host-danger-surface, #2b1a18); color: var(--bs-host-danger-text, #fd7469); }
.ws-audit-item[data-severity="warning"] { background: var(--bs-host-warning-surface, #292311); color: var(--bs-host-warning, #e6b221); }
.ws-audit-item[data-severity="pass"] { grid-template-columns: 1fr; background: var(--bs-host-success-surface, #17261b); color: var(--bs-host-success, #4fcb6f); }
.ws-audit-rule { font: 600 11px/1.6 var(--bs-host-font-family-mono, ui-monospace, monospace); }
.ws-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ws-outline { display: grid; gap: 2px; }
.ws-outline-row { display: grid; grid-template-columns: 52px auto 1fr; gap: 8px; align-items: baseline; padding: 4px 8px; border-radius: 4px; background: var(--bs-host-surface-raised, #080808); font-size: 12px; }
.ws-outline-role { color: var(--bs-host-text-muted, #8d8d8d); font-size: 11px; }
.ws-placeholder { margin: 24px; padding: 16px; max-width: 560px; border: 1px dashed var(--bs-host-border-default, rgb(245 245 245 / 15%)); border-radius: 8px; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-status { margin: 0; min-height: 34px; padding: 8px 16px; border-top: 1px solid var(--bs-host-border-subtle, rgb(245 245 245 / 10%)); font-size: 12px; color: var(--bs-host-text-secondary, #c6c6c6); }
.ws-status[data-tone="error"] { color: var(--bs-host-danger-text, #fd7469); }
.ws-status[data-tone="success"] { color: var(--bs-host-success, #4fcb6f); }
`;

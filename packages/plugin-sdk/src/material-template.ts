import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialTemplateExpression,
  type BaseScreenMaterialTemplateScope,
  parseBaseScreenMaterialTemplateExpression,
} from './material-template-expression.js';

/**
 * L2 物料模板（base-screen-docs ADR-0116）：不含任意代码的渲染描述。
 *
 * 一个模板是一张 SVG 画面：声明 `viewBox` 与适配方式，节点按树形嵌套，属性要么是字面量，要么是
 * 绑定表达式（`material-template-expression.ts`）。解释器（`material-template-render.ts`）只用
 * `createElementNS` 构造白名单内的元素与属性，不生成、也不解析任何 SVG / HTML 字符串。
 *
 * 写法约束（让体检能静态算出可读性，ADR-0116 §2.4）：
 * - 颜色（fill / stroke / 渐变色标）只能是字面量颜色、`style.<颜色字段>`，或用 `pick(...)` / 三元在
 *   它们之间选择——不能由数据算出颜色字符串；语义色由样式字段承担，字段值可以写主题引用（`theme:danger`），
 *   由渲染器解析；
 * - 文字字号以**屏幕像素**写（与检查器里的字号同一单位），只能是字面量或 props / style 数字字段的
 *   四则运算；解释器按 viewBox 与组件尺寸换算；
 * - 文字必须声明底板 `backdrop`（某个填充节点的 id，或 `container` 表示组件背景）。
 */

export type BaseScreenMaterialTemplateFit = 'contain' | 'cover' | 'stretch';

/** 模板节点：形状由 `kind` 决定，字段集合见 ADR-0116 §2.2；解析期严格校验。 */
export interface BaseScreenMaterialTemplateNode {
  readonly kind: string;
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface BaseScreenMaterialTemplateGradient {
  readonly kind: 'linearGradient' | 'radialGradient';
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface BaseScreenMaterialTemplateAnimation {
  readonly kind: 'loop' | 'change';
  readonly target: string;
  readonly [key: string]: unknown;
}

export interface BaseScreenMaterialTemplate {
  readonly viewBox: readonly [number, number, number, number];
  readonly fit?: BaseScreenMaterialTemplateFit;
  readonly defs?: readonly BaseScreenMaterialTemplateGradient[];
  readonly nodes: readonly BaseScreenMaterialTemplateNode[];
  readonly animations?: readonly BaseScreenMaterialTemplateAnimation[];
}

/** 规格里声明的一个事件（ADR-0116 §2.6）：`payload` 每项写类型与取值表达式。 */
export interface BaseScreenMaterialSpecEvent {
  readonly name: string;
  readonly label: string;
  readonly payload?: Readonly<
    Record<string, { readonly type: 'number' | 'string' | 'boolean'; readonly value: string }>
  >;
}

export const BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS = {
  nodes: 300,
  repeat: 200,
  animations: 8,
  events: 4,
  gradients: 8,
  pathCommands: 64,
  dash: 6,
  minDuration: 100,
  maxDuration: 20_000,
} as const;

/** 节点种类（ADR-0116 §2.2）：结构、基础、参数化高层图元。 */
export const BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS = [
  'g',
  'repeat',
  'when',
  'clip',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'path',
  'text',
  'arc',
  'ticks',
  'wave',
] as const;

export type BaseScreenMaterialTemplateNodeKind =
  (typeof BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS)[number];

/** 各种类的数值参数；`change` 动画只能补间这里列出的参数。 */
export const BASE_SCREEN_MATERIAL_TEMPLATE_NUMBER_ATTRS: Readonly<
  Record<BaseScreenMaterialTemplateNodeKind, readonly string[]>
> = {
  g: ['x', 'y', 'scale', 'rotate'],
  repeat: [],
  when: [],
  clip: [],
  rect: ['x', 'y', 'width', 'height', 'rx'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: [],
  path: [],
  text: ['x', 'y', 'fontSize'],
  arc: ['cx', 'cy', 'r', 'thickness', 'start', 'end'],
  ticks: ['cx', 'cy', 'r', 'length', 'count', 'start', 'end'],
  wave: ['x', 'y', 'width', 'height', 'amplitude', 'wavelength', 'phase'],
};

const REQUIRED_NUMBER_ATTRS: Readonly<Partial<Record<BaseScreenMaterialTemplateNodeKind, readonly string[]>>> = {
  rect: ['x', 'y', 'width', 'height'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  text: ['x', 'y', 'fontSize'],
  arc: ['cx', 'cy', 'r', 'thickness', 'start', 'end'],
  ticks: ['cx', 'cy', 'r', 'length', 'count', 'start', 'end'],
  wave: ['x', 'y', 'width', 'height', 'amplitude', 'wavelength'],
};

const SHAPE_KINDS: ReadonlySet<string> = new Set([
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'path',
  'text',
  'arc',
  'ticks',
  'wave',
]);
const CLIP_SHAPE_KINDS: ReadonlySet<string> = new Set(['rect', 'circle', 'ellipse', 'path']);
const CONTAINER_KINDS: ReadonlySet<string> = new Set(['g', 'repeat', 'when', 'clip']);
const FILLABLE_KINDS: ReadonlySet<string> = new Set(['rect', 'circle', 'ellipse', 'path', 'wave', 'polyline']);

const EXTRA_KEYS: Readonly<Record<BaseScreenMaterialTemplateNodeKind, readonly string[]>> = {
  g: ['children', 'opacity'],
  repeat: ['source', 'children'],
  when: ['test', 'children'],
  clip: ['shape', 'children'],
  rect: [],
  circle: [],
  ellipse: [],
  line: [],
  polyline: ['points', 'closed'],
  path: ['d'],
  text: ['content', 'fontWeight', 'anchor', 'baseline', 'backdrop'],
  arc: ['linecap'],
  ticks: [],
  wave: [],
};
const SHAPE_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeDasharray', 'strokeLinecap', 'opacity', 'on'];

const ID_PATTERN = /^[a-z][A-Za-z0-9-]{0,39}$/;
const EVENT_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;
const PAYLOAD_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;
/** 字面量颜色：#rgb / #rrggbb / #rrggbbaa、rgb() / rgba() / hsl() / hsla()（括号里不能再有括号）、几个关键字。 */
export const BASE_SCREEN_MATERIAL_TEMPLATE_COLOR =
  /^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/deg]*\)|transparent|none|currentColor)$/;
const PATH_COMMANDS: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };
const LOOP_PROPERTIES = new Set(['translateX', 'translateY', 'rotate', 'scale', 'opacity']);
const EASINGS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);
const ANCHORS = new Set(['start', 'middle', 'end']);
const BASELINES = new Set(['auto', 'middle', 'hanging']);
const LINECAPS = new Set(['butt', 'round', 'square']);
const FONT_WEIGHTS = new Set([400, 500, 600, 700]);

// ---------------------------------------------------------------------------
// 编译产物（解释器用；不进 Manifest，也不持久化）
// ---------------------------------------------------------------------------

export type BaseScreenMaterialTemplatePaint =
  | { readonly k: 'color'; readonly v: string }
  | { readonly k: 'gradient'; readonly id: string }
  | { readonly k: 'expr'; readonly e: BaseScreenMaterialTemplateExpression };

export type BaseScreenMaterialTemplateRepeatSource =
  | { readonly k: 'rows' }
  | { readonly k: 'range'; readonly n: BaseScreenMaterialTemplateExpression };

export interface CompiledTemplateEvent {
  readonly name: string;
  readonly payload: readonly {
    readonly key: string;
    readonly type: 'number' | 'string' | 'boolean';
    readonly value: BaseScreenMaterialTemplateExpression;
  }[];
}

export interface CompiledTemplateNode {
  readonly kind: BaseScreenMaterialTemplateNodeKind;
  readonly id: string;
  /** 模板里的路径（诊断与体检定位用）。 */
  readonly path: readonly (string | number)[];
  readonly num: Readonly<Record<string, BaseScreenMaterialTemplateExpression>>;
  readonly fill?: BaseScreenMaterialTemplatePaint;
  readonly stroke?: BaseScreenMaterialTemplatePaint;
  readonly dash?: readonly BaseScreenMaterialTemplateExpression[];
  readonly linecap?: string;
  readonly anchor?: string;
  readonly baseline?: string;
  readonly fontWeight?: number;
  readonly content?: BaseScreenMaterialTemplateExpression;
  readonly backdrop?: string;
  readonly test?: BaseScreenMaterialTemplateExpression;
  readonly source?: BaseScreenMaterialTemplateRepeatSource;
  readonly points?: {
    readonly source: BaseScreenMaterialTemplateRepeatSource;
    readonly x: BaseScreenMaterialTemplateExpression;
    readonly y: BaseScreenMaterialTemplateExpression;
  };
  readonly closed?: boolean;
  readonly d?: readonly (readonly [string, readonly BaseScreenMaterialTemplateExpression[]])[];
  readonly clipShape?: CompiledTemplateNode;
  readonly children?: readonly CompiledTemplateNode[];
  readonly on?: CompiledTemplateEvent;
}

export interface CompiledTemplateGradient {
  readonly kind: 'linearGradient' | 'radialGradient';
  readonly id: string;
  readonly geometry: Readonly<Record<string, number>>;
  readonly stops: readonly {
    readonly offset: number;
    readonly color: BaseScreenMaterialTemplatePaint;
    readonly opacity: number;
  }[];
}

export type CompiledTemplateAnimation =
  | {
      readonly kind: 'loop';
      readonly target: string;
      readonly property: string;
      readonly from: BaseScreenMaterialTemplateExpression;
      readonly to: BaseScreenMaterialTemplateExpression;
      readonly duration: number;
      readonly easing: string;
      readonly alternate: boolean;
      readonly enabledBy?: BaseScreenMaterialTemplateExpression;
    }
  | {
      readonly kind: 'change';
      readonly target: string;
      readonly attributes: readonly string[];
      readonly duration: number;
      readonly easing: string;
    };

export interface CompiledBaseScreenMaterialTemplate {
  readonly viewBox: readonly [number, number, number, number];
  readonly fit: BaseScreenMaterialTemplateFit;
  readonly gradients: readonly CompiledTemplateGradient[];
  readonly nodes: readonly CompiledTemplateNode[];
  readonly animations: readonly CompiledTemplateAnimation[];
  /** 节点 id → 节点（含嵌套），体检与动画查找用。 */
  readonly index: ReadonlyMap<string, CompiledTemplateNode>;
}

/** 编译模板需要知道的规格信息（字段、角色、事件）。 */
export interface BaseScreenMaterialTemplateContext {
  readonly fields: readonly { readonly key: string; readonly section: string; readonly kind: string }[];
  readonly data:
    | { readonly kind: 'none' }
    | { readonly kind: 'scalar' }
    | { readonly kind: 'rows'; readonly roles: readonly { readonly id: string }[] };
  readonly events?: readonly BaseScreenMaterialSpecEvent[];
  /** 分区 → props / style。 */
  readonly sectionTarget: (section: string) => 'props' | 'style';
}

const RULE_MESSAGE = (rule: string, message: string): string => `${rule}：${message}`;

/**
 * 解析并编译模板。诊断路径相对规格根（`['template', 'nodes', 2, 'fill']`），消息以规则号开头
 * （`TPL1：…`），体检据此归到 TPL 规则。
 */
export function compileBaseScreenMaterialTemplate(
  input: unknown,
  context: BaseScreenMaterialTemplateContext,
): ScreenParseResult<CompiledBaseScreenMaterialTemplate> {
  const compiler = new TemplateCompiler(context);
  const compiled = compiler.compile(input);
  if (compiler.diagnostics.length > 0 || compiled === undefined) {
    return { ok: false, diagnostics: compiler.diagnostics };
  }
  return { ok: true, value: compiled, diagnostics: [] };
}

class TemplateCompiler {
  readonly diagnostics: ScreenDiagnostic[] = [];
  readonly #index = new Map<string, CompiledTemplateNode>();
  readonly #ids = new Set<string>();
  readonly #gradientIds = new Set<string>();
  readonly #props: Set<string>;
  readonly #style: Set<string>;
  readonly #roles: Set<string>;
  readonly #colorKeys: Set<string>;
  readonly #numberKeys: Set<string>;
  readonly #events: Map<string, BaseScreenMaterialSpecEvent>;
  #nodeCount = 0;

  constructor(private readonly context: BaseScreenMaterialTemplateContext) {
    this.#props = new Set();
    this.#style = new Set();
    this.#colorKeys = new Set();
    this.#numberKeys = new Set();
    for (const field of context.fields) {
      (context.sectionTarget(field.section) === 'props' ? this.#props : this.#style).add(field.key);
      if (field.kind === 'color') this.#colorKeys.add(field.key);
      if (field.kind === 'number') this.#numberKeys.add(field.key);
    }
    // 读数格式配置组的 props（decimals / prefix / unit / thousandsSeparator）由 format() 读，不必直接引用。
    this.#roles = new Set(context.data.kind === 'rows' ? context.data.roles.map((role) => role.id) : []);
    this.#events = new Map((context.events ?? []).map((event) => [event.name, event]));
  }

  #add(rule: string, path: readonly (string | number)[], message: string): void {
    this.diagnostics.push({
      severity: 'error',
      code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path: ['template', ...path],
      message: RULE_MESSAGE(rule, message),
    });
  }

  compile(input: unknown): CompiledBaseScreenMaterialTemplate | undefined {
    if (!isRecord(input)) {
      this.#add('TPL4', [], '模板必须是对象。');
      return undefined;
    }
    for (const key of Object.keys(input)) {
      if (!['viewBox', 'fit', 'defs', 'nodes', 'animations'].includes(key)) {
        this.#add('TPL1', [key], `模板没有字段 ${key}。`);
      }
    }
    const viewBox = input.viewBox;
    const validViewBox =
      Array.isArray(viewBox) &&
      viewBox.length === 4 &&
      viewBox.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
      (viewBox[2] as number) > 0 &&
      (viewBox[3] as number) > 0;
    if (!validViewBox) this.#add('TPL4', ['viewBox'], 'viewBox 必须是 [x, y, 宽, 高] 四个数字，宽高大于 0。');
    const fit = input.fit ?? 'contain';
    if (fit !== 'contain' && fit !== 'cover' && fit !== 'stretch') {
      this.#add('TPL4', ['fit'], 'fit 只能是 contain / cover / stretch。');
    }
    const gradients = this.#gradients(input.defs);
    const scope: BaseScreenMaterialTemplateScope = {
      props: this.#props,
      style: this.#style,
      roles: this.#roles,
      data: this.context.data.kind,
      inRepeat: false,
      inRowRepeat: false,
    };
    if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
      this.#add('TPL4', ['nodes'], 'nodes 必须是非空数组。');
      return undefined;
    }
    const nodes = this.#nodeList(input.nodes, ['nodes'], scope);
    this.#checkBackdrops();
    const animations = this.#animations(input.animations, scope);
    if (!validViewBox) return undefined;
    return {
      viewBox: viewBox as unknown as readonly [number, number, number, number],
      fit: fit as BaseScreenMaterialTemplateFit,
      gradients,
      nodes,
      animations,
      index: this.#index,
    };
  }

  #gradients(input: unknown): CompiledTemplateGradient[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) {
      this.#add('TPL4', ['defs'], 'defs 必须是数组。');
      return [];
    }
    if (input.length > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.gradients) {
      this.#add('TPL3', ['defs'], `渐变最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.gradients} 个。`);
    }
    const output: CompiledTemplateGradient[] = [];
    input.forEach((item, index) => {
      const path = ['defs', index];
      if (!isRecord(item) || (item.kind !== 'linearGradient' && item.kind !== 'radialGradient')) {
        this.#add('TPL1', path, 'defs 里只能是 linearGradient / radialGradient。');
        return;
      }
      const geometryKeys = item.kind === 'linearGradient' ? ['x1', 'y1', 'x2', 'y2'] : ['cx', 'cy', 'r'];
      for (const key of Object.keys(item)) {
        if (!['kind', 'id', 'stops', ...geometryKeys].includes(key)) {
          this.#add('TPL1', [...path, key], `${item.kind} 没有字段 ${key}。`);
        }
      }
      const id = item.id;
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        this.#add('TPL4', [...path, 'id'], 'id 为小写字母开头的字母、数字、连字符（≤ 40）。');
        return;
      }
      if (this.#gradientIds.has(id)) this.#add('TPL4', [...path, 'id'], `渐变 id ${id} 重复。`);
      this.#gradientIds.add(id);
      const defaults: Record<string, number> =
        item.kind === 'linearGradient' ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { cx: 0.5, cy: 0.5, r: 0.5 };
      const geometry: Record<string, number> = {};
      for (const key of geometryKeys) {
        const value = item[key] ?? defaults[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 2) {
          this.#add('TPL4', [...path, key], `${key} 是 -1 到 2 之间的数字（相对图形包围盒的比例）。`);
        } else {
          geometry[key] = value;
        }
      }
      const stops: CompiledTemplateGradient['stops'][number][] = [];
      if (!Array.isArray(item.stops) || item.stops.length < 2 || item.stops.length > 8) {
        this.#add('TPL4', [...path, 'stops'], 'stops 是 2–8 个色标。');
      } else {
        item.stops.forEach((stop, at) => {
          const stopPath = [...path, 'stops', at];
          if (!isRecord(stop)) {
            this.#add('TPL4', stopPath, '色标必须是对象。');
            return;
          }
          for (const key of Object.keys(stop)) {
            if (!['offset', 'color', 'opacity'].includes(key)) {
              this.#add('TPL1', [...stopPath, key], `色标没有字段 ${key}。`);
            }
          }
          const offset = stop.offset;
          if (typeof offset !== 'number' || offset < 0 || offset > 1) {
            this.#add('TPL4', [...stopPath, 'offset'], 'offset 是 0–1 的数字。');
          }
          const opacity = stop.opacity ?? 1;
          if (typeof opacity !== 'number' || opacity < 0 || opacity > 1) {
            this.#add('TPL4', [...stopPath, 'opacity'], 'opacity 是 0–1 的数字。');
          }
          const color = this.#paint(stop.color, [...stopPath, 'color'], this.#rootScope(), false);
          if (color !== undefined && typeof offset === 'number' && typeof opacity === 'number') {
            stops.push({ offset, color, opacity });
          }
        });
      }
      output.push({ kind: item.kind, id, geometry, stops });
    });
    return output;
  }

  #rootScope(): BaseScreenMaterialTemplateScope {
    return {
      props: this.#props,
      style: this.#style,
      roles: this.#roles,
      data: this.context.data.kind,
      inRepeat: false,
      inRowRepeat: false,
    };
  }

  #nodeList(
    input: readonly unknown[],
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
  ): CompiledTemplateNode[] {
    const output: CompiledTemplateNode[] = [];
    input.forEach((item, index) => {
      const node = this.#node(item, [...path, index], scope);
      if (node !== undefined) output.push(node);
    });
    return output;
  }

  #node(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
  ): CompiledTemplateNode | undefined {
    this.#nodeCount += 1;
    if (this.#nodeCount === BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.nodes + 1) {
      this.#add('TPL3', path, `模板节点最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.nodes} 个。`);
    }
    if (!isRecord(input)) {
      this.#add('TPL4', path, '节点必须是对象。');
      return undefined;
    }
    const kind = input.kind;
    if (typeof kind !== 'string' || !(BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS as readonly string[]).includes(kind)) {
      this.#add(
        'TPL1',
        [...path, 'kind'],
        `不支持的节点 ${String(kind)}（可用：${BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS.join('、')}；不支持 foreignObject、image、use、script、style、filter）。`,
      );
      return undefined;
    }
    const nodeKind = kind as BaseScreenMaterialTemplateNodeKind;
    const id = input.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      this.#add('TPL4', [...path, 'id'], '每个节点都要有 id：小写字母开头的字母、数字、连字符（≤ 40）。');
      return undefined;
    }
    if (this.#ids.has(id)) this.#add('TPL4', [...path, 'id'], `节点 id ${id} 重复。`);
    this.#ids.add(id);
    const allowed = new Set([
      'kind',
      'id',
      ...BASE_SCREEN_MATERIAL_TEMPLATE_NUMBER_ATTRS[nodeKind],
      ...EXTRA_KEYS[nodeKind],
      ...(SHAPE_KINDS.has(nodeKind) ? SHAPE_KEYS : []),
    ]);
    for (const key of Object.keys(input)) {
      if (!allowed.has(key)) {
        const hint = /^on[A-Z]|^href$|^xlink|^style$|^class$|^filter$/.test(key)
          ? '（不支持事件属性、外部引用、样式字符串与滤镜）'
          : '';
        this.#add('TPL1', [...path, key], `${nodeKind} 没有字段 ${key}${hint}。`);
      }
    }
    const num: Record<string, BaseScreenMaterialTemplateExpression> = {};
    for (const key of BASE_SCREEN_MATERIAL_TEMPLATE_NUMBER_ATTRS[nodeKind]) {
      if (input[key] === undefined) continue;
      const expression = this.#number(input[key], [...path, key], scope);
      if (expression !== undefined) num[key] = expression;
    }
    for (const key of REQUIRED_NUMBER_ATTRS[nodeKind] ?? []) {
      if (input[key] === undefined) this.#add('TPL4', [...path, key], `${nodeKind} 缺少 ${key}。`);
    }
    const node: Record<string, unknown> = { kind: nodeKind, id, path, num };
    if (SHAPE_KINDS.has(nodeKind)) this.#shapeAttributes(input, nodeKind, path, scope, node, num);
    if (nodeKind === 'g' && input.opacity !== undefined) {
      const opacity = this.#number(input.opacity, [...path, 'opacity'], scope);
      if (opacity !== undefined) num.opacity = opacity;
    }
    switch (nodeKind) {
      case 'text':
        this.#text(input, path, scope, node, num);
        break;
      case 'repeat': {
        const source = this.#source(input.source, [...path, 'source'], scope);
        if (source !== undefined) node.source = source;
        break;
      }
      case 'when': {
        const test = this.#expression(input.test, [...path, 'test'], scope);
        if (test !== undefined) node.test = test;
        break;
      }
      case 'clip': {
        const shape = input.shape;
        if (!isRecord(shape) || typeof shape.kind !== 'string' || !CLIP_SHAPE_KINDS.has(shape.kind)) {
          this.#add('TPL4', [...path, 'shape'], 'clip.shape 必须是一个 rect / circle / ellipse / path 节点。');
        } else {
          const compiled = this.#node(shape, [...path, 'shape'], scope);
          if (compiled !== undefined) node.clipShape = compiled;
        }
        break;
      }
      case 'polyline':
        this.#polyline(input, path, scope, node);
        break;
      case 'path':
        this.#path(input.d, [...path, 'd'], scope, node);
        break;
      case 'arc':
        if (input.linecap !== undefined) {
          if (typeof input.linecap !== 'string' || !LINECAPS.has(input.linecap)) {
            this.#add('TPL4', [...path, 'linecap'], 'linecap 只能是 butt / round / square。');
          } else node.linecap = input.linecap;
        }
        break;
      default:
        break;
    }
    if (CONTAINER_KINDS.has(nodeKind)) {
      const childScope: BaseScreenMaterialTemplateScope =
        nodeKind === 'repeat'
          ? {
              ...scope,
              inRepeat: true,
              inRowRepeat: scope.inRowRepeat || (node.source as { k?: string } | undefined)?.k === 'rows',
            }
          : scope;
      if (!Array.isArray(input.children)) {
        this.#add('TPL4', [...path, 'children'], `${nodeKind} 需要 children 数组。`);
      } else {
        node.children = this.#nodeList(input.children, [...path, 'children'], childScope);
      }
    }
    const compiled = node as unknown as CompiledTemplateNode;
    this.#index.set(id, compiled);
    return compiled;
  }

  #shapeAttributes(
    input: Record<string, unknown>,
    kind: BaseScreenMaterialTemplateNodeKind,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    node: Record<string, unknown>,
    num: Record<string, BaseScreenMaterialTemplateExpression>,
  ): void {
    if (input.fill !== undefined) {
      const fill = this.#paint(input.fill, [...path, 'fill'], scope, true);
      if (fill !== undefined) node.fill = fill;
    }
    if (input.stroke !== undefined) {
      const stroke = this.#paint(input.stroke, [...path, 'stroke'], scope, true);
      if (stroke !== undefined) node.stroke = stroke;
    }
    for (const key of ['strokeWidth', 'opacity'] as const) {
      if (input[key] === undefined) continue;
      const value = this.#number(input[key], [...path, key], scope);
      if (value !== undefined) num[key] = value;
    }
    if (input.strokeDasharray !== undefined) {
      const dash = input.strokeDasharray;
      if (!Array.isArray(dash) || dash.length === 0 || dash.length > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.dash) {
        this.#add('TPL4', [...path, 'strokeDasharray'], `strokeDasharray 是 1–${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.dash} 个数字。`);
      } else {
        const items = dash
          .map((item, at) => this.#number(item, [...path, 'strokeDasharray', at], scope))
          .filter((item): item is BaseScreenMaterialTemplateExpression => item !== undefined);
        node.dash = items;
      }
    }
    if (input.strokeLinecap !== undefined) {
      if (typeof input.strokeLinecap !== 'string' || !LINECAPS.has(input.strokeLinecap)) {
        this.#add('TPL4', [...path, 'strokeLinecap'], 'strokeLinecap 只能是 butt / round / square。');
      } else node.linecap = input.strokeLinecap;
    }
    if (input.on !== undefined) {
      const name = input.on;
      const event = typeof name === 'string' ? this.#events.get(name) : undefined;
      if (event === undefined) {
        this.#add('TPL2', [...path, 'on'], `on 必须是规格 events 里声明的事件名（当前：${[...this.#events.keys()].join('、') || '无'}）。`);
      } else {
        const payload: { key: string; type: 'number' | 'string' | 'boolean'; value: BaseScreenMaterialTemplateExpression }[] = [];
        for (const [key, item] of Object.entries(event.payload ?? {})) {
          const expression = this.#expression(item.value, [...path, 'on', key], scope);
          if (expression !== undefined) payload.push({ key, type: item.type, value: expression });
        }
        node.on = { name: event.name, payload };
      }
    }
    void kind;
  }

  #text(
    input: Record<string, unknown>,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    node: Record<string, unknown>,
    num: Record<string, BaseScreenMaterialTemplateExpression>,
  ): void {
    const content = this.#expression(input.content, [...path, 'content'], scope, '文字内容是表达式：字面文字要加引号，如 "\'℃\'"；读数用 format(value)。');
    if (content !== undefined) node.content = content;
    const fontSize = num.fontSize;
    if (fontSize !== undefined && !this.#isStaticNumber(fontSize)) {
      this.#add('TPL5', [...path, 'fontSize'], '字号只能是数字，或 props / style 数字字段的四则运算（不能随数据变化），体检才能检查最小字号。');
    }
    if (input.fontWeight !== undefined) {
      if (typeof input.fontWeight !== 'number' || !FONT_WEIGHTS.has(input.fontWeight)) {
        this.#add('TPL4', [...path, 'fontWeight'], 'fontWeight 只能是 400 / 500 / 600 / 700。');
      } else node.fontWeight = input.fontWeight;
    }
    for (const [key, values] of [
      ['anchor', ANCHORS],
      ['baseline', BASELINES],
    ] as const) {
      const value = input[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !values.has(value)) {
        this.#add('TPL4', [...path, key], `${key} 只能是 ${[...values].join(' / ')}。`);
      } else node[key] = value;
    }
    const backdrop = input.backdrop;
    if (typeof backdrop !== 'string' || backdrop === '') {
      this.#add('TPL6', [...path, 'backdrop'], '文字必须声明底板 backdrop：某个填充节点的 id，或 container（组件背景）。');
    } else node.backdrop = backdrop;
  }

  #checkBackdrops(): void {
    for (const node of this.#index.values()) {
      if (node.kind !== 'text' || node.backdrop === undefined || node.backdrop === 'container') continue;
      const target = this.#index.get(node.backdrop);
      if (target === undefined || !FILLABLE_KINDS.has(target.kind) || target.fill === undefined) {
        this.#add('TPL6', [...node.path, 'backdrop'], `backdrop「${node.backdrop}」必须是带 fill 的填充节点，或 container。`);
      }
    }
  }

  #polyline(
    input: Record<string, unknown>,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    node: Record<string, unknown>,
  ): void {
    const points = input.points;
    if (!isRecord(points)) {
      this.#add('TPL4', [...path, 'points'], 'polyline.points 是 { source, x, y }：对每行（或每个序号）求一个点。');
      return;
    }
    for (const key of Object.keys(points)) {
      if (!['source', 'x', 'y'].includes(key)) this.#add('TPL1', [...path, 'points', key], `points 没有字段 ${key}。`);
    }
    const source = this.#source(points.source, [...path, 'points', 'source'], scope);
    if (source === undefined) return;
    const inner: BaseScreenMaterialTemplateScope = {
      ...scope,
      inRepeat: true,
      inRowRepeat: scope.inRowRepeat || source.k === 'rows',
    };
    const x = this.#number(points.x, [...path, 'points', 'x'], inner);
    const y = this.#number(points.y, [...path, 'points', 'y'], inner);
    if (x !== undefined && y !== undefined) node.points = { source, x, y };
    if (input.closed !== undefined) {
      if (typeof input.closed !== 'boolean') this.#add('TPL4', [...path, 'closed'], 'closed 必须是布尔值。');
      else node.closed = input.closed;
    }
  }

  #path(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    node: Record<string, unknown>,
  ): void {
    if (!Array.isArray(input) || input.length === 0 || input.length > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.pathCommands) {
      this.#add('TPL4', path, `path.d 是 1–${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.pathCommands} 条命令，每条形如 ["L", x, y]。`);
      return;
    }
    const commands: [string, BaseScreenMaterialTemplateExpression[]][] = [];
    input.forEach((item, index) => {
      const itemPath = [...path, index];
      if (!Array.isArray(item) || typeof item[0] !== 'string' || PATH_COMMANDS[item[0]] === undefined) {
        this.#add('TPL4', itemPath, '路径命令只能是 M / L / H / V / C / Q / A / Z（绝对坐标）。');
        return;
      }
      const command = item[0];
      const arity = PATH_COMMANDS[command] as number;
      if (item.length - 1 !== arity) {
        this.#add('TPL4', itemPath, `${command} 需要 ${arity} 个参数。`);
        return;
      }
      const args = item
        .slice(1)
        .map((arg, at) => this.#number(arg, [...itemPath, at + 1], scope))
        .filter((arg): arg is BaseScreenMaterialTemplateExpression => arg !== undefined);
      if (args.length === arity) commands.push([command, args]);
    });
    node.d = commands;
  }

  #source(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
  ): BaseScreenMaterialTemplateRepeatSource | undefined {
    if (input === 'rows') {
      if (this.context.data.kind !== 'rows') {
        this.#add('TPL2', path, '组件不是多行数据，不能遍历 rows。');
        return undefined;
      }
      return { k: 'rows' };
    }
    if (isRecord(input) && Object.keys(input).length === 1 && input.range !== undefined) {
      if (typeof input.range === 'number' && input.range > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat) {
        this.#add('TPL3', [...path, 'range'], `repeat 最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat} 次。`);
        return undefined;
      }
      const n = this.#number(input.range, [...path, 'range'], scope);
      return n === undefined ? undefined : { k: 'range', n };
    }
    this.#add('TPL4', path, 'source 只能是 "rows" 或 { "range": 次数 }。');
    return undefined;
  }

  #animations(input: unknown, scope: BaseScreenMaterialTemplateScope): CompiledTemplateAnimation[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) {
      this.#add('TPL4', ['animations'], 'animations 必须是数组。');
      return [];
    }
    if (input.length > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.animations) {
      this.#add('TPL3', ['animations'], `动画最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.animations} 个。`);
    }
    const output: CompiledTemplateAnimation[] = [];
    input.forEach((item, index) => {
      const path = ['animations', index];
      if (!isRecord(item) || (item.kind !== 'loop' && item.kind !== 'change')) {
        this.#add('TPL1', path, '动画只有 loop（循环）与 change（读数变化过渡）两种。');
        return;
      }
      const keys =
        item.kind === 'loop'
          ? ['kind', 'target', 'property', 'from', 'to', 'duration', 'easing', 'alternate', 'enabledBy']
          : ['kind', 'target', 'attributes', 'duration', 'easing'];
      for (const key of Object.keys(item)) {
        if (!keys.includes(key)) this.#add('TPL1', [...path, key], `${item.kind} 动画没有字段 ${key}。`);
      }
      const target = typeof item.target === 'string' ? this.#index.get(item.target) : undefined;
      if (target === undefined) {
        this.#add('TPL4', [...path, 'target'], 'target 必须是模板里某个节点的 id。');
        return;
      }
      const duration = item.duration;
      if (
        typeof duration !== 'number' ||
        duration < BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.minDuration ||
        duration > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.maxDuration
      ) {
        this.#add('TPL4', [...path, 'duration'], `duration 是 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.minDuration}–${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.maxDuration} 毫秒。`);
        return;
      }
      const easing = item.easing ?? (item.kind === 'loop' ? 'linear' : 'ease-out');
      if (typeof easing !== 'string' || !EASINGS.has(easing)) {
        this.#add('TPL4', [...path, 'easing'], `easing 只能是 ${[...EASINGS].join(' / ')}。`);
        return;
      }
      if (item.kind === 'loop') {
        if (typeof item.property !== 'string' || !LOOP_PROPERTIES.has(item.property)) {
          this.#add('TPL4', [...path, 'property'], `循环动画只能改 ${[...LOOP_PROPERTIES].join(' / ')}（只动组件内部，不动外框）。`);
          return;
        }
        const from = this.#number(item.from, [...path, 'from'], scope);
        const to = this.#number(item.to, [...path, 'to'], scope);
        if (item.alternate !== undefined && typeof item.alternate !== 'boolean') {
          this.#add('TPL4', [...path, 'alternate'], 'alternate 必须是布尔值。');
        }
        const enabledBy =
          item.enabledBy === undefined ? undefined : this.#expression(item.enabledBy, [...path, 'enabledBy'], scope);
        if (from === undefined || to === undefined) return;
        output.push({
          kind: 'loop',
          target: target.id,
          property: item.property,
          from,
          to,
          duration,
          easing,
          alternate: item.alternate === true,
          ...(enabledBy === undefined ? {} : { enabledBy }),
        });
        return;
      }
      const numeric = BASE_SCREEN_MATERIAL_TEMPLATE_NUMBER_ATTRS[target.kind];
      if (
        !Array.isArray(item.attributes) ||
        item.attributes.length === 0 ||
        item.attributes.some((attr) => typeof attr !== 'string' || !numeric.includes(attr))
      ) {
        this.#add('TPL4', [...path, 'attributes'], `${target.kind} 能补间的参数：${numeric.join('、') || '无'}。`);
        return;
      }
      output.push({
        kind: 'change',
        target: target.id,
        attributes: item.attributes as string[],
        duration,
        easing,
      });
    });
    return output;
  }

  #expression(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    hint?: string,
  ): BaseScreenMaterialTemplateExpression | undefined {
    if (typeof input === 'boolean') return { k: 'lit', v: input };
    if (typeof input === 'number' && Number.isFinite(input)) return { k: 'lit', v: input };
    if (typeof input !== 'string') {
      this.#add('TPL4', path, `需要一个表达式字符串${hint === undefined ? '' : `：${hint}`}`);
      return undefined;
    }
    const parsed = parseBaseScreenMaterialTemplateExpression(input, scope);
    if (!parsed.ok) {
      this.#add('TPL2', path, `${parsed.message}${hint === undefined ? '' : ` ${hint}`}`);
      return undefined;
    }
    return parsed.value;
  }

  #number(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
  ): BaseScreenMaterialTemplateExpression | undefined {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        this.#add('TPL4', path, '数值必须是有限数字。');
        return undefined;
      }
      return { k: 'lit', v: input };
    }
    if (typeof input === 'string') return this.#expression(input, path, scope);
    this.#add('TPL4', path, '数值参数写数字或表达式字符串。');
    return undefined;
  }

  #paint(
    input: unknown,
    path: readonly (string | number)[],
    scope: BaseScreenMaterialTemplateScope,
    allowGradient: boolean,
  ): BaseScreenMaterialTemplatePaint | undefined {
    if (isRecord(input) && Object.keys(input).length === 1 && typeof input.gradient === 'string') {
      if (!allowGradient || !this.#gradientIds.has(input.gradient)) {
        this.#add('TPL4', path, `渐变「${input.gradient}」没有在 defs 里声明。`);
        return undefined;
      }
      return { k: 'gradient', id: input.gradient };
    }
    if (typeof input !== 'string') {
      this.#add('TPL5', path, '颜色写字面量（#rrggbb、rgba(...)、none）、style.<颜色字段>，或 { "gradient": "渐变 id" }。');
      return undefined;
    }
    if (BASE_SCREEN_MATERIAL_TEMPLATE_COLOR.test(input.trim())) return { k: 'color', v: input.trim() };
    if (/url\s*\(/i.test(input)) {
      this.#add('TPL1', path, '颜色里不能写 url(...)：渐变用 { "gradient": "id" } 引用。');
      return undefined;
    }
    const expression = this.#expression(input, path, scope);
    if (expression === undefined) return undefined;
    if (!this.#isAuditablePaint(expression)) {
      this.#add(
        'TPL5',
        path,
        '颜色表达式只能在字面量颜色与 style.<颜色字段> 之间选择（pick / 三元），不能由数据算出颜色；语义色请声明成样式字段，值可写 theme:danger。',
      );
      return undefined;
    }
    return { k: 'expr', e: expression };
  }

  /** 颜色表达式能否静态枚举出全部候选（字面量颜色或颜色样式字段）。 */
  #isAuditablePaint(expression: BaseScreenMaterialTemplateExpression): boolean {
    switch (expression.k) {
      case 'lit':
        return typeof expression.v === 'string' && BASE_SCREEN_MATERIAL_TEMPLATE_COLOR.test(expression.v);
      case 'ref':
        return expression.root === 'style' && expression.key !== undefined && this.#colorKeys.has(expression.key);
      case 'cond':
        return this.#isAuditablePaint(expression.a) && this.#isAuditablePaint(expression.b);
      case 'call':
        if (expression.fn !== 'pick') return false;
        return expression.args.every(
          (arg, index) => index === 0 || (index % 2 === 1 && index !== expression.args.length - 1) || this.#isAuditablePaint(arg),
        );
      default:
        return false;
    }
  }

  /** 字号：字面量或 props / style 数字字段的运算，不随数据变化。 */
  #isStaticNumber(expression: BaseScreenMaterialTemplateExpression): boolean {
    switch (expression.k) {
      case 'lit':
        return typeof expression.v === 'number';
      case 'ref':
        return (
          (expression.root === 'props' || expression.root === 'style') &&
          expression.key !== undefined &&
          this.#numberKeys.has(expression.key)
        );
      case 'un':
        return expression.op === '-' && this.#isStaticNumber(expression.a);
      case 'bin':
        return ['+', '-', '*', '/'].includes(expression.op) && this.#isStaticNumber(expression.a) && this.#isStaticNumber(expression.b);
      case 'call':
        return ['min', 'max', 'clamp', 'round'].includes(expression.fn) && expression.args.every((arg) => this.#isStaticNumber(arg));
      default:
        return false;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 规格事件的形状校验（ADR-0116 §2.6），路径相对规格根。 */
export function parseBaseScreenMaterialSpecEvents(
  input: unknown,
  add: (path: readonly (string | number)[], message: string) => void,
): void {
  if (input === undefined) return;
  if (!Array.isArray(input) || input.length > BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.events) {
    add(['events'], `events 是最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.events} 个事件的数组。`);
    return;
  }
  const names = new Set<string>();
  input.forEach((event, index) => {
    const path = ['events', index];
    if (!isRecord(event)) {
      add(path, '事件必须是对象。');
      return;
    }
    for (const key of Object.keys(event)) {
      if (!['name', 'label', 'payload'].includes(key)) add([...path, key], `未知字段 ${key}。`);
    }
    if (typeof event.name !== 'string' || !EVENT_PATTERN.test(event.name)) {
      add([...path, 'name'], '事件名为小驼峰 ASCII（如 valueClick）。');
    } else if (names.has(event.name)) {
      add([...path, 'name'], `事件 ${event.name} 重复。`);
    } else names.add(event.name);
    if (typeof event.label !== 'string' || event.label.trim() === '' || [...event.label].length > 16) {
      add([...path, 'label'], '事件标签为 1–16 个字符。');
    }
    if (event.payload !== undefined) {
      if (!isRecord(event.payload) || Object.keys(event.payload).length > 6) {
        add([...path, 'payload'], 'payload 是最多 6 项的对象：{ 键: { type, value } }。');
        return;
      }
      for (const [key, item] of Object.entries(event.payload)) {
        if (!PAYLOAD_KEY_PATTERN.test(key)) add([...path, 'payload', key], '负载键为小驼峰 ASCII。');
        if (
          !isRecord(item) ||
          (item.type !== 'number' && item.type !== 'string' && item.type !== 'boolean') ||
          typeof item.value !== 'string' ||
          Object.keys(item).some((name) => name !== 'type' && name !== 'value')
        ) {
          add([...path, 'payload', key], '负载项写 { "type": "number" | "string" | "boolean", "value": "表达式" }。');
        }
      }
    }
  });
}

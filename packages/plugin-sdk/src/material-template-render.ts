import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';
import { BASE_SCREEN_MATERIAL_EVENT } from '@base-screen/plugin-core';
import {
  BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET,
  type BaseScreenMaterialTemplateEnv,
  type BaseScreenMaterialTemplateExpression,
  type BaseScreenMaterialTemplateScalar,
  evaluateBaseScreenMaterialTemplateExpression,
  isTemplateTruthy,
  toTemplateNumber,
} from './material-template-expression.js';
import {
  BASE_SCREEN_MATERIAL_TEMPLATE_COLOR,
  BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS,
  type BaseScreenMaterialTemplatePaint,
  type CompiledBaseScreenMaterialTemplate,
  type CompiledTemplateNode,
} from './material-template.js';

/**
 * L2 模板解释器（base-screen-docs ADR-0116 §2.2 / §2.5）。
 *
 * - 只用 `createElementNS` 构造白名单内的元素与属性；文字走 `textContent`；不生成、也不解析字符串；
 * - 渐变与裁剪的 id 按实例加命名空间（同一页多个实例、同一 Shadow root 里也不串）；
 * - 颜色表达式的结果再按字面量颜色正则校验一次：数据或样式里混进 `url(...)` 时直接丢弃该属性；
 * - 动画只动组件内部：循环（平移 / 旋转 / 缩放 / 透明度）用 WAAPI 作用在一个包裹层上；读数变化过渡
 *   补间节点参数（不是 DOM 属性），每帧按插值后的参数重建该节点的几何；
 * - 设计态（`interactive === false`）与 `prefers-reduced-motion` 下一律不播放、不派发事件。
 */

export interface BaseScreenMaterialTemplateRenderInput {
  readonly document: Document;
  readonly root: HTMLElement;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly size: { readonly width: number; readonly height: number };
  readonly interactive: boolean;
  readonly value: number | string | null;
  readonly rows: readonly Readonly<Record<string, ScreenJsonValue>>[];
  formatNumber(value: unknown): string;
}

export type BaseScreenMaterialTemplateRenderer = (input: BaseScreenMaterialTemplateRenderInput) => void;

const SVG = 'http://www.w3.org/2000/svg';
let instanceCounter = 0;

/** 为一个物料实例创建渲染函数：实例持有上一帧参数，用于读数变化过渡。 */
export function createBaseScreenMaterialTemplateRenderer(
  template: CompiledBaseScreenMaterialTemplate,
): BaseScreenMaterialTemplateRenderer {
  instanceCounter += 1;
  const namespace = `tpl${instanceCounter.toString(36)}`;
  const previous = new Map<string, Record<string, number>>();
  // 进行中的过渡：同一读数连续重绘（数据到达后渲染器可能写两次 model）时接着播，不从头也不跳到终点。
  const active = new Map<
    string,
    {
      readonly from: Record<string, number>;
      readonly to: Record<string, number>;
      readonly start: number;
      readonly duration: number;
    }
  >();
  const loopTargets = new Map(
    template.animations
      .filter((item) => item.kind === 'loop')
      .map((item) => [item.target, true] as const),
  );
  const changeByTarget = new Map(
    template.animations.flatMap((item) => (item.kind === 'change' ? [[item.target, item] as const] : [])),
  );

  return (input) => {
    const env: BaseScreenMaterialTemplateEnv = {
      value: input.value,
      rows: input.rows,
      props: input.props,
      style: input.style,
      size: input.size,
      formatNumber: input.formatNumber,
      budget: { steps: BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET },
    };
    const doc = input.document;
    const [vx, vy, vw, vh] = template.viewBox;
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    svg.setAttribute(
      'preserveAspectRatio',
      template.fit === 'cover' ? 'xMidYMid slice' : template.fit === 'stretch' ? 'none' : 'xMidYMid meet',
    );
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';
    svg.style.overflow = 'hidden';
    // 文字字号按屏幕像素写：换算成 viewBox 单位（stretch 时按纵向，横向会被拉伸）。
    const width = Math.max(1, input.size.width);
    const height = Math.max(1, input.size.height);
    const unitsPerPx =
      template.fit === 'cover'
        ? Math.min(vw / width, vh / height)
        : template.fit === 'stretch'
          ? vh / height
          : Math.max(vw / width, vh / height);
    const motion =
      input.interactive &&
      !(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    const defs = doc.createElementNS(SVG, 'defs');
    svg.appendChild(defs);
    for (const gradient of template.gradients) {
      const element = doc.createElementNS(SVG, gradient.kind);
      element.setAttribute('id', `${namespace}-${gradient.id}`);
      element.setAttribute('gradientUnits', 'objectBoundingBox');
      for (const [key, value] of Object.entries(gradient.geometry)) element.setAttribute(key, num(value));
      for (const stop of gradient.stops) {
        const color = resolvePaint(stop.color, env, namespace);
        if (color === undefined) continue;
        const item = doc.createElementNS(SVG, 'stop');
        item.setAttribute('offset', num(stop.offset));
        item.setAttribute('stop-color', color);
        if (stop.opacity < 1) item.setAttribute('stop-opacity', num(stop.opacity));
        element.appendChild(item);
      }
      defs.appendChild(element);
    }

    const tweens: TemplateTween[] = [];
    const loops: { readonly element: SVGElement; readonly target: string; readonly env: BaseScreenMaterialTemplateEnv }[] = [];

    const build = (
      node: CompiledTemplateNode,
      scope: BaseScreenMaterialTemplateEnv,
      parent: SVGElement,
      key: string,
    ): void => {
      const instanceKey = key === '' ? node.id : `${node.id}#${key}`;
      switch (node.kind) {
        case 'repeat': {
          const children = node.children ?? [];
          const count = iterations(node, scope, input.rows.length);
          for (let index = 0; index < count; index += 1) {
            const inner: BaseScreenMaterialTemplateEnv = {
              ...scope,
              index,
              count,
              ...(node.source?.k === 'rows' ? { row: input.rows[index] } : {}),
            };
            for (const child of children) build(child, inner, parent, key === '' ? `${index}` : `${key}.${index}`);
          }
          return;
        }
        case 'when': {
          if (node.test === undefined || !isTemplateTruthy(evaluate(node.test, scope))) return;
          for (const child of node.children ?? []) build(child, scope, parent, key);
          return;
        }
        case 'clip': {
          const clipId = `${namespace}-${node.id}${key === '' ? '' : `-${key.replace(/\./g, '-')}`}`;
          const clipPath = doc.createElementNS(SVG, 'clipPath');
          clipPath.setAttribute('id', clipId);
          if (node.clipShape !== undefined) {
            const shape = createShape(node.clipShape, scope);
            if (shape !== undefined) clipPath.appendChild(shape.element);
          }
          defs.appendChild(clipPath);
          const group = doc.createElementNS(SVG, 'g');
          group.setAttribute('clip-path', `url(#${clipId})`);
          attach(node, group, parent, instanceKey, scope);
          for (const child of node.children ?? []) build(child, scope, group, key);
          return;
        }
        case 'g': {
          const group = doc.createElementNS(SVG, 'g');
          const params = evaluateParams(node, scope);
          const apply = (values: Record<string, number>): void => applyGroup(group, values);
          apply(params);
          if (Number.isFinite(params.opacity)) group.setAttribute('opacity', num(clamp01(params.opacity as number)));
          trackChange(node, instanceKey, params, apply);
          attach(node, group, parent, instanceKey, scope);
          for (const child of node.children ?? []) build(child, scope, group, key);
          return;
        }
        default: {
          const shape = createShape(node, scope);
          if (shape === undefined) return;
          trackChange(node, instanceKey, shape.params, shape.apply);
          attach(node, shape.element, parent, instanceKey, scope);
        }
      }
    };

    const attach = (
      node: CompiledTemplateNode,
      element: SVGElement,
      parent: SVGElement,
      instanceKey: string,
      scope: BaseScreenMaterialTemplateEnv,
    ): void => {
      element.setAttribute('data-template-node', node.id);
      if (node.on !== undefined && input.interactive) {
        const event = node.on;
        const payload: Record<string, ScreenJsonValue> = {};
        for (const item of event.payload) {
          const value = evaluate(item.value, scope);
          payload[item.key] =
            item.type === 'number'
              ? finiteOrNull(toTemplateNumber(value))
              : item.type === 'boolean'
                ? isTemplateTruthy(value)
                : value === null
                  ? ''
                  : String(value);
        }
        element.style.cursor = 'pointer';
        element.addEventListener('click', () => {
          element.dispatchEvent(
            new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
              bubbles: true,
              composed: true,
              detail: { name: event.name, payload },
            }),
          );
        });
      }
      if (loopTargets.has(node.id)) {
        // 循环动画作用在包裹层上：CSS transform 会覆盖元素自己的 transform 属性（g 的位移）。
        const wrapper = doc.createElementNS(SVG, 'g');
        wrapper.appendChild(element);
        parent.appendChild(wrapper);
        loops.push({ element: wrapper, target: node.id, env: scope });
        return;
      }
      void instanceKey;
      parent.appendChild(element);
    };

    const trackChange = (
      node: CompiledTemplateNode,
      instanceKey: string,
      params: Record<string, number>,
      apply: (values: Record<string, number>) => void,
    ): void => {
      const change = changeByTarget.get(node.id);
      if (change === undefined) return;
      const next: Record<string, number> = {};
      for (const attr of change.attributes) {
        const value = params[attr];
        if (value !== undefined && Number.isFinite(value)) next[attr] = value;
      }
      const before = previous.get(instanceKey);
      previous.set(instanceKey, next);
      if (!motion || before === undefined) {
        active.delete(instanceKey);
        return;
      }
      const now = doc.defaultView?.performance.now() ?? 0;
      const running = active.get(instanceKey);
      const inFlight = running !== undefined && now < running.start + running.duration;
      const changed = Object.keys(next).some((attr) => before[attr] !== undefined && before[attr] !== next[attr]);
      if (!changed) {
        // 读数没变：若上一轮过渡还没播完，新节点接着播完它。
        if (inFlight && running !== undefined) {
          const from = { ...params, ...running.from };
          apply(interpolate(from, params, progress(running, now, change.easing)));
          tweens.push({ apply, from, to: params, start: running.start, duration: running.duration, easing: change.easing });
        } else active.delete(instanceKey);
        return;
      }
      // 读数变了：从当前画面上的位置（过渡中则取插值）出发。
      const origin =
        inFlight && running !== undefined
          ? interpolate({ ...params, ...running.from }, { ...params, ...running.to }, progress(running, now, change.easing))
          : { ...params, ...before };
      apply(origin);
      const entry = { from: origin, to: params, start: now, duration: change.duration };
      active.set(instanceKey, entry);
      tweens.push({ apply, ...entry, easing: change.easing });
    };

    const createShape = (
      node: CompiledTemplateNode,
      scope: BaseScreenMaterialTemplateEnv,
    ): { element: SVGElement; params: Record<string, number>; apply: (values: Record<string, number>) => void } | undefined => {
      const params = evaluateParams(node, scope);
      let element: SVGElement;
      let apply: (values: Record<string, number>) => void;
      switch (node.kind) {
        case 'rect': {
          element = doc.createElementNS(SVG, 'rect');
          apply = (p) => {
            setNumber(element, 'x', p.x);
            setNumber(element, 'y', p.y);
            setNumber(element, 'width', Math.max(0, p.width ?? 0));
            setNumber(element, 'height', Math.max(0, p.height ?? 0));
            if (p.rx !== undefined) setNumber(element, 'rx', Math.max(0, p.rx));
          };
          break;
        }
        case 'circle':
          element = doc.createElementNS(SVG, 'circle');
          apply = (p) => {
            setNumber(element, 'cx', p.cx);
            setNumber(element, 'cy', p.cy);
            setNumber(element, 'r', Math.max(0, p.r ?? 0));
          };
          break;
        case 'ellipse':
          element = doc.createElementNS(SVG, 'ellipse');
          apply = (p) => {
            setNumber(element, 'cx', p.cx);
            setNumber(element, 'cy', p.cy);
            setNumber(element, 'rx', Math.max(0, p.rx ?? 0));
            setNumber(element, 'ry', Math.max(0, p.ry ?? 0));
          };
          break;
        case 'line':
          element = doc.createElementNS(SVG, 'line');
          apply = (p) => {
            setNumber(element, 'x1', p.x1);
            setNumber(element, 'y1', p.y1);
            setNumber(element, 'x2', p.x2);
            setNumber(element, 'y2', p.y2);
          };
          break;
        case 'polyline': {
          element = doc.createElementNS(SVG, node.closed === true ? 'polygon' : 'polyline');
          const points: string[] = [];
          if (node.points !== undefined) {
            const count = sourceCount(node.points.source, scope, input.rows.length);
            for (let index = 0; index < count; index += 1) {
              const inner: BaseScreenMaterialTemplateEnv = {
                ...scope,
                index,
                count,
                ...(node.points.source.k === 'rows' ? { row: input.rows[index] } : {}),
              };
              const x = toTemplateNumber(evaluate(node.points.x, inner));
              const y = toTemplateNumber(evaluate(node.points.y, inner));
              if (Number.isFinite(x) && Number.isFinite(y)) points.push(`${num(x)},${num(y)}`);
            }
          }
          element.setAttribute('points', points.join(' '));
          if (node.fill === undefined && node.closed !== true) element.setAttribute('fill', 'none');
          apply = () => {};
          break;
        }
        case 'path': {
          element = doc.createElementNS(SVG, 'path');
          const segments: string[] = [];
          for (const [command, args] of node.d ?? []) {
            const values = args.map((arg) => toTemplateNumber(evaluate(arg, scope)));
            if (values.some((value) => !Number.isFinite(value))) continue;
            segments.push(command === 'Z' ? 'Z' : `${command}${values.map(num).join(' ')}`);
          }
          element.setAttribute('d', segments.join(' '));
          apply = () => {};
          break;
        }
        case 'arc': {
          element = doc.createElementNS(SVG, 'path');
          element.setAttribute('fill', 'none');
          element.setAttribute('stroke-linecap', node.linecap ?? 'round');
          apply = (p) => {
            element.setAttribute('d', arcPath(p.cx ?? 0, p.cy ?? 0, p.r ?? 0, p.start ?? 0, p.end ?? 0));
            setNumber(element, 'stroke-width', Math.max(0, p.thickness ?? 0));
          };
          break;
        }
        case 'ticks': {
          element = doc.createElementNS(SVG, 'path');
          element.setAttribute('fill', 'none');
          apply = (p) => element.setAttribute('d', ticksPath(p));
          break;
        }
        case 'wave': {
          element = doc.createElementNS(SVG, 'path');
          apply = (p) => element.setAttribute('d', wavePath(p));
          break;
        }
        case 'text': {
          element = doc.createElementNS(SVG, 'text');
          const content = node.content === undefined ? null : evaluate(node.content, scope);
          element.textContent = content === null ? '' : String(content).slice(0, 256);
          element.setAttribute('text-anchor', node.anchor ?? 'start');
          element.setAttribute(
            'dominant-baseline',
            node.baseline === 'middle' ? 'central' : node.baseline === 'hanging' ? 'hanging' : 'auto',
          );
          element.setAttribute('font-weight', String(node.fontWeight ?? 400));
          element.style.fontFamily = 'inherit';
          element.style.fontVariantNumeric = 'tabular-nums';
          apply = (p) => {
            setNumber(element, 'x', p.x);
            setNumber(element, 'y', p.y);
            setNumber(element, 'font-size', Math.max(0, (p.fontSize ?? 0) * unitsPerPx));
          };
          break;
        }
        default:
          return undefined;
      }
      apply(params);
      paint(element, 'fill', node.fill, scope);
      paint(element, 'stroke', node.stroke, scope);
      if (node.kind === 'text' && node.fill === undefined) element.setAttribute('fill', 'currentColor');
      if (node.kind === 'ticks' && node.stroke === undefined) element.setAttribute('stroke', 'currentColor');
      if (Number.isFinite(params.strokeWidth) && node.kind !== 'arc') {
        setNumber(element, 'stroke-width', Math.max(0, params.strokeWidth as number));
      }
      if (Number.isFinite(params.opacity)) element.setAttribute('opacity', num(clamp01(params.opacity as number)));
      if (node.dash !== undefined) {
        const dash = node.dash.map((item) => toTemplateNumber(evaluate(item, scope)));
        if (dash.every((item) => Number.isFinite(item) && item >= 0)) {
          element.setAttribute('stroke-dasharray', dash.map(num).join(' '));
        }
      }
      if (node.linecap !== undefined && node.kind !== 'arc') element.setAttribute('stroke-linecap', node.linecap);
      return { element, params, apply };
    };

    const paint = (
      element: SVGElement,
      attribute: 'fill' | 'stroke',
      value: BaseScreenMaterialTemplatePaint | undefined,
      scope: BaseScreenMaterialTemplateEnv,
    ): void => {
      if (value === undefined) return;
      const resolved = resolvePaint(value, scope, namespace);
      if (resolved !== undefined) element.setAttribute(attribute, resolved);
    };

    const evaluate = (
      expression: BaseScreenMaterialTemplateExpression,
      scope: BaseScreenMaterialTemplateEnv,
    ): BaseScreenMaterialTemplateScalar => evaluateBaseScreenMaterialTemplateExpression(expression, scope);

    const evaluateParams = (
      node: CompiledTemplateNode,
      scope: BaseScreenMaterialTemplateEnv,
    ): Record<string, number> => {
      const params: Record<string, number> = {};
      for (const [key, expression] of Object.entries(node.num)) {
        params[key] = toTemplateNumber(evaluate(expression, scope));
      }
      return params;
    };

    for (const node of template.nodes) build(node, env, svg, '');
    input.root.replaceChildren(svg);

    if (!motion) return;
    for (const tween of tweens) runTween(doc, tween);
    for (const loop of loops) {
      for (const animation of template.animations) {
        if (animation.kind !== 'loop' || animation.target !== loop.target) continue;
        if (animation.enabledBy !== undefined && !isTemplateTruthy(evaluate(animation.enabledBy, loop.env))) continue;
        const from = toTemplateNumber(evaluate(animation.from, loop.env));
        const to = toTemplateNumber(evaluate(animation.to, loop.env));
        if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
        if (animation.property === 'rotate' || animation.property === 'scale') {
          loop.element.style.transformBox = 'fill-box';
          loop.element.style.transformOrigin = 'center';
        }
        loop.element.animate(
          [loopFrame(animation.property, from), loopFrame(animation.property, to)],
          {
            duration: animation.duration,
            iterations: Number.POSITIVE_INFINITY,
            easing: animation.easing,
            direction: animation.alternate ? 'alternate' : 'normal',
          },
        );
      }
    }
  };
}

function iterations(node: CompiledTemplateNode, scope: BaseScreenMaterialTemplateEnv, rows: number): number {
  return node.source === undefined ? 0 : sourceCount(node.source, scope, rows);
}

function sourceCount(
  source: NonNullable<CompiledTemplateNode['source']>,
  scope: BaseScreenMaterialTemplateEnv,
  rows: number,
): number {
  const raw = source.k === 'rows' ? rows : toTemplateNumber(evaluateBaseScreenMaterialTemplateExpression(source.n, scope));
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat, Math.trunc(raw)));
}

function resolvePaint(
  value: BaseScreenMaterialTemplatePaint,
  env: BaseScreenMaterialTemplateEnv,
  namespace: string,
): string | undefined {
  if (value.k === 'color') return value.v;
  if (value.k === 'gradient') return `url(#${namespace}-${value.id})`;
  const resolved = evaluateBaseScreenMaterialTemplateExpression(value.e, env);
  // 样式字段可能是渐变串或混进别的值：只接受字面量颜色，其余丢弃（不让任何 url(...) 进属性）。
  return typeof resolved === 'string' && BASE_SCREEN_MATERIAL_TEMPLATE_COLOR.test(resolved.trim())
    ? resolved.trim()
    : undefined;
}

function applyGroup(group: SVGElement, p: Record<string, number>): void {
  const parts: string[] = [];
  if (Number.isFinite(p.x) || Number.isFinite(p.y)) {
    parts.push(`translate(${num(finite(p.x))} ${num(finite(p.y))})`);
  }
  if (Number.isFinite(p.rotate)) parts.push(`rotate(${num(p.rotate as number)})`);
  if (Number.isFinite(p.scale)) parts.push(`scale(${num(p.scale as number)})`);
  if (parts.length > 0) group.setAttribute('transform', parts.join(' '));
}

function loopFrame(property: string, value: number): Keyframe {
  switch (property) {
    case 'translateX':
      return { transform: `translateX(${num(value)}px)` };
    case 'translateY':
      return { transform: `translateY(${num(value)}px)` };
    case 'rotate':
      return { transform: `rotate(${num(value)}deg)` };
    case 'scale':
      return { transform: `scale(${num(value)})` };
    default:
      return { opacity: clamp01(value) };
  }
}

const EASING_FUNCTIONS: Readonly<Record<string, (t: number) => number>> = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

interface TemplateTween {
  readonly apply: (params: Record<string, number>) => void;
  readonly from: Record<string, number>;
  readonly to: Record<string, number>;
  readonly start: number;
  readonly duration: number;
  readonly easing: string;
}

function progress(
  tween: { readonly start: number; readonly duration: number },
  now: number,
  easing: string,
): number {
  const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
  return (EASING_FUNCTIONS[easing] ?? ((value: number) => value))(t);
}

function interpolate(
  from: Record<string, number>,
  to: Record<string, number>,
  k: number,
): Record<string, number> {
  const values: Record<string, number> = { ...to };
  for (const [key, target] of Object.entries(to)) {
    const origin = from[key];
    if (origin !== undefined && Number.isFinite(origin) && Number.isFinite(target)) {
      values[key] = origin + (target - origin) * k;
    }
  }
  return values;
}

function runTween(doc: Document, tween: TemplateTween): void {
  const view = doc.defaultView;
  if (view === null) {
    tween.apply(tween.to);
    return;
  }
  const step = (now: number): void => {
    tween.apply(interpolate(tween.from, tween.to, progress(tween, now, tween.easing)));
    if (now < tween.start + tween.duration) view.requestAnimationFrame(step);
  };
  view.requestAnimationFrame(step);
}

/** 弧：角度以正上方为 0、顺时针为正；扫过 ≥ 360° 时画成整圆（两段半圆）。 */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (!Number.isFinite(cx + cy + r + start + end) || r <= 0) return '';
  const sweep = end - start;
  if (Math.abs(sweep) < 0.001) return '';
  const point = (deg: number): string => {
    const rad = (deg * Math.PI) / 180;
    return `${num(cx + r * Math.sin(rad))} ${num(cy - r * Math.cos(rad))}`;
  };
  if (Math.abs(sweep) >= 359.999) {
    return `M${point(start)} A${num(r)} ${num(r)} 0 1 1 ${point(start + 180)} A${num(r)} ${num(r)} 0 1 1 ${point(start + 359.99)}`;
  }
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const clockwise = sweep > 0 ? 1 : 0;
  return `M${point(start)} A${num(r)} ${num(r)} 0 ${large} ${clockwise} ${point(end)}`;
}

function ticksPath(p: Record<string, number>): string {
  const count = Math.max(0, Math.min(BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat, Math.trunc(finite(p.count))));
  const cx = finite(p.cx);
  const cy = finite(p.cy);
  const r = finite(p.r);
  const length = finite(p.length);
  const start = finite(p.start);
  const end = finite(p.end);
  if (count === 0) return '';
  const segments: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const deg = count === 1 ? start : start + ((end - start) * index) / (count - 1);
    const rad = (deg * Math.PI) / 180;
    const outer = [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
    const inner = [cx + (r - length) * Math.sin(rad), cy - (r - length) * Math.cos(rad)];
    segments.push(`M${num(outer[0] as number)} ${num(outer[1] as number)} L${num(inner[0] as number)} ${num(inner[1] as number)}`);
  }
  return segments.join(' ');
}

/** 波浪：从 (x, y) 起横向铺 width，波峰振幅 amplitude、波长 wavelength，向下封闭到 y + height。 */
function wavePath(p: Record<string, number>): string {
  const x = finite(p.x);
  const y = finite(p.y);
  const width = finite(p.width);
  const height = finite(p.height);
  const amplitude = finite(p.amplitude);
  const wavelength = Math.max(1, finite(p.wavelength));
  const phase = finite(p.phase);
  if (width <= 0) return '';
  const half = wavelength / 2;
  const startX = x - (((phase % wavelength) + wavelength) % wavelength);
  const segments = [`M${num(startX)} ${num(y)}`];
  let cursor = startX;
  let up = true;
  let guard = 0;
  while (cursor < x + width && guard < 400) {
    const next = cursor + half;
    segments.push(`Q${num(cursor + half / 2)} ${num(y + (up ? -amplitude : amplitude))} ${num(next)} ${num(y)}`);
    cursor = next;
    up = !up;
    guard += 1;
  }
  segments.push(`L${num(cursor)} ${num(y + height)} L${num(startX)} ${num(y + height)} Z`);
  return segments.join(' ');
}

function setNumber(element: SVGElement, attribute: string, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, num(value));
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

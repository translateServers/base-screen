import type { ScreenJsonObject } from '@base-screen/contracts';
import {
  contrastRatio,
  minimumContrastRatio,
  parseCssColor,
  resolveScreenFontFloorPx,
} from '@base-screen/core';
import type { BaseScreenAuthoringFinding } from './authoring-finding.js';
import { formatBaseScreenMaterialNumber } from './material-rendered-element.js';
import {
  type BaseScreenMaterialSpec,
  compileBaseScreenMaterialSpec,
  createBaseScreenMaterialSpecSampleDataset,
  normalizeBaseScreenMaterialSpecValue,
} from './material-spec.js';
import {
  BASE_SCREEN_MATERIAL_TEMPLATE_COLOR,
  BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS,
  type BaseScreenMaterialTemplatePaint,
  type CompiledBaseScreenMaterialTemplate,
  type CompiledTemplateNode,
  compileBaseScreenMaterialTemplate,
} from './material-template.js';
import {
  BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET,
  type BaseScreenMaterialTemplateEnv,
  type BaseScreenMaterialTemplateExpression,
  evaluateBaseScreenMaterialTemplateExpression,
  toTemplateNumber,
} from './material-template-expression.js';

/**
 * L2 模板的可读性与示例渲染体检（base-screen-docs ADR-0116 §2.4，TPL7–TPL10）。
 *
 * 不碰 DOM：用规格的示例数据与默认参数把模板「空跑」一遍——求值全部表达式（TPL9）、
 * 记下每段文字的字号与颜色、底板颜色（TPL7 / TPL8）以及节点几何（TPL10）。
 * 颜色候选按写法静态枚举（字面量、样式字段默认值、`pick` / 三元的各分支），所以
 * 「告警时才变红」这种分支也会被检查到。
 */
export function auditBaseScreenMaterialTemplate(
  spec: BaseScreenMaterialSpec,
): readonly BaseScreenAuthoringFinding[] {
  if (spec.template === undefined) return [];
  const compiled = compileBaseScreenMaterialTemplate(spec.template, {
    fields: spec.fields,
    data: spec.data,
    ...(spec.events === undefined ? {} : { events: spec.events }),
    sectionTarget: (section) =>
      section === 'text' || section === 'surface' || section === 'semantic' ? 'style' : 'props',
  });
  if (!compiled.ok) return [];
  const manifest = compileBaseScreenMaterialSpec(spec, { tagName: 'base-screen-template-audit' });
  if (!manifest.ok) return [];
  const props = (manifest.value.defaultProps ?? {}) as ScreenJsonObject;
  const style = (manifest.value.defaultStyle ?? {}) as ScreenJsonObject;
  const sample =
    spec.data.kind === 'scalar'
      ? spec.data.sample
      : spec.data.kind === 'rows'
        ? createBaseScreenMaterialSpecSampleDataset(spec.data)
        : undefined;
  const normalized = normalizeBaseScreenMaterialSpecValue(spec.data, sample);
  const env: BaseScreenMaterialTemplateEnv = {
    value: normalized.value,
    rows: normalized.rows,
    props,
    style,
    size: spec.defaultSize,
    formatNumber: (input) => formatBaseScreenMaterialNumber(input, props),
    budget: { steps: BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET },
  };
  return new TemplateAuditor(compiled.value, style).run(env);
}

interface TextRecord {
  readonly node: CompiledTemplateNode;
  readonly fontSize: number;
  readonly fontWeight: number;
}

class TemplateAuditor {
  readonly #findings: BaseScreenAuthoringFinding[] = [];
  readonly #texts = new Map<string, TextRecord>();
  readonly #outside = new Set<string>();
  readonly #failed = new Set<string>();

  constructor(
    private readonly template: CompiledBaseScreenMaterialTemplate,
    private readonly style: ScreenJsonObject,
  ) {}

  run(env: BaseScreenMaterialTemplateEnv): readonly BaseScreenAuthoringFinding[] {
    try {
      for (const node of this.template.nodes) this.#walk(node, env, false);
    } catch (error) {
      this.#findings.push({
        rule: 'TPL9',
        severity: 'error',
        message: `示例数据下模板渲染失败：${error instanceof Error ? error.message : String(error)}`,
        path: ['template'],
      });
    }
    this.#legibility();
    for (const id of this.#outside) {
      const node = this.template.index.get(id);
      this.#findings.push({
        rule: 'TPL10',
        severity: 'warning',
        message: `节点 ${id} 在示例数据下超出 viewBox，会被裁掉（需要溢出时放进 clip）。`,
        ...(node === undefined ? {} : { path: ['template', ...node.path] }),
      });
    }
    return this.#findings;
  }

  #evaluate(
    expression: BaseScreenMaterialTemplateExpression,
    env: BaseScreenMaterialTemplateEnv,
    node: CompiledTemplateNode,
    key: string,
  ): number {
    const value = toTemplateNumber(evaluateBaseScreenMaterialTemplateExpression(expression, env));
    if (!Number.isFinite(value) && !this.#failed.has(`${node.id}.${key}`)) {
      this.#failed.add(`${node.id}.${key}`);
      this.#findings.push({
        rule: 'TPL9',
        severity: 'error',
        message: `示例数据下 ${node.id}.${key} 求不出数字（结果为 NaN 或无穷）：检查除零、空数据与引号。`,
        path: ['template', ...node.path, key],
      });
    }
    return value;
  }

  #walk(node: CompiledTemplateNode, env: BaseScreenMaterialTemplateEnv, clipped: boolean): void {
    switch (node.kind) {
      case 'repeat': {
        const source = node.source;
        if (source === undefined) return;
        const raw =
          source.k === 'rows'
            ? env.rows.length
            : this.#evaluate(source.n, env, node, 'source');
        const count = Math.max(0, Math.min(BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat, Math.trunc(Number.isFinite(raw) ? raw : 0)));
        for (let index = 0; index < count; index += 1) {
          const inner: BaseScreenMaterialTemplateEnv = {
            ...env,
            index,
            count,
            ...(source.k === 'rows' ? { row: env.rows[index] } : {}),
          };
          for (const child of node.children ?? []) this.#walk(child, inner, clipped);
        }
        return;
      }
      case 'when':
        // 两个分支都走：体检要覆盖关掉的开关（例如默认隐藏的读数）。
        if (node.test !== undefined) evaluateBaseScreenMaterialTemplateExpression(node.test, env);
        for (const child of node.children ?? []) this.#walk(child, env, clipped);
        return;
      case 'clip':
        for (const child of node.children ?? []) this.#walk(child, env, true);
        return;
      case 'g': {
        // 组的位移会改变子节点的实际位置：几何越界只检查顶层节点，这里不再下钻判越界。
        const translated = node.num.x !== undefined || node.num.y !== undefined || node.num.rotate !== undefined || node.num.scale !== undefined;
        for (const [key, expression] of Object.entries(node.num)) this.#evaluate(expression, env, node, key);
        for (const child of node.children ?? []) this.#walk(child, env, clipped || translated);
        return;
      }
      default:
        break;
    }
    const params: Record<string, number> = {};
    for (const [key, expression] of Object.entries(node.num)) params[key] = this.#evaluate(expression, env, node, key);
    if (node.content !== undefined) evaluateBaseScreenMaterialTemplateExpression(node.content, env);
    for (const item of node.on?.payload ?? []) evaluateBaseScreenMaterialTemplateExpression(item.value, env);
    if (node.points !== undefined) {
      const source = node.points.source;
      const count =
        source.k === 'rows'
          ? env.rows.length
          : Math.max(0, Math.min(BASE_SCREEN_MATERIAL_TEMPLATE_LIMITS.repeat, Math.trunc(this.#evaluate(source.n, env, node, 'points'))));
      for (let index = 0; index < count; index += 1) {
        const inner = { ...env, index, count, ...(source.k === 'rows' ? { row: env.rows[index] } : {}) };
        const x = this.#evaluate(node.points.x, inner, node, 'points.x');
        const y = this.#evaluate(node.points.y, inner, node, 'points.y');
        if (!clipped) this.#checkBounds(node, [x, x], [y, y]);
      }
    }
    for (const [, args] of node.d ?? []) for (const arg of args) this.#evaluate(arg, env, node, 'd');
    if (node.kind === 'text') {
      const record = this.#texts.get(node.id);
      const fontSize = params.fontSize ?? 0;
      if (record === undefined || fontSize < record.fontSize) {
        this.#texts.set(node.id, { node, fontSize, fontWeight: node.fontWeight ?? 400 });
      }
    }
    if (!clipped) this.#bounds(node, params);
  }

  #bounds(node: CompiledTemplateNode, p: Record<string, number>): void {
    const v = (key: string): number => p[key] ?? 0;
    switch (node.kind) {
      case 'rect':
        this.#checkBounds(node, [v('x'), v('x') + v('width')], [v('y'), v('y') + v('height')]);
        return;
      case 'circle':
        this.#checkBounds(node, [v('cx') - v('r'), v('cx') + v('r')], [v('cy') - v('r'), v('cy') + v('r')]);
        return;
      case 'ellipse':
        this.#checkBounds(node, [v('cx') - v('rx'), v('cx') + v('rx')], [v('cy') - v('ry'), v('cy') + v('ry')]);
        return;
      case 'line':
        this.#checkBounds(node, [Math.min(v('x1'), v('x2')), Math.max(v('x1'), v('x2'))], [Math.min(v('y1'), v('y2')), Math.max(v('y1'), v('y2'))]);
        return;
      case 'arc': {
        const outer = v('r') + v('thickness') / 2;
        this.#checkBounds(node, [v('cx') - outer, v('cx') + outer], [v('cy') - outer, v('cy') + outer]);
        return;
      }
      case 'text':
        this.#checkBounds(node, [v('x'), v('x')], [v('y'), v('y')]);
        return;
      default:
        return;
    }
  }

  #checkBounds(node: CompiledTemplateNode, xs: readonly [number, number], ys: readonly [number, number]): void {
    const [vx, vy, vw, vh] = this.template.viewBox;
    const slack = 0.5;
    if (
      !Number.isFinite(xs[0] + xs[1] + ys[0] + ys[1]) ||
      xs[0] < vx - slack ||
      ys[0] < vy - slack ||
      xs[1] > vx + vw + slack ||
      ys[1] > vy + vh + slack
    ) {
      this.#outside.add(node.id);
    }
  }

  /** TPL7 字号下限、TPL8 文字与底板的对比度（每个颜色候选都算）。 */
  #legibility(): void {
    const floor = resolveScreenFontFloorPx(1920);
    for (const record of this.#texts.values()) {
      const path = ['template', ...record.node.path];
      if (record.fontSize < floor - 0.01) {
        this.#findings.push({
          rule: 'TPL7',
          severity: 'error',
          message: `文字 ${record.node.id} 的字号 ${round(record.fontSize)}px 低于下限 ${round(floor)}px（1920 宽画布 16px 等比）。`,
          path: [...path, 'fontSize'],
        });
      }
      const backdrop = record.node.backdrop;
      if (backdrop === undefined || backdrop === 'container') continue;
      const target = this.template.index.get(backdrop);
      if (target === undefined) continue;
      const textColors = this.#candidates(record.node.fill);
      const backColors = this.#candidates(target.fill);
      if (textColors.length === 0 || backColors.length === 0) continue;
      const required = minimumContrastRatio(record.fontSize, record.fontWeight);
      let worst: { ratio: number; text: string; back: string } | undefined;
      for (const text of textColors) {
        for (const back of backColors) {
          const a = parseCssColor(text);
          const b = parseCssColor(back);
          if (a === undefined || b === undefined) continue;
          const ratio = contrastRatio(a, b);
          if (worst === undefined || ratio < worst.ratio) worst = { ratio, text, back };
        }
      }
      if (worst !== undefined && worst.ratio < required) {
        this.#findings.push({
          rule: 'TPL8',
          severity: 'warning',
          message: `文字 ${record.node.id}（${worst.text}）在底板 ${backdrop}（${worst.back}）上的对比度 ${worst.ratio.toFixed(2)}，低于 ${required}。`,
          path: [...path, 'fill'],
        });
      }
    }
  }

  /** 静态枚举一个颜色写法可能取到的全部颜色。 */
  #candidates(paint: BaseScreenMaterialTemplatePaint | undefined): string[] {
    if (paint === undefined) return [];
    if (paint.k === 'color') return [paint.v];
    if (paint.k === 'gradient') {
      const gradient = this.template.gradients.find((item) => item.id === paint.id);
      return (gradient?.stops ?? []).flatMap((stop) => this.#candidates(stop.color));
    }
    return this.#expressionColors(paint.e);
  }

  #expressionColors(expression: BaseScreenMaterialTemplateExpression): string[] {
    switch (expression.k) {
      case 'lit':
        return typeof expression.v === 'string' ? [expression.v] : [];
      case 'ref': {
        if (expression.root !== 'style' || expression.key === undefined) return [];
        const value = this.style[expression.key];
        return typeof value === 'string' && BASE_SCREEN_MATERIAL_TEMPLATE_COLOR.test(value) ? [value] : [];
      }
      case 'cond':
        return [...this.#expressionColors(expression.a), ...this.#expressionColors(expression.b)];
      case 'call':
        return expression.args.flatMap((arg, index) =>
          index === 0 || (index % 2 === 1 && index !== expression.args.length - 1) ? [] : this.#expressionColors(arg),
        );
      default:
        return [];
    }
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

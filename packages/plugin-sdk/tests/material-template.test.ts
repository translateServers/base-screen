import { describe, expect, it } from 'vitest';
import {
  auditBaseScreenMaterialSpec,
  type BaseScreenMaterialSpec,
  compileBaseScreenMaterialSpec,
  createBaseScreenSpecMaterialDefinition,
  hasBaseScreenAuthoringErrors,
} from '../src/index.js';
import { GAUGE_SPEC, LINE_SPEC } from './__fixtures__/template-specs.js';

/**
 * L2 模板物料（ADR-0116）的体检与定义：每条反例只犯一种错，检验 TPL 规则报得出来；
 * 合法样本零错误、编译出事件与状态预置键；模板与渲染函数互斥。
 */
const template = GAUGE_SPEC.template as NonNullable<BaseScreenMaterialSpec['template']>;
const BG = template.nodes[0];
const TEXT = (patch: Record<string, unknown>) => ({
  kind: 'text',
  id: 'reading',
  x: 110,
  y: 110,
  fontSize: 'style.fontSize',
  content: 'format(value)',
  fill: 'style.color',
  backdrop: 'bg',
  ...patch,
});
const withNodes = (nodes: readonly unknown[]): unknown => ({
  ...GAUGE_SPEC,
  template: { ...template, nodes, animations: [] },
});

function rules(spec: unknown, renderSource?: string): string[] {
  return auditBaseScreenMaterialSpec(spec, renderSource === undefined ? {} : { renderSource })
    .filter((finding) => finding.rule !== 'R4')
    .map((finding) => `${finding.severity}:${finding.rule}`);
}

describe('L2 template audit (ADR-0116 §2.4)', () => {
  it('passes the reference specs without errors', () => {
    for (const spec of [GAUGE_SPEC, LINE_SPEC]) {
      const findings = auditBaseScreenMaterialSpec(spec);
      expect(hasBaseScreenAuthoringErrors(findings), JSON.stringify(findings)).toBe(false);
    }
  });

  it.each([
    [
      'TPL1',
      'element outside the whitelist',
      withNodes([BG, { kind: 'foreignObject', id: 'html' }]),
    ],
    [
      'TPL1',
      'event handler attribute',
      withNodes([
        BG,
        { kind: 'rect', id: 'r', x: 0, y: 0, width: 1, height: 1, onclick: 'alert(1)' },
      ]),
    ],
    ['TPL1', 'url() paint', withNodes([{ ...BG, fill: 'url(https://evil.example/x)' }])],
    ['TPL2', 'undeclared field', withNodes([BG, TEXT({ content: 'props.secret' })])],
    ['TPL2', 'function outside the closed set', withNodes([BG, TEXT({ content: 'fetch(value)' })])],
    [
      'TPL3',
      'repeat over the limit',
      withNodes([BG, { kind: 'repeat', id: 'many', source: { range: 500 }, children: [] }]),
    ],
    ['TPL4', 'duplicate id', withNodes([BG, { ...BG }])],
    ['TPL5', 'color computed from data', withNodes([BG, TEXT({ fill: "concat('#', value)" })])],
    ['TPL5', 'font size driven by data', withNodes([BG, TEXT({ fontSize: 'value / 2' })])],
    ['TPL6', 'text without backdrop', withNodes([BG, TEXT({ backdrop: undefined })])],
    ['TPL7', 'font below the readable floor', withNodes([BG, TEXT({ fontSize: 12 })])],
    ['TPL9', 'sample data cannot be evaluated', withNodes([BG, TEXT({ x: 'value / 0 * 0' })])],
  ])('reports %s for %s', (rule, _label, spec) => {
    expect(rules(spec)).toContain(`error:${rule}`);
  });

  it('only warns for low contrast and out-of-bounds geometry', () => {
    expect(rules(withNodes([BG, TEXT({ fill: '#111827' })]))).toEqual(['warning:TPL8']);
    expect(
      rules(withNodes([BG, { kind: 'circle', id: 'out', cx: 400, cy: 400, r: 20, fill: '#fff' }])),
    ).toEqual(['warning:TPL10']);
  });

  it('rejects a template that also ships render code', () => {
    expect(rules(GAUGE_SPEC, 'root.textContent = "x"')).toContain('error:TPL1');
    const definition = createBaseScreenSpecMaterialDefinition({
      spec: GAUGE_SPEC,
      render: () => undefined,
      tagName: 'host-online-tpl-conflict',
    });
    expect(definition.ok).toBe(false);
    expect(definition.ok ? '' : definition.diagnostics[0]?.message).toMatch(
      /^MATERIAL_TEMPLATE_RENDER_CONFLICT/,
    );
  });

  it('defines a template material without render code and compiles events and presets', () => {
    const definition = createBaseScreenSpecMaterialDefinition({
      spec: GAUGE_SPEC,
      tagName: 'host-online-tpl-gauge',
    });
    expect(definition.ok).toBe(true);
    const manifest = compileBaseScreenMaterialSpec(GAUGE_SPEC, {
      tagName: 'host-online-tpl-gauge',
    });
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    expect(manifest.value.events).toEqual(['valueClick']);
    expect(JSON.stringify(manifest.value)).toContain('fillColor');
  });
});

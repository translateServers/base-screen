import { describe, expect, it } from 'vitest';
import {
  auditBaseScreenMaterialSpec,
  type BaseScreenMaterialSpec,
  hasBaseScreenAuthoringErrors,
} from '../src/index.js';

const BASE: BaseScreenMaterialSpec = {
  type: 'host.online.delta-test',
  name: '同比变化',
  category: '指标',
  keywords: ['同比'],
  defaultSize: { width: 180, height: 44 },
  numberFormat: { decimals: 1, unit: '%' },
  fields: [
    { key: 'showArrow', label: '显示箭头', section: 'structure', kind: 'boolean', default: true },
    { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#c6d4e4' },
    { key: 'positiveColor', label: '改善色', section: 'semantic', kind: 'color', default: '#3ecf8e' },
    { key: 'negativeColor', label: '恶化色', section: 'semantic', kind: 'color', default: '#f5574b' },
  ],
  data: { kind: 'scalar', valueType: 'number', sample: 12.6 },
};
const RENDER = 'root.textContent = formatNumber(value);';

function rules(spec: unknown, renderSource = RENDER) {
  return auditBaseScreenMaterialSpec(spec, { renderSource }).map((item) => `${item.severity}:${item.rule}`);
}

function withField(field: Record<string, unknown>): unknown {
  return { ...BASE, fields: [...BASE.fields, field] };
}

describe('material spec audit (ADR-0105 §2.5)', () => {
  it('passes a paradigm-conforming component', () => {
    expect(auditBaseScreenMaterialSpec(BASE, { renderSource: RENDER })).toEqual([]);
  });

  it('reports spec shape errors as SPEC', () => {
    expect(rules({ ...BASE, type: '' })).toContain('error:SPEC');
  });

  it('applies the atomicity rules to fields', () => {
    expect(rules(withField({ key: 'title', label: '标题', section: 'structure', kind: 'text', default: '' }))).toContain(
      'error:T4',
    );
    expect(rules(withField({ key: 'hint', label: '说明', section: 'structure', kind: 'text', default: '' }))).toContain(
      'error:T4',
    );
    expect(
      rules(withField({ key: 'statusColumn', label: '状态列', section: 'structure', kind: 'text', default: '' })),
    ).toContain('error:R7');
    expect(rules(withField({ key: 'emptyText', label: '空态', section: 'structure', kind: 'text', default: '' }))).toContain(
      'error:R8',
    );
    expect(
      rules(withField({ key: 'barColor', label: '条形色', section: 'structure', kind: 'color', default: '#fff' })),
    ).toContain('error:P2');
    expect(
      rules(withField({ key: 'glowTint', label: '光晕色', section: 'surface', kind: 'color', default: '#fff' })),
    ).toContain('warning:R4');
  });

  it('runs the inspector form audit on the compiled manifest', () => {
    expect(
      rules(withField({ key: 'size', label: '尺寸（px）', section: 'text', kind: 'number', default: 12 })),
    ).toContain('error:R13');
    const many = Array.from({ length: 10 }, (_, index) => ({
      key: `flag${index}`,
      label: `开关${index}`,
      section: 'structure',
      kind: 'boolean',
      default: true,
    }));
    const result = auditBaseScreenMaterialSpec({ ...BASE, fields: [...BASE.fields, ...many] }, { renderSource: RENDER });
    expect(result.find((item) => item.rule === 'R9')?.severity).toBe('warning');
  });

  it('checks the render source statically', () => {
    expect(rules(BASE, 'fetch("/api").then(() => {}); root.textContent = formatNumber(value);')).toContain(
      'error:RENDER',
    );
    expect(rules(BASE, 'root.getRootNode().host.style.opacity = "0.5"; formatNumber(value);')).toContain('error:RENDER');
    expect(rules(BASE, 'root.innerHTML = formatNumber(value);')).toContain('warning:RENDER');
    expect(rules(BASE, 'root.textContent = String(value);')).toContain('warning:RENDER');
    expect(rules(BASE, '// fetch("/api") 只是注释\nroot.textContent = formatNumber(value);')).toEqual([]);
    expect(rules(BASE, '   ')).toContain('error:RENDER');
  });

  it('warns about samples and oversized defaults', () => {
    const rows = {
      ...BASE,
      numberFormat: undefined,
      data: { kind: 'rows', roles: [{ id: 'name', label: '名称', valueType: 'string' }], sample: [] },
    };
    const { numberFormat: _numberFormat, ...withoutFormat } = rows;
    expect(rules(withoutFormat, 'for (const row of rows) root.append(String(row.name));')).toContain('warning:D1');
    expect(rules({ ...BASE, defaultSize: { width: 2400, height: 200 } })).toContain('warning:S1');
  });

  it('orders errors before warnings', () => {
    const findings = auditBaseScreenMaterialSpec(
      withField({ key: 'title', label: '标题', section: 'structure', kind: 'text', default: '' }),
      { renderSource: 'root.innerHTML = formatNumber(value);' },
    );
    expect(findings[0]?.severity).toBe('error');
    expect(findings.at(-1)?.severity).toBe('warning');
    expect(hasBaseScreenAuthoringErrors(findings)).toBe(true);
  });
});

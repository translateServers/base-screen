import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialSpec,
  compileBaseScreenMaterialSpec,
  createBaseScreenMaterialSpecDataAdapter,
  normalizeBaseScreenMaterialSpecValue,
  parseBaseScreenMaterialSpec,
} from '../src/index.js';

/** 「环形进度」：组件工坊新建组件的起点，覆盖单值、读数格式与跨侧条件。 */
const RING: BaseScreenMaterialSpec = {
  type: 'host.online.ring-test',
  name: '环形进度',
  category: '指标',
  keywords: ['进度'],
  defaultSize: { width: 160, height: 160 },
  numberFormat: { decimals: 1, unit: '%', visibleWhen: { key: 'showValue', equals: true } },
  fields: [
    { key: 'showValue', label: '显示读数', section: 'format', kind: 'boolean', default: true },
    {
      key: 'segments',
      label: '刻度数',
      section: 'structure',
      kind: 'number',
      default: 12,
      min: 4,
      max: 24,
    },
    {
      key: 'color',
      label: '读数色',
      section: 'text',
      kind: 'color',
      default: '#e6f1ff',
      visibleWhen: { key: 'showValue', equals: true },
    },
    { key: 'fill', label: '填充色', section: 'surface', kind: 'color', default: '#38bdf8' },
    { key: 'faultColor', label: '故障色', section: 'semantic', kind: 'color', default: '#f5222d' },
    { key: 'pulse', label: '启用脉冲', section: 'motion', kind: 'boolean', default: false },
  ],
  data: { kind: 'scalar', valueType: 'number', sample: 72.4 },
};

const RANK: BaseScreenMaterialSpec = {
  type: 'host.online.rank-test',
  name: '排名条',
  category: '指标',
  keywords: [],
  defaultSize: { width: 300, height: 200 },
  fields: [],
  data: {
    kind: 'rows',
    roles: [
      { id: 'name', label: '名称', valueType: 'string' },
      { id: 'value', label: '数值', valueType: 'number' },
      { id: 'note', label: '备注', valueType: 'string', optional: true },
    ],
    sample: [
      { name: '华东', value: 12 },
      { name: '华南', value: 9 },
    ],
  },
};

function compile(spec: unknown) {
  const result = compileBaseScreenMaterialSpec(spec, { tagName: 'host-online-test-abc' });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}

describe('material spec (ADR-0105 §2.2)', () => {
  it('derives props / style from the section and keeps the fixed section order', () => {
    const manifest = compile(RING);
    expect(Object.keys(manifest.propsSchema.properties).sort()).toEqual(
      ['decimals', 'pulse', 'segments', 'showValue', 'unit'].sort(),
    );
    expect(Object.keys(manifest.styleSchema.properties)).toEqual(['color', 'fill', 'faultColor']);
    expect(manifest.defaultProps).toMatchObject({ unit: '%', decimals: 1, showValue: true });
    const sections = manifest.editorDescriptor?.appearance ?? [];
    expect(sections.map((section) => section.id)).toEqual([
      'format',
      'structure',
      'text',
      'surface',
      'semantic',
      'motion',
    ]);
    expect(sections.find((section) => section.id === 'semantic')?.collapsed).toBe(true);
    expect(sections.find((section) => section.id === 'motion')?.advanced).toBe(true);
    expect(manifest.propertyPanel).toEqual([]);
    expect(manifest.stylePanel).toEqual([]);
  });

  it('infers controls and writes cross-side conditions explicitly', () => {
    const fields = (compile(RING).editorDescriptor?.appearance ?? []).flatMap((s) => s.fields);
    const byId = Object.fromEntries(fields.map((field) => [field.id, field]));
    // 作者字段在配置组前：「显示读数」是读数格式的总闸。
    expect(fields.slice(0, 3).map((field) => field.id)).toEqual(['showValue', 'unit', 'decimals']);
    expect(byId.segments?.control).toBe('stepper');
    expect(byId.fill?.control).toBe('color');
    expect(byId.color?.when).toEqual([
      { target: 'props', path: ['showValue'], operator: 'eq', value: true },
    ]);
    expect(byId.decimals?.when).toEqual([{ path: ['showValue'], operator: 'eq', value: true }]);
  });

  it('derives the scalar data contract', () => {
    const manifest = compile(RING);
    expect(manifest.dataCapabilities).toEqual(['static', 'variable', 'dataset']);
    expect(manifest.staticData).toEqual({ kind: 'scalar', valueType: 'number' });
    expect(manifest.defaultData).toBe(72.4);
    expect(manifest.dataBinding?.roles.map((role) => role.id)).toEqual(['value']);
    expect(manifest.designCapabilities).toEqual({ resize: true, rotate: true, children: false });
  });

  it('derives the rows data contract with a sample dataset and default binding', () => {
    const manifest = compile(RANK);
    expect(manifest.dataCapabilities).toEqual(['static', 'dataset']);
    expect(manifest.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { name: ['name'], value: ['value'], note: ['note'] } },
    });
    expect(manifest.defaultData).toMatchObject({
      rows: [
        { name: '华东', value: 12, note: null },
        { name: '华南', value: 9, note: null },
      ],
    });
    expect(manifest.dataBinding?.roles.map((role) => [role.id, role.minFields])).toEqual([
      ['name', 1],
      ['value', 1],
      ['note', 0],
    ]);
  });

  it('projects datasets through the derived adapter', () => {
    const scalar = createBaseScreenMaterialSpecDataAdapter(RING.data)!;
    const dataset = {
      fields: [{ id: 'amount', label: '金额', valueType: 'string' as const }],
      rows: [{ amount: '42.5' }],
    };
    expect(scalar.adapt({ dataset, fields: { value: [dataset.fields[0]!] } })).toMatchObject({
      ok: true,
      value: 42.5,
    });
    expect(scalar.adapt({ dataset, fields: {} }).ok).toBe(false);

    const rows = createBaseScreenMaterialSpecDataAdapter(RANK.data)!;
    const table = {
      fields: [
        { id: 'region', label: '区域', valueType: 'string' as const },
        { id: 'amount', label: '金额', valueType: 'number' as const },
      ],
      rows: [
        { region: '华东', amount: 3 },
        { region: '华北', amount: 'x' },
      ],
    };
    expect(
      rows.adapt({
        dataset: table,
        fields: { name: [table.fields[0]!], value: [table.fields[1]!] },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        rows: [
          { name: '华东', value: 3, note: null },
          { name: '华北', value: null, note: null },
        ],
        total: 2,
      },
    });
    expect(rows.adapt({ dataset: table, fields: { name: [table.fields[0]!] } }).ok).toBe(false);
    expect(createBaseScreenMaterialSpecDataAdapter({ kind: 'none' })).toBeUndefined();
  });

  it('normalizes static, variable and dataset values to one shape', () => {
    expect(normalizeBaseScreenMaterialSpecValue(RING.data, '12')).toEqual({ value: 12, rows: [] });
    expect(normalizeBaseScreenMaterialSpecValue(RING.data, 'n/a')).toEqual({
      value: null,
      rows: [],
    });
    expect(
      normalizeBaseScreenMaterialSpecValue(RANK.data, { rows: [{ name: 'A', value: '2' }] }).rows,
    ).toEqual([{ name: 'A', value: 2, note: null }]);
    // 静态表格数据集形状（fields + rows）也按角色键读取。
    expect(
      normalizeBaseScreenMaterialSpecValue(RANK.data, {
        fields: [],
        rows: [{ name: 'B', value: 1 }],
      }).rows,
    ).toEqual([{ name: 'B', value: 1, note: null }]);
  });

  it('fails closed on shape errors with paths', () => {
    const paths = (spec: unknown) => {
      const result = parseBaseScreenMaterialSpec(spec);
      return result.ok ? [] : result.diagnostics.map((item) => item.path.join('.'));
    };
    const field = (patch: Record<string, unknown>) => ({
      ...RING,
      fields: [
        { key: 'size', label: '尺寸', section: 'structure', kind: 'number', default: 1, ...patch },
      ],
    });
    expect(paths(field({ key: 'opacity' }))).toContain('fields.0.key');
    expect(paths(field({ key: 'decimals' }))).toContain('fields.0.key');
    expect(paths(field({ default: 30, max: 20 }))).toContain('fields.0.default');
    expect(paths(field({ kind: 'choice', default: 'c', options: ['a', 'b'] }))).toContain(
      'fields.0.default',
    );
    expect(paths(field({ section: 'chrome' }))).toContain('fields.0.section');
    expect(paths(field({ visibleWhen: { key: 'missing', equals: true } }))).toContain(
      'fields.0.visibleWhen',
    );
    expect(
      paths({ ...RING, numberFormat: { visibleWhen: { key: 'segments', equals: true } } }),
    ).toContain('numberFormat.visibleWhen');
    expect(paths({ ...RANK, data: { ...RANK.data, sample: [{ city: 'x' }] } })).toContain(
      'data.sample.0.city',
    );
    expect(paths({ ...RING, type: 'Not A Type' })).toContain('type');
    expect(paths({ ...RING, extra: true })).toContain('extra');
  });
});

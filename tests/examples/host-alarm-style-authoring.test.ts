import { describe, expect, it } from 'vitest';
import {
  ALARM_DEMO_BINDINGS,
  BOARD_ALARM_DOCUMENT,
} from '../../examples/shared-backend/src/screens/board-alarm-document';
import {
  createHostAlarmStyleAuthoring,
  HOST_ALARM_LEVELS,
  parseHostAlarmBindings,
} from '../../examples/vanilla-host/src/screen/host-alarm-style-authoring';
import {
  designerHostStyleFields,
  withHostConditionalStyleBinding,
  withoutHostConditionalStyleBinding,
} from '../../packages/engine/src/common/operations/style/designer-host-conditional-style.js';
import {
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../../packages/material/src/index.js';
import {
  createBaseScreenMaterialCatalog,
  validateBaseScreenMaterialStyle,
} from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-board-materials/src/digital-flop.js';

/**
 * 宿主适配器 + 基座作者面纯逻辑的三层校验：
 * 1) 宿主的嵌套按屏绑定能正确投影成单组件列表，保存只替换目标组件；
 * 2) 种子绑定落在真实组件与合法样式键上（否则检查器里"改了没反应"）；
 * 3) 基座的字段推导与增删函数是可单测的纯逻辑。
 *
 * 模块本体三端逐字共享；这里取 vanilla 拷贝，react / vue 侧由各自 typecheck 兜底。
 */
const catalog = createBaseScreenMaterialCatalog([
  { manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST, constructor: class {} as never },
  { manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST, constructor: class {} as never },
  { manifest: PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST, constructor: class {} as never },
]);

describe('host alarm style authoring adapter', () => {
  const seed = parseHostAlarmBindings(ALARM_DEMO_BINDINGS);
  if (seed === undefined) throw new Error('seed bindings did not parse');

  it('declares the demo alarm key with the frozen level list', () => {
    const authoring = createHostAlarmStyleAuthoring({
      initialBindings: seed,
      save: async (bindings) => ({ ok: true, bindings }),
      onSaved: () => {},
    });
    expect(authoring.sources.map((source) => source.id)).toContain('alarm.open');
    const source = authoring.sources.find((item) => item.id === 'alarm.open');
    expect(source?.label).toBe('未处理告警 (alarm.open)');
    expect(source?.conditions.map((condition) => condition.id)).toEqual([...HOST_ALARM_LEVELS]);
    expect(source?.conditions.map((condition) => condition.label)).toEqual([
      '警告',
      '严重',
      '提示',
    ]);
  });

  it('projects nested per-screen bindings for one component', () => {
    const authoring = createHostAlarmStyleAuthoring({
      initialBindings: seed,
      save: async (bindings) => ({ ok: true, bindings }),
      onSaved: () => {},
    });
    expect(authoring.bindings('kpi-alarm-value')).toEqual([
      { sourceId: 'alarm.open', conditionId: 'warning', style: { color: '#fa8c16' } },
      { sourceId: 'alarm.open', conditionId: 'critical', style: { color: '#f5222d' } },
    ]);
    expect(authoring.bindings('top-notice')).toEqual([
      {
        sourceId: 'alarm.open',
        conditionId: 'warning',
        style: { color: '#fa8c16', fontWeight: '700' },
      },
      {
        sourceId: 'alarm.open',
        conditionId: 'critical',
        style: { color: '#f5222d', fontWeight: '700' },
      },
    ]);
    expect(authoring.bindings('unbound')).toEqual([]);
  });

  it('replaces only the edited component and hot-updates the host', async () => {
    let persisted: ReturnType<typeof parseHostAlarmBindings>;
    let notified: ReturnType<typeof parseHostAlarmBindings>;
    const authoring = createHostAlarmStyleAuthoring({
      initialBindings: seed,
      save: async (bindings) => {
        persisted = bindings;
        return { ok: true, bindings };
      },
      onSaved: (bindings) => {
        notified = bindings;
      },
    });

    const next = [{ sourceId: 'alarm.open', conditionId: 'warning', style: { color: '#111111' } }];
    const result = await authoring.save('kpi-alarm-value', next);
    expect(result.ok).toBe(true);
    expect(authoring.bindings('kpi-alarm-value')).toEqual(next);
    // 另一个组件的绑定必须原样保留。
    expect(authoring.bindings('top-notice')).toEqual([
      {
        sourceId: 'alarm.open',
        conditionId: 'warning',
        style: { color: '#fa8c16', fontWeight: '700' },
      },
      {
        sourceId: 'alarm.open',
        conditionId: 'critical',
        style: { color: '#f5222d', fontWeight: '700' },
      },
    ]);
    expect(persisted).toEqual(notified);
    expect(notified?.['alarm.open']?.['kpi-alarm-value']).toEqual({
      warning: { color: '#111111' },
    });
  });

  it('leaves the current bindings untouched when the host save fails', async () => {
    let notified = false;
    const authoring = createHostAlarmStyleAuthoring({
      initialBindings: seed,
      save: async () => ({ ok: false, message: 'network down' }),
      onSaved: () => {
        notified = true;
      },
    });
    const before = authoring.bindings('kpi-alarm-value');
    const result = await authoring.save('kpi-alarm-value', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.message).toBe('network down');
    expect(authoring.bindings('kpi-alarm-value')).toEqual(before);
    expect(notified).toBe(false);
  });

  it('keeps the seeded bindings valid for the base authoring fields', () => {
    const components = new Map(BOARD_ALARM_DOCUMENT.components.map((item) => [item.id, item]));
    for (const [sourceId, componentBindings] of Object.entries(seed)) {
      expect(sourceId).not.toBe('');
      for (const [componentId, levels] of Object.entries(componentBindings)) {
        const component = components.get(componentId);
        expect(component, `种子绑定引用了不存在的组件：${componentId}`).toBeDefined();
        if (component === undefined) continue;
        const manifest = catalog.get(component.type)?.manifest;
        expect(manifest, `缺少 manifest：${component.type}`).toBeDefined();
        if (manifest === undefined) continue;
        const fields = new Set(designerHostStyleFields(manifest).map((field) => field.key));
        for (const [level, style] of Object.entries(levels)) {
          expect(HOST_ALARM_LEVELS).toContain(level);
          for (const [styleKey, value] of Object.entries(style)) {
            expect(fields.has(styleKey), `${component.type} 不接受样式键 ${styleKey}`).toBe(true);
            const merged = validateBaseScreenMaterialStyle(
              { ...component.style, [styleKey]: value },
              manifest.styleSchema,
            );
            expect(merged.ok, `${componentId} 的覆盖不合法：${styleKey}=${value}`).toBe(true);
          }
        }
      }
    }
  });

  it('rejects responses outside the supported shape', () => {
    expect(parseHostAlarmBindings(null)).toBeUndefined();
    expect(parseHostAlarmBindings([])).toBeUndefined();
    expect(parseHostAlarmBindings({ key: 'nope' })).toBeUndefined();
    expect(parseHostAlarmBindings({ key: { card: { fatal: { color: '#f00' } } } })).toBeUndefined();
    expect(parseHostAlarmBindings({ key: { card: { warning: { color: 1 } } } })).toBeUndefined();
  });
});

describe('base host conditional style helpers', () => {
  it('lists only style fields the target material can accept', () => {
    const flop = designerHostStyleFields(PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST);
    expect(flop.map((field) => field.key)).toEqual(['backgroundColor', 'color', 'accentColor']);
    const text = designerHostStyleFields(BASE_SCREEN_TEXT_MATERIAL_MANIFEST);
    expect(text.find((field) => field.key === 'fontWeight')).toEqual({
      key: 'fontWeight',
      label: '字重',
      control: 'select',
      values: ['400', '700'],
    });
    expect(text.some((field) => field.key === 'fontSize')).toBe(false);
  });

  it('writes, merges, and removes bindings without mutating the input', () => {
    const base = [];
    const color = withHostConditionalStyleBinding(
      base,
      'alarm.open',
      'warning',
      'color',
      '#fa8c16',
    );
    expect(base).toEqual([]);
    expect(color).toEqual([
      { sourceId: 'alarm.open', conditionId: 'warning', style: { color: '#fa8c16' } },
    ]);

    const merged = withHostConditionalStyleBinding(
      color,
      'alarm.open',
      'warning',
      'fontWeight',
      '700',
    );
    expect(merged).toEqual([
      {
        sourceId: 'alarm.open',
        conditionId: 'warning',
        style: { color: '#fa8c16', fontWeight: '700' },
      },
    ]);
    expect(color).toEqual([
      { sourceId: 'alarm.open', conditionId: 'warning', style: { color: '#fa8c16' } },
    ]);

    const oneLeft = withoutHostConditionalStyleBinding(merged, 'alarm.open', 'warning', 'color');
    expect(oneLeft).toEqual([
      { sourceId: 'alarm.open', conditionId: 'warning', style: { fontWeight: '700' } },
    ]);
    expect(
      withoutHostConditionalStyleBinding(oneLeft, 'alarm.open', 'warning', 'fontWeight'),
    ).toEqual([]);
  });
});

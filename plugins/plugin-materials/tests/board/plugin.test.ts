import {
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../../src/board/border-box.js';
import { PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST } from '../../src/board/capsule-progress.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../src/board/digital-flop.js';
import {
  BOARD_ALARM_LEVEL_COLORS,
  BOARD_BORDER_STYLES,
  BOARD_STATUS_COLORS,
  PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_BORDER_PICKER_ID,
  PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE,
  PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_BOARD_DIGITAL_FLOP_TYPE,
  PLUGIN_BOARD_MARQUEE_TAG_NAME,
  PLUGIN_BOARD_MARQUEE_TYPE,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TYPE,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  PLUGIN_BOARD_STATUS_GRID_TAG_NAME,
  PLUGIN_BOARD_STATUS_GRID_TYPE,
  PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  PLUGIN_BOARD_WATER_LEVEL_TAG_NAME,
  PLUGIN_BOARD_WATER_LEVEL_TYPE,
} from '../../src/board/identity.js';
import { PLUGIN_BOARD_MARQUEE_MANIFEST } from '../../src/board/marquee.js';
import { PLUGIN_BOARD_PIPELINE_MANIFEST } from '../../src/board/pipeline.js';
import {
  BOARD_SCALAR_VALUE_ADAPTER,
  BOARD_TEXT_VALUE_ADAPTER,
} from '../../src/board/scalar-adapter.js';
import { PLUGIN_BOARD_SCROLL_BOARD_MANIFEST } from '../../src/board/scroll-board.js';
import { PLUGIN_BOARD_STATUS_GRID_MANIFEST } from '../../src/board/status-grid.js';
import { PLUGIN_BOARD_STATUS_LEGEND_MANIFEST } from '../../src/board/status-legend.js';
import { createBoardColumnsAdapter } from '../../src/board/tabular-columns-adapter.js';
import { PLUGIN_BOARD_WATER_LEVEL_MANIFEST } from '../../src/board/water-level.js';
import { createPluginMaterialsRuntime, PLUGIN_MATERIALS_ID } from '../../src/plugin.js';

const MANIFESTS = [
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  PLUGIN_BOARD_MARQUEE_MANIFEST,
  PLUGIN_BOARD_STATUS_GRID_MANIFEST,
  PLUGIN_BOARD_STATUS_LEGEND_MANIFEST,
  PLUGIN_BOARD_PIPELINE_MANIFEST,
];

describe('plugin-board-materials manifests', () => {
  it('every material manifest parses as canonical', () => {
    for (const manifest of MANIFESTS) {
      const parsed = parseBaseScreenMaterialManifest(manifest);
      if (!parsed.ok) {
        throw new Error(
          `${manifest.type}: ${parsed.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
      expect(parsed.ok).toBe(true);
    }
  });

  it('keeps material types, tag names and the declarations consistent', () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      [PLUGIN_BOARD_DIGITAL_FLOP_TYPE, PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME],
      [PLUGIN_BOARD_SCROLL_BOARD_TYPE, PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME],
      [PLUGIN_BOARD_WATER_LEVEL_TYPE, PLUGIN_BOARD_WATER_LEVEL_TAG_NAME],
      [PLUGIN_BOARD_BORDER_BOX_TYPE, PLUGIN_BOARD_BORDER_BOX_TAG_NAME],
      [PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE, PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME],
      [PLUGIN_BOARD_MARQUEE_TYPE, PLUGIN_BOARD_MARQUEE_TAG_NAME],
      [PLUGIN_BOARD_STATUS_GRID_TYPE, PLUGIN_BOARD_STATUS_GRID_TAG_NAME],
      [PLUGIN_BOARD_STATUS_LEGEND_TYPE, PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME],
      [PLUGIN_BOARD_PIPELINE_TYPE, PLUGIN_BOARD_PIPELINE_TAG_NAME],
    ];
    expect(MANIFESTS.map((manifest) => [manifest.type, manifest.tagName])).toEqual(expected);
  });

  it('uses a board namespace so the materials cannot shadow the official library', () => {
    expect(MANIFESTS.every((manifest) => manifest.type.startsWith('board.'))).toBe(true);
  });

  it('the border box is a pure decoration: it declares no data capability', () => {
    expect(PLUGIN_BOARD_BORDER_BOX_MANIFEST.dataCapabilities).toEqual([]);
    expect(PLUGIN_BOARD_BORDER_BOX_MANIFEST.dataCapabilities.length).toBe(0);
  });

  it('the border box authorizes its own inspector control by tag name', () => {
    const fields = PLUGIN_BOARD_BORDER_BOX_MANIFEST.editorDescriptor?.appearance?.flatMap(
      (section) => section.fields,
    );
    const custom = fields?.find((field) => field.control === 'custom');
    expect(custom?.tagName).toBe(PLUGIN_BOARD_BORDER_PICKER_TAG_NAME);
    // 该控件必须同时是本插件声明的 inspectorControl，否则 Engine 会渲染降级提示。
    expect(
      createPluginMaterialsRuntime().manifest.contributions.some(
        (item) =>
          item.kind === 'inspectorControl' &&
          item.id === PLUGIN_BOARD_BORDER_PICKER_ID &&
          item.tagName === PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
      ),
    ).toBe(true);
  });

  it('the border style enum only lists styles the renderer actually implements', () => {
    const schema = PLUGIN_BOARD_BORDER_BOX_MANIFEST.propsSchema.properties.borderStyle;
    expect(schema?.kind).toBe('enum');
    expect(schema?.kind === 'enum' ? schema.values : []).toEqual([...BOARD_BORDER_STYLES]);
    expect(PLUGIN_BOARD_BORDER_BOX_MANIFEST.defaultProps.borderStyle).toBe('corner-brackets');
  });

  // 原子化组件约定：每个物料只做一件事，不内建标题/说明文字——需要标题时由文档层
  // 另放 `base.text` 组合。这条断言把"原子化"变成可执行的约束，而不是口头约定。
  it('every material is atomic: no built-in title or description props', () => {
    const forbidden = ['title', 'label', 'caption', 'description', 'name'];
    for (const manifest of MANIFESTS) {
      const propKeys = Object.keys(manifest.propsSchema.properties);
      expect(propKeys.filter((key) => forbidden.includes(key))).toEqual([]);
      expect(Object.keys(manifest.defaultProps).filter((key) => forbidden.includes(key))).toEqual(
        [],
      );
      // 面板字段同样不得出现标题类字段（否则会重新引入被移除的能力）。
      expect(
        manifest.propertyPanel.map((field) => field.prop).filter((key) => forbidden.includes(key)),
      ).toEqual([]);
    }
  });

  // scroll-board 的等级色列（ADR-0099）：「哪一列」是字段映射，经数据区 field-selector 选择；
  // 「等级 → 颜色」是语义色，属于 style，缺省回落到共用等级色板。
  it('picks the scroll level column with a field selector and keeps level colors in style', () => {
    const manifest = PLUGIN_BOARD_SCROLL_BOARD_MANIFEST;
    const required = manifest.propsSchema.required;
    expect(required).toEqual(['headerVisible', 'rowCount', 'intervalMs', 'autoScroll']);
    expect(manifest.propsSchema.properties.statusColumn?.kind).toBe('string');
    expect(manifest.propsSchema.properties).not.toHaveProperty('statusPalette');
    expect(manifest.defaultProps.statusColumn).toBe('');

    const dataFields = manifest.editorDescriptor?.data?.flatMap((section) => section.fields) ?? [];
    expect(dataFields.find((field) => field.id === 'statusColumn')).toMatchObject({
      target: 'props',
      path: ['statusColumn'],
      control: 'field-selector',
    });

    const levelKeys = ['criticalColor', 'warningColor', 'infoColor', 'unknownColor'];
    for (const key of levelKeys) {
      expect(manifest.styleSchema.properties[key]?.kind).toBe('string');
      expect(manifest.styleSchema.required).not.toContain(key);
      expect(manifest.stylePanel.some((field) => field.style === key)).toBe(true);
    }
    expect(manifest.defaultStyle).toMatchObject({
      criticalColor: BOARD_ALARM_LEVEL_COLORS.critical,
      warningColor: BOARD_ALARM_LEVEL_COLORS.warning,
      infoColor: BOARD_ALARM_LEVEL_COLORS.info,
      unknownColor: BOARD_ALARM_LEVEL_COLORS.unknown,
    });

    // 单位经 unit 声明而不写进 label（ADR-0099 §2.5）。
    const appearance = manifest.editorDescriptor?.appearance?.flatMap((section) => section.fields);
    expect(appearance?.find((field) => field.id === 'intervalMs')).toMatchObject({
      control: 'unit-number',
      unit: 'ms',
    });
    expect(manifest.propertyPanel.find((field) => field.prop === 'intervalMs')?.label).toBe(
      '轮播间隔',
    );
  });
});

describe('plugin-materials runtime', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginMaterialsRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_MATERIALS_ID);
  });

  it('declares twenty materials, two inspector controls and two palette-only commands', () => {
    const runtime = createPluginMaterialsRuntime();
    const counts = new Map<string, number>();
    for (const contribution of runtime.manifest.contributions) {
      counts.set(contribution.kind, (counts.get(contribution.kind) ?? 0) + 1);
    }
    expect(counts.get('material')).toBe(20);
    expect(counts.get('inspectorControl')).toBe(2);
    expect(counts.get('command')).toBe(2);
    // 原 metrics / pipeline 的能力面仍各有一条贡献。
    expect(counts.get('dataResourceType')).toBe(1);
    expect(counts.get('blueprintCapability')).toBe(1);
    expect(counts.get('dataProcessor')).toBe(1);
    expect(counts.get('blueprintAction')).toBe(1);
    expect(runtime.manifest.capabilities).toEqual(
      expect.arrayContaining(['command.execute', 'design.read']),
    );
    expect(Object.keys(runtime.commands ?? {})).toEqual([
      PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
      'base-screen.echarts.toggle-series-type',
    ]);
  });

  it('keeps every board material and adds the chart materials', () => {
    const runtime = createPluginMaterialsRuntime();
    const materialTypes = runtime.manifest.contributions
      .filter((item) => item.kind === 'material')
      .map((item) => (item.kind === 'material' ? item.type : ''));
    for (const manifest of MANIFESTS) expect(materialTypes).toContain(manifest.type);
    expect(materialTypes).toContain('plugin.echarts');
    expect(materialTypes).toContain('plugin.chart.line');
  });

  // 物料插件不得向设计器注入 chrome：没有左栏面板，命令也不写 menus（省略即只进命令面板）。
  it('contributes neither panels nor context-menu entries', () => {
    const runtime = createPluginMaterialsRuntime();
    expect(runtime.manifest.contributions.some((item) => item.kind === 'panel')).toBe(false);
    for (const contribution of runtime.manifest.contributions) {
      if (contribution.kind === 'command') expect(contribution.menus).toBeUndefined();
    }
  });

  it('binds the two new materials by role with string+number value types', () => {
    // 角色声明错（例如漏掉 number）会让 dataset 绑定被 validateScreenHostResourceBinding 拒绝。
    expect(PLUGIN_BOARD_STATUS_GRID_MANIFEST.dataBinding?.roles).toEqual([
      { id: 'items', minFields: 2, maxFields: 3, valueTypes: ['string', 'number'] },
    ]);
    expect(PLUGIN_BOARD_PIPELINE_MANIFEST.dataBinding?.roles).toEqual([
      { id: 'stages', minFields: 2, maxFields: 3, valueTypes: ['string', 'number'] },
    ]);
    // 静态数据与数据集共用同一 adapter：defaultBinding 必须与角色 id 对齐。
    expect(PLUGIN_BOARD_STATUS_GRID_MANIFEST.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { items: ['name', 'status', 'load'] } },
    });
    expect(PLUGIN_BOARD_PIPELINE_MANIFEST.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { stages: ['name', 'status', 'throughput'] } },
    });
    // 本轮不给事件：tileClick / nodeClick 是 P1/P2，声明了却没有通道等于空承诺。
    expect(PLUGIN_BOARD_STATUS_GRID_MANIFEST.events).toEqual([]);
    expect(PLUGIN_BOARD_PIPELINE_MANIFEST.events).toEqual([]);
  });

  it('gives the two new materials flat status palette keys with palette defaults', () => {
    const paletteKeys: ReadonlyArray<readonly [string, keyof typeof BOARD_STATUS_COLORS]> = [
      ['runningColor', 'running'],
      ['standbyColor', 'standby'],
      ['faultColor', 'fault'],
      ['offlineColor', 'offline'],
      ['unknownColor', 'unknown'],
    ];
    for (const manifest of [PLUGIN_BOARD_STATUS_GRID_MANIFEST, PLUGIN_BOARD_PIPELINE_MANIFEST]) {
      for (const [styleKey, statusKey] of paletteKeys) {
        // 五态色默认值必须来自 identity.ts 的唯一来源，不能各写一份十六进制字面量。
        expect(manifest.defaultStyle[styleKey]).toBe(BOARD_STATUS_COLORS[statusKey]);
        expect(manifest.styleSchema.properties[styleKey]?.kind).toBe('string');
        expect(manifest.styleSchema.required).toContain(styleKey);
        expect(manifest.stylePanel.map((field) => field.style)).toContain(styleKey);
      }
    }
    // 状态图例同源但非必填：未写五态色的图例回落到同一份默认值。
    for (const [styleKey, statusKey] of paletteKeys) {
      expect(PLUGIN_BOARD_STATUS_LEGEND_MANIFEST.defaultStyle[styleKey]).toBe(
        BOARD_STATUS_COLORS[statusKey],
      );
      expect(PLUGIN_BOARD_STATUS_LEGEND_MANIFEST.styleSchema.required).not.toContain(styleKey);
    }
  });

  // ADR-0099：五态分布图例是独立原子，灯阵不再内建图例。
  it('splits the status legend out of the status grid', () => {
    const grid = PLUGIN_BOARD_STATUS_GRID_MANIFEST;
    expect(grid.propsSchema.properties).not.toHaveProperty('showLegend');
    expect(grid.styleSchema.properties).not.toHaveProperty('legendColor');
    // 工序链从不渲染图例：同名无效键一并移除。
    expect(PLUGIN_BOARD_PIPELINE_MANIFEST.styleSchema.properties).not.toHaveProperty('legendColor');

    const legend = PLUGIN_BOARD_STATUS_LEGEND_MANIFEST;
    expect(legend.dataBinding?.roles).toEqual([
      { id: 'status', minFields: 1, maxFields: 1, valueTypes: ['string'] },
    ]);
    expect(legend.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { status: ['status'] } },
    });
    expect(legend.dataCapabilities).toEqual(grid.dataCapabilities);
  });

  it('cycles the focused border box through every declared style and stays undoable', async () => {
    const runtime = createPluginMaterialsRuntime();
    const executed: unknown[] = [];
    // 用一个真实的 border-box 组件驱动命令：它读快照、在样式表里轮换、经端口提交事务。
    const document = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        {
          id: 'frame-1',
          type: PLUGIN_BOARD_BORDER_BOX_TYPE,
          name: '边框',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 480, height: 300 },
          rotation: 0,
          zIndex: 1,
          status: { locked: false, hidden: false },
          props: { borderStyle: 'plain', bracketSize: 22 },
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    runtime.activate({
      commandPort: {
        async execute(request: { readonly commandId: string; readonly args: unknown }) {
          executed.push(request);
          return { ok: true as const, value: null, diagnostics: [] };
        },
      },
      designReadPort: {
        async read() {
          return {
            ok: true as const,
            value: { document, selectedComponentIds: ['frame-1'], focusedComponentId: 'frame-1' },
            diagnostics: [],
          };
        },
      },
    } as never);

    const command = runtime.commands?.[PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID];
    if (command === undefined) throw new Error('command is missing');
    await command(null as never);
    await command({ borderStyle: 'notch' } as never);

    // props 是整体替换：patch 必须带上组件当前其余字段，否则 schema 必填项会被抹掉。
    const expected = (borderStyle: string) => ({
      commandId: 'update-components',
      args: {
        componentIds: ['frame-1'],
        patch: { props: { borderStyle, bracketSize: 22 } },
      },
    });
    expect(executed).toEqual([expected('corner-brackets'), expected('notch')]);
  });

  it('refuses to act when the focused component is not a border box', async () => {
    const runtime = createPluginMaterialsRuntime();
    runtime.activate({
      commandPort: {
        async execute() {
          throw new Error('the port must not be reached');
        },
      },
      designReadPort: {
        async read() {
          return {
            ok: true as const,
            value: {
              document: {
                canvas: { width: 960, height: 540, backgroundColor: '#000000' },
                components: [
                  {
                    id: 'text-1',
                    type: 'base.text',
                    name: 't',
                    parentId: null,
                    position: { x: 0, y: 0 },
                    size: { width: 10, height: 10 },
                    rotation: 0,
                    zIndex: 1,
                    status: { locked: false, hidden: false },
                    props: {},
                    style: {},
                    dataSource: null,
                  },
                ],
                variables: [],
                blueprint: { rules: [] },
              },
              selectedComponentIds: ['text-1'],
              focusedComponentId: 'text-1',
            },
            diagnostics: [],
          };
        },
      },
    } as never);

    const result = await runtime.commands?.[PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID]?.(null as never);
    expect(result?.ok).toBe(false);
    // 归因要指向"选错了组件"，而不是泛化的会话失效码。
    expect(result?.ok === false ? result.diagnostics[0]?.code : undefined).toBe(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
    );
  });
});

describe('board tabular adapters', () => {
  const numberField = { id: 'value', label: '当前值', valueType: 'number' as const };

  it('projects the first row into a scalar number', () => {
    const result = BOARD_SCALAR_VALUE_ADAPTER.adapt({
      dataset: { fields: [numberField], rows: [{ value: 42.5 }, { value: 7 }] },
      fields: { value: [numberField] },
    });
    expect(result.ok).toBe(true);
    // 标量物料直接读 dataState.value，因此投影必须是数字本身，不能再包一层。
    expect(result.ok ? result.value : undefined).toBe(42.5);
  });

  it('accepts numeric strings and rejects non-numeric values', () => {
    const stringField = { id: 'value', label: '当前值', valueType: 'string' as const };
    const accepted = BOARD_SCALAR_VALUE_ADAPTER.adapt({
      dataset: { fields: [stringField], rows: [{ value: '88.5' }] },
      fields: { value: [stringField] },
    });
    expect(accepted.ok ? accepted.value : undefined).toBe(88.5);

    const rejected = BOARD_SCALAR_VALUE_ADAPTER.adapt({
      dataset: { fields: [stringField], rows: [{ value: 'n/a' }] },
      fields: { value: [stringField] },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.ok === false ? rejected.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );
  });

  it('joins every row for text materials such as the marquee', () => {
    const nameField = { id: 'name', label: '区域', valueType: 'string' as const };
    const result = BOARD_TEXT_VALUE_ADAPTER.adapt({
      dataset: {
        fields: [nameField],
        rows: [{ name: '华东' }, { name: '华南' }, { name: null }],
      },
      fields: { value: [nameField] },
    });
    expect(result.ok ? result.value : undefined).toBe('华东 · 华南');
  });

  // 共用列投影工厂：scroll-board / status-grid / pipeline 都走它。
  it('projects tabular roles through the shared columns adapter', () => {
    const nameField = { id: 'name', label: '名称', valueType: 'string' as const };
    const statusField = { id: 'status', label: '状态', valueType: 'string' as const };
    const loadField = { id: 'load', label: '负载', valueType: 'number' as const };
    const adapter = createBoardColumnsAdapter('items');

    const result = adapter.adapt({
      dataset: {
        // dataset 的字段顺序与绑定顺序不同：列顺序必须按绑定顺序，不能按 dataset 顺序。
        fields: [statusField, nameField, loadField],
        rows: [{ name: '冲压-01', status: 'running', load: 72, extra: 'ignored' }],
        totalRowCount: 9,
      },
      fields: { items: [nameField, statusField, loadField] },
    });

    if (!result.ok) throw new Error('the adapter must accept a valid binding');
    const value = result.value as unknown as {
      readonly columns: readonly { readonly id: string; readonly valueType: string }[];
      readonly rows: readonly Record<string, unknown>[];
      readonly totalRowCount?: number;
    };
    expect(value.columns.map((column) => column.id)).toEqual(['name', 'status', 'load']);
    expect(value.columns.map((column) => column.valueType)).toEqual(['string', 'string', 'number']);
    // 未绑定字段不得漏进视图模型，缺失字段补 null。
    expect(Object.keys(value.rows[0] ?? {})).toEqual(['name', 'status', 'load']);
    expect(value.totalRowCount).toBe(9);
  });

  it('fails closed when the bound role has no fields', () => {
    const result = createBoardColumnsAdapter('items').adapt({
      dataset: { fields: [], rows: [] },
      fields: {},
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );
  });
});

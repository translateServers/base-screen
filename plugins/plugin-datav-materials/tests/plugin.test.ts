import {
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { PLUGIN_DATAV_BORDER_BOX_MANIFEST } from '../src/border-box.js';
import { PLUGIN_DATAV_CAPSULE_PROGRESS_MANIFEST } from '../src/capsule-progress.js';
import { PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST } from '../src/digital-flop.js';
import {
  DATAV_BORDER_STYLES,
  DATAV_STATUS_COLORS,
  PLUGIN_DATAV_BORDER_BOX_TAG_NAME,
  PLUGIN_DATAV_BORDER_BOX_TYPE,
  PLUGIN_DATAV_BORDER_PICKER_ID,
  PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
  PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_DATAV_CAPSULE_PROGRESS_TYPE,
  PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_DATAV_DIGITAL_FLOP_TYPE,
  PLUGIN_DATAV_ID,
  PLUGIN_DATAV_MARQUEE_TAG_NAME,
  PLUGIN_DATAV_MARQUEE_TYPE,
  PLUGIN_DATAV_PIPELINE_TAG_NAME,
  PLUGIN_DATAV_PIPELINE_TYPE,
  PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME,
  PLUGIN_DATAV_SCROLL_BOARD_TYPE,
  PLUGIN_DATAV_STATUS_GRID_TAG_NAME,
  PLUGIN_DATAV_STATUS_GRID_TYPE,
  PLUGIN_DATAV_WATER_LEVEL_TAG_NAME,
  PLUGIN_DATAV_WATER_LEVEL_TYPE,
} from '../src/identity.js';
import { PLUGIN_DATAV_MARQUEE_MANIFEST } from '../src/marquee.js';
import { PLUGIN_DATAV_PIPELINE_MANIFEST } from '../src/pipeline.js';
import { createPluginDatavRuntime } from '../src/plugin.js';
import { DATAV_SCALAR_VALUE_ADAPTER, DATAV_TEXT_VALUE_ADAPTER } from '../src/scalar-adapter.js';
import { PLUGIN_DATAV_SCROLL_BOARD_MANIFEST } from '../src/scroll-board.js';
import { PLUGIN_DATAV_STATUS_GRID_MANIFEST } from '../src/status-grid.js';
import { createDatavColumnsAdapter } from '../src/tabular-columns-adapter.js';
import { PLUGIN_DATAV_WATER_LEVEL_MANIFEST } from '../src/water-level.js';

const MANIFESTS = [
  PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST,
  PLUGIN_DATAV_SCROLL_BOARD_MANIFEST,
  PLUGIN_DATAV_WATER_LEVEL_MANIFEST,
  PLUGIN_DATAV_BORDER_BOX_MANIFEST,
  PLUGIN_DATAV_CAPSULE_PROGRESS_MANIFEST,
  PLUGIN_DATAV_MARQUEE_MANIFEST,
  PLUGIN_DATAV_STATUS_GRID_MANIFEST,
  PLUGIN_DATAV_PIPELINE_MANIFEST,
];

describe('plugin-datav-materials manifests', () => {
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
      [PLUGIN_DATAV_DIGITAL_FLOP_TYPE, PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME],
      [PLUGIN_DATAV_SCROLL_BOARD_TYPE, PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME],
      [PLUGIN_DATAV_WATER_LEVEL_TYPE, PLUGIN_DATAV_WATER_LEVEL_TAG_NAME],
      [PLUGIN_DATAV_BORDER_BOX_TYPE, PLUGIN_DATAV_BORDER_BOX_TAG_NAME],
      [PLUGIN_DATAV_CAPSULE_PROGRESS_TYPE, PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME],
      [PLUGIN_DATAV_MARQUEE_TYPE, PLUGIN_DATAV_MARQUEE_TAG_NAME],
      [PLUGIN_DATAV_STATUS_GRID_TYPE, PLUGIN_DATAV_STATUS_GRID_TAG_NAME],
      [PLUGIN_DATAV_PIPELINE_TYPE, PLUGIN_DATAV_PIPELINE_TAG_NAME],
    ];
    expect(MANIFESTS.map((manifest) => [manifest.type, manifest.tagName])).toEqual(expected);
  });

  it('uses a datav namespace so the materials cannot shadow the official library', () => {
    expect(MANIFESTS.every((manifest) => manifest.type.startsWith('datav.'))).toBe(true);
  });

  it('the border box is a pure decoration: it declares no data capability', () => {
    expect(PLUGIN_DATAV_BORDER_BOX_MANIFEST.dataCapabilities).toEqual([]);
    expect(PLUGIN_DATAV_BORDER_BOX_MANIFEST.dataCapabilities.length).toBe(0);
  });

  it('the border box authorizes its own inspector control by tag name', () => {
    const fields = PLUGIN_DATAV_BORDER_BOX_MANIFEST.editorDescriptor?.appearance?.flatMap(
      (section) => section.fields,
    );
    const custom = fields?.find((field) => field.control === 'custom');
    expect(custom?.tagName).toBe(PLUGIN_DATAV_BORDER_PICKER_TAG_NAME);
    // 该控件必须同时是本插件声明的 inspectorControl，否则 Engine 会渲染降级提示。
    expect(
      createPluginDatavRuntime().manifest.contributions.some(
        (item) =>
          item.kind === 'inspectorControl' &&
          item.id === PLUGIN_DATAV_BORDER_PICKER_ID &&
          item.tagName === PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
      ),
    ).toBe(true);
  });

  it('the border style enum only lists styles the renderer actually implements', () => {
    const schema = PLUGIN_DATAV_BORDER_BOX_MANIFEST.propsSchema.properties.borderStyle;
    expect(schema?.kind).toBe('enum');
    expect(schema?.kind === 'enum' ? schema.values : []).toEqual([...DATAV_BORDER_STYLES]);
    expect(PLUGIN_DATAV_BORDER_BOX_MANIFEST.defaultProps.borderStyle).toBe('corner-brackets');
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

  // scroll-board 的等级色列：两个新 prop 必须**非必填**——一旦进 required，现有销售
  // 大屏种子与三端冒烟的 props 校验会立刻失败（旧文档里没有这两个键）。
  it('keeps the scroll board status props optional, declared and panel-editable', () => {
    const manifest = PLUGIN_DATAV_SCROLL_BOARD_MANIFEST;
    const required = manifest.propsSchema.required;
    expect(required).not.toContain('statusColumn');
    expect(required).not.toContain('statusPalette');

    const properties = manifest.propsSchema.properties;
    expect(properties.statusColumn?.kind).toBe('string');
    const palette = properties.statusPalette;
    expect(palette?.kind).toBe('object');
    if (palette?.kind !== 'object') throw new Error('statusPalette must be an object schema');
    // 只允许 4 个固定键：等级色板是枚举语义，不是自由字典（schema 不支持子字段控件）。
    expect(Object.keys(palette.properties)).toEqual(['critical', 'warning', 'info', 'default']);
    expect(palette.required).toEqual([]);

    // 原子化门禁的另一半：渲染路径读取的键必须同时出现在 propsSchema 与面板里。
    const panelProps = manifest.propertyPanel.map((field) => field.prop);
    expect(panelProps).toContain('statusColumn');
    expect(panelProps).toContain('statusPalette');
    expect(panelProps.filter((prop) => prop === 'statusPalette')).toHaveLength(1);
    expect(manifest.propertyPanel.find((field) => field.prop === 'statusPalette')?.control).toBe(
      'json',
    );

    // 旧文档的 props（只有原来 4 个键）依然覆盖 schema 的全部必填项 ⇒ manifest 校验通过。
    const legacyProps = { headerVisible: true, rowCount: 5, intervalMs: 3000, autoScroll: true };
    expect(required).toHaveLength(4);
    expect(required.every((key) => Object.hasOwn(legacyProps, key))).toBe(true);

    // 默认值必须是「不启用」：这是「不传两个 prop 时 DOM 与扩展前逐字一致」的前提。
    expect(manifest.defaultProps.statusColumn).toBe('');
    expect(manifest.defaultProps.statusPalette).toEqual({});
  });
});

describe('plugin-datav-materials runtime', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginDatavRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_DATAV_ID);
  });

  it('declares eight materials, one inspector control and one command', () => {
    const runtime = createPluginDatavRuntime();
    expect(runtime.manifest.contributions.map((item) => item.kind)).toEqual([
      'material',
      'material',
      'material',
      'material',
      'material',
      'material',
      'material',
      'material',
      'inspectorControl',
      'command',
    ]);
    expect(runtime.manifest.capabilities).toEqual(['command.execute', 'design.read']);
    expect(Object.keys(runtime.commands ?? {})).toEqual([PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID]);
    // 两个新物料必须在 contributions 里：漏了会在宿主 preflight 阶段
    // 直接 HOST_PLUGIN_PREFLIGHT_FAILED（清单声明与元素注册不一致）。
    const materialTypes = runtime.manifest.contributions
      .filter((item) => item.kind === 'material')
      .map((item) => (item.kind === 'material' ? item.type : ''));
    expect(materialTypes).toContain(PLUGIN_DATAV_STATUS_GRID_TYPE);
    expect(materialTypes).toContain(PLUGIN_DATAV_PIPELINE_TYPE);
  });

  it('binds the two new materials by role with string+number value types', () => {
    // 角色声明错（例如漏掉 number）会让 dataset 绑定被 validateScreenHostResourceBinding 拒绝。
    expect(PLUGIN_DATAV_STATUS_GRID_MANIFEST.dataBinding?.roles).toEqual([
      { id: 'items', minFields: 2, maxFields: 3, valueTypes: ['string', 'number'] },
    ]);
    expect(PLUGIN_DATAV_PIPELINE_MANIFEST.dataBinding?.roles).toEqual([
      { id: 'stages', minFields: 2, maxFields: 3, valueTypes: ['string', 'number'] },
    ]);
    // 静态数据与数据集共用同一 adapter：defaultBinding 必须与角色 id 对齐。
    expect(PLUGIN_DATAV_STATUS_GRID_MANIFEST.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { items: ['name', 'status', 'load'] } },
    });
    expect(PLUGIN_DATAV_PIPELINE_MANIFEST.staticData).toEqual({
      kind: 'tabular',
      defaultBinding: { fields: { stages: ['name', 'status', 'throughput'] } },
    });
    // 本轮不给事件：tileClick / nodeClick 是 P1/P2，声明了却没有通道等于空承诺。
    expect(PLUGIN_DATAV_STATUS_GRID_MANIFEST.events).toEqual([]);
    expect(PLUGIN_DATAV_PIPELINE_MANIFEST.events).toEqual([]);
  });

  it('gives the two new materials flat status palette keys with palette defaults', () => {
    const paletteKeys: ReadonlyArray<readonly [string, keyof typeof DATAV_STATUS_COLORS]> = [
      ['runningColor', 'running'],
      ['standbyColor', 'standby'],
      ['faultColor', 'fault'],
      ['offlineColor', 'offline'],
      ['unknownColor', 'unknown'],
    ];
    for (const manifest of [PLUGIN_DATAV_STATUS_GRID_MANIFEST, PLUGIN_DATAV_PIPELINE_MANIFEST]) {
      for (const [styleKey, statusKey] of paletteKeys) {
        // 五态色默认值必须来自 identity.ts 的唯一来源，不能各写一份十六进制字面量。
        expect(manifest.defaultStyle[styleKey]).toBe(DATAV_STATUS_COLORS[statusKey]);
        expect(manifest.styleSchema.properties[styleKey]?.kind).toBe('string');
        expect(manifest.styleSchema.required).toContain(styleKey);
        expect(manifest.stylePanel.map((field) => field.style)).toContain(styleKey);
      }
    }
  });

  it('cycles the focused border box through every declared style and stays undoable', async () => {
    const runtime = createPluginDatavRuntime();
    const executed: unknown[] = [];
    // 用一个真实的 border-box 组件驱动命令：它读快照、在样式表里轮换、经端口提交事务。
    const document = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        {
          id: 'frame-1',
          type: PLUGIN_DATAV_BORDER_BOX_TYPE,
          name: '边框',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 480, height: 300 },
          rotation: 0,
          zIndex: 1,
          status: { locked: false, hidden: false },
          props: { borderStyle: 'plain', bracketSize: 22, lineWidth: 2 },
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

    const command = runtime.commands?.[PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID];
    if (command === undefined) throw new Error('command is missing');
    await command(null as never);
    await command({ borderStyle: 'notch' } as never);

    // props 是整体替换：patch 必须带上组件当前其余字段，否则 schema 必填项会被抹掉。
    const expected = (borderStyle: string) => ({
      commandId: 'update-components',
      args: {
        componentIds: ['frame-1'],
        patch: { props: { borderStyle, bracketSize: 22, lineWidth: 2 } },
      },
    });
    expect(executed).toEqual([expected('corner-brackets'), expected('notch')]);
  });

  it('refuses to act when the focused component is not a border box', async () => {
    const runtime = createPluginDatavRuntime();
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

    const result = await runtime.commands?.[PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID]?.(null as never);
    expect(result?.ok).toBe(false);
    // 归因要指向"选错了组件"，而不是泛化的会话失效码。
    expect(result?.ok === false ? result.diagnostics[0]?.code : undefined).toBe(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
    );
  });
});

describe('datav tabular adapters', () => {
  const numberField = { id: 'value', label: '当前值', valueType: 'number' as const };

  it('projects the first row into a scalar number', () => {
    const result = DATAV_SCALAR_VALUE_ADAPTER.adapt({
      dataset: { fields: [numberField], rows: [{ value: 42.5 }, { value: 7 }] },
      fields: { value: [numberField] },
    });
    expect(result.ok).toBe(true);
    // 标量物料直接读 dataState.value，因此投影必须是数字本身，不能再包一层。
    expect(result.ok ? result.value : undefined).toBe(42.5);
  });

  it('accepts numeric strings and rejects non-numeric values', () => {
    const stringField = { id: 'value', label: '当前值', valueType: 'string' as const };
    const accepted = DATAV_SCALAR_VALUE_ADAPTER.adapt({
      dataset: { fields: [stringField], rows: [{ value: '88.5' }] },
      fields: { value: [stringField] },
    });
    expect(accepted.ok ? accepted.value : undefined).toBe(88.5);

    const rejected = DATAV_SCALAR_VALUE_ADAPTER.adapt({
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
    const result = DATAV_TEXT_VALUE_ADAPTER.adapt({
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
    const adapter = createDatavColumnsAdapter('items');

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
    const result = createDatavColumnsAdapter('items').adapt({
      dataset: { fields: [], rows: [] },
      fields: {},
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );
  });
});

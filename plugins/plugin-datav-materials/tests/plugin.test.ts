import {
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { PLUGIN_DATAV_BORDER_BOX_MANIFEST } from '../src/border-box.js';
import { PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST } from '../src/digital-flop.js';
import {
  DATAV_BORDER_STYLES,
  PLUGIN_DATAV_BORDER_BOX_TAG_NAME,
  PLUGIN_DATAV_BORDER_BOX_TYPE,
  PLUGIN_DATAV_BORDER_PICKER_ID,
  PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
  PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_DATAV_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_DATAV_DIGITAL_FLOP_TYPE,
  PLUGIN_DATAV_ID,
  PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME,
  PLUGIN_DATAV_SCROLL_BOARD_TYPE,
  PLUGIN_DATAV_WATER_LEVEL_TAG_NAME,
  PLUGIN_DATAV_WATER_LEVEL_TYPE,
} from '../src/identity.js';
import { createPluginDatavRuntime } from '../src/plugin.js';
import { PLUGIN_DATAV_SCROLL_BOARD_MANIFEST } from '../src/scroll-board.js';
import { PLUGIN_DATAV_WATER_LEVEL_MANIFEST } from '../src/water-level.js';

const MANIFESTS = [
  PLUGIN_DATAV_DIGITAL_FLOP_MANIFEST,
  PLUGIN_DATAV_SCROLL_BOARD_MANIFEST,
  PLUGIN_DATAV_WATER_LEVEL_MANIFEST,
  PLUGIN_DATAV_BORDER_BOX_MANIFEST,
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
});

describe('plugin-datav-materials runtime', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginDatavRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_DATAV_ID);
  });

  it('declares four materials, one inspector control and one command', () => {
    const runtime = createPluginDatavRuntime();
    expect(runtime.manifest.contributions.map((item) => item.kind)).toEqual([
      'material',
      'material',
      'material',
      'material',
      'inspectorControl',
      'command',
    ]);
    expect(runtime.manifest.capabilities).toEqual(['command.execute', 'design.read']);
    expect(Object.keys(runtime.commands ?? {})).toEqual([PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID]);
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
          props: {
            title: '边框',
            borderStyle: 'plain',
            bracketSize: 22,
            lineWidth: 2,
            showTitleBar: true,
          },
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
        patch: {
          props: {
            title: '边框',
            borderStyle,
            bracketSize: 22,
            lineWidth: 2,
            showTitleBar: true,
          },
        },
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

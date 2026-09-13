import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialConstructor,
  type BaseScreenPluginPanelElement,
  createBaseScreenMaterialCatalog,
  createBaseScreenPluginCatalog,
  parseBaseScreenMaterialEventDetail,
  parseBaseScreenMaterialManifest,
  parseBaseScreenPluginManifest,
  parseBaseScreenPluginPanelActionDetail,
  parsePluginCommandRequest,
  validateBaseScreenMaterialIdentity,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '../src/index.js';

function materialManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'acme.kpi-card',
    tagName: 'acme-kpi-card',
    name: 'KPI Card',
    category: 'Charts',
    keywords: ['kpi', 'metric'],
    defaultSize: { width: 320, height: 160 },
    defaultProps: { title: 'Revenue', threshold: 80 },
    defaultStyle: { color: '#00ff00' },
    styleSchema: {
      kind: 'object',
      properties: { color: { kind: 'string' } },
      required: ['color'],
    },
    stylePanel: [{ style: 'color', label: 'Color', control: 'color' }],
    propsSchema: {
      kind: 'object',
      properties: {
        title: { kind: 'string', minLength: 1 },
        threshold: { kind: 'number', minimum: 0, maximum: 100 },
      },
      required: ['title'],
    },
    propertyPanel: [
      { prop: 'title', label: 'Title', control: 'text' },
      { prop: 'threshold', label: 'Threshold', control: 'number' },
    ],
    events: ['valueClick'],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

function pluginManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.analytics',
    dependencies: [],
    capabilities: ['command.execute'],
    contributions: [
      {
        kind: 'material',
        type: 'acme.kpi-card',
        tagName: 'acme-kpi-card',
      },
      {
        kind: 'command',
        id: 'refresh',
        name: 'Refresh',
        requiredCapability: 'command.execute',
      },
    ],
    ...overrides,
  };
}

describe('material identity and manifests', () => {
  it('parses a strict detached material manifest', () => {
    const input = materialManifest();
    const result = parseBaseScreenMaterialManifest(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
      expect(result.value).not.toBe(input);
      expect(result.value.defaultProps).not.toBe(input.defaultProps);
    }
  });

  it('rejects malformed type/tag bindings and unknown fields', () => {
    const identity = validateBaseScreenMaterialIdentity('acme.kpi-card', 'acme');
    const manifest = parseBaseScreenMaterialManifest(materialManifest({ unrecognized: true }));

    expect(identity.ok).toBe(false);
    if (!identity.ok) {
      expect(identity.diagnostics[0]?.code).toBe('PLUGIN_CORE_TAG_NAME_INVALID');
    }
    expect(manifest.ok).toBe(false);
    if (!manifest.ok) {
      expect(manifest.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD');
    }
  });

  it('R1 treats libraryVisible as optional and defaults to visible', () => {
    const result = parseBaseScreenMaterialManifest(materialManifest());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.libraryVisible).toBeUndefined();
  });

  it('allows a manifest without the optional dataBinding declaration', () => {
    const result = parseBaseScreenMaterialManifest(materialManifest());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.dataBinding).toBeUndefined();
  });

  it('R3 accepts strict data binding roles and rejects invalid role declarations', () => {
    const valid = parseBaseScreenMaterialManifest(
      materialManifest({
        dataBinding: {
          roles: [
            { id: 'columns', minFields: 1, maxFields: 256, valueTypes: ['string', 'number'] },
          ],
        },
      }),
    );
    const invalid = parseBaseScreenMaterialManifest(
      materialManifest({
        dataBinding: {
          roles: [{ id: 'columns', minFields: 2, maxFields: 1, valueTypes: ['unknown'] }],
        },
      }),
    );
    expect(valid).toMatchObject({ ok: true });
    expect(invalid).toMatchObject({ ok: false });
    if (!invalid.ok) {
      expect(
        invalid.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID'),
      ).toBe(true);
    }
  });

  it('R1 accepts an explicit boolean libraryVisible', () => {
    const result = parseBaseScreenMaterialManifest(materialManifest({ libraryVisible: false }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.libraryVisible).toBe(false);
  });

  it('R1 rejects a non-boolean libraryVisible', () => {
    const result = parseBaseScreenMaterialManifest(materialManifest({ libraryVisible: 'no' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.path[0] === 'libraryVisible')).toBe(true);
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
  });

  it('R7 accepts an optional detached defaultData sample', () => {
    const result = parseBaseScreenMaterialManifest(
      materialManifest({ defaultData: { columns: [], rows: [{ sample: true }] } }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultData).toEqual({ columns: [], rows: [{ sample: true }] });
    }
    const without = parseBaseScreenMaterialManifest(materialManifest());
    expect(without.ok).toBe(true);
    if (without.ok) expect(without.value.defaultData).toBeUndefined();
  });

  it('accepts scalar static data and fails closed on a mismatched default value', () => {
    const valid = parseBaseScreenMaterialManifest(
      materialManifest({
        defaultData: 'hello',
        staticData: { kind: 'scalar', valueType: 'string', multiline: true },
      }),
    );
    const invalid = parseBaseScreenMaterialManifest(
      materialManifest({
        defaultData: 42,
        staticData: { kind: 'scalar', valueType: 'string' },
      }),
    );

    expect(valid).toMatchObject({ ok: true });
    expect(invalid).toMatchObject({ ok: false });
  });

  it('accepts canonical tabular defaults with a role-safe default binding', () => {
    const manifest = parseBaseScreenMaterialManifest(
      materialManifest({
        dataBinding: {
          roles: [
            { id: 'dimension', minFields: 1, maxFields: 1, valueTypes: ['string'] },
            { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
          ],
        },
        defaultData: {
          fields: [
            { id: 'region', label: 'Region', valueType: 'string', nullable: false },
            { id: 'amount', label: 'Amount', valueType: 'number', nullable: false },
          ],
          rows: [{ region: 'North', amount: 42 }],
        },
        staticData: {
          kind: 'tabular',
          defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
        },
      }),
    );
    const invalidBinding = parseBaseScreenMaterialManifest({
      ...(manifest.ok ? manifest.value : {}),
      staticData: {
        kind: 'tabular',
        defaultBinding: { fields: { dimension: ['amount'], measures: ['missing'] } },
      },
    });

    expect(manifest).toMatchObject({ ok: true });
    expect(invalidBinding).toMatchObject({ ok: false });
  });

  it('R7 rejects unsafe defaultData without invoking it', () => {
    let invoked = false;
    const unsafe = materialManifest({
      defaultData: Object.defineProperty({}, 'rows', {
        enumerable: true,
        get() {
          invoked = true;
          return [];
        },
      }),
    });

    expect(parseBaseScreenMaterialManifest(unsafe).ok).toBe(false);
    expect(invoked).toBe(false);
  });

  it('rejects unsafe data and default props that do not match the schema', () => {
    let invoked = false;
    const unsafe = materialManifest({
      defaultProps: Object.defineProperty({}, 'title', {
        enumerable: true,
        get() {
          invoked = true;
          return 'Revenue';
        },
      }),
    });
    const mismatch = parseBaseScreenMaterialManifest(
      materialManifest({ defaultProps: { threshold: 101 } }),
    );

    expect(parseBaseScreenMaterialManifest(unsafe).ok).toBe(false);
    expect(invoked).toBe(false);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.diagnostics.some((item) => item.path[0] === 'defaultProps')).toBe(true);
    }
  });

  it('rejects executable, cyclic, and dangerous Manifest data without invoking it', () => {
    let invoked = false;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const dangerous = {} as Record<string, unknown>;
    Object.defineProperty(dangerous, '__proto__', { enumerable: true, value: 'unsafe' });
    const manifests = [
      materialManifest({ defaultStyle: { render: () => (invoked = true) } }),
      materialManifest({ defaultStyle: cyclic }),
      materialManifest({ defaultStyle: dangerous }),
    ];

    for (const input of manifests) {
      expect(parseBaseScreenMaterialManifest(input).ok).toBe(false);
    }
    expect(invoked).toBe(false);
  });

  it('applies the material manifest resource budget before cloning', () => {
    const result = parseBaseScreenMaterialManifest(
      materialManifest({ defaultStyle: { value: 'a'.repeat(256 * 1024) } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIMIT_EXCEEDED');
    }
  });

  it('validates props through the manifest schema and returns detached JSON', () => {
    const manifest = parseBaseScreenMaterialManifest(materialManifest());
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      return;
    }
    const props = { title: 'Revenue', threshold: 50 };
    const result = validateBaseScreenMaterialProps(props, manifest.value.propsSchema);
    props.title = 'Changed';

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'Revenue', threshold: 50 });
    }
    expect(validateBaseScreenMaterialProps({ title: '' }, manifest.value.propsSchema).ok).toBe(
      false,
    );
    expect(
      validateBaseScreenMaterialStyle({ color: '#ff0000' }, manifest.value.styleSchema).ok,
    ).toBe(true);
  });

  it('rejects style panels that do not declare an editable style key', () => {
    const result = parseBaseScreenMaterialManifest(
      materialManifest({ stylePanel: [{ style: 'missing', label: 'Missing', control: 'color' }] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.path.join('.') === 'stylePanel.0.style')).toBe(
        true,
      );
    }
  });

  it('accepts explicit gradient capability only on color panel controls', () => {
    const supported = parseBaseScreenMaterialManifest(
      materialManifest({
        stylePanel: [{ style: 'color', label: 'Color', control: 'color', allowGradient: true }],
      }),
    );
    const wrongType = parseBaseScreenMaterialManifest(
      materialManifest({
        stylePanel: [{ style: 'color', label: 'Color', control: 'color', allowGradient: 'yes' }],
      }),
    );
    const wrongControl = parseBaseScreenMaterialManifest(
      materialManifest({
        stylePanel: [{ style: 'color', label: 'Color', control: 'text', allowGradient: true }],
      }),
    );

    expect(supported).toMatchObject({ ok: true });
    expect(wrongType).toMatchObject({ ok: false });
    expect(wrongControl).toMatchObject({ ok: false });
  });
});

describe('material manifest cover', () => {
  const validCovers = [
    'https://cdn.example.com/a.png',
    'http://x/y.png',
    'https://x/y.png?v=1#frag',
    '/assets/x.png',
    './x.png',
    '../x.png',
    '//cdn.example.com/x.png',
    `https://x/${'a'.repeat(2038)}`, // 恰好 2048 码点（上限边界）
  ];
  const invalidCovers: unknown[] = [
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'blob:https://x/id',
    'file:///etc/passwd',
    'ftp://x/y.png',
    'a.png', // 裸相对路径
    '', // 空串
    'x'.repeat(2049), // 超上限
    'https://a b.com/x.png', // 含空白
    'https://x/\u0000.png', // C0 控制字符
    'https://x/\u009f.png', // C1 控制字符
    '/', // 裸根相对
    './', // 裸点相对
    '//', // 裸协议相对
    '///x', // 三斜杠
    'https://', // 空 authority
    'https:///x', // authority 首字符为 /
    'http://?x', // authority 首字符为 ?
    '/\\x', // 反斜杠
    'https://x\\y.png', // 路径含反斜杠
    null,
    42,
    true,
    { src: 'https://x/y.png' },
    ['https://x/y.png'],
  ];

  it('accepts bounded HTTP(S) and relative cover URLs', () => {
    for (const cover of validCovers) {
      const result = parseBaseScreenMaterialManifest(materialManifest({ cover }));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.cover).toBe(cover);
    }
  });

  it('rejects unsafe, unbounded, or malformed cover values', () => {
    for (const cover of invalidCovers) {
      const result = parseBaseScreenMaterialManifest(materialManifest({ cover }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.diagnostics.some(
            (item) =>
              item.path[0] === 'cover' && item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps cover optional and still rejects unknown lookalike fields', () => {
    const missing = parseBaseScreenMaterialManifest(materialManifest());
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value.cover).toBeUndefined();

    const unknown = parseBaseScreenMaterialManifest(
      materialManifest({ coverUrl: 'https://x/y.png' }),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD');
    }
  });

  it('catalog cloning preserves cover and keeps the manifest deeply frozen', () => {
    const parsed = parseBaseScreenMaterialManifest(
      materialManifest({ cover: 'https://cdn.example.com/a.png' }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const catalog = createBaseScreenMaterialCatalog([
      { manifest: parsed.value, constructor: class {} as never },
    ]);
    const entry = catalog.get('acme.kpi-card');
    expect(entry?.manifest.cover).toBe('https://cdn.example.com/a.png');
    expect(entry?.manifest).not.toBe(parsed.value);
    expect(Object.isFrozen(entry?.manifest)).toBe(true);
    expect(Object.isFrozen(entry?.manifest.defaultProps)).toBe(true);
  });
});

describe('events and plugin command data', () => {
  it('validates detached standard event details', () => {
    const result = parseBaseScreenMaterialEventDetail({
      name: 'valueClick',
      payload: { value: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.payload).toEqual({ value: 1 });
    }
  });

  it('rejects invalid event details and malformed command requests', () => {
    const event = parseBaseScreenMaterialEventDetail({ name: 'not valid', payload: null });
    const command = parsePluginCommandRequest({
      commandId: 'run',
      args: { value: 1 },
      extra: true,
    });

    expect(event.ok).toBe(false);
    expect(command.ok).toBe(false);
    if (!command.ok) {
      expect(command.diagnostics[0]?.code).toBe('PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD');
    }
  });

  it('rejects cyclic event payloads and keeps diagnostics deterministic and minimal', () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;
    const input = { name: 'valueClick', payload };
    const first = parseBaseScreenMaterialEventDetail(input);
    const second = parseBaseScreenMaterialEventDetail(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.diagnostics[0]?.code).toBe('JSON_CYCLE');
      expect(first.diagnostics[0]?.message).not.toContain('self');
    }
  });
});

describe('plugin manifests and catalogs', () => {
  it('parses a strict plugin manifest with finite contributions', () => {
    const result = parseBaseScreenPluginManifest(pluginManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contributions).toHaveLength(2);
    }
  });

  it('accepts optional command menus and shortcut, and rejects unknown values', () => {
    const omitted = parseBaseScreenPluginManifest(pluginManifest());
    const written = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'material',
            type: 'acme.kpi-card',
            tagName: 'acme-kpi-card',
          },
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            menus: ['commandPalette', 'menu.tools', 'context.canvas'],
            shortcut: 'Ctrl+Shift+P',
          },
        ],
      }),
    );
    const emptyMenus = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'hidden',
            name: 'Hidden',
            requiredCapability: 'command.execute',
            menus: [],
          },
        ],
      }),
    );
    const unknownMenu = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            menus: ['toolbar'],
          },
        ],
      }),
    );
    const invalidShortcut = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            shortcut: 'Ctrl++',
          },
        ],
      }),
    );
    const unknownField = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            when: 'always',
          },
        ],
      }),
    );

    expect(omitted.ok).toBe(true);
    if (omitted.ok) {
      const command = omitted.value.contributions.find((item) => item.kind === 'command');
      expect(command).toEqual({
        kind: 'command',
        id: 'refresh',
        name: 'Refresh',
        requiredCapability: 'command.execute',
      });
    }
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.value.contributions[1]).toMatchObject({
        menus: ['commandPalette', 'menu.tools', 'context.canvas'],
        shortcut: 'Ctrl+Shift+P',
      });
    }
    expect(emptyMenus.ok).toBe(true);
    const lowercaseShortcut = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            shortcut: 'Ctrl+p',
          },
        ],
      }),
    );
    const duplicateMenus = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
            menus: ['commandPalette', 'commandPalette'],
          },
        ],
      }),
    );
    expect(lowercaseShortcut.ok).toBe(false);
    expect(duplicateMenus.ok).toBe(false);
    expect(unknownMenu.ok).toBe(false);
    if (!unknownMenu.ok) {
      expect(
        unknownMenu.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID'),
      ).toBe(true);
    }
    expect(invalidShortcut.ok).toBe(false);
    expect(unknownField.ok).toBe(false);
    if (!unknownField.ok) {
      expect(
        unknownField.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD'),
      ).toBe(true);
    }
  });

  it('rejects duplicate contribution identities and malformed dependencies', () => {
    const duplicate = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh',
            requiredCapability: 'command.execute',
          },
          {
            kind: 'command',
            id: 'refresh',
            name: 'Refresh again',
            requiredCapability: 'command.execute',
          },
        ],
      }),
    );
    const dependency = parseBaseScreenPluginManifest(
      pluginManifest({ dependencies: [{ id: 'acme.base', unexpected: true }] }),
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(
        duplicate.diagnostics.some((item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE'),
      ).toBe(true);
    }
    expect(dependency.ok).toBe(false);
  });

  it('accepts an explicit queryScope resource declaration and rejects any other value', () => {
    const shareable = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'dataResourceType',
            id: 'acme_metric',
            name: '指标',
            configSchema: { kind: 'object', properties: {}, required: [] },
            queryScope: 'resource',
          },
        ],
      }),
    );
    const invalid = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'dataResourceType',
            id: 'acme_metric',
            name: '指标',
            configSchema: { kind: 'object', properties: {}, required: [] },
            queryScope: 'component',
          },
        ],
      }),
    );

    expect(shareable.ok).toBe(true);
    if (shareable.ok) {
      expect(shareable.value.contributions[0]).toMatchObject({ queryScope: 'resource' });
    }
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(
        invalid.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID'),
      ).toBe(true);
    }
  });

  it('requires dataResourceType ids to satisfy the document resourceType name pattern', () => {
    const parse = (id: string) =>
      parseBaseScreenPluginManifest(
        pluginManifest({
          contributions: [
            {
              kind: 'dataResourceType',
              id,
              name: '指标',
              configSchema: { kind: 'object', properties: {}, required: [] },
            },
          ],
        }),
      );

    expect(parse('acme_metric').ok).toBe(true);
    const dotted = parse('acme.metric');
    const leadingDigit = parse('2nd_metric');
    expect(dotted.ok).toBe(false);
    expect(leadingDigit.ok).toBe(false);
    for (const rejected of [dotted, leadingDigit]) {
      if (rejected.ok) continue;
      expect(
        rejected.diagnostics.some(
          (item) =>
            item.code === 'PLUGIN_CORE_MANIFEST_FIELD_INVALID' &&
            item.path.join('.') === 'contributions.0.id',
        ),
      ).toBe(true);
    }
  });

  it('validates panel contributions by custom element name rules and exact fields', () => {
    const accepted = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          { kind: 'panel', id: 'acme.monitor', name: '监控台', tagName: 'acme-monitor' },
        ],
      }),
    );
    const noHyphen = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [{ kind: 'panel', id: 'acme.p', name: 'P', tagName: 'monitor' }],
      }),
    );
    const reserved = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [{ kind: 'panel', id: 'acme.p', name: 'P', tagName: 'font-face' }],
      }),
    );
    const extraField = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'panel',
            id: 'acme.p',
            name: 'P',
            tagName: 'acme-p',
            location: 'leftPanel',
          },
        ],
      }),
    );
    const duplicated = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          { kind: 'panel', id: 'acme.p', name: 'One', tagName: 'acme-one' },
          { kind: 'panel', id: 'acme.p', name: 'Two', tagName: 'acme-two' },
        ],
      }),
    );

    expect(accepted.ok).toBe(true);
    expect(noHyphen.ok).toBe(false);
    if (!noHyphen.ok) {
      expect(
        noHyphen.diagnostics.some((item) => item.code === 'PLUGIN_CORE_TAG_NAME_INVALID'),
      ).toBe(true);
    }
    expect(reserved.ok).toBe(false);
    expect(extraField.ok).toBe(false);
    if (!extraField.ok) {
      expect(
        extraField.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD'),
      ).toBe(true);
    }
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) {
      expect(
        duplicated.diagnostics.some((item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE'),
      ).toBe(true);
    }
  });

  it('validates inspectorControl contributions by tag rules and exact fields', () => {
    const accepted = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'inspectorControl',
            id: 'acme.color-wheel',
            name: '色轮',
            tagName: 'acme-color-wheel',
          },
        ],
      }),
    );
    const badTag = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          { kind: 'inspectorControl', id: 'acme.c', name: 'C', tagName: 'colorwheel' },
        ],
      }),
    );
    const extraField = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          {
            kind: 'inspectorControl',
            id: 'acme.c',
            name: 'C',
            tagName: 'acme-c',
            control: 'custom',
          },
        ],
      }),
    );
    const duplicated = parseBaseScreenPluginManifest(
      pluginManifest({
        contributions: [
          { kind: 'inspectorControl', id: 'acme.c', name: 'One', tagName: 'acme-one' },
          { kind: 'inspectorControl', id: 'acme.c', name: 'Two', tagName: 'acme-two' },
        ],
      }),
    );

    expect(accepted.ok).toBe(true);
    expect(badTag.ok).toBe(false);
    if (!badTag.ok) {
      expect(badTag.diagnostics.some((item) => item.code === 'PLUGIN_CORE_TAG_NAME_INVALID')).toBe(
        true,
      );
    }
    expect(extraField.ok).toBe(false);
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) {
      expect(
        duplicated.diagnostics.some((item) => item.code === 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE'),
      ).toBe(true);
    }
  });

  it('parses panel action details and rejects spoofable or malformed shapes', () => {
    const valid = parseBaseScreenPluginPanelActionDetail({
      panelId: 'acme.monitor',
      commandId: 'acme.refresh',
      args: { region: 'north' },
    });
    const nullArgs = parseBaseScreenPluginPanelActionDetail({
      panelId: 'acme.monitor',
      commandId: 'acme.refresh',
      args: null,
    });
    const missingArgs = parseBaseScreenPluginPanelActionDetail({
      panelId: 'acme.monitor',
      commandId: 'acme.refresh',
    });
    const extraField = parseBaseScreenPluginPanelActionDetail({
      panelId: 'acme.monitor',
      commandId: 'acme.refresh',
      args: null,
      componentId: 'title',
    });
    const badCommandId = parseBaseScreenPluginPanelActionDetail({
      panelId: 'acme.monitor',
      commandId: 'not an identifier',
      args: null,
    });

    expect(valid.ok).toBe(true);
    // args 允许 null：面板可以只按身份触发一条无参命令。
    expect(nullArgs.ok).toBe(true);
    for (const rejected of [missingArgs, extraField, badCommandId]) {
      expect(rejected.ok).toBe(false);
    }
    if (!badCommandId.ok) {
      expect(
        badCommandId.diagnostics.some((item) => item.code === 'PLUGIN_CORE_EVENT_INVALID'),
      ).toBe(true);
    }
    if (!extraField.ok) {
      expect(
        extraField.diagnostics.some((item) => item.code === 'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD'),
      ).toBe(true);
    }
  });

  it('creates ordered read-only catalog snapshots without mutable entry APIs', () => {
    const parsedMaterial = parseBaseScreenMaterialManifest(materialManifest());
    const parsedPlugin = parseBaseScreenPluginManifest(pluginManifest());
    expect(parsedMaterial.ok).toBe(true);
    expect(parsedPlugin.ok).toBe(true);
    if (!parsedMaterial.ok || !parsedPlugin.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const materials = createBaseScreenMaterialCatalog([
      { manifest: parsedMaterial.value, constructor },
    ]);
    const plugins = createBaseScreenPluginCatalog([
      {
        manifest: parsedPlugin.value,
        grantedCapabilities: ['command.execute'],
        contributions: parsedPlugin.value.contributions,
      },
    ]);

    expect(materials.get('acme.kpi-card')?.constructor).toBe(constructor);
    expect(materials.has('missing')).toBe(false);
    expect(materials.list()).toHaveLength(1);
    expect(plugins.list()[0]?.manifest.id).toBe('acme.analytics');
    expect('register' in materials).toBe(false);
    expect('delete' in plugins).toBe(false);
  });

  it('detaches catalog snapshots and rejects duplicate identities', () => {
    const parsedMaterial = parseBaseScreenMaterialManifest(materialManifest());
    const parsedPlugin = parseBaseScreenPluginManifest(pluginManifest());
    expect(parsedMaterial.ok).toBe(true);
    expect(parsedPlugin.ok).toBe(true);
    if (!parsedMaterial.ok || !parsedPlugin.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const catalog = createBaseScreenMaterialCatalog([
      { manifest: parsedMaterial.value, constructor },
    ]);
    const entry = catalog.get('acme.kpi-card');

    expect(entry?.manifest).not.toBe(parsedMaterial.value);
    expect(Object.isFrozen(entry?.manifest)).toBe(true);
    expect(() =>
      createBaseScreenPluginCatalog([
        {
          manifest: parsedPlugin.value,
          grantedCapabilities: [],
          contributions: [],
        },
        {
          manifest: parsedPlugin.value,
          grantedCapabilities: [],
          contributions: [],
        },
      ]),
    ).toThrow(RangeError);
  });

  it('sorts Material Catalogs independently for separate instances', () => {
    const first = parseBaseScreenMaterialManifest(materialManifest({ type: 'acme.zeta-card' }));
    const second = parseBaseScreenMaterialManifest(
      materialManifest({ type: 'acme.alpha-card', tagName: 'acme-alpha-card' }),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    const constructor = class {} as unknown as BaseScreenMaterialConstructor;
    const enabled = createBaseScreenMaterialCatalog([
      { manifest: first.value, constructor },
      { manifest: second.value, constructor },
    ]);
    const excluded = createBaseScreenMaterialCatalog([]);

    expect(enabled.list().map((entry) => entry.manifest.type)).toEqual([
      'acme.alpha-card',
      'acme.zeta-card',
    ]);
    expect(excluded.get('acme.alpha-card')).toBeUndefined();
  });
});

describe('plugin panel element model contract', () => {
  it('permits an unset model so panels can render before the first snapshot', () => {
    // Engine 先挂载面板元素（触发 connectedCallback），再写入快照；文档未就绪时整轮不写。
    // 因此契约必须允许 model 为 undefined，否则按类型实现的元素会在挂载时崩溃。
    const element: BaseScreenPluginPanelElement = {
      model: undefined,
    } as unknown as BaseScreenPluginPanelElement;
    expect(element.model).toBeUndefined();

    const set: BaseScreenPluginPanelElement['model'] = {
      document: {} as never,
      selectedComponentIds: [],
      focusedComponentId: null,
    };
    element.model = set;
    expect(element.model).toBe(set);
  });
});

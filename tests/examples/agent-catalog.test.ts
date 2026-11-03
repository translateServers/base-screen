import { describe, expect, it } from 'vitest';
import { buildAgentCatalog } from '../../examples/vanilla-host/src/screen/agent-catalog';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialObjectSchema,
} from '../../packages/plugin-core/src/index.js';

function manifest(
  type: string,
  options: {
    readonly libraryVisible?: boolean;
    readonly dataCapabilities?: readonly ('static' | 'dataset' | 'host-resource' | 'variable')[];
    readonly hostResourceSelection?: boolean;
    readonly propsSchema?: BaseScreenMaterialObjectSchema;
    readonly defaultProps?: Readonly<Record<string, unknown>>;
    readonly roles?: readonly {
      readonly id: string;
      readonly minFields: number;
      readonly maxFields: number;
    }[];
  } = {},
): BaseScreenMaterialManifest {
  return {
    type,
    tagName: `test-${type.replaceAll('.', '-')}`,
    name: type,
    category: '测试',
    keywords: [],
    defaultSize: { width: 100, height: 50 },
    defaultProps: (options.defaultProps ?? {}) as BaseScreenMaterialManifest['defaultProps'],
    defaultStyle: {},
    propsSchema: options.propsSchema ?? { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    events: [],
    dataCapabilities: options.dataCapabilities ?? ['host-resource'],
    ...(options.hostResourceSelection === undefined
      ? {}
      : { hostResourceSelection: options.hostResourceSelection }),
    ...(options.libraryVisible === undefined ? {} : { libraryVisible: options.libraryVisible }),
    ...(options.roles === undefined ? {} : { dataBinding: { roles: options.roles } }),
    designCapabilities: { resize: true, rotate: true, children: false },
  };
}

function catalog(manifests: readonly BaseScreenMaterialManifest[]): BaseScreenMaterialCatalog {
  const entries: readonly BaseScreenMaterialCatalogEntry[] = manifests.map((item) => ({
    manifest: item,
    constructor: {} as BaseScreenMaterialConstructor,
  }));
  return {
    get: (type) => entries.find((entry) => entry.manifest.type === type),
    has: (type) => entries.some((entry) => entry.manifest.type === type),
    list: () => entries,
  };
}

describe('agent material catalog projection', () => {
  it('includes every visible material and excludes hidden entries', () => {
    const manifests = Array.from({ length: 40 }, (_, index) => manifest(`host.material-${index}`));
    manifests.push(manifest('host.hidden-material', { libraryVisible: false }));

    const projected = buildAgentCatalog(catalog(manifests));

    expect(projected.materials).toHaveLength(40);
    expect(projected.materials.map((item) => item.type)).not.toContain('host.hidden-material');
  });

  it('preserves every supported property, enum value, role, and scalar default', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 15 }, (_, index) => [`option${index}`, { kind: 'string' as const }]),
    );
    properties.choice = {
      kind: 'enum',
      values: Array.from({ length: 10 }, (_, index) => `choice-${index}`),
    } as (typeof properties)[string];
    const defaults = Object.fromEntries(
      Array.from({ length: 45 }, (_, index) => [`option${index}`, `value-${index}`]),
    );
    const roles = Array.from({ length: 10 }, (_, index) => ({
      id: `role${index}`,
      minFields: 1,
      maxFields: 2,
    }));
    const projected = buildAgentCatalog(
      catalog([
        manifest('host.material-large', {
          propsSchema: {
            kind: 'object',
            properties,
            required: [],
          } as BaseScreenMaterialObjectSchema,
          defaultProps: defaults,
          roles,
        }),
      ]),
    ).materials[0];

    expect(projected?.props).toHaveProperty('option14', { kind: 'string' });
    expect(projected?.props.choice).toEqual({
      kind: 'enum',
      values: Array.from({ length: 10 }, (_, index) => `choice-${index}`),
    });
    expect(projected?.roles).toHaveLength(10);
    expect(Object.keys(projected?.defaults.props ?? {})).toHaveLength(45);
  });

  it('requires both resource capability declarations before marking a material asset-capable', () => {
    const projected = buildAgentCatalog(
      catalog([
        manifest('host.resource-only', {
          hostResourceSelection: true,
          dataCapabilities: ['static'],
        }),
      ]),
    );

    expect(projected.materials[0]?.asset).toBe(false);
  });
});

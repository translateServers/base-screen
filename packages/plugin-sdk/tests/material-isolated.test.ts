import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_ISOLATED_MATERIAL_SOURCE_MAX_BYTES,
  type BaseScreenMaterialSpec,
  createBaseScreenIsolatedMaterialDefinition,
  createBaseScreenSpecMaterialDefinition,
  parseBaseScreenMaterialSpec,
  sha256,
} from '../src/index.js';
import { GAUGE_SPEC } from './__fixtures__/template-specs.js';

/** ADR-0117 S1：隔离代码物料在宿主 realm 里能验证的部分（沙箱行为由 browser-harness 测量页验证）。 */

const SPEC: BaseScreenMaterialSpec = {
  type: 'host.online.isolated-test',
  name: '隔离测试',
  category: '测试',
  keywords: [],
  defaultSize: { width: 120, height: 80 },
  fields: [],
  data: { kind: 'scalar', valueType: 'number', sample: 1 },
  events: [
    { name: 'valueClick', label: '点击', payload: { value: { type: 'number', value: 'value' } } },
  ],
  isolated: { libraries: ['echarts'] },
};
const SOURCE = 'export function create(env) { return { frame() { return true; } }; }';
const ECHARTS = { name: 'echarts', global: 'echarts', source: 'globalThis.echarts = {};' };

function messages(result: {
  readonly ok: boolean;
  readonly diagnostics: readonly { readonly message: string }[];
}) {
  return result.diagnostics.map((item) => item.message).join('\n');
}

describe('sha256 fallback', () => {
  // 对照值来自 Python hashlib；覆盖空串、单块、55 / 56 / 64 字节的填充边界、多块与非 ASCII。
  const VECTORS: readonly (readonly [string, string])[] = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    ['a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    ['x'.repeat(1000), '44f8354494a5ba03ba1792a8d3e9c534c47a9181980fde7a3f44b06ef2ae7c7f'],
    ['组件代码 <\\/script>', '3be7187451177ca340cae58dd30149ae52d2effd575602b20715bc37461d7e55'],
  ];

  it('matches the reference digests', () => {
    for (const [input, expected] of VECTORS) {
      const digest = sha256(new TextEncoder().encode(input));
      expect(Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(
        expected,
      );
    }
  });
});

describe('spec isolated field', () => {
  it('accepts a bounded list of preset library names', () => {
    expect(parseBaseScreenMaterialSpec(SPEC).ok).toBe(true);
    expect(parseBaseScreenMaterialSpec({ ...SPEC, isolated: {} }).ok).toBe(true);
  });

  it('rejects unknown keys, bad names, duplicates and too many libraries', () => {
    for (const isolated of [
      { libraries: ['echarts'], network: ['https://evil.example'] },
      { libraries: ['https://cdn.example/x.js'] },
      { libraries: ['echarts', 'echarts'] },
      { libraries: ['a', 'b', 'c', 'd', 'e'] },
      'echarts',
    ]) {
      expect(parseBaseScreenMaterialSpec({ ...SPEC, isolated }).ok).toBe(false);
    }
  });

  it('is mutually exclusive with template', () => {
    const template = GAUGE_SPEC.template;
    const result = parseBaseScreenMaterialSpec({ ...SPEC, template });
    expect(result.ok).toBe(false);
    expect(messages(result)).toContain('MATERIAL_ISOLATED_CONFLICT');
  });

  it('cannot be registered as a same-realm render function', () => {
    const result = createBaseScreenSpecMaterialDefinition({
      spec: SPEC,
      render: () => {},
      tagName: 'host-online-isolated-test-1',
    });
    expect(result.ok).toBe(false);
    expect(messages(result)).toContain('MATERIAL_ISOLATED_CONFLICT');
  });
});

describe('isolated material definition', () => {
  it('builds a plain material constructor from the spec without running the source', () => {
    const definition = createBaseScreenIsolatedMaterialDefinition({
      spec: SPEC,
      // 宿主 realm 若执行它就会抛错：定义阶段只能把它当文本。
      source: `${SOURCE}\nthrow new Error('executed in host realm');`,
      tagName: 'host-online-isolated-test-2',
      libraries: [ECHARTS],
    });
    expect(definition.ok).toBe(true);
    if (!definition.ok) return;
    expect(definition.value.manifest.tagName).toBe('host-online-isolated-test-2');
    expect(definition.value.manifest.events).toEqual(['valueClick']);
    expect(
      Object.getOwnPropertyDescriptor(definition.value.element, 'manifest')?.configurable,
    ).toBe(true);
    expect(
      (definition.value.element as unknown as { readonly tabularDataAdapter?: unknown })
        .tabularDataAdapter,
    ).toBeDefined();
  });

  it('requires the isolated field', () => {
    const { isolated: _isolated, ...plain } = SPEC;
    const result = createBaseScreenIsolatedMaterialDefinition({
      spec: plain,
      source: SOURCE,
      tagName: 'host-online-isolated-test-3',
    });
    expect(result.ok).toBe(false);
    expect(messages(result)).toContain('MATERIAL_ISOLATED_REQUIRED');
  });

  it('requires every referenced library to be supplied by the host', () => {
    const result = createBaseScreenIsolatedMaterialDefinition({
      spec: SPEC,
      source: SOURCE,
      tagName: 'host-online-isolated-test-4',
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.path).toEqual(['spec', 'isolated', 'libraries', 0]);
  });

  it('rejects empty and oversized source', () => {
    for (const source of ['  ', 'x'.repeat(BASE_SCREEN_ISOLATED_MATERIAL_SOURCE_MAX_BYTES + 1)]) {
      const result = createBaseScreenIsolatedMaterialDefinition({
        spec: SPEC,
        source,
        tagName: 'host-online-isolated-test-5',
        libraries: [ECHARTS],
      });
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.path).toEqual(['source']);
    }
  });

  it('rejects an out-of-range frame cap', () => {
    for (const maxFps of [0, 121, Number.NaN]) {
      const result = createBaseScreenIsolatedMaterialDefinition({
        spec: SPEC,
        source: SOURCE,
        tagName: 'host-online-isolated-test-6',
        libraries: [ECHARTS],
        maxFps,
      });
      expect(result.ok).toBe(false);
    }
  });
});

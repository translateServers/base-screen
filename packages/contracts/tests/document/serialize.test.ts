import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../src/document/parse.js';
import { ScreenSerializationError, serializeScreenDocument } from '../../src/document/serialize.js';
import type { ScreenDocument } from '../../src/types/document.js';

function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
    ...overrides,
  };
}

function parsed(input: Record<string, unknown>): ScreenDocument {
  const result = parseScreenDocument(input);
  if (!result.ok) {
    throw new Error(`fixture must parse: ${result.diagnostics[0]?.code}`);
  }
  return result.value;
}

describe('serializeScreenDocument', () => {
  it('produces canonical bytes with sorted keys', () => {
    const input = parsed(
      document({
        components: [
          {
            id: 'c1',
            type: 'acme.kpi-card',
            name: 'Card',
            parentId: null,
            position: { x: 1, y: 2 },
            size: { width: 320, height: 160 },
            rotation: 0,
            zIndex: 1,
            status: { locked: false, hidden: false },
            props: { z: 1, a: { m: 1, b: 2 } },
            style: {},
            dataSource: null,
          },
        ],
      }),
    );
    const output = serializeScreenDocument(input);
    const parsedOutput = JSON.parse(output) as {
      components: Array<{ props: Record<string, unknown> }>;
    };
    expect(Object.keys(parsedOutput.components[0]?.props ?? {})).toEqual(['a', 'z']);
    expect(Object.keys(parsedOutput.components[0]?.props.a as Record<string, unknown>)).toEqual([
      'b',
      'm',
    ]);
  });

  it('normalizes -0 to 0 and omits whitespace', () => {
    const input = parsed(document({ components: [{ ...emptyComponent(), props: { zero: -0 } }] }));
    const output = serializeScreenDocument(input);
    expect(output).toContain('"zero":0');
    expect(output).not.toContain('-0');
    expect(output).not.toMatch(/[ \n]/);
  });

  it('is deterministic for equivalent documents with different insertion order', () => {
    const first = document({ components: [{ ...emptyComponent(), props: { b: 1, a: 2 } }] });
    const second = document({ components: [{ ...emptyComponent(), props: { a: 2, b: 1 } }] });
    const a = serializeScreenDocument(parsed(first));
    const b = serializeScreenDocument(parsed(second));
    expect(a).toBe(b);
    expect(serializeScreenDocument(parsed(first))).toBe(a);
  });

  it('round-trips through JSON.parse and parseScreenDocument', () => {
    const input = parsed(
      document({
        canvas: { width: 1, height: 1, backgroundColor: '#fff' },
        components: [
          {
            ...emptyComponent(),
            name: '中文 \u{1f600}',
            props: { nested: [1, 2, 3], flag: true, nothing: null },
          },
        ],
        variables: [
          { type: 'static', id: 'count', name: 'count', description: '当前计数', initialValue: 42 },
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            description: '当前租户',
            initialValue: null,
            sourceId: 'tenant-context',
            controlled: true,
          },
        ],
      }),
    );
    const output = serializeScreenDocument(input);
    const reparsed = parseScreenDocument(JSON.parse(output));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.value).toEqual(input);
      expect(reparsed.value).not.toBe(input);
    }
  });

  it('round-trips strict host dataset parameter and binding intent', () => {
    const input = parsed(
      document({
        components: [
          {
            ...emptyComponent(),
            dataSource: {
              type: 'host-resource',
              resourceType: 'dataset',
              resourceId: 'orders',
              params: {
                limit: { kind: 'literal', value: 5 },
                tenant: { kind: 'variable', variableId: 'tenant' },
              },
              binding: { fields: { columns: ['name', 'amount'] } },
            },
          },
        ],
        variables: [
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            sourceId: 'tenant-context',
            controlled: true,
          },
        ],
      }),
    );
    const reparsed = parseScreenDocument(JSON.parse(serializeScreenDocument(input)));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.value).toEqual(input);
  });

  it('round-trips canvas background image fields', () => {
    const input = parsed(
      document({
        canvas: {
          width: 1920,
          height: 1080,
          backgroundColor: '#000000',
          backgroundImage: 'https://cdn.x/screens/bg.png',
          backgroundImageFit: 'contain',
        },
      }),
    );
    const output = serializeScreenDocument(input);
    expect(output).toContain('"backgroundImage":"https://cdn.x/screens/bg.png"');
    expect(output).toContain('"backgroundImageFit":"contain"');
    const reparsed = parseScreenDocument(JSON.parse(output));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.value).toEqual(input);
      expect(reparsed.value.canvas.backgroundImage).toBe('https://cdn.x/screens/bg.png');
      expect(reparsed.value.canvas.backgroundImageFit).toBe('contain');
    }
  });

  it('throws ScreenSerializationError for invalid runtime input', () => {
    const cases: Array<Record<string, unknown>> = [
      document({ canvas: { width: 0, height: 1, backgroundColor: '#000' } }),
      document({ components: [{ ...emptyComponent(), id: 'bad id' }] }),
      document({ blueprint: {} }),
      document({ components: [{ ...emptyComponent(), props: { constructor: 1 } }] }),
      document({
        components: [{ ...emptyComponent(), dataSource: { type: 'static', value: undefined } }],
      }),
    ];
    for (const input of cases) {
      expect(() => serializeScreenDocument(input as unknown as ScreenDocument)).toThrow(
        ScreenSerializationError,
      );
    }
  });

  it('exposes diagnostics and a fixed message without input content', () => {
    const secret = 'canary-value-9c21';
    const input = document({
      canvas: { width: 0, height: 1, backgroundColor: '#000' },
      components: [{ ...emptyComponent(), props: { token: secret } }],
    });
    try {
      serializeScreenDocument(input as unknown as ScreenDocument);
      expect.unreachable('expected serialization to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ScreenSerializationError);
      const serializationError = error as ScreenSerializationError;
      expect(serializationError.name).toBe('ScreenSerializationError');
      expect(serializationError.diagnostics.length).toBeGreaterThan(0);
      expect(serializationError.message).not.toContain(secret);
      expect(serializationError.diagnostics[0]?.path).toEqual(['canvas', 'width']);
    }
  });
});

function emptyComponent(): Record<string, unknown> {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

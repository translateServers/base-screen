import { describe, expect, it } from 'vitest';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

describe('parseScreenDocument with a shared base document', () => {
  it('keeps references shared with base and clones changed values', () => {
    const base = parse(document({ components: [component({ id: 'a' }), component({ id: 'b' })] }));
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const changed = component({ id: 'b', name: 'Renamed' });
    const candidate = { ...base.value, components: [base.value.components[0]!, changed] };

    const result = parse(candidate, base.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components[0]).toBe(base.value.components[0]);
    expect(result.value.components[1]).not.toBe(changed);
    expect(result.value.components[1]?.name).toBe('Renamed');
    expect(result.value.canvas).toBe(base.value.canvas);
    expect(result.value.blueprint).toBe(base.value.blueprint);
  });

  it('still validates components that are not shared with base', () => {
    const base = parse(document({ components: [component({ id: 'a' })] }));
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const invalid = component({ id: 'b', name: 'x'.repeat(300) });
    const candidate = { ...base.value, components: [...base.value.components, invalid] };

    const result = parse(candidate, base.value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.code === 'DOCUMENT_FIELD_INVALID')).toBe(true);
    }
  });

  it('still validates a replaced canvas and blueprint', () => {
    const base = parse(document({}));
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const badCanvas = parse(
      { ...base.value, canvas: { width: 'wide', height: 1080, backgroundColor: '#000000' } },
      base.value,
    );
    expect(badCanvas.ok).toBe(false);

    const badBlueprint = parse({ ...base.value, blueprint: { relations: 'none' } }, base.value);
    expect(badBlueprint.ok).toBe(false);
  });

  it('enforces value limits for newly added content', () => {
    const base = parse(document({}));
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const oversized = component({ id: 'big', props: { blob: 'x'.repeat(70_000) } });
    const candidate = { ...base.value, components: [oversized] };

    const result = parse(candidate, base.value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.code === 'DOCUMENT_LIMIT_EXCEEDED')).toBe(true);
    }
  });
});

describe('parseScreenDocument canvas background image', () => {
  function canvasWithBackgroundImage(backgroundImage: unknown): Record<string, unknown> {
    return document({
      canvas: { width: 1920, height: 1080, backgroundColor: '#000000', backgroundImage },
    });
  }

  const VALID_URLS = [
    'https://cdn.x/data-hub/bg.png',
    'http://x/y/z.jpg',
    '/assets/screen-bg.png',
    './bg.png',
    '../assets/bg.png',
    '//cdn.x/bg.png',
    'https://x/bg.png?size=large#frag',
    `https://x/${'a'.repeat(2038)}`,
  ];

  const INVALID_URLS = [
    null,
    42,
    true,
    {},
    [],
    '',
    'a'.repeat(2049),
    'https://x/a b.png',
    'https://x/a\tb.png',
    'https://x/a\u0000b.png',
    'https://x/a\u007fb.png',
    'https://x/a\u0085b.png',
    'https://x/a\\b.png',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'blob:https://x/1',
    'file:///c:/bg.png',
    'ftp://x/bg.png',
    'a.png',
    '/',
    './',
    '//',
    '///x',
    'https://',
    'https:///x',
    'http://?x',
  ];

  it('R1 accepts bounded background image URLs and preserves them', () => {
    for (const url of VALID_URLS) {
      const result = parse(canvasWithBackgroundImage(url));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canvas.backgroundImage).toBe(url);
      }
    }
  });

  it('R1 accepts optional fit values and rejects anything else', () => {
    for (const fit of ['cover', 'contain']) {
      const result = parse(
        document({
          canvas: {
            width: 1920,
            height: 1080,
            backgroundColor: '#000000',
            backgroundImage: 'https://x/bg.png',
            backgroundImageFit: fit,
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canvas.backgroundImageFit).toBe(fit);
      }
    }
    for (const fit of ['fill', 'none', 1, null, {}]) {
      const result = parse(
        document({
          canvas: {
            width: 1920,
            height: 1080,
            backgroundColor: '#000000',
            backgroundImage: 'https://x/bg.png',
            backgroundImageFit: fit,
          },
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImageFit']);
      }
    }
  });

  it('R1 rejects unbounded, malformed, or injected background image URLs fail-closed', () => {
    for (const url of INVALID_URLS) {
      const result = parse(canvasWithBackgroundImage(url));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
        expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImage']);
      }
    }
  });

  it('R1 treats an absent background image as declared and keeps unknown-field rejection', () => {
    const result = parse(document());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canvas.backgroundImage).toBeUndefined();
      expect(result.value.canvas.backgroundImageFit).toBeUndefined();
    }
    const unknown = parse(
      document({
        canvas: {
          width: 1920,
          height: 1080,
          backgroundColor: '#000000',
          backgroundUrl: 'https://x/bg.png',
        },
      }),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(unknown.diagnostics[0]?.path).toEqual(['canvas', 'backgroundUrl']);
    }
  });
});

describe('parseScreenDocument component style rules', () => {
  function styleRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'warn',
      when: { path: [], operator: 'gt', value: 100 },
      style: { color: '#ff0000' },
      ...overrides,
    };
  }

  it('R1 accepts bounded style rules and returns them detached', () => {
    const source = document({
      components: [
        component({
          styleRules: [
            styleRule(),
            {
              id: 'critical',
              when: { path: ['amount'], operator: 'gte', value: 500 },
              style: { color: '#ff0000', fontWeight: '700' },
            },
          ],
        }),
      ],
    });
    const result = parse(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components[0]?.styleRules).toEqual([
      { id: 'warn', when: { path: [], operator: 'gt', value: 100 }, style: { color: '#ff0000' } },
      {
        id: 'critical',
        when: { path: ['amount'], operator: 'gte', value: 500 },
        style: { color: '#ff0000', fontWeight: '700' },
      },
    ]);
    (source.components as Record<string, unknown>[])[0]!.styleRules = [];
    expect(result.value.components[0]?.styleRules).toHaveLength(2);
  });

  it('R1 accepts exists without a value literal', () => {
    const result = parse(
      document({
        components: [
          component({
            styleRules: [styleRule({ when: { path: ['status'], operator: 'exists' } })],
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('R1 rejects unknown rule and condition fields fail-closed', () => {
    const extraRuleField = parse(
      document({ components: [component({ styleRules: [styleRule({ note: 'x' })] })] }),
    );
    expect(extraRuleField.ok).toBe(false);
    if (!extraRuleField.ok) {
      expect(extraRuleField.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(extraRuleField.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'styleRules',
        0,
        'note',
      ]);
    }
    const extraWhenField = parse(
      document({
        components: [
          component({
            styleRules: [styleRule({ when: { path: [], operator: 'gt', value: 1, comment: 'x' } })],
          }),
        ],
      }),
    );
    expect(extraWhenField.ok).toBe(false);
    if (!extraWhenField.ok) {
      expect(extraWhenField.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
    }
  });

  it('R1 rejects more than 8 rules and duplicate rule ids', () => {
    const tooMany = parse(
      document({
        components: [
          component({
            styleRules: Array.from({ length: 9 }, (_, index) => styleRule({ id: `r${index}` })),
          }),
        ],
      }),
    );
    expect(tooMany.ok).toBe(false);
    const duplicate = parse(
      document({
        components: [component({ styleRules: [styleRule(), styleRule()] })],
      }),
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.diagnostics[0]?.path).toEqual(['components', 0, 'styleRules', 1, 'id']);
    }
  });

  it('R1 enforces the value literal presence rules per operator', () => {
    const missingValue = parse(
      document({
        components: [
          component({ styleRules: [styleRule({ when: { path: [], operator: 'gt' } })] }),
        ],
      }),
    );
    expect(missingValue.ok).toBe(false);
    if (!missingValue.ok) {
      expect(missingValue.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'styleRules',
        0,
        'when',
        'value',
      ]);
    }
    const existsWithValue = parse(
      document({
        components: [
          component({
            styleRules: [styleRule({ when: { path: [], operator: 'exists', value: 1 } })],
          }),
        ],
      }),
    );
    expect(existsWithValue.ok).toBe(false);
  });

  it('R1 rejects over-long ids, path segments, deep paths, and oversized values', () => {
    const longId = parse(
      document({ components: [component({ styleRules: [styleRule({ id: 'a'.repeat(65) })] })] }),
    );
    expect(longId.ok).toBe(false);
    const longSegment = parse(
      document({
        components: [
          component({
            styleRules: [styleRule({ when: { path: ['a'.repeat(65)], operator: 'eq', value: 1 } })],
          }),
        ],
      }),
    );
    expect(longSegment.ok).toBe(false);
    const deepPath = parse(
      document({
        components: [
          component({
            styleRules: [
              styleRule({
                when: {
                  path: Array.from({ length: 9 }, (_, i) => `k${i}`),
                  operator: 'eq',
                  value: 1,
                },
              }),
            ],
          }),
        ],
      }),
    );
    expect(deepPath.ok).toBe(false);
    const bigValue = parse(
      document({
        components: [
          component({
            styleRules: [
              styleRule({ when: { path: [], operator: 'eq', value: 'a'.repeat(64 * 1024) } }),
            ],
          }),
        ],
      }),
    );
    expect(bigValue.ok).toBe(false);
    if (!bigValue.ok) {
      expect(bigValue.diagnostics[0]?.code).toBe('DOCUMENT_LIMIT_EXCEEDED');
    }
  });
});

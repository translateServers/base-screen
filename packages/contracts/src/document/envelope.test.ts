import { describe, expect, it } from 'vitest';
import { parseScreenProjectEnvelope } from './parse.js';

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'project-1',
    revision: 'rev-1',
    name: 'My Dashboard',
    description: null,
    document: {
      canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
      components: [],
      variables: [],
      blueprint: { rules: [] },
    },
    metadata: {},
    ...overrides,
  };
}

const parse = parseScreenProjectEnvelope;

describe('parseScreenProjectEnvelope', () => {
  it('parses a valid envelope', () => {
    const result = parse(envelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
      expect(result.value).toEqual(envelope());
      expect(result.value).not.toBe(envelope());
    }
  });

  it('rejects non-object roots', () => {
    for (const input of [null, 42, [], 'text']) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('ENVELOPE_INVALID');
        expect(result.diagnostics[0]?.path).toEqual([]);
      }
    }
  });

  it('rejects unknown envelope fields', () => {
    const result = parse(envelope({ owner: 'me' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('ENVELOPE_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual(['owner']);
    }
  });

  it('validates opaque projectId and revision fields', () => {
    for (const overrides of [
      { projectId: '' },
      { projectId: 'a'.repeat(257) },
      { projectId: 'a\u0001b' },
      { revision: '' },
      { revision: 'a'.repeat(513) },
      { revision: 'a\u007fb' },
      { projectId: 42 },
    ]) {
      const result = parse(envelope(overrides));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('ENVELOPE_INVALID');
      }
    }
  });

  it('validates envelope name and description', () => {
    for (const overrides of [
      { name: '' },
      { name: '   ' },
      { name: 'a'.repeat(257) },
      { name: 'a\u0000b' },
      { description: 'd'.repeat(4_097) },
      { description: 42 },
    ]) {
      const result = parse(envelope(overrides));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('ENVELOPE_INVALID');
      }
    }
    expect(parse(envelope({ description: 'd'.repeat(4_096) }))).toMatchObject({ ok: true });
    expect(parse(envelope({ name: 'emoji \u{1f600}'.repeat(30) }))).toMatchObject({ ok: true });
  });

  it('rejects non-object metadata', () => {
    const result = parse(envelope({ metadata: 'text' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('ENVELOPE_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['metadata']);
    }
  });

  it('prefixes nested document diagnostics', () => {
    const result = parse(
      envelope({
        document: {
          canvas: { width: 1, height: 1, backgroundColor: '#000', extra: true },
          components: [],
          variables: [],
          blueprint: { rules: [] },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual(['document', 'canvas', 'extra']);
    }
  });

  it('reports a non-object document as DOCUMENT_NOT_OBJECT at the document path', () => {
    const result = parse(envelope({ document: 'not-a-document' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_NOT_OBJECT');
      expect(result.diagnostics[0]?.path).toEqual(['document']);
    }
  });

  it('fails on envelope total size before parsing the document', () => {
    const documentBody: Record<string, unknown> = {};
    for (let index = 0; index < 200; index++) {
      documentBody[`k-${index}`] = 'y'.repeat(60_000);
    }
    const result = parse(
      envelope({
        document: {
          canvas: { width: 1, height: 1, backgroundColor: '#000' },
          components: [],
          variables: [],
          blueprint: { rules: [] },
          props: documentBody,
        },
        metadata: { note: 'big' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('ENVELOPE_INVALID');
      expect(result.diagnostics[0]?.path).toEqual([]);
    }
  });

  it('prefixes the nested diagnostic limit sentinel', () => {
    const badDocument: Record<string, unknown> = {
      canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
      components: [],
      variables: [],
      blueprint: { rules: [] },
    };
    for (let index = 0; index < 150; index++) {
      badDocument[`unknown${index}`] = 1;
    }
    const result = parse(envelope({ document: badDocument }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(100);
      expect(result.diagnostics[99]?.code).toBe('DIAGNOSTIC_LIMIT_REACHED');
      expect(result.diagnostics[99]?.path).toEqual(['document']);
    }
  });

  it('keeps envelope metadata out of the parsed document', () => {
    const result = parse(envelope({ metadata: { token: 'value' } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document).not.toHaveProperty('metadata');
      expect(result.value.metadata).toEqual({ token: 'value' });
    }
  });
});

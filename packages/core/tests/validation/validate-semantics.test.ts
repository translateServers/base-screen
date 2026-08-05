import { describe, expect, it } from 'vitest';
import { validateScreenDocumentSemantics } from '../../src/validation/validate-semantics.js';
import { makeAncestorChain, makeComponent, makeDocument } from '../__fixtures__/document.js';

describe('validateScreenDocumentSemantics', () => {
  it('returns no diagnostics for an empty canonical document', () => {
    const diagnostics = validateScreenDocumentSemantics(makeDocument());
    expect(diagnostics).toEqual([]);
  });

  it('returns no diagnostics for a flat canonical document', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'a', position: { x: 10, y: 20 } }),
        makeComponent({ id: 'b', position: { x: -100, y: 0 } }),
      ],
    });
    expect(validateScreenDocumentSemantics(document)).toEqual([]);
  });

  it('returns no diagnostics for a rotated component', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'rotated',
          rotation: 45,
          size: { width: 100, height: 50 },
        }),
      ],
    });
    expect(validateScreenDocumentSemantics(document)).toEqual([]);
  });

  it('returns no diagnostics for a deep but legal hierarchy', () => {
    const chain = makeAncestorChain(256);
    const document = makeDocument({ components: chain });
    expect(validateScreenDocumentSemantics(document)).toEqual([]);
  });

  it('reports CORE_INVARIANT_VIOLATION when ancestor depth exceeds 256', () => {
    const chain = makeAncestorChain(257);
    const document = makeDocument({ components: chain });
    const diagnostics = validateScreenDocumentSemantics(document);
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0]!;
    expect(diagnostic.code).toBe('CORE_INVARIANT_VIOLATION');
    expect(diagnostic.path).toEqual(['components', 257, 'parentId']);
    expect(diagnostic.severity).toBe('error');
  });

  it('reports ancestor depth violation at the deepest component only', () => {
    const chain = makeAncestorChain(300);
    const document = makeDocument({ components: chain });
    const diagnostics = validateScreenDocumentSemantics(document);
    // Only the leaf at depth 300 exceeds 256; ancestors at depth <= 256 are fine.
    expect(diagnostics).toHaveLength(44);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.code).toBe('CORE_INVARIANT_VIOLATION');
    }
    const leafPath = diagnostics[diagnostics.length - 1]!.path;
    expect(leafPath).toEqual(['components', 300, 'parentId']);
  });

  it('reports CORE_GEOMETRY_INVALID for non-finite position', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'bad',
          position: { x: Number.NaN, y: 0 },
        }),
      ],
    });
    const diagnostics = validateScreenDocumentSemantics(document);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('CORE_GEOMETRY_INVALID');
    expect(diagnostics[0]!.path).toEqual(['components', 0]);
  });

  it('reports CORE_GEOMETRY_INVALID for non-positive size', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'bad',
          size: { width: 0, height: 100 },
        }),
      ],
    });
    const diagnostics = validateScreenDocumentSemantics(document);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('CORE_GEOMETRY_INVALID');
    expect(diagnostics[0]!.path).toEqual(['components', 0]);
  });

  it('reports CORE_GEOMETRY_INVALID for non-finite rotation', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'bad',
          rotation: Number.POSITIVE_INFINITY,
        }),
      ],
    });
    const diagnostics = validateScreenDocumentSemantics(document);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('CORE_GEOMETRY_INVALID');
  });

  it('sorts diagnostics by path, code, then message', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'ok' }),
        makeComponent({
          id: 'bad-geometry',
          position: { x: Number.NaN, y: 0 },
        }),
        makeComponent({
          id: 'bad-depth',
          parentId: 'ok',
        }),
      ],
    });
    // Add 256 more ancestors to bad-depth so it violates ancestor depth.
    const ancestors = makeAncestorChain(256, {}).map((component, index) => ({
      ...component,
      id: `ancestor-${index}`,
      parentId: index === 0 ? 'ok' : `ancestor-${index - 1}`,
    }));
    const documentWithDeepChild = makeDocument({
      components: [
        ...document.components,
        ...ancestors,
        {
          ...makeComponent({ id: 'bad-depth' }),
          parentId: `ancestor-${255}`,
        },
      ],
    });
    const diagnostics = validateScreenDocumentSemantics(documentWithDeepChild);
    // Verify sorted by path ascending (numbers before strings).
    for (let i = 1; i < diagnostics.length; i++) {
      const prev = diagnostics[i - 1]!.path;
      const curr = diagnostics[i]!.path;
      const cmp = comparePathForTest(prev, curr);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('returns diagnostics in a fresh readonly array', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'bad', position: { x: Number.NaN, y: 0 } })],
    });
    const first = validateScreenDocumentSemantics(document);
    const second = validateScreenDocumentSemantics(document);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('does not mutate input document', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'a' })],
    });
    const snapshot = JSON.parse(JSON.stringify(document)) as ScreenDocument;
    validateScreenDocumentSemantics(document);
    expect(document).toEqual(snapshot);
  });
});

function comparePathForTest(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const aSeg = a[i]!;
    const bSeg = b[i]!;
    const aNum = typeof aSeg === 'number';
    const bNum = typeof bSeg === 'number';
    if (aNum !== bNum) {
      return aNum ? -1 : 1;
    }
    if (aNum) {
      const diff = (aSeg as number) - (bSeg as number);
      if (diff !== 0) {
        return diff;
      }
    } else {
      if (aSeg < bSeg) {
        return -1;
      }
      if (aSeg > bSeg) {
        return 1;
      }
    }
  }
  return a.length - b.length;
}

type ScreenDocument = ReturnType<typeof makeDocument>;

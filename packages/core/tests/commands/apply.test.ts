import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyScreenDocumentCommand,
  applyScreenDocumentTransaction,
} from '../../src/commands/apply.js';
import type { ScreenCanvasPatch } from '../../src/commands/types.js';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';

function documentWithComponents() {
  return makeDocument({
    components: [
      makeComponent({ id: 'group' }),
      makeComponent({ id: 'child', parentId: 'group' }),
      makeComponent({ id: 'other', position: { x: 400, y: 0 } }),
    ],
  });
}

describe('applyScreenDocumentCommand', () => {
  it('updates multiple components atomically in document order', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['other', 'group', 'other'],
      patch: { position: { x: 20, y: 30 } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedComponentIds).toEqual(['group', 'other']);
      expect(result.document.components[0]?.position).toEqual({ x: 20, y: 30 });
      expect(result.document.components[2]?.position).toEqual({ x: 20, y: 30 });
      expect(document.components[0]?.position).toEqual({ x: 0, y: 0 });
    }
  });

  it('returns the original document when one target is missing', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['group', 'missing'],
      patch: { name: 'Changed' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.document).toBe(document);
      expect(result.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_MISSING');
    }
  });

  it('inherits locked state and blocks descendant mutation or removal', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'group', status: { locked: true, hidden: false } }),
        makeComponent({ id: 'child', parentId: 'group' }),
      ],
    });
    const update = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['child'],
      patch: { name: 'Changed' },
    });
    const remove = applyScreenDocumentCommand(document, {
      type: 'remove-components',
      componentIds: ['group'],
    });

    expect(update.ok).toBe(false);
    expect(remove.ok).toBe(false);
    if (!remove.ok) {
      expect(remove.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_LOCKED');
    }
  });

  it('permits status-only patches on effectively locked targets', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'group', status: { locked: true, hidden: false } }),
        makeComponent({ id: 'child', parentId: 'group' }),
      ],
    });
    const unlock = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['group'],
      patch: { status: { locked: false, hidden: false } },
    });
    const hide = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['child'],
      patch: { status: { locked: false, hidden: true } },
    });

    expect(unlock.ok).toBe(true);
    if (unlock.ok) {
      expect(unlock.document.components[0]?.status.locked).toBe(false);
      expect(unlock.changedComponentIds).toEqual(['group']);
    }
    expect(hide.ok).toBe(true);
    if (hide.ok) {
      expect(hide.document.components[1]?.status.hidden).toBe(true);
    }
  });

  it('still blocks geometry or name patches on effectively locked targets', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'group', status: { locked: true, hidden: false } }),
        makeComponent({ id: 'child', parentId: 'group' }),
      ],
    });
    const move = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['child'],
      patch: { position: { x: 10, y: 10 } },
    });
    const rename = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['group'],
      patch: { name: 'Changed' },
    });

    expect(move.ok).toBe(false);
    if (!move.ok) expect(move.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_LOCKED');
    expect(rename.ok).toBe(false);
    if (!rename.ok) expect(rename.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_LOCKED');
  });

  it('removes descendants and reports them in source order', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'remove-components',
      componentIds: ['group'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedComponentIds).toEqual(['group', 'child']);
      expect(result.document.components.map(({ id }) => id)).toEqual(['other']);
    }
  });

  it('reparents only outer targets without changing canvas coordinates', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'reparent-components',
      componentIds: ['group', 'child'],
      parentId: 'other',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedComponentIds).toEqual(['group']);
      expect(result.document.components[0]?.parentId).toBe('other');
      expect(result.document.components[1]?.parentId).toBe('group');
      expect(result.document.components[0]?.position).toEqual(document.components[0]?.position);
    }
  });

  it('permits reparenting hidden components without changing canvas coordinates', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'visible' }),
        makeComponent({ id: 'hidden-parent', status: { locked: false, hidden: true } }),
        makeComponent({ id: 'hidden-child', parentId: 'hidden-parent' }),
      ],
    });
    const target = applyScreenDocumentCommand(document, {
      type: 'reparent-components',
      componentIds: ['hidden-child'],
      parentId: null,
    });
    const parent = applyScreenDocumentCommand(document, {
      type: 'reparent-components',
      componentIds: ['visible'],
      parentId: 'hidden-parent',
    });

    expect(target.ok).toBe(true);
    expect(parent.ok).toBe(true);
    if (target.ok && parent.ok) {
      expect(target.document.components[2]?.parentId).toBeNull();
      expect(parent.document.components[0]?.parentId).toBe('hidden-parent');
    }
  });

  it('treats identical patches as a no-op', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: { width: 1920 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toBe(document);
      expect(result.changedComponentIds).toEqual([]);
    }
  });

  it('uses Contracts validation for replacement values', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'replace-variables',
      variables: [makeVariable({ name: 'invalid-name' })],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.document).toBe(document);
      expect(result.diagnostics[0]?.code).toBe('VARIABLE_NAME_INVALID');
    }
  });

  it('AE-CR-C02 replaces a canonical blueprint as one command', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentCommand(document, {
      type: 'replace-blueprint',
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'group', eventName: 'valueClick' },
            actions: [],
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.blueprint.rules[0]?.id).toBe('rule-1');
  });

  it('does not retain mutable command JSON references', () => {
    const document = documentWithComponents();
    const props = { value: 1 };
    const result = applyScreenDocumentCommand(document, {
      type: 'update-components',
      componentIds: ['other'],
      patch: { props },
    });
    props.value = 2;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.components[2]?.props).toEqual({ value: 1 });
    }
  });
});

describe('applyScreenDocumentTransaction', () => {
  it('rolls back the full transaction at the first failed command', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentTransaction(document, {
      commands: [
        { type: 'update-components', componentIds: ['group'], patch: { name: 'First' } },
        { type: 'update-components', componentIds: ['missing'], patch: { name: 'Second' } },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.document).toBe(document);
      expect(result.failedCommandIndex).toBe(1);
      expect(result.diagnostics[0]?.path).toEqual(['commands', 1, 'componentIds']);
    }
  });

  it('reports only final net component changes', () => {
    const document = makeDocument();
    const component = makeComponent({ id: 'temporary' });
    const result = applyScreenDocumentTransaction(document, {
      commands: [
        { type: 'add-component', component },
        { type: 'remove-components', componentIds: ['temporary'] },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.components).toEqual([]);
      expect(result.changedComponentIds).toEqual([]);
      expect(parseScreenDocument(result.document).ok).toBe(true);
    }
  });

  it('omits components restored to their original value from net changes', () => {
    const document = documentWithComponents();
    const result = applyScreenDocumentTransaction(document, {
      commands: [
        { type: 'update-components', componentIds: ['group'], patch: { name: 'Changed' } },
        { type: 'update-components', componentIds: ['group'], patch: { name: 'Component group' } },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).not.toBe(document);
      expect(result.changedComponentIds).toEqual([]);
    }
  });

  it('rejects transaction command count over the limit', () => {
    const result = applyScreenDocumentTransaction(makeDocument(), {
      commands: Array.from({ length: 1001 }, () => ({ type: 'update-canvas' as const, patch: {} })),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('CORE_COMMAND_LIMIT_EXCEEDED');
    }
  });
});

describe('applyScreenDocumentCommand update-canvas background image', () => {
  const canvas = { width: 1920, height: 1080, backgroundColor: '#000000' };

  it('sets the background image and fit via an exact patch', () => {
    const document = makeDocument({ canvas: { ...canvas } });
    const result = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: { backgroundImage: 'https://cdn.x/screens/bg.png', backgroundImageFit: 'contain' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.canvas.backgroundImage).toBe('https://cdn.x/screens/bg.png');
      expect(result.document.canvas.backgroundImageFit).toBe('contain');
      expect(document.canvas.backgroundImage).toBeUndefined();
    }
  });

  it('sets and clears structured canvas backgrounds through the same patch', () => {
    const document = makeDocument({ canvas: { ...canvas } });
    const set = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: {
        background: {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { color: '#000000', position: 0 },
            { color: '#ffffff', position: 100 },
          ],
        },
      },
    });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.document.canvas.background?.type).toBe('linear-gradient');

    const clear = applyScreenDocumentCommand(set.document, {
      type: 'update-canvas',
      patch: { background: null },
    });
    expect(clear.ok).toBe(true);
    if (clear.ok) {
      expect(clear.document.canvas.background).toBeUndefined();
      expect(clear.document.canvas.backgroundColor).toBe('#000000');
    }
  });

  it('rejects malformed structured backgrounds without changing the document', () => {
    const document = makeDocument({ canvas: { ...canvas } });
    const result = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: {
        background: {
          type: 'radial-gradient',
          position: { x: 50, y: 50 },
          stops: [{ color: '#000000', position: 0 }],
        },
      } as unknown as ScreenCanvasPatch,
    });
    expect(result.ok).toBe(false);
    expect(result.document).toBe(document);
  });

  it('removes the background image when the patch value is null', () => {
    const document = makeDocument({
      canvas: { ...canvas, backgroundImage: 'https://cdn.x/bg.png', backgroundImageFit: 'cover' },
    });
    const result = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: { backgroundImage: null, backgroundImageFit: null },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.canvas.backgroundImage).toBeUndefined();
      expect(result.document.canvas.backgroundImageFit).toBeUndefined();
      expect(parseScreenDocument(result.document).ok).toBe(true);
    }
  });

  it('fails atomically on an invalid background image or fit', () => {
    const patches: ScreenCanvasPatch[] = [
      { backgroundImage: 'javascript:alert(1)' },
      { backgroundImage: 'a.png' },
      { backgroundImage: `https://x/${'a'.repeat(2049)}` },
      { backgroundImageFit: 'fill' } as unknown as ScreenCanvasPatch,
    ];
    for (const patch of patches) {
      const document = makeDocument({ canvas: { ...canvas } });
      const result = applyScreenDocumentCommand(document, {
        type: 'update-canvas',
        patch,
      });
      expect(result.ok).toBe(false);
      expect(result.document).toBe(document);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      }
    }
  });

  it('treats empty and equal patches as no-op successes', () => {
    const document = makeDocument({
      canvas: { ...canvas, backgroundImage: 'https://cdn.x/bg.png' },
    });
    const empty = applyScreenDocumentCommand(document, { type: 'update-canvas', patch: {} });
    const equal = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: { backgroundImage: 'https://cdn.x/bg.png' },
    });
    // 文档本就未声明背景时，删除 patch 也是 no-op。
    const plain = makeDocument({ canvas: { ...canvas } });
    const removeAbsent = applyScreenDocumentCommand(plain, {
      type: 'update-canvas',
      patch: { backgroundImage: null, backgroundImageFit: null },
    });

    expect(empty.ok).toBe(true);
    expect(equal.ok).toBe(true);
    expect(removeAbsent.ok).toBe(true);
    if (empty.ok) expect(empty.document).toBe(document);
    if (equal.ok) expect(equal.document).toBe(document);
    if (removeAbsent.ok) expect(removeAbsent.document).toBe(plain);
  });

  it('rejects unknown canvas patch fields', () => {
    const document = makeDocument({ canvas: { ...canvas } });
    const result = applyScreenDocumentCommand(document, {
      type: 'update-canvas',
      patch: { backgroundUrl: 'https://x/bg.png' } as unknown as ScreenCanvasPatch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.document).toBe(document);
      expect(result.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
    }
  });
});

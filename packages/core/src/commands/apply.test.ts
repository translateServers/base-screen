import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';
import { applyScreenDocumentCommand, applyScreenDocumentTransaction } from './apply.js';

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

  it('replaces a canonical blueprint as one command', () => {
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

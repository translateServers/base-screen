import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentCommand } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  buildTextEditCommand,
  isTextEditableComponent,
} from '../../../src/common/operations/designer-text-edit-operations.js';

function component(
  id: string,
  dataSource: ScreenComponentNode['dataSource'],
  type = 'base.text',
): ScreenComponentNode {
  return {
    id,
    type,
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('designer text edit operations', () => {
  it('is editable only for base.text with a static string data source', () => {
    const source = document([
      component('static-text', { type: 'static', value: '标题' }),
      component('static-number', { type: 'static', value: 42 }),
      component('host-text', {
        type: 'host-resource',
        resourceType: 'dataset',
        resourceId: 'r',
        params: {},
        binding: { fields: {} },
      }),
      component('no-data', null),
      component('shape', { type: 'static', value: '矩形' }, 'base.rectangle'),
    ]);

    expect(isTextEditableComponent(source, 'static-text')).toBe(true);
    expect(isTextEditableComponent(source, 'static-number')).toBe(false);
    expect(isTextEditableComponent(source, 'host-text')).toBe(false);
    expect(isTextEditableComponent(source, 'no-data')).toBe(false);
    expect(isTextEditableComponent(source, 'shape')).toBe(false);
    expect(isTextEditableComponent(source, 'missing')).toBe(false);
  });

  it('builds an update-components command patching dataSource to the edited text', () => {
    const source = document([component('static-text', { type: 'static', value: '旧文本' })]);

    const result = buildTextEditCommand(source, 'static-text', '新文本');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      type: 'update-components',
      componentIds: ['static-text'],
      patch: { dataSource: { type: 'static', value: '新文本' } },
    });
    const applied = applyScreenDocumentCommand(source, result.value);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document.components[0]?.dataSource).toEqual({ type: 'static', value: '新文本' });
  });

  it('supports empty text (clearing the component text)', () => {
    const source = document([component('static-text', { type: 'static', value: '旧文本' })]);
    const result = buildTextEditCommand(source, 'static-text', '');
    expect(result.ok).toBe(true);
  });

  it('rejects non-editable components with a diagnostic', () => {
    const source = document([
      component('host-text', {
        type: 'host-resource',
        resourceType: 'dataset',
        resourceId: 'r',
        params: {},
        binding: { fields: {} },
      }),
      component('shape', { type: 'static', value: '矩形' }, 'base.rectangle'),
    ]);

    const hostResult = buildTextEditCommand(source, 'host-text', '新文本');
    expect(hostResult.ok).toBe(false);
    if (hostResult.ok) return;
    expect(hostResult.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');

    const shapeResult = buildTextEditCommand(source, 'shape', '新文本');
    expect(shapeResult.ok).toBe(false);

    const missingResult = buildTextEditCommand(source, 'missing', '新文本');
    expect(missingResult.ok).toBe(false);
  });

  it('rejects editing a locked component via the command application path', () => {
    const source = document([component('locked-text', { type: 'static', value: '锁定的标题' })]);
    const locked = {
      ...source,
      components: [{ ...source.components[0]!, status: { locked: true, hidden: false } }],
    };
    const result = buildTextEditCommand(locked, 'locked-text', '改');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applied = applyScreenDocumentCommand(locked, result.value);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_LOCKED');
  });
});

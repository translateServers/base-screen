import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction, type ScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeDesignerAutoWidthTransaction,
  projectDesignerAutoWidths,
} from '../../../../src/common/operations/element/designer-auto-width.js';
import { createDesignerSizeEntryTransaction } from '../../../../src/common/operations/element/designer-coordinate-entry.js';
import {
  createTransformTransaction,
  resizeScreenComponents,
} from '../../../../src/common/operations/element/designer-transform.js';
import {
  createGroupSizeTransaction,
  withDerivedDesignerGroupBounds,
} from '../../../../src/common/operations/selection/designer-group.js';
import { createMultiSelectionGeometryTransaction } from '../../../../src/common/operations/selection/designer-multi-selection-operations.js';
import { DesignerSession } from '../../../../src/common/session/designer-session.js';

function component(id = 'text', patch: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 72 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: { autoWidth: true },
    style: {},
    dataSource: { type: 'static', value: '中文 text' },
    ...patch,
  };
}

function document(components = [component()]): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components,
    dataSources: [],
    variables: [],
    blueprint: { relations: [] },
  };
}

function update(patch: Partial<ScreenComponentNode>): ScreenDocumentTransaction {
  return { commands: [{ type: 'update-components', componentIds: ['text'], patch }] };
}

describe('text automatic width geometry', () => {
  it('projects only opted-in official text without changing canonical data or other dimensions', () => {
    const source = document([
      component(),
      component('fixed', { props: {} }),
      component('custom', { type: 'acme.text' }),
    ]);
    const serialized = JSON.stringify(source);
    const geometry = projectDesignerAutoWidths(
      source,
      new Map([
        ['text', 125.625],
        ['fixed', 500],
        ['custom', 500],
      ]),
    );
    expect(geometry.components[0]).toEqual({
      ...source.components[0],
      size: { width: 125.63, height: 72 },
    });
    expect(geometry.components[1]).toBe(source.components[1]);
    expect(geometry.components[2]).toBe(source.components[2]);
    expect(JSON.stringify(source)).toBe(serialized);
    expect(projectDesignerAutoWidths(source, new Map())).toBe(source);
    expect(projectDesignerAutoWidths(source, new Map([['text', Number.NaN]]))).toBe(source);
  });

  it('keeps observed sizes within the geometry limits', () => {
    const source = document();
    expect(
      projectDesignerAutoWidths(source, new Map([['text', 0]])).components[0]?.size.width,
    ).toBe(1);
    expect(
      projectDesignerAutoWidths(source, new Map([['text', 2e6]])).components[0]?.size.width,
    ).toBe(1e6);
  });

  it('freezes the current displayed width when the option is disabled', () => {
    const source = document();
    const geometry = projectDesignerAutoWidths(source, new Map([['text', 125.63]]));
    const transaction = normalizeDesignerAutoWidthTransaction(
      source,
      geometry,
      update({ props: { autoWidth: false } }),
    );
    expect(transaction.commands).toEqual([
      {
        type: 'update-components',
        componentIds: ['text'],
        patch: { props: { autoWidth: false }, size: { width: 125.63, height: 72 } },
      },
    ]);
  });

  it('keeps automatic mode and the saved width on height-only quick entry', () => {
    const source = document();
    const geometry = projectDesignerAutoWidths(source, new Map([['text', 125.63]]));
    const entry = createDesignerSizeEntryTransaction(
      geometry,
      { selectedComponentIds: ['text'], focusedComponentId: 'text' },
      undefined,
      { width: 125.63, height: 120 },
    )!;
    const result = applyScreenDocumentTransaction(
      source,
      normalizeDesignerAutoWidthTransaction(source, geometry, entry),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[0]?.size).toEqual({ width: 320, height: 120 });
    expect(result.document.components[0]?.props.autoWidth).toBe(true);
  });

  it('disables automatic width in one undoable transaction when width is edited', () => {
    const source = document();
    const geometry = projectDesignerAutoWidths(source, new Map([['text', 125.63]]));
    const change = vi.fn();
    const session = new DesignerSession({
      renderDocument: () => ({ ok: true, value: undefined, diagnostics: [] }),
      renderInteraction: () => {},
      emitChange: change,
      emitSelectionChange: () => {},
      onProjectChange: () => {},
      onDirtyChange: () => {},
      onConflict: () => {},
      onReady: () => {},
    });
    session.replaceDocument(source);
    change.mockClear();
    const transaction = normalizeDesignerAutoWidthTransaction(
      source,
      geometry,
      update({ size: { width: 250, height: 72 } }),
    );
    expect(session.executeTransaction(transaction).ok).toBe(true);
    expect(session.document?.components[0]).toMatchObject({
      size: { width: 250, height: 72 },
      props: { autoWidth: false },
    });
    expect(change).toHaveBeenCalledTimes(1);
    session.undo();
    expect(session.document).toEqual(source);
    expect(session.canUndo).toBe(false);
    session.redo();
    expect(session.document?.components[0]?.props.autoWidth).toBe(false);
  });

  it('keeps fractional automatic width when a vertical resize uses the pixel grid', () => {
    const source = document();
    const geometry = projectDesignerAutoWidths(source, new Map([['text', 125.63]]));
    const after = resizeScreenComponents(
      geometry.components,
      'south',
      { x: 0, y: 100 },
      {
        shift: false,
        alt: false,
      },
    );
    const transaction = normalizeDesignerAutoWidthTransaction(
      source,
      geometry,
      createTransformTransaction(geometry.components, after),
    );
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[0]).toMatchObject({
      size: { width: 320, height: 100 },
      props: { autoWidth: true },
    });
  });

  it('uses rendered widths for group scaling while preserving locked children', () => {
    const source = document([
      component('group', { type: 'base.container', props: {}, size: { width: 200, height: 100 } }),
      component('text', { parentId: 'group' }),
      component('locked', { parentId: 'group', status: { locked: true, hidden: false } }),
    ]);
    const geometry = projectDesignerAutoWidths(
      source,
      new Map([
        ['text', 125.63],
        ['locked', 80],
      ]),
    );
    const transaction = normalizeDesignerAutoWidthTransaction(
      source,
      geometry,
      createGroupSizeTransaction(geometry, 'group', { width: 400, height: 100 })!,
    );
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[1]).toMatchObject({
      size: { width: 251.26, height: 72 },
      props: { autoWidth: false },
    });
    expect(result.document.components[2]).toEqual(source.components[2]);
  });

  it('normalizes multi-selection height edits independently from their stored widths', () => {
    const source = document([
      component(),
      component('other', { size: { width: 500, height: 72 } }),
    ]);
    const geometry = projectDesignerAutoWidths(
      source,
      new Map([
        ['text', 125.63],
        ['other', 80],
      ]),
    );
    const edit = createMultiSelectionGeometryTransaction(
      geometry,
      ['text', 'other'],
      'height',
      100,
    )!;
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const result = applyScreenDocumentTransaction(
      source,
      normalizeDesignerAutoWidthTransaction(source, geometry, edit.value),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.document.components.map((item) => [
        item.size.width,
        item.size.height,
        item.props.autoWidth,
      ]),
    ).toEqual([
      [320, 100, true],
      [500, 100, true],
    ]);
  });

  it('derives group bounds from rendered children without persisting their projected widths', () => {
    const source = document([
      component('group', {
        type: 'base.container',
        props: {},
        size: { width: 125.63, height: 72 },
      }),
      component('text', { parentId: 'group' }),
    ]);
    const transaction = withDerivedDesignerGroupBounds(
      source,
      update({ position: { x: 10, y: 20 } }),
      'base.container',
      (next) => projectDesignerAutoWidths(next, new Map([['text', 125.63]])),
    );
    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[0]).toMatchObject({
      position: { x: 10, y: 20 },
      size: { width: 125.63, height: 72 },
    });
    expect(result.document.components[1]).toMatchObject({
      position: { x: 10, y: 20 },
      size: { width: 320, height: 72 },
      props: { autoWidth: true },
    });
  });

  it('归一化只重写 commands，不丢 provenance', () => {
    const source = document();
    const geometry = document();
    const transaction: ScreenDocumentTransaction = {
      commands: [
        {
          type: 'update-components',
          componentIds: ['text'],
          patch: { position: { x: 4, y: 8 } },
        },
      ],
      provenance: { source: 'agent', label: '采纳智能体提案' },
    };
    const normalized = normalizeDesignerAutoWidthTransaction(source, geometry, transaction);
    // 采纳智能体提案在历史里必须记成 agent；早先这里只回传 { commands }，
    // 上层兜底成 manual，等于把自动提案记成了人工编辑。
    expect(normalized.provenance).toEqual({ source: 'agent', label: '采纳智能体提案' });
    expect(normalized.commands.length).toBeGreaterThan(0);
  });
});

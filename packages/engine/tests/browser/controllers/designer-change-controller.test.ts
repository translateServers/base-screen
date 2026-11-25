import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction, type ScreenHistoryNode } from '@base-screen/core';
import { describe, expect, it, vi } from 'vitest';
import {
  DesignerChangeController,
  designerChangeMarks,
} from '../../../src/browser/controllers/designer-change-controller.js';
import {
  type DesignerChangeProposalInput,
  prepareDesignerChangeProposal,
} from '../../../src/common/operations/change/designer-change-proposal.js';

class FakeElement {
  innerHTML = '';
  hidden = false;
  className = '';
  textContent = '';
  readonly parentElement = null;
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly ownerDocument = { createElement: () => new FakeElement() };
  querySelector(): null {
    return null;
  }
  querySelectorAll(): never[] {
    return [];
  }
  closest(): null {
    return null;
  }
  prepend(): void {}
  append(): void {}
  replaceChildren(): void {}
}

function component(id: string): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 30 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: { text: id },
    style: {},
    dataSource: null,
  };
}

function harness() {
  let document: ScreenDocument = {
    canvas: { width: 960, height: 540, backgroundColor: '#ffffff' },
    components: [component('a'), component('b')],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
  const input: DesignerChangeProposalInput = {
    title: 'Rename',
    rationale: 'Test',
    scope: 'Screen',
    commands: ['a', 'b'].map((id) => ({
      type: 'update-components',
      componentIds: [id],
      patch: { name: `${id} updated` },
    })),
  };
  const prepared = prepareDesignerChangeProposal(document, input, 'draft');
  if (!prepared.ok) throw new Error('Invalid fixture');
  const controller = new DesignerChangeController();
  const pane = new FakeElement();
  controller.connect(
    new FakeElement() as unknown as HTMLElement,
    pane as unknown as HTMLElement,
    new FakeElement() as unknown as HTMLElement,
    new FakeElement() as unknown as HTMLElement,
  );
  const render = vi.fn(() => true);
  const clear = vi.fn();
  const metric = vi.fn();
  controller.setGhostHandlers({ render, clear });
  controller.setMetricHandler(metric);
  controller.setDocumentReader(() => document);
  controller.setAdoptHandler((commands, provenance) => {
    const result = applyScreenDocumentTransaction(document, { commands, provenance });
    if (result.ok) document = result.document;
    return { ok: result.ok };
  });
  const submit = () => controller.submit(prepared.value, input);
  return {
    controller,
    pane,
    render,
    clear,
    metric,
    input,
    proposal: prepared.value,
    submit,
    setDocument: (value: ScreenDocument) => {
      document = value;
    },
    getDocument: () => document,
  };
}

describe('designer change controller', () => {
  it('rejects replacement without touching the pending draft or ghost', () => {
    const h = harness();
    expect(h.submit()).toBe(true);
    h.controller.requestAdoptAll();
    h.render.mockClear();
    expect(h.controller.submit({ ...h.proposal, id: 'replacement' }, h.input)).toBe(false);
    expect(h.controller.pending).toBe(h.proposal);
    expect(h.render).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.controller.paneMode).toBe('intent');
    expect(h.pane.innerHTML).toContain('data-change-feedback="draft-pending"');
    expect(h.metric.mock.calls).toEqual([['draft_created']]);
    expect(h.controller.adoptAll()).toBe(true);
  });

  it('keeps a failed unit pending with feedback inside its row', () => {
    const h = harness();
    h.submit();
    h.controller.setAdoptHandler(() => ({ ok: false }));
    expect(h.controller.adoptUnit('a')).toBe(false);
    expect(h.controller.pending).toBe(h.proposal);
    expect(h.pane.innerHTML).toMatch(
      /data-change-unit-row="a"[\s\S]*data-change-feedback="adopt-failed"[\s\S]*data-change-unit-row="b"/,
    );
    expect(h.metric.mock.calls).toEqual([['draft_created']]);
    expect(h.clear).not.toHaveBeenCalled();
  });

  it('renders the failure reason inside the failed unit row', () => {
    const h = harness();
    h.submit();
    h.controller.setAdoptHandler(() => ({ ok: false, reason: '选中组件已锁定。' }));
    expect(h.controller.adoptUnit('a')).toBe(false);
    expect(h.pane.innerHTML).toMatch(
      /data-change-unit-row="a"[\s\S]*采纳未成功：选中组件已锁定。草案仍保留，可修改后重试。[\s\S]*data-change-unit-row="b"/,
    );
  });

  it('renders the failure reason for a failed bulk adoption', () => {
    const h = harness();
    h.submit();
    h.controller.setAdoptHandler(() => ({ ok: false, reason: '选中组件已锁定。' }));
    expect(h.controller.adoptAllDirect()).toBe(false);
    expect(h.pane.innerHTML).toContain('采纳未成功：选中组件已锁定。草案仍保留，可修改后重试。');
  });

  it('reports successful adoption even when remaining commands become invalid', () => {
    const h = harness();
    h.submit();
    h.controller.setAdoptHandler(() => {
      h.setDocument({ ...h.getDocument(), components: [component('a')] });
      return { ok: true };
    });
    expect(h.controller.adoptUnit('a')).toBe(true);
    expect(h.controller.pending).toBeUndefined();
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.pane.innerHTML).toContain('data-change-feedback="remaining-invalid"');
    expect(h.metric.mock.calls).toEqual([['draft_created'], ['change_adopt']]);
    h.controller.setPaneMode('inspector');
    h.controller.setPaneMode('intent');
    expect(h.pane.innerHTML).toContain('data-change-feedback="remaining-invalid"');
    expect(h.pane.innerHTML).not.toContain('change-start-card');
  });

  it('also reports ghost remount failure instead of silently removing the remainder', () => {
    const h = harness();
    h.submit();
    h.render.mockReturnValue(false);
    expect(h.controller.rejectUnit('a')).toBe(true);
    expect(h.pane.innerHTML).toContain('data-change-feedback="remaining-invalid"');
    expect(h.metric.mock.calls).toEqual([['draft_created'], ['change_reject']]);
  });

  it('counts bulk adoption as adoption, not discard', () => {
    const h = harness();
    h.submit();
    expect(h.controller.adoptAllDirect()).toBe(true);
    expect(h.metric.mock.calls).toEqual([['draft_created'], ['change_adopt']]);
  });

  it('does not count exhaustion through adoption or rejection as discard', () => {
    const h = harness();
    h.submit();
    expect(h.controller.adoptUnit('a')).toBe(true);
    expect(h.controller.rejectUnit('b')).toBe(true);
    expect(h.controller.pending).toBeUndefined();
    expect(h.metric.mock.calls).toEqual([['draft_created'], ['change_adopt'], ['change_reject']]);
  });

  it('counts explicit discard once and clears old feedback on the next proposal', () => {
    const h = harness();
    h.submit();
    h.submit();
    h.controller.discard();
    h.controller.discard();
    expect(h.metric.mock.calls).toEqual([['draft_created'], ['draft_discarded']]);
    h.submit();
    expect(h.pane.innerHTML).not.toContain('data-change-feedback');
  });

  it('retains a failed bulk adoption and reports it without adoption metrics', () => {
    const h = harness();
    h.submit();
    h.controller.setAdoptHandler(() => ({ ok: false }));
    expect(h.controller.adoptAllDirect()).toBe(false);
    expect(h.controller.pending).toBe(h.proposal);
    expect(h.pane.innerHTML).toContain('data-change-feedback="adopt-failed"');
    expect(h.metric.mock.calls).toEqual([['draft_created']]);
  });

  it('only sends existing past nodes to the revert handler', () => {
    const h = harness();
    const nodes: ScreenHistoryNode[] = [
      { index: 0, position: 'past' },
      { index: 1, position: 'current' },
      { index: 2, position: 'future' },
    ];
    const revert = vi.fn();
    h.controller.setHistoryControls(() => nodes, revert);
    const click = (index: string) =>
      h.controller.onClick({
        closest: (selector: string) =>
          selector === '[data-change-action]'
            ? { dataset: { changeAction: 'revert-history', historyIndex: index } }
            : null,
      } as unknown as Element);
    for (const index of ['1', '2', '99', '-1', 'NaN']) click(index);
    expect(revert).not.toHaveBeenCalled();
    expect(h.metric).not.toHaveBeenCalled();
    click('0');
    expect(revert).toHaveBeenCalledExactlyOnceWith(0);
    expect(h.metric).toHaveBeenCalledExactlyOnceWith('revert');
  });
});

describe('designer change marks (ADR-0111 §2.2)', () => {
  function screen(components: readonly ScreenComponentNode[]): ScreenDocument {
    return {
      canvas: { width: 960, height: 540, backgroundColor: '#ffffff' },
      components: [...components],
      variables: [],
      blueprint: { nodes: [], edges: [] },
      dataSources: [
        {
          id: 'orders',
          name: 'orders',
          source: { kind: 'dataset', datasetId: 'orders' },
          params: {},
        },
      ],
    };
  }

  function prepared(document: ScreenDocument, input: DesignerChangeProposalInput) {
    const result = prepareDesignerChangeProposal(document, input, 'marks');
    if (!result.ok) throw new Error('Invalid fixture');
    return result.value;
  }

  it('hides components that only read a changed data source', () => {
    const reader: ScreenComponentNode = {
      ...component('reader'),
      dataValue: { kind: 'data-source-field', dataSourceId: 'orders', path: [] },
    };
    const document = screen([reader, component('plain')]);
    const proposal = prepared(document, {
      title: '换数据源',
      rationale: '',
      scope: '数据',
      commands: [
        {
          type: 'replace-data-sources',
          dataSources: [
            {
              id: 'orders',
              name: 'orders',
              source: { kind: 'dataset', datasetId: 'orders-v2' },
              params: {},
            },
          ],
        },
      ],
    });

    // 组件 diff 里没有它，但草案层会按新值重画，旧组件必须让位。
    expect(proposal.diff.some((row) => row.componentId === 'reader')).toBe(false);
    expect(designerChangeMarks(proposal, false).supersededIds).toEqual(['reader']);
  });

  it('outlines removals but not during a whole-screen replacement', () => {
    const document = screen([component('a'), component('b')]);
    const removal = prepared(document, {
      title: '删 a',
      rationale: '',
      scope: '组件',
      commands: [{ type: 'remove-components', componentIds: ['a'] }],
    });
    expect(designerChangeMarks(removal, false)).toMatchObject({
      supersededIds: ['a'],
      removedIds: ['a'],
    });

    const replacement = prepared(document, {
      title: '整屏替换',
      rationale: '',
      scope: '整屏',
      commands: [
        { type: 'remove-components', componentIds: ['a', 'b'] },
        { type: 'add-component', component: component('c') },
      ],
    });
    expect(replacement.units[0]?.presentation?.kind).toBe('whole-screen-replacement');
    const marks = designerChangeMarks(replacement, true);
    // 旧组件照样隐藏，新增的不在隐藏名单里；轮廓不画，免得压住新版面。
    expect([...marks.supersededIds].sort()).toEqual(['a', 'b']);
    expect(marks.removedIds).toEqual([]);
    expect(marks.ghostHiddenIds).toEqual([]);
  });
});

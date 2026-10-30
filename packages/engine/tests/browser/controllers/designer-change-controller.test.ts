import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction, type ScreenHistoryNode } from '@base-screen/core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerChangeController } from '../../../src/browser/controllers/designer-change-controller.js';
import {
  type DesignerChangeProposalInput,
  prepareDesignerChangeProposal,
} from '../../../src/common/operations/change/designer-change-proposal.js';

class FakeElement {
  innerHTML = '';
  hidden = false;
  readonly dataset: Record<string, string> = {};
  querySelector(): null {
    return null;
  }
  querySelectorAll(): never[] {
    return [];
  }
  closest(): null {
    return null;
  }
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
    blueprint: { relations: [] },
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

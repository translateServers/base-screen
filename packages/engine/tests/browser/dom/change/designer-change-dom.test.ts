import { describe, expect, it } from 'vitest';
import type { ScreenDocument } from '@base-screen/contracts';
import {
  changePaneMarkup,
  draftBarMarkup,
} from '../../../../src/browser/dom/change/designer-change-dom.js';
import type { DesignerChangeProposal } from '../../../../src/common/operations/change/designer-change-proposal.js';

function proposal(origin?: { author?: string; approver?: string }): DesignerChangeProposal {
  const document: ScreenDocument = {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
  };
  return {
    id: 'change-1',
    title: '经营会 · KPI 两行',
    rationale: '投屏 3 m 时单卡太窄',
    scope: 'KPI 带',
    commands: [],
    candidate: document,
    affectedComponentIds: ['kpi'],
    diff: [],
    units: [{ id: 'unit-1', label: 'KPI 带', kind: 'changed', commandIndexes: [0], diff: [] }],
    provenance: { source: 'agent', label: '经营会 · KPI 两行' },
    ...(origin === undefined ? {} : { origin }),
  };
}

describe('change pane markup', () => {
  it('renders the origin line when the proposal carries one', () => {
    const html = changePaneMarkup(proposal({ author: '陈默', approver: '林岚' }), false, {
      reviewing: false,
      meta: {},
      total: 1,
    });
    expect(html).toContain('change-pane-origin');
    expect(html).toContain('发起 陈默 · 审批 林岚');
  });

  it('renders author only when no approver is given', () => {
    const html = changePaneMarkup(proposal({ author: '陈默' }), false, {
      reviewing: false,
      meta: {},
      total: 1,
    });
    expect(html).toContain('发起 陈默');
    expect(html).not.toContain('审批');
  });

  it('omits the origin line when the proposal has none', () => {
    const html = changePaneMarkup(proposal(), false, {
      reviewing: false,
      meta: {},
      total: 1,
    });
    expect(html).not.toContain('change-pane-origin');
  });
});

describe('history section', () => {
  const nodes = [
    { index: 0, position: 'past' as const },
    {
      index: 1,
      position: 'current' as const,
      provenance: { source: 'agent' as const, label: '经营会 · 整屏编排' },
    },
    { index: 2, position: 'future' as const, provenance: { source: 'manual' as const } },
  ];

  it('lists every node including the forward stack', () => {
    const html = changePaneMarkup(proposal(), false, undefined, nodes);
    expect(html).toContain('data-history-index="0"');
    expect(html).toContain('data-history-index="1"');
    expect(html).toContain('data-history-index="2"');
    expect(html).toContain('data-position="future"');
  });

  it('marks the current node and shows its provenance label', () => {
    const html = changePaneMarkup(proposal(), false, undefined, nodes);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('经营会 · 整屏编排');
    expect(html).toContain('agent');
  });

  it('does not render an empty history section', () => {
    expect(changePaneMarkup(proposal(), false, undefined, [])).not.toContain('change-history');
  });
});

describe('draft bar', () => {
  it('keeps aria-expanded in sync with the pane state', () => {
    expect(draftBarMarkup(proposal(), false, true)).toContain('aria-expanded="true"');
    expect(draftBarMarkup(proposal(), false, false)).toContain('aria-expanded="false"');
  });
});

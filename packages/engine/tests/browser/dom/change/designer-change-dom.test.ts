import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  changePaneMarkup,
  draftBarMarkup,
} from '../../../../src/browser/dom/change/designer-change-dom.js';
import type { DesignerChangeProposal } from '../../../../src/common/operations/change/designer-change-proposal.js';

function proposal(
  origin?: { author?: string; approver?: string },
  overrides: Partial<DesignerChangeProposal> = {},
): DesignerChangeProposal {
  const document: ScreenDocument = {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
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
    ...overrides,
  };
}

function changedUnit(
  entries: NonNullable<DesignerChangeProposal['units'][number]['diff'][number]['entries']>,
  overrides: Partial<DesignerChangeProposal['units'][number]> = {},
): DesignerChangeProposal['units'][number] {
  return {
    id: 'unit-1',
    label: 'KPI 带',
    kind: 'changed',
    commandIndexes: [0],
    diff: [{ componentId: 'kpi', componentName: 'KPI', kind: 'changed', entries }],
    ...overrides,
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
    expect(html).toContain('history-node-source">智能体</span>');
    expect(html).not.toContain('history-node-source">agent</span>');
  });

  it('renders history as a collapsed disclosure with a node count', () => {
    const html = changePaneMarkup(proposal(), false, undefined, nodes);
    expect(html).toContain('<details class="change-panel-section change-history">');
    expect(html).toContain('change-history-count">3 个节点</span>');
    expect(html).toContain('未来节点');
  });

  it('does not render an empty history section', () => {
    expect(changePaneMarkup(proposal(), false, undefined, [])).not.toContain('change-history');
  });

  it('keeps history visible with no draft, including empty and completed review', () => {
    expect(changePaneMarkup(undefined, false, undefined, nodes)).toContain('change-history');
    for (const total of [0, 2]) {
      expect(
        changePaneMarkup(undefined, false, { reviewing: true, meta: {}, total }, nodes),
      ).toContain('change-history');
    }
  });

  it('disables current and future nodes but allows past nodes', () => {
    const html = changePaneMarkup(undefined, false, undefined, nodes);
    expect(html).toMatch(/data-position="past"[^>]*>/);
    expect(html).not.toMatch(/data-position="past"[^>]*disabled/);
    expect(html).toMatch(/data-position="current"[^>]*disabled/);
    expect(html).toMatch(/data-position="future"[^>]*disabled/);
  });

  it('does not claim review completion when the remainder is invalidated', () => {
    const html = changePaneMarkup(
      undefined,
      false,
      { reviewing: true, meta: {}, total: 2 },
      nodes,
      { kind: 'remaining-invalid', remainingCount: 1 },
    );
    expect(html).toContain('data-change-feedback="remaining-invalid"');
    expect(html).toContain('data-change-action="exit-review"');
    expect(html).toContain('change-history');
    expect(html).not.toContain('change-empty-title');
  });
});

describe('draft bar', () => {
  it('keeps aria-expanded in sync with the pane state', () => {
    expect(draftBarMarkup(proposal(), false, true)).toContain('aria-expanded="true"');
    expect(draftBarMarkup(proposal(), false, false)).toContain('aria-expanded="false"');
  });

  it('moves bulk actions into the pane when it is open', () => {
    const open = draftBarMarkup(proposal(), false, true);
    expect(open).toContain('收起提案');
    expect(open).not.toContain('data-change-action="discard"');
    expect(open).not.toContain('data-change-action="request-adopt-all"');

    const closed = draftBarMarkup(proposal(), false, false);
    expect(closed).toContain('查看变更');
    expect(closed).toContain('data-change-action="discard"');
    expect(closed).toContain('data-change-action="request-adopt-all"');
  });

  it('folds scope and impact into the summary subline instead of a standalone segment', () => {
    const html = draftBarMarkup(proposal(), false, true);
    expect(html).toContain('class="draft-state"');
    expect(html).toContain('class="draft-summary"');
    expect(html).toContain('class="draft-sub"');
    expect(html).toContain('class="draft-actions"');
    // 影响数不再是独立分段：它和 scope 同处副行，把横向空间让给标题。
    expect(html).not.toContain('class="draft-meta"');
  });
});

describe('proposal disclosure and footer', () => {
  it('folds rationale and groups global actions in a footer row', () => {
    const html = changePaneMarkup(proposal(), false);
    expect(html).toContain('change-rationale');
    expect(html).toContain('<summary class="change-pane-disclosure-summary">');
    expect(html).toContain('修改依据');
    expect(html).toContain('change-panel-action-buttons');
  });

  it('keeps the review entry out of the scrolling change pane', () => {
    const html = changePaneMarkup(proposal(), false, {
      reviewing: false,
      meta: {},
      total: 1,
    });
    expect(html).toContain('change-pane-title');
    expect(html).not.toContain('data-review-toggle');
  });
});

describe('agent empty state', () => {
  it('renders the shared dashed empty state when whole-screen has no draft and no history', () => {
    const html = changePaneMarkup(undefined, false);
    expect(html).toContain('change-pane-title');
    expect(html).toContain('designer-empty-state');
    expect(html).toContain('暂无待处理提案，可在下方输入修改指令。');
    expect(html).not.toContain('change-start-card');
  });

  it('keeps history instead of covering it with the empty copy', () => {
    const nodes = [{ index: 0, position: 'past' as const }];
    const html = changePaneMarkup(undefined, false, undefined, nodes);
    expect(html).toContain('change-history');
    expect(html).not.toContain('designer-empty-state');
  });

  it('focuses component scope on editing the selection instead of whole-screen starters', () => {
    const html = changePaneMarkup(undefined, false, undefined, undefined, undefined, {
      kind: 'components',
      componentIds: ['title'],
    });
    // 组件作用域确实需要说清「改的是选中组件」，所以保留一行指导。
    expect(html).toContain('designer-empty-state');
    expect(html).toContain('描述要改的内容、样式或布局');
    expect(html).not.toContain('change-start-card');
  });
});

describe('change diff presentation', () => {
  it('maps technical paths and keeps the before/after structure intact', () => {
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          changedUnit([{ path: 'position.x', before: '40', after: '48' }], {
            label: 'KPI 带',
          }),
        ],
      }),
      false,
    );

    expect(html).toMatch(
      /class="change-diff-path">X<\/code>\s*<span class="change-diff-before">40<\/span>\s*<span class="change-diff-arrow"[^>]*>→<\/span>\s*<span class="change-diff-after">48<\/span>/,
    );
    expect(html).not.toContain('position.x');
  });

  it('formats value references without exposing raw JSON or internal kind names', () => {
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          changedUnit([
            {
              path: 'dataValue',
              before: '{"kind":"inline","value":"42"}',
              after: '{"kind":"variable","variableId":"region"}',
            },
            {
              path: 'dataValue',
              before: 'null',
              after: '{"kind":"data-source-field","dataSourceId":"sales","path":["total","value"]}',
            },
          ]),
        ],
      }),
      false,
    );

    expect(html).toContain('数据取值');
    expect(html).toContain('常量 · 42');
    expect(html).toContain('变量 · region');
    expect(html).toContain('数据源字段 · sales/total.value');
    expect(html).toContain('未设置');
    expect(html).not.toContain('{"kind"');
    expect(html).not.toContain('dataValue');
  });

  it('formats legacy data sources and dynamic prop and style paths', () => {
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          changedUnit([
            {
              path: 'dataSource',
              before: '{"type":"static","value":"#17212b"}',
              after: '{"type":"dataset","datasetId":"inventory","params":{},"binding":null}',
            },
            {
              path: 'dataSource',
              before: '{"type":"variable","variableId":"threshold"}',
              after:
                '{"type":"host-resource","resourceType":"image","resourceId":"cover","params":{},"binding":null}',
            },
            { path: 'props.customField', before: '"旧值"', after: '"新值"' },
            { path: 'style.fontSize', before: '24', after: '32' },
          ]),
        ],
      }),
      false,
    );

    expect(html).toContain('常量 · #17212b');
    expect(html).toContain('数据集 · inventory');
    expect(html).toContain('变量 · threshold');
    expect(html).toContain('资源 · image/cover');
    expect(html).toContain('属性 · customField');
    expect(html).toContain('样式 · 字号');
    expect(html).not.toContain('样式 · fontSize');
    expect(html).toContain('旧值');
    expect(html).not.toContain('dataSource');
    expect(html).not.toContain('customField"');
  });

  it('labels removed units and whole-screen replacements explicitly', () => {
    const removedHtml = changePaneMarkup(
      proposal(undefined, {
        units: [
          {
            id: 'removed',
            label: '背景、标题 等 74 个',
            kind: 'removed',
            commandIndexes: [0],
            diff: [{ componentId: 'old', componentName: '旧组件', kind: 'removed', entries: [] }],
          },
        ],
      }),
      false,
    );
    expect(removedHtml).toContain('删除旧组件');
    expect(removedHtml).toContain('删除此旧组件');
    expect(removedHtml).not.toContain('背景、标题 等 74 个');

    const replacementHtml = changePaneMarkup(
      proposal(undefined, {
        units: [
          {
            id: 'removed',
            label: '背景、标题 等 74 个',
            kind: 'removed',
            commandIndexes: [0],
            diff: [{ componentId: 'old', componentName: '旧组件', kind: 'removed', entries: [] }],
            presentation: { kind: 'whole-screen-replacement', addedCount: 12 },
          },
        ],
      }),
      false,
    );
    expect(replacementHtml).toContain('整屏替换 · 12 个组件');
    expect(replacementHtml).not.toContain('背景、标题 等 74 个');
    // 整屏替换只能整体采纳或放弃（ADR-0111 §2.1）：只读分组清单，没有逐项按钮。
    expect(replacementHtml).toContain('data-change-whole-screen-group="added"');
    expect(replacementHtml).toContain('新增 0');
    expect(replacementHtml).toContain('data-change-whole-screen-group="removed"');
    expect(replacementHtml).toContain('移除 1');
    expect(replacementHtml).toContain('旧组件');
    expect(replacementHtml).toContain('data-change-whole-screen-group="document"');
    expect(replacementHtml).toContain('画布与数据源');
    expect(replacementHtml).not.toContain('data-change-whole-screen-group="changed"');
    expect(replacementHtml).toContain('data-change-whole-screen-hint');
    expect(replacementHtml).not.toContain('data-change-action="adopt-unit"');
    expect(replacementHtml).not.toContain('data-change-action="reject-unit"');
    expect(replacementHtml).toContain('data-change-action="request-adopt-all"');
    // 徽标说「替换」而不是按 diff 推出来的「删除」/「新增」。
    expect(replacementHtml).toContain('<span class="change-diff-kind">替换</span>');
  });

  it('keeps the overflow count of a whole-screen list on one line', () => {
    const names = Array.from({ length: 8 }, (_, index) => `旧${index + 1}`);
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          {
            id: 'all',
            label: '',
            kind: 'removed',
            commandIndexes: [0],
            diff: names.map((name) => ({
              componentId: name,
              componentName: name,
              kind: 'removed' as const,
              entries: [],
            })),
            presentation: { kind: 'whole-screen-replacement', addedCount: 1 },
          },
        ],
      }),
      false,
    );
    expect(html).toContain('等\u00a08\u00a0个');
  });

  it('keeps whole-screen adoption and discard available in review mode', () => {
    const whole = proposal(undefined, {
      commands: [
        { type: 'update-canvas', patch: { backgroundColor: '#101820' } },
        { type: 'replace-data-sources', dataSources: [] },
      ],
      units: [
        {
          id: 'all',
          label: '',
          kind: 'changed',
          commandIndexes: [0, 1],
          diff: [
            { componentId: 'old', componentName: '旧组件', kind: 'removed', entries: [] },
            { componentId: 'new', componentName: '新组件', kind: 'added', entries: [] },
          ],
          presentation: { kind: 'whole-screen-replacement', addedCount: 1 },
        },
      ],
    });
    const review = { reviewing: true, meta: {}, total: 1 };
    const html = changePaneMarkup(whole, false, review);

    expect(html).toContain('data-change-action="discard"');
    expect(html).toContain('data-change-action="request-adopt-all"');
    expect(html).not.toContain('data-change-action="adopt-unit"');
    expect(html).not.toContain('data-change-action="reject-unit"');
    expect(html).toContain('画布、数据源');

    const confirming = changePaneMarkup(whole, true, review);
    expect(confirming).toContain('data-change-action="cancel-adopt-all"');
    expect(confirming).toContain('data-change-action="adopt"');
    expect(confirming).toContain('确认全部采纳');
  });

  it('labels the draft bar as the old version while viewing it', () => {
    expect(draftBarMarkup(proposal(), true)).toContain('旧版 · 当前文档');
    expect(draftBarMarkup(proposal(), true)).toContain('返回草案');
    expect(draftBarMarkup(proposal(), false)).toContain('查看旧版');
  });

  it('marks long values without rendering truncated JSON', () => {
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          changedUnit([{ path: 'props.description', before: 'null', after: '{"long":"value…"}' }]),
        ],
      }),
      false,
    );
    expect(html).toContain('内容过长');
    expect(html).not.toContain('{"long"');
  });

  it('does not leak other internal diff paths into the page', () => {
    const html = changePaneMarkup(
      proposal(undefined, {
        units: [
          changedUnit([
            { path: 'size.width', before: '320', after: '360' },
            { path: 'rotation', before: '0', after: '15' },
            { path: 'states', before: 'null', after: '{"items":[]}' },
          ]),
        ],
      }),
      false,
    );
    expect(html).toContain('宽度');
    expect(html).toContain('旋转');
    expect(html).toContain('组件状态');
    expect(html).not.toContain('size.width');
    expect(html).not.toContain('"items"');
  });
});

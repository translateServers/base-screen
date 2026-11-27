import type { ScreenComponentNode, ScreenDataSource, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { summarizeChangeProposal } from '../../../../src/common/operations/change/designer-change-events.js';
import {
  commandsForUnits,
  diffScreenDocuments,
  prepareDesignerChangeProposal,
  remainingChangeProposalInput,
} from '../../../../src/common/operations/change/designer-change-proposal.js';

function textComponent(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'title',
    type: 'base.text',
    name: '标题',
    parentId: null,
    position: { x: 40, y: 32 },
    size: { width: 320, height: 56 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: { text: '经营总览' },
    style: { color: '#17212b', fontSize: 32 },
    dataSource: null,
    ...overrides,
  };
}

function screenDocument(
  components: readonly ScreenComponentNode[] = [textComponent()],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#ffffff' },
    components: [...components],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function preparedProposal(
  document: ScreenDocument,
  commands: Parameters<typeof prepareDesignerChangeProposal>[1]['commands'],
): Extract<ReturnType<typeof prepareDesignerChangeProposal>, { ok: true }>['value'] {
  const result = prepareDesignerChangeProposal(
    document,
    {
      title: '整屏替换',
      rationale: '',
      scope: '整屏',
      commands,
    },
    'change-replacement',
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected proposal to compile');
  return result.value;
}

const recolor = {
  type: 'update-components',
  componentIds: ['title'],
  patch: { style: { color: '#646b71', fontSize: 32 } },
} as const;

describe('prepareDesignerChangeProposal', () => {
  it('compiles commands into a candidate document and leaves the input untouched', () => {
    const document = screenDocument();
    const result = prepareDesignerChangeProposal(
      document,
      {
        title: '提高标题对比度',
        rationale: '守卫提示对比度不足',
        scope: '标题',
        commands: [recolor],
      },
      'change-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidate.components[0]?.style.color).toBe('#646b71');
    expect(document.components[0]?.style.color).toBe('#17212b');
    expect(result.value.affectedComponentIds).toEqual(['title']);
    expect(result.value.diff[0]?.entries).toEqual([
      { path: 'style.color', before: '"#17212b"', after: '"#646b71"' },
    ]);
    expect(result.value.provenance).toEqual({ source: 'agent', label: '提高标题对比度' });
  });

  it('rejects a proposal without commands', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      { title: '空提案', rationale: '', scope: '', commands: [] },
      'change-1',
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'empty',
      diagnostics: [{ severity: 'error', code: 'CHANGE_PROPOSAL_EMPTY', path: [] }],
    });
  });

  it('rejects an invalid command with its diagnostics', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      {
        title: '改不存在的组件',
        rationale: '',
        scope: '',
        commands: [{ type: 'update-components', componentIds: ['missing'], patch: { name: 'x' } }],
      },
      'change-1',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('rejects a proposal that produces no difference', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      {
        title: '原样写回',
        rationale: '',
        scope: '',
        commands: [
          {
            type: 'update-components',
            componentIds: ['title'],
            patch: { style: { color: '#17212b', fontSize: 32 } },
          },
        ],
      },
      'change-1',
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'empty',
      diagnostics: [{ code: 'CHANGE_PROPOSAL_NO_EFFECT' }],
    });
  });

  it('accepts a canvas-only change as a document-level unit', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      {
        title: '把背景颜色改为天蓝色',
        rationale: '只改画布背景色',
        scope: '画布背景',
        commands: [{ type: 'update-canvas', patch: { backgroundColor: '#87ceeb' } }],
      },
      'change-canvas',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 组件 diff 是空的，但画布确实变了：提案要能成立，且挂在文档级单元上。
    expect(result.value.diff).toEqual([]);
    expect(result.value.affectedComponentIds).toEqual([]);
    expect(result.value.units).toMatchObject([{ id: 'document', kind: 'document' }]);
    expect(result.value.candidate.canvas.backgroundColor).toBe('#87ceeb');
    expect(result.value.candidate.components).toEqual(screenDocument().components);
  });

  it('accepts a data-source-only change and marks its dependent component as affected', () => {
    const source: ScreenDataSource = {
      id: 'sales',
      name: '销售数据',
      source: { kind: 'dataset', datasetId: 'sales' },
      params: {},
    };
    const document: ScreenDocument = {
      ...screenDocument([
        textComponent({
          dataSource: null,
          dataValue: { kind: 'data-source-field', dataSourceId: 'sales', path: [] },
          dataBinding: { fields: { value: ['amount'] } },
        }),
      ]),
      dataSources: [source],
    };
    const result = prepareDesignerChangeProposal(
      document,
      {
        title: '切换销售区域',
        rationale: '只改数据源参数',
        scope: '数据源',
        commands: [
          {
            type: 'replace-data-sources',
            dataSources: [
              {
                ...source,
                params: { region: { kind: 'inline', value: 'east' } },
              },
            ],
          },
        ],
      },
      'change-data-source',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff).toEqual([]);
    expect(result.value.affectedComponentIds).toEqual(['title']);
    expect(result.value.units).toMatchObject([{ id: 'document', kind: 'document' }]);
  });

  it('still rejects a canvas command that changes nothing', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      {
        title: '背景写回原值',
        rationale: '',
        scope: '画布背景',
        commands: [{ type: 'update-canvas', patch: { backgroundColor: '#ffffff' } }],
      },
      'change-canvas-same',
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'empty',
      diagnostics: [{ code: 'CHANGE_PROPOSAL_NO_EFFECT' }],
    });
  });
});

describe('diffScreenDocuments', () => {
  it('reports added and removed components without field rows', () => {
    const before = screenDocument([textComponent()]);
    const after = screenDocument([
      textComponent(),
      textComponent({ id: 'subtitle', name: '副标题' }),
    ]);
    const removal = diffScreenDocuments(after, before);

    expect(diffScreenDocuments(before, after)).toContainEqual({
      componentId: 'subtitle',
      componentName: '副标题',
      kind: 'added',
      entries: [],
    });
    expect(removal).toContainEqual({
      componentId: 'subtitle',
      componentName: '副标题',
      kind: 'removed',
      entries: [],
    });
  });

  it('reports hierarchy, status, binding, and canvas ownership changes', () => {
    const before = screenDocument();
    const after = screenDocument([
      textComponent({
        parentId: 'group',
        status: { locked: true, hidden: true },
        dataBinding: { fields: { value: ['amount'] } },
        canvasId: 'popup',
        belowSubCanvas: true,
      }),
    ]);

    expect(diffScreenDocuments(before, after)[0]?.entries.map((entry) => entry.path)).toEqual([
      'parentId',
      'status',
      'dataBinding',
      'canvasId',
      'belowSubCanvas',
    ]);
  });

  it('expands geometry and nested style keys', () => {
    const before = screenDocument();
    const after = screenDocument([
      textComponent({ position: { x: 40, y: 48 }, style: { color: '#000000', fontSize: 40 } }),
    ]);
    const rows = diffScreenDocuments(before, after);

    expect(rows[0]?.entries.map((entry) => entry.path)).toEqual([
      'position.y',
      'style.color',
      'style.fontSize',
    ]);
  });
});

describe('designer change units', () => {
  const subtitle = textComponent({ id: 'subtitle', name: '副标题' });

  it('splits independent components into separately adoptable units', () => {
    const document = screenDocument([textComponent(), subtitle]);
    const result = prepareDesignerChangeProposal(
      document,
      {
        title: '两处一起改',
        rationale: '',
        scope: '整屏',
        commands: [
          {
            type: 'update-components',
            componentIds: ['title'],
            patch: { style: { color: '#111111', fontSize: 32 } },
          },
          {
            type: 'update-components',
            componentIds: ['subtitle'],
            patch: { style: { color: '#222222', fontSize: 16 } },
          },
        ],
      },
      'change-1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const units = result.value.units;
    expect(units).toHaveLength(2);
    expect(units.map((unit) => unit.id)).toEqual(['title', 'subtitle']);
    expect(units[0]?.commandIndexes).toEqual([0]);
    expect(units[1]?.commandIndexes).toEqual([1]);
    expect(units[0]?.label).toBe('标题');
    expect(commandsForUnits(result.value, ['subtitle'])).toEqual([
      {
        type: 'update-components',
        componentIds: ['subtitle'],
        patch: { style: { color: '#222222', fontSize: 16 } },
      },
    ]);
  });

  it('keeps components that share one command in a single unit', () => {
    const document = screenDocument([textComponent(), subtitle]);
    const result = prepareDesignerChangeProposal(
      document,
      {
        title: '一条命令改两处',
        rationale: '',
        scope: '标题与副标题',
        commands: [
          {
            type: 'update-components',
            componentIds: ['title', 'subtitle'],
            patch: { style: { color: '#333333', fontSize: 16 } },
          },
        ],
      },
      'change-1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units).toHaveLength(1);
    expect(result.value.units[0]?.id).toBe('title');
    expect(result.value.units[0]?.label).toBe('标题、副标题');
  });

  it('gives document-level commands their own unit', () => {
    const result = prepareDesignerChangeProposal(
      screenDocument(),
      {
        title: '改画布底色',
        rationale: '',
        scope: '画布',
        commands: [
          {
            type: 'update-components',
            componentIds: ['title'],
            patch: { style: { color: '#111111', fontSize: 32 } },
          },
          { type: 'update-canvas', patch: { backgroundColor: '#101820' } },
        ],
      },
      'change-1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units.map((unit) => unit.id)).toEqual(['title', 'document']);
    expect(result.value.units[1]?.commandIndexes).toEqual([1]);
  });

  it('falls back to a single unit when a unit cannot stand alone', () => {
    const document = screenDocument();
    const result = prepareDesignerChangeProposal(
      document,
      {
        title: '新增后立刻删除',
        rationale: '',
        scope: '整屏',
        commands: [
          { type: 'add-component', component: textComponent({ id: 'ghost', name: '临时' }) },
          { type: 'remove-components', componentIds: ['ghost'] },
          {
            type: 'update-components',
            componentIds: ['title'],
            patch: { style: { color: '#444444', fontSize: 32 } },
          },
        ],
      },
      'change-1',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.units).toHaveLength(1);
    expect(result.value.units[0]?.commandIndexes).toEqual([0, 1, 2]);
  });
});

describe('whole-screen replacement presentation', () => {
  const oldTitle = textComponent({ id: 'old-title', name: '旧标题' });
  const oldKpi = textComponent({ id: 'old-kpi', name: '旧指标' });
  const newTitle = textComponent({ id: 'new-title', name: '新标题' });
  const newKpi = textComponent({ id: 'new-kpi', name: '新指标' });

  it('keeps a full replacement as one indivisible unit (ADR-0111 §2.1)', () => {
    const commands = [
      { type: 'update-canvas', patch: { backgroundColor: '#0b1020' } },
      { type: 'remove-components', componentIds: ['old-title', 'old-kpi'] },
      { type: 'add-component', component: newTitle },
      { type: 'add-component', component: newKpi },
    ] as const;
    const proposal = preparedProposal(screenDocument([oldTitle, oldKpi]), commands);

    // 单独采纳「删除」会把文档拆到只剩锁定组件，所以整屏替换只能整体采纳或放弃。
    expect(proposal.units).toHaveLength(1);
    expect(proposal.units[0]).toMatchObject({
      id: 'all',
      commandIndexes: [0, 1, 2, 3],
      presentation: { kind: 'whole-screen-replacement', addedCount: 2 },
    });
    expect(proposal.units[0]?.diff.map((row) => [row.componentId, row.kind])).toEqual(
      expect.arrayContaining([
        ['old-title', 'removed'],
        ['old-kpi', 'removed'],
        ['new-title', 'added'],
        ['new-kpi', 'added'],
      ]),
    );
    expect(commandsForUnits(proposal, ['all'])).toEqual(commands);
  });

  it('does not mark ordinary updates, additions, or partial removals', () => {
    const update = preparedProposal(screenDocument([oldTitle]), [
      {
        type: 'update-components',
        componentIds: ['old-title'],
        patch: { style: { color: '#646b71', fontSize: 32 } },
      },
    ]);
    const addition = preparedProposal(screenDocument([oldTitle]), [
      { type: 'add-component', component: newTitle },
    ]);
    const partialRemoval = preparedProposal(screenDocument([oldTitle, oldKpi]), [
      { type: 'remove-components', componentIds: ['old-title'] },
      { type: 'add-component', component: newTitle },
    ]);

    for (const proposal of [update, addition, partialRemoval]) {
      expect(proposal.units.every((unit) => unit.presentation === undefined)).toBe(true);
    }
  });

  it('ignores locked components when recognizing the replaced set', () => {
    const locked = textComponent({
      id: 'locked-header',
      name: '锁定页头',
      status: { locked: true, hidden: false },
    });
    const proposal = preparedProposal(screenDocument([oldTitle, oldKpi, locked]), [
      { type: 'remove-components', componentIds: ['old-title', 'old-kpi'] },
      { type: 'add-component', component: newTitle },
    ]);

    expect(proposal.units.find((unit) => unit.presentation !== undefined)?.presentation).toEqual({
      kind: 'whole-screen-replacement',
      addedCount: 1,
    });
  });

  it('does not mark additions that are removed again in the same proposal', () => {
    const proposal = preparedProposal(screenDocument([oldTitle]), [
      { type: 'remove-components', componentIds: ['old-title'] },
      { type: 'add-component', component: newTitle },
      { type: 'remove-components', componentIds: ['new-title'] },
    ]);

    expect(proposal.units.every((unit) => unit.presentation === undefined)).toBe(true);
  });

  it('does not mark an add-only proposal on an empty screen', () => {
    const proposal = preparedProposal(screenDocument([]), [
      { type: 'add-component', component: newTitle },
    ]);

    expect(proposal.units.every((unit) => unit.presentation === undefined)).toBe(true);
  });

  it('preserves the presentation in the public proposal summary', () => {
    const proposal = preparedProposal(screenDocument([oldTitle]), [
      { type: 'remove-components', componentIds: ['old-title'] },
      { type: 'add-component', component: newTitle },
    ]);
    const summary = summarizeChangeProposal(proposal);

    expect(summary.units).toHaveLength(1);
    expect(summary.units[0]).toMatchObject({
      presentation: { kind: 'whole-screen-replacement', addedCount: 1 },
    });
  });
});

describe('host grouping hints (ADR-0115 D5)', () => {
  const source: ScreenDataSource = {
    id: 'alarms',
    name: 'alarms',
    source: { kind: 'dataset', datasetId: 'monitor.alarms' },
    params: { line: { kind: 'inline', value: 'LINE-A' } },
  };
  const withSource = (): ScreenDocument => ({
    ...screenDocument([textComponent(), textComponent({ id: 'picker', name: '产线概览' })]),
    dataSources: [source],
  });
  const linkCommands = [
    {
      type: 'add-variables',
      variables: [{ id: 'agent-var-1', name: 'line_1', type: 'static', initialValue: 'LINE-A' }],
    },
    {
      type: 'update-data-source-params',
      dataSourceId: 'alarms',
      params: { line: { kind: 'variable', variableId: 'agent-var-1' } },
    },
    {
      type: 'add-blueprint-elements',
      nodes: [
        { kind: 'component', id: 'agent:c:picker', componentId: 'picker' },
        { kind: 'variable', id: 'agent:v:agent-var-1', variableId: 'agent-var-1' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'agent-edge-1',
          from: { node: 'agent:c:picker', port: 'event:rowClick' },
          to: { node: 'agent:v:agent-var-1', port: 'set' },
          value: { kind: 'event-payload', path: ['row', 'line'] },
        },
      ],
    },
  ] as const;
  const commands = [linkCommands[0], linkCommands[1], recolor, linkCommands[2]] as const;

  it('splits by the hint, with notes, so layout and interactions adopt separately', () => {
    const result = prepareDesignerChangeProposal(
      withSource(),
      {
        title: '加联动',
        rationale: '',
        scope: '局部修改',
        commands,
        groups: [
          { label: '版面与内容', commandIndexes: [2] },
          {
            label: '联动',
            commandIndexes: [0, 1, 3],
            notes: ['新增：点「产线概览」点击行 → 按 line 筛选'],
          },
        ],
      },
      'change-1',
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.units.map((unit) => [unit.label, unit.kind, unit.commandIndexes])).toEqual([
      ['版面与内容', 'changed', [2]],
      ['联动', 'document', [0, 1, 3]],
    ]);
    expect(result.value.units[1]?.notes).toEqual(['新增：点「产线概览」点击行 → 按 line 筛选']);
    expect(commandsForUnits(result.value, ['group-2']).map((command) => command.type)).toEqual([
      'add-variables',
      'update-data-source-params',
      'add-blueprint-elements',
    ]);
  });

  it('falls back to the default split when a hinted group cannot stand alone', () => {
    const result = prepareDesignerChangeProposal(
      withSource(),
      {
        title: '加联动',
        rationale: '',
        scope: '局部修改',
        commands,
        // 连线单独一组：没有变量就接不上，这一组不能单独成立。
        groups: [
          { label: '版面', commandIndexes: [0, 1, 2] },
          { label: '连线', commandIndexes: [3] },
        ],
      },
      'change-1',
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.units.map((unit) => unit.label)).not.toContain('连线');
  });

  it('ignores hints that do not cover every command exactly once', () => {
    const result = prepareDesignerChangeProposal(
      withSource(),
      {
        title: '加联动',
        rationale: '',
        scope: '局部修改',
        commands,
        groups: [{ label: '联动', commandIndexes: [0, 1, 3, 3] }],
      },
      'change-1',
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.units.some((unit) => unit.label === '联动')).toBe(false);
  });

  it('re-indexes the hints for the commands that remain', () => {
    const next = remainingChangeProposalInput(
      {
        title: '',
        rationale: '',
        scope: '',
        commands,
        groups: [
          { label: '版面与内容', commandIndexes: [2] },
          { label: '联动', commandIndexes: [0, 1, 3] },
        ],
      },
      [2],
    );
    expect(next.commands).toHaveLength(3);
    expect(next.groups).toEqual([{ label: '联动', commandIndexes: [0, 1, 2] }]);
  });
});

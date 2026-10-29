import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { summarizeChangeProposal } from '../../../../src/common/operations/change/designer-change-events.js';
import {
  commandsForUnits,
  diffScreenDocuments,
  prepareDesignerChangeProposal,
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
    blueprint: { relations: [] },
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
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
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
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
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

  it('marks a full replacement and keeps its component count and independent units', () => {
    const commands = [
      { type: 'remove-components', componentIds: ['old-title', 'old-kpi'] },
      { type: 'add-component', component: newTitle },
      { type: 'add-component', component: newKpi },
    ] as const;
    const proposal = preparedProposal(screenDocument([oldTitle, oldKpi]), commands);
    const removalUnit = proposal.units.find((unit) => unit.presentation !== undefined);

    expect(removalUnit).toMatchObject({
      id: 'old-title',
      presentation: { kind: 'whole-screen-replacement', addedCount: 2 },
    });
    expect(proposal.units).toHaveLength(3);
    expect(commandsForUnits(proposal, ['old-title'])).toEqual([commands[0]]);
    expect(commandsForUnits(proposal, ['new-title'])).toEqual([commands[1]]);
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

    expect(summary.units.find((unit) => unit.id === 'old-title')).toMatchObject({
      presentation: { kind: 'whole-screen-replacement', addedCount: 1 },
    });
  });
});

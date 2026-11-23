import { describe, expect, it } from 'vitest';
import { deriveScreenBlueprintRules } from '../../src/document/blueprint-graph.js';
import {
  DEFAULT_SCREEN_COMPONENT_STATE_ID,
  listScreenComponentStateDependencies,
  mergeScreenComponentStateStyle,
  resolveScreenComponentState,
  type ScreenComponentStateReaders,
  selectScreenComponentStateRow,
  testScreenComponentStateCase,
} from '../../src/document/component-states.js';
import { SCREEN_DOCUMENT_JSON_SCHEMA } from '../../src/document/json-schema.js';
import { parseScreenDocument } from '../../src/document/parse.js';
import { readScreenThemeColor, resolveScreenThemeRef } from '../../src/document/theme.js';
import { listScreenLevelScaleIssues } from '../../src/push/level-scale.js';
import type { ScreenComponentStates } from '../../src/types/document.js';
import { parseScreenHostCatalogDescriptor } from '../../src/variable/parse.js';
import { component, document } from './__fixtures__/document-test-fixtures.js';

const alarmSource = {
  id: 'alarm_stats',
  name: '告警统计',
  source: { kind: 'host-resource', resourceType: 'alarm_stats', resourceId: 'line-1' },
  params: {},
};

const selectedPump = {
  id: 'selectedPump',
  name: 'selectedPump',
  initialValue: 'pump-1',
  value: { kind: 'inline', value: 'pump-1' },
  controlled: true,
};

const levelStates = {
  items: [
    { id: 'critical', name: '严重', style: { color: 'theme:danger' } },
    { id: 'warning', name: '一般', style: { color: 'theme:warning' } },
  ],
  judge: {
    input: {
      kind: 'data-source-field',
      dataSourceId: 'alarm_stats',
      where: { field: ['deviceId'], equals: { kind: 'variable', variableId: 'selectedPump' } },
      path: ['level'],
    },
    cases: [
      { operator: 'eq', value: 'critical', stateId: 'critical' },
      { operator: 'eq', value: 'warning', stateId: 'warning' },
    ],
  },
};

function withStates(states: unknown, extra: Record<string, unknown> = {}) {
  return document({
    dataSources: [alarmSource],
    variables: [selectedPump],
    components: [component({ states: structuredClone(states) })],
    ...extra,
  });
}

function failure(input: Record<string, unknown>): { code: string; path: string } {
  const parsed = parseScreenDocument(input);
  expect(parsed.ok).toBe(false);
  if (parsed.ok) return { code: '', path: '' };
  const first = parsed.diagnostics[0]!;
  return { code: first.code, path: first.path.join('.') };
}

describe('component states document model (ADR-0110)', () => {
  it('parses states with a row-matching judge and keeps them detached', () => {
    const input = withStates(levelStates);
    const parsed = parseScreenDocument(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.components[0]?.states).toEqual(levelStates);
    ((input.components as Record<string, unknown>[])[0]!.states as { items: unknown[] }).items = [];
    expect(parsed.value.components[0]?.states?.items).toHaveLength(2);
  });

  it('rejects the retired styleRules field', () => {
    expect(failure(document({ components: [component({ styleRules: [] })] }))).toEqual({
      code: 'DOCUMENT_UNKNOWN_FIELD',
      path: 'components.0.styleRules',
    });
  });

  it('rejects unknown fields in states, judge, input, where and cases', () => {
    expect(failure(withStates({ ...levelStates, note: 1 })).path).toBe('components.0.states.note');
    expect(
      failure(withStates({ ...levelStates, items: [{ id: 'a', name: 'A', style: {}, x: 1 }] }))
        .path,
    ).toBe('components.0.states.items.0.x');
    expect(
      failure(
        withStates({
          ...levelStates,
          judge: {
            ...levelStates.judge,
            input: { kind: 'component-data', path: [], dataSourceId: 'x' },
          },
        }),
      ).path,
    ).toBe('components.0.states.judge.input.dataSourceId');
    expect(
      failure(
        withStates({
          ...levelStates,
          judge: {
            ...levelStates.judge,
            input: {
              ...levelStates.judge.input,
              where: { ...levelStates.judge.input.where, x: 1 },
            },
          },
        }),
      ).path,
    ).toBe('components.0.states.judge.input.where.x');
    expect(
      failure(
        withStates({
          ...levelStates,
          judge: {
            ...levelStates.judge,
            cases: [{ operator: 'eq', value: 1, stateId: 'critical', note: 1 }],
          },
        }),
      ).path,
    ).toBe('components.0.states.judge.cases.0.note');
  });

  it('rejects the reserved default id, duplicates, blank names and dangling case targets', () => {
    const items = (list: unknown[]) => withStates({ items: list });
    expect(failure(items([{ id: 'default', name: '默认', style: {} }])).path).toBe(
      'components.0.states.items.0.id',
    );
    expect(
      failure(
        items([
          { id: 'a', name: 'A', style: {} },
          { id: 'a', name: 'B', style: {} },
        ]),
      ).path,
    ).toBe('components.0.states.items.1.id');
    expect(failure(items([{ id: 'a', name: '   ', style: {} }])).path).toBe(
      'components.0.states.items.0.name',
    );
    expect(failure(items([{ id: 'a', name: 'x'.repeat(33), style: {} }])).path).toBe(
      'components.0.states.items.0.name',
    );
    expect(failure(withStates({ items: [] })).path).toBe('components.0.states.items');
    expect(
      failure(
        withStates({
          ...levelStates,
          judge: {
            ...levelStates.judge,
            cases: [{ operator: 'eq', value: 1, stateId: 'missing' }],
          },
        }),
      ).path,
    ).toBe('components.0.states.judge.cases.0.stateId');
  });

  it('enforces case value presence per operator and the value size limit', () => {
    const cases = (list: unknown[]) =>
      withStates({ ...levelStates, judge: { ...levelStates.judge, cases: list } });
    expect(failure(cases([{ operator: 'gt', stateId: 'critical' }])).path).toBe(
      'components.0.states.judge.cases.0.value',
    );
    expect(failure(cases([{ operator: 'exists', value: 1, stateId: 'critical' }])).path).toBe(
      'components.0.states.judge.cases.0.value',
    );
    expect(parseScreenDocument(cases([{ operator: 'exists', stateId: 'critical' }])).ok).toBe(true);
    expect(
      failure(cases([{ operator: 'eq', value: 'a'.repeat(64 * 1024), stateId: 'critical' }])).code,
    ).toBe('DOCUMENT_LIMIT_EXCEEDED');
  });

  it('checks variable and data source references of the judge', () => {
    expect(failure(withStates(levelStates, { dataSources: [] })).path).toBe(
      'components.0.states.judge.input.dataSourceId',
    );
    expect(failure(withStates(levelStates, { variables: [] })).path).toBe(
      'components.0.states.judge.input.where.equals.variableId',
    );
    expect(
      failure(
        withStates({
          ...levelStates,
          judge: {
            ...levelStates.judge,
            input: { kind: 'variable', variableId: 'nope', path: [] },
          },
        }),
      ).path,
    ).toBe('components.0.states.judge.input.variableId');
  });

  it('accepts optional status slots in the theme palette', () => {
    const palette = {
      primary: '#1',
      text: '#2',
      textSecondary: '#3',
      background: '#4',
      accent: '#5',
      accentSecondary: '#6',
    };
    expect(parseScreenDocument(document({ theme: { palette } })).ok).toBe(true);
    const custom = parseScreenDocument(
      document({ theme: { palette: { ...palette, danger: '#c026d3' } } }),
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(resolveScreenThemeRef('theme:danger', custom.value.theme)).toBe('#c026d3');
    expect(resolveScreenThemeRef('theme:warning', custom.value.theme)).toBe('#fa8c16');
    expect(readScreenThemeColor(undefined, 'danger')).toBe('#f5222d');
    expect(readScreenThemeColor(undefined, 'primary')).toBeUndefined();
  });

  it('emits the case value rule into the JSON Schema', () => {
    const text = JSON.stringify(SCREEN_DOCUMENT_JSON_SCHEMA);
    expect(text).toContain('"states"');
    expect(text).not.toContain('styleRules');
  });
});

describe('component state blueprint ports (ADR-0110 §2.4)', () => {
  const blueprint = (edges: unknown[]) => ({
    nodes: [
      { kind: 'component', id: 'button', componentId: 'button' },
      { kind: 'component', id: 'light', componentId: 'c1' },
    ],
    edges,
  });
  const base = (edges: unknown[], states: unknown = levelStates) =>
    document({
      dataSources: [alarmSource],
      variables: [selectedPump],
      components: [
        component({ id: 'button' }),
        component(states === null ? {} : { states: structuredClone(states) }),
      ],
      blueprint: blueprint(edges),
    });

  it('derives set / reset actions and the state-changed trigger', () => {
    const parsed = parseScreenDocument(
      base([
        {
          kind: 'flow',
          id: 'stop',
          from: { node: 'button', port: 'event:click' },
          to: { node: 'light', port: 'set-state' },
          stateId: 'critical',
        },
        {
          kind: 'flow',
          id: 'reset',
          from: { node: 'button', port: 'event:dblclick' },
          to: { node: 'light', port: 'reset-state' },
        },
        {
          kind: 'flow',
          id: 'changed',
          from: { node: 'light', port: 'state-changed' },
          to: { node: 'button', port: 'request-data' },
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rules = deriveScreenBlueprintRules(parsed.value.blueprint);
    expect(rules.map((rule) => rule.trigger)).toEqual([
      { type: 'material-event', componentId: 'button', eventName: 'click' },
      { type: 'material-event', componentId: 'button', eventName: 'dblclick' },
      { type: 'component-state-changed', componentId: 'c1', eventName: 'state-changed' },
    ]);
    expect(rules[0]?.steps).toEqual([
      {
        type: 'action',
        edgeId: 'stop',
        action: {
          type: 'component-state',
          componentId: 'c1',
          operation: 'set',
          stateId: 'critical',
        },
      },
    ]);
    expect(rules[0]?.requiredCapabilities).toContain('blueprint.action.component-state');
    expect(rules[2]?.requiredCapabilities).toContain('blueprint.trigger.component-state-changed');
  });

  it('requires stateId on set-state only and an existing target state', () => {
    const edge = (extra: Record<string, unknown>, port = 'set-state') => ({
      kind: 'flow',
      id: 'e',
      from: { node: 'button', port: 'event:click' },
      to: { node: 'light', port },
      ...extra,
    });
    expect(failure(base([edge({})])).path).toBe('blueprint.edges.0.stateId');
    expect(failure(base([edge({ stateId: 'critical' }, 'reset-state')])).path).toBe(
      'blueprint.edges.0.stateId',
    );
    expect(failure(base([edge({ stateId: 'nope' })])).path).toBe('blueprint.edges.0.stateId');
  });

  it('rejects state ports on a component without states', () => {
    expect(
      failure(
        base(
          [
            {
              kind: 'flow',
              id: 'e',
              from: { node: 'button', port: 'event:click' },
              to: { node: 'light', port: 'reset-state' },
            },
          ],
          null,
        ),
      ).path,
    ).toBe('blueprint.edges.0.to.port');
  });
});

describe('component state evaluation', () => {
  const states = levelStates as unknown as ScreenComponentStates;
  const readers = (stats: unknown, pump: unknown = 'pump-1'): ScreenComponentStateReaders => ({
    componentData: () => undefined,
    variable: (id) => (id === 'selectedPump' ? (pump as never) : undefined),
    dataSource: (id) => (id === 'alarm_stats' ? (stats as never) : undefined),
  });
  const rows = [
    { deviceId: 'pump-2', level: 'warning' },
    { deviceId: 'pump-1', level: 'critical' },
  ];

  it('finds the row by a variable and resolves the first matching case', () => {
    expect(resolveScreenComponentState(states, readers(rows))).toEqual({
      status: 'resolved',
      stateId: 'critical',
      value: 'critical',
    });
    expect(
      resolveScreenComponentState(states, readers({ fields: [], rows }, 'pump-2')),
    ).toMatchObject({
      stateId: 'warning',
    });
  });

  it('treats a missing row as an empty value and an unloaded source as unavailable', () => {
    expect(resolveScreenComponentState(states, readers(rows, 'pump-9'))).toEqual({
      status: 'resolved',
      stateId: DEFAULT_SCREEN_COMPONENT_STATE_ID,
    });
    expect(resolveScreenComponentState(states, readers(undefined))).toEqual({
      status: 'unavailable',
    });
  });

  it('keeps the judge-less states on default and merges overrides', () => {
    const plain = { items: [{ id: 'stop', name: '停机', style: { fillColor: '#555' } }] };
    expect(resolveScreenComponentState(plain, readers(rows))).toEqual({
      status: 'resolved',
      stateId: 'default',
    });
    const base = { fillColor: '#0f0', glow: true };
    expect(mergeScreenComponentStateStyle(base, plain, 'stop')).toEqual({
      fillColor: '#555',
      glow: true,
    });
    expect(mergeScreenComponentStateStyle(base, plain, 'default')).toBe(base);
  });

  it('compares like the retired style rules and selects rows only from lists or tables', () => {
    expect(testScreenComponentStateCase({ operator: 'gte', value: 75 }, 78.6)).toBe(true);
    expect(testScreenComponentStateCase({ operator: 'gt', value: 75 }, '80')).toBe(false);
    expect(testScreenComponentStateCase({ operator: 'contains', value: 'a' }, ['a'])).toBe(true);
    expect(testScreenComponentStateCase({ operator: 'exists' }, null)).toBe(false);
    expect(
      selectScreenComponentStateRow({ deviceId: 'pump-1' }, { field: ['deviceId'] }, 'pump-1'),
    ).toBe(undefined);
  });

  it('lists judge dependencies', () => {
    expect(listScreenComponentStateDependencies(states)).toEqual({
      componentData: false,
      variableIds: ['selectedPump'],
      dataSourceIds: ['alarm_stats'],
    });
  });
});

describe('host level scales (ADR-0110 §2.6.2)', () => {
  const scale = {
    path: ['level'],
    levels: [
      { value: 'critical', label: '严重', tone: 'danger' },
      { value: 'warning', label: '一般', tone: 'warning' },
    ],
  };

  it('accepts a level scale on a catalog descriptor', () => {
    const parsed = parseScreenHostCatalogDescriptor({
      sourceId: 'alarm-stats',
      name: 'alarm_stats',
      description: null,
      parameters: [],
      previewable: true,
      levelScales: [scale],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.levelScales).toEqual([scale]);
  });

  it('reports unknown fields, duplicate values and bad tones', () => {
    expect(listScreenLevelScaleIssues([scale])).toEqual([]);
    expect(listScreenLevelScaleIssues([])).toHaveLength(1);
    const issues = listScreenLevelScaleIssues([
      {
        path: ['level'],
        note: 1,
        levels: [
          { value: 'a', label: 'A', tone: 'danger' },
          { value: 'a', label: 'B', tone: 'red' },
        ],
      },
    ]);
    expect(issues.map((issue) => issue.path.join('.'))).toEqual([
      '0.note',
      '0.levels.1.value',
      '0.levels.1.tone',
    ]);
  });
});

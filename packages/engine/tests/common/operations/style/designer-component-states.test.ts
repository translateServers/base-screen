import type {
  ScreenComponentNode,
  ScreenComponentStates,
  ScreenDocument,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createDesignerStatesTransaction,
  designerStatePresetStyle,
  designerStateViewComponent,
  findDesignerLevelScale,
  redirectDesignerStyleTransaction,
  withDesignerLevelStates,
  withDesignerStateAdded,
  withDesignerStateRemoved,
} from '../../../../src/common/operations/style/designer-component-states.js';

const manifest = {
  type: 'acme.flop',
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      borderColor: { kind: 'string' },
      glow: { kind: 'boolean' },
      glowColor: { kind: 'string' },
      fontSize: { kind: 'number' },
    },
    required: [],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'borderColor', label: '描边色', control: 'color' },
    { style: 'glow', label: '发光', control: 'switch' },
    { style: 'glowColor', label: '发光色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
} as unknown as BaseScreenMaterialManifest;

const catalog = {
  get: (type: string) => (type === 'acme.flop' ? { manifest } : undefined),
  has: (type: string) => type === 'acme.flop',
  list: () => [],
} as unknown as BaseScreenMaterialCatalog;

const states: ScreenComponentStates = {
  items: [
    { id: 'warn', name: '警告', style: { color: '#ffaa00' } },
    { id: 'crit', name: '严重', style: { color: '#ff0000' } },
  ],
  judge: {
    input: { kind: 'component-data', path: [] },
    cases: [
      { operator: 'gte', value: 90, stateId: 'crit' },
      { operator: 'gte', value: 75, stateId: 'warn' },
    ],
  },
};

function component(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'temp',
    type: 'acme.flop',
    name: '炉温',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { color: '#ffffff', fontSize: 40 },
    dataSource: null,
    states,
    ...overrides,
  };
}

function withoutStates(node: ScreenComponentNode): ScreenComponentNode {
  const { states: _states, ...rest } = node;
  return rest;
}

function document(overrides: Partial<ScreenDocument> = {}): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [component(), withoutStates(component({ id: 'stop' }))],
    variables: [],
    blueprint: {
      nodes: [
        { kind: 'component', id: 'stop-node', componentId: 'stop' },
        { kind: 'component', id: 'temp-node', componentId: 'temp' },
      ],
      edges: [
        {
          kind: 'flow',
          id: 'set-crit',
          from: { node: 'stop-node', port: 'event:click' },
          to: { node: 'temp-node', port: 'set-state' },
          stateId: 'crit',
        },
        {
          kind: 'flow',
          id: 'reset',
          from: { node: 'stop-node', port: 'event:dblclick' },
          to: { node: 'temp-node', port: 'reset-state' },
        },
      ],
    },
    ...overrides,
  };
}

describe('designer component states (ADR-0110)', () => {
  it('redirects a style edit of the edited state into its override', () => {
    const transaction = redirectDesignerStyleTransaction(document(), 'temp', 'crit', {
      commands: [
        {
          type: 'update-components',
          componentIds: ['temp'],
          patch: { style: { color: '#ffffff', fontSize: 56 } },
        },
      ],
    });
    const command = transaction.commands[0];
    expect(command?.type).toBe('update-components');
    if (command?.type !== 'update-components') return;
    expect(command.patch.style).toBeUndefined();
    expect(command.patch.states?.items[1]).toEqual({
      id: 'crit',
      name: '严重',
      style: { color: '#ff0000', fontSize: 56 },
    });
    // 默认状态不改写。
    const untouched = { commands: [] };
    expect(redirectDesignerStyleTransaction(document(), 'temp', 'default', untouched)).toBe(
      untouched,
    );
  });

  it('shows the merged style while editing a state', () => {
    expect(designerStateViewComponent(component(), 'crit').style).toEqual({
      color: '#ff0000',
      fontSize: 40,
    });
  });

  it('removes a state together with its cases and set-state edges', () => {
    const removed = withDesignerStateRemoved(states, 'crit');
    expect(removed?.judge?.cases.map((entry) => entry.stateId)).toEqual(['warn']);
    const transaction = createDesignerStatesTransaction(document(), 'temp', removed, catalog);
    expect(transaction.ok).toBe(true);
    if (!transaction.ok) return;
    const blueprint = transaction.value.commands[1];
    expect(blueprint?.type).toBe('replace-blueprint');
    if (blueprint?.type === 'replace-blueprint') {
      expect(blueprint.blueprint.edges.map((edge) => edge.id)).toEqual(['reset']);
    }
    const cleared = createDesignerStatesTransaction(document(), 'temp', null, catalog);
    expect(cleared.ok && cleared.value.commands[1]?.type).toBe('replace-blueprint');
  });

  it('rejects a state style the material schema does not accept', () => {
    const bad = withDesignerStateAdded(states, '坏');
    const items = bad.states.items.map((item) =>
      item.id === bad.stateId ? { ...item, style: { unknown: 1 } } : item,
    );
    const transaction = createDesignerStatesTransaction(
      document(),
      'temp',
      { ...bad.states, items },
      catalog,
    );
    expect(transaction.ok).toBe(false);
  });

  it('generates states from a host level scale with status slot presets', () => {
    expect(designerStatePresetStyle(manifest, 'danger')).toEqual({
      color: 'theme:danger',
      borderColor: 'theme:danger',
      glow: true,
      glowColor: 'theme:danger',
    });
    expect(designerStatePresetStyle(manifest, 'warning')).toEqual({
      color: 'theme:warning',
      borderColor: 'theme:warning',
    });
    const input = { kind: 'data-source-field' as const, dataSourceId: 'alarm', path: ['level'] };
    const generated = withDesignerLevelStates(
      undefined,
      input,
      {
        path: ['level'],
        levels: [
          { value: 'critical', label: '严重', tone: 'danger' },
          { value: 'warning', label: '一般', tone: 'warning' },
        ],
      },
      manifest,
    );
    expect(generated.items.map((item) => [item.id, item.name])).toEqual([
      ['critical', '严重'],
      ['warning', '一般'],
    ]);
    expect(generated.judge).toEqual({
      input,
      cases: [
        { operator: 'eq', value: 'critical', stateId: 'critical' },
        { operator: 'eq', value: 'warning', stateId: 'warning' },
      ],
    });
  });

  it('finds the level scale by data source and path', () => {
    const screen = document({
      dataSources: [
        {
          id: 'alarm',
          name: 'alarm',
          source: { kind: 'host-resource', resourceType: 'alarm', resourceId: 'line' },
          params: {},
        },
      ],
    });
    const scale = {
      path: ['level'],
      levels: [{ value: 'critical', label: '严重', tone: 'danger' as const }],
    };
    const read = (id: string) => (id === 'alarm' ? [scale] : undefined);
    expect(
      findDesignerLevelScale(
        screen,
        component(),
        { kind: 'data-source-field', dataSourceId: 'alarm', path: ['level'] },
        read,
      ),
    ).toBe(scale);
    expect(
      findDesignerLevelScale(
        screen,
        component(),
        { kind: 'data-source-field', dataSourceId: 'alarm', path: ['count'] },
        read,
      ),
    ).toBeUndefined();
  });
});

import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import { createUngroupTransaction } from '../../../../src/common/operations/element/designer-layout-operations.js';
import { removeComponentCommands } from '../../../../src/common/operations/selection/designer-remove-operations.js';
import { graphFromRules } from '../../../__fixtures__/blueprint-graph.js';

function component(id: string, parentId: string | null = null): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: { text: id },
    style: {},
    dataSource: null,
  };
}

function document(
  components: readonly ScreenComponentNode[],
  ruleComponentIds: readonly string[],
): ScreenDocument {
  return {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: graphFromRules(
      ruleComponentIds.map((componentId, index) => ({
        id: `rule-${index}`,
        trigger: { type: 'material-event' as const, componentId, eventName: 'valueClick' },
        actions: [
          {
            type: 'emit-host-event' as const,
            eventName: 'notify',
            payload: { kind: 'literal' as const, value: null },
          },
        ],
      })),
    ),
  };
}

const HOST = { kind: 'host', id: 'host' } as const;

describe('removeComponentCommands', () => {
  it('appends a blueprint prune command when a removed target has a blueprint node', () => {
    const source = document([component('title'), component('subtitle')], ['title']);
    const commands = removeComponentCommands(source, ['title']);

    expect(commands).toEqual([
      { type: 'replace-blueprint', blueprint: { nodes: [HOST], edges: [] } },
      { type: 'remove-components', componentIds: ['title'] },
    ]);
  });

  it('prunes nodes of removed descendants', () => {
    const source = document([component('group'), component('child', 'group')], ['child']);
    const commands = removeComponentCommands(source, ['group']);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual({
      type: 'replace-blueprint',
      blueprint: { nodes: [HOST], edges: [] },
    });
  });

  it('keeps nodes and edges of surviving components', () => {
    const source = document([component('title'), component('subtitle')], ['title', 'subtitle']);
    const commands = removeComponentCommands(source, ['subtitle']);

    expect(commands).toEqual([
      {
        type: 'replace-blueprint',
        blueprint: {
          nodes: [source.blueprint.nodes[0], HOST],
          edges: [source.blueprint.edges[0]],
        },
      },
      { type: 'remove-components', componentIds: ['subtitle'] },
    ]);
  });

  it('stays a single remove command when no node references the removed components', () => {
    const source = document([component('title'), component('subtitle')], []);
    const commands = removeComponentCommands(source, ['title']);

    expect(commands).toEqual([{ type: 'remove-components', componentIds: ['title'] }]);
  });

  it('prunes visibility targets and their layout without deleting the trigger', () => {
    const source: ScreenDocument = {
      ...document([component('button'), component('panel'), component('other')], []),
      blueprint: {
        ...graphFromRules([
          {
            id: 'toggle-panel',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              { type: 'component-visibility', componentId: 'panel', operation: 'toggle' },
              {
                type: 'emit-host-event',
                eventName: 'kept',
                payload: { kind: 'literal', value: null },
              },
            ],
          },
        ]),
        layout: {
          nodes: [
            { id: 'component:button', x: 0, y: 0 },
            { id: 'component:panel', x: 300, y: 0 },
          ],
        },
      },
    };

    const commands = removeComponentCommands(source, ['panel']);
    const blueprint = commands[0]?.type === 'replace-blueprint' ? commands[0].blueprint : undefined;
    expect(blueprint?.edges).toHaveLength(1);
    expect(blueprint?.edges[0]).toMatchObject({
      kind: 'flow',
      to: { node: 'host', port: 'event:kept' },
      payload: { kind: 'literal', value: null },
    });
    expect(blueprint?.layout?.nodes).toEqual([{ id: 'component:button', x: 0, y: 0 }]);
  });

  it('applies as a valid transaction end to end', () => {
    const source = document([component('title'), component('subtitle')], ['title']);
    const commands = removeComponentCommands(source, ['title']);

    const result = applyScreenDocumentTransaction(source, { commands });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.map((item) => item.id)).toEqual(['subtitle']);
    expect(result.document.blueprint.edges).toEqual([]);
  });

  it('ungroup prunes nodes of the removed group', () => {
    const source = document([component('group'), component('child', 'group')], ['group']);
    const transaction = createUngroupTransaction(source, 'group');

    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.map((item) => item.id)).toEqual(['child']);
    expect(result.document.blueprint.edges).toEqual([]);
  });
});

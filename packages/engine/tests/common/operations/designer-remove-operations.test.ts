import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import { createUngroupTransaction } from '../../../src/common/operations/designer-layout-operations.js';
import { removeComponentCommands } from '../../../src/common/operations/designer-remove-operations.js';

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
    blueprint: {
      rules: ruleComponentIds.map((componentId, index) => ({
        id: `rule-${index}`,
        trigger: { type: 'material-event', componentId, eventName: 'valueClick' },
        actions: [],
      })),
    },
  };
}

describe('removeComponentCommands', () => {
  it('appends a blueprint prune command when a removed target is a rule trigger', () => {
    const source = document([component('title'), component('subtitle')], ['title']);
    const commands = removeComponentCommands(source, ['title']);

    expect(commands).toEqual([
      { type: 'replace-blueprint', blueprint: { rules: [] } },
      { type: 'remove-components', componentIds: ['title'] },
    ]);
  });

  it('prunes rules whose trigger is a removed descendant', () => {
    const source = document([component('group'), component('child', 'group')], ['child']);
    const commands = removeComponentCommands(source, ['group']);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual({ type: 'replace-blueprint', blueprint: { rules: [] } });
  });

  it('keeps rules that reference surviving components', () => {
    const source = document([component('title'), component('subtitle')], ['title', 'subtitle']);
    const commands = removeComponentCommands(source, ['subtitle']);

    expect(commands).toEqual([
      {
        type: 'replace-blueprint',
        blueprint: { rules: [source.blueprint.rules[0]] },
      },
      { type: 'remove-components', componentIds: ['subtitle'] },
    ]);
  });

  it('stays a single remove command when no rule references the removed components', () => {
    const source = document([component('title'), component('subtitle')], []);
    const commands = removeComponentCommands(source, ['title']);

    expect(commands).toEqual([{ type: 'remove-components', componentIds: ['title'] }]);
  });

  it('applies as a valid transaction end to end', () => {
    const source = document([component('title'), component('subtitle')], ['title']);
    const commands = removeComponentCommands(source, ['title']);

    const result = applyScreenDocumentTransaction(source, { commands });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.map((item) => item.id)).toEqual(['subtitle']);
    expect(result.document.blueprint.rules).toEqual([]);
  });

  it('ungroup prunes rules triggered by the removed group', () => {
    const source = document([component('group'), component('child', 'group')], ['group']);
    const transaction = createUngroupTransaction(source, 'group');

    const result = applyScreenDocumentTransaction(source, transaction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.map((item) => item.id)).toEqual(['child']);
    expect(result.document.blueprint.rules).toEqual([]);
  });
});

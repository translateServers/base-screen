import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { auditBaseScreenFragment } from '../src/index.js';

function catalog(
  entries: readonly [string, { readonly children?: boolean; readonly hidden?: boolean }][],
): BaseScreenMaterialCatalog {
  const map = new Map(
    entries.map(([type, options]) => [
      type,
      {
        manifest: {
          type,
          name: type,
          designCapabilities: { resize: true, rotate: true, children: options.children === true },
          ...(options.hidden === true ? { libraryVisible: false } : {}),
        } as unknown as BaseScreenMaterialManifest,
        constructor: class {} as never,
      },
    ]),
  );
  return { get: (type) => map.get(type), has: (type) => map.has(type), list: () => [...map.values()] };
}

const CATALOG = catalog([
  ['base.container', { children: true }],
  ['base.rectangle', {}],
  ['base.text', {}],
  ['board.digital-flop', {}],
  ['board.legacy', { hidden: true }],
]);

const CARD = {
  id: 'host-app.fragment-kpi',
  name: 'KPI 卡',
  category: '指标卡',
  keywords: ['KPI'],
  shell: { key: 'card', materialType: 'base.container', name: '卡片', size: { width: 320, height: 160 } },
  nodes: [
    { key: 'title', materialType: 'base.text', name: '标题', offset: { x: 16, y: 12 }, size: { width: 200, height: 24 } },
    {
      key: 'value',
      materialType: 'board.digital-flop',
      name: '读数',
      offset: { x: 16, y: 48 },
      size: { width: 200, height: 64 },
    },
  ],
};

const rules = (input: unknown) =>
  auditBaseScreenFragment(input, CATALOG).map((item) => `${item.severity}:${item.rule}`);

describe('fragment audit (ADR-0105 §2.6)', () => {
  it('passes a shelled card with named nodes', () => {
    expect(rules(CARD)).toEqual([]);
  });

  it('reports shape errors and catalog problems', () => {
    expect(rules({ ...CARD, name: '' })).toContain('error:SPEC');
    expect(rules({ ...CARD, nodes: [{ ...CARD.nodes[0], materialType: 'acme.missing' }] })).toContain('error:F8');
    expect(rules({ ...CARD, nodes: [{ ...CARD.nodes[0], materialType: 'board.legacy' }] })).toContain('warning:F8');
    expect(rules({ ...CARD, shell: { ...CARD.shell, materialType: 'base.rectangle' } })).toContain('error:F8');
  });

  it('suggests a container shell instead of a backdrop rectangle', () => {
    const { shell: _shell, ...rest } = CARD;
    const backdrop = {
      key: 'bg',
      materialType: 'base.rectangle',
      name: '底板',
      offset: { x: 0, y: 0 },
      size: { width: 320, height: 160 },
    };
    expect(rules({ ...rest, nodes: [backdrop, ...CARD.nodes] })).toContain('warning:F2');
  });

  it('suggests a shared data source for repeated queries', () => {
    const source = { type: 'dataset', datasetId: 'sales', params: {}, binding: null };
    const nodes = CARD.nodes.map((node) => ({ ...node, dataSource: source }));
    expect(rules({ ...CARD, nodes })).toContain('warning:F4');
  });

  it('warns about scale and unnamed nodes', () => {
    const nodes = Array.from({ length: 9 }, (_, index) => ({
      key: `n${index}`,
      materialType: 'base.text',
      name: `节点${index}`,
    }));
    expect(rules({ ...CARD, nodes })).toContain('warning:F6');
    const { name: _name, ...unnamed } = CARD.nodes[0]!;
    expect(rules({ ...CARD, nodes: [unnamed, CARD.nodes[1]] })).toContain('warning:F9');
  });
});

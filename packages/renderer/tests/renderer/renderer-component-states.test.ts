import type {
  ScreenComponentNode,
  ScreenComponentStates,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonValue,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import type { BaseScreenComponentStateChange } from '../../src/renderer/renderer-component-states.js';
import {
  component,
  createCatalog,
  document,
  FakeRoot,
} from './__fixtures__/renderer-test-harness.js';

function flush(): Promise<void> {
  let chain = Promise.resolve();
  for (let index = 0; index < 8; index++) chain = chain.then(() => undefined);
  return chain;
}

function stated(
  id: string,
  states: ScreenComponentStates,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return { ...component(id, 0, null, dataSource), style: { color: '#ffffff' }, states };
}

const threshold: ScreenComponentStates = {
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

function setup(resourcePort?: ScreenHostResourcePort) {
  const root = new FakeRoot();
  const changes: BaseScreenComponentStateChange[] = [];
  const diagnostics: string[] = [];
  const renderer = createBaseScreenRenderer({
    root: root as unknown as HTMLElement,
    catalog: createCatalog('base.test', ['static', 'host-resource']),
    mode: 'viewer',
    interactive: false,
    onMaterialEvent: undefined,
    resourcePort,
    onComponentStateChange: (change) => changes.push(change),
    onDiagnostic: (item) => diagnostics.push(item.path.join('.')),
  });
  return { root, renderer, changes, diagnostics };
}

describe('renderer component states (ADR-0110)', () => {
  it('switches states from component data in case order and falls back to default', async () => {
    const { root, renderer, changes } = setup();
    const render = (value: number) =>
      renderer.render(document([stated('temp', threshold, { type: 'static', value })]));
    expect(render(95).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(renderer.readComponentState('temp')).toEqual({ stateId: 'crit', value: 95 });
    expect(render(80).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffaa00');
    expect(render(40).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    await flush();
    expect(changes).toEqual([
      { componentId: 'temp', from: 'default', to: 'crit', cause: 'judge' },
      { componentId: 'temp', from: 'crit', to: 'warn', cause: 'judge' },
      { componentId: 'temp', from: 'warn', to: 'default', cause: 'judge' },
    ]);
  });

  it('finds the matching row of a data source result by a variable', async () => {
    let result: ScreenJsonValue = [
      { deviceId: 'pump-1', level: 'critical' },
      { deviceId: 'pump-2', level: 'warning' },
    ];
    const port: ScreenHostResourcePort = {
      resolve: () => Promise.resolve({ ok: true, value: result, diagnostics: [] }),
    };
    const { root, renderer, changes } = setup(port);
    const states: ScreenComponentStates = {
      items: [
        { id: 'critical', name: '严重', style: { color: '#ff0000' } },
        { id: 'warning', name: '一般', style: { color: '#ffaa00' } },
      ],
      judge: {
        input: {
          kind: 'data-source-field',
          dataSourceId: 'stats',
          where: { field: ['deviceId'], equals: { kind: 'variable', variableId: 'pump' } },
          path: ['level'],
        },
        cases: [
          { operator: 'eq', value: 'critical', stateId: 'critical' },
          { operator: 'eq', value: 'warning', stateId: 'warning' },
        ],
      },
    };
    const screen: ScreenDocument = {
      ...document(
        [stated('card', states)],
        [
          {
            id: 'pump',
            name: 'pump',
            initialValue: 'pump-1',
            value: { kind: 'inline', value: 'pump-1' },
            controlled: false,
          },
        ],
      ),
      dataSources: [
        {
          id: 'stats',
          name: 'stats',
          source: { kind: 'host-resource', resourceType: 'alarm_stats', resourceId: 'line' },
          params: {},
        },
      ],
    };
    renderer.setVariables({ pump: 'pump-1' });
    expect(renderer.render(screen).ok).toBe(true);
    // 结果还没到：取值暂不可用，按默认渲染。
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');

    renderer.setVariables({ pump: 'pump-2' });
    expect(renderer.render(screen).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffaa00');

    // 找不到匹配行：取值为空，落到默认。
    renderer.setVariables({ pump: 'pump-9' });
    expect(renderer.render(screen).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');

    result = [{ deviceId: 'pump-9', level: 'warning' }];
    renderer.refreshDataSource('stats');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ffaa00');
    await flush();
    expect(changes.map((change) => change.to)).toEqual([
      'critical',
      'warning',
      'default',
      'warning',
    ]);
  });

  it('lets a blueprint setting win over the judge until it is reset', async () => {
    const { root, renderer, changes } = setup();
    const screen = document([stated('temp', threshold, { type: 'static', value: 80 })]);
    expect(renderer.render(screen).ok).toBe(true);
    renderer.applyBlueprintStateEffects([
      { componentId: 'temp', operation: 'set', stateId: 'crit' },
    ]);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(renderer.render(screen).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    // 显隐重置（设计器每次编辑重渲染都会调用）不清组件状态；只有文档装载时的 resetComponentStates 清。
    renderer.resetBlueprintVisibility();
    expect(renderer.render(screen).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    renderer.applyBlueprintStateEffects([{ componentId: 'temp', operation: 'reset' }]);
    expect(root.children[0]?.model?.style.color).toBe('#ffaa00');
    await flush();
    expect(changes).toEqual([
      { componentId: 'temp', from: 'default', to: 'warn', cause: 'judge' },
      { componentId: 'temp', from: 'warn', to: 'crit', cause: 'blueprint' },
      { componentId: 'temp', from: 'crit', to: 'warn', cause: 'blueprint' },
    ]);
  });

  it('fails closed on a state style the material schema rejects', () => {
    const { renderer } = setup();
    const result = renderer.render(
      document([stated('bad', { items: [{ id: 'x', name: 'X', style: { unknownKey: 1 } }] })]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path.slice(0, 6)).toEqual([
        'components',
        0,
        'states',
        'items',
        0,
        'style',
      ]);
    }
  });
});

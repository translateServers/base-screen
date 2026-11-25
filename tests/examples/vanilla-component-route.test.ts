import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../examples/vanilla-host/src/router';

/** 组件库路由（ADR-0106 §2.2）：列表 + 两个全页编辑器，`new` 表示新建，查询串（?template=）不影响匹配。 */
describe('ADR-0106 · component library routes', () => {
  it('routes the component library list', () => {
    expect(parseRoute('#/components')).toEqual({ name: 'components' });
  });

  it('routes a new atomic component regardless of the template query', () => {
    expect(parseRoute('#/components/atomic/new')).toEqual({
      name: 'component-atomic',
      type: undefined,
    });
    expect(parseRoute('#/components/atomic/new?template=ring')).toEqual({
      name: 'component-atomic',
      type: undefined,
    });
  });

  it('decodes the atomic component type', () => {
    expect(parseRoute('#/components/atomic/host.online.ring-a1b2')).toEqual({
      name: 'component-atomic',
      type: 'host.online.ring-a1b2',
    });
  });

  it('routes fragment editors by id', () => {
    expect(parseRoute('#/components/fragment/new')).toEqual({
      name: 'component-fragment',
      id: undefined,
    });
    expect(
      parseRoute(`#/components/fragment/${encodeURIComponent('host-app.fragment-x:1')}`),
    ).toEqual({
      name: 'component-fragment',
      id: 'host-app.fragment-x:1',
    });
  });

  it('rejects unknown component sub-routes', () => {
    expect(parseRoute('#/components/other/x')).toEqual({ name: 'not-found' });
  });
});

import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../examples/vanilla-host/src/router';

/**
 * A38：Vanilla 的 hash 路由解析。
 *
 * 这条**必须在查询串切分之后判断**：`#/datasources?type=sqlite` 的 path 是
 * `#/datasources`，而 `#/datasources/x` 不能被前缀匹配吞掉（它应当是 not-found，
 * 与「未知路径回列表」的既有语义一致）。三端路由行为对等，这里用 Vanilla 的实现作代表
 * （React/Vue 用各自的 router，行为由 smoke 的 G 段覆盖）。
 */
describe('A38 · parseRoute', () => {
  it('maps #/datasources to the datasource page', () => {
    expect(parseRoute('#/datasources')).toEqual({ name: 'datasources' });
  });

  it('ignores the query string when matching', () => {
    expect(parseRoute('#/datasources?type=sqlite')).toEqual({ name: 'datasources' });
    expect(parseRoute('#/datasources?query=%E7%A4%BA%E4%BE%8B&type=rest')).toEqual({
      name: 'datasources',
    });
  });

  it('does not swallow unknown sub-paths', () => {
    expect(parseRoute('#/datasources/x')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/datasourcesfoo')).toEqual({ name: 'not-found' });
  });

  it('maps #/assets to the asset admin page', () => {
    expect(parseRoute('#/assets')).toEqual({ name: 'assets' });
    expect(parseRoute('#/assets?scope=temporary')).toEqual({ name: 'assets' });
    expect(parseRoute('#/assets/x')).toEqual({ name: 'not-found' });
  });

  it('keeps the existing screen routes unchanged', () => {
    expect(parseRoute('#/')).toEqual({ name: 'list' });
    expect(parseRoute('')).toEqual({ name: 'list' });
    expect(parseRoute('#/screens/abc/edit')).toEqual({ name: 'edit', id: 'abc' });
    expect(parseRoute('#/screens/abc/view?line=LINE-B&smoke=1')).toEqual({
      name: 'view',
      id: 'abc',
    });
  });
});

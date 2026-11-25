import { describe, expect, it } from 'vitest';
import { createDatasetAuthoringView } from '../../../../src/browser/controllers/dataset/designer-dataset-controller-context.js';
import { refreshStrategyNotice } from '../../../../src/browser/dom/dataset/designer-dataset-authoring-dom.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

/**
 * ADR-0104 切片 5：工作台「更新方式」按实例策略回显，push 的回退间隔与保留行数如实带出。
 */
describe('dataset authoring view seeded from the instance update policy', () => {
  it('defaults to manual without an instance policy', () => {
    expect(createDatasetAuthoringView()).toMatchObject({
      refreshStrategy: 'manual',
      refreshInterval: 30,
    });
    expect(createDatasetAuthoringView()).not.toHaveProperty('pushFallbackInterval');
  });

  it('echoes once / manual / auto policies', () => {
    expect(createDatasetAuthoringView({ mode: 'once' }).refreshStrategy).toBe('once');
    expect(createDatasetAuthoringView({ mode: 'manual' }).refreshStrategy).toBe('manual');
    expect(createDatasetAuthoringView({ mode: 'auto', intervalSeconds: 12 })).toMatchObject({
      refreshStrategy: 'auto',
      refreshInterval: 12,
    });
  });

  it('echoes push with fallback interval and retained rows', () => {
    expect(
      createDatasetAuthoringView({
        mode: 'push',
        fallbackIntervalSeconds: 30,
        retain: { rows: 24 },
      }),
    ).toMatchObject({
      refreshStrategy: 'push',
      refreshInterval: 30,
      pushFallbackInterval: 30,
      pushRetainRows: 24,
    });
    const bare = createDatasetAuthoringView({ mode: 'push' });
    expect(bare.refreshStrategy).toBe('push');
    expect(bare).not.toHaveProperty('pushFallbackInterval');
    expect(bare).not.toHaveProperty('pushRetainRows');
  });

  it('explains that push only takes effect outside the design surface', () => {
    expect(refreshStrategyNotice(createDatasetAuthoringView({ mode: 'push' }))).toBe(
      DESIGNER_UI_TEXT.dataSource.refreshPushNotice,
    );
  });
});

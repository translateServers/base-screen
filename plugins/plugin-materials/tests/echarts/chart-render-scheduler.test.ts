import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelChartRender,
  scheduleChartRender,
} from '../../src/echarts/chart-render-scheduler.js';

describe('chart render scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs queued tasks on the next animation frame', () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    scheduleChartRender(() => runs.push(1));
    scheduleChartRender(() => runs.push(2));
    expect(runs).toEqual([]);
    vi.runAllTimers();
    expect(runs).toEqual([1, 2]);
  });

  it('drops cancelled tasks before the frame runs', () => {
    vi.useFakeTimers();
    const runs: string[] = [];
    const cancelled = (): void => {
      runs.push('cancelled');
    };
    scheduleChartRender(cancelled);
    cancelChartRender(cancelled);
    scheduleChartRender(() => runs.push('kept'));
    vi.runAllTimers();
    expect(runs).toEqual(['kept']);
  });

  it('keeps the queue alive when a single task throws', () => {
    vi.useFakeTimers();
    const runs: string[] = [];
    scheduleChartRender(() => {
      throw new Error('chart init failed');
    });
    scheduleChartRender(() => runs.push('after-failure'));
    vi.runAllTimers();
    expect(runs).toEqual(['after-failure']);
  });
});

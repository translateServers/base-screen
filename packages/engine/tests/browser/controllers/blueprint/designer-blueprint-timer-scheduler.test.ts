import { describe, expect, it } from 'vitest';
import { DesignerBlueprintTimerScheduler } from '../../../../src/browser/controllers/blueprint/designer-blueprint-timer-scheduler.js';

function createHarness() {
  const dispatched: number[] = [];
  const periods: number[] = [];
  const cleared: number[] = [];
  const handlers = new Map<number, () => void>();
  const scheduler = new DesignerBlueprintTimerScheduler({
    dispatch: (intervalSeconds) => dispatched.push(intervalSeconds),
    setIntervalFn: (handler, ms) => {
      periods.push(ms);
      handlers.set(ms, handler);
      return ms;
    },
    clearIntervalFn: (handle) => {
      cleared.push(handle as number);
      handlers.delete(handle as number);
    },
  });
  return { scheduler, dispatched, periods, cleared, handlers };
}

describe('DesignerBlueprintTimerScheduler', () => {
  it('creates one interval per distinct second value and ignores duplicates', () => {
    const h = createHarness();
    h.scheduler.sync([5, 5, 10]);
    expect(h.periods).toEqual([5000, 10000]);
    h.handlers.get(5000)!();
    expect(h.dispatched).toEqual([5]);
  });

  it('keeps existing intervals, clears removed ones and adds new ones', () => {
    const h = createHarness();
    h.scheduler.sync([5, 10]);
    h.scheduler.sync([10, 20]);
    expect(h.cleared).toEqual([5000]);
    expect(h.periods).toEqual([5000, 10000, 20000]);
    h.handlers.get(20000)!();
    expect(h.dispatched).toEqual([20]);
  });

  it('stops every interval and rejects invalid values', () => {
    const h = createHarness();
    h.scheduler.sync([0, 1.5, 86_401, 30]);
    expect(h.periods).toEqual([30000]);
    h.scheduler.stop();
    expect(h.cleared).toEqual([30000]);
    expect(h.handlers.size).toBe(0);
  });
});

import type { ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphFromRules } from '../__fixtures__/blueprint-graph.js';
import {
  component,
  createHostResourceCatalog,
  createImmediateResourcePort,
  createViewerHarness,
  document,
  flush,
} from './__fixtures__/viewer-test-harness.js';

// 蓝图能力由宿主授权；Viewer 未传 runtimeContributions 时会以「能力不可用」编译失败，
// 因此这些用例统一声明全部能力可用，聚焦生命周期与定时器调度本身。
const ALL_CAPABILITIES = {
  getResourceType: () => undefined,
  hasBlueprintCapability: () => true,
};

function readyBlueprint(eventName = 'ready_fired'): ScreenDocument['blueprint'] {
  return graphFromRules([
    {
      id: 'ready',
      trigger: { type: 'lifecycle', eventName: 'ready' },
      requiredCapabilities: ['blueprint.trigger.lifecycle', 'blueprint.action.emit-host-event'],
      actions: [
        {
          type: 'emit-host-event',
          eventName,
          payload: { kind: 'literal', value: null },
        },
      ],
    },
  ]);
}

function timerBlueprint(
  entries: readonly { readonly interval: number; readonly eventName: string }[],
): ScreenDocument['blueprint'] {
  return graphFromRules(
    entries.map((entry) => ({
      id: `timer-${entry.interval}`,
      trigger: {
        type: 'timer' as const,
        eventName: 'tick' as const,
        intervalSeconds: entry.interval,
      },
      requiredCapabilities: ['blueprint.trigger.timer', 'blueprint.action.emit-host-event'],
      actions: [
        {
          type: 'emit-host-event' as const,
          eventName: entry.eventName,
          payload: { kind: 'literal' as const, value: null },
        },
      ],
    })),
  );
}

function screenWith(blueprint: ScreenDocument['blueprint']): ScreenDocument {
  return document([component('one')], [], blueprint);
}

/** Viewer 在无 blueprintRuntimePort 时以 `base-screen-blueprint-event` 派发宿主事件。 */
function hostEventNames(dispatched: readonly unknown[]): readonly string[] {
  return dispatched
    .filter((event) => (event as { type?: string }).type === 'base-screen-blueprint-event')
    .map((event) => (event as { init?: { detail?: { name?: string } } }).init?.detail?.name ?? '')
    .filter((name) => name.length > 0);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('viewer blueprint lifecycle', () => {
  it('emits lifecycle ready exactly once per document load', async () => {
    const { viewer, dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(readyBlueprint()),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();
    expect(hostEventNames(dispatched)).toEqual(['ready_fired']);

    // 同一文档的显式数据刷新会重渲染，但不再是「文档装载」，不得重复就绪。
    viewer.refreshData();
    await flush();
    expect(hostEventNames(dispatched)).toEqual(['ready_fired']);
  });

  it('re-arms ready when the document is replaced', async () => {
    const { viewer, dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(readyBlueprint()),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();
    expect(hostEventNames(dispatched)).toHaveLength(1);

    viewer.document = screenWith(readyBlueprint());
    await flush();
    expect(hostEventNames(dispatched)).toHaveLength(2);
  });

  it('schedules timer ticks and keeps different intervals isolated', async () => {
    vi.useFakeTimers();
    const { dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(
        timerBlueprint([
          { interval: 2, eventName: 'tick_2' },
          { interval: 3, eventName: 'tick_3' },
        ]),
      ),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();
    expect(hostEventNames(dispatched)).toEqual([]);

    await vi.advanceTimersByTimeAsync(6_000);
    const names = hostEventNames(dispatched);
    expect(names.filter((name) => name === 'tick_2')).toHaveLength(3);
    expect(names.filter((name) => name === 'tick_3')).toHaveLength(2);
  });

  it('creates no timer when the plan has no timer relation', async () => {
    vi.useFakeTimers();
    const { dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(readyBlueprint()),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hostEventNames(dispatched)).toEqual(['ready_fired']);
  });

  it('stops timers on unload', async () => {
    vi.useFakeTimers();
    const { viewer, dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(timerBlueprint([{ interval: 5, eventName: 'tick_5' }])),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(hostEventNames(dispatched)).toHaveLength(1);

    viewer.unload();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(hostEventNames(dispatched)).toHaveLength(1);
  });

  it('stops timers while disconnected and resumes them on reconnect', async () => {
    vi.useFakeTimers();
    const { viewer, dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(timerBlueprint([{ interval: 4, eventName: 'tick_4' }])),
      resourcePort: createImmediateResourcePort().port,
      runtimeContributions: ALL_CAPABILITIES,
    });
    await flush();

    viewer.disconnectedCallback();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(hostEventNames(dispatched)).toEqual([]);

    viewer.connectedCallback();
    await flush();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(hostEventNames(dispatched)).toEqual(['tick_4']);
  });

  it('does not emit ready when the blueprint cannot be compiled', async () => {
    const { dispatched } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screenWith(readyBlueprint()),
      resourcePort: createImmediateResourcePort().port,
    });
    await flush();
    // 未授权任何能力：编译失败关闭，既不发 ready 也不渲染蓝图动作。
    expect(hostEventNames(dispatched)).toEqual([]);
  });
});

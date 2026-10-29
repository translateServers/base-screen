import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostIntentHandler } from '../../examples/vanilla-host/src/screen/host-intent';

/**
 * 宿主对「失败/被拒」的交代：一句原因 +（可选）一个能继续走的动作。
 *
 * 断言的是**交回引擎的契约**，不是 toast 文案：宿主不再自己弹浮层，
 * 提示只从书写面的常驻状态行出一次（见 DesignerIntentOutcome）。
 */

function designer(): BaseScreenDesignerElement {
  // 只在这两条路径之外被用到：作用域拒绝与传输失败都不会碰设计器。
  return {} as BaseScreenDesignerElement;
}

const handler = () => createHostIntentHandler({ designer: designer(), screenId: 'screen-test' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('host intent handler failure contract', () => {
  it('refuses a component scope with a reason and the whole-screen remedy', async () => {
    const result = await handler()({
      instanceId: 'instance-test',
      text: '把这块的标题改成今晚开抢',
      scope: { kind: 'components', componentIds: ['title'] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('只支持整屏');
    expect(result.remedy).toBe('whole-screen');
  });

  it('reports the transport error in the reason instead of only a toast', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'AGENT_UNAVAILABLE', message: '模型通道不可用。' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );

    const result = await handler()({
      instanceId: 'instance-test',
      text: '生成一张作战室',
      scope: { kind: 'screen' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('模型通道不可用。');
    // 传输失败没有「换个作用域就好了」这种补救，别给假出口。
    expect(result.remedy).toBeUndefined();
  });
});

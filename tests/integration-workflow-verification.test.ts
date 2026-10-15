import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { write } from './__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from './__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: verification evidence and receipts', () => {
  it('invalidates verification evidence, resumes from the peer and refuses premature completion', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    await expect(f.invoke(['finish', '--task', 'work'])).rejects.toThrow('TASK_INCOMPLETE');
    await f.invoke(['begin', 'work', '--upstream', 'complete', '--downstream', 'complete']);
    await f.invoke(['verify', '--task', 'work', '--profile', 'delivery'], f.host);
    const calls = f.calls.length;
    await f.invoke(['verify', '--task', 'work', '--profile', 'delivery']);
    expect(f.calls).toHaveLength(calls);
    write(join(f.host, 'business.ts'), 'new code');
    await expect(f.invoke(['finish', '--task', 'work'])).rejects.toThrow('VERIFICATION_STALE');
    await f.invoke(['verify', '--task', 'work', '--profile', 'delivery']);
    expect((await f.invoke(['finish', '--task', 'work'], f.host)).stages.joint).toBe('complete');
  });

  it('does not reuse a receipt after build artifacts change or in CI', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    await f.invoke(['verify', '--task', 'work', '--profile', 'delivery']);
    const first = f.calls.filter((id) => id === 'base-delivery').length;
    write(join(f.base, 'packages/contracts/dist/index.js'), 'unexpected build output');
    await f.invoke(['verify', '--task', 'work', '--profile', 'delivery']);
    expect(f.calls.filter((id) => id === 'base-delivery')).toHaveLength(first + 1);
    const ci = process.env.CI;
    try {
      process.env.CI = 'true';
      await f.invoke(['verify', '--task', 'work', '--profile', 'delivery']);
      expect(f.calls.filter((id) => id === 'base-delivery')).toHaveLength(first + 2);
    } finally {
      if (ci === undefined) delete process.env.CI;
      else process.env.CI = ci;
    }
  });
});

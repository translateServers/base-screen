import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SOURCE } from '../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import { write } from './__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from './__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: integrity and drift refusal', () => {
  it('preserves the recovery-failed state and prevents finishing', async () => {
    const f = fixture();
    await f.begin();
    f.hook((id) => {
      if (id === 'derive' || id === 'repair') throw new Error('injected recovery problem');
    });
    await expect(f.invoke(['sync', '--task', 'work'])).rejects.toThrow('SYNC_AND_RECOVERY_FAILED');
    expect((await f.invoke(['status'])).recovery).toBe('recovery-failed');
    await expect(f.invoke(['sync', '--task', 'work'])).rejects.toThrow('RECOVERY_REQUIRED');
    f.hook(undefined);
    await f.invoke(['sync', '--task', 'work', '--recover']);
    expect((await f.invoke(['status'])).recovery).toBeNull();
  });

  it('refuses preexisting managed changes and target/source changes during packing', async () => {
    const f = fixture();
    write(join(f.host, 'generated/schema.json'), 'preexisting edit');
    await f.begin();
    await expect(f.invoke(['sync', '--task', 'work'])).rejects.toThrow(
      'PREEXISTING_MANAGED_CHANGES',
    );
    const g = fixture();
    await g.begin();
    g.hook((id) => {
      if (id === 'pack-contracts')
        write(join(g.base, 'packages/contracts/src/index.ts'), 'concurrent source');
    });
    await expect(g.invoke(['sync', '--task', 'work'])).rejects.toThrow(
      'SUPPLIER_CHANGED_DURING_PACK',
    );
    expect(existsSync(join(g.host, SOURCE))).toBe(false);
  });

  it('rejects tampered context snapshots and source changes during delivery checks', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    write(
      join(f.host, '.base-screen/integration-upstream.json'),
      '{"source":{},"capabilities":[]}',
    );
    expect((await f.invoke(['status'])).issues).toContain('CONTEXT_DIGEST');
    const g = fixture();
    await g.begin();
    g.hook((id) => {
      if (id === 'base-delivery')
        write(join(g.base, 'packages/contracts/src/index.ts'), 'concurrent mutation');
    });
    await expect(g.invoke(['sync', '--task', 'work'])).rejects.toThrow('CHECK_INPUT_CHANGED');
  });
});

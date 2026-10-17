import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { write } from '../fixtures/__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from '../fixtures/__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: consumed-artifact drift', () => {
  it.each(['pack', 'lock', 'installed', 'derived'])('rejects %s drift', async (kind) => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    const targets = {
      pack: f.packageFile,
      lock: 'pnpm-lock.yaml',
      installed: 'frontend/node_modules/@base-screen/contracts/dist/index.js',
      derived: 'generated/schema.json',
    };
    write(join(f.host, targets[kind as keyof typeof targets]), 'tampered');
    expect((await f.invoke(['status'])).ok).toBe(false);
    await expect(f.invoke(['sync', '--task', 'work'])).rejects.toThrow('SOURCE_DRIFT');
  });
});

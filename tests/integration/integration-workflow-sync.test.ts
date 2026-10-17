import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  fileHash,
  fingerprints,
  SOURCE,
} from '../../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import { write } from '../fixtures/__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from '../fixtures/__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: package and context synchronisation', () => {
  it('syncs a complete package set, reuses unchanged inputs and separates knowledge changes', async () => {
    const f = fixture();
    await f.begin();
    const first = await f.invoke(['sync', '--task', 'work']);
    expect(first.packages).toBe(true);
    expect((await f.invoke(['status'])).ok).toBe(true);
    const source = fileHash(join(f.host, SOURCE));
    const count = f.calls.length;
    const second = await f.invoke(['sync', '--task', 'work'], f.host);
    expect(second.changed).toBe(false);
    expect(f.calls).toHaveLength(count);
    expect(fileHash(join(f.host, SOURCE))).toBe(source);
    write(join(f.base, 'docs/usage.md'), 'Changed documentation');
    const third = await f.invoke(['sync', '--task', 'work']);
    expect(third.packages).toBe(false);
    expect(third.context).toBe(true);
    expect(f.calls).toHaveLength(count);
    const updated = JSON.parse(readFileSync(join(f.host, SOURCE), 'utf8'));
    expect(updated.packageInputsDigest).toBe(fingerprints(f.base).packages);
    expect(updated.contextSnapshotDigest).toBe(
      fileHash(join(f.host, '.base-screen/integration-upstream.json')),
    );
  });

  it('keeps newer upstream source distinct from the consumed snapshot', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    write(join(f.base, 'packages/contracts/src/index.ts'), 'export const value = 2;\n');
    expect((await f.invoke(['status'])).pendingPackages).toBe(true);
    const ctx = (await f.invoke(['context', 'test'])).context[0];
    expect(ctx.consumed).not.toBeNull();
    await f.invoke(['sync', '--task', 'work']);
    expect(f.calls.filter((id) => id === 'pack-contracts')).toHaveLength(2);
  });

  it('allows an adapter to add a guarded managed path without accepting prior drift', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    write(join(f.host, 'managed-tooling/manifest.json'), '{"generator":"fixture"}\n');
    f.adapter.managed.push('managed-tooling');
    write(
      join(f.host, 'scripts/adapter.mjs'),
      'export const integrationHost = ' + JSON.stringify(f.adapter, null, 2) + ';\n',
    );
    const count = f.calls.length;
    expect((await f.invoke(['sync', '--task', 'work'])).packages).toBe(false);
    expect(f.calls.slice(count)).toEqual(['derive', 'validate']);
    expect((await f.invoke(['status'])).ok).toBe(true);
  });

  it('regenerates host outputs when declared generator inputs change without rebuilding packages', async () => {
    const f = fixture();
    Object.assign(f.adapter, { deriveInputs: ['scripts/generate.mjs'] });
    write(
      join(f.host, 'scripts/adapter.mjs'),
      'export const integrationHost = ' + JSON.stringify(f.adapter),
    );
    write(join(f.host, 'scripts/generate.mjs'), 'first');
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    const count = f.calls.length;
    write(join(f.host, 'scripts/generate.mjs'), 'second');
    expect((await f.invoke(['status'])).pendingContext).toBe(true);
    const result = await f.invoke(['sync', '--task', 'work']);
    expect(result.packages).toBe(false);
    expect(f.calls.slice(count)).toEqual(['derive', 'validate']);
    expect((await f.invoke(['sync', '--task', 'work'])).changed).toBe(false);
  });
});

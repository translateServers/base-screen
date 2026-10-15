import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  fingerprints,
  LOCAL,
  safePath,
} from '../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import {
  boundedOutput,
  parseArgs,
} from '../.agents/skills/base-screen-integration-workflow/scripts/workflow.mjs';
import { write } from './__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from './__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: bootstrap, inspection and bounds', () => {
  it('bootstraps idempotently, preserves unrelated Skills and refuses modified tooling', async () => {
    const f = fixture();
    expect((await f.invoke(['bootstrap'])).changed).toBe(true);
    expect((await f.invoke(['bootstrap'])).changed).toBe(false);
    expect(readFileSync(join(f.host, '.agents/skills/business/SKILL.md'), 'utf8')).toContain(
      'untouched',
    );
    write(join(f.host, '.agents/skills/base-screen-integration-workflow/SKILL.md'), 'manual');
    await expect(f.invoke(['bootstrap'])).rejects.toThrow('TOOLING_INVALID');
  });

  it('does not invent provenance for the existing host and can inspect from either root', async () => {
    const f = fixture();
    await f.begin();
    for (const cwd of [f.base, f.host]) {
      const result = await f.invoke(['status'], cwd);
      expect(result.consumed.state).toBe('unregistered');
      expect(result.pendingPackages).toBe(true);
      const resultContext = await f.invoke(['context', 'test'], cwd);
      expect(resultContext.context[0].consumed).toBeNull();
      expect(resultContext.context[0].proposals[0].state).toBe('needs-design');
    }
  });

  it('invalidates fingerprints for new source and rejects traversal and arbitrary commands', () => {
    const f = fixture();
    const before = fingerprints(f.base);
    write(join(f.base, 'packages/contracts/src/new.ts'), 'new source');
    expect(fingerprints(f.base).packages).not.toBe(before.packages);
    expect(() => safePath(f.base, '../host')).toThrow('PATH_INVALID');
    expect(() => parseArgs(['sync', '--command', 'evil'])).toThrow('ARGUMENT_INVALID');
  });

  it('bounds summaries and retains the full local report outside tracked input', () => {
    const f = fixture();
    const before = fingerprints(f.base).verification;
    const text = boundedOutput({ ok: false, issues: Array(3000).fill('escaped "\\\n') }, f.base);
    expect(text.length).toBeLessThanOrEqual(4000);
    const parsed = JSON.parse(text);
    expect(parsed.truncated).toBe(true);
    expect(existsSync(parsed.report)).toBe(true);
    expect(fingerprints(f.base).verification).toBe(before);
    expect(parsed.report).toContain(
      LOCAL.replaceAll('/', process.platform === 'win32' ? '\\' : '/'),
    );
  });

  it('uses the consumed snapshot when the supplier checkout is absent', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    const moved = f.base + '-offline';
    renameSync(f.base, moved);
    try {
      const status = await f.invoke(['status'], f.host);
      expect(status.upstreamAvailable).toBe(false);
      expect(status.pendingPackages).toBeNull();
      expect((await f.invoke(['context', 'test'], f.host)).context[0].consumed).not.toBeNull();
    } finally {
      renameSync(moved, f.base);
    }
  });

  it('accounts for uncommitted outputs from a previous verified task', async () => {
    const f = fixture();
    await f.begin();
    await f.invoke(['sync', '--task', 'work']);
    await f.invoke([
      'begin',
      'followup',
      '--capability',
      'test',
      '--route',
      'both',
      '--decision',
      'Documentation update',
    ]);
    write(join(f.base, 'docs/usage.md'), 'followup docs');
    const before = f.calls.length;
    const result = await f.invoke(['sync', '--task', 'followup']);
    expect(result.packages).toBe(false);
    expect(f.calls).toHaveLength(before);
  });
});

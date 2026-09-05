import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fileHash,
  fingerprints,
  LOCAL,
  SOURCE,
  safePath,
} from '../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import {
  boundedOutput,
  parseArgs,
} from '../.agents/skills/base-screen-integration-workflow/scripts/workflow.mjs';
import { makeIntegrationFixture, write } from './__fixtures__/integration-workflow-fixture.js';

const fixtures: ReturnType<typeof makeIntegrationFixture>[] = [];
vi.setConfig({ testTimeout: 30_000 });
// Most fixtures exercise a local developer session; the CI-specific test enables CI explicitly.
beforeEach(() => {
  vi.stubEnv('CI', '');
});
function fixture() {
  const value = makeIntegrationFixture();
  fixtures.push(value);
  return value;
}
afterEach(() => {
  for (const item of fixtures.splice(0)) item.cleanup();
  vi.unstubAllEnvs();
});

describe('cross-repository integration workflow', () => {
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

  it.each(['base-format', 'base-delivery', 'pack-contracts', 'install', 'derive', 'validate'])(
    'restores managed outputs after %s failure',
    async (stage) => {
      const f = fixture();
      await f.begin();
      const previous = fileHash(join(f.host, 'pnpm-lock.yaml'));
      write(join(f.host, 'business.ts'), 'author work');
      f.failAt(stage);
      await expect(f.invoke(['sync', '--task', 'work'])).rejects.toThrow('Injected failure');
      expect(fileHash(join(f.host, 'pnpm-lock.yaml'))).toBe(previous);
      expect(readFileSync(join(f.host, 'generated/schema.json'), 'utf8')).toContain('old');
      expect(readFileSync(join(f.host, 'business.ts'), 'utf8')).toBe('author work');
      expect(existsSync(join(f.host, SOURCE))).toBe(false);
    },
  );

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

  it('invalidates fingerprints for new source and rejects traversal and arbitrary commands', () => {
    const f = fixture();
    const before = fingerprints(f.base);
    write(join(f.base, 'packages/contracts/src/new.ts'), 'new source');
    expect(fingerprints(f.base).packages).not.toBe(before.packages);
    expect(() => safePath(f.base, '../host')).toThrow('PATH_INVALID');
    expect(() => parseArgs(['sync', '--command', 'evil'])).toThrow('ARGUMENT_INVALID');
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
});

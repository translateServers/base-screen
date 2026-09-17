import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { write } from './__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from './__fixtures__/integration-workflow-suite.js';

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

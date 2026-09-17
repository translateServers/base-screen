import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fileHash,
  SOURCE,
} from '../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import { write } from './__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from './__fixtures__/integration-workflow-suite.js';

const fixture = useWorkflowFixtures();

describe('cross-repository integration workflow: failure recovery', () => {
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
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  fileHash,
  SOURCE,
} from '../../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import { write } from '../fixtures/__fixtures__/integration-workflow-fixture.js';
import { useWorkflowFixtures } from '../fixtures/__fixtures__/integration-workflow-suite.js';

// 集成工作流用例驱动完整跨仓工作流脚本，墙钟随机器负载变化（全仓满载并行下单用例实测可达
// 140s 以上），全局 30s 阈值会误报超时；本文件放宽到 180s，真实挂死仍会被 180s 拦截。
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

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

import { afterEach, beforeEach, vi } from 'vitest';
import { makeIntegrationFixture } from './integration-workflow-fixture.js';

/**
 * 每个用例独占一个 mkdtemp 夹具，afterEach 只回收本文件登记过的那些。
 *
 * 单独抽出来是因为集成工作流套件按主题分成了多个文件，好让 vitest 的文件级并行
 * 吃满多核（合并成单文件时 25 个用例是顺序跑的，独占关键路径）。
 * 文件之间由 worker 进程天然隔离，因此用例里对 process.env.CI 的直接改写不再外溢。
 */
export function useWorkflowFixtures() {
  const fixtures: ReturnType<typeof makeIntegrationFixture>[] = [];
  // Most fixtures exercise a local developer session; the CI-specific test enables CI explicitly.
  beforeEach(() => {
    vi.stubEnv('CI', '');
  });
  afterEach(() => {
    for (const item of fixtures.splice(0)) item.cleanup();
    vi.unstubAllEnvs();
  });
  return function fixture() {
    const value = makeIntegrationFixture();
    fixtures.push(value);
    return value;
  };
}

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Package suites already run through Turbo; the root suite owns only cross-package and example tests.
    include: ['tests/**/*.test.ts'],
    // 这些用例驱动跨仓工作流与宿主 Skill 生成器，墙钟时间随机器负载变化：同一个用例空载约 3s，
    // 与其它重负载文件并发时会超过 5s。放宽到 30s 避免把负载误报成失败，真正的挂死仍会在 30s 失败。
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

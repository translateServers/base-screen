import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import { createViteLibraryConfig } from '../../tooling/build/vite-library-config.ts';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

// viewer 生命周期用例本身偏重（单独运行约 3.2s/个，用真实计时器驱动异步编排）。
// Turbo 并发跑各包套件时 CPU 被挤占，这些用例会超过 vitest 默认的 5s 预算并随机失败
// （已在纯净树上复现：同样的 5 个用例、同样的 5000ms 超时）。
// 放宽到 15s 只影响测试预算：真正挂起的用例仍会在 15s 失败，产品代码与构建产物不变。
export default mergeConfig(
  createViteLibraryConfig(packageRoot),
  defineConfig({
    test: {
      testTimeout: 15000,
    },
  }),
);

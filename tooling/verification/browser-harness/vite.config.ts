import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// monorepo 开发工作流：harness 直接编辑 packages/* 的源码并在 dev server 里热更新。
// 两个必要条件：
// 1. resolve.alias 把 `@base-screen/*` 指向各包 `src/index.ts`，否则包内互相导入会按
//    package.json exports 解析到 dist 构建产物，改 src 不生效、也不在 vite 模块图里。
// 2. watcher.add(packages)：vite 默认只 watch 根目录（tooling/verification/browser-harness），
//    不改配置则 packages 下的文件变更不会触发 HMR/整页刷新。
const MONOREPO_PACKAGES = [
  'contracts',
  'core',
  'renderer',
  'engine',
  'material',
  'plugin-core',
  'plugin-manager',
  'plugin-sdk',
  'react',
  'vue',
  'sdk',
] as const;

export default defineConfig({
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  resolve: {
    alias: Object.fromEntries(
      MONOREPO_PACKAGES.map((name) => [
        `@base-screen/${name}`,
        resolve(import.meta.dirname, `../../../packages/${name}/src/index.ts`),
      ]),
    ),
  },
  plugins: [
    {
      name: 'watch-monorepo-packages',
      configureServer(server) {
        server.watcher.add(resolve(import.meta.dirname, '../../../packages'));
      },
    },
  ],
});

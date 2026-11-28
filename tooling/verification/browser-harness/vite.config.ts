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

// 产品包 `base-screen` 的裸导入与子路径：React/Vue 桥接源码仍以 `base-screen/*`
// 引用契约与插件包，dev server 下同样要落到源码，否则会去找尚未构建的 dist。
const PRODUCT_ALIASES = [
  ['base-screen/contracts', 'contracts'],
  ['base-screen/plugin-core', 'plugin-core'],
  ['base-screen/engine', 'engine'],
  ['base-screen/plugin-sdk', 'plugin-sdk'],
  ['base-screen', 'sdk'],
] as const;

export default defineConfig({
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  resolve: {
    alias: [
      // 组件工坊（ADR-0105）复用三端示例的共享实现，它按产品包子路径导入插件 SDK。
      {
        find: /^base-screen\/plugins$/,
        replacement: resolve(import.meta.dirname, '../../../packages/sdk/src/plugins.ts'),
      },
      // 子路径必须先于裸包匹配；用精确正则避免 `base-screen` 吞掉子路径。
      ...PRODUCT_ALIASES.map(([specifier, packageName]) => ({
        find: new RegExp(`^${specifier}$`),
        replacement: resolve(import.meta.dirname, `../../../packages/${packageName}/src/index.ts`),
      })),
      ...MONOREPO_PACKAGES.map((name) => ({
        find: new RegExp(`^@base-screen/${name}$`),
        replacement: resolve(import.meta.dirname, `../../../packages/${name}/src/index.ts`),
      })),
    ],
  },
  // L3 网络导航验收走真实 shared-backend；harness 不再自带临时沙箱路由（ADR-0118 N3）。
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
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

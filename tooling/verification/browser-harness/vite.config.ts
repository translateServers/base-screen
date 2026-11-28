import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import {
  BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN,
  BASE_SCREEN_ISOLATED_SANDBOX_HEADERS,
  buildBaseScreenIsolatedSandboxCsp,
} from '../../../packages/plugin-sdk/src/material-isolated-csp.ts';

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
  ['base-screen/plugin-sdk', 'plugin-sdk'],
  ['base-screen', 'sdk'],
] as const;

/**
 * L3 沙箱路由（ADR-0118）的最小实现，只给技术验证页用：`PUT /__l3-sandbox/:hash` 存文档，
 * `GET` / `HEAD` 按内容哈希取回，响应头 CSP 由这里写死（只采纳校验过的脚本哈希）。存在内存里。
 */
const L3_SANDBOX_PREFIX = '/__l3-sandbox/';
const L3_SANDBOX_MAX_BYTES = 4 * 1024 * 1024;

function l3SandboxRoute(): Plugin {
  const documents = new Map<string, { readonly html: string; readonly csp: string }>();
  return {
    name: 'l3-sandbox-route',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(L3_SANDBOX_PREFIX)) {
          next();
          return;
        }
        const hash = url.slice(L3_SANDBOX_PREFIX.length).split('?')[0] ?? '';
        const reply = (status: number, body?: string): void => {
          response.statusCode = status;
          response.end(body);
        };
        if (!BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN.test(hash)) {
          reply(400, 'bad hash');
          return;
        }
        if (request.method === 'PUT') {
          const chunks: Buffer[] = [];
          let size = 0;
          request.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size <= L3_SANDBOX_MAX_BYTES) chunks.push(chunk);
          });
          request.on('end', () => {
            if (size > L3_SANDBOX_MAX_BYTES) {
              reply(413, 'too large');
              return;
            }
            let body: { html?: unknown; scriptHashes?: unknown };
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
            } catch {
              reply(400, 'bad json');
              return;
            }
            if (typeof body.html !== 'string' || !Array.isArray(body.scriptHashes)) {
              reply(400, 'bad body');
              return;
            }
            if (createHash('sha256').update(body.html, 'utf8').digest('hex') !== hash) {
              reply(400, 'hash mismatch');
              return;
            }
            const csp = buildBaseScreenIsolatedSandboxCsp(body.scriptHashes, "'self'");
            if (csp === undefined) {
              reply(400, 'bad script hashes');
              return;
            }
            documents.set(hash, { html: body.html, csp });
            reply(204);
          });
          return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          reply(405);
          return;
        }
        const stored = documents.get(hash);
        if (stored === undefined) {
          reply(404, 'not found');
          return;
        }
        for (const [name, value] of Object.entries(BASE_SCREEN_ISOLATED_SANDBOX_HEADERS)) {
          response.setHeader(name, value);
        }
        response.setHeader('Content-Security-Policy', stored.csp);
        reply(200, request.method === 'HEAD' ? undefined : stored.html);
      });
    },
  };
}

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
  plugins: [
    l3SandboxRoute(),
    {
      name: 'watch-monorepo-packages',
      configureServer(server) {
        server.watcher.add(resolve(import.meta.dirname, '../../../packages'));
      },
    },
  ],
});

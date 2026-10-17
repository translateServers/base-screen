import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vue 前端示例的外部消费者校验：把 `examples/vue-host` 复制到仓库外的临时项目，
 * `@base-screen/*` 依赖全部换成同批次真实 tarball，再跑 typecheck / build / 浏览器闭环。
 *
 * 这比"仓库内示例"强在两点：
 * 1. 它只走 `@base-screen/*` 公共入口，碰不到仓库源码路径——能证明示例不是靠 workspace
 *    才成立；
 * 2. 它验证的是"宿主自建 Vue 工程从发布物消费 ABI"这条真实接入路径。
 *
 * 后端隔离（决策 D6）：该门禁的目的是验证 **ABI 消费**，而不是后端集成（后者由
 * `examples/shared-backend` 的 jest e2e 覆盖）。因此这里不复制 host-api，而是用 Playwright
 * `page.route` 按 REST 契约履约 `/api/**`，把前端与后端解耦，让失败原因始终落在
 * "包 ABI 或前端接入"上。
 */
export function writeHostAppVueTarballConsumerFiles(consumer, tarballSpec, root) {
  const example = join(root, 'examples', 'vue-host');
  // 复制除安装/构建产物外的全部工程文件（含 SFC、vite 配置、样式）。
  cpSync(example, consumer, {
    recursive: true,
    filter: (source) => !/[/\\](node_modules|dist|\.turbo|data)([/\\]|$)/.test(source),
  });

  const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  // 仓库内是 workspace 协议，外部消费者必须换成真实 tarball。
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (name.startsWith('@base-screen/')) {
      manifest.dependencies[name] = tarballSpec(name.replace('@base-screen/', ''));
    }
  }
  // 浏览器验证脚本需要 Playwright；示例本身不带它（仓库内由根 devDependencies 提供）。
  manifest.devDependencies = {
    ...manifest.devDependencies,
    '@playwright/test': '1.62.1',
  };
  manifest.packageManager = 'pnpm@11.18.0';
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // 覆盖示例自带的冒烟脚本（它依赖仓库内已构建的 host-api），换成契约存根版本。
  writeFileSync(join(consumer, 'scripts', 'smoke.mjs'), consumerVerifierSource());
}

/** 契约存根 + 断言：与 examples/README.md 的 REST 契约表逐字段对齐。 */
function consumerVerifierSource() {
  return `import { chromium } from '@playwright/test';
import { preview } from 'vite';

const SEED_ID = 'seed-sales';
const SCREEN_NAME = '默认销售大屏';

/** 与 host-api 起始文档同构的 canonical 文档（含 host-resource 数据绑定）。 */
const seedDocument = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
  components: [
    {
      id: 'stage-bg',
      type: 'base.rectangle',
      name: '背景',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
      rotation: 0,
      zIndex: 1,
      status: { locked: true, hidden: false },
      props: {},
      style: { fill: '#0b1020', borderColor: '#1f2a44', borderWidth: 0, opacity: 1 },
      dataSource: null,
    },
    {
      id: 'stage-title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 64, y: 48 },
      size: { width: 900, height: 64 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#e8eefb', fontSize: 40, fontWeight: '700', textAlign: 'left' },
      dataSource: { type: 'static', value: '销售运营大屏' },
    },
    {
      id: 'stage-cpu',
      type: 'host-app.metric-value',
      name: 'CPU 读数',
      parentId: null,
      position: { x: 64, y: 140 },
      size: { width: 260, height: 120 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: { unit: '%' },
      style: {},
      dataSource: {
        type: 'host-resource',
        resourceType: 'demo_metric',
        resourceId: 'cpu_usage',
        params: { points: { kind: 'literal', value: 24 } },
        binding: { fields: { value: ['value'] } },
      },
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

function screenShape(revision) {
  return {
    id: SEED_ID,
    name: SCREEN_NAME,
    revision,
    document: seedDocument,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

const server = await preview({ root: process.cwd(), preview: { host: '127.0.0.1', port: 0 } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('VUE_HOST_TARBALL_SERVER_URL_MISSING');

const browser = await chromium.launch();
const puts = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // 契约存根：只实现示例真正用到的端点，响应形状与 host-api 一致。
  let revision = 1;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/api/health') return json({ status: 'ok' });
    if (path === '/api/screens' && request.method() === 'GET') {
      return json({
        screens: [{ id: SEED_ID, name: SCREEN_NAME, revision, updatedAt: screenShape(revision).updatedAt }],
      });
    }
    if (path === '/api/screens/' + SEED_ID && request.method() === 'GET') {
      return json({ screen: screenShape(revision) });
    }
    if (path === '/api/screens/' + SEED_ID && request.method() === 'PUT') {
      const body = JSON.parse(request.postData() ?? '{}');
      puts.push(body);
      if (body.revision !== revision) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'REVISION_CONFLICT', message: 'stale' }),
        });
      }
      revision += 1;
      return json({ screen: screenShape(revision) });
    }
    if (path === '/api/metrics/series') {
      const metric = new URL(request.url()).searchParams.get('metric') ?? 'cpu_usage';
      return json({
        metric,
        unit: '%',
        points: [
          { t: '2026-01-01T00:00:00.000Z', value: 41.5 },
          { t: '2026-01-01T00:01:00.000Z', value: 47.25 },
        ],
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"NOT_FOUND","message":"stub"}' });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 1) 列表渲染种子大屏。
  await page.waitForFunction(
    (name) => document.body.textContent?.includes(name) === true,
    SCREEN_NAME,
    { timeout: 30_000 },
  );

  // 2) 编辑页：包 ABI 注册的设计器挂载，宿主 adapter 载入文档。
  await page.locator('.screen-card', { hasText: SCREEN_NAME }).getByText('编辑').click();
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      return designer?.isConnected === true && (designer.document?.components.length ?? 0) > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  const designerState = await page.evaluate(() => {
    const designer = document.querySelector('base-screen-designer');
    return {
      registered: customElements.get('base-screen-designer') !== undefined,
      viewerRegistered: customElements.get('base-screen-viewer') !== undefined,
      materialRegistered: customElements.get('host-app-metric-value') !== undefined,
      componentCount: designer?.document?.components.length ?? 0,
      revision: designer?.document === null ? null : true,
    };
  });
  if (!designerState.registered || !designerState.viewerRegistered || !designerState.materialRegistered) {
    throw new Error('VUE_HOST_TARBALL_REGISTRATION_FAILED: ' + JSON.stringify(designerState));
  }
  if (designerState.componentCount !== 3) {
    throw new Error('VUE_HOST_TARBALL_DOCUMENT_FAILED: ' + JSON.stringify(designerState));
  }

  // 3) host-resource 数据通道 + SFC 物料：指标读数渲染出存根指标数值。
  await page.waitForFunction(
    () => {
      const metric = document
        .querySelector('base-screen-designer')
        ?.shadowRoot?.querySelector('host-app-metric-value');
      const text = metric?.shadowRoot?.textContent ?? metric?.textContent ?? '';
      return text.includes('41.5') || text.includes('47.25');
    },
    undefined,
    { timeout: 30_000 },
  );

  // 4) 宿主 project adapter 的保存语义：经公开 save() 走 PUT，revision 乐观锁 +1。
  const saved = await page.evaluate(async () => {
    const designer = document.querySelector('base-screen-designer');
    const result = await designer.save();
    return { ok: result.ok === true, revision: result.ok ? result.value.revision : null };
  });
  if (!saved.ok || saved.revision !== '2') {
    throw new Error('VUE_HOST_TARBALL_SAVE_FAILED: ' + JSON.stringify(saved));
  }
  if (puts.length !== 1 || puts[0].revision !== 1) {
    throw new Error('VUE_HOST_TARBALL_SAVE_CONTRACT_FAILED: ' + JSON.stringify(puts));
  }
  if (puts[0].document?.components?.length !== 3) {
    throw new Error('VUE_HOST_TARBALL_SAVE_DOCUMENT_FAILED');
  }

  // 5) 查看页：查看器渲染种子文档内容。
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.locator('.screen-card', { hasText: SCREEN_NAME }).getByText('查看').click();
  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('base-screen-viewer');
      const text = viewer?.shadowRoot?.textContent ?? '';
      return text.includes('销售运营大屏');
    },
    undefined,
    { timeout: 30_000 },
  );

  if (errors.length > 0) {
    throw new Error('VUE_HOST_TARBALL_PAGE_ERRORS: ' + JSON.stringify(errors));
  }
} finally {
  await browser.close();
  await server.close();
}
`;
}

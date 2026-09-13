import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vue 宿主示例的外部消费者校验：把 `examples/vue-host` 整个工程复制到仓库外的临时项目，
 * 依赖全部换成同批次的真实 tarball，再跑 typecheck / build / 浏览器验证。
 *
 * 这比"仓库内示例"强在两点：
 * 1. 它只走 `@base-screen/*` 公共入口，碰不到仓库源码路径——能证明示例不是靠 workspace 才成立；
 * 2. 它验证的是"宿主自建 Vue 工程"这条真实接入路径，而不只是基座自带的 fixture。
 */
export function writeVueHostTarballConsumerFiles(consumer, tarballSpec, root) {
  const example = join(root, 'examples', 'vue-host');
  // 复制除安装产物外的全部工程文件（含 SFC、vite 配置、样式）。
  cpSync(example, consumer, {
    recursive: true,
    filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
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

  writeFileSync(join(consumer, 'browser.mjs'), vueHostBrowserVerifierSource());
  mkdirSync(join(consumer, 'src'), { recursive: true });
}

function vueHostBrowserVerifierSource() {
  return `import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({ root: process.cwd(), preview: { host: '127.0.0.1', port: 0 } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('VUE_HOST_TARBALL_SERVER_URL_MISSING');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__vueHost !== undefined, undefined, { timeout: 30000 });

  // 1) 插件通道真的生效：插件进了目录、无激活失败，且它贡献的物料在目录里。
  const state = await page.evaluate(() => window.__vueHost);
  if (!state.pluginIds.includes('vue-host.demo')) {
    throw new Error('VUE_HOST_TARBALL_PLUGIN_MISSING: ' + JSON.stringify(state.pluginIds));
  }
  if (state.failures.length > 0) {
    throw new Error('VUE_HOST_TARBALL_PLUGIN_FAILED: ' + JSON.stringify(state.failures));
  }
  if (!state.materialTypes.includes('vue-host.product-card')) {
    throw new Error('VUE_HOST_TARBALL_MATERIAL_MISSING: ' + JSON.stringify(state.materialTypes));
  }

  // 2) 宿主自有的 Vue SFC 物料确实渲染，且带出组件内容。
  await page.waitForFunction(
    () => document.querySelector('base-screen-designer')?.shadowRoot?.querySelector('vue-host-product-card') !== null,
  );
  const rendered = await page.evaluate(() => {
    const root = document.querySelector('base-screen-designer').shadowRoot;
    const stock = root.querySelector('[data-product-card-stock]');
    return { text: stock?.textContent ?? null, title: root.querySelector('.product-card-title')?.textContent ?? null };
  });
  if (rendered.text === null || !rendered.text.includes('0')) {
    throw new Error('VUE_HOST_TARBALL_MATERIAL_NOT_RENDERED: ' + JSON.stringify(rendered));
  }

  // 3) 插件命令闭环：design.read 读现状 → command.execute 写回 → Vue 组件重渲染 → 可撤销。
  const docStock = () =>
    page.evaluate(
      () => window.__vueHost.designer.document?.components.find((c) => c.id === 'stock-card')?.props?.stock ?? null,
    );
  await page.locator('#host-restock').click();
  await page.waitForFunction(
    () => window.__vueHost.designer.document?.components.find((c) => c.id === 'stock-card')?.props?.stock === 10,
    undefined,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => document.querySelector('base-screen-designer')?.shadowRoot?.querySelector('[data-product-card-stock]')?.textContent?.includes('10') === true,
    undefined,
    { timeout: 20000 },
  );
  if ((await docStock()) !== 10) throw new Error('VUE_HOST_TARBALL_COMMAND_FAILED');

  // 第二次以第一次结果为基准：写死初始值的实现会在这里暴露。
  await page.locator('#host-restock').click();
  await page.waitForFunction(
    () => window.__vueHost.designer.document?.components.find((c) => c.id === 'stock-card')?.props?.stock === 20,
    undefined,
    { timeout: 20000 },
  );

  await page.locator('#host-undo').click();
  await page.waitForFunction(
    () => window.__vueHost.designer.document?.components.find((c) => c.id === 'stock-card')?.props?.stock === 10,
    undefined,
    { timeout: 20000 },
  );

  // 4) 宿主项目适配器进入 play：保存必须经过宿主自己的 revision 语义（save() 无参数）。
  const saved = await page.evaluate(async () => {
    const { designer } = window.__vueHost;
    const result = await designer.save();
    return { ok: result.ok, codes: (result.diagnostics ?? []).map((d) => d.code) };
  });
  if (saved.ok !== true) {
    throw new Error('VUE_HOST_TARBALL_SAVE_FAILED: ' + JSON.stringify(saved));
  }

  // 5) 公开的程序化插入入口：宿主不碰私有拖放，也不手搓完整组件节点。
  const inserted = await page.evaluate(() => {
    const { designer } = window.__vueHost;
    const before = designer.document.components.length;
    // 省略 position：应落在可见画布中心并整体在画布内。
    const result = designer.insertComponent({ materialType: 'vue-host.product-card' });
    const document_ = designer.document;
    const node = result.ok
      ? document_.components.find((c) => c.type === 'vue-host.product-card' && c.id !== 'stock-card')
      : undefined;
    return {
      ok: result.ok,
      codes: (result.diagnostics ?? []).map((d) => d.code),
      grew: document_.components.length === before + 1,
      node: node === undefined ? null : {
        id: node.id,
        name: node.name,
        props: node.props,
        size: node.size,
        insideCanvas:
          node.position.x >= 0 && node.position.y >= 0 &&
          node.position.x + node.size.width <= document_.canvas.width &&
          node.position.y + node.size.height <= document_.canvas.height,
      },
      selected: [...designer.selection.selectedComponentIds],
    };
  });
  if (!inserted.ok || !inserted.grew || inserted.node === null) {
    throw new Error('VUE_HOST_TARBALL_INSERT_COMPONENT_FAILED: ' + JSON.stringify(inserted));
  }
  // 按 manifest 默认值构造：默认 props 与名称都应来自 manifest，且新组件被选中。
  if (inserted.node.name !== '商品卡' || inserted.node.props.title !== '商品') {
    throw new Error('VUE_HOST_TARBALL_INSERT_DEFAULTS_FAILED: ' + JSON.stringify(inserted.node));
  }
  if (!inserted.node.insideCanvas) {
    throw new Error('VUE_HOST_TARBALL_INSERT_POSITION_FAILED: ' + JSON.stringify(inserted.node));
  }
  if (inserted.selected.join() !== inserted.node.id) {
    throw new Error('VUE_HOST_TARBALL_INSERT_SELECTION_FAILED: ' + JSON.stringify(inserted));
  }

  // 未知物料类型必须失败关闭。
  const rejected = await page.evaluate(() => {
    const { designer } = window.__vueHost;
    const result = designer.insertComponent({ materialType: 'no.such-material' });
    return { ok: result.ok, codes: (result.diagnostics ?? []).map((d) => d.code) };
  });
  if (rejected.ok) {
    throw new Error('VUE_HOST_TARBALL_INSERT_UNKNOWN_ACCEPTED: ' + JSON.stringify(rejected));
  }

  if (errors.length > 0) {
    throw new Error('VUE_HOST_TARBALL_PAGE_ERRORS: ' + JSON.stringify(errors));
  }
} finally {
  await browser.close();
  await server.close();
}
`;
}

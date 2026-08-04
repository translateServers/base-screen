import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';

function run(command, args, cwd) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  execFileSync(executable, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

function assertTarballContents(tarball) {
  const entries = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/);
  const illegalEntry = entries.find(
    (entry) =>
      !/^package\/(?:dist\/|LICENSE$|package\.json$|README(?:\.md)?$|NOTICE(?:\.md)?$)/.test(entry),
  );
  if (illegalEntry) {
    throw new Error(`TARBALL_UNEXPECTED_FILE: ${illegalEntry}`);
  }
}

function packageDirectoryByName(name) {
  return Object.entries(PACKAGE_DEFINITIONS).find(
    ([, definition]) => definition.name === name,
  )?.[0];
}

function workspaceDependencyDirectories(directory) {
  const manifest = JSON.parse(readFileSync(join('packages', directory, 'package.json'), 'utf8'));
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })
    .map((name) => packageDirectoryByName(name))
    .filter((candidate) => candidate !== undefined);
}

function patchWorkspaceDependencySpecs(directory, tarball) {
  const dependencies = workspaceDependencyDirectories(directory);
  if (dependencies.length === 0) {
    return tarball;
  }
  const working = mkdtempSync(join(temporaryRoot, `patch-${directory}-`));
  execFileSync('tar', ['-xzf', tarball, '-C', working]);
  const manifestPath = join(working, 'package', 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let changed = false;
  for (const dependencyType of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const entries = manifest[dependencyType];
    if (!entries) {
      continue;
    }
    for (const name of Object.keys(entries)) {
      const dependencyDirectory = packageDirectoryByName(name);
      if (dependencyDirectory === undefined) {
        continue;
      }
      const dependencyTarball = packedTarballs.get(dependencyDirectory);
      if (!dependencyTarball) {
        throw new Error(`TARBALL_DEPENDENCY_NOT_PACKED: ${directory} -> ${name}`);
      }
      entries[name] = `file:${dependencyTarball.replace(/\\/g, '/')}`;
      changed = true;
    }
  }
  if (!changed) {
    return tarball;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const patched = join(dirname(tarball), `${directory}-patched.tgz`);
  execFileSync('tar', ['-czf', patched, 'package'], { cwd: working });
  return patched;
}

function packageBuildOrder() {
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  const visit = (directory) => {
    if (visited.has(directory)) {
      return;
    }
    if (visiting.has(directory)) {
      throw new Error(`TARBALL_DEPENDENCY_CYCLE: ${directory}`);
    }
    visiting.add(directory);
    for (const dependency of workspaceDependencyDirectories(directory)) {
      visit(dependency);
    }
    visiting.delete(directory);
    visited.add(directory);
    ordered.push(directory);
  };

  for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
    visit(directory);
  }
  return ordered;
}

function tarballSpec(directory) {
  const tarball = packedTarballs.get(directory);
  if (!tarball) {
    throw new Error(`TARBALL_DEPENDENCY_NOT_PACKED: ${directory}`);
  }
  return `file:${tarball.replace(/\\/g, '/')}`;
}

function writeConsumerFiles(consumer, framework) {
  const isReact = framework === 'react';
  const productTag = `base-screen-${framework}-product`;
  const workspaceDependencies = [
    'contracts',
    'core',
    'engine',
    'material',
    'plugin-core',
    'plugin-manager',
    'plugin-sdk',
    'renderer',
    'sdk',
    framework,
  ];
  const dependencies = {
    ...Object.fromEntries(
      workspaceDependencies.map((directory) => [
        `@base-screen/${directory}`,
        tarballSpec(directory),
      ]),
    ),
    ...(isReact ? { react: '19.1.0', 'react-dom': '19.1.0' } : { vue: '3.5.0' }),
  };
  const devDependencies = {
    '@playwright/test': '1.62.1',
    typescript: '7.0.2',
    vite: '8.2.0',
    ...(isReact
      ? { '@types/react': '19.2.18', '@types/react-dom': '19.2.4' }
      : { '@vitejs/plugin-vue': '6.0.8' }),
  };
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: `base-screen-${framework}-tarball-consumer`,
        private: true,
        type: 'module',
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'vite build',
          verify: 'node browser.mjs',
        },
        dependencies,
        devDependencies,
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(consumer, 'src'));
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'Preserve',
          moduleResolution: 'Bundler',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          skipLibCheck: false,
          ...(isReact ? { jsx: 'react-jsx' } : {}),
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumer, 'index.html'),
    `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.${isReact ? 'tsx' : 'ts'}"></script></body></html>\n`,
  );
  writeFileSync(join(consumer, 'browser.mjs'), browserVerifierSource(framework, productTag));
  if (isReact) {
    writeReactConsumerFiles(consumer, productTag);
  } else {
    writeVueConsumerFiles(consumer, productTag);
  }
}

function writeReactConsumerFiles(consumer, productTag) {
  writeFileSync(
    join(consumer, 'src', 'base-screen-elements.d.ts'),
    `import type { ClassAttributes, HTMLAttributes } from 'react';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      '${productTag}': ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & { model?: BaseScreenMaterialModel };
    }
  }
}
`,
  );
  writeFileSync(
    join(consumer, 'src', 'bridge.ts'),
    `import { createElement, useEffect } from 'react';
import { createReactMaterialDefinition } from '@base-screen/react';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

declare global {
  interface Window {
    __baseScreenBridge?: { mounts: number; unmounts: number };
  }
}

const manifest: BaseScreenMaterialManifest = {
  type: 'consumer.react-product',
  tagName: '${productTag}',
  name: 'React Product',
  category: 'Consumer',
  keywords: ['consumer'],
  defaultSize: { width: 200, height: 40 },
  defaultProps: { label: 'Initial' },
  defaultStyle: {},
  propsSchema: {
    kind: 'object',
    properties: { label: { kind: 'string' } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: 'Label', control: 'text' }],
  events: ['valueClick'],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: false, children: false },
};

function Product({ label, onValueClick }: { label: string; onValueClick?: (payload: unknown) => void }) {
  useEffect(() => {
    const state = (window.__baseScreenBridge ??= { mounts: 0, unmounts: 0 });
    state.mounts += 1;
    return () => {
      state.unmounts += 1;
    };
  }, []);
  return createElement(
    'button',
    { id: 'product-action', type: 'button', onClick: () => onValueClick?.({ framework: 'react' }) },
    label,
  );
}

export function registerProduct(): void {
  const definition = createReactMaterialDefinition({
    manifest,
    component: Product,
    eventProps: { valueClick: 'onValueClick' },
  });
  if (!definition.ok) throw new Error('REACT_TARBALL_PRODUCT_DEFINITION_FAILED');
  customElements.define(definition.value.manifest.tagName, definition.value.constructor);
}
`,
  );
  writeFileSync(
    join(consumer, 'src', 'main.tsx'),
    `import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { defineBaseScreenElements } from '@base-screen/sdk';
import { registerProduct } from './bridge';

declare global {
  interface Window {
    __tarballConsumer?: {
      reconnect(): void;
      state(): { events: number; mounts: number; unmounts: number };
      unmount(): void;
    };
  }
}

function model(label: string): BaseScreenMaterialModel {
  return {
    componentId: 'react-product',
    mode: 'viewer',
    interactive: true,
    props: { label },
    style: {},
    size: { width: 200, height: 40 },
    dataState: { status: 'idle' },
  };
}

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('REACT_TARBALL_SDK_REGISTRATION_FAILED');
registerProduct();

function App({ unmount }: { unmount: () => void }) {
  const [label, setLabel] = useState('Initial');
  const product = useRef<HTMLElement | null>(null);
  const events = useRef(0);
  useEffect(() => {
    const element = product.current;
    const onEvent = () => {
      events.current += 1;
    };
    element?.addEventListener('base-screen-material-event', onEvent);
    window.__tarballConsumer = {
      reconnect: () => {
        const target = product.current;
        if (target === null) throw new Error('REACT_TARBALL_PRODUCT_MISSING');
        const parent = target.parentNode;
        const sibling = target.nextSibling;
        target.remove();
        parent?.insertBefore(target, sibling);
      },
      state: () => ({
        events: events.current,
        mounts: window.__baseScreenBridge?.mounts ?? 0,
        unmounts: window.__baseScreenBridge?.unmounts ?? 0,
      }),
      unmount,
    };
    return () => element?.removeEventListener('base-screen-material-event', onEvent);
  }, [unmount]);
  return (
    <>
      <${productTag} id="product" ref={product} model={model(label)} />
      <button id="update-model" type="button" onClick={() => setLabel('Updated')}>Update</button>
    </>
  );
}

const host = document.querySelector('#app');
if (host === null) throw new Error('REACT_TARBALL_HOST_MISSING');
const root = createRoot(host);
root.render(<App unmount={() => root.unmount()} />);
`,
  );
  writeFileSync(
    join(consumer, 'vite.config.ts'),
    `import { defineConfig } from 'vite';

export default defineConfig({});
`,
  );
}

function writeVueConsumerFiles(consumer, productTag) {
  writeFileSync(
    join(consumer, 'src', 'base-screen-elements.d.ts'),
    `import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';

declare module 'vue' {
  export interface GlobalComponents {
    '${productTag}': {
      new (): { $props: { model?: BaseScreenMaterialModel } };
    };
  }
}

export {};
`,
  );
  writeFileSync(
    join(consumer, 'src', 'bridge.ts'),
    `import { defineComponent, h, onMounted, onUnmounted } from 'vue';
import { createVueMaterialDefinition } from '@base-screen/vue';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

declare global {
  interface Window {
    __baseScreenBridge?: { mounts: number; unmounts: number };
  }
}

const manifest: BaseScreenMaterialManifest = {
  type: 'consumer.vue-product',
  tagName: '${productTag}',
  name: 'Vue Product',
  category: 'Consumer',
  keywords: ['consumer'],
  defaultSize: { width: 200, height: 40 },
  defaultProps: { label: 'Initial' },
  defaultStyle: {},
  propsSchema: {
    kind: 'object',
    properties: { label: { kind: 'string' } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: 'Label', control: 'text' }],
  events: ['valueClick'],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: false, children: false },
};

const Product = defineComponent({
  props: {
    label: { type: String, required: true },
    onValueClick: { type: Function, required: false },
  },
  setup(props) {
    onMounted(() => {
      const state = (window.__baseScreenBridge ??= { mounts: 0, unmounts: 0 });
      state.mounts += 1;
    });
    onUnmounted(() => {
      const state = (window.__baseScreenBridge ??= { mounts: 0, unmounts: 0 });
      state.unmounts += 1;
    });
    return () =>
      h(
        'button',
        {
          id: 'product-action',
          type: 'button',
          onClick: () => (props.onValueClick as ((payload: unknown) => void) | undefined)?.({ framework: 'vue' }),
        },
        props.label,
      );
  },
});

export function registerProduct(): void {
  const definition = createVueMaterialDefinition({
    manifest,
    component: Product,
    eventProps: { valueClick: 'onValueClick' },
  });
  if (!definition.ok) throw new Error('VUE_TARBALL_PRODUCT_DEFINITION_FAILED');
  customElements.define(definition.value.manifest.tagName, definition.value.constructor);
}
`,
  );
  writeFileSync(
    join(consumer, 'src', 'App.vue'),
    `<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';

const label = ref('Initial');
const product = ref<HTMLElement | null>(null);
const events = ref(0);
const model = computed<BaseScreenMaterialModel>(() => ({
  componentId: 'vue-product',
  mode: 'viewer',
  interactive: true,
  props: { label: label.value },
  style: {},
  size: { width: 200, height: 40 },
  dataState: { status: 'idle' },
}));

function updateModel(): void {
  label.value = 'Updated';
}

function onEvent(): void {
  events.value += 1;
}

onMounted(() => {
  window.__tarballConsumer = {
    reconnect: () => {
      const element = product.value;
      if (element === null) throw new Error('VUE_TARBALL_PRODUCT_MISSING');
      const parent = element.parentNode;
      const sibling = element.nextSibling;
      element.remove();
      parent?.insertBefore(element, sibling);
    },
    state: () => ({
      events: events.value,
      mounts: window.__baseScreenBridge?.mounts ?? 0,
      unmounts: window.__baseScreenBridge?.unmounts ?? 0,
    }),
  };
});

onUnmounted(() => {
  delete window.__tarballConsumer;
});
</script>

<template>
  <base-screen-vue-product ref="product" id="product" :model="model" @base-screen-material-event="onEvent" />
  <button id="update-model" type="button" @click="updateModel">Update</button>
</template>
`,
  );
  writeFileSync(
    join(consumer, 'src', 'main.ts'),
    `import { createApp } from 'vue';
import { defineBaseScreenElements } from '@base-screen/sdk';
import App from './App.vue';
import { registerProduct } from './bridge';

declare global {
  interface Window {
    __tarballConsumer?: {
      reconnect(): void;
      state(): { events: number; mounts: number; unmounts: number };
      unmount(): void;
    };
  }
}

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('VUE_TARBALL_SDK_REGISTRATION_FAILED');
registerProduct();

const app = createApp(App);
app.mount('#app');
const consumer = window.__tarballConsumer;
if (consumer === undefined) throw new Error('VUE_TARBALL_APPLICATION_NOT_READY');
window.__tarballConsumer = { ...consumer, unmount: () => app.unmount() };
`,
  );
  writeFileSync(
    join(consumer, 'src', 'vue-shim.d.ts'),
    `declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
`,
  );
  writeFileSync(
    join(consumer, 'src', 'global-components.typecheck.ts'),
    `import type { GlobalComponents } from 'vue';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';

type ProductProps = InstanceType<GlobalComponents['${productTag}']>['$props'];

const productProps: ProductProps = {
  model: {
    componentId: 'vue-product',
    mode: 'viewer',
    interactive: true,
    props: { label: 'Initial' },
    style: {},
    size: { width: 200, height: 40 },
    dataState: { status: 'idle' },
  } satisfies BaseScreenMaterialModel,
};

void productProps;
`,
  );
  writeFileSync(
    join(consumer, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === '${productTag}',
        },
      },
    }),
  ],
});
`,
  );
}

function browserVerifierSource(framework, productTag) {
  return `import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('${framework.toUpperCase()}_TARBALL_SERVER_URL_MISSING');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#product-action').waitFor();
  await page.locator('#product-action').click();
  await page.waitForFunction(() => window.__tarballConsumer?.state().events === 1);
  await page.locator('#update-model').click();
  await page.waitForFunction(() => document.querySelector('#product-action')?.textContent === 'Updated');
  const afterUpdate = await page.evaluate(() => window.__tarballConsumer?.state());
  if (afterUpdate?.mounts !== 1 || afterUpdate.unmounts !== 0) {
    throw new Error('${framework.toUpperCase()}_TARBALL_MODEL_UPDATE_REBUILT');
  }
  await page.evaluate(() => window.__tarballConsumer?.reconnect());
  await page.waitForTimeout(0);
  const afterReconnect = await page.evaluate(() => window.__tarballConsumer?.state());
  if (afterReconnect?.mounts !== 1 || afterReconnect.unmounts !== 0) {
    throw new Error('${framework.toUpperCase()}_TARBALL_RECONNECT_REBUILT');
  }
  await page.evaluate(() => window.__tarballConsumer?.unmount());
  await page.waitForTimeout(0);
  const afterUnmount = await page.evaluate((tag) => ({
    bridge: window.__baseScreenBridge,
    productPresent: document.querySelector(tag) !== null,
  }), '${productTag}');
  if (afterUnmount.bridge?.unmounts !== 1 || afterUnmount.productPresent) {
    throw new Error('${framework.toUpperCase()}_TARBALL_FINAL_UNMOUNT_FAILED: ' + JSON.stringify(afterUnmount));
  }
} finally {
  await browser.close();
  await server.close();
}
`;
}

function assertConsumerIsolation(consumer, framework) {
  const lockfile = readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8');
  if (lockfile.includes('workspace:') || lockfile.includes('link:')) {
    throw new Error(`${framework.toUpperCase()}_TARBALL_WORKSPACE_LINK_FOUND`);
  }
  if (lockfile.includes(root.replace(/\\/g, '/'))) {
    throw new Error(`${framework.toUpperCase()}_TARBALL_SOURCE_PATH_FOUND`);
  }
  const requiredPackages = [
    'contracts',
    'core',
    'engine',
    'material',
    'plugin-core',
    'plugin-manager',
    'plugin-sdk',
    'renderer',
    'sdk',
    framework,
  ];
  for (const directory of requiredPackages) {
    const packageName = `@base-screen/${directory}`;
    if (!lockfile.includes(packageName)) {
      throw new Error(`${framework.toUpperCase()}_TARBALL_PACKAGE_MISSING: ${packageName}`);
    }
    const tarball = packedTarballs.get(directory);
    if (tarball === undefined || !lockfile.includes(basename(tarball))) {
      throw new Error(`${framework.toUpperCase()}_TARBALL_PACKAGE_NOT_PACKED: ${packageName}`);
    }
  }
  const forbiddenFramework = framework === 'react' ? 'vue' : 'react';
  if (!existsSync(join(consumer, 'node_modules', forbiddenFramework))) {
    return;
  }
  throw new Error(
    `${framework.toUpperCase()}_TARBALL_UNEXPECTED_FRAMEWORK_PEER: ${forbiddenFramework}`,
  );
}

function verifyBridgeTarballConsumer(framework) {
  const consumer = mkdtempSync(join(temporaryRoot, `${framework}-vite-consumer-`));
  writeConsumerFiles(consumer, framework);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(consumer, framework);
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

const root = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-tarballs-'));
const packedTarballs = new Map();

try {
  for (const directory of packageBuildOrder()) {
    const definition = PACKAGE_DEFINITIONS[directory];
    const packageDirectory = join(root, 'packages', directory);
    const packageTarballs = join(temporaryRoot, directory);
    mkdirSync(packageTarballs, { recursive: true });
    run('pnpm', ['pack', '--pack-destination', packageTarballs], packageDirectory);
    const tarballName = readdirSync(packageTarballs).find((name) => name.endsWith('.tgz'));
    if (!tarballName) {
      throw new Error(`TARBALL_MISSING: ${directory}`);
    }
    const tarball = join(packageTarballs, tarballName);
    packedTarballs.set(directory, tarball);
    assertTarballContents(tarball);
    run('pnpm', ['exec', 'publint', tarball], root);
    run('pnpm', ['exec', 'attw', '--profile', 'esm-only', tarball], root);

    const installTarball = patchWorkspaceDependencySpecs(directory, tarball);
    packedTarballs.set(directory, installTarball);
    const consumer = mkdtempSync(join(temporaryRoot, `${directory}-consumer-`));
    writeFileSync(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: `${directory}-consumer`,
          private: true,
          type: 'module',
          dependencies: { [definition.name]: `file:${installTarball.replace(/\\/g, '/')}` },
        },
        null,
        2,
      )}\n`,
    );
    run('pnpm', ['install'], consumer);
    const smoke = join(consumer, 'smoke.mjs');
    const barePackage = definition.name;
    let smokeSource = `import '${barePackage}';\n`;
    if (directory === 'contracts') {
      smokeSource = `import { deepStrictEqual } from 'node:assert';
import artifact from '${barePackage}/screen-document.schema.json' with { type: 'json' };
import {
  SCREEN_DOCUMENT_JSON_SCHEMA,
  parseScreenDocument,
  serializeScreenDocument,
} from '${barePackage}';

deepStrictEqual(artifact, SCREEN_DOCUMENT_JSON_SCHEMA);
const document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const parsed = parseScreenDocument(document);
if (!parsed.ok || parsed.diagnostics.length !== 0) {
  throw new Error('contracts: document parse failed');
}
const serialized = serializeScreenDocument(parsed.value);
if (typeof serialized !== 'string' || serialized.length === 0) {
  throw new Error('contracts: serialization failed');
}
`;
    }
    if (directory === 'core') {
      smokeSource = `import {
  applyScreenDocumentCommand,
  canvasPointToViewport,
  createScreenHistory,
} from '${barePackage}';

const document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const command = applyScreenDocumentCommand(document, {
  type: 'update-canvas',
  patch: { width: 1280 },
});
if (!command.ok || command.document.canvas.width !== 1280) {
  throw new Error('core: command failed');
}
if (createScreenHistory(document).present !== document) {
  throw new Error('core: history failed');
}
if (canvasPointToViewport({ x: 1, y: 1 }, { zoom: 2, offset: { x: 0, y: 0 } }).x !== 2) {
  throw new Error('core: geometry failed');
}
`;
    }
    if (directory === 'plugin-core') {
      smokeSource = `import { parseBaseScreenMaterialManifest } from '${barePackage}';

const result = parseBaseScreenMaterialManifest({
  type: 'base.text',
  tagName: 'base-text',
  name: 'Text',
  category: 'Basic',
  keywords: [],
  defaultSize: { width: 100, height: 50 },
  defaultProps: {},
  defaultStyle: {},
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: true, children: false },
});
if (!result.ok) {
  throw new Error('plugin-core: manifest parse failed');
}
`;
    }
    if (directory === 'plugin-manager') {
      smokeSource = `import { createBaseScreenPluginManager } from '${barePackage}';

const manager = createBaseScreenPluginManager({
  instanceId: 'tarball-consumer',
  standaloneMaterialTagNames: [],
  plugins: [],
  grantedCapabilities: {},
  registry: { get: () => undefined },
  createCommandPort: undefined,
});
const result = await manager.activate();
if (!result.ok || manager.snapshot === undefined) {
  throw new Error('plugin-manager: activation failed');
}
await manager.dispose();
`;
    }
    if (directory === 'engine') {
      smokeSource = `import { ScreenProjectController } from '${barePackage}';

let document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const controller = new ScreenProjectController({
  getDocument: () => document,
  replaceDocument: (next) => {
    document = next;
    return { ok: true, value: next, diagnostics: [] };
  },
});
if (!controller.establishDocumentBaseline(document).ok) {
  throw new Error('engine: direct-document baseline failed');
}
if (controller.phase !== 'ready' || controller.dirty) {
  throw new Error('engine: lifecycle controller failed');
}
`;
    }
    await import(`node:fs/promises`).then(({ writeFile }) => writeFile(smoke, smokeSource, 'utf8'));
    run('node', [smoke], consumer);
  }
  verifyBridgeTarballConsumer('react');
  verifyBridgeTarballConsumer('vue');
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

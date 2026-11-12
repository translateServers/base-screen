import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPOSITION_SMOKE_TYPES = `declare global {
  interface Window {
    __compositionSmoke?: {
      mounted: number;
      diagnostics: string[];
      runtimeDisposed(): boolean;
      unmount(): void;
      disposeRuntime(): Promise<void>;
    };
    __compositionSmokeError?: string;
  }
}
`;

/**
 * 写入桥接包 tarball 消费者工程。
 */
export function writeTarballConsumerFiles(consumer, framework, packageSpec) {
  const isReact = framework === 'react';
  const productTag = `base-screen-${framework}-product`;
  const workspaceDependencies = ['contracts', 'material', 'plugin-core', 'sdk', framework];
  const dependencies = {
    ...Object.fromEntries(
      workspaceDependencies.map((directory) => [
        `@base-screen/${directory}`,
        packageSpec(directory),
      ]),
    ),
    ...(isReact ? { react: '^19.1.0', 'react-dom': '^19.1.0' } : { vue: '^3.5.0' }),
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
        packageManager: 'pnpm@11.18.0',
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

/**
 * 最小 Vanilla / Vite Viewer 消费者：**全部内容内联生成**，不再从 examples/ 复制。
 *
 * 早期实现复制了 `examples/host-quickstart` 的源码，但那让门禁与一个示例目录耦合：
 * 示例被重构/移动时消费者会静默失效。这里把最小 Viewer 工程完整写成模板字符串，
 * 依赖只声明实际导入的 contracts / material / sdk，并由下方断言守住这一点。
 */
export function writeVanillaTarballConsumerFiles(consumer, packageSpec) {
  const dependencies = Object.fromEntries(
    ['contracts', 'material', 'sdk'].map((directory) => [
      `@base-screen/${directory}`,
      packageSpec(directory),
    ]),
  );
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'base-screen-vanilla-tarball-consumer',
        private: true,
        type: 'module',
        packageManager: 'pnpm@11.18.0',
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'vite build',
          verify: 'node browser.mjs',
        },
        dependencies,
        devDependencies: {
          '@playwright/test': '1.62.1',
          typescript: '7.0.2',
          vite: '8.2.0',
        },
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
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  );
  const mainSource = vanillaConsumerMainSource();
  for (const forbiddenImport of [
    '@base-screen/core',
    '@base-screen/engine',
    '@base-screen/plugin-manager',
    '@base-screen/plugin-sdk',
    '@base-screen/renderer',
  ]) {
    if (mainSource.includes(forbiddenImport)) {
      throw new Error(`VANILLA_TARBALL_UNDECLARED_IMPORT: ${forbiddenImport}`);
    }
  }
  writeFileSync(
    join(consumer, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Base Screen Viewer</title>
  </head>
  <body>
    <main class="screen-stage">
      <base-screen-viewer id="viewer"></base-screen-viewer>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  );
  writeFileSync(join(consumer, 'src', 'main.ts'), mainSource);
  writeFileSync(
    join(consumer, 'src', 'style.css'),
    `:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
}

html,
body,
.screen-stage {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
  background: #030712;
}

.screen-stage {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

base-screen-viewer {
  display: block;
  width: 640px;
  height: 360px;
}
`,
  );
  writeFileSync(join(consumer, 'src', 'vite-env.d.ts'), '/// <reference types="vite/client" />\n');
  writeFileSync(join(consumer, 'vite.config.mjs'), viewerOnlyViteConfigSource());
  writeFileSync(join(consumer, 'browser.mjs'), vanillaBrowserVerifierSource());
}

/**
 * 最小 Viewer 宿主：只导入公开包入口，用一个 640×360 文档验证 Viewer 渲染闭环。
 * 这同时是"宿主最小接入路径"的可执行说明。
 */
function vanillaConsumerMainSource() {
  return `import { parseScreenDocument, type ScreenDiagnostic } from '@base-screen/contracts';
import {
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import {
  createBaseScreenViewerRuntime,
  type BaseScreenViewerElement,
  defineBaseScreenViewer,
} from '@base-screen/sdk/viewer';
import '@base-screen/sdk/host-tokens.css';
import './style.css';

const viewerDefinition = defineBaseScreenViewer();
const textDefinition = defineBaseScreenTextMaterial();
const rectangleDefinition = defineBaseScreenRectangleMaterial();
if (!viewerDefinition.ok || !textDefinition.ok || !rectangleDefinition.ok) {
  throw new Error('Base Screen Custom Element registration failed.');
}

const parsed = parseScreenDocument({
  canvas: { width: 640, height: 360, backgroundColor: '#111827' },
  components: [
    {
      id: 'background',
      type: 'base.rectangle',
      name: '背景',
      parentId: null,
      position: { x: 24, y: 24 },
      size: { width: 592, height: 312 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: {},
      style: { fill: '#1f2937', borderColor: '#39c5bb', borderWidth: 2, opacity: 1 },
      dataSource: null,
    },
    {
      id: 'title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 64, y: 142 },
      size: { width: 512, height: 76 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#f9fafb', fontSize: 32, fontWeight: '700', textAlign: 'center' },
      dataSource: { type: 'static', value: 'Base Screen Viewer 已就绪' },
    },
  ],
  variables: [],
  blueprint: { relations: [] },
});
if (!parsed.ok) {
  throw new Error(\`Screen Document invalid: \${formatDiagnostics(parsed.diagnostics)}\`);
}

const viewer = document.querySelector<BaseScreenViewerElement>('#viewer');
if (viewer === null) throw new Error('Missing base-screen-viewer.');
viewer.addEventListener('base-screen-diagnostic', (event) => {
  const detail = (event as CustomEvent<{ diagnostics: readonly ScreenDiagnostic[] }>).detail;
  console.error('Base Screen diagnostic', detail.diagnostics);
});

const runtimeResult = await createBaseScreenViewerRuntime({
  materials: [textDefinition.value, rectangleDefinition.value],
  instanceId: 'base-screen-vanilla-consumer',
});
if (!runtimeResult.ok) {
  throw new Error(\`Viewer runtime failed: \${formatDiagnostics(runtimeResult.diagnostics)}\`);
}
const runtime = runtimeResult.value;
const container = viewer.parentElement;
if (container === null) throw new Error('Missing Viewer container.');
const mounted = await runtime.mountViewer(container, { element: viewer, document: parsed.value });
if (!mounted.ok) {
  throw new Error(\`Viewer mount failed: \${formatDiagnostics(mounted.diagnostics)}\`);
}
window.addEventListener('pagehide', () => {
  void runtime.dispose();
}, { once: true });

function formatDiagnostics(diagnostics: readonly ScreenDiagnostic[]): string {
  return diagnostics.map((item) => \`\${item.code}@\${item.path.join('.')}\`).join(', ');
}
`;
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
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
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
  const existing = customElements.get(productEntry.manifest.tagName);
  if (existing === undefined) {
    customElements.define(productEntry.manifest.tagName, productEntry.constructor);
  } else if (existing !== productEntry.constructor) {
    throw new Error('REACT_TARBALL_PRODUCT_REGISTRATION_CONFLICT');
  }
}

const definition = createReactMaterialDefinition({
  manifest,
  component: Product,
  eventProps: { valueClick: 'onValueClick' },
});
if (!definition.ok) throw new Error('REACT_TARBALL_PRODUCT_DEFINITION_FAILED');
const productEntry = definition.value;
`,
  );
  writeFileSync(
    join(consumer, 'src', 'main.tsx'),
    `import '@base-screen/sdk/auto-register';
import '@base-screen/material/auto-register';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBaseScreenRuntime } from '@base-screen/sdk';
import { BaseScreenDesigner, BaseScreenViewer } from '@base-screen/react';
import type { ScreenDiagnostic } from '@base-screen/contracts';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
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

${COMPOSITION_SMOKE_TYPES}
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

try {
  const runtimeResult = await createBaseScreenRuntime({ officialMaterials: false, plugins: [] });
  if (!runtimeResult.ok) {
    throw new Error(
      'REACT_TARBALL_COMPOSITION_RUNTIME_FAILED: ' +
        (runtimeResult.diagnostics[0]?.message ?? 'unknown'),
    );
  }
  const runtime = runtimeResult.value;
  const compositionStage = document.createElement('div');
  compositionStage.id = 'composition-smoke';
  document.body.append(compositionStage);
  const compositionRoot = createRoot(compositionStage);
  const compositionDiagnostics: string[] = [];
  let compositionMounted = 0;
  const onCompositionMounted = (): void => {
    compositionMounted += 1;
  };
  const onCompositionDiagnostics = (diagnostics: readonly ScreenDiagnostic[]): void => {
    compositionDiagnostics.length = 0;
    for (const item of diagnostics) compositionDiagnostics.push(item.message);
  };
  window.__compositionSmoke = {
    get mounted() {
      return compositionMounted;
    },
    diagnostics: compositionDiagnostics,
    runtimeDisposed: () => runtime.disposed,
    unmount: () => compositionRoot.unmount(),
    disposeRuntime: async () => {
      const result = await runtime.dispose();
      if (!result.ok) throw new Error('REACT_TARBALL_COMPOSITION_RUNTIME_DISPOSE_FAILED');
    },
  };
  compositionRoot.render(
    <>
      <BaseScreenDesigner
        runtime={runtime}
        mountOptions={{}}
        onMounted={onCompositionMounted}
        onDiagnostics={onCompositionDiagnostics}
      />
      <BaseScreenViewer
        runtime={runtime}
        mountOptions={{}}
        onMounted={onCompositionMounted}
        onDiagnostics={onCompositionDiagnostics}
      />
    </>,
  );
} catch (error) {
  window.__compositionSmokeError = error instanceof Error ? error.message : String(error);
}
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
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
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
  const existing = customElements.get(productEntry.manifest.tagName);
  if (existing === undefined) {
    customElements.define(productEntry.manifest.tagName, productEntry.constructor);
  } else if (existing !== productEntry.constructor) {
    throw new Error('VUE_TARBALL_PRODUCT_REGISTRATION_CONFLICT');
  }
}

const definition = createVueMaterialDefinition({
  manifest,
  component: Product,
  eventProps: { valueClick: 'onValueClick' },
});
if (!definition.ok) throw new Error('VUE_TARBALL_PRODUCT_DEFINITION_FAILED');
const productEntry = definition.value;
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
    `import '@base-screen/sdk/viewer/auto-register';
import '@base-screen/sdk/designer/auto-register';
import '@base-screen/material/auto-register';
import { createApp, h } from 'vue';
import { createBaseScreenRuntime } from '@base-screen/sdk';
import { BaseScreenDesigner, BaseScreenViewer } from '@base-screen/vue';
import type { ScreenDiagnostic } from '@base-screen/contracts';
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

${COMPOSITION_SMOKE_TYPES}
registerProduct();

const app = createApp(App);
app.mount('#app');
const consumer = window.__tarballConsumer;
if (consumer === undefined) throw new Error('VUE_TARBALL_APPLICATION_NOT_READY');
window.__tarballConsumer = { ...consumer, unmount: () => app.unmount() };

try {
  const runtimeResult = await createBaseScreenRuntime({ officialMaterials: false, plugins: [] });
  if (!runtimeResult.ok) {
    throw new Error(
      'VUE_TARBALL_COMPOSITION_RUNTIME_FAILED: ' +
        (runtimeResult.diagnostics[0]?.message ?? 'unknown'),
    );
  }
  const runtime = runtimeResult.value;
  const compositionStage = document.createElement('div');
  compositionStage.id = 'composition-smoke';
  document.body.append(compositionStage);
  const compositionDiagnostics: string[] = [];
  let compositionMounted = 0;
  const onCompositionMounted = (): void => {
    compositionMounted += 1;
  };
  const onCompositionDiagnostics = (diagnostics: readonly ScreenDiagnostic[]): void => {
    compositionDiagnostics.length = 0;
    for (const item of diagnostics) compositionDiagnostics.push(item.message);
  };
  window.__compositionSmoke = {
    get mounted() {
      return compositionMounted;
    },
    diagnostics: compositionDiagnostics,
    runtimeDisposed: () => runtime.disposed,
    unmount: () => compositionApp.unmount(),
    disposeRuntime: async () => {
      const result = await runtime.dispose();
      if (!result.ok) throw new Error('VUE_TARBALL_COMPOSITION_RUNTIME_DISPOSE_FAILED');
    },
  };
  const compositionApp = createApp({
    render: () =>
      h('div', [
        h(BaseScreenDesigner, {
          runtime,
          mountOptions: {},
          onMounted: onCompositionMounted,
          onDiagnostics: onCompositionDiagnostics,
        }),
        h(BaseScreenViewer, {
          runtime,
          mountOptions: {},
          onMounted: onCompositionMounted,
          onDiagnostics: onCompositionDiagnostics,
        }),
      ]),
  });
  compositionApp.mount(compositionStage);
} catch (error) {
  window.__compositionSmokeError = error instanceof Error ? error.message : String(error);
}
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
import type { ScreenDiagnostic } from '@base-screen/contracts';
import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenMountDiagnosticContext,
  BaseScreenRuntime,
  BaseScreenViewerElement,
  BaseScreenViewerMountOptions,
  ScreenProjectState,
} from '@base-screen/sdk';
import { BaseScreenDesigner, BaseScreenViewer } from '@base-screen/vue';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Value extends true> = Value;
type Designer = InstanceType<typeof BaseScreenDesigner>;
type Viewer = InstanceType<typeof BaseScreenViewer>;

// 在最低 Vue peer 版本下验证 tarball 声明，而不是复用工作区的新版 Vue 类型。
export type ComponentContracts = [
  Assert<Equal<Designer['$props']['runtime'], BaseScreenRuntime | null>>,
  Assert<Equal<Designer['$props']['mountOptions'], BaseScreenDesignerMountOptions | null>>,
  Assert<Equal<Viewer['$props']['mountOptions'], BaseScreenViewerMountOptions | null>>,
  Assert<Equal<Parameters<NonNullable<Designer['$props']['onMounted']>>[0], BaseScreenMountHandle<BaseScreenDesignerElement>>>,
  Assert<Equal<Parameters<NonNullable<Viewer['$props']['onMounted']>>[0], BaseScreenMountHandle<BaseScreenViewerElement>>>,
  Assert<Equal<Parameters<Designer['$slots']['fallback']>[0]['diagnostics'], readonly ScreenDiagnostic[]>>,
  Assert<Equal<Parameters<Viewer['$slots']['fallback']>[0]['diagnostics'], readonly ScreenDiagnostic[]>>,
  Assert<Equal<Parameters<NonNullable<Designer['$props']['onProjectState']>>[0], ScreenProjectState>>,
  Assert<Equal<Parameters<NonNullable<Designer['$props']['onDiagnostics']>>[1], BaseScreenMountDiagnosticContext | undefined>>,
  Assert<Equal<Parameters<Designer['$slots']['fallback']>[0]['context'], BaseScreenMountDiagnosticContext | undefined>>,
];

// @ts-expect-error runtime 和 mountOptions 都是必填项。
const missingRequiredProps: Designer['$props'] = {};
// @ts-expect-error 挂载回调必须接收 Viewer 句柄。
const wrongCallback: Viewer['$props']['onMounted'] = (_handle: string) => {};
void missingRequiredProps;
void wrongCallback;

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
import { preview } from 'vite';

const server = await preview({ root: process.cwd(), preview: { host: '127.0.0.1', port: 0 } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('${framework.toUpperCase()}_TARBALL_SERVER_URL_MISSING');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const automaticRegistrations = await page.evaluate(() => ({
    designer: customElements.get('base-screen-designer') !== undefined,
    rectangle: customElements.get('base-screen-rectangle') !== undefined,
    text: customElements.get('base-screen-text') !== undefined,
    viewer: customElements.get('base-screen-viewer') !== undefined,
  }));
  if (Object.values(automaticRegistrations).some((registered) => !registered)) {
    throw new Error(
      '${framework.toUpperCase()}_TARBALL_AUTO_REGISTRATION_FAILED: ' +
        JSON.stringify(automaticRegistrations),
    );
  }
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
  await page.waitForFunction(
    () =>
      window.__compositionSmoke?.mounted === 2 ||
      (window.__compositionSmoke?.diagnostics.length ?? 0) > 0 ||
      window.__compositionSmokeError !== undefined,
  );
  const compositionError = await page.evaluate(() => window.__compositionSmokeError);
  if (compositionError !== undefined) {
    throw new Error('${framework.toUpperCase()}_TARBALL_COMPOSITION_SETUP_FAILED: ' + compositionError);
  }
  const compositionMounted = await page.evaluate(() => ({
    mounted: window.__compositionSmoke?.mounted ?? -1,
    designer: document.querySelector('#composition-smoke base-screen-designer') !== null,
    viewer: document.querySelector('#composition-smoke base-screen-viewer') !== null,
    diagnostics: window.__compositionSmoke?.diagnostics ?? ['COMPOSITION_SMOKE_MISSING'],
    runtimeDisposed: window.__compositionSmoke?.runtimeDisposed() ?? true,
  }));
  if (
    compositionMounted.mounted !== 2 ||
    !compositionMounted.designer ||
    !compositionMounted.viewer ||
    compositionMounted.diagnostics.length > 0 ||
    compositionMounted.runtimeDisposed
  ) {
    throw new Error(
      '${framework.toUpperCase()}_TARBALL_COMPOSITION_MOUNT_FAILED: ' +
        JSON.stringify(compositionMounted),
    );
  }
  await page.evaluate(() => window.__compositionSmoke?.unmount());
  await page.waitForFunction(
    () =>
      document.querySelector('#composition-smoke base-screen-designer') === null &&
      document.querySelector('#composition-smoke base-screen-viewer') === null,
  );
  const compositionRuntimeAlive = await page.evaluate(
    () => window.__compositionSmoke?.runtimeDisposed() === false,
  );
  if (!compositionRuntimeAlive) {
    throw new Error('${framework.toUpperCase()}_TARBALL_COMPONENT_DISPOSED_RUNTIME');
  }
  await page.evaluate(() => window.__tarballConsumer?.unmount());
  await page.waitForTimeout(0);
  const afterUnmount = await page.evaluate((tag) => ({
    bridge: window.__baseScreenBridge,
    productPresent: document.querySelector(tag) !== null,
    compositionPresent:
      document.querySelector(
        '#composition-smoke base-screen-designer, #composition-smoke base-screen-viewer',
      ) !== null,
  }), '${productTag}');
  if (
    afterUnmount.bridge?.unmounts !== 1 ||
    afterUnmount.productPresent ||
    afterUnmount.compositionPresent
  ) {
    throw new Error('${framework.toUpperCase()}_TARBALL_FINAL_UNMOUNT_FAILED: ' + JSON.stringify(afterUnmount));
  }
  await page.evaluate(async () => {
    await window.__compositionSmoke?.disposeRuntime();
  });
} finally {
  await browser.close();
  await server.close();
}
`;
}

function viewerOnlyViteConfigSource() {
  return `export default {
  plugins: [{
    name: 'assert-viewer-only-published-bundle',
    generateBundle(_options, bundle) {
      let hasHostTokens = false;
      for (const output of Object.values(bundle)) {
        if (output.type === 'asset') {
          if (output.fileName.endsWith('.css') && String(output.source).includes('--bs-host-text-primary')) {
            hasHostTokens = true;
          }
          continue;
        }
        for (const [id, module] of Object.entries(output.modules)) {
          const normalized = id.replaceAll('\\\\', '/');
          if (module.renderedLength > 0 && /(?:packages|@base-screen)\\/engine\\//.test(normalized)) {
            this.error('VIEWER_ONLY_ENGINE_MODULE_RETAINED: ' + normalized);
          }
        }
        if (output.code.includes('base-screen-designer')) {
          this.error('VIEWER_ONLY_DESIGNER_CODE_RETAINED');
        }
      }
      if (!hasHostTokens) this.error('VIEWER_ONLY_HOST_TOKENS_CSS_MISSING');
    },
  }],
};
`;
}

export function writeViewerOnlyTarballConsumerFiles(consumer, framework, tarballSpec) {
  writeTarballConsumerFiles(consumer, framework, tarballSpec);
  if (framework !== 'vue') throw new Error('VIEWER_ONLY_FRAMEWORK_UNSUPPORTED');
  writeFileSync(join(consumer, 'vite.config.ts'), viewerOnlyViteConfigSource());
  writeFileSync(join(consumer, 'src', 'vite-env.d.ts'), '/// <reference types="vite/client" />\n');
  writeFileSync(
    join(consumer, 'src', 'main.ts'),
    `import { createApp, h } from 'vue';
import { BaseScreenViewer } from '@base-screen/vue';
import { createBaseScreenViewerRuntime } from '@base-screen/sdk/viewer';
import '@base-screen/sdk/host-tokens.css';

const result = await createBaseScreenViewerRuntime({ instanceId: 'vue-viewer-only' });
if (!result.ok) throw new Error('VIEWER_ONLY_RUNTIME_FAILED');
const runtime = result.value;
const stage = document.querySelector('#app');
if (stage === null) throw new Error('VIEWER_ONLY_STAGE_MISSING');
const diagnostics: string[] = [];
const app = createApp({
  render: () => h(BaseScreenViewer, {
    runtime,
    mountOptions: {
      document: {
        canvas: { width: 640, height: 360, backgroundColor: '#111827' },
        components: [], variables: [], blueprint: { relations: [] },
      },
    },
    onDiagnostics: (items) => { diagnostics.splice(0, diagnostics.length, ...items.map(item => item.message)); },
  }),
});
app.mount(stage);
Object.assign(window, { __viewerOnly: {
  diagnostics,
  unmount: () => app.unmount(),
  disposed: () => runtime.disposed,
  dispose: () => runtime.dispose(),
} });
`,
  );
  writeFileSync(
    join(consumer, 'browser.mjs'),
    `import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('VIEWER_ONLY_URL_MISSING');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('base-screen-viewer').waitFor();
  const state = await page.evaluate(() => ({
    designer: customElements.get('base-screen-designer') !== undefined,
    diagnostics: window.__viewerOnly.diagnostics,
  }));
  if (state.designer || state.diagnostics.length > 0) throw new Error('VIEWER_ONLY_MOUNT_FAILED: ' + JSON.stringify(state));
  await page.evaluate(() => window.__viewerOnly.unmount());
  await page.waitForFunction(() => document.querySelector('base-screen-viewer') === null);
  if (await page.evaluate(() => window.__viewerOnly.disposed())) throw new Error('VIEWER_ONLY_COMPONENT_DISPOSED_SHARED_RUNTIME');
  await page.evaluate(() => window.__viewerOnly.dispose());
} finally {
  await browser.close();
  await server.close();
}
`,
  );
}

function vanillaBrowserVerifierSource() {
  return `import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({ root: process.cwd(), preview: { host: '127.0.0.1', port: 0 } });
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('VANILLA_TARBALL_SERVER_URL_MISSING');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      document
        .querySelector('base-screen-viewer')
        ?.shadowRoot?.querySelector('base-screen-text')?.textContent ===
      'Base Screen Viewer 已就绪',
  );
  const state = await page.evaluate(() => {
    const viewer = document.querySelector('base-screen-viewer');
    const mount = viewer?.shadowRoot?.querySelector('div');
    return {
      rectangleRegistered: customElements.get('base-screen-rectangle') !== undefined,
      textRegistered: customElements.get('base-screen-text') !== undefined,
      viewerRegistered: customElements.get('base-screen-viewer') !== undefined,
      canvasWidth: mount instanceof HTMLElement ? mount.style.width : undefined,
      canvasHeight: mount instanceof HTMLElement ? mount.style.height : undefined,
    };
  });
  if (
    !state.rectangleRegistered ||
    !state.textRegistered ||
    !state.viewerRegistered ||
    state.canvasWidth !== '640px' ||
    state.canvasHeight !== '360px'
  ) {
    throw new Error('VANILLA_TARBALL_RENDER_FAILED: ' + JSON.stringify(state));
  }
} finally {
  await browser.close();
  await server.close();
}
`;
}

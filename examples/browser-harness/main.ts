import { createElement } from 'react';
import { h } from 'vue';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenTextMaterialElement,
  defineBaseScreenTextMaterial,
} from '../../packages/material/src/index.ts';
import {
  type BaseScreenMaterialConstructor,
  createBaseScreenMaterialCatalog,
} from '../../packages/plugin-core/src/index.ts';
import { createBaseScreenPluginManager } from '../../packages/plugin-manager/src/index.ts';
import { createReactMaterialDefinition } from '../../packages/react/src/index.ts';
import { defineBaseScreenElements } from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';

if (new URLSearchParams(window.location.search).has('designer')) {
  document.body.dataset.layout = 'designer';
}

const productElements = defineBaseScreenElements();
const textMaterial = defineBaseScreenTextMaterial();
if (!productElements.ok || !textMaterial.ok) {
  throw new Error('Base Screen browser harness failed to register its elements.');
}

const pluginManager = createBaseScreenPluginManager({
  instanceId: 'browser-harness',
  standaloneMaterialTagNames: [BASE_SCREEN_TEXT_MATERIAL_MANIFEST.tagName],
  plugins: [],
  grantedCapabilities: {},
  registry: {
    get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
  },
  createCommandPort: undefined,
});
const managerActivated = await pluginManager.activate();
if (!managerActivated.ok || !pluginManager.snapshot?.materials.has('base.text')) {
  throw new Error('Base Screen browser harness failed to inspect its material registry.');
}

const catalog = createBaseScreenMaterialCatalog([
  {
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    constructor: BaseScreenTextMaterialElement,
  },
]);

const bridgeManifest = (type: string, tagName: string, name: string) => ({
  type,
  tagName,
  name,
  category: '桥接',
  keywords: ['桥接'],
  defaultSize: { width: 200, height: 36 },
  defaultProps: { label: name },
  defaultStyle: {},
  propsSchema: {
    kind: 'object' as const,
    properties: { label: { kind: 'string' as const } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: '标签', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
});

const reactBridge = createReactMaterialDefinition({
  manifest: bridgeManifest('harness.react-button', 'harness-react-button', 'React 桥接'),
  component: ({
    label,
    onValueClick,
  }: {
    label: string;
    onValueClick: (payload: unknown) => void;
  }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onValueClick({ framework: 'react' }) },
      label,
    ),
  eventProps: { valueClick: 'onValueClick' },
});
const vueBridge = createVueMaterialDefinition({
  manifest: bridgeManifest('harness.vue-button', 'harness-vue-button', 'Vue 桥接'),
  component: {
    props: ['label', 'onValueClick'],
    setup(props) {
      return () =>
        h(
          'button',
          { type: 'button', onClick: () => props.onValueClick({ framework: 'vue' }) },
          props.label,
        );
    },
  },
  eventProps: { valueClick: 'onValueClick' },
});
if (!reactBridge.ok || !vueBridge.ok) {
  throw new Error('Base Screen browser harness failed to create framework bridge materials.');
}
customElements.define(reactBridge.value.manifest.tagName, reactBridge.value.constructor);
customElements.define(vueBridge.value.manifest.tagName, vueBridge.value.constructor);
const bridgeCatalog = createBaseScreenMaterialCatalog([
  ...catalog.list(),
  reactBridge.value,
  vueBridge.value,
]);

const screenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
  components: [
    {
      id: 'title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 80, y: 80 },
      size: { width: 500, height: 72 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: { text: 'Base Screen 设计器' },
      style: { color: '#e9f2ff', fontSize: 42, fontWeight: '700' },
      dataSource: null,
    },
    {
      id: 'subtitle',
      type: 'base.text',
      name: '副标题',
      parentId: null,
      position: { x: 84, y: 172 },
      size: { width: 430, height: 48 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: { text: '拖动文本，编辑属性，撤销或重做。' },
      style: { color: '#9fb1c9', fontSize: 20, fontWeight: '400' },
      dataSource: null,
    },
    {
      id: 'host-data',
      type: 'base.text',
      name: '宿主数据',
      parentId: null,
      position: { x: 84, y: 236 },
      size: { width: 430, height: 32 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: { text: '宿主资源已就绪' },
      style: { color: '#39c5bb', fontSize: 16, fontWeight: '400' },
      dataSource: {
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'orders',
        params: { limit: 5 },
      },
    },
    {
      id: 'react-bridge',
      type: reactBridge.value.manifest.type,
      name: 'React 桥接',
      parentId: null,
      position: { x: 84, y: 300 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 4,
      status: { locked: false, hidden: false },
      props: { label: 'React 桥接' },
      style: {},
      dataSource: null,
    },
    {
      id: 'vue-bridge',
      type: vueBridge.value.manifest.type,
      name: 'Vue 桥接',
      parentId: null,
      position: { x: 84, y: 348 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 5,
      status: { locked: false, hidden: false },
      props: { label: 'Vue 桥接' },
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: {
    rules: [
      {
        id: 'title-click',
        trigger: { type: 'material-event' as const, componentId: 'title', eventName: 'valueClick' },
        actions: [
          {
            type: 'emit-host-event' as const,
            eventName: 'titleClick',
            payload: { kind: 'literal' as const, value: { source: 'harness' } },
          },
        ],
      },
    ],
  },
};

const designer = document.querySelector('base-screen-designer')!;
const viewer = document.querySelector('base-screen-viewer')!;
const hostEvents: unknown[] = [];
viewer.resourcePort = {
  async resolve() {
    return { ok: true as const, value: { records: 5 }, diagnostics: [] };
  },
};
viewer.blueprintRuntimePort = {
  emit(event) {
    hostEvents.push(event);
  },
};
designer.catalog = bridgeCatalog;
designer.toolMaterialTypes = { text: 'base.text', rectangle: 'base.text' };
viewer.catalog = bridgeCatalog;
let envelope = {
  projectId: 'browser-harness',
  revision: '1',
  name: '浏览器验证',
  description: null,
  document: screenDocument,
  metadata: {},
};
let nextSaveFailure: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE' | undefined;
designer.projectAdapter = {
  capabilities: { publish: false },
  async load({ projectId }) {
    return projectId === envelope.projectId
      ? { ok: true as const, value: envelope, diagnostics: [] }
      : {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'ENVELOPE_INVALID' as const,
              path: ['projectId'],
              message: 'Unknown project.',
            },
          ],
        };
  },
  async save(request) {
    if (nextSaveFailure !== undefined) {
      const code = nextSaveFailure;
      nextSaveFailure = undefined;
      return {
        ok: false as const,
        diagnostics: [
          { severity: 'error' as const, code, path: [], message: 'Harness project failure.' },
        ],
      };
    }
    envelope = {
      ...envelope,
      revision: String(Number(envelope.revision) + 1),
      document: request.document,
    };
    return { ok: true as const, value: envelope, diagnostics: [] };
  },
};
designer.addEventListener('base-screen-change', (event) => {
  viewer.document = (event as CustomEvent<{ document: typeof screenDocument }>).detail.document;
});
const loaded = await designer.load('browser-harness');
if (!loaded.ok) {
  throw new Error('Base Screen browser harness failed to load its project.');
}
viewer.document = designer.document;

Object.assign(window, {
  baseScreenHarness: {
    catalog: bridgeCatalog,
    designer,
    pluginManager,
    viewer,
    hostEvents,
    getEnvelope: () => envelope,
    failNextSave: (code: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE') => {
      nextSaveFailure = code;
    },
  },
});

import { createElement } from 'react';
import { h } from 'vue';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenTextMaterialElement,
  defineBaseScreenTextMaterial,
} from '../../packages/material/src/index.ts';
import { createBaseScreenMaterialCatalog } from '../../packages/plugin-core/src/index.ts';
import { createReactMaterialDefinition } from '../../packages/react/src/index.ts';
import { defineBaseScreenElements } from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';

const productElements = defineBaseScreenElements();
const textMaterial = defineBaseScreenTextMaterial();
if (!productElements.ok || !textMaterial.ok) {
  throw new Error('Base Screen browser harness failed to register its elements.');
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
  category: 'Bridge',
  keywords: ['bridge'],
  defaultSize: { width: 200, height: 36 },
  defaultProps: { label: name },
  defaultStyle: {},
  propsSchema: {
    kind: 'object' as const,
    properties: { label: { kind: 'string' as const } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: 'Label', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
});

const reactBridge = createReactMaterialDefinition({
  manifest: bridgeManifest('harness.react-button', 'harness-react-button', 'React bridge'),
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
  manifest: bridgeManifest('harness.vue-button', 'harness-vue-button', 'Vue bridge'),
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
      name: 'Title',
      parentId: null,
      position: { x: 80, y: 80 },
      size: { width: 500, height: 72 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: { text: 'Base Screen Designer' },
      style: { color: '#e9f2ff', fontSize: 42, fontWeight: '700' },
      dataSource: null,
    },
    {
      id: 'subtitle',
      type: 'base.text',
      name: 'Subtitle',
      parentId: null,
      position: { x: 84, y: 172 },
      size: { width: 430, height: 48 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: { text: 'Drag text, edit properties, undo and redo.' },
      style: { color: '#9fb1c9', fontSize: 20, fontWeight: '400' },
      dataSource: null,
    },
    {
      id: 'host-data',
      type: 'base.text',
      name: 'Host Data',
      parentId: null,
      position: { x: 84, y: 236 },
      size: { width: 430, height: 32 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: { text: 'Host resource resolved' },
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
      name: 'React bridge',
      parentId: null,
      position: { x: 84, y: 300 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 4,
      status: { locked: false, hidden: false },
      props: { label: 'React bridge' },
      style: {},
      dataSource: null,
    },
    {
      id: 'vue-bridge',
      type: vueBridge.value.manifest.type,
      name: 'Vue bridge',
      parentId: null,
      position: { x: 84, y: 348 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 5,
      status: { locked: false, hidden: false },
      props: { label: 'Vue bridge' },
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
            payload: { source: 'harness' },
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
viewer.catalog = bridgeCatalog;
let envelope = {
  projectId: 'browser-harness',
  revision: '1',
  name: 'Browser Harness',
  description: null,
  document: screenDocument,
  metadata: {},
};
designer.projectAdapter = {
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
    viewer,
    hostEvents,
    getEnvelope: () => envelope,
  },
});

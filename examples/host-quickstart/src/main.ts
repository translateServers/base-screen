import { parseScreenDocument, type ScreenDiagnostic } from '@base-screen/contracts';
import {
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { type BaseScreenViewerElement, defineBaseScreenViewer } from '@base-screen/sdk/viewer';
import './style.css';

const viewerDefinition = defineBaseScreenViewer();
const textDefinition = defineBaseScreenTextMaterial();
const rectangleDefinition = defineBaseScreenRectangleMaterial();
if (!viewerDefinition.ok || !textDefinition.ok || !rectangleDefinition.ok) {
  throw new Error('Base Screen Custom Element registration failed.');
}

const catalog = createBaseScreenMaterialCatalog([textDefinition.value, rectangleDefinition.value]);
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
  blueprint: { rules: [] },
});
if (!parsed.ok) {
  throw new Error(`Screen Document invalid: ${formatDiagnostics(parsed.diagnostics)}`);
}

const viewer = document.querySelector<BaseScreenViewerElement>('#viewer');
if (viewer === null) throw new Error('Missing base-screen-viewer.');
viewer.addEventListener('base-screen-diagnostic', (event) => {
  const detail = (event as CustomEvent<{ diagnostics: readonly ScreenDiagnostic[] }>).detail;
  console.error('Base Screen diagnostic', detail.diagnostics);
});

const configured = viewer.configure({
  catalog,
  instanceId: 'host-quickstart',
  mode: 'viewer',
});
if (!configured.ok) {
  throw new Error(`Viewer configuration failed: ${formatDiagnostics(configured.diagnostics)}`);
}
viewer.document = parsed.value;

function formatDiagnostics(diagnostics: readonly ScreenDiagnostic[]): string {
  return diagnostics.map((item) => `${item.code}@${item.path.join('.')}`).join(', ');
}

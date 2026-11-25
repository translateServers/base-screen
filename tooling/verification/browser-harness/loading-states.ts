import type {
  ScreenDocument,
  ScreenProjectEnvelope,
} from '../../../packages/contracts/src/index.ts';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  defineBaseScreenTextMaterial,
} from '../../../packages/material/src/index.ts';
import { createBaseScreenMaterialCatalog } from '../../../packages/plugin-core/src/index.ts';
import type {
  BaseScreenDesignerElement,
  BaseScreenViewerElement,
} from '../../../packages/sdk/src/index.ts';
import { defineBaseScreenElements } from '../../../packages/sdk/src/index.ts';
import {
  definePluginBoardWaterLevelMaterial,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
} from '../../../plugins/plugin-materials/src/index.ts';

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('Base Screen 元素注册失败。');

const textMaterial = defineBaseScreenTextMaterial();
if (!textMaterial.ok) throw new Error('官方文本物料注册失败。');

const waterLevelMaterial = definePluginBoardWaterLevelMaterial();
if (!waterLevelMaterial.ok) throw new Error('水位物料注册失败。');

const catalog = createBaseScreenMaterialCatalog([textMaterial.value, waterLevelMaterial.value]);

const PROJECT_ID = 'loading-states';
const TEXT_STYLE = {
  color: '#e9f2ff',
  fontSize: 24,
  fontWeight: '400',
  textAlign: 'left',
} as const;

/** 项目文档：load 返回后才出现的真实内容（用于和加载期的空画布对比）。 */
function createTextDocument(): ScreenDocument {
  return {
    canvas: { width: 720, height: 405, backgroundColor: '#0b1220' },
    components: [
      {
        id: 'loading-document-title',
        type: BASE_SCREEN_TEXT_MATERIAL_MANIFEST.type,
        name: '加载完成后',
        parentId: null,
        position: { x: 48, y: 72 },
        size: { width: 560, height: 48 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: { ...TEXT_STYLE },
        dataSource: { type: 'static', value: 'projectAdapter.load 返回后渲染的真实文档' },
      },
    ],
    blueprint: { nodes: [], edges: [] },
    variables: [],
  };
}

/** 物料数据文档：组件绑 dataset，查询挂起期间由物料自己渲染 spinner。 */
function createWaterLevelDocument(): ScreenDocument {
  const size = PLUGIN_BOARD_WATER_LEVEL_MANIFEST.defaultSize ?? { width: 200, height: 240 };
  return {
    canvas: { width: 480, height: 270, backgroundColor: '#0b1220' },
    components: [
      {
        id: 'loading-water-level',
        type: PLUGIN_BOARD_WATER_LEVEL_MANIFEST.type,
        name: '水位图',
        parentId: null,
        position: { x: 140, y: 15 },
        size: { width: size.width, height: size.height },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: structuredClone(PLUGIN_BOARD_WATER_LEVEL_MANIFEST.defaultProps ?? {}),
        style: structuredClone(PLUGIN_BOARD_WATER_LEVEL_MANIFEST.defaultStyle ?? {}),
        dataSource: {
          type: 'dataset',
          datasetId: 'loading-states-dataset',
          params: {},
          binding: { fields: { value: ['value'] } },
        },
      },
    ],
    blueprint: { nodes: [], edges: [] },
    variables: [],
  };
}

function createEnvelope(document: ScreenDocument): ScreenProjectEnvelope {
  return {
    projectId: PROJECT_ID,
    revision: '1',
    name: '加载态观察',
    description: null,
    document,
    metadata: {},
  };
}

type StatusKey = 'designer-skeleton' | 'document-loading' | 'viewer-skeleton' | 'material-spinner';

function setStatus(key: StatusKey, text: string): void {
  const node = document.querySelector<HTMLElement>(`[data-status="${key}"]`);
  if (node !== null) node.textContent = text;
}

function readStage(key: StatusKey): HTMLElement {
  const stage = document.querySelector<HTMLElement>(`[data-stage="${key}"]`);
  if (stage === null) throw new Error(`缺少演示容器：${key}`);
  return stage;
}

const delayInput = document.querySelector<HTMLInputElement>('[data-delay-input]');
const holdInput = document.querySelector<HTMLInputElement>('[data-hold-skeleton]');
const replayButton = document.querySelector<HTMLButtonElement>('[data-replay]');

const timers = new Set<number>();

function later(callback: () => void, delayMs: number): void {
  const id = window.setTimeout(() => {
    timers.delete(id);
    callback();
  }, delayMs);
  timers.add(id);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    later(resolve, delayMs);
  });
}

function clearTimers(): void {
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

function readDelay(): number {
  const parsed = Number(delayInput?.value ?? 3000);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15000, Math.max(200, Math.round(parsed)));
}

function createDelayedDatasetPort(delayMs: number, onResolved: () => void) {
  const fields = [{ id: 'value', label: '读数', valueType: 'number' as const }];
  return {
    queryScope: 'dataset' as const,
    async groups() {
      return {
        ok: true as const,
        value: [{ id: 'loading-states', name: '加载态观察' }],
        diagnostics: [],
      };
    },
    async list() {
      return {
        ok: true as const,
        value: {
          items: [
            {
              datasetId: 'loading-states-dataset',
              name: '水位读数',
              description: null,
              groupId: 'loading-states',
            },
          ],
        },
        diagnostics: [],
      };
    },
    async describe({ datasetId }: { readonly datasetId: string }) {
      return {
        ok: true as const,
        value: {
          datasetId,
          name: '水位读数',
          description: null,
          groupId: 'loading-states',
          fields,
          parameters: [],
        },
        diagnostics: [],
      };
    },
    async query() {
      await sleep(delayMs);
      onResolved();
      return {
        ok: true as const,
        value: { fields, rows: [{ value: 64 }] },
        diagnostics: [],
      };
    },
  };
}

let currentRun = 0;

async function run(): Promise<void> {
  currentRun += 1;
  const runId = currentRun;
  clearTimers();

  const delayMs = readDelay();
  const holdSkeleton = holdInput?.checked === true;
  const skeletonStage = readStage('designer-skeleton');
  const documentStage = readStage('document-loading');
  const viewerStage = readStage('viewer-skeleton');
  const materialStage = readStage('material-spinner');
  for (const stage of [skeletonStage, documentStage, viewerStage, materialStage]) {
    stage.replaceChildren();
  }

  // ① 设计器首帧骨架：不注入 catalog，引擎自己画骨架；到点注入后骨架被工作区替换。
  const skeletonDesigner = document.createElement(
    'base-screen-designer',
  ) as BaseScreenDesignerElement;
  skeletonStage.append(skeletonDesigner);
  setStatus('designer-skeleton', `骨架已渲染，${delayMs}ms 后注入 catalog`);
  if (holdSkeleton) {
    setStatus('designer-skeleton', '骨架保持中：catalog 一直未注入（可随时取消勾选后重播）');
  } else {
    later(() => {
      if (runId !== currentRun) return;
      skeletonDesigner.catalog = catalog;
      setStatus('designer-skeleton', 'catalog 已注入：骨架被真实工作区替换');
    }, delayMs);
  }

  // ② 项目文档加载期间：catalog 立即注入，load 延迟返回，期间只有空画布 + 状态栏文本。
  const documentDesigner = document.createElement(
    'base-screen-designer',
  ) as BaseScreenDesignerElement;
  documentStage.append(documentDesigner);
  documentDesigner.catalog = catalog;
  documentDesigner.projectAdapter = {
    capabilities: { publish: false },
    async load({ projectId }) {
      if (projectId !== PROJECT_ID) {
        return {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'ENVELOPE_INVALID' as const,
              path: ['projectId'],
              message: '未知项目。',
            },
          ],
        };
      }
      await sleep(delayMs);
      return { ok: true as const, value: createEnvelope(createTextDocument()), diagnostics: [] };
    },
    async save() {
      return { ok: true as const, value: createEnvelope(createTextDocument()), diagnostics: [] };
    },
  };
  setStatus(
    'document-loading',
    `projectAdapter.load 挂起 ${delayMs}ms：画布为空、状态栏「未关联项目」`,
  );
  void documentDesigner.load(PROJECT_ID).then((loaded) => {
    if (runId !== currentRun) return;
    setStatus(
      'document-loading',
      loaded.ok ? '文档已返回：同一元素渲染出真实内容' : '文档加载失败',
    );
  });

  // ③ Viewer 首帧骨架：元素上屏即铺骨架，document 到点注入后首帧渲染并移除骨架。
  const skeletonViewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
  viewerStage.append(skeletonViewer);
  const viewerConfigured = skeletonViewer.configure({ catalog });
  if (!viewerConfigured.ok) throw new Error('Viewer 配置失败。');
  setStatus('viewer-skeleton', `骨架已铺满，${delayMs}ms 后注入 document`);
  later(() => {
    if (runId !== currentRun) return;
    skeletonViewer.document = createTextDocument();
    setStatus('viewer-skeleton', 'document 已注入：首帧渲染落定，骨架移除');
  }, delayMs);

  // ④ 物料 spinner：dataset 查询挂起，物料用 plugin-sdk 状态视图渲染 spinner。
  const materialViewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
  materialStage.append(materialViewer);
  const materialConfigured = materialViewer.configure({
    catalog,
    datasetPort: createDelayedDatasetPort(delayMs, () => {
      setStatus('material-spinner', 'query 已返回：spinner 换成真实读数');
    }),
  });
  if (!materialConfigured.ok) throw new Error('物料 Viewer 配置失败。');
  materialViewer.document = createWaterLevelDocument();
  setStatus('material-spinner', `datasetPort.query 挂起 ${delayMs}ms：物料显示 spinner`);
}

replayButton?.addEventListener('click', () => {
  void run();
});

void run();

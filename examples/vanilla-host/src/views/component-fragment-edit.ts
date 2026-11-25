import {
  type BaseScreenDesignerElement,
  type BaseScreenMountHandle,
  createBaseScreenDesignerMountController,
} from 'base-screen';
import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
  ScreenSize,
} from 'base-screen/contracts';
import type { BaseScreenFragmentBody, BaseScreenFragmentDefinition } from 'base-screen/plugin-core';
import {
  auditBaseScreenFragment,
  type BaseScreenAuthoringFinding,
  hasBaseScreenAuthoringErrors,
} from 'base-screen/plugins';
import { createAppShell } from '../components/app-shell';
import { showToast } from '../components/toast';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToComponents, goToFragmentComponent } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import {
  createFragmentId,
  deleteFragment,
  type FragmentComponentItem,
  loadComponentLibrary,
  saveFragmentDefinition,
} from '../screen/component-library';
import { loadHostRuntime } from '../screen/host-runtime';
import { TOOL_MATERIAL_TYPES } from '../screen/register';

const logger = createLogger('component-fragment-edit');

/**
 * 组合编辑器（ADR-0106 §2.4 / brief P3）：主区内嵌一个独立的 `<base-screen-designer>` 作为组合画布，
 * 只装这一个组合的展开结果；作者在里面摆放、改属性、调层级，交互与大屏画布完全相同。
 *
 * 只用既有公共 API：打开时 `insertComponentFragment` 展开，保存时对全部根组件
 * `createComponentFragment` 回写分片，再经 SDK 体检与后端存储。组合画布的文档只在内存里，不是一张大屏。
 */
const PROJECT_ID = 'component-fragment-canvas';
const CANVAS_MARGIN = 80;
const MIN_CANVAS: ScreenSize = { width: 960, height: 540 };
const OUTLINE_INTERVAL = 800;

/** 新建组合的起点：一个空容器外壳，作者把组件拖进去。 */
const STARTER_BODY: BaseScreenFragmentBody = {
  shell: {
    key: 'shell',
    materialType: 'base.container',
    name: '卡片',
    size: { width: 320, height: 180 },
  },
  nodes: [
    {
      key: 'title',
      materialType: 'base.text',
      name: '标题',
      offset: { x: 16, y: 12 },
      size: { width: 200, height: 28 },
    },
  ],
};

export const componentFragmentEditView: ViewModule = {
  mount(container, route: Route): () => void {
    const main = el('div', { class: 'shell__main component-editor-host' });
    container.append(createAppShell(main, 'components').root);
    const routeId = route.name === 'component-fragment' ? route.id : undefined;
    const controllerAbort = new AbortController();

    let id = routeId ?? createFragmentId();
    let revision: number | undefined;
    let preset = false;
    let name = '新组合';
    let category = '我的组合';
    let keywords: readonly string[] = [];
    let body: BaseScreenFragmentBody = STARTER_BODY;
    let designer: BaseScreenDesignerElement | undefined;
    let mount: ReturnType<typeof createBaseScreenDesignerMountController> | undefined;
    /** 文档不可变：引用变了即内容变了（只读比较，不订阅内部事件）。 */
    let lastDocument: ScreenDocument | undefined;
    let expanded = false;
    let dirty = routeId === undefined;
    let busy = false;
    let disposed = false;
    let findings: readonly BaseScreenAuthoringFinding[] = [];
    let outlineTimer: number | undefined;

    // ———————— 骨架 ————————
    const nameInput = el('input', {
      class: 'component-editor__name',
      attrs: { type: 'text', 'aria-label': '组合名称', maxlength: '64', 'data-fragment-name': '' },
    });
    nameInput.addEventListener('input', () => {
      name = nameInput.value;
      markDirty();
    });
    const status = el('span', {
      class: 'component-editor__save',
      attrs: { 'aria-live': 'polite' },
    });
    const saveButton = el('button', {
      class: 'button button--primary',
      text: '保存',
      attrs: { type: 'button', 'data-fragment-save': '' },
      on: { click: () => void save() },
    });
    const deleteButton = el('button', {
      class: 'button button--danger',
      text: '删除',
      attrs: { type: 'button' },
      on: { click: () => void remove() },
    });
    const topbar = el('header', { class: 'component-editor__topbar' }, [
      el('button', {
        class: 'button component-editor__back',
        text: '← 组件库',
        attrs: { type: 'button' },
        on: { click: goToComponents },
      }),
      nameInput,
      el('span', { class: 'ds-badge component-badge component-badge--fragment', text: '组合' }),
      status,
      el('span', { class: 'component-library__spacer' }),
      deleteButton,
      saveButton,
    ]);
    const canvasHost = el('div', {
      class: 'component-fragment__canvas',
      attrs: { 'data-fragment-canvas': '' },
    });
    const side = el('aside', {
      class: 'component-fragment__side',
      attrs: { 'aria-label': '组成' },
    });
    const page = el('div', { class: 'component-editor component-editor--fragment' }, [
      topbar,
      el('div', { class: 'component-fragment__workspace' }, [canvasHost, side]),
    ]);
    main.append(page);

    const markDirty = (): void => {
      dirty = true;
      renderStatus();
    };

    const renderStatus = (): void => {
      status.textContent = preset
        ? '宿主预置组合，只读；可以复制为新组合'
        : dirty
          ? revision === undefined
            ? '尚未保存'
            : '有未保存的改动'
          : '已保存';
      saveButton.textContent = preset ? '复制为新组合' : '保存';
      saveButton.disabled = busy;
      deleteButton.hidden = preset || revision === undefined;
      deleteButton.disabled = busy;
      nameInput.readOnly = preset;
    };

    // ———————— 侧栏：组成与体检 ————————

    const renderSide = (): void => {
      const outline = el('ol', { class: 'component-fragment__outline' });
      if (body.shell !== undefined) {
        outline.append(
          el('li', { attrs: { 'data-shell': 'true' } }, [
            el('strong', { text: body.shell.name ?? '外壳' }),
            el('span', { class: 'component-hint', text: ' 外壳' }),
          ]),
        );
      }
      for (const node of body.nodes) {
        outline.append(
          el(
            'li',
            {
              attrs: {
                'data-nested': String(node.parent !== undefined || body.shell !== undefined),
              },
            },
            [
              el('span', { text: node.name ?? '（未命名）' }),
              el('span', { class: 'component-hint', text: ` ${node.materialType}` }),
            ],
          ),
        );
      }
      const errors = findings.filter((item) => item.severity === 'error').length;
      side.replaceChildren(
        el('section', { class: 'component-block' }, [
          el('h3', { class: 'component-block__title', text: '组合信息' }),
          labelled(
            '分类',
            textField(category, preset, (value) => {
              category = value;
              markDirty();
            }),
          ),
          labelled(
            '关键词',
            textField(keywords.join('，'), preset, (value) => {
              keywords = value
                .split(/[,，、\s]+/)
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 16);
              markDirty();
            }),
          ),
          el('p', {
            class: 'component-hint',
            text: '插入大屏后展开为普通组件；修改组合不会影响已插入的副本。',
          }),
        ]),
        el('section', { class: 'component-block' }, [
          el('h3', {
            class: 'component-block__title',
            text: `组成 · ${body.nodes.length + (body.shell === undefined ? 0 : 1)} 个节点`,
          }),
          outline,
          el('p', {
            class: 'component-hint',
            text: '在左侧画布里直接编辑：拖入物料、改属性、调层级。组合的边界是全部组件的包围盒。',
          }),
        ]),
        el('section', { class: 'component-block', attrs: { 'data-fragment-audit': '' } }, [
          el('h3', {
            class: 'component-block__title',
            text:
              findings.length === 0
                ? '体检通过'
                : `体检 ${errors} 错误 · ${findings.length - errors} 警告`,
          }),
          el(
            'ul',
            { class: 'component-problems__list' },
            findings.map((finding) =>
              el(
                'li',
                { class: 'component-problems__item', attrs: { 'data-severity': finding.severity } },
                [
                  el('span', {
                    class: 'component-problems__severity',
                    text: finding.severity === 'error' ? '错误' : '警告',
                  }),
                  el('span', { class: 'component-problems__message', text: finding.message }),
                ],
              ),
            ),
          ),
        ]),
      );
    };

    const definition = (): BaseScreenFragmentDefinition => ({
      id,
      name: name.trim() === '' ? '未命名组合' : name.trim(),
      category: category.trim() === '' ? '我的组合' : category.trim(),
      keywords,
      ...body,
    });

    /** 画布文档变了：重新提取组合、体检、刷新侧栏。 */
    const syncFromCanvas = (): void => {
      const element = designer;
      if (element === undefined) return;
      const current = element.getDocument();
      if (current === undefined || current === lastDocument) return;
      lastDocument = current;
      const extracted = extract(element);
      if (!extracted.ok) {
        findings = [
          {
            rule: 'SPEC',
            severity: 'error',
            message: extracted.diagnostics[0]?.message ?? '画布内容不能存为组合。',
          },
        ];
        renderSide();
        return;
      }
      if (expanded && JSON.stringify(extracted.value) !== JSON.stringify(body)) markDirty();
      body = extracted.value;
      void loadHostRuntime().then((runtime) => {
        if (disposed) return;
        findings = auditBaseScreenFragment(definition(), runtime.catalog);
        renderSide();
      });
    };

    // ———————— 组合画布 ————————

    const mountCanvas = async (): Promise<void> => {
      const runtime = await loadHostRuntime();
      if (disposed) return;
      const canvas = canvasSize(body, runtime.catalog);
      const adapter = createMemoryProjectAdapter(emptyDocument(canvas));
      mount = createBaseScreenDesignerMountController({
        runtime,
        options: {
          projectId: PROJECT_ID,
          projectAdapter: adapter,
          toolMaterialTypes: TOOL_MATERIAL_TYPES,
          backButton: false,
          fragmentSaveAction: false,
        },
        onDiagnostics: (diagnostics) => {
          if (diagnostics.length > 0) logger.warn('fragment canvas diagnostics', diagnostics);
        },
        onMounted: (handle: BaseScreenMountHandle<BaseScreenDesignerElement>) => {
          const element = handle.element;
          designer = element;
          handle.onDispose(() => {
            if (designer === element) designer = undefined;
          });
          const inserted = element.insertComponentFragment({
            anchor: { x: CANVAS_MARGIN, y: CANVAS_MARGIN },
            ...body,
          });
          if (!inserted.ok) {
            showToast(`组合无法展开：${inserted.diagnostics[0]?.message ?? '未知错误'}`, 'error');
          }
          lastDocument = undefined;
          syncFromCanvas();
          // 展开本身不算作者改动：之后画布再变才标脏。
          expanded = true;
          dirty = routeId === undefined;
          renderStatus();
          outlineTimer = window.setInterval(syncFromCanvas, OUTLINE_INTERVAL);
        },
      });
      await mount.attach(canvasHost);
    };

    // ———————— 保存与删除 ————————

    const save = async (): Promise<void> => {
      if (busy) return;
      if (preset) {
        // 预置组合只读：复制为新组合后进入它的编辑器。
        busy = true;
        renderStatus();
        const copyId = createFragmentId();
        const result = await saveFragmentDefinition({
          definition: {
            ...definition(),
            id: copyId,
            name: `${definition().name} 副本`,
            category: '我的组合',
          },
          revision: undefined,
        });
        busy = false;
        if (!result.ok) {
          showToast(`复制失败：${result.message}`, 'error');
          renderStatus();
          return;
        }
        goToFragmentComponent(copyId);
        return;
      }
      lastDocument = undefined;
      syncFromCanvas();
      const runtime = await loadHostRuntime();
      findings = auditBaseScreenFragment(definition(), runtime.catalog);
      renderSide();
      if (hasBaseScreenAuthoringErrors(findings)) {
        showToast('体检有错误，修正后再保存。', 'error');
        return;
      }
      busy = true;
      renderStatus();
      const result = await saveFragmentDefinition({ definition: definition(), revision });
      busy = false;
      if (disposed) return;
      if (!result.ok) {
        showToast(`保存失败：${result.message}`, 'error');
        renderStatus();
        return;
      }
      revision = result.value.revision;
      dirty = false;
      if (routeId === undefined) {
        history.replaceState(null, '', `#/components/fragment/${encodeURIComponent(id)}`);
      }
      renderStatus();
      showToast(`组合「${definition().name}」已保存，物料库下次打开大屏时可用`, 'success');
    };

    const remove = async (): Promise<void> => {
      if (busy || revision === undefined) return;
      if (!window.confirm(`删除组合「${definition().name}」？已插入大屏的副本不受影响。`)) return;
      busy = true;
      renderStatus();
      const result = await deleteFragment(id);
      busy = false;
      if (!result.ok) {
        showToast(`删除失败：${result.message}`, 'error');
        renderStatus();
        return;
      }
      dirty = false;
      showToast('已删除组合', 'success');
      goToComponents();
    };

    // ———————— 载入 ————————

    const applyItem = (item: FragmentComponentItem): void => {
      id = item.id;
      revision = item.preset ? undefined : item.revision;
      preset = item.preset;
      name = item.name;
      category = item.category;
      keywords = item.keywords;
      const {
        id: _id,
        name: _name,
        category: _category,
        keywords: _keywords,
        cover: _cover,
        ...rest
      } = item.definition;
      body = rest;
    };

    const start = async (): Promise<void> => {
      if (routeId !== undefined) {
        const library = await loadComponentLibrary(controllerAbort.signal);
        if (disposed) return;
        const item = library.ok
          ? library.value.fragments.find((candidate) => candidate.id === routeId)
          : undefined;
        if (item === undefined) {
          page.replaceChildren(
            el('div', { class: 'page ds-page' }, [
              el('div', { class: 'error-banner', attrs: { role: 'alert' } }, [
                el('span', { class: 'error-banner__message', text: '组合不存在或已被删除。' }),
                el('button', {
                  class: 'button',
                  text: '返回组件库',
                  on: { click: goToComponents },
                }),
              ]),
            ]),
          );
          return;
        }
        applyItem(item);
      }
      nameInput.value = name;
      renderStatus();
      renderSide();
      await mountCanvas();
    };

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (dirty && !preset) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    void start().catch((error: unknown) => {
      logger.error('fragment editor bootstrap failed', error);
      showToast('组合画布初始化失败，请返回组件库重试。', 'error');
    });

    return () => {
      disposed = true;
      controllerAbort.abort();
      window.clearInterval(outlineTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void mount?.detach();
      designer = undefined;
    };
  },
};

/** 组合画布里的全部根组件（连同后代）提取为分片：单个可容纳子节点的根成为外壳。 */
function extract(element: BaseScreenDesignerElement): ScreenParseResult<BaseScreenFragmentBody> {
  const document = element.getDocument();
  const roots = (document?.components ?? [])
    .filter((component) => component.parentId === null)
    .map((component) => component.id);
  if (roots.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'AUTHORING_SOURCE_INVALID',
          path: [],
          message: '画布是空的：至少放一个组件。',
        },
      ],
    };
  }
  return element.createComponentFragment(roots);
}

function canvasSize(
  body: BaseScreenFragmentBody,
  catalog: {
    get(type: string): { readonly manifest: { readonly defaultSize: ScreenSize } } | undefined;
  },
): ScreenSize {
  const entries = [...(body.shell === undefined ? [] : [body.shell]), ...body.nodes];
  let width = 0;
  let height = 0;
  for (const entry of entries) {
    const size = entry.size ??
      catalog.get(entry.materialType)?.manifest.defaultSize ?? { width: 80, height: 32 };
    width = Math.max(width, (entry.offset?.x ?? 0) + size.width);
    height = Math.max(height, (entry.offset?.y ?? 0) + size.height);
  }
  return {
    width: Math.max(MIN_CANVAS.width, Math.ceil(width + CANVAS_MARGIN * 2)),
    height: Math.max(MIN_CANVAS.height, Math.ceil(height + CANVAS_MARGIN * 2)),
  };
}

function emptyDocument(size: ScreenSize): ScreenDocument {
  return {
    canvas: { width: size.width, height: size.height, backgroundColor: '#0b1020' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

/** 组合画布的项目适配器：文档只在内存里（保存走组合自己的「保存」，不是一张大屏）。 */
function createMemoryProjectAdapter(initial: ScreenDocument): ScreenProjectAdapter {
  let document = initial;
  let revision = 1;
  const envelope = (): ScreenProjectEnvelope => ({
    projectId: PROJECT_ID,
    revision: String(revision),
    name: '组合画布',
    description: null,
    document,
    metadata: {},
  });
  return {
    capabilities: { publish: false },
    load: async () => ({ ok: true, value: envelope(), diagnostics: [] }),
    save: async (request) => {
      document = request.document;
      revision += 1;
      return { ok: true, value: envelope(), diagnostics: [] };
    },
  };
}

function labelled(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'component-row' }, [
    el('span', { class: 'component-row__label', text: label }),
    control,
  ]);
}

function textField(
  value: string,
  readOnly: boolean,
  onInput: (value: string) => void,
): HTMLInputElement {
  const input = el('input', { class: 'field component-input', attrs: { type: 'text' } });
  input.value = value;
  input.readOnly = readOnly;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

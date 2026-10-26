import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  parseBaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { api } from '../lib/api';
import type { OnlineMaterialPackageShape } from '../types';

/**
 * 在线物料（ADR-0090）——三端逐字共享的宿主侧实现。
 *
 * 分工：宿主用模板生成 ESM + Manifest，管理员审核后持久化；打开设计器时宿主
 * `import()` 并 `define()`，重建 catalog 后交给 `refreshCatalog`。Base Screen
 * 不 fetch、不 import，只接收重建后的 catalog。
 */
export const ONLINE_MATERIAL_TYPE_PREFIX = 'host.online.';
const MAX_NOTE_LENGTH = 80;

export interface OnlineMaterialDraftInput {
  readonly name: string;
  readonly value: string;
  readonly note: string;
  readonly background: string;
  readonly accent: string;
  readonly width: number;
  readonly height: number;
}

export interface OnlineMaterialDraftOptions {
  readonly type?: string;
  readonly tagName?: string;
  readonly buildToken?: string;
  readonly libraryVisible?: boolean;
}

export interface OnlineMaterialDraft {
  readonly type: string;
  readonly tagName: string;
  readonly buildToken: string;
  readonly manifest: BaseScreenMaterialManifest;
  readonly code: string;
}

export interface OnlineMaterialApplyResult {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

export interface OnlineMaterialRuntime {
  readonly onlineMaterialErrors: readonly string[];
  applyOnlineMaterialPackage(
    pkg: OnlineMaterialPackageShape,
    mode: 'code' | 'manifest',
  ): Promise<ScreenParseResult<OnlineMaterialApplyResult | null>>;
  removeOnlineMaterialPackage(
    type: string,
  ): Promise<ScreenParseResult<OnlineMaterialApplyResult | null>>;
}

export interface OnlineMaterialPanelOptions {
  readonly designer: BaseScreenDesignerElement;
  readonly runtime: OnlineMaterialRuntime;
}

export interface OnlineMaterialPanelHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

export function createOnlineMaterialType(name: string): string {
  return `${ONLINE_MATERIAL_TYPE_PREFIX}${slugify(name)}-${randomToken(4)}`;
}

export function createOnlineMaterialTagName(type: string, buildToken = randomToken(8)): string {
  const slug = slugify(type.slice(ONLINE_MATERIAL_TYPE_PREFIX.length));
  return `host-online-${slug}-${buildToken}`;
}

export function renameOnlineMaterialManifest(
  manifest: Readonly<Record<string, unknown>>,
  name: string,
): Readonly<Record<string, unknown>> {
  return { ...manifest, name: name.trim() };
}

/** 从模板生成的代码里读回 build token / 说明，供编辑态回填。 */
export function readOnlineMaterialCodeMeta(code: string): {
  readonly buildToken?: string;
  readonly note?: string;
} {
  const buildToken = readStringConstant(code, 'BUILD');
  const note = readStringConstant(code, 'NOTE');
  return {
    ...(buildToken === undefined ? {} : { buildToken }),
    ...(note === undefined ? {} : { note }),
  };
}

function readStringConstant(code: string, name: string): string | undefined {
  const matched = new RegExp(`const ${name} = ("(?:[^"\\\\]|\\\\.)*");`).exec(code);
  if (matched?.[1] === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(matched[1]);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function createOnlineMaterialDraft(
  input: OnlineMaterialDraftInput,
  options: OnlineMaterialDraftOptions = {},
): OnlineMaterialDraft {
  const buildToken = options.buildToken ?? randomToken(8);
  const type = options.type ?? createOnlineMaterialType(input.name);
  const tagName = options.tagName ?? createOnlineMaterialTagName(type, buildToken);
  const name = input.name.trim().length > 0 ? input.name.trim() : '在线物料';
  const note = input.note.trim().slice(0, MAX_NOTE_LENGTH) || '由业务系统在线生成';
  const value = input.value.trim().length > 0 ? input.value : '42';
  const background = normalizeColor(input.background, '#0f2438');
  const accent = normalizeColor(input.accent, '#38bdf8');
  const width = clampSize(input.width, 280, 80, 1920);
  const height = clampSize(input.height, 140, 40, 1080);

  const manifest: BaseScreenMaterialManifest = {
    type,
    tagName,
    name,
    category: '在线物料',
    keywords: ['online', 'custom'],
    defaultSize: { width, height },
    defaultData: value,
    staticData: { kind: 'scalar', valueType: 'string' },
    defaultProps: {},
    defaultStyle: { background, accent, opacity: 1 },
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    styleSchema: {
      kind: 'object',
      properties: {
        background: { kind: 'string' },
        accent: { kind: 'string' },
        opacity: { kind: 'number', minimum: 0, maximum: 1 },
      },
      required: ['background', 'accent', 'opacity'],
    },
    stylePanel: [
      { style: 'background', label: '背景色', control: 'color' },
      { style: 'accent', label: '强调色', control: 'color' },
      { style: 'opacity', label: '不透明度', control: 'number' },
    ],
    events: [],
    dataCapabilities: ['static', 'variable'],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...(options.libraryVisible === false ? { libraryVisible: false } : {}),
  };

  return {
    type,
    tagName,
    buildToken,
    manifest,
    code: buildOnlineMaterialCode({ buildToken, note, background, accent }),
  };
}

/**
 * 发布前预检：导入代码并把持久化 Manifest 挂到构造器上，走与运行时同一条
 * `createMaterialDefinition` 校验；不注册 tagName，失败时不产生浏览器副作用。
 */
export async function validateOnlineMaterialDraft(
  draft: OnlineMaterialDraft,
): Promise<ScreenParseResult<null>> {
  const manifest = parseBaseScreenMaterialManifest(draft.manifest);
  if (!manifest.ok) return manifest;
  return importOnlineMaterialModule(draft.code, manifest.value, false);
}

/** 运行时加载：导入、校验、注册 tagName，返回可直接并入 catalog 的条目。 */
export async function loadOnlineMaterialEntry(
  pkg: OnlineMaterialPackageShape,
): Promise<ScreenParseResult<BaseScreenMaterialCatalogEntry>> {
  const manifest = parseBaseScreenMaterialManifest(pkg.manifest);
  if (!manifest.ok) return manifest;
  const cached = definedOnlineConstructors.get(manifest.value.tagName);
  if (cached !== undefined) {
    try {
      Object.defineProperty(cached, 'manifest', {
        value: manifest.value,
        configurable: true,
      });
    } catch {
      return failure('PLUGIN_CORE_MANIFEST_FIELD_INVALID', '无法把 Manifest 挂到在线物料构造器。');
    }
    const definition = createMaterialDefinition({ manifest: manifest.value, element: cached });
    if (!definition.ok) return definition;
    return definition.value.define();
  }
  return importOnlineMaterialModule(pkg.code, manifest.value, true);
}

const definedOnlineConstructors = new Map<string, BaseScreenMaterialConstructor>();

async function importOnlineMaterialModule(
  code: string,
  manifest: BaseScreenMaterialManifest,
  define: false,
): Promise<ScreenParseResult<null>>;
async function importOnlineMaterialModule(
  code: string,
  manifest: BaseScreenMaterialManifest,
  define: true,
): Promise<ScreenParseResult<BaseScreenMaterialCatalogEntry>>;
async function importOnlineMaterialModule(
  code: string,
  manifest: BaseScreenMaterialManifest,
  define: boolean,
): Promise<ScreenParseResult<BaseScreenMaterialCatalogEntry | null>> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const imported: unknown = await import(/* @vite-ignore */ url);
    const ctor = isRecord(imported) ? imported.default : undefined;
    if (typeof ctor !== 'function') {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', '在线物料模块必须 default export 构造器。');
    }
    try {
      Object.defineProperty(ctor, 'manifest', { value: manifest, configurable: true });
    } catch {
      return failure('PLUGIN_CORE_MANIFEST_FIELD_INVALID', '无法把 Manifest 挂到在线物料构造器。');
    }
    const definition = createMaterialDefinition({
      manifest,
      element: ctor as BaseScreenMaterialConstructor,
    });
    if (!definition.ok) return definition;
    if (!define) return { ok: true, value: null, diagnostics: [] };
    const defined = definition.value.define();
    if (!defined.ok) return defined;
    definedOnlineConstructors.set(manifest.tagName, ctor as BaseScreenMaterialConstructor);
    return defined;
  } catch (error) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      `在线物料代码加载失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createOnlineMaterialPanel(
  options: OnlineMaterialPanelOptions,
): OnlineMaterialPanelHandle {
  const { designer, runtime } = options;
  const doc = document;
  const root = el('div', 'editor-online-materials');
  const toggle = button('在线物料', 'button editor-online-toggle');
  toggle.dataset.onlineMaterialsToggle = '';

  const dialog = doc.createElement('dialog');
  dialog.className = 'online-materials-dialog';
  dialog.setAttribute('aria-labelledby', 'online-materials-title');

  const head = el('header', 'online-materials-head');
  const headCopy = el('div', 'online-materials-heading');
  const title = el('h2', 'online-materials-title', '在线物料');
  title.id = 'online-materials-title';
  headCopy.append(
    title,
    el(
      'p',
      'online-materials-subtitle',
      '业务系统在线生成代码与清单，管理员审核后发布；设计器自动应用最新版本。',
    ),
  );
  const close = button('关闭', 'asset-icon-button');
  head.append(headCopy, close);

  const body = el('div', 'online-materials-body');
  const listSide = el('aside', 'online-materials-list');
  const listHead = el('div', 'online-materials-list-head');
  const listTitle = el('span', 'online-materials-list-title', '物料包');
  const newButton = button('新建', 'button');
  newButton.dataset.onlineNew = '';
  listHead.append(listTitle, newButton);
  const list = el('div', 'online-materials-items');
  list.dataset.onlineList = '';
  const runtimeErrors = el('p', 'online-materials-errors');
  runtimeErrors.hidden = true;
  listSide.append(listHead, list, runtimeErrors);

  const editor = el('section', 'online-materials-editor');
  const formGrid = el('div', 'online-materials-form');
  const nameInput = textInput('text', '运营指标');
  const typeInput = textInput('text', '发布时自动生成');
  typeInput.readOnly = true;
  const buildInput = textInput('text', '发布时生成');
  buildInput.readOnly = true;
  const valueInput = textInput('text', '42');
  const noteInput = textInput('text', '由业务系统在线生成');
  const backgroundInput = textInput('color', '#0f2438');
  const accentInput = textInput('color', '#38bdf8');
  const widthInput = textInput('number', '280');
  const heightInput = textInput('number', '140');
  appendField(formGrid, '名称', nameInput, 'name');
  appendField(formGrid, '物料类型', typeInput, 'type');
  appendField(formGrid, '当前构建', buildInput, 'build');
  appendField(formGrid, '默认值', valueInput, 'value');
  appendField(formGrid, '代码说明（内嵌常量）', noteInput, 'note');
  appendField(formGrid, '背景色', backgroundInput, 'background');
  appendField(formGrid, '强调色', accentInput, 'accent');
  appendField(formGrid, '默认宽度', widthInput, 'width');
  appendField(formGrid, '默认高度', heightInput, 'height');

  const preview = doc.createElement('details');
  preview.className = 'online-materials-preview';
  const previewSummary = el('summary', '', '查看生成的 ESM / Manifest');
  const previewBody = el('div', 'online-materials-preview-body');
  const previewManifest = doc.createElement('pre');
  previewManifest.dataset.onlineManifestPreview = '';
  const previewCode = doc.createElement('pre');
  previewCode.dataset.onlineCodePreview = '';
  previewBody.append(
    el('h4', 'online-materials-preview-title', 'Manifest'),
    previewManifest,
    el('h4', 'online-materials-preview-title', 'ESM'),
    previewCode,
  );
  preview.append(previewSummary, previewBody);

  const hint = el(
    'p',
    'online-materials-hint',
    '发布代码会生成新的 tagName 与构造器，现有同型组件会重挂载；仅更新清单保留构造器，不重挂载。',
  );
  const actions = el('div', 'online-materials-actions');
  const publish = button('发布代码', 'button button--primary');
  publish.dataset.onlinePublish = '';
  const manifestOnly = button('仅更新清单', 'button');
  manifestOnly.dataset.onlineManifestOnly = '';
  const insert = button('插入画布', 'button');
  insert.dataset.onlineInsert = '';
  const visibility = button('下架', 'button');
  visibility.dataset.onlineVisibility = '';
  const remove = button('删除', 'button button--danger');
  remove.dataset.onlineDelete = '';
  actions.append(publish, manifestOnly, insert, visibility, remove);

  const status = el('p', 'online-materials-status');
  status.dataset.onlineStatus = '';
  status.setAttribute('aria-live', 'polite');
  editor.append(formGrid, preview, hint, actions, status);
  body.append(listSide, editor);
  dialog.append(head, body);
  root.append(toggle, dialog);

  let packages: readonly OnlineMaterialPackageShape[] = [];
  let editingId: string | undefined;
  let editingType = '';
  let deleteArmed = false;
  let deleteTimer: number | undefined;
  let busy = false;
  let disposed = false;

  const setStatus = (message: string, tone: 'info' | 'error' = 'info'): void => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const currentPackage = (): OnlineMaterialPackageShape | undefined =>
    packages.find((item) => item.id === editingId);

  const readForm = (): OnlineMaterialDraftInput => ({
    name: nameInput.value,
    value: valueInput.value,
    note: noteInput.value,
    background: backgroundInput.value,
    accent: accentInput.value,
    width: Number(widthInput.value),
    height: Number(heightInput.value),
  });

  const formLibraryVisible = (): boolean => {
    const pkg = currentPackage();
    return pkg?.manifest.libraryVisible !== false;
  };

  const buildDraft = (): OnlineMaterialDraft => {
    const input = readForm();
    const buildToken = randomToken(8);
    const type =
      editingId === undefined && editingType.length === 0
        ? createOnlineMaterialType(input.name)
        : editingType;
    const draft = createOnlineMaterialDraft(input, {
      type,
      buildToken,
      libraryVisible: formLibraryVisible(),
    });
    if (editingType.length === 0) {
      editingType = draft.type;
      typeInput.value = draft.type;
    }
    return draft;
  };

  const updatePreview = (): void => {
    const draft = buildDraft();
    previewManifest.textContent = JSON.stringify(draft.manifest, null, 2);
    previewCode.textContent = draft.code;
  };

  const renderRuntimeErrors = (): void => {
    const errors = runtime.onlineMaterialErrors;
    runtimeErrors.hidden = errors.length === 0;
    runtimeErrors.textContent = errors.join('\n');
  };

  const renderList = (): void => {
    list.replaceChildren(
      ...packages.map((pkg) => {
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'online-material-item';
        item.dataset.onlinePackageId = pkg.id;
        if (pkg.id === editingId) item.classList.add('is-selected');
        const name = el('strong', 'online-material-name', pkg.name);
        const type = el('span', 'online-material-type', pkg.type);
        const meta = el(
          'span',
          'online-material-meta',
          `v${pkg.revision} · ${pkg.manifest.libraryVisible === false ? '已下架' : '已上架'}`,
        );
        item.append(name, type, meta);
        item.addEventListener('click', () => selectPackage(pkg));
        return item;
      }),
    );
    if (packages.length === 0) {
      list.append(el('p', 'online-material-empty', '还没有在线物料。用右侧表单发布第一个。'));
    }
    renderRuntimeErrors();
    syncActions();
  };

  const syncActions = (): void => {
    const pkg = currentPackage();
    const existing = pkg !== undefined;
    publish.disabled = busy;
    manifestOnly.disabled = busy || !existing;
    insert.disabled = busy || !existing || pkg?.manifest.libraryVisible === false;
    visibility.hidden = !existing;
    visibility.textContent = pkg?.manifest.libraryVisible === false ? '上架' : '下架';
    visibility.disabled = busy;
    remove.hidden = !existing;
    remove.disabled = busy;
    remove.textContent = deleteArmed ? '确认删除' : '删除';
  };

  const resetDeleteArm = (): void => {
    deleteArmed = false;
    window.clearTimeout(deleteTimer);
    syncActions();
  };

  const setForm = (state: {
    readonly pkg?: OnlineMaterialPackageShape;
    readonly input?: OnlineMaterialDraftInput;
  }): void => {
    const pkg = state.pkg;
    const input = state.input ?? {
      name: '',
      value: '42',
      note: '由业务系统在线生成',
      background: '#0f2438',
      accent: '#38bdf8',
      width: 280,
      height: 140,
    };
    nameInput.value = pkg?.name ?? input.name;
    valueInput.value =
      typeof pkg?.manifest.defaultData === 'string'
        ? pkg.manifest.defaultData
        : typeof pkg?.manifest.defaultData === 'number'
          ? String(pkg.manifest.defaultData)
          : input.value;
    const codeMeta = pkg === undefined ? undefined : readOnlineMaterialCodeMeta(pkg.code);
    noteInput.value = codeMeta?.note ?? input.note;
    buildInput.value = codeMeta?.buildToken ?? '发布时生成';
    const defaultStyle = pkg?.manifest.defaultStyle;
    backgroundInput.value =
      typeof defaultStyle === 'object' &&
      defaultStyle !== null &&
      typeof (defaultStyle as Record<string, unknown>).background === 'string'
        ? ((defaultStyle as Record<string, unknown>).background as string)
        : input.background;
    accentInput.value =
      typeof defaultStyle === 'object' &&
      defaultStyle !== null &&
      typeof (defaultStyle as Record<string, unknown>).accent === 'string'
        ? ((defaultStyle as Record<string, unknown>).accent as string)
        : input.accent;
    const defaultSize = pkg?.manifest.defaultSize;
    widthInput.value =
      typeof defaultSize === 'object' &&
      defaultSize !== null &&
      typeof (defaultSize as Record<string, unknown>).width === 'number'
        ? String((defaultSize as Record<string, unknown>).width)
        : String(input.width);
    heightInput.value =
      typeof defaultSize === 'object' &&
      defaultSize !== null &&
      typeof (defaultSize as Record<string, unknown>).height === 'number'
        ? String((defaultSize as Record<string, unknown>).height)
        : String(input.height);
    typeInput.value = pkg?.type ?? '';
    resetDeleteArm();
    if (preview.open) updatePreview();
  };

  const selectPackage = (pkg: OnlineMaterialPackageShape): void => {
    editingId = pkg.id;
    editingType = pkg.type;
    setForm({ pkg });
    renderList();
    setStatus(`正在编辑「${pkg.name}」。`);
  };

  const startNew = (): void => {
    editingId = undefined;
    editingType = '';
    setForm({});
    renderList();
    setStatus('填写字段后发布第一个在线物料。');
  };

  const load = async (): Promise<void> => {
    const result = await api.listMaterialPackages();
    if (disposed) return;
    if (!result.ok) {
      setStatus(`在线物料读取失败：${result.error.message}`, 'error');
      return;
    }
    packages = result.data.packages;
    if (editingId !== undefined && !packages.some((item) => item.id === editingId)) {
      editingId = undefined;
      editingType = '';
    }
    if (editingId === undefined) {
      if (packages.length > 0) selectPackage(packages[0]!);
      else startNew();
      return;
    }
    renderList();
  };

  const replacePackage = (pkg: OnlineMaterialPackageShape): void => {
    packages = [pkg, ...packages.filter((item) => item.id !== pkg.id)];
    editingId = pkg.id;
    editingType = pkg.type;
  };

  const onPublish = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    syncActions();
    setStatus('正在校验并发布代码…');
    try {
      const draft = buildDraft();
      const validation = await validateOnlineMaterialDraft(draft);
      if (!validation.ok) {
        setStatus(validation.diagnostics[0]?.message ?? '在线物料校验失败。', 'error');
        return;
      }
      const pkg = currentPackage();
      const result =
        pkg === undefined
          ? await api.createMaterialPackage({
              type: draft.type,
              name: nameInput.value.trim(),
              manifest: draft.manifest as unknown as Record<string, unknown>,
              code: draft.code,
            })
          : await api.updateMaterialPackage(pkg.id, {
              type: draft.type,
              name: nameInput.value.trim(),
              manifest: draft.manifest as unknown as Record<string, unknown>,
              code: draft.code,
              revision: pkg.revision,
            });
      if (!result.ok) {
        setStatus(`发布失败：${result.error.message}`, 'error');
        return;
      }
      const applied = await runtime.applyOnlineMaterialPackage(result.data.package, 'code');
      if (!applied.ok) {
        setStatus(applied.diagnostics[0]?.message ?? 'catalog 热刷新失败。', 'error');
        return;
      }
      replacePackage(result.data.package);
      setForm({ pkg: result.data.package });
      renderList();
      setStatus(
        result.data.package.revision === 1
          ? '已发布：新物料已进入物料库，无需刷新页面。'
          : '已发布新代码：同型组件已按新 tagName 重挂载。',
      );
      if (preview.open) updatePreview();
    } finally {
      busy = false;
      syncActions();
    }
  };

  const onManifestOnly = async (): Promise<void> => {
    const pkg = currentPackage();
    if (busy || pkg === undefined) return;
    busy = true;
    syncActions();
    setStatus('正在更新清单…');
    try {
      const name = nameInput.value.trim();
      const manifest = renameOnlineMaterialManifest(pkg.manifest, name);
      const validated = parseBaseScreenMaterialManifest(manifest);
      if (!validated.ok) {
        setStatus(validated.diagnostics[0]?.message ?? 'Manifest 无效。', 'error');
        return;
      }
      const result = await api.updateMaterialPackage(pkg.id, {
        type: pkg.type,
        name,
        manifest: manifest as Record<string, unknown>,
        code: pkg.code,
        revision: pkg.revision,
      });
      if (!result.ok) {
        setStatus(`更新清单失败：${result.error.message}`, 'error');
        return;
      }
      const applied = await runtime.applyOnlineMaterialPackage(result.data.package, 'manifest');
      if (!applied.ok) {
        setStatus(applied.diagnostics[0]?.message ?? 'catalog 热刷新失败。', 'error');
        return;
      }
      replacePackage(result.data.package);
      setForm({ pkg: result.data.package });
      renderList();
      setStatus('已仅更新清单：现有组件保持挂载，没有重挂载。');
    } finally {
      busy = false;
      syncActions();
    }
  };

  const onVisibility = async (): Promise<void> => {
    const pkg = currentPackage();
    if (busy || pkg === undefined) return;
    busy = true;
    syncActions();
    const visible = pkg.manifest.libraryVisible === false;
    try {
      const result = await api.setMaterialPackageVisibility(pkg.id, visible);
      if (!result.ok) {
        setStatus(`上架/下架失败：${result.error.message}`, 'error');
        return;
      }
      const applied = await runtime.applyOnlineMaterialPackage(result.data.package, 'manifest');
      if (!applied.ok) {
        setStatus(applied.diagnostics[0]?.message ?? 'catalog 热刷新失败。', 'error');
        return;
      }
      replacePackage(result.data.package);
      setForm({ pkg: result.data.package });
      renderList();
      setStatus(
        visible ? '已上架：物料库重新显示该物料。' : '已下架：物料库隐藏该物料，现有组件继续渲染。',
      );
    } finally {
      busy = false;
      syncActions();
    }
  };

  const onDelete = async (): Promise<void> => {
    const pkg = currentPackage();
    if (busy || pkg === undefined) return;
    if (!deleteArmed) {
      deleteArmed = true;
      syncActions();
      setStatus('再次点击「确认删除」执行删除。');
      deleteTimer = window.setTimeout(resetDeleteArm, 4000);
      return;
    }
    resetDeleteArm();
    busy = true;
    syncActions();
    try {
      const result = await api.deleteMaterialPackage(pkg.id);
      if (!result.ok) {
        if (result.error.code === 'MATERIAL_IN_USE') {
          const screens = readReferencedScreens(result.error.payload);
          setStatus(
            screens.length > 0
              ? `该物料仍被这些大屏引用：${screens.join('、')}。请先下架或迁移引用。`
              : result.error.message,
            'error',
          );
        } else {
          setStatus(`删除失败：${result.error.message}`, 'error');
        }
        return;
      }
      const removed = await runtime.removeOnlineMaterialPackage(pkg.type);
      if (!removed.ok) {
        setStatus(removed.diagnostics[0]?.message ?? '移除 catalog 条目失败。', 'error');
        return;
      }
      packages = packages.filter((item) => item.id !== pkg.id);
      editingId = undefined;
      editingType = '';
      setForm({});
      renderList();
      setStatus('已删除在线物料包。');
    } finally {
      busy = false;
      syncActions();
    }
  };

  const onInsert = (): void => {
    const pkg = currentPackage();
    if (pkg === undefined) return;
    const result = designer.insertComponent({ materialType: pkg.type });
    setStatus(
      result.ok
        ? `已插入「${pkg.name}」，可在检查器里调整配色与不透明度。`
        : (result.diagnostics[0]?.message ?? '插入失败。'),
      result.ok ? 'info' : 'error',
    );
  };

  const onToggle = (): void => {
    if (dialog.open) {
      dialog.close();
      return;
    }
    void load();
    dialog.showModal();
  };

  const onClose = (): void => dialog.close();
  const onPreviewToggle = (): void => {
    if (preview.open) updatePreview();
  };
  const onFormInput = (): void => {
    if (preview.open) updatePreview();
  };

  toggle.addEventListener('click', onToggle);
  close.addEventListener('click', onClose);
  newButton.addEventListener('click', startNew);
  publish.addEventListener('click', () => void onPublish());
  manifestOnly.addEventListener('click', () => void onManifestOnly());
  visibility.addEventListener('click', () => void onVisibility());
  remove.addEventListener('click', () => void onDelete());
  insert.addEventListener('click', onInsert);
  preview.addEventListener('toggle', onPreviewToggle);
  for (const input of [
    nameInput,
    valueInput,
    noteInput,
    backgroundInput,
    accentInput,
    widthInput,
    heightInput,
  ]) {
    input.addEventListener('input', onFormInput);
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });

  renderRuntimeErrors();
  renderList();
  setForm({});

  return {
    element: root,
    dispose(): void {
      disposed = true;
      window.clearTimeout(deleteTimer);
      dialog.close();
      dialog.remove();
      root.remove();
    },
  };
}

function buildOnlineMaterialCode(input: {
  readonly buildToken: string;
  readonly note: string;
  readonly background: string;
  readonly accent: string;
}): string {
  return `const BUILD = ${JSON.stringify(input.buildToken)};
const NOTE = ${JSON.stringify(input.note)};
const DEFAULT_BACKGROUND = ${JSON.stringify(input.background)};
const DEFAULT_ACCENT = ${JSON.stringify(input.accent)};

class OnlineMaterial extends HTMLElement {
  #model;
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  set model(value) {
    this.#model = value;
    this.#render();
  }

  get model() {
    return this.#model;
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    const model = this.#model;
    if (!model) return;
    const style = model.style || {};
    const state = model.dataState || { status: 'idle' };
    const value = state.status === 'ready' ? formatValue(state.value) : state.status === 'loading' ? '…' : '--';
    const background = typeof style.background === 'string' ? style.background : DEFAULT_BACKGROUND;
    const accent = typeof style.accent === 'string' ? style.accent : DEFAULT_ACCENT;
    const opacity = typeof style.opacity === 'number' ? style.opacity : 1;
    this.style.display = 'block';
    this.style.opacity = String(opacity);
    const root = this.#root;
    root.replaceChildren();
    const sheet = document.createElement('style');
    sheet.textContent = ':host{display:block;height:100%}.card{box-sizing:border-box;height:100%;padding:14px 16px;border:1px solid;border-radius:10px;display:flex;flex-direction:column;justify-content:space-between;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e6f1ff}.kicker{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;opacity:.72}.value{font-size:34px;font-weight:650;line-height:1.05}.note{font-size:10px;opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
    const card = document.createElement('div');
    card.className = 'card';
    card.style.background = background;
    card.style.borderColor = accent;
    const kicker = document.createElement('span');
    kicker.className = 'kicker';
    kicker.textContent = 'ONLINE · ' + BUILD;
    const valueElement = document.createElement('strong');
    valueElement.className = 'value';
    valueElement.textContent = value;
    valueElement.style.color = accent;
    const noteElement = document.createElement('span');
    noteElement.className = 'note';
    noteElement.textContent = NOTE;
    card.append(kicker, valueElement, noteElement);
    root.append(sheet, card);
  }
}

function formatValue(value) {
  if (typeof value === 'string') return value.length > 48 ? value.slice(0, 48) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '--';
  try {
    return JSON.stringify(value).slice(0, 48);
  } catch {
    return '--';
  }
}

export default OnlineMaterial;
`;
}

function normalizeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function clampSize(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug.length > 0 ? slug : 'component';
}

function randomToken(length: number): string {
  const source =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : Math.random().toString(36).slice(2);
  return source.slice(0, length);
}

function readReferencedScreens(payload: Readonly<Record<string, unknown>> | undefined): string[] {
  const refScreens = payload?.refScreens;
  if (!Array.isArray(refScreens)) return [];
  return refScreens.flatMap((item) => {
    if (item === null || typeof item !== 'object') return [];
    const name = (item as { readonly name?: unknown }).name;
    return typeof name === 'string' ? [name] : [];
  });
}

function textInput(type: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.className = 'online-material-input';
  input.placeholder = placeholder;
  if (type === 'number') {
    input.min = '1';
    input.step = '1';
  }
  return input;
}

function appendField(
  parent: HTMLElement,
  label: string,
  input: HTMLInputElement,
  field: string,
): void {
  const wrapper = document.createElement('label');
  wrapper.className = 'online-material-field';
  wrapper.dataset.onlineField = field;
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption, input);
  parent.append(wrapper);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className.length > 0) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, className: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = text;
  return control;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

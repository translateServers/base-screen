import type {
  BaseScreenDesignerElement,
  BaseScreenHostResourceAuthoringIntent,
  BaseScreenHostResourceSelection,
  BaseScreenHostResourceSelectionRequest,
  BaseScreenHostResourceSelectionRequestEventDetail,
} from '@base-screen/sdk/designer';
import {
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  baseScreenDesignerLeftPanelSlotName,
} from '@base-screen/sdk/designer';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import type { HostAssetShape } from '../types';

/**
 * 宿主素材库（ADR-0089）——三端逐字共享。
 *
 * 左栏只消费公开 slot；插入/替换/背景走公开方法；组件检查器与画布背景的选图请求
 * 走统一选择桥。素材目录、上传、删除保护全部属于宿主，文档只保存 host_image 身份。
 *
 * 与 `host-resource-authoring.ts` 同一对等约定：vanilla 是基准拷贝，react / vue
 * 保持逐字一致；根测试只对纯函数与后端契约做防漂移断言。
 */
export const HOST_ASSET_LIBRARY_GROUP_ID = 'assets';
export const HOST_ASSET_RESOURCE_TYPE = 'host_image';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

export interface HostAssetReplaceComponent {
  readonly id: string;
  readonly type: string;
  readonly dataValue?: unknown;
}

export interface HostAssetLibraryOptions {
  readonly designer: BaseScreenDesignerElement;
}

export interface HostAssetLibraryHandle {
  /** 放进 `<base-screen-designer>` light DOM 的左栏内容。 */
  readonly element: HTMLElement;
  load(): Promise<void>;
  dispose(): void;
}

export function assetContentPath(asset: Pick<HostAssetShape, 'id'>): string {
  return `/assets/${encodeURIComponent(asset.id)}/content`;
}

export function buildAssetInsertIntent(
  asset: Pick<HostAssetShape, 'id' | 'name'>,
): BaseScreenHostResourceAuthoringIntent {
  return {
    materialType: 'base.image',
    name: asset.name,
    dataSource: {
      type: 'host-resource',
      resourceType: HOST_ASSET_RESOURCE_TYPE,
      resourceId: asset.id,
      params: {},
      binding: null,
    },
  };
}

export function resolveAssetReplaceTarget(
  components: readonly HostAssetReplaceComponent[],
  selectedComponentIds: readonly string[],
): string | undefined {
  if (selectedComponentIds.length !== 1) return undefined;
  const component = components.find((item) => item.id === selectedComponentIds[0]);
  if (component === undefined || component.type !== 'base.image') return undefined;
  return 'dataValue' in component ? undefined : component.id;
}

export function createHostAssetLibrary(options: HostAssetLibraryOptions): HostAssetLibraryHandle {
  const { designer } = options;
  const doc = document;

  const rail = doc.createElement('div');
  rail.className = 'asset-library';
  rail.slot = baseScreenDesignerLeftPanelSlotName(HOST_ASSET_LIBRARY_GROUP_ID);
  rail.dataset.hostAssetLibrary = '';

  const header = el('header', 'asset-library-head');
  const heading = el('div', 'asset-library-heading');
  heading.append(el('span', 'asset-eyebrow', 'HOST ASSETS'), el('h2', 'asset-title', '素材库'));
  const count = el('span', 'asset-count', '0');
  const refresh = button('刷新', 'asset-icon-button');
  header.append(heading, count, refresh);

  const uploadLabel = el('label', 'asset-upload');
  const uploadInput = doc.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = ACCEPTED_TYPES;
  uploadInput.multiple = true;
  uploadInput.hidden = true;
  uploadInput.dataset.assetUpload = '';
  const uploadCopy = el('span', 'asset-upload-copy');
  uploadCopy.append(
    el('strong', '', '上传图片'),
    el('small', '', 'PNG / JPEG / WebP / GIF · 单张 ≤ 5 MB'),
  );
  uploadLabel.append(el('span', 'asset-upload-mark', '+'), uploadCopy, uploadInput);

  const tools = el('div', 'asset-tools');
  const search = doc.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索素材';
  search.className = 'asset-search';
  search.dataset.assetSearch = '';
  tools.append(search);

  const status = el('p', 'asset-status');
  status.dataset.assetStatus = '';
  status.setAttribute('aria-live', 'polite');

  const grid = el('div', 'asset-grid');
  grid.dataset.assetGrid = '';
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', '素材列表');

  const selectionBar = el('div', 'asset-selection');
  selectionBar.dataset.assetSelection = '';
  selectionBar.hidden = true;
  const selectionName = el('span', 'asset-selection-name');
  const actions = el('div', 'asset-selection-actions');
  const insertButton = button('插入画布', 'button button--primary');
  insertButton.dataset.assetInsert = '';
  const replaceButton = button('替换选中', 'button');
  replaceButton.dataset.assetReplace = '';
  const backgroundButton = button('设为背景', 'button');
  backgroundButton.dataset.assetBackground = '';
  const deleteButton = button('删除', 'button button--danger');
  deleteButton.dataset.assetDelete = '';
  actions.append(insertButton, replaceButton, backgroundButton, deleteButton);
  selectionBar.append(selectionName, actions);

  rail.append(header, uploadLabel, tools, status, grid, selectionBar);

  const confirmDialog = createConfirmDialog(doc);
  const noticeDialog = createNoticeDialog(doc);
  const picker = createPickerDialog(doc);
  doc.body.append(confirmDialog.dialog, noticeDialog.dialog, picker.dialog);

  let assets: readonly HostAssetShape[] = [];
  let selectedId: string | undefined;
  let selectedComponentIds: readonly string[] = [];
  let pendingRequest: BaseScreenHostResourceSelectionRequest | undefined;
  let pickerSelectedId: string | undefined;
  let pickerQuery = '';
  let loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let statusMessage = '';
  let disposed = false;

  const contentUrl = (asset: HostAssetShape): string =>
    `${resolveApiBase()}${assetContentPath(asset)}`;

  const visibleAssets = (query: string): readonly HostAssetShape[] => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? assets
      : assets.filter((asset) => asset.name.toLocaleLowerCase().includes(normalized));
  };

  const selectedAsset = (): HostAssetShape | undefined =>
    assets.find((asset) => asset.id === selectedId);

  const replaceTarget = (): string | undefined =>
    resolveAssetReplaceTarget(designer.document?.components ?? [], selectedComponentIds);

  const setStatus = (message: string): void => {
    statusMessage = message;
    status.textContent = message;
  };

  const renderRail = (): void => {
    const items = visibleAssets(search.value);
    count.textContent = String(assets.length);
    grid.replaceChildren(
      ...items.map((asset) =>
        renderAssetCard(
          doc,
          asset,
          selectedId === asset.id,
          () => {
            selectedId = asset.id;
            renderRail();
          },
          () => {
            selectedId = asset.id;
            insertSelected();
          },
        ),
      ),
    );
    if (items.length === 0 && loadState === 'ready') {
      grid.append(
        el(
          'p',
          'asset-empty',
          assets.length === 0
            ? '还没有素材。上传第一张图片，或检查后端素材播种是否开启。'
            : '没有匹配的素材。',
        ),
      );
    }
    const asset = selectedAsset();
    selectionBar.hidden = asset === undefined;
    if (asset !== undefined) {
      selectionName.textContent = asset.name;
      replaceButton.disabled = replaceTarget() === undefined;
      deleteButton.disabled = false;
    }
    if (statusMessage.length > 0) status.textContent = statusMessage;
  };

  const load = async (): Promise<void> => {
    loadState = 'loading';
    setStatus('正在读取素材…');
    renderRail();
    const result = await api.listAssets();
    if (disposed) return;
    if (!result.ok) {
      loadState = 'error';
      setStatus(`素材读取失败：${result.error.message}`);
      renderRail();
      return;
    }
    loadState = 'ready';
    assets = result.data.assets;
    if (selectedId !== undefined && !assets.some((asset) => asset.id === selectedId)) {
      selectedId = undefined;
    }
    setStatus(`已加载 ${assets.length} 张素材。`);
    renderRail();
    if (picker.dialog.open) renderPicker();
  };

  const insertSelected = (): void => {
    const asset = selectedAsset();
    if (asset === undefined) return;
    const result = designer.insertHostResource(buildAssetInsertIntent(asset));
    setStatus(
      result.ok
        ? `已插入「${asset.name}」，文档只保存素材身份。`
        : (result.diagnostics[0]?.message ?? '插入失败。'),
    );
    renderRail();
  };

  const replaceSelected = (): void => {
    const asset = selectedAsset();
    const target = replaceTarget();
    if (asset === undefined || target === undefined) return;
    const result = designer.replaceHostResource(target, buildAssetInsertIntent(asset));
    setStatus(
      result.ok
        ? `已把选中图片替换为「${asset.name}」。`
        : (result.diagnostics[0]?.message ?? '替换失败。'),
    );
    renderRail();
  };

  const applyBackground = (): void => {
    const asset = selectedAsset();
    if (asset === undefined) return;
    const result = designer.setCanvasBackgroundImage(contentUrl(asset), 'cover');
    setStatus(
      result.ok
        ? `已把「${asset.name}」设为画布背景（文档保存稳定 URL）。`
        : (result.diagnostics[0]?.message ?? '设置背景失败。'),
    );
    renderRail();
  };

  const removeSelected = async (): Promise<void> => {
    const asset = selectedAsset();
    if (asset === undefined) return;
    const confirmed = await confirmDialog.open({
      title: '删除素材',
      message:
        asset.referenceCount > 0
          ? `「${asset.name}」正被 ${asset.referenceCount} 张大屏引用。删除会被宿主拒绝，建议先替换引用。`
          : `确定删除「${asset.name}」？文件会从宿主素材目录移除。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!confirmed) return;
    const result = await api.deleteAsset(asset.id);
    if (disposed) return;
    if (!result.ok) {
      if (result.error.code === 'ASSET_IN_USE') {
        const screens = readReferencedScreens(result.error.payload);
        await noticeDialog.open({
          title: '删除被拒绝',
          message:
            screens.length > 0
              ? `该素材仍被这些大屏引用：${screens.join('、')}。先替换引用后再删除。`
              : result.error.message,
        });
      } else {
        setStatus(`删除失败：${result.error.message}`);
      }
      return;
    }
    selectedId = undefined;
    await load();
    setStatus(`已删除「${asset.name}」。`);
    renderRail();
  };

  const uploadFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const accepted: File[] = [];
    for (const file of files) {
      if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
        setStatus(`「${file.name}」不是支持的图片类型。`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus(`「${file.name}」超过 5 MB。`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    for (const [index, file] of accepted.entries()) {
      setStatus(`正在上传 ${index + 1}/${accepted.length}：${file.name}`);
      const result = await api.uploadAsset(file);
      if (disposed) return;
      if (!result.ok) {
        setStatus(`「${file.name}」上传失败：${result.error.message}`);
      }
    }
    await load();
    if (disposed) return;
    if (picker.dialog.open) renderPicker();
    setStatus(`已上传 ${accepted.length} 张素材。`);
    renderRail();
  };

  const renderPicker = (): void => {
    const items = visibleAssets(pickerQuery);
    picker.grid.replaceChildren(
      ...items.map((asset) =>
        renderAssetCard(doc, asset, pickerSelectedId === asset.id, () => {
          pickerSelectedId = asset.id;
          renderPicker();
        }),
      ),
    );
    if (items.length === 0) {
      picker.grid.append(el('p', 'asset-empty', '没有匹配的素材。'));
    }
    const asset = assets.find((item) => item.id === pickerSelectedId);
    picker.confirm.disabled = asset === undefined;
    if (asset === undefined) {
      picker.detail.replaceChildren(el('p', 'asset-empty', '从左侧选择一张素材。'));
      picker.status.textContent = '';
      return;
    }
    const preview = doc.createElement('img');
    preview.className = 'asset-picker-preview';
    preview.alt = asset.name;
    preview.src = contentUrl(asset);
    const meta = el('div', 'asset-picker-meta');
    meta.append(
      el('strong', '', asset.name),
      el('span', 'asset-mono', `${asset.mimeType} · ${formatBytes(asset.byteSize)}`),
      el('span', 'asset-mono', `resourceId: ${asset.id}`),
      el(
        'span',
        'asset-mono',
        asset.referenceCount > 0 ? `已被 ${asset.referenceCount} 张大屏引用` : '尚未被引用',
      ),
    );
    picker.detail.replaceChildren(preview, meta);
    picker.status.textContent =
      pendingRequest?.target.kind === 'canvas-background'
        ? '确认后写入画布背景的稳定 URL。'
        : '确认后组件只保存 host-resource 身份。';
  };

  const openPicker = (request: BaseScreenHostResourceSelectionRequest): void => {
    pendingRequest = request;
    pickerQuery = '';
    picker.search.value = '';
    pickerSelectedId = matchCurrentAsset(request, assets);
    picker.title.textContent =
      request.target.kind === 'canvas-background' ? '选择画布背景' : '选择图片素材';
    picker.dialog.showModal();
    renderPicker();
  };

  const commitPicker = (): void => {
    const request = pendingRequest;
    const asset = assets.find((item) => item.id === pickerSelectedId);
    if (request === undefined || asset === undefined) return;
    const selection: BaseScreenHostResourceSelection =
      request.target.kind === 'canvas-background'
        ? { kind: 'url', url: contentUrl(asset) }
        : {
            kind: 'host-resource',
            resourceType: HOST_ASSET_RESOURCE_TYPE,
            resourceId: asset.id,
          };
    const result = designer.commitHostResourceSelection(
      request.target.kind === 'canvas-background'
        ? {
            requestId: request.requestId,
            selection,
            backgroundImageFit: request.target.backgroundImageFit ?? 'cover',
          }
        : { requestId: request.requestId, selection },
    );
    if (!result.ok) {
      picker.status.textContent = result.diagnostics[0]?.message ?? '提交失败。';
      return;
    }
    pendingRequest = undefined;
    picker.dialog.close();
    selectedId = asset.id;
    setStatus(`已应用「${asset.name}」。`);
    renderRail();
  };

  const onUploadChange = (): void => {
    const files = Array.from(uploadInput.files ?? []);
    uploadInput.value = '';
    void uploadFiles(files);
  };

  const onPickerUploadChange = (): void => {
    const files = Array.from(picker.upload.files ?? []);
    picker.upload.value = '';
    void uploadFiles(files);
  };

  const onSelectionChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly selectedComponentIds?: readonly string[] }>)
      .detail;
    selectedComponentIds = Array.isArray(detail?.selectedComponentIds)
      ? [...detail.selectedComponentIds]
      : [];
    if (selectedAsset() !== undefined) renderRail();
  };

  const onSelectionRequest = (event: Event): void => {
    const detail = event as CustomEvent<BaseScreenHostResourceSelectionRequestEventDetail>;
    if (detail.detail?.request !== undefined) openPicker(detail.detail.request);
  };

  const onSearch = (): void => renderRail();
  const onPickerSearch = (): void => {
    pickerQuery = picker.search.value;
    renderPicker();
  };

  refresh.addEventListener('click', () => void load());
  search.addEventListener('input', onSearch);
  uploadInput.addEventListener('change', onUploadChange);
  picker.upload.addEventListener('change', onPickerUploadChange);
  picker.search.addEventListener('input', onPickerSearch);
  insertButton.addEventListener('click', insertSelected);
  replaceButton.addEventListener('click', replaceSelected);
  backgroundButton.addEventListener('click', applyBackground);
  deleteButton.addEventListener('click', () => void removeSelected());
  picker.confirm.addEventListener('click', commitPicker);
  picker.cancel.addEventListener('click', () => {
    pendingRequest = undefined;
    picker.dialog.close();
  });
  picker.dialog.addEventListener('close', () => {
    // close 事件可能晚于下一次 showModal：重开时不能清掉新的 pending。
    if (!picker.dialog.open) pendingRequest = undefined;
  });
  designer.addEventListener('base-screen-selection-change', onSelectionChange);
  designer.addEventListener(BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT, onSelectionRequest);

  void load();

  return {
    element: rail,
    load,
    dispose(): void {
      disposed = true;
      designer.removeEventListener('base-screen-selection-change', onSelectionChange);
      designer.removeEventListener(
        BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
        onSelectionRequest,
      );
      search.removeEventListener('input', onSearch);
      uploadInput.removeEventListener('change', onUploadChange);
      picker.upload.removeEventListener('change', onPickerUploadChange);
      picker.search.removeEventListener('input', onPickerSearch);
      picker.confirm.removeEventListener('click', commitPicker);
      picker.dialog.close();
      confirmDialog.dialog.close();
      noticeDialog.dialog.close();
      picker.dialog.remove();
      confirmDialog.dialog.remove();
      noticeDialog.dialog.remove();
      rail.remove();
    },
  };
}

function matchCurrentAsset(
  request: BaseScreenHostResourceSelectionRequest,
  assets: readonly HostAssetShape[],
): string | undefined {
  if (request.current.kind === 'host-resource') {
    const current = request.current;
    return assets.find((asset) => asset.id === current.resourceId)?.id;
  }
  if (request.current.kind === 'url') {
    const current = request.current;
    return assets.find((asset) => current.url.endsWith(assetContentPath(asset)))?.id;
  }
  return undefined;
}

function renderAssetCard(
  doc: Document,
  asset: HostAssetShape,
  selected: boolean,
  onSelect: () => void,
  onInsert?: () => void,
): HTMLButtonElement {
  const card = doc.createElement('button');
  card.type = 'button';
  card.className = 'asset-card';
  card.dataset.assetId = asset.id;
  card.setAttribute('role', 'option');
  card.setAttribute('aria-selected', selected ? 'true' : 'false');
  if (selected) card.classList.add('is-selected');

  const thumb = el('span', 'asset-thumb');
  const image = doc.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = `${resolveApiBase()}${assetContentPath(asset)}`;
  thumb.append(image);

  const meta = el('span', 'asset-meta');
  const name = el('strong', 'asset-name', asset.name);
  name.title = asset.name;
  const size = el('small', 'asset-size', formatBytes(asset.byteSize));
  meta.append(name, size);
  image.addEventListener('load', () => {
    if (!image.isConnected) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      size.textContent = `${image.naturalWidth}×${image.naturalHeight} · ${formatBytes(asset.byteSize)}`;
    }
  });
  card.append(thumb, meta);
  if (asset.referenceCount > 0) {
    card.append(el('span', 'asset-badge', `引用 ${asset.referenceCount}`));
  }
  card.addEventListener('click', onSelect);
  if (onInsert !== undefined) {
    card.addEventListener('dblclick', onInsert);
  }
  return card;
}

function createConfirmDialog(doc: Document): {
  readonly dialog: HTMLDialogElement;
  open(input: {
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly danger?: boolean;
  }): Promise<boolean>;
} {
  const dialog = doc.createElement('dialog');
  dialog.className = 'asset-dialog';
  const form = el('div', 'asset-dialog-card');
  const title = el('h2', 'asset-dialog-title');
  const message = el('p', 'asset-dialog-message');
  const footer = el('div', 'asset-dialog-actions');
  const cancel = button('取消', 'button');
  const confirm = button('确定', 'button button--primary');
  footer.append(cancel, confirm);
  form.append(title, message, footer);
  dialog.append(form);

  return {
    dialog,
    open(input): Promise<boolean> {
      title.textContent = input.title;
      message.textContent = input.message;
      confirm.textContent = input.confirmLabel;
      confirm.classList.toggle('button--danger', input.danger === true);
      dialog.showModal();
      return new Promise((resolve) => {
        const finish = (value: boolean): void => {
          cancel.removeEventListener('click', onCancel);
          confirm.removeEventListener('click', onConfirm);
          dialog.removeEventListener('cancel', onDismiss);
          dialog.close();
          resolve(value);
        };
        const onCancel = (): void => finish(false);
        const onConfirm = (): void => finish(true);
        const onDismiss = (event: Event): void => {
          event.preventDefault();
          finish(false);
        };
        cancel.addEventListener('click', onCancel);
        confirm.addEventListener('click', onConfirm);
        dialog.addEventListener('cancel', onDismiss);
      });
    },
  };
}

function createNoticeDialog(doc: Document): {
  readonly dialog: HTMLDialogElement;
  open(input: { readonly title: string; readonly message: string }): Promise<void>;
} {
  const dialog = doc.createElement('dialog');
  dialog.className = 'asset-dialog';
  const form = el('div', 'asset-dialog-card');
  const title = el('h2', 'asset-dialog-title');
  const message = el('p', 'asset-dialog-message');
  const footer = el('div', 'asset-dialog-actions');
  const close = button('知道了', 'button button--primary');
  footer.append(close);
  form.append(title, message, footer);
  dialog.append(form);

  return {
    dialog,
    open(input): Promise<void> {
      title.textContent = input.title;
      message.textContent = input.message;
      dialog.showModal();
      return new Promise((resolve) => {
        const finish = (): void => {
          close.removeEventListener('click', finish);
          dialog.removeEventListener('cancel', onDismiss);
          dialog.close();
          resolve();
        };
        const onDismiss = (event: Event): void => {
          event.preventDefault();
          finish();
        };
        close.addEventListener('click', finish);
        dialog.addEventListener('cancel', onDismiss);
      });
    },
  };
}

function createPickerDialog(doc: Document): {
  readonly dialog: HTMLDialogElement;
  readonly title: HTMLHeadingElement;
  readonly search: HTMLInputElement;
  readonly upload: HTMLInputElement;
  readonly grid: HTMLElement;
  readonly detail: HTMLElement;
  readonly status: HTMLElement;
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
} {
  const dialog = doc.createElement('dialog');
  dialog.className = 'asset-picker';
  dialog.setAttribute('aria-labelledby', 'asset-picker-title');

  const head = el('header', 'asset-picker-head');
  const title = el('h2', 'asset-picker-title');
  title.id = 'asset-picker-title';
  const uploadLabel = el('label', 'button asset-picker-upload');
  uploadLabel.append(el('span', '', '上传新素材'));
  const upload = doc.createElement('input');
  upload.type = 'file';
  upload.accept = ACCEPTED_TYPES;
  upload.multiple = true;
  upload.hidden = true;
  uploadLabel.append(upload);
  const close = button('关闭', 'asset-icon-button');
  head.append(title, uploadLabel, close);

  const body = el('div', 'asset-picker-body');
  const gridSide = el('div', 'asset-picker-grid-side');
  const search = doc.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索素材';
  search.className = 'asset-search';
  const grid = el('div', 'asset-picker-grid');
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', '可选素材');
  gridSide.append(search, grid);
  const detail = el('aside', 'asset-picker-detail');
  body.append(gridSide, detail);

  const foot = el('footer', 'asset-picker-foot');
  const status = el('p', 'asset-picker-status');
  status.setAttribute('aria-live', 'polite');
  const actions = el('div', 'asset-picker-actions');
  const cancel = button('取消', 'button');
  const confirm = button('使用所选素材', 'button button--primary');
  actions.append(cancel, confirm);
  foot.append(status, actions);

  dialog.append(head, body, foot);
  close.addEventListener('click', () => dialog.close());

  return { dialog, title, search, upload, grid, detail, status, confirm, cancel };
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

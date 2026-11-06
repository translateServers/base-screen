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
import {
  ASSET_ACCEPTED_TYPES,
  ASSET_TEXT,
  assetContentPath,
  formatAssetBytes,
  HOST_ASSET_RESOURCE_TYPE,
  validateAssetFile,
} from '../lib/asset-model';
import type { HostAssetShape } from '../types';

/**
 * 宿主素材库（ADR-0089）——三端逐字共享。
 *
 * 左栏只消费公开 slot；插入/替换/背景走公开方法；组件检查器与画布背景的选图请求
 * 走统一选择桥。公共素材的目录与删除在宿主后台页；设计器只允许临时上传。
 * 文档只保存 host_image 身份，不保存任何 URL。
 *
 * 与 `host-resource-authoring.ts` 同一对等约定：vanilla 是基准拷贝，react / vue
 * 保持逐字一致；根测试只对纯函数与后端契约做防漂移断言。
 */
export { assetContentPath, HOST_ASSET_RESOURCE_TYPE } from '../lib/asset-model';

export const HOST_ASSET_LIBRARY_GROUP_ID = 'assets';

export interface HostAssetReplaceComponent {
  readonly id: string;
  readonly type: string;
  readonly dataValue?: unknown;
}

export interface HostAssetLibraryOptions {
  readonly designer: BaseScreenDesignerElement;
  /** 当前编辑的大屏 id；有值时上传写入临时素材，列表按屏返回公共 + 本屏临时。 */
  readonly screenId?: string;
}

export interface HostAssetLibraryHandle {
  /** 放进 `<base-screen-designer>` light DOM 的左栏内容。 */
  readonly element: HTMLElement;
  load(): Promise<void>;
  dispose(): void;
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
  const { designer, screenId } = options;
  const canUploadTemporary = screenId !== undefined;
  const doc = document;

  const rail = doc.createElement('div');
  // bs-host 接入公共令牌层（--bs-host-*）：配色、间距、动效都从那里取，宿主只做别名。
  rail.className = 'asset-library bs-host';
  rail.slot = baseScreenDesignerLeftPanelSlotName(HOST_ASSET_LIBRARY_GROUP_ID);
  rail.dataset.hostAssetLibrary = '';

  const toolbar = el('div', 'asset-toolbar');
  const search = doc.createElement('input');
  search.type = 'search';
  search.placeholder = ASSET_TEXT.searchPlaceholder;
  search.className = 'asset-search';
  search.dataset.assetSearch = '';
  const refresh = button(ASSET_TEXT.refresh, 'asset-ghost-button');
  toolbar.append(search, refresh);

  const uploadLabel = el('label', 'asset-upload');
  uploadLabel.title = ASSET_TEXT.temporaryUploadHint;
  const uploadInput = doc.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = ASSET_ACCEPTED_TYPES;
  uploadInput.multiple = true;
  uploadInput.hidden = true;
  uploadInput.dataset.assetUpload = '';
  const uploadCopy = el('span', 'asset-upload-copy');
  uploadCopy.append(
    el('strong', '', ASSET_TEXT.temporaryUpload),
    el('small', '', ASSET_TEXT.temporaryVisibility),
  );
  uploadLabel.append(el('span', 'asset-upload-mark', '+'), uploadCopy, uploadInput);

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
  actions.append(insertButton, replaceButton, backgroundButton);
  selectionBar.append(selectionName, actions);

  rail.append(toolbar, ...(canUploadTemporary ? [uploadLabel] : []), status, grid, selectionBar);

  const picker = createPickerDialog(doc, canUploadTemporary);
  doc.body.append(picker.dialog);

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
            ? '还没有可用素材。可在后台素材库上传公共图片，或在此临时上传。'
            : ASSET_TEXT.emptyFiltered,
        ),
      );
    }
    const asset = selectedAsset();
    selectionBar.hidden = asset === undefined;
    if (asset !== undefined) {
      selectionName.textContent = asset.name;
      replaceButton.disabled = replaceTarget() === undefined;
    }
    if (statusMessage.length > 0) status.textContent = statusMessage;
  };

  const load = async (): Promise<void> => {
    loadState = 'loading';
    setStatus('正在读取素材…');
    renderRail();
    const result = await api.listAssets(screenId === undefined ? {} : { screenId });
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
    setStatus(`共 ${assets.length} 张素材。`);
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

  const uploadFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0 || screenId === undefined) return;
    const accepted: File[] = [];
    for (const file of files) {
      const reason = validateAssetFile(file);
      if (reason !== null) {
        setStatus(`「${file.name}」${reason}。`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    let uploaded = 0;
    for (const [index, file] of accepted.entries()) {
      setStatus(`正在临时上传 ${index + 1}/${accepted.length}：${file.name}`);
      const result = await api.uploadAsset(file, { scope: 'temporary', screenId });
      if (disposed) return;
      if (result.ok) uploaded += 1;
      else setStatus(`「${file.name}」上传失败：${result.error.message}`);
    }
    await load();
    if (disposed) return;
    if (picker.dialog.open) renderPicker();
    setStatus(
      uploaded === accepted.length
        ? `已临时上传 ${uploaded} 张素材。`
        : `已上传临时素材 ${uploaded}/${accepted.length} 张。`,
    );
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
      el('span', 'asset-mono', `${asset.mimeType} · ${formatAssetBytes(asset.byteSize)}`),
      el('span', 'asset-mono', `resourceId: ${asset.id}`),
      el(
        'span',
        'asset-mono',
        asset.referenceCount > 0 ? `已被 ${asset.referenceCount} 张大屏引用` : '尚未被引用',
      ),
      ...(asset.temporary
        ? [
            el(
              'span',
              'asset-mono',
              asset.screenName === null
                ? '临时素材 · 仅当前大屏可见'
                : `临时素材 · ${asset.screenName}`,
            ),
          ]
        : []),
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
    // 选择器挂在 body 上，不在设计器 light DOM 内，拿不到 base-screen-designer[theme]
    // 的继承；打开时镜像当前主题，公共令牌层才会切到对应的那一套。
    picker.dialog.setAttribute(
      'theme',
      designer.getAttribute('theme') === 'light' ? 'light' : 'dark',
    );
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
      picker.dialog.remove();
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
  const size = el('small', 'asset-size', formatAssetBytes(asset.byteSize));
  meta.append(name, size);
  image.addEventListener('load', () => {
    if (!image.isConnected) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      size.textContent = `${image.naturalWidth}×${image.naturalHeight} · ${formatAssetBytes(asset.byteSize)}`;
    }
  });
  card.append(thumb, meta);
  const badge = asset.temporary
    ? asset.referenceCount > 0
      ? `${ASSET_TEXT.temporary} · ${ASSET_TEXT.inUse} ${asset.referenceCount}`
      : ASSET_TEXT.temporary
    : asset.referenceCount > 0
      ? `${ASSET_TEXT.inUse} ${asset.referenceCount}`
      : null;
  if (badge !== null) {
    card.append(
      el('span', `asset-badge${asset.temporary ? ' asset-badge--temporary' : ''}`, badge),
    );
  }
  card.addEventListener('click', onSelect);
  if (onInsert !== undefined) {
    card.addEventListener('dblclick', onInsert);
  }
  return card;
}

function createPickerDialog(
  doc: Document,
  showUpload: boolean,
): {
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
  dialog.className = 'asset-picker bs-host';
  dialog.setAttribute('aria-labelledby', 'asset-picker-title');

  const head = el('header', 'asset-picker-head');
  const title = el('h2', 'asset-picker-title');
  title.id = 'asset-picker-title';
  const uploadLabel = el('label', 'asset-picker-upload');
  uploadLabel.title = ASSET_TEXT.temporaryUploadHint;
  uploadLabel.append(el('span', '', ASSET_TEXT.temporaryUpload));
  const upload = doc.createElement('input');
  upload.type = 'file';
  upload.accept = ASSET_ACCEPTED_TYPES;
  upload.multiple = true;
  upload.hidden = true;
  uploadLabel.append(upload);
  const close = button('关闭', 'asset-ghost-button');
  head.append(title);
  if (showUpload) head.append(uploadLabel);
  head.append(close);

  const body = el('div', 'asset-picker-body');
  const gridSide = el('div', 'asset-picker-grid-side');
  const search = doc.createElement('input');
  search.type = 'search';
  search.placeholder = ASSET_TEXT.searchPlaceholder;
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

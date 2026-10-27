import type { ScreenDatasetEntry } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import { createDataGroup } from './designer-data-group-dom.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerHostLinkChannel,
  DesignerHostLinkStatus,
  DesignerHostLinkView,
} from './designer-dataset-types.js';

export function renderHostConnection(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const connection = ownerDocument.createElement('section');
  connection.className = 'designer-host-connection';
  connection.dataset.dsSection = 'host-link';
  connection.dataset.inspectorSearchSection = 'true';
  connection.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataSource.hostConnection,
    DESIGNER_UI_TEXT.dataSource.datasetCatalog,
    DESIGNER_UI_TEXT.dataSource.dataQuery,
    DESIGNER_UI_TEXT.dataSource.variablesChannel,
  ].join(' ');
  const statuses = ownerDocument.createElement('div');
  statuses.className = 'designer-host-connection-statuses';
  statuses.append(...hostConnectionStatuses(ownerDocument, options.link));
  // 段根保留 `data-ds-section="host-link"`，折叠组是段内一层：本段是 `source` 段的**兄弟**，
  // 视觉合组只允许 CSS（`border-top: 0`）。把 details 挪进 source 段会让两块内容落进同一个
  // 替换单元，段边界就没了。
  //
  // 检查器里的三颗灯已经画在来源卡里（`renderHostHealth`）：这一段只负责「没接上怎么办」的
  // 诊断（指引与重试），再画一遍灯就是同一份状态两处显示，收起时还会互相矛盾。
  const children = options.surface === 'workbench' ? [statuses] : [];
  connection.appendChild(
    createDataGroup(
      {
        ownerDocument,
        section: 'host-link',
        group: 'host-link',
        title: DESIGNER_UI_TEXT.data.groups.hostLink,
        summary: linkSummary(options),
        defaultOpen: hasUnavailableLink(options.link) || hasFailedLink(options.link),
        overrides: options.groupOpenOverrides,
        onToggle: options.onToggleGroup,
      },
      children,
    ),
  );
  // 三条通道都没接上时给出接入方式，而不是只留三个灰点让人猜。
  if (hasUnavailableLink(options.link)) {
    const hint = ownerDocument.createElement('p');
    hint.className = 'designer-host-connection-hint';
    hint.textContent = DESIGNER_UI_TEXT.dataSource.linkUnavailableHint;
    connection.appendChild(hint);
  }
  if (hasFailedLink(options.link)) {
    const retry = createDesignerButton(ownerDocument, {
      text: DESIGNER_UI_TEXT.dataSource.linkRetry,
    });
    retry.dataset.datasetAction = 'retry-link';
    connection.appendChild(retry);
  }
  return connection;
}

/** 组头摘要：已接入通道计数（`total` 恒为 3）——收起时也能看出接上了几条。 */
function linkSummary(options: DesignerDataSourcePanelOptions): string {
  const channels = [options.link.catalog, options.link.query, options.link.variables];
  const ready = channels.filter((channel) => channel.status === 'ready').length;
  return DESIGNER_UI_TEXT.data.groups.channelsReady(ready, channels.length);
}

function hasUnavailableLink(link: DesignerHostLinkView): boolean {
  return [link.catalog, link.query, link.variables].every(
    (channel) => channel.status === 'unavailable',
  );
}

function hasFailedLink(link: DesignerHostLinkView): boolean {
  return [link.catalog, link.query, link.variables].some((channel) => channel.status === 'error');
}

/** 三通道状态灯：工作台的诊断列与来源卡共用同一组顺序与文案。 */
function hostConnectionStatuses(
  ownerDocument: Document,
  link: DesignerHostLinkView,
): HTMLElement[] {
  return [
    connectionStatus(ownerDocument, DESIGNER_UI_TEXT.dataSource.datasetCatalog, link.catalog),
    connectionStatus(ownerDocument, DESIGNER_UI_TEXT.dataSource.dataQuery, link.query),
    connectionStatus(ownerDocument, DESIGNER_UI_TEXT.dataSource.variablesChannel, link.variables),
  ];
}

/**
 * 来源卡里的三颗灯（设计稿 `.health`）：只表达「通没通」。
 *
 * 与工作台诊断列的区别是有意的：诊断列要带失败诊断码（宿主排查靠它），来源卡里那行
 * 只有 60px 高，塞诊断码会把三个通道挤成省略号。完整文案仍挂在 `title`/`aria-label`。
 */
export function renderHostHealth(ownerDocument: Document, link: DesignerHostLinkView): HTMLElement {
  const health = ownerDocument.createElement('div');
  health.className = 'designer-dataset-health';
  health.dataset.datasetHealth = 'true';
  health.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.hostConnection);
  for (const [label, channel] of [
    [DESIGNER_UI_TEXT.dataSource.datasetCatalogShort, link.catalog],
    [DESIGNER_UI_TEXT.dataSource.dataQueryShort, link.query],
    [DESIGNER_UI_TEXT.dataSource.variablesChannelShort, link.variables],
  ] as const) {
    const item = ownerDocument.createElement('span');
    item.className = 'designer-dataset-health-item';
    item.dataset.linkStatus = channel.status;
    item.dataset.state =
      channel.status === 'ready'
        ? 'ready'
        : channel.status === 'loading'
          ? 'loading'
          : channel.status === 'error'
            ? 'error'
            : 'na';
    const detail =
      channel.detail === undefined || channel.detail === '' ? '' : ` · ${channel.detail}`;
    const text = `${label} · ${linkStatusText(channel.status)}${detail}`;
    item.title = text;
    item.setAttribute('aria-label', text);
    const dot = ownerDocument.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    item.append(dot, label);
    health.appendChild(item);
  }
  return health;
}

function connectionStatus(
  ownerDocument: Document,
  label: string,
  channel: DesignerHostLinkChannel,
): HTMLElement {
  const status = ownerDocument.createElement('span');
  status.className = 'designer-host-connection-status';
  status.dataset.connected = String(channel.status === 'ready');
  status.dataset.linkStatus = channel.status;
  const dot = ownerDocument.createElement('i');
  dot.setAttribute('aria-hidden', 'true');
  const text = ownerDocument.createElement('span');
  // 失败时把诊断码带上：真实宿主的失败原因（无权限 / 超时 / 返回不合法）在这里可辨。
  const detail =
    channel.detail === undefined || channel.detail === '' ? '' : ` · ${channel.detail}`;
  text.textContent = `${label} · ${linkStatusText(channel.status)}${detail}`;
  // 三列布局下诊断码会被省略号截断，完整文案挂到统一 tooltip 上。
  status.dataset.tip = text.textContent;
  status.append(dot, text);
  return status;
}

function linkStatusText(status: DesignerHostLinkStatus): string {
  if (status === 'ready') return DESIGNER_UI_TEXT.dataSource.linkReady;
  if (status === 'loading') return DESIGNER_UI_TEXT.dataSource.linkLoading;
  if (status === 'error') return DESIGNER_UI_TEXT.dataSource.linkError;
  return DESIGNER_UI_TEXT.dataSource.linkUnavailable;
}

/**
 * 检查器里浮层开着、但还没选中数据集时，面板背后的占位。
 *
 * 不能沿用「目录列表」：目录已经在浮层里，面板再渲染一份就是同一个列表出现两次。
 * 这里只留一句结论 + 一个重新打开浮层的入口（浮层被 Esc 关掉后不至于无路可走）。
 */
export function renderDatasetPickerPlaceholder(
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const placeholder = ownerDocument.createElement('section');
  placeholder.className = 'designer-dataset-browser designer-dataset-picker-placeholder';
  placeholder.dataset.dsSection = 'source';
  placeholder.dataset.datasetPickerPlaceholder = 'true';
  placeholder.dataset.inspectorSearchSection = 'true';
  placeholder.dataset.inspectorSearchText = DESIGNER_UI_TEXT.dataset.select;
  const empty = ownerDocument.createElement('p');
  empty.className = 'designer-empty-state';
  empty.textContent = DESIGNER_UI_TEXT.dataSource.pickerPlaceholder;
  const open = createDesignerButton(ownerDocument, {
    text: DESIGNER_UI_TEXT.dataSource.sourceChange,
  });
  open.dataset.datasetChange = 'true';
  placeholder.append(empty, open);
  return placeholder;
}

export function renderDatasetCatalog(options: DesignerDataSourcePanelOptions): HTMLElement {
  const browser = options.panel.ownerDocument.createElement('section');
  browser.className = 'designer-dataset-browser';
  // 目录与配置共用一个 `source` 段（两者互斥）：段 key 是 `source`，不是 `catalog`。
  // 写成 `catalog` 会让 `findSection('source')` 找不到节点 → 每次同步都新建 ← 搜索框被换掉。
  browser.dataset.dsSection = 'source';
  browser.dataset.inspectorSearchSection = 'true';
  browser.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataset.select,
    DESIGNER_UI_TEXT.dataset.search,
    ...options.items.flatMap((item) => [item.name, item.description ?? '']),
  ].join(' ');
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataset.select;
  const search = createDesignerInput(options.panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.search,
    placeholder: DESIGNER_UI_TEXT.dataset.search,
    type: 'search',
    value: options.query,
  });
  search.dataset.datasetQuery = 'true';
  browser.append(heading);
  const groupSelect = renderDatasetGroupSelect(options);
  if (groupSelect !== undefined) browser.appendChild(groupSelect);
  browser.append(search, renderDatasetCatalogResults(options));
  return browser;
}

/**
 * 宿主分组过滤：两处目录（工作台内联列表 / 检查器来源浮层）共用一份构造。
 * 宿主没有分组时不渲染——空下拉比没有下拉更让人困惑。
 */
export function renderDatasetGroupSelect(
  options: DesignerDataSourcePanelOptions,
): HTMLElement | undefined {
  if (options.groups === undefined || options.groups.length === 0) return undefined;
  const ownerDocument = options.panel.ownerDocument;
  const currentGroup = options.groupId ?? '';
  const groups = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.group,
    className: 'designer-source-sheet-group',
    options: [
      { label: DESIGNER_UI_TEXT.dataset.allGroups, selected: currentGroup === '', value: '' },
      ...options.groups.map((group) => ({
        label: group.name,
        selected: group.id === currentGroup,
        value: group.id,
      })),
    ],
    value: currentGroup,
  });
  groups.dataset.datasetGroup = 'true';
  return enhanceDesignerSelect(groups).element;
}

/**
 * 目录结果区独立渲染：宿主请求回包只换这一块，不重建整块面板
 * （否则搜索框节点被替换，输入焦点、光标和输入法组合状态一起丢失）。
 */
export function renderDatasetCatalogResults(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const results = ownerDocument.createElement('div');
  results.className = 'designer-dataset-list';
  results.dataset.datasetResults = 'true';
  const empty = resolveDatasetCatalogEmpty(options);
  if (empty === undefined) {
    for (const item of options.items) {
      results.appendChild(datasetItem(ownerDocument, item, options.descriptor));
    }
  } else {
    for (const line of catalogEmptyCopy(empty)) {
      // 复用空态样式：同一档虚线框里先说结论，需要时补一行宿主接洽指引。
      const message = ownerDocument.createElement('p');
      message.className = 'designer-empty-state';
      message.textContent = line;
      results.appendChild(message);
    }
  }
  if (options.cursor !== undefined) {
    const button = createDesignerButton(ownerDocument, {
      text: DESIGNER_UI_TEXT.dataset.loadMore,
    });
    button.dataset.datasetLoadMore = 'true';
    results.appendChild(button);
  }
  return results;
}

export type DesignerDatasetCatalogEmpty = 'unavailable' | 'no-match' | 'empty';

/**
 * 目录为空的真实原因：宿主没接目录、接了但没数据、还是搜索没命中。
 * 三者在真实宿主的接洽失败排查里含义完全不同，不能都显示「没有可用数据集」。
 */
export function resolveDatasetCatalogEmpty(
  options: Pick<DesignerDataSourcePanelOptions, 'catalogAvailable' | 'items' | 'query'>,
): DesignerDatasetCatalogEmpty | undefined {
  if (options.items.length > 0) return undefined;
  if (!options.catalogAvailable) return 'unavailable';
  return options.query.trim() === '' ? 'empty' : 'no-match';
}

function catalogEmptyCopy(empty: DesignerDatasetCatalogEmpty): readonly string[] {
  if (empty === 'unavailable') {
    return [DESIGNER_UI_TEXT.dataset.unavailable, DESIGNER_UI_TEXT.dataset.unavailableHint];
  }
  return [empty === 'no-match' ? DESIGNER_UI_TEXT.dataset.noMatch : DESIGNER_UI_TEXT.dataset.empty];
}

function datasetItem(
  ownerDocument: Document,
  item: ScreenDatasetEntry,
  selected: DesignerDataSourcePanelOptions['descriptor'],
): HTMLButtonElement {
  const current = selected?.datasetId === item.datasetId;
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: item.description === null ? item.name : item.name + '：' + item.description,
    className: 'designer-dataset-item',
    pressed: current,
  });
  button.dataset.datasetResourceId = item.datasetId;
  // 设计稿 .catalog-item：图标列 + 三行文案（名称 / key / 描述）+ 右侧动作。
  // 名称行带「当前」标记是必要的：列表里点过项之后，光看高亮分不清是 hover 还是已绑定。
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'designer-dataset-item-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon('table');
  const content = ownerDocument.createElement('span');
  content.className = 'designer-dataset-item-copy';
  const nameLine = ownerDocument.createElement('span');
  nameLine.className = 'designer-dataset-item-name-line';
  const name = ownerDocument.createElement('strong');
  name.textContent = item.name;
  nameLine.appendChild(name);
  if (current) {
    const tag = ownerDocument.createElement('span');
    tag.className = 'designer-dataset-item-current';
    tag.textContent = DESIGNER_UI_TEXT.dataset.currentTag;
    nameLine.appendChild(tag);
  }
  const key = ownerDocument.createElement('small');
  key.className = 'designer-dataset-item-key';
  key.textContent = item.datasetId;
  content.append(nameLine, key);
  if (item.description !== null && item.description.length > 0) {
    const description = ownerDocument.createElement('small');
    description.className = 'designer-dataset-item-description';
    description.textContent = item.description;
    content.appendChild(description);
  }
  const action = ownerDocument.createElement('span');
  action.className = 'designer-dataset-item-action';
  action.textContent = current ? '' : DESIGNER_UI_TEXT.dataset.use;
  button.append(glyph, content, action);
  return button;
}

import type { ScreenDatasetEntry } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { createDesignerInput, createDesignerSelect } from '../designer-ui-primitives.js';
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
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.hostConnection;
  const statuses = ownerDocument.createElement('div');
  statuses.className = 'designer-host-connection-statuses';
  statuses.append(
    connectionStatus(
      ownerDocument,
      DESIGNER_UI_TEXT.dataSource.datasetCatalog,
      options.link.catalog,
    ),
    connectionStatus(ownerDocument, DESIGNER_UI_TEXT.dataSource.dataQuery, options.link.query),
    connectionStatus(
      ownerDocument,
      DESIGNER_UI_TEXT.dataSource.variablesChannel,
      options.link.variables,
    ),
  );
  connection.append(heading, statuses);
  // 三条通道都没接上时给出接入方式，而不是只留三个灰点让人猜。
  if (hasUnavailableLink(options.link)) {
    const hint = ownerDocument.createElement('p');
    hint.className = 'designer-host-connection-hint';
    hint.textContent = DESIGNER_UI_TEXT.dataSource.linkUnavailableHint;
    connection.appendChild(hint);
  }
  if (hasFailedLink(options.link)) {
    const retry = ownerDocument.createElement('button');
    retry.type = 'button';
    retry.className = 'designer-control designer-button';
    retry.dataset.datasetAction = 'retry-link';
    retry.textContent = DESIGNER_UI_TEXT.dataSource.linkRetry;
    connection.appendChild(retry);
  }
  return connection;
}

function hasUnavailableLink(link: DesignerHostLinkView): boolean {
  return [link.catalog, link.query, link.variables].every(
    (channel) => channel.status === 'unavailable',
  );
}

function hasFailedLink(link: DesignerHostLinkView): boolean {
  return [link.catalog, link.query, link.variables].some((channel) => channel.status === 'error');
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

export function renderDatasetCatalog(options: DesignerDataSourcePanelOptions): HTMLElement {
  const browser = options.panel.ownerDocument.createElement('section');
  browser.className = 'designer-dataset-browser';
  browser.dataset.dsSection = 'catalog';
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
  if (options.groups !== undefined && options.groups.length > 0) {
    const currentGroup = options.groupId ?? '';
    const groups = createDesignerSelect(options.panel.ownerDocument, {
      ariaLabel: DESIGNER_UI_TEXT.dataset.group,
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
    browser.appendChild(enhanceDesignerSelect(groups).element);
  }
  browser.append(search, renderDatasetCatalogResults(options));
  return browser;
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
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.datasetLoadMore = 'true';
    button.textContent = DESIGNER_UI_TEXT.dataset.loadMore;
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
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-dataset-item';
  button.dataset.datasetResourceId = item.datasetId;
  button.setAttribute('aria-pressed', String(selected?.datasetId === item.datasetId));
  button.setAttribute(
    'aria-label',
    item.description === null ? item.name : item.name + '：' + item.description,
  );
  const content = ownerDocument.createElement('span');
  const name = ownerDocument.createElement('strong');
  name.textContent = item.name;
  const summary = ownerDocument.createElement('small');
  summary.textContent = item.description ?? '';
  content.append(name, summary);
  const select = ownerDocument.createElement('span');
  select.className = 'designer-dataset-item-action';
  select.textContent = DESIGNER_UI_TEXT.dataset.use;
  button.append(content, select);
  return button;
}

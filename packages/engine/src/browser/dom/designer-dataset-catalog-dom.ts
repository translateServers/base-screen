import type { ScreenDatasetSummary } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourcePanelOptions } from './designer-dataset-types.js';

export function renderHostConnection(options: DesignerDataSourcePanelOptions): HTMLElement {
  const connection = options.panel.ownerDocument.createElement('section');
  connection.className = 'designer-host-connection';
  connection.dataset.inspectorSearchSection = 'true';
  connection.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataSource.hostConnection,
    DESIGNER_UI_TEXT.dataSource.datasetCatalog,
    DESIGNER_UI_TEXT.dataSource.dataQuery,
  ].join(' ');
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.hostConnection;
  const statuses = options.panel.ownerDocument.createElement('div');
  statuses.className = 'designer-host-connection-statuses';
  statuses.append(
    connectionStatus(
      options.panel.ownerDocument,
      DESIGNER_UI_TEXT.dataSource.datasetCatalog,
      options.catalogAvailable,
    ),
    connectionStatus(
      options.panel.ownerDocument,
      DESIGNER_UI_TEXT.dataSource.dataQuery,
      options.resourceAvailable,
    ),
  );
  connection.append(heading, statuses);
  return connection;
}

function connectionStatus(ownerDocument: Document, label: string, connected: boolean): HTMLElement {
  const status = ownerDocument.createElement('span');
  status.className = 'designer-host-connection-status';
  status.dataset.connected = String(connected);
  const dot = ownerDocument.createElement('i');
  dot.setAttribute('aria-hidden', 'true');
  const text = ownerDocument.createElement('span');
  text.textContent = `${label} · ${
    connected ? DESIGNER_UI_TEXT.dataSource.connected : DESIGNER_UI_TEXT.dataSource.disconnected
  }`;
  status.append(dot, text);
  return status;
}

export function renderDatasetCatalog(options: DesignerDataSourcePanelOptions): HTMLElement {
  const browser = options.panel.ownerDocument.createElement('section');
  browser.className = 'designer-dataset-browser';
  browser.dataset.inspectorSearchSection = 'true';
  browser.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataset.select,
    DESIGNER_UI_TEXT.dataset.search,
    ...options.items.flatMap((item) => [item.name, item.description ?? '']),
  ].join(' ');
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataset.select;
  const search = options.panel.ownerDocument.createElement('input');
  search.type = 'search';
  search.className = 'designer-control designer-input';
  search.dataset.datasetQuery = 'true';
  search.placeholder = DESIGNER_UI_TEXT.dataset.search;
  search.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.search);
  search.value = options.query;
  const results = options.panel.ownerDocument.createElement('div');
  results.className = 'designer-dataset-list';
  results.dataset.datasetResults = 'true';
  if (options.items.length === 0) {
    const empty = options.panel.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.empty;
    results.appendChild(empty);
  }
  for (const item of options.items) {
    results.appendChild(datasetItem(options.panel.ownerDocument, item, options.descriptor));
  }
  if (options.cursor !== undefined) {
    const button = options.panel.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.datasetLoadMore = 'true';
    button.textContent = DESIGNER_UI_TEXT.dataset.loadMore;
    results.appendChild(button);
  }
  browser.append(heading, search, results);
  return browser;
}

function datasetItem(
  ownerDocument: Document,
  item: ScreenDatasetSummary,
  selected: DesignerDataSourcePanelOptions['descriptor'],
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-dataset-item';
  button.dataset.datasetResourceId = item.resourceId;
  button.dataset.datasetResourceType = item.resourceType;
  button.setAttribute('aria-pressed', String(selected?.resourceId === item.resourceId));
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

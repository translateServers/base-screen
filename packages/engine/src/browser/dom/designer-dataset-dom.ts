import type { ScreenDatasetSummary } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { renderDesignerDatasetConfiguration } from './designer-dataset-config-dom.js';
import type {
  DesignerDataSourceMode,
  DesignerDataSourcePanelOptions,
  DesignerDatasetDraftView,
} from './designer-dataset-types.js';

export type {
  DesignerDataSourceMode,
  DesignerDataSourcePanelOptions,
  DesignerDatasetDraftView,
} from './designer-dataset-types.js';

export interface DesignerDataSourcePanelSurface {
  readonly feedback: HTMLElement;
}

export function renderDesignerDataSourcePanel(
  options: DesignerDataSourcePanelOptions,
): DesignerDataSourcePanelSurface {
  const { panel } = options;
  panel.replaceChildren();
  const section = panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-panel';
  section.dataset.dataSourcePanel = 'true';
  section.appendChild(renderSourceMode(options));

  if (options.mode === 'static') section.appendChild(renderStaticSource(options));
  if (options.mode === 'dataset') section.appendChild(renderDatasetSource(options));
  if (options.mode === 'none') section.appendChild(renderEmptySource(panel.ownerDocument));

  const feedback = panel.ownerDocument.createElement('p');
  feedback.className = 'designer-data-source-feedback';
  feedback.dataset.datasetFeedback = 'true';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.textContent = options.feedback;
  section.appendChild(feedback);
  panel.appendChild(section);
  return { feedback };
}

function renderSourceMode(options: DesignerDataSourcePanelOptions): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-type';
  const heading = options.panel.ownerDocument.createElement('h3');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.title;
  const modes = options.panel.ownerDocument.createElement('div');
  modes.className = 'designer-data-source-segmented';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.title);
  for (const mode of options.availableModes) {
    const button = options.panel.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.dataSourceMode = mode;
    button.setAttribute('aria-pressed', String(options.mode === mode));
    button.textContent = DESIGNER_UI_TEXT.dataSource.mode(mode);
    modes.appendChild(button);
  }
  section.append(heading, modes);
  return section;
}

function renderEmptySource(ownerDocument: Document): HTMLElement {
  const empty = ownerDocument.createElement('div');
  empty.className = 'designer-data-source-empty';
  const text = ownerDocument.createElement('p');
  text.textContent = DESIGNER_UI_TEXT.dataSource.noneSelected;
  empty.append(text, renderApplyAction(ownerDocument, 'none'));
  return empty;
}

function renderStaticSource(options: DesignerDataSourcePanelOptions): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-editor';
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticTitle;
  const label = options.panel.ownerDocument.createElement('label');
  label.className = 'designer-field designer-data-source-static';
  const labelText = options.panel.ownerDocument.createElement('span');
  labelText.className = 'designer-field-label';
  labelText.textContent = DESIGNER_UI_TEXT.dataSource.staticValue;
  const textarea = options.panel.ownerDocument.createElement('textarea');
  textarea.className = 'designer-control designer-textarea';
  textarea.dataset.dataSourceStatic = 'true';
  textarea.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.staticValue);
  textarea.value = options.staticDraft;
  label.append(labelText, textarea);
  section.append(heading, label, renderApplyAction(section.ownerDocument, 'static'));
  return section;
}

function renderDatasetSource(options: DesignerDataSourcePanelOptions): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-dataset-section';
  section.dataset.datasetSection = 'true';
  section.appendChild(renderHostConnection(options));
  if (options.catalogOpen || options.descriptor === undefined) {
    section.appendChild(renderDatasetCatalog(options));
  }
  if (options.descriptor !== undefined && !options.catalogOpen) {
    section.appendChild(
      renderDesignerDatasetConfiguration({
        panel: options.panel,
        descriptor: options.descriptor,
        draft: options.draft,
        roles: options.roles,
        variableNames: options.variableNames,
        resourceAvailable: options.resourceAvailable,
      }),
    );
  }
  return section;
}

function renderHostConnection(options: DesignerDataSourcePanelOptions): HTMLElement {
  const connection = options.panel.ownerDocument.createElement('section');
  connection.className = 'designer-host-connection';
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

function renderDatasetCatalog(options: DesignerDataSourcePanelOptions): HTMLElement {
  const browser = options.panel.ownerDocument.createElement('section');
  browser.className = 'designer-dataset-browser';
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

function renderApplyAction(
  ownerDocument: Document,
  mode: Exclude<DesignerDataSourceMode, 'dataset'>,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = 'apply';
  button.dataset.variant = 'primary';
  button.textContent = DESIGNER_UI_TEXT.dataSource.apply(mode);
  actions.appendChild(button);
  return actions;
}

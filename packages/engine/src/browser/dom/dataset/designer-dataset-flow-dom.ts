import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type DesignerStaticDataView,
  renderDesignerStaticData,
  renderDesignerStaticDataMapping,
  renderDesignerStaticDataPreview,
} from '../static-data/designer-static-data-dom.js';
import { renderDatasetAuthoring } from './designer-dataset-authoring-dom.js';
import { renderDatasetCatalog, renderHostConnection } from './designer-dataset-catalog-dom.js';
import { renderDesignerDatasetConfiguration } from './designer-dataset-config-dom.js';
import { renderDatasetPreview } from './designer-dataset-preview-dom.js';
import { datasetAction, renderApplyAction } from './designer-dataset-primitives.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetWorkbenchStep,
} from './designer-dataset-types.js';

function renderSourceMode(options: DesignerDataSourcePanelOptions): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-type';
  section.dataset.workbenchSection = 'source';
  section.tabIndex = -1;
  const heading = options.panel.ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.title;
  const field = options.panel.ownerDocument.createElement('label');
  field.className = 'designer-field designer-field-label designer-data-source-type-field';
  const caption = options.panel.ownerDocument.createElement('span');
  caption.textContent = DESIGNER_UI_TEXT.dataSource.type;
  const select = options.panel.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.dataSourceModeSelect = 'true';
  select.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.type);
  for (const mode of options.availableModes) {
    const option = options.panel.ownerDocument.createElement('option');
    option.value = mode;
    option.selected = options.mode === mode;
    option.textContent = DESIGNER_UI_TEXT.dataSource.mode(mode);
    select.appendChild(option);
  }
  field.append(caption, select);
  section.append(heading, field);
  return section;
}

function renderEmptySource(ownerDocument: Document): HTMLElement {
  const empty = ownerDocument.createElement('div');
  empty.className = 'designer-data-source-empty';
  const text = ownerDocument.createElement('p');
  text.textContent = DESIGNER_UI_TEXT.dataSource.noneSelected;
  empty.appendChild(text);
  return empty;
}

function renderStaticSource(options: DesignerDataSourcePanelOptions): HTMLElement {
  return renderDesignerStaticData(staticDataView(options));
}

function renderVariableSource(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-data-source-variable';
  const field = ownerDocument.createElement('label');
  field.className = 'designer-field designer-field-label';
  const caption = ownerDocument.createElement('span');
  caption.textContent = DESIGNER_UI_TEXT.dataset.selectVariable;
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.dataVariableSource = 'true';
  const empty = ownerDocument.createElement('option');
  empty.value = '';
  empty.textContent = DESIGNER_UI_TEXT.dataset.selectVariable;
  select.appendChild(empty);
  for (const variable of options.variables) {
    const option = ownerDocument.createElement('option');
    option.value = variable.id;
    option.textContent = variable.name;
    option.selected = variable.id === options.variableSourceId;
    select.appendChild(option);
  }
  field.append(caption, select);
  section.append(field, renderApplyAction(ownerDocument, 'variable'));
  return section;
}

function staticDataView(options: DesignerDataSourcePanelOptions): DesignerStaticDataView {
  return {
    ownerDocument: options.panel.ownerDocument,
    descriptor: options.staticDescriptor,
    value: options.staticValue,
    binding: options.staticBinding,
    jsonDraft: options.staticDraft,
    tab: options.staticTab,
    page: options.staticPage,
    pageSize: options.staticPageSize,
    roles: options.roles,
    scrollScope: options.scrollScope,
  };
}

export function renderDataSourceFlow(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-dataset-section designer-datav-data-flow';
  section.dataset.datasetSection = 'true';
  section.dataset.dataFlowLayout = 'continuous';
  section.dataset.inspectorSearchSection = 'true';
  if (options.mode === 'host-resource') {
    const content = ownerDocument.createElement('div');
    content.className = 'designer-datav-data-flow-content';
    content.dataset.designerScrollScope = `data-source:${options.scrollScope}`;
    const summary = ownerDocument.createElement('p');
    summary.className = 'designer-data-source-empty';
    summary.dataset.hostResourceSummary = 'true';
    summary.textContent =
      options.hostResource === undefined
        ? DESIGNER_UI_TEXT.dataSource.hostResourceManaged
        : DESIGNER_UI_TEXT.dataSource.hostResourceSummary(
            options.hostResource.resourceType,
            options.hostResource.resourceId,
          );
    content.append(renderSourceMode(options), summary);
    section.appendChild(content);
    return section;
  }
  const activeStep = inlineWorkbenchStep(options.activeStep);
  section.dataset.activeStep = activeStep;
  const mappedFields = Object.values(options.draft?.fields ?? {}).flat().length;
  const staticMappedFields = Object.values(options.staticBinding?.fields ?? {}).flat().length;
  const sourceState =
    options.mode === 'none'
      ? 'pending'
      : options.mode === 'dataset' && !options.resourceAvailable
        ? 'error'
        : 'ready';
  const mappingCount = options.mode === 'static' ? staticMappedFields : mappedFields;
  const source = renderDatasetSummaryStep(
    options,
    1,
    DESIGNER_UI_TEXT.dataSource.setupSourceStep,
    sourceStepDetail(options),
    'source',
    sourceState,
  );
  source.dataset.dataStepDock = 'source';
  const mapping = renderDatasetSummaryStep(
    options,
    2,
    DESIGNER_UI_TEXT.dataSource.mappingStep,
    DESIGNER_UI_TEXT.dataSource.mappingSummary(mappingCount),
    'mapping',
    mappingCount > 0 ? 'ready' : 'pending',
  );
  mapping.dataset.dataStepDock = 'mapping';
  const response = renderDatasetSummaryStep(
    options,
    3,
    DESIGNER_UI_TEXT.dataSource.responseTitle,
    options.preview.message || DESIGNER_UI_TEXT.dataSource.responseUnavailable,
    'preview',
    options.preview.status === 'ready'
      ? 'ready'
      : options.preview.status === 'error'
        ? 'error'
        : 'pending',
  );
  response.dataset.dataStepDock = 'preview';

  const progress = ownerDocument.createElement('nav');
  progress.className = 'designer-datav-data-flow-progress';
  progress.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.configurationFlow);
  progress.append(source, mapping, response);

  const content = ownerDocument.createElement('div');
  content.className = 'designer-datav-data-flow-content';
  content.dataset.designerScrollScope = `data-source:${options.scrollScope}`;
  renderContinuousDataFlow(content, options);

  section.append(progress, content);
  return section;
}

function renderContinuousDataFlow(
  content: HTMLElement,
  options: DesignerDataSourcePanelOptions,
): void {
  content.appendChild(renderSourceMode(options));
  if (options.mode === 'none') {
    content.append(
      renderEmptySource(content.ownerDocument),
      renderApplyAction(content.ownerDocument, 'none'),
    );
    return;
  }
  if (options.mode === 'static') {
    renderContinuousStaticDataFlow(content, options);
    return;
  }
  if (options.mode === 'variable') {
    content.appendChild(renderVariableSource(options));
    return;
  }
  if (options.catalogOpen || options.descriptor === undefined) {
    content.append(renderHostConnection(options), renderDatasetCatalog(options));
    return;
  }
  const configuration = renderDesignerDatasetConfiguration({
    panel: options.panel,
    descriptor: options.descriptor,
    draft: options.draft,
    roles: options.roles,
    variables: options.variables,
    resourceAvailable: options.resourceAvailable,
  });
  const applyActions = configuration.querySelector<HTMLElement>('.designer-dataset-actions');
  applyActions?.querySelector('[data-dataset-action="refresh"]')?.remove();
  applyActions?.remove();
  const advanced = renderDatasetAuthoring(options);
  advanced.classList.add('designer-datav-advanced-settings');
  advanced.dataset.workbenchSection = 'refresh';
  advanced.tabIndex = -1;
  const advancedHeading = advanced.querySelector<HTMLElement>('.designer-inspector-section-title');
  if (advancedHeading !== null) {
    advancedHeading.textContent = DESIGNER_UI_TEXT.dataSource.advancedSettings;
  }
  content.append(
    configuration,
    renderDatasetPreviewActions(content.ownerDocument, options),
    renderDatasetPreview(content.ownerDocument, options),
    advanced,
  );
  if (applyActions !== null) content.appendChild(applyActions);
}

function renderContinuousStaticDataFlow(
  content: HTMLElement,
  options: DesignerDataSourcePanelOptions,
): void {
  const view = staticDataView(options);
  const source = renderStaticSource(options);
  for (const actions of source.querySelectorAll<HTMLElement>('.designer-dataset-actions')) {
    actions.remove();
  }
  content.appendChild(source);
  if (options.staticDescriptor?.kind === 'tabular') {
    const mapping = renderDesignerStaticDataMapping(view);
    mapping.dataset.workbenchSection = 'mapping';
    mapping.tabIndex = -1;
    for (const actions of mapping.querySelectorAll<HTMLElement>('.designer-dataset-actions')) {
      actions.remove();
    }
    const preview = renderDesignerStaticDataPreview(view);
    preview.tabIndex = -1;
    content.append(mapping, preview);
  }
  content.appendChild(renderApplyAction(content.ownerDocument, 'static'));
}

function renderDatasetPreviewActions(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-datav-preview-actions';
  actions.append(
    datasetAction(
      ownerDocument,
      'test',
      options.preview.status === 'loading'
        ? DESIGNER_UI_TEXT.dataSource.testing
        : DESIGNER_UI_TEXT.dataSource.test,
      'primary',
      options.descriptor === undefined ||
        !options.resourceAvailable ||
        options.preview.status === 'loading',
    ),
    datasetAction(ownerDocument, 'refresh', DESIGNER_UI_TEXT.dataset.refresh),
  );
  return actions;
}

function sourceStepDetail(options: DesignerDataSourcePanelOptions): string {
  if (options.mode === 'dataset') {
    return options.descriptor?.name ?? DESIGNER_UI_TEXT.dataSource.notConfigured;
  }
  return DESIGNER_UI_TEXT.dataSource.mode(options.mode);
}

function inlineWorkbenchStep(step: DesignerDatasetWorkbenchStep): 'source' | 'mapping' | 'preview' {
  return step === 'mapping' || step === 'preview' ? step : 'source';
}

function renderDatasetSummaryStep(
  options: DesignerDataSourcePanelOptions,
  index: number,
  titleText: string,
  detailText: string,
  step: DesignerDatasetWorkbenchStep,
  state: 'ready' | 'pending' | 'error',
): HTMLButtonElement {
  const button = options.panel.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-data-summary-step';
  button.dataset.datasetAction = 'select-step';
  button.dataset.datasetWorkbenchTarget = step;
  button.setAttribute('aria-current', options.activeStep === step ? 'step' : 'false');
  button.dataset.state = state;
  button.setAttribute(
    'aria-label',
    `${DESIGNER_UI_TEXT.dataSource.summaryStep(index, titleText)} · ${detailText}`,
  );
  const marker = options.panel.ownerDocument.createElement('span');
  marker.className = 'designer-data-summary-step-marker';
  marker.textContent = String(index);
  const copy = options.panel.ownerDocument.createElement('span');
  copy.className = 'designer-data-summary-step-copy';
  const title = options.panel.ownerDocument.createElement('strong');
  title.textContent = titleText;
  const detail = options.panel.ownerDocument.createElement('small');
  detail.textContent = detailText;
  copy.append(title, detail);
  const disclosure = options.panel.ownerDocument.createElement('span');
  disclosure.className = 'designer-data-summary-step-disclosure';
  disclosure.setAttribute('aria-hidden', 'true');
  disclosure.textContent = '›';
  button.append(marker, copy, disclosure);
  return button;
}

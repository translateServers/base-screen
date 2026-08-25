import type { ScreenDatasetSummary } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { renderDesignerDatasetConfiguration } from './designer-dataset-config-dom.js';
import type {
  DesignerDataSourceMode,
  DesignerDataSourcePanelOptions,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetDraftView,
  DesignerDatasetEditorMode,
  DesignerDatasetPreviewTab,
  DesignerDatasetPreviewView,
  DesignerDatasetRefreshStrategy,
  DesignerDatasetWorkbenchStep,
} from './designer-dataset-types.js';
import {
  type DesignerStaticDataView,
  renderDesignerStaticData,
  renderDesignerStaticDataMapping,
  renderDesignerStaticDataPreview,
} from './designer-static-data-dom.js';

export type {
  DesignerDataSourceMode,
  DesignerDataSourcePanelOptions,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetDraftView,
  DesignerDatasetEditorMode,
  DesignerDatasetPreviewTab,
  DesignerDatasetPreviewView,
  DesignerDatasetRefreshStrategy,
  DesignerDatasetWorkbenchStep,
} from './designer-dataset-types.js';

export interface DesignerDataSourcePanelSurface {
  readonly feedback: HTMLElement;
}

const dataSourcePanelScrollScopes = new WeakMap<HTMLElement, string>();

export function renderDesignerDataSourcePanel(
  options: DesignerDataSourcePanelOptions,
): DesignerDataSourcePanelSurface {
  const { panel } = options;
  const previousContent = panel.querySelector<HTMLElement>('.designer-datav-data-flow-content');
  const previousScroll =
    previousContent === null
      ? undefined
      : { left: previousContent.scrollLeft, top: previousContent.scrollTop };
  const preservesScroll = dataSourcePanelScrollScopes.get(panel) === options.scrollScope;
  panel.replaceChildren();
  const section = panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-panel';
  section.dataset.dataSourcePanel = 'true';
  section.dataset.inspectorSearchSection = 'true';
  const flow = renderDataSourceFlow(options);
  section.appendChild(flow);

  const feedback = panel.ownerDocument.createElement('p');
  feedback.className = 'designer-data-source-feedback';
  feedback.dataset.datasetFeedback = 'true';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.textContent = options.feedback;
  const content = flow.querySelector<HTMLElement>('.designer-datav-data-flow-content');
  (content ?? section).appendChild(feedback);
  panel.appendChild(section);
  dataSourcePanelScrollScopes.set(panel, options.scrollScope);
  if (content !== null && previousScroll !== undefined && preservesScroll) {
    content.scrollLeft = previousScroll.left;
    content.scrollTop = previousScroll.top;
  }
  return { feedback };
}

export function renderDesignerDatasetWorkbench(
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const workbench = ownerDocument.createElement('div');
  workbench.className = 'designer-data-workbench-shell';
  workbench.dataset.datasetWorkbench = 'true';
  workbench.dataset.inspectorSearchSection = 'true';
  workbench.dataset.inspectorSearchText = [
    options.descriptor?.name ?? DESIGNER_UI_TEXT.dataSource.workbench,
    DESIGNER_UI_TEXT.dataSource.sourceStep,
    DESIGNER_UI_TEXT.dataSource.mappingStep,
    DESIGNER_UI_TEXT.dataSource.transformStep,
    DESIGNER_UI_TEXT.dataSource.previewStep,
    DESIGNER_UI_TEXT.dataSource.refreshStep,
  ].join(' ');
  const header = ownerDocument.createElement('header');
  header.className = 'designer-workbench-header';
  const heading = ownerDocument.createElement('div');
  heading.appendChild(
    datasetAction(ownerDocument, 'close-workbench', DESIGNER_UI_TEXT.dataSource.backToCanvas),
  );
  const identity = ownerDocument.createElement('span');
  identity.className = 'designer-workbench-identity';
  const title = ownerDocument.createElement('h3');
  title.textContent = options.descriptor?.name ?? DESIGNER_UI_TEXT.dataSource.workbench;
  const draft = ownerDocument.createElement('span');
  draft.className = 'designer-workbench-draft';
  draft.dataset.dirty = String(options.dirty);
  draft.textContent = options.dirty
    ? DESIGNER_UI_TEXT.dataSource.draft
    : DESIGNER_UI_TEXT.dataSource.synced;
  identity.append(title, draft);
  heading.appendChild(identity);
  const headerActions = ownerDocument.createElement('div');
  headerActions.className = 'designer-workbench-actions';
  headerActions.append(
    datasetAction(
      ownerDocument,
      'toggle-preview',
      options.preview.open
        ? DESIGNER_UI_TEXT.dataSource.previewClose
        : DESIGNER_UI_TEXT.dataSource.previewOpen,
      'preview-toggle',
    ),
    datasetAction(
      ownerDocument,
      'test',
      options.preview.status === 'loading'
        ? DESIGNER_UI_TEXT.dataSource.testing
        : DESIGNER_UI_TEXT.dataSource.test,
      undefined,
      options.descriptor === undefined ||
        !options.resourceAvailable ||
        options.preview.status === 'loading',
    ),
    datasetAction(
      ownerDocument,
      'apply',
      DESIGNER_UI_TEXT.dataSource.apply('dataset'),
      'primary',
      !options.dirty || options.descriptor === undefined || !options.resourceAvailable,
    ),
  );
  header.append(heading, headerActions);

  const closeConfirm = renderCloseConfirmation(ownerDocument, options.confirmClose);

  const steps = ownerDocument.createElement('nav');
  steps.className = 'designer-data-workbench-steps';
  steps.dataset.inspectorSearchSection = 'true';
  steps.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataSource.sourceStep,
    DESIGNER_UI_TEXT.dataSource.mappingStep,
    DESIGNER_UI_TEXT.dataSource.transformStep,
    DESIGNER_UI_TEXT.dataSource.previewStep,
    DESIGNER_UI_TEXT.dataSource.refreshStep,
  ].join(' ');
  steps.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.workbench);
  for (const [step, label, availability] of [
    ['source', DESIGNER_UI_TEXT.dataSource.sourceStep, 'available'],
    [
      'mapping',
      DESIGNER_UI_TEXT.dataSource.mappingStep,
      options.descriptor === undefined ? 'pending' : 'available',
    ],
    ['transform', DESIGNER_UI_TEXT.dataSource.transformStep, 'unavailable'],
    [
      'preview',
      DESIGNER_UI_TEXT.dataSource.previewStep,
      options.descriptor === undefined ? 'pending' : 'available',
    ],
    ['refresh', DESIGNER_UI_TEXT.dataSource.refreshStep, 'available'],
  ] as const) {
    const item = ownerDocument.createElement('button');
    item.type = 'button';
    item.dataset.workbenchStep = step;
    item.dataset.state =
      availability === 'available' && options.activeStep === step ? 'current' : availability;
    item.setAttribute('aria-current', options.activeStep === step ? 'step' : 'false');
    item.disabled = availability === 'pending' || availability === 'unavailable';
    item.textContent = label;
    steps.appendChild(item);
  }

  const editor = ownerDocument.createElement('main');
  editor.className = 'designer-static-data-content';
  editor.appendChild(renderHostConnection(options));
  if (options.catalogOpen || options.descriptor === undefined) {
    editor.appendChild(renderDatasetCatalog(options));
  } else {
    const configuration = renderDesignerDatasetConfiguration({
      panel: options.panel,
      descriptor: options.descriptor,
      draft: options.draft,
      roles: options.roles,
      variableNames: options.variableNames,
      resourceAvailable: options.resourceAvailable,
    });
    configuration.querySelector('.designer-dataset-actions')?.remove();
    editor.appendChild(configuration);
    editor.append(
      renderDatasetAuthoring(options),
      renderWorkbenchNotice(
        ownerDocument,
        'transform',
        DESIGNER_UI_TEXT.dataSource.transformStep,
        DESIGNER_UI_TEXT.dataSource.transformUnavailable,
      ),
      renderWorkbenchNotice(
        ownerDocument,
        'refresh',
        DESIGNER_UI_TEXT.dataSource.refreshStep,
        refreshStrategyNotice(options.authoring),
      ),
    );
  }

  const preview = renderDatasetPreview(ownerDocument, options);
  const body = ownerDocument.createElement('div');
  body.className = 'designer-data-workbench-grid';
  body.append(steps, editor, preview);

  workbench.dataset.kind = 'dataset';
  workbench.dataset.inspectorPane = 'data';
  workbench.append(header, closeConfirm, body);
  return workbench;
}

function renderSourceMode(options: DesignerDataSourcePanelOptions): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-type';
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
  empty.append(text, renderApplyAction(ownerDocument, 'none'));
  return empty;
}

function renderStaticSource(options: DesignerDataSourcePanelOptions): HTMLElement {
  return renderDesignerStaticData(staticDataView(options));
}

function staticDataView(options: DesignerDataSourcePanelOptions): DesignerStaticDataView {
  return {
    ownerDocument: options.panel.ownerDocument,
    descriptor: options.staticDescriptor,
    value: options.staticValue,
    binding: options.staticBinding,
    jsonDraft: options.staticDraft,
    dialogOpen: options.staticDialogOpen,
    tab: options.staticTab,
    page: options.staticPage,
    pasteDraft: options.staticPasteDraft,
    firstRowIsHeader: options.staticFirstRowIsHeader,
    roles: options.roles,
  };
}

function renderDataSourceFlow(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-dataset-section designer-datav-data-flow';
  section.dataset.datasetSection = 'true';
  section.dataset.inspectorSearchSection = 'true';
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

  const content = ownerDocument.createElement('div');
  content.className = 'designer-datav-data-flow-content';
  content.dataset.workbenchSection = activeStep;
  content.tabIndex = -1;
  renderInlineStep(content, options, activeStep);

  section.append(source, content, mapping, response);
  if (options.mode === 'dataset') {
    const footer = renderDatasetAuthoring(options, 'footer');
    footer.className += ' designer-datav-data-flow-footer';
    section.appendChild(footer);
  }
  return section;
}

function renderInlineStep(
  content: HTMLElement,
  options: DesignerDataSourcePanelOptions,
  activeStep: 'source' | 'mapping' | 'preview',
): void {
  if (activeStep === 'source') {
    content.appendChild(renderSourceMode(options));
    if (options.mode === 'none') {
      content.appendChild(renderEmptySource(content.ownerDocument));
      return;
    }
    if (options.mode === 'static') {
      content.appendChild(renderStaticSource(options));
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
      variableNames: options.variableNames,
      resourceAvailable: options.resourceAvailable,
    });
    configuration.querySelector('[data-workbench-section="mapping"]')?.remove();
    configuration.querySelector('.designer-dataset-actions')?.remove();
    content.append(configuration, renderDatasetAuthoring(options, 'editor'));
    return;
  }
  if (activeStep === 'mapping') {
    if (options.mode === 'static') {
      content.appendChild(renderDesignerStaticDataMapping(staticDataView(options)));
      return;
    }
    if (options.mode !== 'dataset' || options.descriptor === undefined) {
      content.appendChild(renderEmptySource(content.ownerDocument));
      return;
    }
    const configuration = renderDesignerDatasetConfiguration({
      panel: options.panel,
      descriptor: options.descriptor,
      draft: options.draft,
      roles: options.roles,
      variableNames: options.variableNames,
      resourceAvailable: options.resourceAvailable,
    });
    configuration.querySelector('[data-workbench-section="source"]')?.remove();
    configuration.querySelector('[data-workbench-section="parameters"]')?.remove();
    content.appendChild(configuration);
    return;
  }
  if (options.mode === 'static') {
    content.appendChild(renderDesignerStaticDataPreview(staticDataView(options)));
    return;
  }
  if (options.mode !== 'dataset') {
    content.appendChild(renderEmptySource(content.ownerDocument));
    return;
  }
  const actions = content.ownerDocument.createElement('div');
  actions.className = 'designer-datav-preview-actions';
  actions.append(
    datasetAction(
      content.ownerDocument,
      'test',
      options.preview.status === 'loading'
        ? DESIGNER_UI_TEXT.dataSource.testing
        : DESIGNER_UI_TEXT.dataSource.test,
      'primary',
      options.descriptor === undefined ||
        !options.resourceAvailable ||
        options.preview.status === 'loading',
    ),
    datasetAction(content.ownerDocument, 'refresh', DESIGNER_UI_TEXT.dataset.refresh),
  );
  content.append(actions, renderDatasetPreview(content.ownerDocument, options));
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

function renderDatasetAuthoring(
  options: DesignerDataSourcePanelOptions,
  part: 'all' | 'editor' | 'footer' = 'all',
): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-dataset-authoring';
  section.dataset.datasetAuthoring = 'true';
  section.dataset.authoringPart = part;
  section.dataset.inspectorSearchSection = 'true';
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.authoringTitle;

  const editor = options.panel.ownerDocument.createElement('div');
  editor.className = 'designer-dataset-editor-modes';
  editor.setAttribute('role', 'group');
  editor.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.authoringTitle);
  editor.append(
    authoringModeButton(options, 'visual', DESIGNER_UI_TEXT.dataSource.visualEditor),
    authoringModeButton(
      options,
      'code',
      DESIGNER_UI_TEXT.dataSource.codeEditor,
      'open-code-editor',
    ),
  );

  const filter = options.panel.ownerDocument.createElement('div');
  filter.className = 'designer-dataset-authoring-row';
  const filterStatus = options.panel.ownerDocument.createElement('span');
  filterStatus.className = 'designer-dataset-authoring-status';
  filterStatus.textContent = options.authoring.filterConfigured
    ? DESIGNER_UI_TEXT.dataSource.configured
    : DESIGNER_UI_TEXT.dataSource.filterUnset;
  filter.append(
    authoringLabel(
      options.panel.ownerDocument,
      DESIGNER_UI_TEXT.dataSource.filter,
      DESIGNER_UI_TEXT.dataSource.filterHint,
    ),
    filterStatus,
    authoringAction(
      options.panel.ownerDocument,
      'configure-filter',
      DESIGNER_UI_TEXT.dataSource.filterConfigure,
    ),
  );

  const settings = options.panel.ownerDocument.createElement('div');
  settings.className = 'designer-dataset-authoring-settings';
  settings.append(
    authoringCheckbox(
      options,
      'loadingDisabled',
      DESIGNER_UI_TEXT.dataSource.loadingState,
      options.authoring.loadingDisabled,
    ),
    authoringCheckbox(
      options,
      'controlled',
      DESIGNER_UI_TEXT.dataSource.controlledMode,
      options.authoring.controlled,
    ),
    authoringRefreshControls(options),
  );

  const actions = options.panel.ownerDocument.createElement('div');
  actions.className = 'designer-dataset-authoring-actions';
  actions.appendChild(
    authoringAction(options.panel.ownerDocument, 'copy-data', DESIGNER_UI_TEXT.dataSource.copyData),
  );
  if (part !== 'footer') {
    actions.appendChild(
      authoringAction(
        options.panel.ownerDocument,
        'fullscreen-edit',
        DESIGNER_UI_TEXT.dataSource.fullscreenEdit,
      ),
    );
  }
  if (part !== 'footer') section.append(heading, editor, filter, actions);
  if (part !== 'editor') section.appendChild(settings);
  return section;
}

function authoringModeButton(
  options: DesignerDataSourcePanelOptions,
  mode: DesignerDatasetEditorMode,
  label: string,
  action?: DesignerDatasetAuthoringAction,
): HTMLButtonElement {
  const button = options.panel.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetEditorMode = mode;
  if (action !== undefined) button.dataset.datasetAuthoringAction = action;
  button.setAttribute('aria-pressed', String(options.authoring.editorMode === mode));
  button.textContent = label;
  return button;
}

function authoringAction(
  ownerDocument: Document,
  action: DesignerDatasetAuthoringAction,
  label: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAuthoringAction = action;
  if (action === 'copy-data' || action === 'fullscreen-edit') {
    button.classList.add('designer-icon-button', 'designer-dataset-authoring-icon-action');
    button.dataset.variant = 'ghost';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = designerIcon(action === 'copy-data' ? 'copy' : 'maximize');
  } else {
    button.textContent = label;
  }
  return button;
}

function authoringLabel(ownerDocument: Document, titleText: string, hint: string): HTMLElement {
  const label = ownerDocument.createElement('span');
  label.className = 'designer-dataset-authoring-label designer-field-label';
  label.textContent = titleText;
  label.title = hint;
  return label;
}

function authoringCheckbox(
  options: DesignerDataSourcePanelOptions,
  setting: 'loadingDisabled' | 'controlled',
  labelText: string,
  checked: boolean,
): HTMLLabelElement {
  const label = options.panel.ownerDocument.createElement('label');
  label.className = 'designer-dataset-authoring-checkbox designer-field-label';
  const input = options.panel.ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = 'designer-checkbox';
  input.checked = checked;
  input.value = String(checked);
  input.dataset.datasetAuthoringSetting = setting;
  label.append(input, options.panel.ownerDocument.createTextNode(labelText));
  return label;
}

function authoringRefreshControls(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-dataset-refresh-controls';
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.datasetAuthoringSetting = 'refreshStrategy';
  for (const [value, label] of [
    ['once', DESIGNER_UI_TEXT.dataSource.refreshOnce],
    ['manual', DESIGNER_UI_TEXT.dataSource.manualRefresh],
    ['auto', DESIGNER_UI_TEXT.dataSource.refreshAuto],
  ] as const satisfies readonly [DesignerDatasetRefreshStrategy, string][]) {
    const option = ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = options.authoring.refreshStrategy === value;
    select.appendChild(option);
  }
  const interval = ownerDocument.createElement('input');
  interval.type = 'number';
  interval.className = 'designer-control designer-number-input';
  interval.min = '1';
  interval.max = '3600';
  interval.step = '1';
  interval.value = String(options.authoring.refreshInterval);
  interval.disabled = options.authoring.refreshStrategy !== 'auto';
  interval.dataset.datasetAuthoringSetting = 'refreshInterval';
  interval.title = DESIGNER_UI_TEXT.dataSource.refreshInterval;
  const unit = ownerDocument.createElement('span');
  unit.textContent = DESIGNER_UI_TEXT.dataSource.refreshInterval;
  wrap.append(select, interval, unit);
  return wrap;
}

function refreshStrategyNotice(authoring: DesignerDatasetAuthoringView): string {
  if (authoring.refreshStrategy === 'once') return DESIGNER_UI_TEXT.dataSource.refreshOnceNotice;
  if (authoring.refreshStrategy === 'auto') return DESIGNER_UI_TEXT.dataSource.refreshAutoNotice;
  return DESIGNER_UI_TEXT.dataSource.refreshManualNotice;
}

function datasetAction(
  ownerDocument: Document,
  action: string,
  label: string,
  variant?: string,
  disabled = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = action;
  if (variant !== undefined) button.dataset.variant = variant;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

function renderCloseConfirmation(ownerDocument: Document, visible: boolean): HTMLElement {
  const confirmation = ownerDocument.createElement('section');
  confirmation.className = 'designer-workbench-confirm';
  confirmation.hidden = !visible;
  confirmation.dataset.datasetDiscardConfirm = 'true';
  const copy = ownerDocument.createElement('span');
  const title = ownerDocument.createElement('strong');
  title.textContent = DESIGNER_UI_TEXT.dataSource.discardTitle;
  const detail = ownerDocument.createElement('small');
  detail.textContent = DESIGNER_UI_TEXT.dataSource.discardDetail;
  copy.append(title, detail);
  const actions = ownerDocument.createElement('span');
  actions.append(
    datasetAction(ownerDocument, 'keep-editing', DESIGNER_UI_TEXT.dataSource.keepEditing),
    datasetAction(
      ownerDocument,
      'discard-workbench',
      DESIGNER_UI_TEXT.dataSource.discard,
      'danger',
    ),
  );
  confirmation.append(copy, actions);
  return confirmation;
}

function renderWorkbenchNotice(
  ownerDocument: Document,
  step: string,
  titleText: string,
  detailText: string,
): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-dataset-config-section designer-data-workbench-notice';
  section.dataset.workbenchSection = step;
  section.dataset.inspectorSearchSection = 'true';
  section.dataset.inspectorSearchText = `${titleText} ${detailText}`;
  section.tabIndex = -1;
  const title = ownerDocument.createElement('h4');
  title.textContent = titleText;
  const detail = ownerDocument.createElement('p');
  detail.textContent = detailText;
  section.append(title, detail);
  return section;
}

function renderDatasetPreview(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const preview = ownerDocument.createElement('aside');
  preview.className = 'designer-data-workbench-preview';
  preview.dataset.workbenchSection = 'preview';
  preview.dataset.inspectorSearchSection = 'true';
  preview.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataSource.responseTitle,
    DESIGNER_UI_TEXT.dataSource.previewRaw,
    DESIGNER_UI_TEXT.dataSource.previewConsumer,
    DESIGNER_UI_TEXT.dataSource.previewRequest,
  ].join(' ');
  preview.tabIndex = -1;
  preview.dataset.open = String(options.preview.open);
  const header = ownerDocument.createElement('header');
  const title = ownerDocument.createElement('h4');
  title.textContent = DESIGNER_UI_TEXT.dataSource.responseTitle;
  const status = ownerDocument.createElement('span');
  status.dataset.status = options.preview.status;
  status.textContent = previewStatusText(options);
  header.append(title, status);
  const tabs = ownerDocument.createElement('div');
  tabs.className = 'designer-data-preview-tabs';
  tabs.setAttribute('role', 'tablist');
  for (const [tab, label] of [
    ['response', DESIGNER_UI_TEXT.dataSource.previewRaw],
    ['consumer', DESIGNER_UI_TEXT.dataSource.previewConsumer],
    ['request', DESIGNER_UI_TEXT.dataSource.previewRequest],
  ] as const) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.datasetPreviewTab = tab;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(options.preview.tab === tab));
    button.textContent = label;
    tabs.appendChild(button);
  }
  const content = ownerDocument.createElement('div');
  content.className = 'designer-data-preview-content';
  content.setAttribute('role', 'tabpanel');
  if (options.preview.status === 'loading') {
    content.appendChild(previewMessage(ownerDocument, DESIGNER_UI_TEXT.dataSource.previewLoading));
  } else if (options.preview.tab === 'request') {
    content.appendChild(
      renderJsonPreview(ownerDocument, {
        resourceType: options.draft?.resourceType,
        resourceId: options.draft?.resourceId,
        params: options.draft?.params,
        fields: options.draft?.fields,
      }),
    );
  } else {
    const value =
      options.preview.tab === 'response' ? options.preview.rawValue : options.preview.consumerValue;
    content.appendChild(
      value === undefined
        ? previewMessage(
            ownerDocument,
            options.preview.message || DESIGNER_UI_TEXT.dataSource.previewIdle,
          )
        : renderPreviewValue(ownerDocument, value),
    );
  }
  preview.append(header, tabs, content);
  return preview;
}

function previewStatusText(options: DesignerDataSourcePanelOptions): string {
  if (options.preview.status === 'loading') return DESIGNER_UI_TEXT.dataSource.testing;
  if (options.preview.message !== '') {
    return options.preview.testedAt === undefined
      ? options.preview.message
      : `${options.preview.message} · ${options.preview.testedAt}`;
  }
  return options.descriptor
    ? `${options.descriptor.fields.length} ${DESIGNER_UI_TEXT.dataset.fields}`
    : DESIGNER_UI_TEXT.dataSource.notConfigured;
}

function previewMessage(ownerDocument: Document, message: string): HTMLElement {
  const empty = ownerDocument.createElement('p');
  empty.className = 'designer-data-preview-empty';
  empty.textContent = message;
  return empty;
}

function renderPreviewValue(
  ownerDocument: Document,
  value: import('@base-screen/contracts').ScreenJsonValue,
): HTMLElement {
  const rows = previewRows(value);
  if (rows === undefined) return renderJsonPreview(ownerDocument, value);
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-data-preview-table-wrap';
  const table = ownerDocument.createElement('table');
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  const head = ownerDocument.createElement('thead');
  const headRow = ownerDocument.createElement('tr');
  for (const column of columns) {
    const cell = ownerDocument.createElement('th');
    cell.textContent = column;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = ownerDocument.createElement('tbody');
  for (const row of rows.slice(0, 20)) {
    const tableRow = ownerDocument.createElement('tr');
    for (const column of columns) {
      const cell = ownerDocument.createElement('td');
      const cellValue = row[column];
      cell.textContent =
        typeof cellValue === 'string' ? cellValue : JSON.stringify(cellValue ?? null);
      tableRow.appendChild(cell);
    }
    body.appendChild(tableRow);
  }
  table.append(head, body);
  wrap.appendChild(table);
  return wrap;
}

function previewRows(
  value: import('@base-screen/contracts').ScreenJsonValue,
):
  | readonly Readonly<Record<string, import('@base-screen/contracts').ScreenJsonValue>>[]
  | undefined {
  if (Array.isArray(value) && value.every(isPreviewObject)) return value;
  if (isPreviewObject(value) && Array.isArray(value.rows) && value.rows.every(isPreviewObject)) {
    return value.rows;
  }
  return undefined;
}

function isPreviewObject(
  value: import('@base-screen/contracts').ScreenJsonValue,
): value is Readonly<Record<string, import('@base-screen/contracts').ScreenJsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderJsonPreview(ownerDocument: Document, value: unknown): HTMLElement {
  const code = ownerDocument.createElement('pre');
  code.textContent = JSON.stringify(value, null, 2);
  return code;
}

function ownerDocumentOf(options: DesignerDataSourcePanelOptions): Document {
  return options.panel.ownerDocument;
}

function renderHostConnection(options: DesignerDataSourcePanelOptions): HTMLElement {
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

function renderDatasetCatalog(options: DesignerDataSourcePanelOptions): HTMLElement {
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

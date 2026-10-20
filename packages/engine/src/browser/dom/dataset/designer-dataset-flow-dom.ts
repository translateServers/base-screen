import type { ScreenDatasetDefinition } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerFieldRow } from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { createDesignerSelect } from '../designer-ui-primitives.js';
import {
  type DesignerStaticDataView,
  renderDesignerStaticData,
  renderDesignerStaticDataMapping,
  renderDesignerStaticDataPreview,
} from '../static-data/designer-static-data-dom.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
import { datasetAction, renderApplyAction } from './designer-dataset-primitives.js';
import {
  createDatasetSection,
  type DesignerDataSectionKey,
  renderDatasetApplyAction,
} from './designer-dataset-sections.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetWorkbenchStep,
} from './designer-dataset-types.js';

function renderSourceMode(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-data-source-type';
  section.dataset.workbenchSection = 'source';
  section.dataset.dsSection = 'mode';
  section.tabIndex = -1;
  const heading = ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.title;
  // 与检查器其余字段同一套行骨架（标签列 + 控件列 + 自绘下拉）：
  // 手写 label + 裸 select 会让这里的下拉长得和别处不一样，长标签也会撑成两行。
  const row = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.dataSource.type,
  });
  row.field.classList.add('designer-data-source-type-field');
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataSource.type,
    options: options.availableModes.map((mode) => ({
      label: DESIGNER_UI_TEXT.dataSource.mode(mode),
      selected: options.mode === mode,
      value: mode,
    })),
    value: options.mode,
  });
  select.dataset.dataSourceModeSelect = 'true';
  row.control.appendChild(enhanceDesignerSelect(select).element);
  section.append(heading, row.field);
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
  const row = createDesignerFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.dataset.selectVariable,
  });
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataset.selectVariable,
    options: [
      {
        label: DESIGNER_UI_TEXT.dataset.selectVariable,
        selected: options.variableSourceId === undefined,
        value: '',
      },
      ...options.variables.map((variable) => ({
        label: variable.name,
        selected: variable.id === options.variableSourceId,
        value: variable.id,
      })),
    ],
    value: options.variableSourceId ?? '',
  });
  select.dataset.dataVariableSource = 'true';
  row.control.appendChild(enhanceDesignerSelect(select).element);
  section.append(row.field, renderApplyAction(ownerDocument, 'variable'));
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
  // 段一律从工厂取：内联面板与工作台渲染同一批节点，拼装顺序只在这里和挂载层决定。
  content.append(
    section('host-link', options),
    ...(options.catalogOpen || options.descriptor === undefined
      ? [section('catalog', options)]
      : datasetModeSections(content.ownerDocument, options, options.descriptor)),
  );
}

function datasetModeSections(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
  descriptor: ScreenDatasetDefinition,
): readonly HTMLElement[] {
  const configuration = section('config', options);
  const advanced = section('authoring', options);
  advanced.classList.add('designer-datav-advanced-settings');
  advanced.dataset.workbenchSection = 'refresh';
  advanced.tabIndex = -1;
  const advancedHeading = advanced.querySelector<HTMLElement>('.designer-inspector-section-title');
  if (advancedHeading !== null) {
    advancedHeading.textContent = DESIGNER_UI_TEXT.dataSource.advancedSettings;
  }
  return [
    configuration,
    renderDatasetPreviewActions(ownerDocument, options),
    section('preview', options),
    advanced,
    renderDatasetApplyAction(
      ownerDocument,
      !options.resourceAvailable ||
        !isDesignerDatasetBindingValid(descriptor, options.draft, options.roles),
    ),
  ];
}

function section(
  key: DesignerDataSectionKey,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const element = createDatasetSection(key, options);
  if (element === undefined) throw new Error(`DATASET_SECTION_UNAVAILABLE:${key}`);
  return element;
}

function renderContinuousStaticDataFlow(
  content: HTMLElement,
  options: DesignerDataSourcePanelOptions,
): void {
  const view = staticDataView(options);
  content.appendChild(renderStaticSource(options));
  if (options.staticDescriptor?.kind === 'tabular') {
    const mapping = renderDesignerStaticDataMapping(view);
    mapping.dataset.workbenchSection = 'mapping';
    mapping.tabIndex = -1;
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

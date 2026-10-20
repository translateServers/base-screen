import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { renderDataPanelNoticeSlot } from './designer-data-panel-notice.js';
import { refreshStrategyNotice } from './designer-dataset-authoring-dom.js';
import { disposeDatasetSections } from './designer-dataset-config-dom.js';
import { renderDataSourceFlow } from './designer-dataset-flow-dom.js';
import { datasetAction } from './designer-dataset-primitives.js';
import { createDatasetSection } from './designer-dataset-sections.js';
import type { DesignerDataSourcePanelOptions } from './designer-dataset-types.js';

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

export function renderDesignerDataSourcePanel(
  options: DesignerDataSourcePanelOptions,
): DesignerDataSourcePanelSurface {
  const { panel } = options;
  // 整块重绘前先销毁段内挂载的取值选择器：浮层挂在段之外，不销毁就会留在 overlay 宿主上。
  disposeDatasetSections(panel);
  panel.replaceChildren();
  const section = panel.ownerDocument.createElement('section');
  section.className = 'designer-data-source-panel';
  section.dataset.dataSourcePanel = 'true';
  section.dataset.inspectorSearchSection = 'true';
  section.appendChild(renderDataPanelNoticeSlot(panel.ownerDocument, options.dataState));
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
  // 工作台与内联面板是同一份数据的两个投影：脏标记来自同一个 `options.dirty`。
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
  editor.dataset.designerScrollScope = `data-workbench-editor:${options.scrollScope}`;
  // 工作台与内联面板吃同一批 section 节点（工厂产出），这里只决定摆在第几列。
  editor.appendChild(requireSection('host-link', options));
  if (options.catalogOpen || options.descriptor === undefined) {
    editor.appendChild(requireSection('catalog', options));
  } else {
    editor.appendChild(requireSection('config', options));
    editor.append(
      requireSection('authoring', options),
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

  const preview = requireSection('preview', options);
  const body = ownerDocument.createElement('div');
  body.className = 'designer-data-workbench-grid';
  body.append(steps, editor, preview);

  workbench.dataset.kind = 'dataset';
  workbench.dataset.inspectorPane = 'data';
  workbench.append(header, closeConfirm, body);
  return workbench;
}

function requireSection(
  key: Parameters<typeof createDatasetSection>[0],
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const element = createDatasetSection(key, options);
  if (element === undefined) throw new Error(`DATASET_SECTION_UNAVAILABLE:${key}`);
  return element;
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

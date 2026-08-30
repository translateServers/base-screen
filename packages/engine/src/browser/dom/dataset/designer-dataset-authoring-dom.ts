import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetEditorMode,
  DesignerDatasetRefreshStrategy,
} from './designer-dataset-types.js';

export function renderDatasetAuthoring(
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
  settings.setAttribute('role', 'group');
  settings.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.advancedSettings);
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
  actions.append(
    authoringAction(
      options.panel.ownerDocument,
      'copy-data',
      DESIGNER_UI_TEXT.dataSource.copyData,
      options.preview.rawValue === undefined,
      DESIGNER_UI_TEXT.dataSource.copyDataHint,
    ),
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
  disabled = false,
  disabledHint?: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAuthoringAction = action;
  button.disabled = disabled;
  if (action === 'copy-data' || action === 'fullscreen-edit') {
    button.classList.add('designer-icon-button', 'designer-dataset-authoring-icon-action');
    button.dataset.variant = 'ghost';
    button.title = disabled && disabledHint !== undefined ? disabledHint : label;
    button.setAttribute(
      'aria-label',
      disabled && disabledHint !== undefined ? `${label} · ${disabledHint}` : label,
    );
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
  label.className = 'designer-dataset-authoring-checkbox';
  const input = options.panel.ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = 'designer-checkbox';
  input.checked = checked;
  input.value = String(checked);
  input.dataset.datasetAuthoringSetting = setting;
  const text = options.panel.ownerDocument.createElement('span');
  text.className = 'designer-dataset-authoring-setting-label';
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function authoringRefreshControls(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-dataset-refresh-controls';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.refreshStrategyLabel);
  const strategy = ownerDocument.createElement('label');
  strategy.className = 'designer-dataset-authoring-setting-row';
  const strategyLabel = ownerDocument.createElement('span');
  strategyLabel.className = 'designer-dataset-authoring-setting-label';
  strategyLabel.textContent = DESIGNER_UI_TEXT.dataSource.refreshStrategyLabel;
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.datasetAuthoringSetting = 'refreshStrategy';
  select.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.refreshStrategyLabel);
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
  strategy.append(strategyLabel, select);
  const intervalRow = ownerDocument.createElement('label');
  intervalRow.className = 'designer-dataset-authoring-setting-row';
  intervalRow.dataset.disabled = String(options.authoring.refreshStrategy !== 'auto');
  const intervalLabel = ownerDocument.createElement('span');
  intervalLabel.className = 'designer-dataset-authoring-setting-label';
  intervalLabel.textContent = DESIGNER_UI_TEXT.dataSource.refreshIntervalLabel;
  const intervalControl = ownerDocument.createElement('span');
  intervalControl.className = 'designer-dataset-refresh-interval-control';
  const interval = ownerDocument.createElement('input');
  interval.type = 'number';
  interval.className = 'designer-control designer-number-input';
  interval.min = '1';
  interval.max = '3600';
  interval.step = '1';
  interval.value = String(options.authoring.refreshInterval);
  interval.disabled = options.authoring.refreshStrategy !== 'auto';
  interval.dataset.datasetAuthoringSetting = 'refreshInterval';
  interval.setAttribute(
    'aria-label',
    `${DESIGNER_UI_TEXT.dataSource.refreshIntervalLabel} · ${DESIGNER_UI_TEXT.dataSource.refreshInterval}`,
  );
  const unit = ownerDocument.createElement('span');
  unit.textContent = DESIGNER_UI_TEXT.dataSource.refreshInterval;
  unit.setAttribute('aria-hidden', 'true');
  intervalControl.append(interval, unit);
  intervalRow.append(intervalLabel, intervalControl);
  wrap.append(strategy, intervalRow);
  return wrap;
}

export function refreshStrategyNotice(authoring: DesignerDatasetAuthoringView): string {
  if (authoring.refreshStrategy === 'once') return DESIGNER_UI_TEXT.dataSource.refreshOnceNotice;
  if (authoring.refreshStrategy === 'auto') return DESIGNER_UI_TEXT.dataSource.refreshAutoNotice;
  return DESIGNER_UI_TEXT.dataSource.refreshManualNotice;
}

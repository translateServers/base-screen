import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerToggleField } from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  createDesignerButton,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSegmented,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import { createDataGroup } from './designer-data-group-dom.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetRefreshStrategy,
} from './designer-dataset-types.js';

export function renderDatasetAuthoring(
  options: DesignerDataSourcePanelOptions,
  part: 'all' | 'editor' | 'footer' = 'all',
): HTMLElement {
  const section = options.panel.ownerDocument.createElement('section');
  section.className = 'designer-dataset-authoring';
  section.dataset.datasetAuthoring = 'true';
  section.dataset.dsSection = 'authoring';
  section.dataset.authoringPart = part;
  section.dataset.inspectorSearchSection = 'true';
  const heading = options.panel.ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.authoringTitle;

  const editor = createDesignerSegmented(options.panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataSource.authoringTitle,
    selected: options.authoring.editorMode,
    options: [
      {
        value: 'visual',
        label: DESIGNER_UI_TEXT.dataSource.visualEditor,
        dataset: { datasetEditorMode: 'visual' },
      },
      {
        value: 'code',
        label: DESIGNER_UI_TEXT.dataSource.codeEditor,
        dataset: {
          datasetAuthoringAction: 'open-code-editor',
          datasetEditorMode: 'code',
        },
      },
    ],
  }).element;

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
  // 按 surface 分叉：`updatePolicy` / `processorId` / `controlled` / `loadingDisabled` 都是
  // **实例级**字段，一个实例可能被多个组件引用——在组件 A 的检查器里就地改会静默改变组件 B
  // 的请求节奏。所以检查器只读 + 跳转，编辑只出现在工作台。判据：改它会影响别的组件 ⇒ 只读。
  //
  // 物料自有的 `editorDescriptor.data` 控件是**组件级、可编辑**，不得复用
  // `.designer-dataset-authoring-checkbox` / `-setting-row`，也不得放进本容器：
  // 断言的作用域就是这个容器，污染后「只读生效」会被物料侧控件伪装成 2/2。
  if (options.surface === 'workbench') {
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
  } else {
    settings.append(readonlyInstanceFacts(options));
  }

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
  if (options.surface === 'inspector' && part === 'all') {
    // 检查器里整段「高级设置」是一个折叠组：默认收起，避免编辑器/过滤器/只读事实把
    // 面板撑长到 sticky 状态条下面；展开后仍在同一滚动流里。
    section.appendChild(
      createDataGroup(
        {
          ownerDocument: options.panel.ownerDocument,
          section: 'authoring',
          group: 'refresh',
          title: DESIGNER_UI_TEXT.dataSource.advancedSettings,
          summary: `${refreshPolicyText(options)} \u00b7 ${DESIGNER_UI_TEXT.data.groups.editInWorkbench}`,
          readonlyHint: true,
          defaultOpen: false,
          overrides: options.groupOpenOverrides ?? new Map<string, boolean>(),
          onToggle: options.onToggleGroup,
        },
        [editor, filter, actions, settings],
      ),
    );
    return section;
  }
  if (part !== 'footer') section.append(heading, editor, filter, actions);
  if (part !== 'editor') {
    // **为什么现在不可达**：固定值/变量组件在 `requiredDataSections()` 就只返回 `{value}`，
    // `authoring` 段根本不会进 DOM，所以下面这个 `if` 的 false 分支在浏览器里走不到。
    // 保留它是因为「dataset 模式 + 非 data-source-field 取值」这种组合将来可能出现；
    // **不要为了让它可达去造假夹具**——为当前不存在的状态造数据，是给未来埋伏。
    // 「非数据源组件不出现 authoring 段」这条规则由段集合断言兜住（见 harness）。
    //
    // `refresh` 组只在组件**引用了实例**时存在：`inline` / `variable` 没有可指向的实例，
    // 渲染出来就是一条必然跳到空处的死链接。段存在与组存在是两个条件，不要合并判断。
    section.appendChild(
      options.dataValue?.kind === 'data-source-field'
        ? createDataGroup(
            {
              ownerDocument: options.panel.ownerDocument,
              section: 'authoring',
              group: 'refresh',
              title: DESIGNER_UI_TEXT.data.groups.refresh,
              // 组头是纯文本：`<summary>` 里塞按钮会被 toggle 抢走 click（无效交互），
              // 而收起态的摘要如果只写「手动」，读起来像"这里是可改的设置项"。
              // 用「手动 · 在工作台修改」把"只读、要改去别处"说清楚，真正的按钮留在组内。
              summary:
                options.surface === 'inspector'
                  ? `${refreshPolicyText(options)} \u00b7 ${DESIGNER_UI_TEXT.data.groups.editInWorkbench}`
                  : refreshPolicyText(options),
              readonlyHint: options.surface === 'inspector',
              defaultOpen: false,
              overrides: options.groupOpenOverrides ?? new Map<string, boolean>(),
              onToggle: options.onToggleGroup,
            },
            [settings],
          )
        : settings,
    );
  }
  return section;
}

/**
 * 检查器里的**只读**事实区：策略 / 实例摘要 + 跳转。
 *
 * 三态跳转（缺一即错）：文档实例 → 可点；仅草稿实例 → `data-instance-pending` + 禁用 +
 * 「应用后可修改」；都没有 → `data-instance-missing` + 「引用已失效」。
 * 不能把 pending 标成 missing：草稿实例的 id 与将要落库的 id 相同，等值校验会过，
 * 但那个 id 在文档里还不存在——**等值只证明"我要用它"，不证明"它已存在"**。
 *
 * 这里刻意不用 `.designer-dataset-authoring-setting-row` / `-checkbox`：那两类名是
 * 「检查器 0/0」断言的作用域内计数依据，复用会让只读降级被伪装成"还在"。
 */
function readonlyInstanceFacts(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-dataset-instance-facts';
  wrap.dataset.instanceFacts = 'true';
  const rows: readonly [string, string][] = [
    [DESIGNER_UI_TEXT.dataSource.refreshStrategyLabel, refreshPolicyText(options)],
    [
      DESIGNER_UI_TEXT.data.groups.source,
      options.instance?.name ?? DESIGNER_UI_TEXT.data.groups.sourceEmpty,
    ],
  ];
  for (const [label, value] of rows) {
    const row = ownerDocument.createElement('div');
    row.className = 'designer-dataset-instance-fact';
    const name = ownerDocument.createElement('span');
    name.className = 'designer-dataset-instance-fact-label';
    name.textContent = label;
    const text = ownerDocument.createElement('span');
    text.className = 'designer-dataset-instance-fact-value';
    text.textContent = value;
    row.append(name, text);
    wrap.appendChild(row);
  }
  const jump = createDesignerButton(ownerDocument);
  // 动作名不能叫 `apply`：空态「apply 计数为 0」是硬判据。
  jump.dataset.datasetAction = 'open-instance';
  jump.dataset.editInWorkbench = 'true';
  jump.dataset.instanceId = options.instance?.id ?? '';
  if (options.instance?.status === 'missing') {
    jump.dataset.instanceMissing = 'true';
    jump.textContent = DESIGNER_UI_TEXT.data.groups.instanceMissing;
    jump.title = DESIGNER_UI_TEXT.data.groups.instanceMissingHint;
  } else if (options.instance?.status === 'pending') {
    jump.dataset.instancePending = 'true';
    jump.disabled = true;
    jump.textContent = DESIGNER_UI_TEXT.data.groups.pendingApply;
  } else {
    jump.textContent = DESIGNER_UI_TEXT.data.groups.editInWorkbench;
  }
  wrap.appendChild(jump);
  return wrap;
}

/**
 * 更新策略文案（组头摘要）。
 *
 * 派生实例没有实例级策略（旧形态文档合成出来的视图只填 id/name/source/params），此时按
 * 「手动」展示：这是**诚实**的表达（没有自动刷新），比承诺一个无法验证的「只请求一次」
 * 缓存语义更安全。T03b 迁移出真实实例后这段兜底自然消失。
 */
export function refreshPolicyText(options: DesignerDataSourcePanelOptions): string {
  const policy = options.instance?.updatePolicy;
  if (policy === undefined) return DESIGNER_UI_TEXT.data.groups.refreshManual;
  if (policy.mode === 'once') return DESIGNER_UI_TEXT.data.groups.refreshOnce;
  if (policy.mode === 'auto') {
    return DESIGNER_UI_TEXT.data.groups.refreshEvery(policy.intervalSeconds ?? 30);
  }
  return DESIGNER_UI_TEXT.data.groups.refreshManual;
}

function authoringAction(
  ownerDocument: Document,
  action: DesignerDatasetAuthoringAction,
  label: string,
  disabled = false,
  disabledHint?: string,
): HTMLButtonElement {
  if (action === 'copy-data' || action === 'fullscreen-edit') {
    const button = createDesignerIconButton(ownerDocument, {
      ariaLabel: disabled && disabledHint !== undefined ? `${label} · ${disabledHint}` : label,
      className: 'designer-dataset-authoring-icon-action',
      disabled,
      icon: action === 'copy-data' ? 'copy' : 'fit',
      label,
      tip: disabled && disabledHint !== undefined ? disabledHint : label,
      variant: 'ghost',
    });
    button.dataset.datasetAuthoringAction = action;
    return button;
  }
  const button = createDesignerButton(ownerDocument, { disabled, text: label });
  button.dataset.datasetAuthoringAction = action;
  return button;
}

function authoringLabel(ownerDocument: Document, titleText: string, hint: string): HTMLElement {
  const label = ownerDocument.createElement('span');
  label.className = 'designer-dataset-authoring-label';
  label.textContent = titleText;
  label.setAttribute('data-tip', hint);
  return label;
}

function authoringCheckbox(
  options: DesignerDataSourcePanelOptions,
  setting: 'loadingDisabled' | 'controlled',
  labelText: string,
  checked: boolean,
): HTMLElement {
  const { field, input } = createDesignerToggleField(options.panel.ownerDocument, {
    ariaLabel: labelText,
    checked,
    className: 'designer-dataset-authoring-checkbox',
    control: 'checkbox',
    label: labelText,
    labelClassName: 'designer-dataset-authoring-setting-label',
  });
  input.dataset.datasetAuthoringSetting = setting;
  input.value = String(checked);
  return field;
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
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.dataSource.refreshStrategyLabel,
    options: (
      [
        ['once', DESIGNER_UI_TEXT.dataSource.refreshOnce],
        ['manual', DESIGNER_UI_TEXT.dataSource.manualRefresh],
        ['auto', DESIGNER_UI_TEXT.dataSource.refreshAuto],
      ] as const satisfies readonly [DesignerDatasetRefreshStrategy, string][]
    ).map(([value, label]) => ({
      label,
      selected: options.authoring.refreshStrategy === value,
      value,
    })),
    value: options.authoring.refreshStrategy,
  });
  select.dataset.datasetAuthoringSetting = 'refreshStrategy';
  strategy.append(strategyLabel, enhanceDesignerSelect(select).element);
  const intervalRow = ownerDocument.createElement('label');
  intervalRow.className = 'designer-dataset-authoring-setting-row';
  intervalRow.dataset.disabled = String(options.authoring.refreshStrategy !== 'auto');
  const intervalLabel = ownerDocument.createElement('span');
  intervalLabel.className = 'designer-dataset-authoring-setting-label';
  intervalLabel.textContent = DESIGNER_UI_TEXT.dataSource.refreshIntervalLabel;
  const intervalControl = ownerDocument.createElement('span');
  intervalControl.className = 'designer-dataset-refresh-interval-control';
  const interval = createDesignerInput(ownerDocument, {
    appearance: 'number',
    ariaLabel: `${DESIGNER_UI_TEXT.dataSource.refreshIntervalLabel} · ${DESIGNER_UI_TEXT.dataSource.refreshInterval}`,
    className: 'designer-number-input',
    disabled: options.authoring.refreshStrategy !== 'auto',
    max: 3600,
    min: 1,
    step: 1,
    value: String(options.authoring.refreshInterval),
  });
  interval.dataset.datasetAuthoringSetting = 'refreshInterval';
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

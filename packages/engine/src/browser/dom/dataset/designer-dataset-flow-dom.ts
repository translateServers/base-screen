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
import {
  dataEntryLayout,
  dataEntrySearchText,
  designerDataEntryItems,
  renderDataEntryGuide,
  renderDataEntrySegmented,
} from './designer-data-entry-dom.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
import {
  type DataPanelActionView,
  dataPanelActionView,
  datasetAction,
  renderDataPanelActions,
} from './designer-dataset-primitives.js';
import { createDatasetSection, type DesignerDataSectionKey } from './designer-dataset-sections.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetWorkbenchStep,
} from './designer-dataset-types.js';

/**
 * 「取值方式」段：**两套形态**，不是同一套加/减。
 *
 * - 空态（`mode === 'none'`）：一个组标题 + 三行 48px 引导行。空态的唯一任务是让人选一个入口，
 *   所以描述必须可读、三行必须等高对齐。
 * - 配置态：30px 分段控件一行，无组标题、无描述、无徽标。
 *
 * 为什么不做常驻三列卡片：内容宽约 303px 时每列只有 98px，中文标题 + 徽标必然换行参差，
 * 三卡高度不等是宽度约束下的死结（不是配色问题），改回来之前请先看这条。
 *
 * 段 key 仍是 `mode`，节点仍由外层流程渲染器持有：入口只是把 `setSourceMode` 收敛成三项。
 */
function renderSourceMode(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-data-source-type';
  section.dataset.workbenchSection = 'source';
  section.dataset.dsSection = 'mode';
  section.tabIndex = -1;
  const items = designerDataEntryItems({
    mode: options.mode,
    availableModes: options.availableModes,
    resourceAvailable: options.resourceAvailable,
  });
  section.dataset.inspectorSearchSection = 'true';
  section.dataset.inspectorSearchText = dataEntrySearchText(items);
  const layout = dataEntryLayout(options.mode);
  section.dataset.dataEntryLayout = layout;
  if (layout === 'empty') {
    const heading = ownerDocument.createElement('h3');
    heading.className = 'designer-inspector-section-title';
    heading.textContent = DESIGNER_UI_TEXT.dataPanel.emptyTitle;
    const hint = ownerDocument.createElement('p');
    hint.className = 'designer-data-entry-hint';
    hint.textContent = DESIGNER_UI_TEXT.dataPanel.emptyHint;
    section.append(heading, renderDataEntryGuide(ownerDocument, items), hint);
    return section;
  }
  section.appendChild(renderDataEntrySegmented(ownerDocument, items));
  return section;
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
  section.appendChild(row.field);
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

/**
 * 数据流：**只有一层导航**（面板顶部的「数据源」页签）。
 *
 * 内联面板里原本还有一条 44px 的三格步骤条，它有两个致命问题：
 * 1. 与顶部页签构成双层导航；
 * 2. 它的 detail（数据集名 / 已映射字段数 / 响应状态）被 CSS 藏掉了，44px 只剩下"1/2/3"，
 *    而"第几步"本来就由滚动位置表达；静态值态下第 2、3 步还是死链接。
 *
 * 因此内联面板删掉整条；`data-active-step` 仍继续写入（由滚动位置派生），
 * 工作台抽屉里的 5 步导航不受影响。
 */
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
  section.dataset.activeStep = inlineWorkbenchStep(options.activeStep);

  const content = ownerDocument.createElement('div');
  content.className = 'designer-datav-data-flow-content';
  content.dataset.designerScrollScope = `data-source:${options.scrollScope}`;
  renderContinuousDataFlow(content, options);

  section.appendChild(content);
  return section;
}

function renderContinuousDataFlow(
  content: HTMLElement,
  options: DesignerDataSourcePanelOptions,
): void {
  content.appendChild(renderSourceMode(options));
  // 空态只有一组引导行：没有可应用的草稿（不放操作条），也不再补「当前组件不使用数据。」
  // 这类物料数据段的占位文案——上面刚让人"选择数据来源"，下面再说"不使用数据"是自相矛盾。
  if (options.mode === 'none') return;
  if (options.mode === 'static') {
    renderContinuousStaticDataFlow(content, options);
    return;
  }
  if (options.mode === 'variable') {
    content.appendChild(renderVariableSource(options));
    content.appendChild(renderDataPanelActions(content.ownerDocument, dataPanelApplyView(options)));
    return;
  }
  // 段一律从工厂取：内联面板与工作台渲染同一批节点，拼装顺序只在这里和挂载层决定。
  content.append(
    section('host-link', options),
    ...(options.catalogOpen || options.descriptor === undefined
      ? [section('catalog', options)]
      : datasetModeSections(content.ownerDocument, options)),
  );
}

function datasetModeSections(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
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
    renderDataPanelActions(ownerDocument, dataPanelApplyView(options)),
  ];
}

/**
 * 主操作条的唯一 view 计算：**渲染**与**就地刷新**都读它，两处不会各判一套。
 *
 * 数据源模式：有草稿可应用，但端口没接或绑定不完整时只禁用、不改文案。
 */
export function dataPanelApplyView(options: DesignerDataSourcePanelOptions): DataPanelActionView {
  const descriptor = options.descriptor;
  const blocked =
    options.mode === 'dataset' && descriptor !== undefined
      ? !options.resourceAvailable ||
        !isDesignerDatasetBindingValid(descriptor, options.draft, options.roles)
      : false;
  return dataPanelActionView({ dirty: options.dirty, blocked });
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
  // 固定值态以前有三份「应用」（编辑器内 / 映射段内 / 流程尾），三者都 `sticky bottom:0`
  // 叠在同一位置，只看得见最后一份。现在只有流程尾这一份。
  content.appendChild(renderDataPanelActions(content.ownerDocument, dataPanelApplyView(options)));
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

function inlineWorkbenchStep(step: DesignerDatasetWorkbenchStep): 'source' | 'mapping' | 'preview' {
  return step === 'mapping' || step === 'preview' ? step : 'source';
}

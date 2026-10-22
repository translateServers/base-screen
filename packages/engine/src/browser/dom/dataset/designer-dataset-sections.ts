import { renderDatasetAuthoring } from './designer-dataset-authoring-dom.js';
import {
  renderDatasetCatalog,
  renderDatasetPickerPlaceholder,
  renderHostConnection,
} from './designer-dataset-catalog-dom.js';
import { renderDesignerDatasetConfiguration } from './designer-dataset-config-dom.js';
import { renderDatasetPreview } from './designer-dataset-preview-dom.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetConfigurationOptions,
} from './designer-dataset-types.js';

/**
 * 数据面板里可以独立重建的段，**冻结为 5 个**（架构 §5.2.1）。
 *
 * 此后不得新增、不得合并：本轮把 `mode → value`、`config → source`，并把原来的 `catalog`
 * 折叠进 `source`（未选数据集时同一段里显示目录，选完之后显示配置），段总数因此恰好 5 个。
 * 理由很硬——段边界就是 `replaceWith` 的边界；每多一个 key，就多一块「本该由段 diff 保护、
 * 却被塞进同一个替换单元」的内容。
 */
export type DesignerDataSectionKey = 'value' | 'source' | 'host-link' | 'preview' | 'authoring';

/** 段的稳定顺序：DOM 顺序、断言顺序、焦点回落下标都读它。 */
export const DESIGNER_DATA_SECTION_ORDER: readonly DesignerDataSectionKey[] = [
  'value',
  'source',
  'host-link',
  'preview',
  'authoring',
];

/** 配置段的入参只有一处拼装，内联面板、全屏工作台与 patch 层都复用它。 */
export function datasetConfigurationOptions(
  options: DesignerDataSourcePanelOptions,
): DesignerDatasetConfigurationOptions | undefined {
  const descriptor = options.descriptor;
  if (descriptor === undefined) return undefined;
  return {
    panel: options.panel,
    descriptor,
    draft: options.draft,
    roles: options.roles,
    variables: options.variables,
    resourceAvailable: options.resourceAvailable,
    bindingOpenRoleId: options.bindingOpenRoleId ?? null,
    // 动作条由各挂载点在容器层统一摆放（面板底部 / 工作台头部），配置区自己不再夹带一份。
    includeActions: false,
    overlayHost: options.overlayHost,
    onSelectParameter: options.onSelectParameter,
    link: options.link,
    surface: options.surface,
    instance: options.instance,
    groupOpenOverrides: options.groupOpenOverrides,
    onToggleGroup: options.onToggleGroup,
  };
}

/**
 * 段的唯一构造入口。返回 undefined 表示这个段不由工厂创建。
 *
 * `value` 是唯一一个**故意不在这里创建**的段：它的节点由外层流程渲染器持有（见
 * `designer-data-section-diff.ts` 的特例分支）。把它并进工厂，diff 就会开始重建它，
 * 表现是「切换取值方式后焦点丢失 / 输入法组合态断掉」——而且当前没有任何断言能发现。
 */
export function createDatasetSection(
  key: DesignerDataSectionKey,
  options: DesignerDataSourcePanelOptions,
): HTMLElement | undefined {
  if (key === 'value') return undefined;
  if (key === 'host-link') return renderHostConnection(options);
  if (key === 'preview') return renderDatasetPreview(options.panel.ownerDocument, options);
  if (key === 'authoring') return renderDatasetAuthoring(options);
  // `source`：未选数据集/目录展开时是目录，选完之后是配置。两者互斥、同一段替换。
  //
  // 检查器里 `catalogOpen` 只表示**来源浮层开着**（目录列表在浮层里），面板本身仍然渲染配置：
  // 浮层盖住的是一份已经配置好的面板，关掉就回到原处。工作台没有浮层，仍沿用「目录/配置
  // 二选一」的老语义。
  if (options.surface === 'inspector') {
    if (options.descriptor === undefined) return renderDatasetPickerPlaceholder(options);
  } else if (options.catalogOpen || options.descriptor === undefined) {
    return renderDatasetCatalog(options);
  }
  const configuration = datasetConfigurationOptions(options);
  return configuration === undefined
    ? undefined
    : renderDesignerDatasetConfiguration(configuration);
}

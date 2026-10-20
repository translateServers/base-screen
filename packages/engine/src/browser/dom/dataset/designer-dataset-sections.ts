import { renderDatasetAuthoring } from './designer-dataset-authoring-dom.js';
import { renderDatasetCatalog, renderHostConnection } from './designer-dataset-catalog-dom.js';
import { renderDesignerDatasetConfiguration } from './designer-dataset-config-dom.js';
import { renderDatasetPreview } from './designer-dataset-preview-dom.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetConfigurationOptions,
} from './designer-dataset-types.js';

/**
 * 数据面板里可以独立重建的段。每个段在 DOM 上带 `data-ds-section="<key>"`，
 * patch 层据此就地替换单段，而不是整块重绘。
 */
export type DesignerDataSectionKey = 'host-link' | 'catalog' | 'config' | 'preview' | 'authoring';

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
  };
}

/**
 * 段的唯一构造入口。返回 undefined 表示当前状态下这个段不存在（如未选数据集时的配置段）。
 */
export function createDatasetSection(
  key: DesignerDataSectionKey,
  options: DesignerDataSourcePanelOptions,
): HTMLElement | undefined {
  if (key === 'host-link') return renderHostConnection(options);
  if (key === 'catalog') return renderDatasetCatalog(options);
  if (key === 'preview') return renderDatasetPreview(options.panel.ownerDocument, options);
  if (key === 'authoring') return renderDatasetAuthoring(options);
  const configuration = datasetConfigurationOptions(options);
  return configuration === undefined
    ? undefined
    : renderDesignerDatasetConfiguration(configuration);
}

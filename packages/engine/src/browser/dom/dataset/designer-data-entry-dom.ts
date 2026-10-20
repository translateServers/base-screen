import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourceMode } from './designer-dataset-types.js';

/**
 * 「取值方式」三入口（L0）。
 *
 * 取值模型仍是原来的 `static / variable / dataset / host-resource` 四种模式，
 * 这一层只把它们收敛成用户能判断的三张卡：
 * - `static`   固定值：不接数据源，手填；
 * - `variable` 用变量：取全局变量的当前值；
 * - `source`   接数据源：绑定数据集或宿主资源（两种模式共用一个入口）。
 *
 * 卡片只是**模式的可见面**：点击仍然是 `setSourceMode(mode)`，不改取值模型。
 */
export type DesignerDataEntry = 'static' | 'variable' | 'source';

/** 卡片携带的目标模式：`source` 入口按组件声明的能力落到 dataset 或 host-resource。 */
export interface DesignerDataEntryItem {
  readonly entry: DesignerDataEntry;
  readonly mode: DesignerDataSourceMode;
  readonly selected: boolean;
  readonly disabled: boolean;
  /** 不可用时的可见原因（同时写进 `title` 与卡片底部一行小字）。 */
  readonly reason?: string;
}

export interface DesignerDataEntryOptions {
  readonly mode: DesignerDataSourceMode;
  readonly availableModes: readonly DesignerDataSourceMode[];
  /** 数据集端口是否接上（宿主未接入时 `source` 禁用并给出原因）。 */
  readonly resourceAvailable: boolean;
}

/** 当前模式落在哪个入口：`none` 不属于任何入口（未配置 = 三张卡都没选中）。 */
export function dataEntryOfMode(mode: DesignerDataSourceMode): DesignerDataEntry | undefined {
  if (mode === 'static' || mode === 'variable') return mode;
  if (mode === 'dataset' || mode === 'host-resource') return 'source';
  return undefined;
}

/**
 * 三张卡的模型：顺序固定为 固定值 → 用变量 → 接数据源。
 *
 * 禁用只有两类原因，都必须可见：
 * - 组件自身没有这项数据能力（物料未声明）；
 * - 组件有能力但宿主端口没接（`source` 的「宿主未提供数据集接口」）。
 */
export function designerDataEntryItems(
  options: DesignerDataEntryOptions,
): readonly DesignerDataEntryItem[] {
  const selectedEntry = dataEntryOfMode(options.mode);
  return [
    entryItem(options, 'static', 'static', selectedEntry),
    entryItem(options, 'variable', 'variable', selectedEntry),
    sourceItem(options, selectedEntry),
  ];
}

function entryItem(
  options: DesignerDataEntryOptions,
  entry: Exclude<DesignerDataEntry, 'source'>,
  mode: Exclude<DesignerDataSourceMode, 'none' | 'dataset' | 'host-resource'>,
  selectedEntry: DesignerDataEntry | undefined,
): DesignerDataEntryItem {
  const supported = options.availableModes.includes(mode);
  return {
    entry,
    mode,
    selected: selectedEntry === entry,
    disabled: !supported,
    ...(supported ? {} : { reason: entryText(entry).disabled }),
  };
}

/**
 * 「接数据源」入口：数据集优先（更常用），只有宿主资源一种能力时落到 host-resource。
 *
 * 端口未接时卡片禁用——但**不**因此禁用变量入口：变量是文档内对象，空变量表也能进去新建。
 */
function sourceItem(
  options: DesignerDataEntryOptions,
  selectedEntry: DesignerDataEntry | undefined,
): DesignerDataEntryItem {
  const datasetSupported = options.availableModes.includes('dataset');
  const hostResourceSupported = options.availableModes.includes('host-resource');
  const text = DESIGNER_UI_TEXT.dataEntry.source;
  if (!datasetSupported && !hostResourceSupported) {
    return {
      entry: 'source',
      mode: 'dataset',
      selected: selectedEntry === 'source',
      disabled: true,
      reason: text.disabled,
    };
  }
  const mode: DesignerDataSourceMode = datasetSupported ? 'dataset' : 'host-resource';
  const portMissing = mode === 'dataset' && !options.resourceAvailable;
  return {
    entry: 'source',
    mode,
    selected: selectedEntry === 'source',
    disabled: portMissing,
    ...(portMissing ? { reason: text.portMissing } : {}),
  };
}

function entryText(entry: DesignerDataEntry) {
  if (entry === 'static') return DESIGNER_UI_TEXT.dataEntry.static;
  if (entry === 'variable') return DESIGNER_UI_TEXT.dataEntry.variable;
  return DESIGNER_UI_TEXT.dataEntry.source;
}

/** 检查器搜索用的整段文本：三张卡的标题、描述与徽标都参与匹配。 */
export function dataEntrySearchText(items: readonly DesignerDataEntryItem[]): string {
  return [
    DESIGNER_UI_TEXT.dataEntry.legend,
    ...items.map((item) => {
      const text = entryText(item.entry);
      return `${text.title} ${text.description} ${text.badge}`;
    }),
  ].join(' ');
}

/**
 * 三入口单选组。
 *
 * 语义是 `radiogroup` + 三个 `radio`：方向键在组内移动并即时选中（由控制器承接），
 * 因此只有一张卡是 tab 停点（roving tabindex），其余为 -1。
 */
export function renderDataEntryGroup(
  ownerDocument: Document,
  items: readonly DesignerDataEntryItem[],
): HTMLElement {
  const group = ownerDocument.createElement('div');
  group.className = 'designer-data-entry-group';
  group.dataset.dataEntryGroup = 'true';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', DESIGNER_UI_TEXT.dataEntry.legend);
  const tabbable = tabbableEntry(items);
  for (const item of items) {
    group.appendChild(renderDataEntryCard(ownerDocument, item, item.entry === tabbable));
  }
  return group;
}

/** tab 停点：选中的可选项优先，否则取第一个可选项；三张全禁用时没有停点（`undefined`）。 */
function tabbableEntry(items: readonly DesignerDataEntryItem[]): DesignerDataEntry | undefined {
  const enabled = items.filter((item) => !item.disabled);
  return (enabled.find((item) => item.selected) ?? enabled[0])?.entry;
}

function renderDataEntryCard(
  ownerDocument: Document,
  item: DesignerDataEntryItem,
  tabbable: boolean,
): HTMLButtonElement {
  const text = entryText(item.entry);
  const card = ownerDocument.createElement('button');
  card.type = 'button';
  card.className = 'designer-data-entry-card';
  card.dataset.dataEntry = item.entry;
  card.dataset.dataEntryMode = item.mode;
  card.dataset.dsControl = `data-entry:${item.entry}`;
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', String(item.selected));
  card.tabIndex = tabbable ? 0 : -1;
  // 向后兼容：旧断言/脚本按 `[data-dataset-mode]` 找当前取值方式，仍写在选中卡上。
  if (item.selected) card.dataset.datasetMode = item.mode;
  if (item.disabled) {
    card.disabled = true;
    card.setAttribute('aria-disabled', 'true');
    if (item.reason !== undefined) card.setAttribute('title', item.reason);
  }

  const head = ownerDocument.createElement('span');
  head.className = 'designer-data-entry-card-head';
  const title = ownerDocument.createElement('span');
  title.className = 'designer-data-entry-card-title';
  title.textContent = text.title;
  const badge = ownerDocument.createElement('span');
  badge.className = 'designer-data-entry-card-badge';
  badge.textContent = text.badge;
  head.append(title, badge);

  const description = ownerDocument.createElement('span');
  description.className = 'designer-data-entry-card-description';
  description.textContent = text.description;
  card.append(head, description);
  if (item.disabled && item.reason !== undefined) {
    // 禁用原因必须看得见：禁用按钮不弹 `title`，小字是唯一稳定可见的说明。
    const reason = ownerDocument.createElement('span');
    reason.className = 'designer-data-entry-card-reason';
    reason.textContent = item.reason;
    card.appendChild(reason);
  }
  return card;
}

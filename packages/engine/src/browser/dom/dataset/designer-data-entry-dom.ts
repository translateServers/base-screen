import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import type { DesignerDataSourceMode } from './designer-dataset-types.js';

/**
 * 「取值方式」三入口（L0）。
 *
 * 取值模型仍是原来的 `static / variable / dataset / host-resource` 四种模式，
 * 这一层只把它们收敛成用户能判断的三个入口：
 * - `static`   固定值：不接数据源，手填；
 * - `variable` 用变量：取全局变量的当前值；
 * - `source`   接数据源：绑定数据集或宿主资源（两种模式共用一个入口）。
 *
 * 入口只是**模式的可见面**：点击仍然是 `setSourceMode(mode)`，不改取值模型。
 */
export type DesignerDataEntry = 'static' | 'variable' | 'source';

/** 卡片携带的目标模式：`source` 入口按组件声明的能力落到 dataset 或 host-resource。 */
export interface DesignerDataEntryItem {
  readonly entry: DesignerDataEntry;
  readonly mode: DesignerDataSourceMode;
  readonly selected: boolean;
  readonly disabled: boolean;
  /** 不可用时的可见原因（同时写进 `title` 与行内小字）。 */
  readonly reason?: string;
}

export interface DesignerDataEntryOptions {
  readonly mode: DesignerDataSourceMode;
  readonly availableModes: readonly DesignerDataSourceMode[];
  /** 数据集端口是否接上（宿主未接入时 `source` 禁用并给出原因）。 */
  readonly resourceAvailable: boolean;
}

/** 当前模式落在哪个入口：`none` 不属于任何入口（未配置 = 三个入口都没选中）。 */
export function dataEntryOfMode(mode: DesignerDataSourceMode): DesignerDataEntry | undefined {
  if (mode === 'static' || mode === 'variable') return mode;
  if (mode === 'dataset' || mode === 'host-resource') return 'source';
  return undefined;
}

/**
 * 三个入口的模型：顺序固定为 固定值 → 用变量 → 接数据源。
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
 * 端口未接时入口禁用——但**不**因此禁用变量入口：变量是文档内对象，空变量表也能进去新建。
 */
function sourceItem(
  options: DesignerDataEntryOptions,
  selectedEntry: DesignerDataEntry | undefined,
): DesignerDataEntryItem {
  const datasetSupported = options.availableModes.includes('dataset');
  const hostResourceSupported = options.availableModes.includes('host-resource');
  const text = DESIGNER_UI_TEXT.data.entry.source;
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
  if (entry === 'static') return DESIGNER_UI_TEXT.data.entry.static;
  if (entry === 'variable') return DESIGNER_UI_TEXT.data.entry.variable;
  return DESIGNER_UI_TEXT.data.entry.source;
}

/** 检查器搜索用的整段文本：三个入口的标题、描述与原因都参与匹配。 */
export function dataEntrySearchText(items: readonly DesignerDataEntryItem[]): string {
  return [
    DESIGNER_UI_TEXT.data.entry.legend,
    DESIGNER_UI_TEXT.data.panel.emptyTitle,
    ...items.map((item) => {
      const text = entryText(item.entry);
      return `${text.title} ${text.description} ${item.reason ?? text.disabled}`;
    }),
  ].join(' ');
}

/** 空态还是配置态：空态是**另一套结构**（引导行），不是配置态全部禁用。 */
export function dataEntryLayout(mode: DesignerDataSourceMode): 'empty' | 'configured' {
  return mode === 'none' ? 'empty' : 'configured';
}

/**
 * 空态：三行引导行。
 *
 * 一行 = `标题(88px) | 描述(1fr) | 右侧(原因 / chevron)`，行高 48px、等高、左边缘对齐。
 * 刻意**不做**三列卡片：内容宽约 303px 时每列只有 98px，中文标题 + 徽标必然换行参差
 * （改回卡片前先看这条：三卡高度不等是宽度约束下的死结，不是配色问题）。
 *
 * 不可用行**不整行置灰**：右侧换成一行小字原因，行本身 `disabled` 因而不参与 Tab 序。
 */
export function renderDataEntryGuide(
  ownerDocument: Document,
  items: readonly DesignerDataEntryItem[],
): HTMLElement {
  const group = ownerDocument.createElement('div');
  group.className = 'designer-data-entry-guide';
  group.dataset.dataEntryGroup = 'true';
  group.dataset.dataEntryLayout = 'empty';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', DESIGNER_UI_TEXT.data.panel.emptyTitle);
  for (const item of items) {
    group.appendChild(renderGuideRow(ownerDocument, item));
  }
  return group;
}

/**
 * 引导行是 `<button>`：整行可点，`Enter`/`Space` 由按钮原生行为触发 click，
 * 不需要额外的键盘分支。`role="radio"` + `aria-checked` 与外层 radiogroup 成对。
 *
 * 版式：`标题(74px) | 描述 + 原因 | chevron`。
 * - 描述允许两行（`-webkit-line-clamp: 2`），**不**用单行 ellipsis 截成"取全局变量当…"；
 * - 禁用原因**单独一行**放在描述下方（11px muted），不与描述争同一行的宽度；
 * - 禁用行**不放 chevron**：那个箭头是"可以进去"的暗示，不可用入口不该有。
 */
function renderGuideRow(ownerDocument: Document, item: DesignerDataEntryItem): HTMLButtonElement {
  const text = entryText(item.entry);
  const row = ownerDocument.createElement('button');
  row.type = 'button';
  row.className = 'designer-data-entry-guide-row';
  row.dataset.dataEntry = item.entry;
  row.dataset.dataEntryMode = item.mode;
  row.dataset.dsControl = `data-entry:${item.entry}`;
  row.setAttribute('role', 'radio');
  row.setAttribute('aria-checked', String(item.selected));
  row.tabIndex = item.disabled ? -1 : 0;
  if (item.selected) row.dataset.datasetMode = item.mode;
  if (item.disabled) {
    row.disabled = true;
    row.setAttribute('aria-disabled', 'true');
  }
  const title = ownerDocument.createElement('span');
  title.className = 'designer-data-entry-guide-title';
  title.textContent = text.title;
  const body = ownerDocument.createElement('span');
  body.className = 'designer-data-entry-guide-copy';
  const description = ownerDocument.createElement('span');
  description.className = 'designer-data-entry-guide-description';
  description.textContent = text.description;
  body.appendChild(description);
  if (item.disabled && item.reason !== undefined) {
    const reason = ownerDocument.createElement('span');
    reason.className = 'designer-data-entry-guide-reason';
    reason.textContent = item.reason;
    body.appendChild(reason);
  }
  row.append(title, body);
  if (!item.disabled) {
    const disclosure = ownerDocument.createElement('span');
    disclosure.className = 'designer-data-entry-guide-disclosure';
    disclosure.setAttribute('aria-hidden', 'true');
    disclosure.innerHTML = designerIcon('chevron-right');
    row.appendChild(disclosure);
  }
  return row;
}

/**
 * 配置态：30px 分段控件（`[固定值 | 变量 | 数据源]`）。
 *
 * 1-of-3 互斥枚举常驻面板时应该是分段控件：切换"一次点击到位、只换内容不换位置"，
 * 高度只有卡片的 1/3，且与画布缩放、检查器密度、数据集编辑器同一套 `.designer-segmented` 几何。
 * 这里不为数据面板另造一种"多选一"外观。
 */
export function renderDataEntrySegmented(
  ownerDocument: Document,
  items: readonly DesignerDataEntryItem[],
): HTMLElement {
  const group = ownerDocument.createElement('div');
  group.className = 'designer-segmented designer-data-entry-segmented';
  group.dataset.dataEntryGroup = 'true';
  group.dataset.dataEntryLayout = 'configured';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', DESIGNER_UI_TEXT.data.entry.legend);
  const tabbable = tabbableEntry(items);
  for (const item of items) {
    group.appendChild(renderSegmentedOption(ownerDocument, item, item.entry === tabbable));
  }
  return group;
}

/** tab 停点：选中的可选项优先，否则取第一个可选项；三个全禁用时没有停点。 */
function tabbableEntry(items: readonly DesignerDataEntryItem[]): DesignerDataEntry | undefined {
  const enabled = items.filter((item) => !item.disabled);
  return (enabled.find((item) => item.selected) ?? enabled[0])?.entry;
}

function renderSegmentedOption(
  ownerDocument: Document,
  item: DesignerDataEntryItem,
  tabbable: boolean,
): HTMLButtonElement {
  const option = ownerDocument.createElement('button');
  option.type = 'button';
  option.className = 'designer-segmented-option designer-data-entry-option';
  option.dataset.dataEntry = item.entry;
  option.dataset.dataEntryMode = item.mode;
  option.dataset.dsControl = `data-entry:${item.entry}`;
  option.setAttribute('role', 'radio');
  option.setAttribute('aria-checked', String(item.selected));
  option.tabIndex = item.disabled || !tabbable ? -1 : 0;
  // 可见文本用短名（固定值 / 变量 / 数据源，一段约 95px）；
  // `title` 与 `aria-label` 一律取**全称**：读屏不该听到"数据源"这种脱离上下文的碎片。
  option.textContent = DESIGNER_UI_TEXT.data.entry.compact[item.entry];
  option.setAttribute('aria-label', entryText(item.entry).title);
  option.setAttribute('title', entryText(item.entry).title);
  if (item.selected) option.dataset.datasetMode = item.mode;
  if (item.disabled) {
    option.disabled = true;
    option.setAttribute('aria-disabled', 'true');
    // 禁用时把原因叠进 title：全称 + 原因比只报"不可用"信息量大。
    if (item.reason !== undefined) {
      option.setAttribute('title', `${entryText(item.entry).title} · ${item.reason}`);
    }
  }
  return option;
}

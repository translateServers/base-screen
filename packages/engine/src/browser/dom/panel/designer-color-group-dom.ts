import type { ScreenJsonValue } from '@base-screen/contracts';

/**
 * 连续色值组成的「色板组」。
 *
 * 样式清单里的色值个数不受面板控制：可能是 1 个，也可能是 12 个。按个数写阈值（「超过 5 个就
 * 换形态」）在清单侧根本没法保证，所以形态只由两件事决定：
 *
 * 1. **成不成组**：连续 color 字段 ≥ 3 个才是一套色板。1–2 个只是普通字段，继续用现有
 *    stacked 色值行；被字号、开关这类非色值字段打断也不跨段拼组。
 * 2. **可用宽度**：色卡列数交给 `repeat(auto-fill, minmax(46px, 1fr))`，46px = 三个汉字
 *    33px + 两侧内距。放得下几格就排几格，放不下换行，没有数量常量。
 *
 * 组内只保留一个编辑器：色卡负责「看见整组配色并挑一个」，编辑器负责改当前选中的那个。
 * 面板每次提交都会整栏重建（`renderDesignerProperties` → `replaceChildren`），所以选中态
 * 必须存在 DOM 之外，否则每次改色都会跳回第一个色值。
 */

/** 少于三个色值不构成一组色板。 */
export const DESIGNER_COLOR_GROUP_MIN_FIELDS = 3;

/** 记住每组最后选中的色值键；与取色草稿缓存一样按组登记，超出后按插入顺序淘汰。 */
const MAX_REMEMBERED_GROUPS = 64;
const selectedKeys = new Map<string, string>();

export interface DesignerColorGroupEntry {
  /** 样式键或属性键（`data-style` / `data-prop` 的值）。 */
  readonly key: string;
  readonly label: string;
  readonly value: ScreenJsonValue | undefined;
}

export interface DesignerColorGroupOptions {
  /** 每个组件每个分区一份记忆（`${componentId}:style` / `${componentId}:prop`）。 */
  readonly groupKey: string;
  readonly entries: readonly DesignerColorGroupEntry[];
  /** 由调用方渲染选中色值的字段行，保持 `data-style` / `data-prop` 与消息连接不变。 */
  readonly renderField: (container: HTMLElement, entry: DesignerColorGroupEntry) => void;
}

export interface DesignerColorFieldSegment<T> {
  readonly color: boolean;
  readonly fields: readonly T[];
}

/** 把连续同类型字段切成段：色值段 ≥ 3 个才成组，其余段原样渲染。 */
export function segmentDesignerColorFields<T extends { readonly control: string }>(
  fields: readonly T[],
): readonly DesignerColorFieldSegment<T>[] {
  const segments: { color: boolean; fields: T[] }[] = [];
  for (const field of fields) {
    const color = field.control === 'color';
    const last = segments[segments.length - 1];
    if (last !== undefined && last.color === color) last.fields.push(field);
    else segments.push({ color, fields: [field] });
  }
  return segments;
}

export function shouldGroupColorFields(count: number): boolean {
  return count >= DESIGNER_COLOR_GROUP_MIN_FIELDS;
}

/** 测试与宿主换文档时清空记忆；正常渲染不需要调用。 */
export function resetDesignerColorGroupSelections(): void {
  selectedKeys.clear();
}

export function selectedDesignerColorGroupEntry(
  groupKey: string,
  entries: readonly DesignerColorGroupEntry[],
): DesignerColorGroupEntry | undefined {
  const remembered = selectedKeys.get(groupKey);
  const match = entries.find((entry) => entry.key === remembered);
  if (match !== undefined) return match;
  return entries[0];
}

function rememberDesignerColorGroupSelection(groupKey: string, key: string): void {
  selectedKeys.delete(groupKey);
  selectedKeys.set(groupKey, key);
  while (selectedKeys.size > MAX_REMEMBERED_GROUPS) {
    const oldest = selectedKeys.keys().next();
    if (oldest.done === true) break;
    selectedKeys.delete(oldest.value);
  }
}

/**
 * 色块填色：写在棋盘上层的填充层，纯色只写 `backgroundColor`，让底下的透明棋盘继续透出来；
 * 渐变才用 `background` 整体替换（渐变本身不透明，棋盘没有意义）。
 */
function paintColorGroupSwatch(fill: HTMLElement, value: ScreenJsonValue | undefined): void {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return;
  if (text.includes('gradient(')) fill.style.background = text;
  else fill.style.backgroundColor = text;
}

export function appendDesignerColorGroup(
  parent: HTMLElement,
  options: DesignerColorGroupOptions,
): void {
  if (!shouldGroupColorFields(options.entries.length)) return;
  const ownerDocument = parent.ownerDocument;
  const group = ownerDocument.createElement('div');
  group.className = 'designer-color-group';
  group.dataset.designerColorGroup = options.groupKey;

  const band = ownerDocument.createElement('div');
  band.className = 'designer-color-group-band';
  const editor = ownerDocument.createElement('div');
  editor.className = 'designer-color-group-editor';

  const cards: { readonly entry: DesignerColorGroupEntry; readonly card: HTMLButtonElement }[] = [];
  let selected = selectedDesignerColorGroupEntry(options.groupKey, options.entries);

  const sync = (): void => {
    for (const { entry, card } of cards) {
      const active = entry.key === selected?.key;
      card.setAttribute('aria-pressed', String(active));
      // 选中项由下面的字段行承载搜索索引；卡片只在未选中时登记，避免同一个色值出现两条结果。
      if (active) {
        delete card.dataset.inspectorSearchKind;
        delete card.dataset.inspectorSearchKey;
        delete card.dataset.inspectorSearchText;
      } else {
        card.dataset.inspectorSearchKind = 'field';
        card.dataset.inspectorSearchKey = `${options.groupKey}:${entry.key}`;
        card.dataset.inspectorSearchText = entry.label;
      }
    }
    editor.replaceChildren();
    if (selected !== undefined) options.renderField(editor, selected);
  };

  for (const entry of options.entries) {
    const card = ownerDocument.createElement('button');
    card.type = 'button';
    card.className = 'designer-color-group-card';
    card.dataset.colorGroupKey = entry.key;
    const swatch = ownerDocument.createElement('span');
    swatch.className = 'designer-color-group-swatch designer-fill-color-checkerboard';
    swatch.setAttribute('aria-hidden', 'true');
    const fill = ownerDocument.createElement('span');
    fill.className = 'designer-color-group-fill';
    fill.setAttribute('aria-hidden', 'true');
    paintColorGroupSwatch(fill, entry.value);
    swatch.append(fill);
    const name = ownerDocument.createElement('span');
    name.className = 'designer-color-group-name';
    name.textContent = entry.label;
    card.append(swatch, name);
    card.addEventListener('click', () => {
      selected = entry;
      rememberDesignerColorGroupSelection(options.groupKey, entry.key);
      sync();
    });
    band.append(card);
    cards.push({ entry, card });
  }

  group.append(band, editor);
  parent.append(group);
  sync();
}

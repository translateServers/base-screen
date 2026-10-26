import { DESIGNER_OPERATION_TEXT } from '../../../common/operations/designer-operation-registry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { menuActionIcon, menuSubmenuIcon } from '../menu/designer-menu-icons.js';
import { TOGGLE_MENU_ACTIONS } from '../menu/designer-menu-model.js';

export const DESIGNER_ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200] as const;

export const SHORTCUT_HELP_SECTIONS = [
  {
    title: DESIGNER_UI_TEXT.shortcutHelpSections.edit,
    operationIds: [
      'undo',
      'redo',
      'copy',
      'paste',
      'duplicate',
      'delete',
      'select-all',
      'group',
      'ungroup',
      'lock',
      'unlock',
      'hide',
    ],
  },
  {
    title: DESIGNER_UI_TEXT.shortcutHelpSections.arrange,
    operationIds: [
      'edit-position',
      'edit-size',
      'select-layer-up',
      'select-layer-down',
      'nudge-left',
      'nudge-right',
      'nudge-up',
      'nudge-down',
      'align-left',
      'align-center',
      'align-right',
      'align-top',
      'align-middle',
      'align-bottom',
      'bring-to-front',
      'bring-forward',
      'send-backward',
      'send-to-back',
    ],
  },
  {
    title: DESIGNER_UI_TEXT.shortcutHelpSections.canvas,
    operationIds: [
      'zoom-in',
      'zoom-out',
      'zoom-fit',
      'toggle-guides',
      'toggle-border-guides',
      'toggle-workbench',
      'show-help',
    ],
  },
] as const;

export function coordinateEntryField(axis: 'x' | 'y'): string {
  const label = axis.toUpperCase();
  return `<label class="designer-coordinate-entry-field"><span class="designer-coordinate-entry-input"><span class="designer-coordinate-entry-axis" aria-hidden="true">${label}</span><input type="number" class="designer-control designer-input designer-number" data-coordinate-entry-${axis} data-coordinate-entry-axis="${axis}" inputmode="decimal" min="-1000000" max="1000000" step="0.01" aria-label="${label}" aria-describedby="designer-coordinate-entry-error"><span class="designer-coordinate-entry-unit" aria-hidden="true">${DESIGNER_UI_TEXT.coordinateEntry.unit}</span></span></label>`;
}

export function sizeEntryField(axis: 'width' | 'height'): string {
  const label = axis === 'width' ? 'W' : 'H';
  return `<label class="designer-coordinate-entry-field"><span class="designer-coordinate-entry-input"><span class="designer-coordinate-entry-axis" aria-hidden="true">${label}</span><input type="number" class="designer-control designer-input designer-number" data-size-entry-${axis} data-size-entry-axis="${axis}" inputmode="decimal" min="1" max="1000000" step="0.01" aria-label="${label}" aria-describedby="designer-size-entry-error"><span class="designer-coordinate-entry-unit" aria-hidden="true">${DESIGNER_UI_TEXT.coordinateEntry.unit}</span></span></label>`;
}

export function actionButton(action: keyof typeof DESIGNER_OPERATION_TEXT, glyph: string): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? ` (${operation.shortcut})` : '';
  return `<button type="button" class="designer-control designer-button designer-icon-button toolbar-btn" data-variant="neutral" data-action="${action}" data-tip="${operation.tooltip}${shortcut}" aria-label="${operation.label}">${glyph}</button>`;
}

// Nebula 顶栏右段的带文案操作按钮（预览/保存/发布）：图标 + 标签。
// 不使用 .designer-button（inline-grid 会导致图标/文字垂直堆叠），用 .topbar-text-button 独立控制布局。
// glyph 容器内同时包含原图标和 spinner，固定 13×13 尺寸，切换 loading 状态时宽度稳定无抖动。
export function labeledActionButton(
  action: keyof typeof DESIGNER_OPERATION_TEXT,
  glyph: string,
  extraClass = '',
): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? ` (${operation.shortcut})` : '';
  return `<button type="button" class="topbar-text-button ${extraClass}" data-action="${action}" data-tip="${operation.tooltip}${shortcut}" aria-label="${operation.label}"><span class="topbar-text-button-glyph">${glyph}${spinnerGlyph()}</span><span>${operation.label}</span></button>`;
}

/**
 * 菜单动作行：图标列 + 标签 + 快捷键；勾选动作的图标列同时承载 check。
 * 顶栏下拉与画布右键共用这一个行模板，外观才不会长成两套。
 */
export function menuButton(action: keyof typeof DESIGNER_OPERATION_TEXT): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const icon = menuActionIcon(action);
  const checkable = TOGGLE_MENU_ACTIONS.has(action);
  const shortcut = 'shortcut' in operation ? `<kbd>${operation.shortcut}</kbd>` : '';
  const tone = action === 'delete' ? ' data-menu-tone="danger"' : '';
  const glyph =
    icon === undefined ? '' : `<span class="menu-item-glyph">${designerIcon(icon)}</span>`;
  const check = checkable ? `<span class="menu-item-check">${designerIcon('check')}</span>` : '';
  return (
    `<button type="button" class="designer-control designer-button designer-menu-item"` +
    ` data-menu-action="${action}" role="menuitem"${tone}>` +
    `<span class="menu-item-icon" aria-hidden="true">${glyph}${check}</span>` +
    `<span class="menu-item-label">${operation.label}</span>${shortcut}</button>`
  );
}

export type DesignerMenuEntry =
  | keyof typeof DESIGNER_OPERATION_TEXT
  | 'separator'
  | { readonly label: string; readonly entries: readonly DesignerMenuEntry[] };

export type DesignerContextMenuAction = DesignerMenuEntry;

/** 子菜单触发行与动作行同网格，箭头用图标而不是文本，行高与图标列都保持一致。 */
export function submenuButton(label: string, entries: readonly DesignerMenuEntry[]): string {
  return `<div class="designer-menu-submenu-wrap">
    <button type="button" class="designer-control designer-button designer-menu-item designer-menu-submenu-trigger" data-submenu-toggle aria-haspopup="menu" aria-expanded="false" role="menuitem"><span class="menu-item-icon" aria-hidden="true">${designerIcon(menuSubmenuIcon(entries))}</span><span class="menu-item-label">${label}</span><span class="designer-menu-submenu-arrow" aria-hidden="true">${designerIcon('chevron-right')}</span></button>
    <div class="designer-menu designer-submenu" data-submenu hidden role="menu">${menuEntriesHtml(entries)}</div>
  </div>`;
}

// 顶层菜单栏触发器与面板：菜单控制器按 data-menu-toggle → data-menu 的 id 配对，
// 四个面板与触发器同属顶栏（面板保持 absolute 定位，锚点计算不变）。
export function menuTriggerButton(id: string, label: string): string {
  return `<button type="button" class="designer-menu-trigger" data-menu-toggle="${id}" aria-haspopup="menu" aria-expanded="false">${label}</button>`;
}

export function menuPanel(
  id: string,
  label: string,
  entries: readonly DesignerMenuEntry[],
): string {
  return `<div class="designer-menu" data-menu="${id}" hidden role="menu" aria-label="${label}">${menuEntriesHtml(entries)}</div>`;
}

function menuEntriesHtml(entries: readonly DesignerMenuEntry[]): string {
  return entries
    .map((entry) =>
      entry === 'separator'
        ? '<div class="designer-menu-separator" data-menu-separator role="separator"></div>'
        : typeof entry === 'string'
          ? menuButton(entry)
          : submenuButton(entry.label, entry.entries),
    )
    .join('');
}

// 画布右键菜单按右键目标动态组合；行模板与顶栏下拉同源，只有内联的分组来源不同。
export function contextMenuHtml(actions: readonly DesignerContextMenuAction[]): string {
  return menuEntriesHtml(actions);
}

/**
 * 多选菜单摘要行：左侧选择摘要，右侧把撤销/重做压成图标命令。
 * 两条历史动作若继续占整行，菜单会被推到 300px 以上；收进摘要行后总高约 266px。
 */
export function contextMenuSummaryHtml(count: number): string {
  return `<div class="designer-context-menu-heading" data-context-menu-heading>
    <span class="designer-context-menu-heading-icon" aria-hidden="true">${designerIcon('selection')}</span>
    <span class="designer-context-menu-heading-label">${DESIGNER_UI_TEXT.contextMenuSelected(count)}</span>
    <span class="designer-context-menu-heading-actions" role="group" aria-label="${DESIGNER_UI_TEXT.contextMenuHistory}">
      ${contextMenuIconAction('undo')}${contextMenuIconAction('redo')}
    </span>
  </div>`;
}

function contextMenuIconAction(action: 'undo' | 'redo'): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  return (
    `<button type="button" class="designer-control designer-button designer-menu-item designer-context-menu-icon-action"` +
    ` data-menu-action="${action}" role="menuitem" aria-label="${operation.label}"` +
    ` data-tip="${operation.label} (${operation.shortcut})">` +
    `<span class="menu-item-icon" aria-hidden="true"><span class="menu-item-glyph">${designerIcon(
      action,
    )}</span></span></button>`
  );
}

export function downloadDesignerDocument(
  ownerDocument: Document,
  filename: string,
  contents: string,
): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = ownerDocument.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  ownerDocument.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// 顶栏带文案按钮的加载指示器：与图标族同网格的 24 网格圆弧，靠 CSS 动画旋转。
function spinnerGlyph(): string {
  return '<svg class="topbar-button-spinner" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M12 3a9 9 0 1 1-9 9"/></svg>';
}

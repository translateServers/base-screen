import { DESIGNER_OPERATION_TEXT } from '../../../common/operations/designer-operation-registry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

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

export function menuButton(action: keyof typeof DESIGNER_OPERATION_TEXT): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? `<kbd>${operation.shortcut}</kbd>` : '';
  return `<button type="button" class="designer-control designer-button designer-menu-item" data-menu-action="${action}" role="menuitem"><span>${operation.label}</span>${shortcut}</button>`;
}

export type DesignerMenuEntry =
  | keyof typeof DESIGNER_OPERATION_TEXT
  | 'separator'
  | { readonly label: string; readonly entries: readonly DesignerMenuEntry[] };

export type DesignerContextMenuAction = DesignerMenuEntry;

export function submenuButton(label: string, entries: readonly DesignerMenuEntry[]): string {
  return `<div class="designer-menu-submenu-wrap">
    <button type="button" class="designer-control designer-button designer-menu-item designer-menu-submenu-trigger" data-submenu-toggle aria-haspopup="menu" aria-expanded="false" role="menuitem"><span>${label}</span><span class="designer-menu-submenu-arrow" aria-hidden="true">&gt;</span></button>
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

// 画布右键菜单按右键目标动态组合：'separator' 渲染分组分隔线。
export function contextMenuHtml(actions: readonly DesignerContextMenuAction[]): string {
  return menuEntriesHtml(actions);
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

export function redoGlyph(): string {
  return toolbarIcon('M12 6H7a3 3 0 0 0-3 3v0M11 5l2 2-2 2');
}

export function previewGlyph(): string {
  return toolbarIcon(
    'M8 5a4 4 0 0 0-5 3 4 4 0 0 0 5 3 4 4 0 0 0 5-3 4 4 0 0 0-5-3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  );
}

export function publishGlyph(): string {
  return toolbarIcon('M8 3l4 7H4zM4 12h8');
}

export function zoomOutGlyph(): string {
  return toolbarIcon('M6 8h4M4 4h8v8H4z');
}

export function zoomInGlyph(): string {
  return toolbarIcon('M6 8h4M8 6v4M4 4h8v8H4z');
}

export function zoomFitGlyph(): string {
  return toolbarIcon(
    'M6 3H4.5A1.5 1.5 0 0 0 3 4.5V6M10 3h1.5A1.5 1.5 0 0 1 13 4.5V6M13 10v1.5a1.5 1.5 0 0 1-1.5 1.5H10M6 13H4.5A1.5 1.5 0 0 1 3 11.5V10',
  );
}

function toolbarIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
}

function spinnerGlyph(): string {
  return '<svg class="topbar-button-spinner" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 2a6 6 0 1 1-6 6"/></svg>';
}

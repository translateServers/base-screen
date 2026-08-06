import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_OPERATION_TEXT } from '../../common/operations/designer-operation-registry.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolMaterialTypes,
  getDesignerToolShortcut,
} from '../../common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly BaseScreenMaterialCatalogEntry[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
): HTMLElement {
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = `
    <div class="small-screen-warning" role="alert">
      <span>${DESIGNER_UI_TEXT.smallScreenWarning}</span>
    </div>

    <aside class="rail" data-left-panel>
      <header class="panel-heading">
        <span class="panel-title">${DESIGNER_UI_TEXT.materials}</span>
        <span class="panel-count">${materials.length}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="left" title="${DESIGNER_UI_TEXT.collapseMaterials}" aria-label="${DESIGNER_UI_TEXT.collapseMaterials}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4 6 8l4 4"/></svg>
        </button>
      </header>
      <label class="designer-field material-search">
        <span class="sr-only">${DESIGNER_UI_TEXT.materialsSearch}</span>
        <input type="search" class="designer-control designer-input" data-material-search placeholder="${DESIGNER_UI_TEXT.materialsSearch}">
      </label>
      <div class="material-filters" role="group" aria-label="${DESIGNER_UI_TEXT.materialFilters}">
        <button type="button" class="designer-control designer-button" data-material-filter="all" aria-pressed="true">${DESIGNER_UI_TEXT.allMaterials}</button>
        <button type="button" class="designer-control designer-button" data-material-filter="favorite" aria-pressed="false">${DESIGNER_UI_TEXT.favoriteMaterials}</button>
        <button type="button" class="designer-control designer-button" data-material-filter="recent" aria-pressed="false">${DESIGNER_UI_TEXT.recentMaterials}</button>
      </div>
      <div class="designer-tablist rail-tabs" role="tablist" aria-label="${DESIGNER_UI_TEXT.leftPanel}">
        <button type="button" class="designer-tab" id="designer-materials-tab" role="tab" aria-controls="designer-materials-panel" aria-selected="true" data-panel-tab="materials">${DESIGNER_UI_TEXT.materials}</button>
        <button type="button" class="designer-tab" id="designer-layers-tab" role="tab" aria-controls="designer-layers-panel" aria-selected="false" data-panel-tab="layers">${DESIGNER_UI_TEXT.layers}</button>
      </div>
      <div class="rail-content" id="designer-materials-panel" role="tabpanel" aria-labelledby="designer-materials-tab" data-materials></div>
      <div class="rail-content" id="designer-layers-panel" role="tabpanel" aria-labelledby="designer-layers-tab" data-layers hidden></div>
    </aside>

    <div class="panel-handle" data-panel-handle="left" role="separator" aria-orientation="vertical"></div>

    <main class="workspace">
      <header class="designer-topbar" aria-label="${DESIGNER_UI_TEXT.topbar}">
        <div class="topbar-brand" aria-label="${DESIGNER_UI_TEXT.brand}">
          <span class="designer-brand-mark" aria-hidden="true">Bs</span>
          <span class="designer-brand-name">Base Screen</span>
          <span class="designer-brand-separator" aria-hidden="true"></span>
          <span class="designer-project-name">${DESIGNER_UI_TEXT.unnamedProject}</span>
          <span class="topbar-save-status" data-topbar-save-status>${DESIGNER_UI_TEXT.directDocument}</span>
        </div>
        <div class="topbar-group designer-tool-cluster" role="group" aria-label="${DESIGNER_UI_TEXT.tools}">
          ${DESIGNER_TOOLS.map((tool) => `<button type="button" class="designer-control designer-button designer-icon-button designer-tool-button tool-btn" data-variant="ghost" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label} (${getDesignerToolShortcut(tool.id)})" aria-label="${tool.label}">${toolGlyph(tool.id)}<kbd>${getDesignerToolShortcut(tool.id)}</kbd></button>`).join('')}
        </div>
        <div class="topbar-group" aria-label="${DESIGNER_UI_TEXT.history}">
          ${actionButton('undo', designerIcon('undo'))}
          ${actionButton('redo', redoGlyph())}
        </div>
        <div class="topbar-group" aria-label="${DESIGNER_UI_TEXT.clipboard}">
          ${actionButton('copy', copyGlyph())}
          ${actionButton('paste', pasteGlyph())}
        </div>
        <div class="topbar-group" aria-label="${DESIGNER_UI_TEXT.arrange}">
          ${actionButton('group', groupGlyph())}
          ${actionButton('ungroup', ungroupGlyph())}
          <span class="toolbar-divider"></span>
          ${actionButton('align-left', alignLeftGlyph())}
          ${actionButton('align-center', alignCenterGlyph())}
          ${actionButton('align-right', alignRightGlyph())}
          ${actionButton('align-top', alignTopGlyph())}
          ${actionButton('align-middle', alignMiddleGlyph())}
          ${actionButton('align-bottom', alignBottomGlyph())}
          <span class="toolbar-divider"></span>
          ${actionButton('distribute-horizontal', distributeHorizontalGlyph())}
          ${actionButton('distribute-vertical', distributeVerticalGlyph())}
        </div>
        <div class="topbar-spacer"></div>
        <div class="topbar-group" aria-label="${DESIGNER_UI_TEXT.project}">
          ${actionButton('project-workspace', projectGlyph())}
          ${actionButton('preview', previewGlyph())}
          ${actionButton('import', importGlyph())}
          ${actionButton('export', exportGlyph())}
          ${actionButton('project-save', designerIcon('save'))}
          ${actionButton('project-publish', publishGlyph())}
          ${actionButton('project-retry', retryGlyph())}
          ${actionButton('project-cancel', cancelGlyph())}
        </div>
        <div class="topbar-group topbar-zoom" aria-label="${DESIGNER_UI_TEXT.zoom}">
          ${actionButton('zoom-out', zoomOutGlyph())}
          <output class="zoom-value" data-zoom>100%</output>
          ${actionButton('zoom-in', zoomInGlyph())}
          ${actionButton('zoom-reset', resetZoomGlyph())}
          ${actionButton('zoom-fit', fitZoomGlyph())}
        </div>
        <div class="topbar-group" aria-label="${DESIGNER_UI_TEXT.canvasAids}">
          ${actionButton('toggle-grid', gridGlyph())}
        </div>
        <div class="designer-menu-triggers" role="menubar" aria-label="${DESIGNER_UI_TEXT.designerMenu}">
          <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="file" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.file}</button>
          <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="edit" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.edit}</button>
          <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="view" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.view}</button>
          <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="tools" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.tools}</button>
          <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="help" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.help}</button>
        </div>
        <div class="designer-menu" data-menu="file" hidden role="menu">
          ${menuButton('project-workspace')}${menuButton('import')}${menuButton('export')}${menuButton('project-save')}${menuButton('project-publish')}${menuButton('project-retry')}${menuButton('project-cancel')}
        </div>
        <div class="designer-menu" data-menu="edit" hidden role="menu">
          ${menuButton('undo')}${menuButton('redo')}${menuButton('copy')}${menuButton('paste')}${menuButton('delete')}${menuButton('duplicate')}${menuButton('group')}${menuButton('ungroup')}${menuButton('lock')}${menuButton('unlock')}${menuButton('hide')}${menuButton('bring-to-front')}${menuButton('send-to-back')}
        </div>
        <div class="designer-menu" data-menu="view" hidden role="menu">
          ${menuButton('zoom-in')}${menuButton('zoom-out')}${menuButton('zoom-fit')}${menuButton('toggle-grid')}${menuButton('toggle-guides')}${menuButton('toggle-border-guides')}
        </div>
        <div class="designer-menu" data-menu="tools" hidden role="menu">
          ${menuButton('toggle-grid')}${menuButton('toggle-guides')}${menuButton('toggle-border-guides')}${menuButton('toggle-workbench')}
        </div>
        <section class="designer-help" data-menu="help" hidden aria-label="${DESIGNER_UI_TEXT.shortcutHelp}">
          <h2>${DESIGNER_UI_TEXT.shortcuts}</h2>
          ${Object.entries(DESIGNER_OPERATION_TEXT)
            .flatMap(([id, operation]) =>
              'shortcut' in operation
                ? [
                    `<p data-help-operation="${id}">${operation.label}<kbd>${operation.shortcut}</kbd></p>`,
                  ]
                : [],
            )
            .join('')}
        </section>
      </header>

      <input type="file" accept="application/json" data-import-document hidden>

      <div class="ruler ruler-horizontal" aria-hidden="true"></div>
      <div class="canvas-stage">
        <div class="ruler ruler-vertical" aria-hidden="true"></div>
        <div class="viewport" data-viewport>
          <div class="canvas" data-canvas>
            <div class="selection" data-selection></div>
            <div class="marquee" data-marquee></div>
            <div class="canvas-guides" data-canvas-guides></div>
          </div>
        </div>
      </div>
      <div class="designer-context-menu" data-context-menu hidden role="menu" aria-label="${DESIGNER_UI_TEXT.contextMenu}" tabindex="-1"></div>

      <footer class="statusbar">
        <span class="status-pill" data-status-tool>${DESIGNER_UI_TEXT.statusTool}</span>
        <span class="status-divider"></span>
        <span class="status-item">${DESIGNER_UI_TEXT.snap}</span>
        <span class="status-item">${DESIGNER_UI_TEXT.guides}</span>
        <span class="status-item">${DESIGNER_UI_TEXT.designerMode}</span>
        <span class="status-divider"></span>
        <span data-project-status>${DESIGNER_UI_TEXT.directDocument}</span>
        <span data-project-revision></span>
        <span class="status-feedback" data-status-feedback role="status" aria-live="polite"></span>
        <output class="status-zoom" data-status-zoom aria-label="${DESIGNER_UI_TEXT.zoomRatio}">100%</output>
      </footer>
      <div class="designer-notifications" data-notifications aria-label="${DESIGNER_UI_TEXT.notifications}"></div>
    </main>

    <div class="panel-handle" data-panel-handle="right" role="separator" aria-orientation="vertical"></div>

    <aside class="properties" data-right-panel>
      <header class="panel-heading">
        <span class="panel-title">${DESIGNER_UI_TEXT.inspector}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="right" title="${DESIGNER_UI_TEXT.collapseInspector}" aria-label="${DESIGNER_UI_TEXT.collapseInspector}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
        </button>
      </header>
      <div class="inspector-tabs" role="tablist" aria-label="${DESIGNER_UI_TEXT.inspector}">
        <button type="button" class="designer-tab" id="designer-appearance-tab" role="tab" aria-controls="designer-appearance-panel" aria-selected="true" data-inspector-tab="appearance">${DESIGNER_UI_TEXT.appearance}</button>
        <button type="button" class="designer-tab" id="designer-data-tab" role="tab" aria-controls="designer-data-panel" aria-selected="false" data-inspector-tab="data">${DESIGNER_UI_TEXT.data}</button>
        <button type="button" class="designer-tab" id="designer-interaction-tab" role="tab" aria-controls="designer-interaction-panel" aria-selected="false" data-inspector-tab="interaction">${DESIGNER_UI_TEXT.interaction}</button>
        <button type="button" class="designer-tab" id="designer-events-tab" role="tab" aria-controls="designer-events-panel" aria-selected="false" data-inspector-tab="events">${DESIGNER_UI_TEXT.events}</button>
      </div>
      <div class="inspector-pane" id="designer-appearance-panel" role="tabpanel" aria-labelledby="designer-appearance-tab" data-inspector-pane="appearance">
        <div data-properties></div>
      </div>
      <div class="inspector-pane" id="designer-data-panel" role="tabpanel" aria-labelledby="designer-data-tab" data-inspector-pane="data" hidden>
        <p class="designer-empty-state" data-data-panel>${DESIGNER_UI_TEXT.dataPanelEmpty}</p>
      </div>
      <div class="inspector-pane" id="designer-interaction-panel" role="tabpanel" aria-labelledby="designer-interaction-tab" data-inspector-pane="interaction" hidden>
        <p class="designer-empty-state">${DESIGNER_UI_TEXT.interactionPanelEmpty}</p>
      </div>
      <div class="inspector-pane" id="designer-events-panel" role="tabpanel" aria-labelledby="designer-events-tab" data-inspector-pane="events" hidden>
        <div data-events-panel></div>
      </div>
    </aside>

    <section class="designer-dialog-surface project-conflict" data-project-conflict hidden role="alertdialog" aria-label="${DESIGNER_UI_TEXT.projectConflict}">
      <header>
        <span class="conflict-icon" aria-hidden="true">!</span>
        <span>${DESIGNER_UI_TEXT.conflict}</span>
      </header>
      <p>${DESIGNER_UI_TEXT.conflictDetail}</p>
      <div class="designer-dialog-actions">
        <button type="button" class="designer-control designer-button" data-variant="neutral" data-action="continue-editing">${DESIGNER_UI_TEXT.continueEditing}</button>
        <button type="button" class="designer-control designer-button" data-variant="danger" data-action="reload-remote">${DESIGNER_UI_TEXT.reloadRemote}</button>
      </div>
    </section>`;

  // Nebula 布局：单条顶栏（品牌+保存状态｜工具簇+撤销重做｜动作组+缩放+菜单），顶栏与状态栏全宽，画布与左右面板并排。
  // 顶栏与状态栏从 workspace 内移动到 grid 顶层，使其各自占据整行。
  const topbar = layout.querySelector<HTMLElement>('.designer-topbar')!;
  const statusbar = layout.querySelector<HTMLElement>('.statusbar')!;
  layout.prepend(topbar);
  layout.appendChild(statusbar);

  // 下拉菜单（含帮助面板）从顶栏移出到布局根，避免被顶栏的 overflow-x: auto
  // 裁剪上下文遮断；绝对定位相对 .designer 顶部定位，不受栅格排版影响。
  for (const menu of layout.querySelectorAll<HTMLElement>('[data-menu]')) {
    layout.appendChild(menu);
  }

  const projectWorkspace = ownerDocument.createElement('section');
  projectWorkspace.className = 'project-workspace';
  projectWorkspace.dataset.projectWorkspace = 'true';
  projectWorkspace.hidden = true;
  layout.appendChild(projectWorkspace);

  const importConfirmation = ownerDocument.createElement('section');
  importConfirmation.className = 'import-confirmation';
  importConfirmation.dataset.importConfirmation = 'true';
  importConfirmation.hidden = true;
  importConfirmation.setAttribute('role', 'alertdialog');
  importConfirmation.ariaLabel = DESIGNER_UI_TEXT.importConfirm;
  importConfirmation.innerHTML = `
    <div class="designer-dialog-surface import-confirmation-card">
      <header>
        <span class="import-icon" aria-hidden="true">?</span>
        <span>${DESIGNER_UI_TEXT.importReplace}</span>
      </header>
      <p>${DESIGNER_UI_TEXT.importWarning}</p>
      <div class="designer-dialog-actions">
        <button type="button" class="designer-control designer-button" data-variant="neutral" data-action="import-cancel">${DESIGNER_UI_TEXT.cancel}</button>
        <button type="button" class="designer-control designer-button" data-variant="danger" data-action="import-confirm">${DESIGNER_UI_TEXT.importConfirm}</button>
      </div>
    </div>`;
  layout.appendChild(importConfirmation);

  const blueprint = ownerDocument.createElement('section');
  blueprint.className = 'blueprint-workspace';
  blueprint.dataset.blueprintWorkspace = 'true';
  blueprint.hidden = true;
  layout.appendChild(blueprint);

  const materialsRail = layout.querySelector<HTMLElement>('[data-materials]')!;
  for (const entry of materials) {
    materialsRail.appendChild(createMaterialCard(ownerDocument, entry));
  }
  for (const tool of DESIGNER_TOOLS) {
    const control = layout.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`)!;
    control.disabled = tool.materialKey !== undefined && toolMaterialTypes?.[tool.id] === undefined;
  }
  return layout;
}

function actionButton(action: keyof typeof DESIGNER_OPERATION_TEXT, glyph: string): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? ` (${operation.shortcut})` : '';
  return `<button type="button" class="designer-control designer-button designer-icon-button toolbar-btn" data-variant="neutral" data-action="${action}" title="${operation.tooltip}${shortcut}" aria-label="${operation.label}">${glyph}</button>`;
}

function menuButton(action: keyof typeof DESIGNER_OPERATION_TEXT): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? `<kbd>${operation.shortcut}</kbd>` : '';
  return `<button type="button" class="designer-control designer-button designer-menu-item" data-menu-action="${action}" role="menuitem"><span>${operation.label}</span>${shortcut}</button>`;
}

export type DesignerContextMenuAction = keyof typeof DESIGNER_OPERATION_TEXT | 'separator';

// 画布右键菜单按右键目标动态组合：'separator' 渲染分组分隔线。
export function contextMenuHtml(actions: readonly DesignerContextMenuAction[]): string {
  return actions
    .map((action) =>
      action === 'separator'
        ? '<div class="designer-menu-separator" data-menu-separator role="separator"></div>'
        : menuButton(action),
    )
    .join('');
}

function toolGlyph(id: string): string {
  switch (id) {
    case 'select':
      return designerIcon('pointer');
    case 'hand':
      return toolIcon('M5 6.5a1.5 1.5 0 0 1 3 0V8h1V5a1.5 1.5 0 0 1 3 0v6.5a3.5 3.5 0 1 1-7 0z');
    case 'text':
      return toolIcon('M5 4h6M8 4v8M6 12h4');
    case 'rectangle':
      return toolIcon('M3 4h10v8H3z');
    case 'ellipse':
      return toolIcon('M8 3.5a4.5 3 0 1 0 0 6 4.5 3 0 0 0 0-6z');
    case 'image':
      return toolIcon('M3 5h10v6H3zm0 4 3-2 2 2 3-3 2 2');
    case 'zoom':
      return toolIcon('M6.5 6.5a3 3 0 1 0 0 0M10 10l3 3');
  }
  return '';
}

function toolIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
}

function createMaterialCard(
  ownerDocument: Document,
  entry: BaseScreenMaterialCatalogEntry,
): HTMLElement {
  const card = ownerDocument.createElement('div');
  card.className = 'material-card-wrap';
  card.dataset.materialCard = entry.manifest.type;
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button material-card';
  button.dataset.materialType = entry.manifest.type;
  // 物料卡片可拖拽到画布新增组件：dragstart 由 DesignerPanelController 写入物料类型到 dataTransfer。
  button.draggable = true;
  button.innerHTML = `<span class="material-thumb" aria-hidden="true"></span><span class="material-name">${entry.manifest.name}</span><span class="material-type">${entry.manifest.type}</span>`;
  const favorite = ownerDocument.createElement('button');
  favorite.type = 'button';
  favorite.className = 'designer-control designer-button material-favorite';
  favorite.dataset.materialFavorite = entry.manifest.type;
  favorite.ariaLabel = DESIGNER_UI_TEXT.favoriteMaterial(entry.manifest.name);
  favorite.ariaPressed = 'false';
  favorite.textContent = '☆';
  card.append(button, favorite);
  return card;
}

function redoGlyph(): string {
  return toolbarIcon('M12 6H7a3 3 0 0 0-3 3v0M11 5l2 2-2 2');
}

function copyGlyph(): string {
  return toolbarIcon(
    'M5 4h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 0V3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1',
  );
}

function pasteGlyph(): string {
  return toolbarIcon(
    'M5 4h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1-1h4M8 2v2',
  );
}

function groupGlyph(): string {
  return toolbarIcon('M4 5h8v6H4z');
}

function ungroupGlyph(): string {
  return toolbarIcon('M3 4h4v4H3zm6 4h4v4H9z');
}

function alignLeftGlyph(): string {
  return toolbarIcon('M3 3v10M5 5h6M5 9h4');
}

function alignCenterGlyph(): string {
  return toolbarIcon('M8 3v10M5 5h6M4 9h8');
}

function alignRightGlyph(): string {
  return toolbarIcon('M13 3v10M11 5H5M11 9H7');
}

function alignTopGlyph(): string {
  return toolbarIcon('M3 3h10M5 5v6M9 5v4');
}

function alignMiddleGlyph(): string {
  return toolbarIcon('M3 8h10M5 5v6M9 4v8');
}

function alignBottomGlyph(): string {
  return toolbarIcon('M3 13h10M5 5v6M9 7v4');
}

function distributeHorizontalGlyph(): string {
  return toolbarIcon('M3 4v8M13 4v8M7 7h2M7 9h2');
}

function distributeVerticalGlyph(): string {
  return toolbarIcon('M4 3h8M4 13h8M7 7v2M9 7v2');
}

function previewGlyph(): string {
  return toolbarIcon(
    'M8 5a4 4 0 0 0-5 3 4 4 0 0 0 5 3 4 4 0 0 0 5-3 4 4 0 0 0-5-3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  );
}

function projectGlyph(): string {
  return toolbarIcon('M3 5h10v8H3zM3 5l2-2h3l2 2M5 8h6M5 10h4');
}

function importGlyph(): string {
  return toolbarIcon('M8 3v8M5 7l3 3 3-3M4 12h8');
}

function exportGlyph(): string {
  return toolbarIcon('M8 5v8M5 9l3-3 3 3M4 12h8');
}

function publishGlyph(): string {
  return toolbarIcon('M8 3l4 7H4zM4 12h8');
}

function retryGlyph(): string {
  return toolbarIcon('M13 8a5 5 0 1 1-2-4M13 4v4H9');
}

function cancelGlyph(): string {
  return toolbarIcon('M4 4l8 8M12 4l-8 8');
}

function zoomOutGlyph(): string {
  return toolbarIcon('M6 8h4M4 4h8v8H4z');
}

function zoomInGlyph(): string {
  return toolbarIcon('M6 8h4M8 6v4M4 4h8v8H4z');
}

function resetZoomGlyph(): string {
  return toolbarIcon('M4 4h8v8H4zM6 8h4');
}

function fitZoomGlyph(): string {
  return toolbarIcon('M3 6h3V3M10 3v3h3M3 10h3v3M13 10h-3v3');
}

function gridGlyph(): string {
  return toolbarIcon('M3 4h10v8H3zM7 4v8M11 4v8M3 6h10M3 10h10');
}

function toolbarIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
}

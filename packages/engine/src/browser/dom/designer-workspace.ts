import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_OPERATION_TEXT } from '../../common/operations/designer-operation-registry.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolMaterialTypes,
  getDesignerToolShortcut,
} from '../../common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { BaseScreenDesignerLeftPanelGroup } from '../../designer-left-panel-groups.js';
import type { BaseScreenMaterialLibraryGrouping } from '../../material-library-grouping.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../material-library-items.js';
import type { BaseScreenMaterialLibraryState } from '../../material-library-state.js';
import { designerIcon, designerToolGlyph } from '../ui/designer-icons.js';
import { renderDesignerLeftPanelGroups } from './designer-left-panel-groups-dom.js';
import {
  populateMaterialLibrary,
  visibleLibraryMaterials,
} from './designer-material-library-dom.js';

// 工具图标供 controllers 层消费（controllers 可依赖 dom，但不得直接依赖 ui 叶子层）。
export { designerToolGlyph };

// Nebula 缩放下拉预设（状态栏缩放百分比菜单）。
const DESIGNER_ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200] as const;

const SHORTCUT_HELP_SECTIONS = [
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

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly (BaseScreenMaterialCatalogEntry | BaseScreenResolvedMaterialLibraryItem)[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
  materialLibraryState?: BaseScreenMaterialLibraryState,
  materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping,
  leftPanelGroups?: readonly BaseScreenDesignerLeftPanelGroup[],
): HTMLElement {
  const visibleMaterials = visibleLibraryMaterials(materials);
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = `
    <div class="small-screen-warning" role="alert">
      <span>${DESIGNER_UI_TEXT.smallScreenWarning}</span>
    </div>

    <section class="designer-command-palette" data-command-palette hidden role="dialog" aria-modal="true" aria-label="${DESIGNER_UI_TEXT.commandPalette.dialog}">
      <div class="designer-command-palette-card">
        <label class="designer-command-palette-search">
          <span aria-hidden="true">${designerIcon('search')}</span>
          <input id="designer-command-palette-input" type="search" class="designer-control designer-input" data-command-palette-search autocomplete="off" spellcheck="false" placeholder="${DESIGNER_UI_TEXT.commandPalette.placeholder}" aria-label="${DESIGNER_UI_TEXT.commandPalette.trigger}" aria-controls="designer-command-palette-results">
          <kbd>/</kbd>
        </label>
        <div class="designer-command-palette-results" id="designer-command-palette-results" data-command-palette-results role="listbox" aria-label="${DESIGNER_UI_TEXT.commandPalette.dialog}"></div>
        <p class="designer-command-palette-empty" data-command-palette-empty hidden>${DESIGNER_UI_TEXT.commandPalette.empty}</p>
        <footer>${DESIGNER_UI_TEXT.commandPalette.hint}</footer>
      </div>
    </section>

    <aside class="rail" id="designer-left-panel" data-left-panel aria-labelledby="designer-left-panel-title">
      <header class="panel-heading">
        <span class="panel-title" id="designer-left-panel-title" data-left-panel-title>${DESIGNER_UI_TEXT.materials}</span>
        <span class="panel-count" id="designer-left-panel-count" role="status" aria-label="${DESIGNER_UI_TEXT.leftPanelCount(DESIGNER_UI_TEXT.materials, visibleMaterials.length)}" aria-live="polite" aria-atomic="true" data-material-count data-left-panel-count data-material-total="${visibleMaterials.length}">${visibleMaterials.length}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="left" title="${DESIGNER_UI_TEXT.collapseMaterials}" aria-label="${DESIGNER_UI_TEXT.collapseMaterials}" aria-controls="designer-left-panel" aria-expanded="true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4 6 8l4 4"/></svg>
        </button>
      </header>
      <div class="rail-tabs" role="tablist" aria-label="${DESIGNER_UI_TEXT.leftPanel}">
        <button type="button" class="designer-tab" id="designer-materials-tab" role="tab" aria-controls="designer-materials-panel" aria-selected="true" data-panel-tab="materials" title="${DESIGNER_UI_TEXT.materials}">
          <span class="rail-tab-glyph" aria-hidden="true">${designerIcon('grid')}</span>
          <span class="rail-tab-label">${DESIGNER_UI_TEXT.materials}</span>
        </button>
        <button type="button" class="designer-tab" id="designer-layers-tab" role="tab" aria-controls="designer-layers-panel" aria-selected="false" data-panel-tab="layers" title="${DESIGNER_UI_TEXT.layers}">
          <span class="rail-tab-glyph" aria-hidden="true">${designerIcon('layers')}</span>
          <span class="rail-tab-label">${DESIGNER_UI_TEXT.layers}</span>
        </button>
        <button type="button" class="designer-tab" id="designer-variables-tab" role="tab" aria-controls="designer-variables-panel" aria-selected="false" data-panel-tab="variables" title="${DESIGNER_UI_TEXT.variables.title}">
          <span class="rail-tab-glyph" aria-hidden="true">${designerIcon('variable')}</span>
          <span class="rail-tab-label">${DESIGNER_UI_TEXT.variables.title}</span>
        </button>
      </div>
      <div class="rail-view" id="designer-materials-panel" role="tabpanel" aria-labelledby="designer-materials-tab" data-materials>
        <div class="material-library-toolbar" data-material-library-toolbar>
          <div class="material-search">
            <span class="material-search-glyph" aria-hidden="true">${designerIcon('search')}</span>
            <input type="search" class="designer-control designer-input" data-material-search placeholder="${DESIGNER_UI_TEXT.materialsSearch}" aria-label="${DESIGNER_UI_TEXT.materialsSearch}" aria-describedby="designer-left-panel-count">
            <button type="button" class="designer-control designer-button designer-icon-button material-search-clear" data-variant="ghost" data-material-search-clear title="${DESIGNER_UI_TEXT.clearMaterialSearch}" aria-label="${DESIGNER_UI_TEXT.clearMaterialSearch}" hidden>
              ${designerIcon('x')}
            </button>
          </div>
          <div class="material-filters" role="group" aria-label="${DESIGNER_UI_TEXT.materialFilters}">
            <button type="button" class="designer-control designer-button" data-material-filter="all" aria-pressed="true">${DESIGNER_UI_TEXT.allMaterials}</button>
            <button type="button" class="designer-control designer-button" data-material-filter="favorite" aria-pressed="false">${DESIGNER_UI_TEXT.favoriteMaterials}</button>
            <button type="button" class="designer-control designer-button" data-material-filter="recent" aria-pressed="false">${DESIGNER_UI_TEXT.recentMaterials}</button>
          </div>
          <nav class="material-group-navigation" data-material-groups aria-label="${DESIGNER_UI_TEXT.materialGroups}" hidden></nav>
          <div class="material-categories" data-material-categories role="group" aria-label="${DESIGNER_UI_TEXT.materialCategories}"></div>
        </div>
        <div class="material-grid" data-material-grid></div>
        <p class="designer-empty-state material-search-empty" data-material-search-empty hidden>${DESIGNER_UI_TEXT.materialSearchEmpty}</p>
      </div>
      <div class="rail-view" id="designer-layers-panel" role="tabpanel" aria-labelledby="designer-layers-tab" data-layers hidden></div>
      <div class="rail-view" id="designer-variables-panel" role="tabpanel" aria-labelledby="designer-variables-tab" data-variables hidden></div>
    </aside>

    <div class="panel-handle" data-panel-handle="left" role="separator" aria-orientation="vertical"></div>

    <main class="workspace">
      <header class="designer-topbar" aria-label="${DESIGNER_UI_TEXT.topbar}">
        <div class="topbar-brand">
          <span class="topbar-product-mark" aria-hidden="true">${designerIcon('shapes')}</span>
          <span class="topbar-project-meta">
            <span class="designer-project-name">${DESIGNER_UI_TEXT.unnamedProject}</span>
            <span class="topbar-save-status" data-topbar-save-status>${DESIGNER_UI_TEXT.directDocument}</span>
          </span>
          <span class="topbar-mode-switch" role="group" aria-label="${DESIGNER_UI_TEXT.interactionWorkspace}">
            <span class="topbar-mode-button" data-active="true" aria-current="page">${designerIcon('grid')}<span>${DESIGNER_UI_TEXT.canvasWorkspace}</span></span>
            <button type="button" class="topbar-mode-button" data-action="open-blueprint" title="${DESIGNER_UI_TEXT.interactionWorkspaceHint}" aria-label="${DESIGNER_UI_TEXT.interactionWorkspaceHint}">${designerIcon('variable')}<span>${DESIGNER_UI_TEXT.interactionWorkspace}</span></button>
          </span>
        </div>
        <div class="topbar-center">
          <div class="topbar-segment designer-tool-cluster" role="group" aria-label="${DESIGNER_UI_TEXT.tools}">
            ${DESIGNER_TOOLS.map((tool) => `<button type="button" class="designer-control designer-button designer-icon-button designer-tool-button tool-btn" data-variant="ghost" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label} (${getDesignerToolShortcut(tool.id)})" aria-label="${tool.label}">${designerToolGlyph(tool.id)}<kbd>${getDesignerToolShortcut(tool.id)}</kbd></button>`).join('')}
          </div>
          <div class="topbar-segment" role="group" aria-label="${DESIGNER_UI_TEXT.history}">
            ${actionButton('undo', designerIcon('undo'))}
            ${actionButton('redo', redoGlyph())}
          </div>
          <button type="button" class="topbar-search-trigger" data-command-palette-toggle aria-expanded="false" aria-controls="designer-command-palette-input" aria-label="${DESIGNER_UI_TEXT.commandPalette.trigger}" title="${DESIGNER_UI_TEXT.commandPalette.trigger}">
            ${designerIcon('search')}
            <span>${DESIGNER_UI_TEXT.commandPalette.trigger}</span>
            <kbd>/</kbd>
          </button>
        </div>
        <div class="topbar-actions">
          <div class="topbar-segment topbar-zoom" role="group" aria-label="${DESIGNER_UI_TEXT.zoom}">
            ${actionButton('zoom-out', zoomOutGlyph())}
            <output class="zoom-value" data-zoom>100%</output>
            ${actionButton('zoom-in', zoomInGlyph())}
          </div>
          <span class="topbar-divider" aria-hidden="true"></span>
          <div class="designer-menu-triggers" role="menubar" aria-label="${DESIGNER_UI_TEXT.designerMenu}">
            <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="file" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.file}</button>
            <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="edit" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.edit}</button>
            <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="view" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.view}</button>
            <button type="button" class="designer-control designer-button designer-menu-trigger" data-variant="ghost" data-menu-toggle="tools" aria-expanded="false" role="menuitem">${DESIGNER_UI_TEXT.tools}</button>
          </div>
          <span class="topbar-divider" aria-hidden="true"></span>
          ${labeledActionButton('preview', previewGlyph())}
          ${labeledActionButton('project-save', designerIcon('save'))}
          ${labeledActionButton('project-publish', publishGlyph(), 'topbar-publish')}
        </div>
        <div class="designer-menu" data-menu="file" hidden role="menu">
          ${menuButton('project-workspace')}${menuButton('import')}${menuButton('export')}
          <div class="designer-menu-separator" role="separator"></div>
          ${menuButton('project-save')}${menuButton('project-publish')}${menuButton('project-retry')}${menuButton('project-cancel')}
        </div>
        <div class="designer-menu" data-menu="edit" hidden role="menu">
          ${menuButton('undo')}${menuButton('redo')}
          <div class="designer-menu-separator" role="separator"></div>
          ${menuButton('copy')}${menuButton('paste')}${menuButton('duplicate')}${menuButton('delete')}
          <div class="designer-menu-separator" role="separator"></div>
          ${menuButton('group')}${menuButton('ungroup')}
          ${submenuButton(DESIGNER_UI_TEXT.arrange, [
            'align-left',
            'align-center',
            'align-right',
            'align-top',
            'align-middle',
            'align-bottom',
            'separator',
            'distribute-horizontal',
            'distribute-vertical',
          ])}
          ${submenuButton(DESIGNER_UI_TEXT.layer, ['bring-to-front', 'send-to-back', 'lock', 'unlock', 'hide'])}
        </div>
        <div class="designer-menu" data-menu="view" hidden role="menu">
          ${menuButton('zoom-in')}${menuButton('zoom-out')}${menuButton('zoom-reset')}${menuButton('zoom-fit')}
          ${submenuButton(DESIGNER_UI_TEXT.canvasAids, ['toggle-grid', 'toggle-guides', 'toggle-border-guides'])}
        </div>
        <div class="designer-menu" data-menu="tools" hidden role="menu">
          ${menuButton('toggle-workbench')}${menuButton('show-help')}
        </div>
      </header>

      <input type="file" accept="application/json" data-import-document hidden>

      <div class="ruler-corner" aria-hidden="true">${DESIGNER_UI_TEXT.rulerCornerUnit}</div>
      <div class="ruler ruler-horizontal" aria-hidden="true"><canvas class="ruler-canvas" data-ruler-canvas></canvas></div>
      <div class="canvas-stage">
        <div class="ruler ruler-vertical" aria-hidden="true"><canvas class="ruler-canvas" data-ruler-canvas></canvas></div>
        <div class="viewport" data-viewport>
          <div class="canvas" data-canvas>
            <div class="selection" data-selection></div>
            <div class="marquee" data-marquee></div>
            <div class="canvas-guides" data-canvas-guides></div>
          </div>
        </div>
      </div>
      <section class="designer-data-workbench" data-data-workbench hidden aria-label="${DESIGNER_UI_TEXT.dataSource.workbench}">
        <div data-data-workbench-content></div>
      </section>
      <div class="designer-context-menu" data-context-menu hidden role="menu" aria-label="${DESIGNER_UI_TEXT.contextMenu}" tabindex="-1"></div>

      <!-- Nebula-style status bar: left (tool + selection + project state) | center (canvas size) | right (Snap/Guide toggles + design mode + zoom menu). -->
      <footer class="statusbar">
        <div class="statusbar-group statusbar-start">
          <span class="status-tool" data-status-tool>${designerToolGlyph('select')}<span class="status-tool-name">${DESIGNER_TOOLS.find((tool) => tool.id === 'select')?.label ?? ''}</span></span>
          <span class="status-divider" aria-hidden="true"></span>
          <span class="status-selection" data-status-selection>${DESIGNER_UI_TEXT.nothingSelected}</span>
          <span class="status-divider" aria-hidden="true"></span>
          <span class="status-project" data-project-status>${DESIGNER_UI_TEXT.directDocument}</span>
          <span class="status-revision" data-project-revision></span>
          <span class="status-feedback" data-status-feedback role="status" aria-live="polite"></span>
        </div>
        <div class="statusbar-group statusbar-center">
          <span class="status-canvas" data-status-canvas aria-label="${DESIGNER_UI_TEXT.canvasSize}"></span>
        </div>
        <div class="statusbar-group statusbar-end">
          <button type="button" class="status-toggle" data-status-toggle="snap" role="switch" aria-checked="true" aria-label="${DESIGNER_UI_TEXT.snap}">
            <span class="status-toggle-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.snap}</span>
          </button>
          <button type="button" class="status-toggle" data-status-toggle="guides" role="switch" aria-checked="true" aria-label="${DESIGNER_UI_TEXT.guides}">
            <span class="status-toggle-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.guides}</span>
          </button>
          <span class="status-divider" aria-hidden="true"></span>
          <button type="button" class="status-toggle" data-status-toggle="native-events" role="switch" aria-checked="false" aria-label="${DESIGNER_UI_TEXT.nativeEvent}">
            <span class="status-toggle-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.nativeEvent}</span>
          </button>
          <span class="status-divider" aria-hidden="true"></span>
          <button type="button" class="designer-control designer-button status-console-trigger" data-error-console-toggle aria-controls="designer-error-console" aria-expanded="false" aria-label="${DESIGNER_UI_TEXT.errorConsole.openAria}" title="${DESIGNER_UI_TEXT.errorConsole.openAria}">
            ${designerIcon('terminal')}<span class="status-console-label">${DESIGNER_UI_TEXT.errorConsole.trigger}</span><span class="status-console-count" data-error-console-count></span>
          </button>
          <span class="status-divider" aria-hidden="true"></span>
          <button type="button" class="designer-control designer-button status-zoom-trigger" data-menu-toggle="status-zoom" data-status-zoom aria-haspopup="menu" aria-expanded="false" aria-label="${DESIGNER_UI_TEXT.zoomRatio}">100%</button>
          <div class="designer-menu status-zoom-menu" data-menu="status-zoom" hidden role="menu" aria-label="${DESIGNER_UI_TEXT.zoomRatio}">
            ${DESIGNER_ZOOM_PRESETS.map((percent) => `<button type="button" class="designer-control designer-button designer-menu-item" data-status-zoom-preset="${percent}" role="menuitem"><span>${percent}%</span></button>`).join('')}
          </div>
        </div>
      </footer>
      <div class="designer-notifications" data-notifications aria-label="${DESIGNER_UI_TEXT.notifications}"></div>
      <section class="designer-error-console" id="designer-error-console" data-error-console role="dialog" aria-modal="true" aria-labelledby="designer-error-console-title" hidden>
        <div class="error-console-card">
          <header>
            <div class="error-console-heading">
              <h2 id="designer-error-console-title">${DESIGNER_UI_TEXT.errorConsole.title}</h2>
              <span data-error-console-summary></span>
            </div>
            <div class="error-console-actions">
              <button type="button" class="designer-control designer-button error-console-clear" data-error-console-clear>${DESIGNER_UI_TEXT.errorConsole.clear}</button>
              <button type="button" class="designer-control designer-button designer-icon-button error-console-close" data-variant="ghost" data-error-console-close aria-label="${DESIGNER_UI_TEXT.errorConsole.closeAria}" title="${DESIGNER_UI_TEXT.errorConsole.closeAria}">${designerIcon('x')}</button>
            </div>
          </header>
          <section class="error-console-current" data-material-library-status aria-label="${DESIGNER_UI_TEXT.materialLibrary.label}" hidden></section>
          <div class="error-console-list" data-error-console-list role="log" aria-live="polite"></div>
        </div>
      </section>
    </main>

    <div class="panel-handle" data-panel-handle="right" role="separator" aria-orientation="vertical"></div>

    <aside class="properties" id="designer-right-panel" data-right-panel aria-labelledby="designer-right-panel-title">
      <header class="panel-heading">
        <span class="panel-title" id="designer-right-panel-title" data-right-panel-title>${DESIGNER_UI_TEXT.inspectorUi.canvasConfiguration}</span>
        <span class="panel-collapsed-label" aria-hidden="true">${DESIGNER_UI_TEXT.inspector}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="right" title="${DESIGNER_UI_TEXT.collapseInspector}" aria-label="${DESIGNER_UI_TEXT.collapseInspector}" aria-controls="designer-right-panel" aria-expanded="true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
        </button>
      </header>
      <div class="inspector-tabs" role="tablist" aria-label="${DESIGNER_UI_TEXT.inspector}">
        <button type="button" class="designer-tab" id="designer-appearance-tab" role="tab" aria-controls="designer-appearance-panel" aria-selected="true" data-inspector-tab="appearance"><span class="inspector-tab-icon">${designerIcon('sliders')}</span><span>${DESIGNER_UI_TEXT.appearance}</span></button>
        <button type="button" class="designer-tab" id="designer-data-tab" role="tab" aria-controls="designer-data-panel" aria-selected="false" data-inspector-tab="data"><span class="inspector-tab-icon">${designerIcon('grid')}</span><span>${DESIGNER_UI_TEXT.inspectorUi.dataSource}</span></button>
        <button type="button" class="designer-tab" id="designer-interaction-tab" role="tab" aria-controls="designer-interaction-panel" aria-selected="false" data-inspector-tab="interaction"><span class="inspector-tab-icon">${designerIcon('cube')}</span><span>${DESIGNER_UI_TEXT.inspectorUi.advanced}</span></button>
      </div>
      <div class="inspector-context" data-inspector-context></div>
      <div class="inspector-toolbar">
        <button type="button" class="designer-control designer-button designer-icon-button inspector-search-launch" data-variant="ghost" data-inspector-search-launch title="${DESIGNER_UI_TEXT.inspectorUi.searchLaunch}" aria-label="${DESIGNER_UI_TEXT.inspectorUi.searchLaunch}">${designerIcon('search')}</button>
        <div class="inspector-density" role="group" aria-label="${DESIGNER_UI_TEXT.inspector}">
          <button type="button" class="designer-tab" data-inspector-density="basic" aria-pressed="true">${DESIGNER_UI_TEXT.inspectorUi.basic}</button>
          <button type="button" class="designer-tab" data-inspector-density="all" aria-pressed="false">${DESIGNER_UI_TEXT.inspectorUi.all}</button>
        </div>
      </div>
      <section class="inspector-search-workspace" data-inspector-search-workspace aria-label="${DESIGNER_UI_TEXT.inspectorUi.searchLaunch}" hidden>
        <header class="inspector-search-workspace-header">
          <button type="button" class="designer-control designer-button designer-icon-button inspector-search-back" data-variant="ghost" data-inspector-search-close title="${DESIGNER_UI_TEXT.inspectorUi.searchBack}" aria-label="${DESIGNER_UI_TEXT.inspectorUi.searchBack}">${designerIcon('chevron-left')}</button>
          <strong>${DESIGNER_UI_TEXT.inspectorUi.searchLaunch}</strong>
          <span class="inspector-search-workspace-icon" aria-hidden="true">${designerIcon('copy')}</span>
        </header>
        <label class="inspector-search">
          <span aria-hidden="true">${designerIcon('search')}</span>
          <input type="search" class="designer-control designer-input" data-inspector-search placeholder="${DESIGNER_UI_TEXT.inspectorUi.search}" aria-label="${DESIGNER_UI_TEXT.inspectorUi.searchAria}">
        </label>
        <div class="inspector-search-instructions">
          <span>${DESIGNER_UI_TEXT.inspectorUi.searchJumpHint}</span>
          <span>${DESIGNER_UI_TEXT.inspectorUi.searchReuseHint}</span>
        </div>
        <div class="inspector-search-results" data-inspector-search-results hidden></div>
      </section>
      <div class="inspector-pane" id="designer-appearance-panel" role="tabpanel" aria-labelledby="designer-appearance-tab" data-inspector-pane="appearance">
        <div data-properties></div>
      </div>
      <div class="inspector-pane" id="designer-data-panel" role="tabpanel" aria-labelledby="designer-data-tab" data-inspector-pane="data" hidden>
        <p class="designer-empty-state" data-data-panel>${DESIGNER_UI_TEXT.dataPanelEmpty}</p>
      </div>
      <div class="inspector-pane" id="designer-interaction-panel" role="tabpanel" aria-labelledby="designer-interaction-tab" data-inspector-pane="interaction" hidden>
        <p class="designer-empty-state">${DESIGNER_UI_TEXT.interactionPanelEmpty}</p>
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
        <span data-import-title>${DESIGNER_UI_TEXT.importReplace}</span>
      </header>
      <div data-import-body></div>
    </div>`;
  layout.appendChild(importConfirmation);

  const helpDialog = ownerDocument.createElement('section');
  helpDialog.className = 'designer-help-dialog';
  helpDialog.dataset.helpDialog = 'true';
  helpDialog.hidden = true;
  helpDialog.setAttribute('role', 'dialog');
  helpDialog.setAttribute('aria-modal', 'true');
  helpDialog.ariaLabel = DESIGNER_UI_TEXT.shortcutHelp;
  helpDialog.innerHTML = `
    <div class="designer-dialog-surface help-card">
      <header>
        <div class="help-heading">
          <span>${DESIGNER_UI_TEXT.shortcuts}</span>
          <p>${DESIGNER_UI_TEXT.shortcutHelpIntro}</p>
        </div>
        <button type="button" class="designer-control designer-button designer-icon-button help-close" data-variant="ghost" data-help-close aria-label="${DESIGNER_UI_TEXT.helpClose}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </header>
      <div class="help-content">
        ${SHORTCUT_HELP_SECTIONS.map(
          ({ title, operationIds }) => `<section class="help-section">
            <h3>${title}</h3>
            <div class="help-shortcuts">
              ${operationIds
                .flatMap((id) => {
                  const operation = DESIGNER_OPERATION_TEXT[id];
                  return 'shortcut' in operation
                    ? [
                        `<p data-help-operation="${id}"><span>${operation.label}</span><kbd>${operation.shortcut}</kbd></p>`,
                      ]
                    : [];
                })
                .join('')}
            </div>
          </section>`,
        ).join('')}
      </div>
    </div>`;
  layout.appendChild(helpDialog);

  renderDesignerLeftPanelGroups(layout, leftPanelGroups);
  populateMaterialLibrary(layout, materials, materialLibraryState, materialLibraryGrouping);
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

// Nebula 顶栏右段的带文案操作按钮（预览/保存/发布）：图标 + 标签。
// 不使用 .designer-button（inline-grid 会导致图标/文字垂直堆叠），用 .topbar-text-button 独立控制布局。
// glyph 容器内同时包含原图标和 spinner，固定 13×13 尺寸，切换 loading 状态时宽度稳定无抖动。
function labeledActionButton(
  action: keyof typeof DESIGNER_OPERATION_TEXT,
  glyph: string,
  extraClass = '',
): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? ` (${operation.shortcut})` : '';
  return `<button type="button" class="topbar-text-button ${extraClass}" data-action="${action}" title="${operation.tooltip}${shortcut}" aria-label="${operation.label}"><span class="topbar-text-button-glyph">${glyph}${spinnerGlyph()}</span><span>${operation.label}</span></button>`;
}

function menuButton(action: keyof typeof DESIGNER_OPERATION_TEXT): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  const shortcut = 'shortcut' in operation ? `<kbd>${operation.shortcut}</kbd>` : '';
  return `<button type="button" class="designer-control designer-button designer-menu-item" data-menu-action="${action}" role="menuitem"><span>${operation.label}</span>${shortcut}</button>`;
}

export type DesignerMenuEntry =
  | keyof typeof DESIGNER_OPERATION_TEXT
  | 'separator'
  | { readonly label: string; readonly entries: readonly DesignerMenuEntry[] };

export type DesignerContextMenuAction = DesignerMenuEntry;

function submenuButton(label: string, entries: readonly DesignerMenuEntry[]): string {
  return `<div class="designer-menu-submenu-wrap">
    <button type="button" class="designer-control designer-button designer-menu-item designer-menu-submenu-trigger" data-submenu-toggle aria-haspopup="menu" aria-expanded="false" role="menuitem"><span>${label}</span><span class="designer-menu-submenu-arrow" aria-hidden="true">&gt;</span></button>
    <div class="designer-menu designer-submenu" data-submenu hidden role="menu">${menuEntriesHtml(entries)}</div>
  </div>`;
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

// 物料库 DOM（网格卡片、分类派生、状态投影）沉淀在独立模块；为兼容既有消费方在此转发导出。
export {
  materialCategoryHue,
  materialCategoryIcon,
  materialLibraryActions,
  materialLibraryCategories,
  orderedMaterialLibraryMaterials,
  populateMaterialLibrary,
  renderMaterialLibraryState,
  visibleLibraryMaterials,
} from './designer-material-library-dom.js';

// 浏览器原生下载：以 application/json Blob 生成 .json 文件（导入使用文件选择器，导出使用下载锚点）。
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

function redoGlyph(): string {
  return toolbarIcon('M12 6H7a3 3 0 0 0-3 3v0M11 5l2 2-2 2');
}

function previewGlyph(): string {
  return toolbarIcon(
    'M8 5a4 4 0 0 0-5 3 4 4 0 0 0 5 3 4 4 0 0 0 5-3 4 4 0 0 0-5-3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  );
}

function publishGlyph(): string {
  return toolbarIcon('M8 3l4 7H4zM4 12h8');
}

function zoomOutGlyph(): string {
  return toolbarIcon('M6 8h4M4 4h8v8H4z');
}

function zoomInGlyph(): string {
  return toolbarIcon('M6 8h4M8 6v4M4 4h8v8H4z');
}

function toolbarIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
}

function spinnerGlyph(): string {
  return '<svg class="topbar-button-spinner" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 2a6 6 0 1 1-6 6"/></svg>';
}

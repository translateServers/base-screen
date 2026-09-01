import { BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT } from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_TOOLS, getDesignerToolShortcut } from '../../../common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon, designerToolGlyph } from '../../ui/designer-icons.js';
import {
  actionButton,
  coordinateEntryField,
  DESIGNER_ZOOM_PRESETS,
  labeledActionButton,
  previewGlyph,
  publishGlyph,
  redoGlyph,
  sizeEntryField,
  submenuButton,
  zoomInGlyph,
  zoomOutGlyph,
} from './designer-workspace-template.js';

export function designerWorkspaceMarkup(visibleMaterialCount: number): string {
  return `
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
        <span class="panel-count" id="designer-left-panel-count" role="status" aria-label="${DESIGNER_UI_TEXT.leftPanelCount(DESIGNER_UI_TEXT.materials, visibleMaterialCount)}" aria-live="polite" aria-atomic="true" data-material-count data-left-panel-count data-material-total="${visibleMaterialCount}">${visibleMaterialCount}</span>
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
      <div class="blueprint-library" data-blueprint-library hidden></div>
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
          <button type="button" class="designer-control designer-button material-group-toggle" data-material-group-toggle data-material-group-action="toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="designer-material-group-popover" hidden>
            <span class="material-group-toggle-glyph" aria-hidden="true">${designerIcon('grid')}</span>
            <span data-material-group-toggle-label>${DESIGNER_UI_TEXT.allMaterialGroups}</span>
            <span class="material-group-toggle-chevron" aria-hidden="true">${designerIcon('chevron-down')}</span>
          </button>
          <div class="material-categories" data-material-categories role="group" aria-label="${DESIGNER_UI_TEXT.materialCategories}"></div>
        </div>
        <div class="material-library-content" data-material-library-content>
          <div class="material-group-inline" data-material-group-inline hidden>
            <nav class="material-group-navigation" data-material-groups aria-label="${DESIGNER_UI_TEXT.materialGroups}" hidden></nav>
          </div>
          <div class="material-library-results">
            <div class="material-grid" data-material-grid></div>
            <div class="designer-empty-state material-search-empty" data-material-search-empty hidden>
              <span role="status">${DESIGNER_UI_TEXT.materialSearchEmpty}</span>
              <button type="button" class="designer-control designer-button" data-material-library-reset>${DESIGNER_UI_TEXT.materialResetFilters}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="rail-view" id="designer-layers-panel" role="tabpanel" aria-labelledby="designer-layers-tab" data-layers hidden></div>
      <div class="rail-view" id="designer-variables-panel" role="tabpanel" aria-labelledby="designer-variables-tab" data-variables hidden></div>
    </aside>

    <div class="material-group-overlay" data-material-group-overlay hidden>
      <div class="material-group-backdrop" data-material-group-action="close" aria-hidden="true"></div>
      <section class="material-group-popover" id="designer-material-group-popover" data-material-group-popover role="dialog" aria-label="${DESIGNER_UI_TEXT.materialGroups}">
        <header class="material-group-popover-heading">
          <span>${DESIGNER_UI_TEXT.materialCategories}</span>
          <button type="button" class="designer-control designer-button designer-icon-button" data-material-group-action="close" aria-label="${DESIGNER_UI_TEXT.materialGroupClose}" title="${DESIGNER_UI_TEXT.materialGroupClose}">${designerIcon('x')}</button>
        </header>
        <div class="material-group-popover-content" data-material-group-popover-content></div>
      </section>
    </div>

    <div class="panel-handle" data-panel-handle="left" role="separator" aria-orientation="vertical" aria-controls="designer-left-panel" aria-label="${DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.leftPanel)}" aria-valuemin="200" aria-valuemax="480" aria-valuenow="336" tabindex="0"></div>

    <main class="workspace">
      <header class="designer-topbar" aria-label="${DESIGNER_UI_TEXT.topbar}">
        <div class="topbar-brand">
          <button type="button" class="topbar-icon-button" data-topbar-back title="${DESIGNER_UI_TEXT.back}" aria-label="${DESIGNER_UI_TEXT.back}" hidden>${designerIcon('chevron-left')}</button>
          <span class="topbar-product-mark" aria-hidden="true">${designerIcon('shapes')}</span>
          <span class="topbar-project-meta">
            <span class="designer-project-name">${DESIGNER_UI_TEXT.unnamedProject}</span>
            <span class="topbar-save-status" data-topbar-save-status>${DESIGNER_UI_TEXT.directDocument}</span>
          </span>
          <span class="topbar-mode-switch" role="tablist" aria-label="${DESIGNER_UI_TEXT.interactionWorkspace}">
            <button type="button" class="topbar-mode-button" data-workbench-mode-tab="canvas" data-active="true" role="tab" aria-selected="true" tabindex="0" title="${DESIGNER_UI_TEXT.canvasWorkspace}">${designerIcon('grid')}<span>${DESIGNER_UI_TEXT.canvasWorkspace}</span></button>
            <button type="button" class="topbar-mode-button" data-workbench-mode-tab="blueprint" role="tab" aria-selected="false" tabindex="-1" title="${DESIGNER_UI_TEXT.interactionWorkspaceUnavailable}" aria-label="${DESIGNER_UI_TEXT.interactionWorkspaceUnavailable}" disabled>${designerIcon('variable')}<span>${DESIGNER_UI_TEXT.interactionWorkspace}</span></button>
          </span>
        </div>
        <div class="topbar-center">
          <button type="button" class="topbar-search-trigger" data-command-palette-toggle aria-expanded="false" aria-controls="designer-command-palette-input" aria-label="${DESIGNER_UI_TEXT.commandPalette.trigger}" title="${DESIGNER_UI_TEXT.commandPalette.trigger}">
            ${designerIcon('search')}
            <span data-command-palette-trigger-label>${DESIGNER_UI_TEXT.commandPalette.trigger}</span>
            <kbd>/</kbd>
          </button>
        </div>
        <div class="topbar-actions">
          <button type="button" class="topbar-icon-button" data-panel-collapse="right" aria-controls="designer-right-panel" aria-expanded="true" title="${DESIGNER_UI_TEXT.rightPanel}" aria-label="${DESIGNER_UI_TEXT.rightPanel}">${designerIcon('sliders')}</button>
          <button type="button" class="topbar-icon-button" data-error-console-toggle aria-controls="designer-error-console" aria-haspopup="dialog" aria-expanded="false" title="${DESIGNER_UI_TEXT.errorConsole.openAria}" aria-label="${DESIGNER_UI_TEXT.errorConsole.openAria}">${designerIcon('terminal')}<span class="topbar-count" data-error-console-count></span></button>
          <button type="button" class="topbar-icon-button" data-topbar-theme-toggle title="${DESIGNER_UI_TEXT.toggleTheme}" aria-label="${DESIGNER_UI_TEXT.toggleTheme}" aria-pressed="false">${designerIcon('eye')}</button>
          <button type="button" class="topbar-icon-button" data-topbar-snapshot title="${DESIGNER_UI_TEXT.createSnapshot}" aria-label="${DESIGNER_UI_TEXT.createSnapshot}" disabled>${designerIcon('copy')}</button>
          <button type="button" class="topbar-more-button" data-menu-toggle="more" aria-haspopup="menu" aria-expanded="false" title="${DESIGNER_UI_TEXT.more}" aria-label="${DESIGNER_UI_TEXT.more}">${designerIcon('sliders')}<span>${DESIGNER_UI_TEXT.more}</span></button>
          <span class="topbar-divider" aria-hidden="true"></span>
          ${labeledActionButton('preview', previewGlyph())}
          ${labeledActionButton('project-save', designerIcon('save'))}
          ${labeledActionButton('project-publish', publishGlyph(), 'topbar-publish')}
        </div>
        <div class="designer-menu topbar-more-menu" data-menu="more" hidden role="menu" aria-label="${DESIGNER_UI_TEXT.more}">
          ${submenuButton(DESIGNER_UI_TEXT.file, ['project-workspace', 'import', 'export', 'separator', 'project-save', 'project-publish', 'project-retry', 'project-cancel'])}
          ${submenuButton(DESIGNER_UI_TEXT.edit, ['undo', 'redo', 'separator', 'copy', 'paste', 'duplicate', 'delete', 'edit-position', 'edit-size', 'separator', 'group', 'ungroup', { label: DESIGNER_UI_TEXT.arrange, entries: ['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', 'separator', 'distribute-horizontal', 'distribute-vertical'] }, { label: DESIGNER_UI_TEXT.layer, entries: ['select-layer-up', 'select-layer-down', 'separator', 'bring-to-front', 'bring-forward', 'send-backward', 'send-to-back', 'lock', 'unlock', 'hide'] }])}
          ${submenuButton(DESIGNER_UI_TEXT.view, ['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-fit', 'separator', 'toggle-grid', 'toggle-guides', 'toggle-border-guides'])}
          ${submenuButton(DESIGNER_UI_TEXT.tools, ['toggle-workbench', 'show-help'])}
        </div>
      </header>

      <input type="file" accept="application/json" data-import-document hidden>

      <div class="workspace-local-toolbar" data-canvas-local-toolbar aria-label="${DESIGNER_UI_TEXT.tools}">
        <div class="topbar-segment designer-tool-cluster" role="group" aria-label="${DESIGNER_UI_TEXT.tools}">
          ${DESIGNER_TOOLS.map((tool) => `<button type="button" class="designer-control designer-button designer-icon-button designer-tool-button tool-btn" data-variant="ghost" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label} (${getDesignerToolShortcut(tool.id)})" aria-label="${tool.label}">${designerToolGlyph(tool.id)}<kbd>${getDesignerToolShortcut(tool.id)}</kbd></button>`).join('')}
        </div>
        <div class="topbar-segment" role="group" aria-label="${DESIGNER_UI_TEXT.history}">
          ${actionButton('undo', designerIcon('undo'))}
          ${actionButton('redo', redoGlyph())}
        </div>
        <div class="topbar-segment topbar-zoom" role="group" aria-label="${DESIGNER_UI_TEXT.zoom}">
          ${actionButton('zoom-out', zoomOutGlyph())}
          <output class="zoom-value" data-zoom>100%</output>
          ${actionButton('zoom-in', zoomInGlyph())}
        </div>
      </div>
      <button type="button" class="ruler-corner" data-status-toggle="guides" role="switch" aria-checked="true" aria-label="${DESIGNER_UI_TEXT.guides}" title="${DESIGNER_UI_TEXT.rulerGuidesToggle}">
        <span data-guide-visibility="true" aria-hidden="true">${designerIcon('eye')}</span>
        <span data-guide-visibility="false" aria-hidden="true">${designerIcon('eye-off')}</span>
      </button>
      <div class="ruler ruler-horizontal" aria-hidden="true"><canvas class="ruler-canvas" data-ruler-canvas></canvas></div>
      <div class="canvas-stage">
        <div class="ruler ruler-vertical" aria-hidden="true"><canvas class="ruler-canvas" data-ruler-canvas></canvas></div>
        <div class="viewport" data-viewport>
          <div class="canvas" data-canvas>
            <div class="canvas-content" data-canvas-content></div>
            <div class="selection" data-selection></div>
            <div class="marquee" data-marquee></div>
            <div class="canvas-guides" data-canvas-guides></div>
          </div>
          <form class="designer-coordinate-entry" data-coordinate-entry role="dialog" aria-modal="false" aria-label="${DESIGNER_UI_TEXT.coordinateEntry.title}" autocomplete="off" novalidate hidden>
            ${coordinateEntryField('x')}
            ${coordinateEntryField('y')}
            <p class="designer-coordinate-entry-error" id="designer-coordinate-entry-error" data-coordinate-entry-error role="alert" aria-live="assertive"></p>
          </form>
          <form class="designer-coordinate-entry designer-size-entry" data-size-entry role="dialog" aria-modal="false" aria-label="${DESIGNER_UI_TEXT.sizeEntry.title}" autocomplete="off" novalidate hidden>
            ${sizeEntryField('width')}
            ${sizeEntryField('height')}
            <p class="designer-coordinate-entry-error" id="designer-size-entry-error" data-size-entry-error role="alert" aria-live="assertive"></p>
          </form>
        </div>
      </div>
      <section class="designer-blueprint-surface" data-blueprint-surface hidden aria-label="${DESIGNER_UI_TEXT.blueprint.canvas}">
        <slot name="${BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT}" data-blueprint-canvas-slot></slot>
        <div class="designer-blueprint-fallback" data-blueprint-fallback>${DESIGNER_UI_TEXT.blueprint.noHostCanvas}</div>
      </section>
      <section class="designer-data-workbench" data-data-workbench hidden aria-label="${DESIGNER_UI_TEXT.dataSource.workbench}">
        <div data-data-workbench-content></div>
      </section>
      <div class="designer-context-menu" data-context-menu hidden role="menu" aria-label="${DESIGNER_UI_TEXT.contextMenu}" tabindex="-1"></div>

      <!-- Status bar: left (tool + selection + project state) | center (canvas size) | right (Snap/Native Events toggles + zoom menu). -->
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
          <span class="status-divider" aria-hidden="true"></span>
          <button type="button" class="status-toggle" data-status-toggle="native-events" role="switch" aria-checked="false" aria-label="${DESIGNER_UI_TEXT.nativeEvent}">
            <span class="status-toggle-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.nativeEvent}</span>
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
              <span data-error-console-summary aria-atomic="true"></span>
            </div>
            <div class="error-console-actions">
              <button type="button" class="designer-control designer-button error-console-clear" data-error-console-clear>${DESIGNER_UI_TEXT.errorConsole.clear}</button>
              <button type="button" class="designer-control designer-button designer-icon-button error-console-close" data-variant="ghost" data-error-console-close aria-label="${DESIGNER_UI_TEXT.errorConsole.closeAria}" title="${DESIGNER_UI_TEXT.errorConsole.closeAria}">${designerIcon('x')}</button>
            </div>
          </header>
          <section class="error-console-current" data-material-library-status aria-label="${DESIGNER_UI_TEXT.materialLibrary.label}" hidden></section>
          <div class="error-console-history-heading">
            <h3>${DESIGNER_UI_TEXT.errorConsole.history}</h3>
            <span data-error-console-history-summary></span>
          </div>
          <div class="error-console-list" data-error-console-list data-error-console-order="newest-first" role="log" aria-live="polite" aria-label="${DESIGNER_UI_TEXT.errorConsole.history}"></div>
        </div>
      </section>
    </main>

    <div class="panel-handle" data-panel-handle="right" role="separator" aria-orientation="vertical" aria-controls="designer-right-panel" aria-label="${DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.inspector)}" aria-valuemin="288" aria-valuemax="480" aria-valuenow="336" tabindex="0"></div>

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
      <div class="blueprint-inspector" data-blueprint-inspector hidden></div>
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
}

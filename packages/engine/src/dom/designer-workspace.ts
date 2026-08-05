import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_OPERATION_TEXT } from '../operations/designer-operation-registry.js';
import { DESIGNER_TOOLS, type DesignerToolMaterialTypes } from '../tools/designer-tools.js';
import { designerIcon } from '../ui/designer-icons.js';
import { DESIGNER_UI_TEXT } from '../ui/designer-ui-text.js';

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly BaseScreenMaterialCatalogEntry[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
): HTMLElement {
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = `
    <div class="small-screen-warning" role="alert">
      <span>编辑需要至少 1024 × 640 的可用空间。</span>
    </div>

    <aside class="tool-rail" aria-label="设计工具">
      <div class="tool-rail-brand" aria-hidden="true">Bs</div>
      ${DESIGNER_TOOLS.map((tool) => `<button type="button" class="designer-control designer-button designer-icon-button designer-tool-button tool-btn" data-variant="ghost" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label} (${toolShortcut(tool.id)})" aria-label="${tool.label}">${toolGlyph(tool.id)}<kbd>${toolShortcut(tool.id)}</kbd></button>`).join('')}
    </aside>

    <aside class="rail" data-left-panel>
      <header class="panel-heading">
        <span class="panel-title">${DESIGNER_UI_TEXT.materials}</span>
        <span class="panel-count">${materials.length}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="left" title="收起物料面板" aria-label="收起物料面板">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4 6 8l4 4"/></svg>
        </button>
      </header>
      <div class="designer-tablist rail-tabs" role="tablist" aria-label="左侧面板">
        <button type="button" class="designer-tab" id="designer-materials-tab" role="tab" aria-controls="designer-materials-panel" aria-selected="true" data-panel-tab="materials">${DESIGNER_UI_TEXT.materials}</button>
        <button type="button" class="designer-tab" id="designer-layers-tab" role="tab" aria-controls="designer-layers-panel" aria-selected="false" data-panel-tab="layers">${DESIGNER_UI_TEXT.layers}</button>
      </div>
      <div class="rail-content" id="designer-materials-panel" role="tabpanel" aria-labelledby="designer-materials-tab" data-materials></div>
      <div class="rail-content" id="designer-layers-panel" role="tabpanel" aria-labelledby="designer-layers-tab" data-layers hidden></div>
    </aside>

    <div class="panel-handle" data-panel-handle="left" role="separator" aria-orientation="vertical"></div>

    <main class="workspace">
      <header class="toolbar">
        <div class="toolbar-group" aria-label="历史记录">
          ${actionButton('undo', designerIcon('undo'))}
          ${actionButton('redo', redoGlyph())}
        </div>
        <div class="toolbar-group" aria-label="剪贴板">
          ${actionButton('copy', copyGlyph())}
          ${actionButton('paste', pasteGlyph())}
        </div>
        <div class="toolbar-group" aria-label="排列">
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
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group" aria-label="项目">
          ${actionButton('preview', previewGlyph())}
          ${actionButton('import', importGlyph())}
          ${actionButton('export', exportGlyph())}
          ${actionButton('project-save', designerIcon('save'))}
          ${actionButton('project-publish', publishGlyph())}
          ${actionButton('project-retry', retryGlyph())}
          ${actionButton('project-cancel', cancelGlyph())}
        </div>
        <div class="toolbar-group toolbar-zoom" aria-label="缩放">
          ${actionButton('zoom-out', zoomOutGlyph())}
          <output class="zoom-value" data-zoom>100%</output>
          ${actionButton('zoom-in', zoomInGlyph())}
          ${actionButton('zoom-reset', resetZoomGlyph())}
          ${actionButton('zoom-fit', fitZoomGlyph())}
        </div>
        <div class="toolbar-group" aria-label="画布辅助">
          ${actionButton('toggle-grid', gridGlyph())}
          ${actionButton('toggle-snap', snapGlyph())}
        </div>
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

      <footer class="statusbar">
        <span class="status-pill" data-status-tool>选择</span>
        <span class="status-divider"></span>
        <span data-project-status>${DESIGNER_UI_TEXT.directDocument}</span>
        <span data-project-revision></span>
        <span class="status-feedback" data-status-feedback role="status" aria-live="polite"></span>
        <output class="status-zoom" data-status-zoom>100%</output>
      </footer>
    </main>

    <div class="panel-handle" data-panel-handle="right" role="separator" aria-orientation="vertical"></div>

    <aside class="properties" data-right-panel>
      <header class="panel-heading">
        <span class="panel-title">${DESIGNER_UI_TEXT.inspector}</span>
        <button type="button" class="designer-control designer-button designer-icon-button panel-collapse" data-variant="ghost" data-panel-collapse="right" title="收起检查器" aria-label="收起检查器">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
        </button>
      </header>
      <div class="inspector-tabs" role="tablist" aria-label="检查器">
        <button type="button" class="designer-tab" id="designer-appearance-tab" role="tab" aria-controls="designer-appearance-panel" aria-selected="true" data-inspector-tab="appearance">${DESIGNER_UI_TEXT.appearance}</button>
        <button type="button" class="designer-tab" id="designer-data-tab" role="tab" aria-controls="designer-data-panel" aria-selected="false" data-inspector-tab="data">${DESIGNER_UI_TEXT.data}</button>
        <button type="button" class="designer-tab" id="designer-interaction-tab" role="tab" aria-controls="designer-interaction-panel" aria-selected="false" data-inspector-tab="interaction">${DESIGNER_UI_TEXT.interaction}</button>
        <button type="button" class="designer-tab" id="designer-events-tab" role="tab" aria-controls="designer-events-panel" aria-selected="false" data-inspector-tab="events">${DESIGNER_UI_TEXT.events}</button>
      </div>
      <div class="inspector-pane" id="designer-appearance-panel" role="tabpanel" aria-labelledby="designer-appearance-tab" data-inspector-pane="appearance">
        <div data-properties></div>
      </div>
      <div class="inspector-pane" id="designer-data-panel" role="tabpanel" aria-labelledby="designer-data-tab" data-inspector-pane="data" hidden>
        <p class="designer-empty-state" data-data-panel>未选择数据源。</p>
      </div>
      <div class="inspector-pane" id="designer-interaction-panel" role="tabpanel" aria-labelledby="designer-interaction-tab" data-inspector-pane="interaction" hidden>
        <p class="designer-empty-state">交互设置将在预览中生效。</p>
      </div>
      <div class="inspector-pane" id="designer-events-panel" role="tabpanel" aria-labelledby="designer-events-tab" data-inspector-pane="events" hidden>
        <div data-events-panel></div>
      </div>
    </aside>

    <section class="designer-dialog-surface project-conflict" data-project-conflict hidden role="alertdialog" aria-label="项目冲突">
      <header>
        <span class="conflict-icon" aria-hidden="true">!</span>
        <span>远端变更与本地编辑冲突。</span>
      </header>
      <p>继续编辑将保留本地版本；重新加载将丢弃本地修改。</p>
      <div class="designer-dialog-actions">
        <button type="button" class="designer-control designer-button" data-variant="neutral" data-action="continue-editing">继续编辑</button>
        <button type="button" class="designer-control designer-button" data-variant="danger" data-action="reload-remote">重新加载远端</button>
      </div>
    </section>`;

  const importConfirmation = ownerDocument.createElement('section');
  importConfirmation.className = 'import-confirmation';
  importConfirmation.dataset.importConfirmation = 'true';
  importConfirmation.hidden = true;
  importConfirmation.setAttribute('role', 'alertdialog');
  importConfirmation.ariaLabel = '确认导入';
  importConfirmation.innerHTML = `
    <div class="designer-dialog-surface import-confirmation-card">
      <header>
        <span class="import-icon" aria-hidden="true">?</span>
        <span>导入将替换当前文档。</span>
      </header>
      <p>当前未保存的修改将会丢失，是否继续？</p>
      <div class="designer-dialog-actions">
        <button type="button" class="designer-control designer-button" data-variant="neutral" data-action="import-cancel">取消</button>
        <button type="button" class="designer-control designer-button" data-variant="danger" data-action="import-confirm">确认导入</button>
      </div>
    </div>`;
  layout.appendChild(importConfirmation);

  const blueprint = ownerDocument.createElement('section');
  blueprint.className = 'blueprint-workspace';
  blueprint.dataset.blueprintWorkspace = 'true';
  blueprint.hidden = true;
  layout.appendChild(blueprint);

  const rail = layout.querySelector<HTMLElement>('[data-materials]')!;
  for (const entry of materials) {
    rail.appendChild(createMaterialButton(ownerDocument, entry));
  }
  for (const tool of DESIGNER_TOOLS) {
    const control = layout.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`)!;
    control.disabled = tool.materialKey !== undefined && toolMaterialTypes?.[tool.id] === undefined;
  }
  return layout;
}

function actionButton(action: keyof typeof DESIGNER_OPERATION_TEXT, glyph: string): string {
  const operation = DESIGNER_OPERATION_TEXT[action];
  return `<button type="button" class="designer-control designer-button designer-icon-button toolbar-btn" data-variant="neutral" data-action="${action}" title="${operation.tooltip}" aria-label="${operation.label}">${glyph}</button>`;
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

function toolShortcut(id: string): string {
  switch (id) {
    case 'select':
      return 'V';
    case 'hand':
      return 'H';
    case 'text':
      return 'T';
    case 'rectangle':
      return 'R';
    case 'ellipse':
      return 'E';
    case 'image':
      return 'I';
    case 'zoom':
      return 'Z';
  }
  return '';
}

function toolIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
}

function createMaterialButton(
  ownerDocument: Document,
  entry: BaseScreenMaterialCatalogEntry,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button material-card';
  button.dataset.materialType = entry.manifest.type;
  button.innerHTML = `<span class="material-thumb" aria-hidden="true"></span><span class="material-name">${entry.manifest.name}</span><span class="material-type">${entry.manifest.type}</span>`;
  return button;
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

function snapGlyph(): string {
  return toolbarIcon('M3 8h4l2-3 2 6M3 12h10');
}

function toolbarIcon(path: string): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
}

import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_OPERATION_TEXT } from './designer-operation-registry.js';
import { DESIGNER_TOOLS, type DesignerToolMaterialTypes } from './designer-tools.js';
import { DESIGNER_UI_TEXT } from './designer-ui-text.js';

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly BaseScreenMaterialCatalogEntry[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
): HTMLElement {
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = `
    <div class="small-screen-warning" role="alert">编辑需要至少 1024 × 640 的可用空间。</div>
    <aside class="tool-rail" aria-label="设计工具">
      ${DESIGNER_TOOLS.map((tool) => `<button type="button" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label}" aria-label="${tool.label}"><span>${toolGlyph(tool.id)}</span><kbd>${toolShortcut(tool.id)}</kbd></button>`).join('')}
    </aside>
    <aside class="rail" data-left-panel>
       <header class="panel-heading"><span>${DESIGNER_UI_TEXT.materials}</span><span class="panel-count">${materials.length}</span><button type="button" data-panel-collapse="left" title="收起物料面板" aria-label="收起物料面板">&lt;</button></header>
      <div class="rail-tabs" role="tablist" aria-label="左侧面板">
        <button type="button" id="designer-materials-tab" role="tab" aria-controls="designer-materials-panel" aria-selected="true" data-panel-tab="materials">${DESIGNER_UI_TEXT.materials}</button>
        <button type="button" id="designer-layers-tab" role="tab" aria-controls="designer-layers-panel" aria-selected="false" data-panel-tab="layers">${DESIGNER_UI_TEXT.layers}</button>
      </div>
      <div id="designer-materials-panel" role="tabpanel" aria-labelledby="designer-materials-tab" data-materials></div>
      <div id="designer-layers-panel" role="tabpanel" aria-labelledby="designer-layers-tab" data-layers hidden></div>
    </aside>
    <div class="panel-handle" data-panel-handle="left" role="separator" aria-orientation="vertical"></div>
    <main class="workspace">
      <header class="toolbar">
        <div class="toolbar-group" aria-label="历史记录">
           ${actionButton('undo', 'U')}
           ${actionButton('redo', 'R')}
        </div>
        <div class="toolbar-group" aria-label="剪贴板">
           ${actionButton('copy', 'C')}
           ${actionButton('paste', 'P')}
        </div>
        <div class="toolbar-group" aria-label="排列">
           ${actionButton('group', 'G')}
           ${actionButton('ungroup', 'UG')}
           ${actionButton('align-left', 'L')}
           ${actionButton('align-center', 'C')}
           ${actionButton('align-right', 'R')}
           ${actionButton('align-top', 'T')}
           ${actionButton('align-middle', 'M')}
           ${actionButton('align-bottom', 'B')}
           ${actionButton('distribute-horizontal', 'H')}
           ${actionButton('distribute-vertical', 'V')}
        </div>
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group" aria-label="项目">
          ${actionButton('preview', '预览')}
          ${actionButton('import', '导入')}
          ${actionButton('export', '导出')}
          ${actionButton('project-save', '保存')}
          ${actionButton('project-publish', '发布')}
          ${actionButton('project-retry', '重试')}
          ${actionButton('project-cancel', '取消')}
        </div>
        <div class="toolbar-group toolbar-zoom" aria-label="缩放">
           ${actionButton('zoom-out', '-')}
        <output data-zoom>100%</output>
           ${actionButton('zoom-in', '+')}
           ${actionButton('zoom-reset', '1:1')}
           ${actionButton('zoom-fit', '适应')}
        </div>
        <div class="toolbar-group" aria-label="画布辅助">
          ${actionButton('toggle-grid', '网格')}
          ${actionButton('toggle-snap', '对齐')}
        </div>
      </header>
      <input type="file" accept="application/json" data-import-document hidden>
       <div class="ruler ruler-horizontal" aria-hidden="true"></div>
       <div class="canvas-stage"><div class="ruler ruler-vertical" aria-hidden="true"></div><div class="viewport" data-viewport><div class="canvas" data-canvas><div class="selection" data-selection></div><div class="marquee" data-marquee></div><div class="canvas-guides" data-canvas-guides></div></div></div></div>
      <footer class="statusbar"><span data-status-tool>选择</span><span data-project-status>${DESIGNER_UI_TEXT.directDocument}</span><span data-project-revision></span><span data-status-feedback role="status" aria-live="polite"></span><output data-status-zoom>100%</output></footer>
    </main>
    <div class="panel-handle" data-panel-handle="right" role="separator" aria-orientation="vertical"></div>
     <aside class="properties" data-right-panel><header class="panel-heading"><span>检查器</span><button type="button" data-panel-collapse="right" title="收起检查器" aria-label="收起检查器">&gt;</button></header><div class="inspector-tabs" role="tablist" aria-label="检查器"><button type="button" id="designer-appearance-tab" role="tab" aria-controls="designer-appearance-panel" aria-selected="true" data-inspector-tab="appearance">外观</button><button type="button" id="designer-data-tab" role="tab" aria-controls="designer-data-panel" aria-selected="false" data-inspector-tab="data">数据</button><button type="button" id="designer-interaction-tab" role="tab" aria-controls="designer-interaction-panel" aria-selected="false" data-inspector-tab="interaction">交互</button><button type="button" id="designer-events-tab" role="tab" aria-controls="designer-events-panel" aria-selected="false" data-inspector-tab="events">事件</button></div><div id="designer-appearance-panel" role="tabpanel" aria-labelledby="designer-appearance-tab" data-inspector-pane="appearance"><div data-properties></div></div><div id="designer-data-panel" role="tabpanel" aria-labelledby="designer-data-tab" data-inspector-pane="data" hidden><p data-data-panel>未选择数据源。</p></div><div id="designer-interaction-panel" role="tabpanel" aria-labelledby="designer-interaction-tab" data-inspector-pane="interaction" hidden><p>交互设置将在预览中生效。</p></div><div id="designer-events-panel" role="tabpanel" aria-labelledby="designer-events-tab" data-inspector-pane="events" hidden><div data-events-panel></div></div></aside>
    <section class="project-conflict" data-project-conflict hidden role="alertdialog" aria-label="项目冲突">
      <p>远端变更与本地编辑冲突。</p>
      <div>
        <button type="button" data-action="continue-editing">继续编辑</button>
        <button type="button" data-action="reload-remote">重新加载远端</button>
      </div>
    </section>`;
  const importConfirmation = ownerDocument.createElement('section');
  importConfirmation.className = 'import-confirmation';
  importConfirmation.dataset.importConfirmation = 'true';
  importConfirmation.hidden = true;
  importConfirmation.setAttribute('role', 'alertdialog');
  importConfirmation.ariaLabel = '确认导入';
  importConfirmation.innerHTML =
    '<p>导入将替换当前文档。</p><div><button type="button" data-action="import-cancel">取消</button><button type="button" data-action="import-confirm">确认导入</button></div>';
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
  return `<button type="button" data-action="${action}" title="${operation.tooltip}" aria-label="${operation.label}">${glyph}</button>`;
}

function toolGlyph(id: string): string {
  switch (id) {
    case 'select':
      return 'V';
    case 'hand':
      return 'H';
    case 'text':
      return 'T';
    case 'rectangle':
      return '[]';
    case 'ellipse':
      return 'O';
    case 'image':
      return 'I';
    case 'zoom':
      return '+';
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

function createMaterialButton(
  ownerDocument: Document,
  entry: BaseScreenMaterialCatalogEntry,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.dataset.materialType = entry.manifest.type;
  button.textContent = entry.manifest.name;
  return button;
}

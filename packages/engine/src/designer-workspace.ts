import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_TOOLS, type DesignerToolMaterialTypes } from './designer-tools.js';

export interface BaseScreenDesignerControls {
  readonly canAlign: boolean;
  readonly canDistribute: boolean;
  readonly canGroup: boolean;
  readonly canUngroup: boolean;
  readonly canCopy: boolean;
  readonly canPaste: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly BaseScreenMaterialCatalogEntry[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
): HTMLElement {
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = `
    <div class="small-screen-warning" role="alert">Designer requires at least 1024 × 640 to edit.</div>
    <aside class="tool-rail" aria-label="Designer tools">
      ${DESIGNER_TOOLS.map((tool) => `<button type="button" data-tool="${tool.id}" data-material-key="${tool.materialKey ?? ''}" title="${tool.label}" aria-label="${tool.label}"><span>${toolGlyph(tool.id)}</span><kbd>${toolShortcut(tool.id)}</kbd></button>`).join('')}
    </aside>
    <aside class="rail">
      <header class="panel-heading"><span>Library</span><span class="panel-count">${materials.length}</span></header>
      <div class="rail-tabs" role="tablist" aria-label="Designer panel">
        <button type="button" role="tab" aria-selected="true" data-panel-tab="materials">Materials</button>
        <button type="button" role="tab" aria-selected="false" data-panel-tab="layers">Layers</button>
      </div>
      <div data-materials></div>
      <div data-layers hidden></div>
    </aside>
    <main class="workspace">
      <header class="toolbar">
        <div class="toolbar-group" aria-label="History">
          ${actionButton('undo', 'Undo', 'U')}
          ${actionButton('redo', 'Redo', 'R')}
        </div>
        <div class="toolbar-group" aria-label="Clipboard">
          ${actionButton('copy', 'Copy', 'C')}
          ${actionButton('paste', 'Paste', 'P')}
        </div>
        <div class="toolbar-group" aria-label="Arrange">
          ${actionButton('group', 'Group', 'G')}
          ${actionButton('ungroup', 'Ungroup', 'UG')}
          ${actionButton('align-left', 'Align left', 'L')}
          ${actionButton('align-center', 'Align center', 'C')}
          ${actionButton('align-right', 'Align right', 'R')}
          ${actionButton('align-top', 'Align top', 'T')}
          ${actionButton('align-middle', 'Align middle', 'M')}
          ${actionButton('align-bottom', 'Align bottom', 'B')}
          ${actionButton('distribute-horizontal', 'Distribute horizontally', 'H')}
          ${actionButton('distribute-vertical', 'Distribute vertically', 'V')}
        </div>
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group" aria-label="Project">
          ${actionButton('project-save', 'Save project', 'Save')}
          ${actionButton('project-publish', 'Publish project', 'Publish')}
          ${actionButton('project-retry', 'Retry project operation', 'Retry')}
          ${actionButton('project-cancel', 'Cancel project operation', 'Cancel')}
        </div>
        <div class="toolbar-group toolbar-zoom" aria-label="Zoom">
          ${actionButton('zoom-out', 'Zoom out', '-')}
        <output data-zoom>100%</output>
          ${actionButton('zoom-in', 'Zoom in', '+')}
          ${actionButton('zoom-reset', 'Reset zoom', '1:1')}
          ${actionButton('zoom-fit', 'Fit canvas', 'Fit')}
        </div>
      </header>
      <div class="ruler ruler-horizontal" aria-hidden="true"></div>
      <div class="viewport" data-viewport><div class="canvas" data-canvas><div class="selection" data-selection></div><div class="marquee" data-marquee></div></div></div>
      <footer class="statusbar"><span data-status-tool>Select</span><span data-project-status>Direct document</span><span data-project-revision></span><output data-status-zoom>100%</output></footer>
    </main>
    <aside class="properties"><header class="panel-heading"><span>Inspector</span></header><div data-properties></div></aside>
    <section class="project-conflict" data-project-conflict hidden role="alertdialog" aria-label="Project conflict">
      <p>Remote changes conflict with local edits.</p>
      <div>
        <button type="button" data-action="continue-editing">Continue editing</button>
        <button type="button" data-action="reload-remote">Reload remote</button>
      </div>
    </section>`;
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

function actionButton(action: string, label: string, glyph: string): string {
  return `<button type="button" data-action="${action}" title="${label}" aria-label="${label}">${glyph}</button>`;
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

export function updateDesignerControls(
  root: ParentNode,
  controls: BaseScreenDesignerControls,
): void {
  setDisabled(root, 'group', !controls.canGroup);
  setDisabled(root, 'ungroup', !controls.canUngroup);
  for (const action of [
    'align-left',
    'align-center',
    'align-right',
    'align-top',
    'align-middle',
    'align-bottom',
  ]) {
    setDisabled(root, action, !controls.canAlign);
  }
  setDisabled(root, 'distribute-horizontal', !controls.canDistribute);
  setDisabled(root, 'distribute-vertical', !controls.canDistribute);
  setDisabled(root, 'copy', !controls.canCopy);
  setDisabled(root, 'paste', !controls.canPaste);
  setDisabled(root, 'undo', !controls.canUndo);
  setDisabled(root, 'redo', !controls.canRedo);
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

function setDisabled(root: ParentNode, action: string, disabled: boolean): void {
  const control = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (control !== null) {
    control.disabled = disabled;
  }
}

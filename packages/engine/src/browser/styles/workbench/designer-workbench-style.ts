import accessibilityCss from './designer-workbench-accessibility.css?inline';
import blueprintCanvasCss from './designer-workbench-blueprint-canvas.css?inline';
import blueprintCanvasEdgesCss from './designer-workbench-blueprint-canvas-edges.css?inline';
import blueprintCanvasNodesCss from './designer-workbench-blueprint-canvas-nodes.css?inline';
import blueprintCanvasOverlaysCss from './designer-workbench-blueprint-canvas-overlays.css?inline';
import blueprintDetailsCss from './designer-workbench-blueprint-details.css?inline';
import blueprintPanelsCss from './designer-workbench-blueprint-panels.css?inline';
import blueprintSurfaceCss from './designer-workbench-blueprint-surface.css?inline';
import blueprintToolbarCss from './designer-workbench-blueprint-toolbar.css?inline';
import canvasCss from './designer-workbench-canvas.css?inline';
import changeCss from './designer-workbench-change.css?inline';
import chromeCss from './designer-workbench-chrome.css?inline';
import dataBindingCss from './designer-workbench-data-binding.css?inline';
import dataCatalogCss from './designer-workbench-data-catalog.css?inline';
import dataEditorCss from './designer-workbench-data-editor.css?inline';
import feedbackCss from './designer-workbench-feedback.css?inline';
import inspectorCss from './designer-workbench-inspector.css?inline';
import inspectorDataCss from './designer-workbench-inspector-data.css?inline';
import layersCss from './designer-workbench-layers.css?inline';
import materialsCss from './designer-workbench-materials.css?inline';
import panelsCss from './designer-workbench-panels.css?inline';
import selectionCss from './designer-workbench-selection.css?inline';
import shellCss from './designer-workbench-shell.css?inline';
import topbarCss from './designer-workbench-topbar.css?inline';
import variableEditorCss from './designer-workbench-variable-editor.css?inline';
import variableInspectorCss from './designer-workbench-variable-inspector.css?inline';
import variableListCss from './designer-workbench-variable-list.css?inline';
import variableReferencesCss from './designer-workbench-variable-references.css?inline';
import variablesCss from './designer-workbench-variables.css?inline';

// Feature files are concatenated in cascade order. Keep responsive and accessibility
// overrides last so splitting the source never changes the original CSS behavior.
// The selection layer is the one cross-panel recipe (layer tree + blueprint palette), so it
// sits after every panel file to win same-specificity ties; accessibility still comes last.
export const DESIGNER_WORKBENCH_CSS = [
  topbarCss,
  blueprintToolbarCss,
  feedbackCss,
  shellCss,
  panelsCss,
  blueprintSurfaceCss,
  blueprintCanvasCss,
  blueprintCanvasEdgesCss,
  blueprintCanvasNodesCss,
  blueprintCanvasOverlaysCss,
  blueprintPanelsCss,
  blueprintDetailsCss,
  materialsCss,
  dataCatalogCss,
  dataBindingCss,
  dataEditorCss,
  layersCss,
  variableListCss,
  variablesCss,
  variableEditorCss,
  variableInspectorCss,
  variableReferencesCss,
  canvasCss,
  inspectorCss,
  inspectorDataCss,
  changeCss,
  chromeCss,
  selectionCss,
  accessibilityCss,
].join('\n');

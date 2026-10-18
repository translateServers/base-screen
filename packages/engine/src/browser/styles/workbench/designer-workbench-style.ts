import accessibilityCss from './designer-workbench-accessibility.css?inline';
import blueprintDetailsCss from './designer-workbench-blueprint-details.css?inline';
import blueprintPanelsCss from './designer-workbench-blueprint-panels.css?inline';
import blueprintSurfaceCss from './designer-workbench-blueprint-surface.css?inline';
import blueprintToolbarCss from './designer-workbench-blueprint-toolbar.css?inline';
import canvasCss from './designer-workbench-canvas.css?inline';
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
  variableReferencesCss,
  canvasCss,
  inspectorCss,
  inspectorDataCss,
  selectionCss,
  accessibilityCss,
].join('\n');

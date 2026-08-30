import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = (file) => readFileSync(resolve(root, file), 'utf8');
const baseLayers = [
  'packages/engine/src/browser/styles/base/designer-base-menus.css',
  'packages/engine/src/browser/styles/base/designer-base-library.css',
  'packages/engine/src/browser/styles/base/designer-base-shell.css',
  'packages/engine/src/browser/styles/base/designer-base-adaptivity.css',
];
const controlLayers = [
  'packages/engine/src/browser/styles/controls/designer-controls-fields.css',
  'packages/engine/src/browser/styles/controls/designer-controls-color-palette.css',
  'packages/engine/src/browser/styles/controls/designer-controls-inputs.css',
  'packages/engine/src/browser/styles/controls/designer-controls-quick-style.css',
  'packages/engine/src/browser/styles/controls/designer-controls-actions.css',
  'packages/engine/src/browser/styles/controls/designer-controls-descriptor.css',
];
const workbenchLayers = [
  'packages/engine/src/browser/styles/workbench/designer-workbench-topbar.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-feedback.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-shell.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-panels.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-materials.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-catalog.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-binding.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-editor.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-layers.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variables.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-canvas.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector-data.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-accessibility.css',
];
const baseBindings = ['menusCss', 'libraryCss', 'shellCss', 'adaptivityCss'];
const controlBindings = [
  'fieldsCss',
  'colorPaletteCss',
  'inputsCss',
  'quickStyleCss',
  'actionsCss',
  'descriptorCss',
];
const workbenchBindings = [
  'topbarCss',
  'feedbackCss',
  'shellCss',
  'panelsCss',
  'materialsCss',
  'dataCatalogCss',
  'dataBindingCss',
  'dataEditorCss',
  'layersCss',
  'variablesCss',
  'canvasCss',
  'inspectorCss',
  'inspectorDataCss',
  'accessibilityCss',
];
const layers = [
  'packages/engine/src/browser/styles/designer-tokens.css',
  ...baseLayers,
  ...controlLayers,
  ...workbenchLayers,
];
const style = source('packages/engine/src/browser/styles/designer-style.ts');
const baseStyle = source('packages/engine/src/browser/styles/base/designer-base-style.ts');
const controlsStyle = source(
  'packages/engine/src/browser/styles/controls/designer-controls-style.ts',
);
const workbenchStyle = source(
  'packages/engine/src/browser/styles/workbench/designer-workbench-style.ts',
);
const tokensCss = source('packages/engine/src/browser/styles/designer-tokens.css');
const publicTokens = [
  'surface-workspace',
  'surface-panel',
  'surface-raised',
  'surface-control',
  'surface-control-hover',
  'surface-overlay',
  'surface-canvas',
  'surface-scrim',
  'canvas-grid-line',
  'text-primary',
  'text-secondary',
  'text-muted',
  'text-disabled',
  'border-subtle',
  'border-default',
  'border-strong',
  'focus-ring',
  'accent',
  'accent-surface',
  'success',
  'success-surface',
  'warning',
  'warning-surface',
  'danger',
  'danger-surface',
  'shadow-overlay',
  'shadow-canvas',
  'shadow-float',
  'motion',
  'motion-emphasis',
  'scrollbar-thumb',
  'scrollbar-thumb-hover',
  'scrollbar-track',
  'scrollbar-corner',
];

for (const file of layers) source(file);
if (!/\[tokensCss, baseCss, controlsCss, workbenchCss\]/.test(style)) {
  throw new Error('DESIGNER_STYLE_LAYER_ORDER_INVALID');
}
function assertLayerOrder(content, bindings, errorCode) {
  const orderPattern = new RegExp(`\\[\\s*${bindings.join('\\s*,\\s*')}\\s*,?\\s*\\]`);
  if (!orderPattern.test(content)) throw new Error(errorCode);
}
function assertLayerImports(content, files, bindings, errorCode) {
  for (const [index, file] of files.entries()) {
    const fileName = file.split('/').at(-1);
    if (!content.includes(`import ${bindings[index]} from './${fileName}?inline';`)) {
      throw new Error(errorCode);
    }
  }
}
assertLayerImports(baseStyle, baseLayers, baseBindings, 'DESIGNER_BASE_STYLE_IMPORT_INVALID');
assertLayerImports(
  controlsStyle,
  controlLayers,
  controlBindings,
  'DESIGNER_CONTROLS_STYLE_IMPORT_INVALID',
);
assertLayerImports(
  workbenchStyle,
  workbenchLayers,
  workbenchBindings,
  'DESIGNER_WORKBENCH_STYLE_IMPORT_INVALID',
);
assertLayerOrder(baseStyle, baseBindings, 'DESIGNER_BASE_STYLE_LAYER_ORDER_INVALID');
assertLayerOrder(controlsStyle, controlBindings, 'DESIGNER_CONTROLS_STYLE_LAYER_ORDER_INVALID');
assertLayerOrder(workbenchStyle, workbenchBindings, 'DESIGNER_WORKBENCH_STYLE_LAYER_ORDER_INVALID');
if ([style, baseStyle, controlsStyle, workbenchStyle].some((content) => content.includes('`'))) {
  throw new Error('DESIGNER_STYLE_TEMPLATE_FORBIDDEN');
}

const css = layers.map(source).join('\n');
for (const selector of [
  '.designer *',
  '.designer button',
  '.properties input',
  '.properties textarea',
  '.properties select',
  '.rail button',
  '[data-base-screen-component-id]',
]) {
  if (css.includes(selector)) throw new Error(`DESIGNER_STYLE_SELECTOR_FORBIDDEN:${selector}`);
}
for (const selector of ['button', 'input', 'select', 'textarea', 'label', 'svg']) {
  if (new RegExp(`(?:^|[},])\\s*${selector}\\s*\\{`, 'm').test(css)) {
    throw new Error(`DESIGNER_STYLE_BARE_SELECTOR_FORBIDDEN:${selector}`);
  }
}
if (css.includes('!important') && !css.includes('@media (prefers-reduced-motion: reduce)')) {
  throw new Error('DESIGNER_STYLE_IMPORTANT_FORBIDDEN');
}
if (!css.includes(':host([theme="light"])')) throw new Error('DESIGNER_STYLE_LIGHT_THEME_MISSING');

const publicTokenPattern = /--base-screen-designer-([a-z0-9-]+)/g;
const foundPublicTokens = new Set(
  [...tokensCss.matchAll(publicTokenPattern)].map((match) => match[1]),
);
const allowedPublicTokens = new Set(publicTokens);
for (const token of foundPublicTokens) {
  if (!allowedPublicTokens.has(token)) {
    throw new Error(`DESIGNER_STYLE_PUBLIC_TOKEN_UNKNOWN:${token}`);
  }
}
for (const token of publicTokens) {
  if (!foundPublicTokens.has(token)) {
    throw new Error(`DESIGNER_STYLE_PUBLIC_TOKEN_MISSING:${token}`);
  }
  if (
    !new RegExp(`--designer-${token}:\\s*var\\(\\s*--base-screen-designer-${token},`).test(
      tokensCss,
    )
  ) {
    throw new Error(`DESIGNER_STYLE_PUBLIC_TOKEN_MAPPING_MISSING:${token}`);
  }
}
for (const selector of [
  'body',
  ':host::-webkit-scrollbar',
  'base-screen-designer::-webkit-scrollbar',
]) {
  if (css.includes(selector))
    throw new Error(`DESIGNER_STYLE_SCROLLBAR_SCOPE_FORBIDDEN:${selector}`);
}
if (
  !css.includes('scrollbar-color: var(--designer-scrollbar-thumb) var(--designer-scrollbar-track);')
) {
  throw new Error('DESIGNER_STYLE_SCROLLBAR_STANDARD_RULE_MISSING');
}

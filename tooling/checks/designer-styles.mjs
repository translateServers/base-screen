import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 当前脚本位于 <root>/tooling/checks/，向上两级到达仓库根
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = (file) => readFileSync(resolve(root, file), 'utf8');
const baseLayers = [
  'packages/engine/src/browser/styles/base/designer-base-menus.css',
  'packages/engine/src/browser/styles/base/designer-base-tooltip.css',
  'packages/engine/src/browser/styles/base/designer-base-library.css',
  'packages/engine/src/browser/styles/base/designer-base-material-groups.css',
  'packages/engine/src/browser/styles/base/designer-base-shell.css',
  'packages/engine/src/browser/styles/base/designer-base-adaptivity.css',
];
const controlLayers = [
  'packages/engine/src/browser/styles/controls/designer-controls-fields.css',
  'packages/engine/src/browser/styles/controls/designer-controls-color-palette.css',
  'packages/engine/src/browser/styles/controls/designer-controls-inputs.css',
  'packages/engine/src/browser/styles/controls/designer-controls-date-field.css',
  'packages/engine/src/browser/styles/controls/designer-controls-segmented.css',
  'packages/engine/src/browser/styles/controls/designer-controls-quick-style.css',
  'packages/engine/src/browser/styles/controls/designer-controls-actions.css',
  'packages/engine/src/browser/styles/controls/designer-controls-descriptor.css',
];
const workbenchLayers = [
  'packages/engine/src/browser/styles/workbench/designer-workbench-topbar.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-toolbar.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-feedback.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-shell.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-panels.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-surface.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-panels.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-details.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-materials.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-catalog.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-binding.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-data-editor.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-layers.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variable-list.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variables.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variable-editor.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variable-references.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-canvas.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector-data.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-selection.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-accessibility.css',
];
const baseBindings = [
  'menusCss',
  'tooltipCss',
  'libraryCss',
  'materialGroupsCss',
  'shellCss',
  'adaptivityCss',
];
const controlBindings = [
  'fieldsCss',
  'colorPaletteCss',
  'inputsCss',
  'dateFieldCss',
  'segmentedCss',
  'quickStyleCss',
  'actionsCss',
  'descriptorCss',
];
const workbenchBindings = [
  'topbarCss',
  'blueprintToolbarCss',
  'feedbackCss',
  'shellCss',
  'panelsCss',
  'blueprintSurfaceCss',
  'blueprintPanelsCss',
  'blueprintDetailsCss',
  'materialsCss',
  'dataCatalogCss',
  'dataBindingCss',
  'dataEditorCss',
  'layersCss',
  'variableListCss',
  'variablesCss',
  'variableEditorCss',
  'variableReferencesCss',
  'canvasCss',
  'inspectorCss',
  'inspectorDataCss',
  'selectionCss',
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
if (!css.includes(':host([theme="light"])')) throw new Error('DESIGNER_STYLE_LIGHT_THEME_MISSING');
// 默认主题是黑夜：暗色块必须与裸 `:host` 同组，浅色只能由 theme="light" 显式进入。
// 宿主不写 theme 属性是最常见用法，默认值一旦滑回浅色，只有肉眼才能发现。
if (!/^:host,\s*:host\(\[theme="dark"\]\)\s*\{/m.test(tokensCss)) {
  throw new Error('DESIGNER_STYLE_DEFAULT_THEME_NOT_DARK');
}

const stylesPrefix = 'packages/engine/src/browser/styles/';
const nonTokenLayers = [...baseLayers, ...controlLayers, ...workbenchLayers];

// Ratchets. Each entry is debt that still exists in that layer file; the number may only
// be lowered alongside a cleanup. Raising one to admit newly written styling is forbidden,
// and a file absent from the map must stay at zero.
const importantBaseline = {
  'base/designer-base-adaptivity.css': 3,
  'base/designer-base-menus.css': 1,
  'workbench/designer-workbench-accessibility.css': 1,
  'workbench/designer-workbench-blueprint-surface.css': 1,
  'workbench/designer-workbench-canvas.css': 1,
  'workbench/designer-workbench-inspector-data.css': 3,
  'workbench/designer-workbench-inspector.css': 7,
  'workbench/designer-workbench-panels.css': 2,
  'workbench/designer-workbench-shell.css': 1,
  'workbench/designer-workbench-variables.css': 1,
};
// The palette control paints its own functional swatches (transparency checkerboard, hue
// cone, value ramps) that must not follow the host theme; every other layer stays at zero.
const colorBaseline = { 'controls/designer-controls-color-palette.css': 20 };

// Counted per line because a hue-parametric color such as `hsl(var(--material-hue) 62% 58%)`
// derives its value at runtime and is not a raw design value; only functions sharing a line
// with var()/calc() are exempt, and hex literals never are.
function countRawColors(content) {
  let total = 0;
  for (const line of content.split('\n')) {
    total += (line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
    if (!line.includes('var(') && !line.includes('calc(')) {
      total += (line.match(/\b(?:rgb|rgba|hsl|hsla)\(/g) ?? []).length;
    }
  }
  return total;
}

for (const file of nonTokenLayers) {
  const key = file.slice(stylesPrefix.length);
  const content = source(file);

  const important = (content.match(/!important/g) ?? []).length;
  const allowedImportant = importantBaseline[key] ?? 0;
  if (important > allowedImportant) {
    throw new Error(
      `DESIGNER_STYLE_IMPORTANT_BASELINE_EXCEEDED:${key}:${important}>${allowedImportant}`,
    );
  }

  const rawColors = countRawColors(content);
  const allowedColors = colorBaseline[key] ?? 0;
  if (rawColors > allowedColors) {
    throw new Error(
      `DESIGNER_STYLE_RAW_COLOR_BASELINE_EXCEEDED:${key}:${rawColors}>${allowedColors}`,
    );
  }
}

const staleImportantFiles = Object.keys(importantBaseline).filter(
  (key) => !nonTokenLayers.includes(`${stylesPrefix}${key}`),
);
if (staleImportantFiles.length > 0) {
  throw new Error(`DESIGNER_STYLE_BASELINE_FILE_UNKNOWN:${staleImportantFiles.join(',')}`);
}

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

// A `var(--designer-*)` reference without a fallback resolves to nothing when the token name
// is misspelled or never declared, silently dropping the whole declaration. Runtime-injected
// variables (--designer-fill-*, --designer-overlay-*, --quick-bar-index) are declared only in
// TypeScript, so scanning the sources is what separates a live injection from a dead token.
const declaredTokens = new Set([...css.matchAll(/(--designer-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const walkEngineSource = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) walkEngineSource(full);
    else if (entry.name.endsWith('.ts')) {
      for (const match of readFileSync(full, 'utf8').matchAll(/--designer-[a-z0-9-]+/g)) {
        declaredTokens.add(match[0]);
      }
    }
  }
};
walkEngineSource(resolve(root, 'packages/engine/src'));

const unresolvedTokens = new Set();
for (const match of css.matchAll(/var\(\s*(--designer-[a-z0-9-]+)\s*\)/g)) {
  if (!declaredTokens.has(match[1])) unresolvedTokens.add(match[1]);
}
if (unresolvedTokens.size > 0) {
  throw new Error(`DESIGNER_STYLE_TOKEN_UNRESOLVED:${[...unresolvedTokens].sort().join(',')}`);
}

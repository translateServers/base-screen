import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classTokens, scanCssBlocks } from './designer-style-scan.mjs';

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
  'packages/engine/src/browser/styles/controls/designer-controls-tabs.css',
  'packages/engine/src/browser/styles/controls/designer-controls-descriptor.css',
  'packages/engine/src/browser/styles/controls/designer-controls-adaptivity.css',
];
const workbenchLayers = [
  'packages/engine/src/browser/styles/workbench/designer-workbench-topbar.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-toolbar.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-feedback.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-shell.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-panels.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-surface.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-canvas.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-canvas-edges.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-canvas-nodes.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-blueprint-canvas-overlays.css',
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
  'packages/engine/src/browser/styles/workbench/designer-workbench-variable-inspector.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-variable-references.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-canvas.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-inspector-data.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-change.css',
  'packages/engine/src/browser/styles/workbench/designer-workbench-chrome.css',
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
  'tabsCss',
  'descriptorCss',
  'adaptivityCss',
];
const workbenchBindings = [
  'topbarCss',
  'blueprintToolbarCss',
  'feedbackCss',
  'shellCss',
  'panelsCss',
  'blueprintSurfaceCss',
  'blueprintCanvasCss',
  'blueprintCanvasEdgesCss',
  'blueprintCanvasNodesCss',
  'blueprintCanvasOverlaysCss',
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
  'variableInspectorCss',
  'variableReferencesCss',
  'canvasCss',
  'inspectorCss',
  'inspectorDataCss',
  'changeCss',
  'chromeCss',
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
  'surface-control-active',
  'surface-overlay',
  'surface-canvas',
  'surface-scrim',
  'canvas-grid-line',
  'range-track',
  'text-primary',
  'text-secondary',
  'text-muted',
  'text-disabled',
  'text-on-accent',
  'border-subtle',
  'border-default',
  'border-strong',
  'border-active',
  'focus-ring',
  'elev-ring',
  'elev-card',
  'accent',
  'accent-surface',
  'accent-text',
  'success',
  'success-surface',
  'warning',
  'warning-surface',
  'danger',
  'danger-surface',
  'danger-text',
  'button-primary-background',
  'button-primary-hover',
  'button-primary-active',
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

// Control/spacing debt is fully cleared: every layer file must stay at zero. The map stays
// as the (empty) ratchet so a future regression has a single place to be baselined.
const styleDebtBaseline = {};

const controlLayerSet = new Set(controlLayers);
const chromeLayerFile = 'workbench/designer-workbench-chrome.css';
const selectionFiles = new Set([
  'workbench/designer-workbench-selection.css',
  // forced-colors is an accessibility override of the same single paint recipe, not a second recipe.
  'workbench/designer-workbench-accessibility.css',
]);
const styleMetricCodes = {
  control: 'CONTROL_APPEARANCE',
  chrome: 'CHROME_APPEARANCE',
  fontSize: 'FONT_SIZE_FLOOR',
  radius: 'RADIUS_LITERAL',
  disabledOpacity: 'DISABLED_OPACITY',
  spacing: 'SPACING_LITERAL',
  selection: 'SELECTION_PAINT',
};

const sharedControlClasses = new Set([
  'designer-control',
  'designer-control-shell',
  'designer-input',
  'designer-number',
  'designer-color',
  'designer-range',
  'designer-select',
  'designer-select-control',
  'designer-select-trigger',
  'designer-select-value',
  'designer-select-caret',
  'designer-select-menu',
  'designer-select-option',
  'designer-select-check',
  'designer-select-native',
  'designer-textarea',
  'designer-checkbox',
  'designer-switch',
  'designer-button',
  'designer-icon-button',
  'designer-tool-button',
  'designer-segmented',
  'designer-segmented-option',
  'designer-segmented-native',
  'designer-tab',
  'designer-tablist',
  'designer-stepper',
  'designer-stepper-button',
  'designer-stepper-value',
  'designer-date-field',
  'designer-field',
  'designer-field-label',
  'designer-field-label-text',
  'designer-field-control',
  'designer-field-stacked',
  'designer-field-grid',
  'designer-geo-field',
]);
const sharedControlPrefixes = [
  'designer-select-',
  'designer-segmented-',
  'designer-stepper-',
  'designer-field-',
  'designer-calendar-',
];

const chromeClasses = new Set([
  'designer-empty',
  'designer-empty-state',
  'designer-badge',
  'designer-inspector-section',
  'designer-inspector-section-title',
  'designer-inspector-section-summary',
  'designer-inspector-section-disclosure',
  'designer-panel-section',
  'designer-panel-section-title',
  'designer-list-row',
  'layer-row',
  'blueprint-palette-item',
  'inspector-search-result',
  'panel-count',
  'material-badge',
  'inspector-search-result-badge',
  'designer-value-ref-badge',
  'blueprint-inspector-section',
]);

function isSharedControlClass(token) {
  return (
    sharedControlClasses.has(token) ||
    sharedControlPrefixes.some((prefix) => token.startsWith(prefix))
  );
}

function isChromeClass(token) {
  return chromeClasses.has(token);
}

function isAppearanceProperty(property) {
  return (
    property === 'color' ||
    property === 'box-shadow' ||
    property === 'line-height' ||
    property === 'height' ||
    property === 'min-height' ||
    property === 'max-height' ||
    property === 'opacity' ||
    property === 'letter-spacing' ||
    property === 'text-transform' ||
    property === 'appearance' ||
    property === 'accent-color' ||
    property === 'caret-color' ||
    property === 'filter' ||
    property === 'transform' ||
    property.startsWith('background') ||
    property.startsWith('border') ||
    property.startsWith('font') ||
    property.startsWith('padding') ||
    property.startsWith('outline')
  );
}

function isSpacingProperty(property) {
  return /^(?:gap|row-gap|column-gap|padding(?:-[a-z]+)*|margin(?:-[a-z]+)*)$/.test(property);
}

function isSelectionProperty(property) {
  return (
    property.startsWith('background') ||
    property.startsWith('border') ||
    property === 'color' ||
    property === 'box-shadow'
  );
}

function firstPx(value) {
  const match = value.match(/(\d+(?:\.\d+)?)px\b/);
  return match === null ? undefined : Number(match[1]);
}

function hasNonHairlinePx(value) {
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)px\b/g)) {
    if (Number(match[1]) > 1) return true;
  }
  return false;
}

function isListSelectionSelector(selector, tokens) {
  const hasRow =
    tokens.has('layer-row') ||
    tokens.has('blueprint-palette-item') ||
    tokens.has('designer-list-row');
  return hasRow && /\[(?:aria-selected|data-selected)=(?:"true"|'true'|true)\]/.test(selector);
}

function computeStyleMetrics() {
  const metrics = {};
  for (const file of nonTokenLayers) {
    const key = file.slice(stylesPrefix.length);
    const isControls = controlLayerSet.has(file);
    // Selection paint and its forced-colors override are their own single-source recipes, not chrome debt.
    const isChrome = key === chromeLayerFile || selectionFiles.has(key);
    const counts = {
      control: 0,
      chrome: 0,
      fontSize: 0,
      radius: 0,
      disabledOpacity: 0,
      spacing: 0,
      selection: 0,
    };
    for (const block of scanCssBlocks(source(file), { file: key })) {
      if (block.declarations.length === 0) continue;
      const tokens = classTokens(block.fullSelector);
      const controlTarget = [...tokens].some(isSharedControlClass);
      const chromeTarget = [...tokens].some(isChromeClass);
      // `:not(:disabled)` is a hover guard, not a disabled state; strip it before detecting.
      const disabled = block.fullSelector
        .replace(/:not\([^)]*:disabled[^)]*\)/g, '')
        .includes(':disabled');
      const selected = isListSelectionSelector(block.fullSelector, tokens);
      for (const { property, value } of block.declarations) {
        if (property.startsWith('--')) continue;
        const px = firstPx(value);
        if (property === 'font-size' && px !== undefined && px < 11) counts.fontSize += 1;
        if (property === 'border-radius' && px !== undefined) counts.radius += 1;
        if (property === 'opacity' && disabled) counts.disabledOpacity += 1;
        if (isSpacingProperty(property) && hasNonHairlinePx(value)) counts.spacing += 1;
        if (!isAppearanceProperty(property)) continue;
        if (!isControls && controlTarget) counts.control += 1;
        if (!isChrome && chromeTarget) counts.chrome += 1;
        if (selected && !selectionFiles.has(key) && isSelectionProperty(property)) {
          counts.selection += 1;
        }
      }
    }
    if (Object.values(counts).some((value) => value > 0)) metrics[key] = counts;
  }
  return metrics;
}

// Ratchets. Each entry is debt that still exists in that layer file; the number may only
// be lowered alongside a cleanup. Raising one to admit newly written styling is forbidden,
// and a file absent from the map must stay at zero.
const importantBaseline = {
  'base/designer-base-adaptivity.css': 3,
  'base/designer-base-menus.css': 1,
  'workbench/designer-workbench-accessibility.css': 1,
  'workbench/designer-workbench-blueprint-surface.css': 1,
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

// 覆盖位必须成对落在两个主题块里：`--designer-x: var(--base-screen-designer-x, 兜底)`。
// 上面那条 MAPPING_MISSING 只要求全文件里出现过这个映射，某个主题块漏掉钩子时它照样通过；
// 而漏一个覆盖位既不会有肉眼可见的失败，也不会影响兜底值，只能靠这里逐个主题块点名。
// 裸 `:host` 里的共享排版/间距/几何令牌不在契约内（见 designer-tokens.css 文件头「覆盖位的边界」），
// 所以只切两个主题块，不做全文件扫描。
function sliceThemeBlock(cssText, selectorStart) {
  const braceStart = cssText.indexOf('{', selectorStart);
  let depth = 0;
  for (let index = braceStart; index < cssText.length; index += 1) {
    if (cssText[index] === '{') depth += 1;
    else if (cssText[index] === '}') {
      depth -= 1;
      if (depth === 0) return cssText.slice(braceStart + 1, index);
    }
  }
  throw new Error('DESIGNER_STYLE_THEME_BLOCK_UNBALANCED');
}
// 按分号切声明，但跳过括号内的分号：elev-card 这类值里有 rgb(...) 与嵌套 var(...)。
function themeTokenDeclarations(block) {
  const declarations = [];
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const declarationStart = /(--[a-z0-9-]+)\s*:/g;
  let match;
  while ((match = declarationStart.exec(withoutComments)) !== null) {
    let index = declarationStart.lastIndex;
    let depth = 0;
    let value = '';
    for (; index < withoutComments.length; index += 1) {
      const character = withoutComments[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      if (character === ';' && depth === 0) break;
      value += character;
    }
    declarations.push({ name: match[1], value: value.replace(/\s+/g, ' ').trim() });
    declarationStart.lastIndex = index;
  }
  return declarations;
}
const lightBlockStart = tokensCss.indexOf(':host([theme="light"])');
const darkBlockStart = tokensCss.lastIndexOf(':host,', tokensCss.indexOf(':host([theme="dark"])'));
if (lightBlockStart === -1 || darkBlockStart === -1) {
  throw new Error('DESIGNER_STYLE_THEME_BLOCK_MISSING');
}
const themeBlocks = {
  light: sliceThemeBlock(tokensCss, lightBlockStart),
  dark: sliceThemeBlock(tokensCss, darkBlockStart),
};
for (const [theme, block] of Object.entries(themeBlocks)) {
  for (const { name, value } of themeTokenDeclarations(block)) {
    const suffix = name.slice('--designer-'.length);
    const hook = new RegExp(`^var\\(\\s*--base-screen-designer-${suffix}\\s*,`);
    if (hook.test(value)) continue;
    throw new Error(`DESIGNER_STYLE_THEME_TOKEN_UNHOOKED:${theme}:${suffix}`);
  }
}

// 右栏（.properties）是显式网格：每个直接子项必须同时声明 grid-column 与 grid-row。
// 只写行、列留 auto 时，一旦那一行已被别的子项占住，自动布局会另开一列——整块内容被挤成
// 一条 60px 竖条，而这类塌陷在两份样式都语法合法时不会报任何错。蓝图检查器塌过一次。
//
// 按「落点类名」合并而不是按选择器字符串：同一个子项常被多条规则分写（`.properties > x`
// 给列、`.properties[data-…] > x` 只补行），字符串级合并会把这类正常写法判成缺列。
const rightPaneChildren = new Map();
const subjectOf = (selector) => selector.split('>').pop().trim().split(' ').pop();
for (const file of [...baseLayers, ...controlLayers, ...workbenchLayers]) {
  const css = source(file).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(css)) !== null) {
    for (const raw of match[1].split(',')) {
      const selector = raw.trim().replace(/\s+/g, ' ');
      // 只看 .properties 的子孙规则；.properties 自己由 .designer 的网格摆放。
      if (!selector.includes('.properties')) continue;
      const subject = subjectOf(selector);
      if (subject === '.properties' || subject.startsWith('.properties[')) continue;
      const known = rightPaneChildren.get(subject) ?? { row: false, column: false };
      if (/(^|;)\s*grid-row\s*:/.test(match[2])) known.row = true;
      if (/(^|;)\s*grid-column\s*:/.test(match[2])) known.column = true;
      rightPaneChildren.set(subject, known);
    }
  }
}
for (const [subject, state] of rightPaneChildren) {
  if (!state.row || state.column) continue;
  throw new Error(`DESIGNER_STYLE_GRID_COLUMN_MISSING:${subject}`);
}

// 蓝图检查器不在 `.properties` 的子孙规则里（它由 [data-authoring-mode="blueprint"] 选中），
// 但同样是右栏直接子项，按类名单独校验一次。
const blueprintGrid = rightPaneChildren.get('.blueprint-inspector') ?? { row: false, column: false };
for (const file of workbenchLayers) {
  const css = source(file).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(css)) !== null) {
    for (const raw of match[1].split(',')) {
      if (subjectOf(raw.trim().replace(/\s+/g, ' ')) !== '.blueprint-inspector') continue;
      if (/(^|;)\s*grid-row\s*:/.test(match[2])) blueprintGrid.row = true;
      if (/(^|;)\s*grid-column\s*:/.test(match[2])) blueprintGrid.column = true;
    }
  }
}
if (blueprintGrid.row && !blueprintGrid.column) {
  throw new Error('DESIGNER_STYLE_GRID_COLUMN_MISSING:.blueprint-inspector');
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

const styleMetrics = computeStyleMetrics();
if (process.argv.includes('--report')) {
  console.log(JSON.stringify(styleMetrics, null, 2));
  process.exit(0);
}
for (const [key, counts] of Object.entries(styleMetrics)) {
  const allowed = styleDebtBaseline[key] ?? {};
  for (const [metric, code] of Object.entries(styleMetricCodes)) {
    const current = counts[metric] ?? 0;
    const maximum = allowed[metric] ?? 0;
    if (current > maximum) {
      throw new Error(`DESIGNER_STYLE_${code}_BASELINE_EXCEEDED:${key}:${current}>${maximum}`);
    }
  }
}
for (const key of Object.keys(styleDebtBaseline)) {
  if (!nonTokenLayers.includes(`${stylesPrefix}${key}`)) {
    throw new Error(`DESIGNER_STYLE_BASELINE_FILE_UNKNOWN:${key}`);
  }
  if (styleMetrics[key] === undefined) {
    throw new Error(`DESIGNER_STYLE_BASELINE_STALE:${key} (全部指标已归零，请删除该条目)`);
  }
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

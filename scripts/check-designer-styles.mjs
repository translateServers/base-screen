import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = (file) => readFileSync(resolve(root, file), 'utf8');
const layers = [
  'packages/engine/src/browser/styles/designer-tokens.css',
  'packages/engine/src/browser/styles/designer-base.css',
  'packages/engine/src/browser/styles/designer-controls.css',
  'packages/engine/src/browser/styles/designer-workbench.css',
];
const style = source('packages/engine/src/browser/styles/designer-style.ts');
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
if (style.includes('`')) throw new Error('DESIGNER_STYLE_TEMPLATE_FORBIDDEN');

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

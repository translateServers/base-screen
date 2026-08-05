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

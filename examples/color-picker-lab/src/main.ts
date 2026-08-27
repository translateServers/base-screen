import {
  type BaseScreenColorControlElement,
  defineBaseScreenColorControl,
} from './color-control.js';
import { defineBaseScreenColorMappingControl } from './color-mapping-control.js';
import { defineBaseScreenColorPaletteControl } from './color-palette-control.js';

defineBaseScreenColorControl();
defineBaseScreenColorPaletteControl();
defineBaseScreenColorMappingControl();

const form = document.querySelector<HTMLFormElement>('[data-preview-form]');
const control = document.querySelector<BaseScreenColorControlElement>('base-screen-color-control');
const output = document.querySelector<HTMLOutputElement>('[data-value-output]');
const code = output?.querySelector('code');

if (form === null || control === null || output === null || code === null || code === undefined) {
  throw new Error('Color form control preview failed to initialize.');
}

const renderValue = (prefix = 'current'): void => {
  const values = [...new FormData(form).entries()]
    .map(([name, value]) => `${name} = ${String(value)}`)
    .join('\n');
  code.textContent = `${prefix}: ${values}`;
};

form.addEventListener('input', () => renderValue());
form.addEventListener('reset', () => requestAnimationFrame(() => renderValue('reset')));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  renderValue('submitted');
});

renderValue();

Object.assign(window, { colorFormControl: control });

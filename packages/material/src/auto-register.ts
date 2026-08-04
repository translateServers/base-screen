import { defineBaseScreenTextMaterial } from './index.js';

const definition = defineBaseScreenTextMaterial();
if (!definition.ok) {
  throw new Error('Base Screen text material registration failed.');
}

export { defineBaseScreenTextMaterial } from './index.js';

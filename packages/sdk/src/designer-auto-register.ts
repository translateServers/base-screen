import { defineBaseScreenDesigner } from './designer.js';

const definition = defineBaseScreenDesigner();
if (!definition.ok) {
  throw new Error('Base Screen Designer registration failed.');
}

export * from './designer.js';

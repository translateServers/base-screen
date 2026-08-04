import { defineBaseScreenElements } from './index.js';

const definition = defineBaseScreenElements();
if (!definition.ok) {
  throw new Error('Base Screen product element registration failed.');
}

export * from './index.js';

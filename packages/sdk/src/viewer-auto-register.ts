import { defineBaseScreenViewer } from './viewer.js';

const definition = defineBaseScreenViewer();
if (!definition.ok) {
  throw new Error('Base Screen Viewer registration failed.');
}

export * from './viewer.js';

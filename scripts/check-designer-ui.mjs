import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiModules = [
  'packages/engine/src/designer-blueprint-dom.ts',
  'packages/engine/src/designer-integration-controller.ts',
  'packages/engine/src/designer-import-controller.ts',
  'packages/engine/src/designer-layers-dom.ts',
  'packages/engine/src/designer-operation-registry.ts',
  'packages/engine/src/designer-panel-dom.ts',
  'packages/engine/src/designer-preview-controller.ts',
  'packages/engine/src/designer-project-feedback-controller.ts',
  'packages/engine/src/designer-selection-dom.ts',
  'packages/engine/src/designer-tools.ts',
  'packages/engine/src/designer-ui-text.ts',
  'packages/engine/src/designer-workbench-controller.ts',
  'packages/engine/src/designer-workspace.ts',
  'packages/engine/src/index.ts',
];

const forbiddenLocalization = /\b(?:i18n|locale|language|translation)\b/i;
const forbiddenUiText = [
  'Search layers',
  'Open Blueprint',
  'Direct document',
  'Reload remote',
  'Close preview',
  'Save project',
  'Designer requires',
];

const root = fileURLToPath(new URL('../', import.meta.url));

for (const file of uiModules) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (forbiddenLocalization.test(source)) {
    throw new Error(`DESIGNER_UI_LOCALIZATION_FORBIDDEN: ${file}`);
  }
  for (const text of forbiddenUiText) {
    if (source.includes(text)) {
      throw new Error(`DESIGNER_UI_ENGLISH_TEXT_FORBIDDEN: ${file}`);
    }
  }
}

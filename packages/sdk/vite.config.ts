import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../scripts/create-vite-library-config.ts';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

export default createViteLibraryConfig(packageRoot, {
  index: `${packageRoot}src/index.ts`,
  'auto-register': `${packageRoot}src/auto-register.ts`,
  viewer: `${packageRoot}src/viewer.ts`,
  'viewer-auto-register': `${packageRoot}src/viewer-auto-register.ts`,
  designer: `${packageRoot}src/designer.ts`,
  'designer-auto-register': `${packageRoot}src/designer-auto-register.ts`,
  contracts: `${packageRoot}src/contracts.ts`,
  core: `${packageRoot}src/core.ts`,
  renderer: `${packageRoot}src/renderer.ts`,
  engine: `${packageRoot}src/engine.ts`,
  plugins: `${packageRoot}src/plugins.ts`,
  material: `${packageRoot}src/material.ts`,
});

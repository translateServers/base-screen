import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../tooling/build/vite-library-config.ts';

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
  material: `${packageRoot}src/material.ts`,
  'plugin-core': `${packageRoot}src/plugin-core.ts`,
  'plugin-manager': `${packageRoot}src/plugin-manager.ts`,
  'plugin-sdk': `${packageRoot}src/plugin-sdk.ts`,
  plugins: `${packageRoot}src/plugins.ts`,
  'host-kit': `${packageRoot}src/host-kit.ts`,
  react: `${packageRoot}src/react.ts`,
  vue: `${packageRoot}src/vue.ts`,
});

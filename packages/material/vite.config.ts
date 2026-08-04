import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../scripts/create-vite-library-config.ts';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

export default createViteLibraryConfig(packageRoot, {
  index: `${packageRoot}src/index.ts`,
  'auto-register': `${packageRoot}src/auto-register.ts`,
});

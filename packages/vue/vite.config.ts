import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../tooling/build/vite-library-config.ts';

export default createViteLibraryConfig(fileURLToPath(new URL('.', import.meta.url)));

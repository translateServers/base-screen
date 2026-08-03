import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../scripts/create-vite-library-config.ts';

export default createViteLibraryConfig(fileURLToPath(new URL('.', import.meta.url)));
